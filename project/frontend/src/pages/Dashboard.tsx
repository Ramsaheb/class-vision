import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp, Users, Loader2, Wifi, WifiOff, Brain, AlertTriangle,
  History, ArrowRight, ArrowUpRight, ArrowDownRight, BarChart3,
  GraduationCap, Activity, RefreshCw, Zap, Target,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, AreaChart, Area, Legend,
} from 'recharts';
import { useWebSocket, cachedFetch } from '../hooks/useBackend';

const API = 'http://localhost:8000';
const DEFAULTER_THRESHOLD = 60;
const MIN_SESSIONS_FOR_DEFAULTER = 2;
const PRESENT_PCT_THRESHOLD = 30;
const PRESENT_SEC_THRESHOLD = 10;

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function isPresentRecord(record?: { presence_percentage?: number; presence_seconds?: number } | null): boolean {
  if (!record) return false;
  return (record.presence_percentage || 0) >= PRESENT_PCT_THRESHOLD || (record.presence_seconds || 0) >= PRESENT_SEC_THRESHOLD;
}

function loadCachedWsAttendance(): Record<string, { presence_percentage?: number; presence_seconds?: number }> {
  try {
    const raw = localStorage.getItem('coris_cache_ws_result');
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { data?: { attendance?: Record<string, { presence_percentage?: number; presence_seconds?: number }> } };
    return parsed?.data?.attendance || {};
  } catch {
    return {};
  }
}

interface InsightsData {
  overall: { total_sessions: number; total_students: number; overall_attendance_rate: number };
  students: Array<{
    name: string; total_sessions: number; total_present: number; attendance_rate: number;
    avg_attention_score: number; best_attention_score: number; avg_presence_time: number;
    total_participation_events: number; last_seen: string | null;
  }>;
  sessions: Array<{
    id: number; name: string; start_time: string; total_students: number;
    present_students: number; absent_students: number; status: string;
  }>;
  trends: Array<{ session_name: string; date: string; attendance_rate: number; avg_attention: number }>;
  emotion_distribution: Record<string, number>;
  engagement_distribution: Record<string, number>;
}

const Dashboard: React.FC = () => {
  const { status, result, isConnected } = useWebSocket('ws://localhost:8000/ws');
  const [data, setData] = useState<InsightsData | null>(null);
  const [latestPresentNames, setLatestPresentNames] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const [{ data: insightsJson, offline: insightsOffline }, { data: lrJson, offline: lrOffline }] = await Promise.all([
        cachedFetch<any>(API + '/student-insights', '/student-insights'),
        cachedFetch<any>(API + '/last-result', '/last-result'),
      ]);

      if (insightsJson?.data) setData(insightsJson.data);
      else if (insightsJson?.students) setData(insightsJson);

      const attendanceFromWs = (result?.attendance || {}) as Record<string, { presence_percentage?: number; presence_seconds?: number }>;
      const attendanceFromApi = (lrJson?.attendance || {}) as Record<string, { presence_percentage?: number; presence_seconds?: number }>;
      const attendance = Object.keys(attendanceFromWs).length > 0
        ? attendanceFromWs
        : (Object.keys(attendanceFromApi).length > 0 ? attendanceFromApi : loadCachedWsAttendance());
      const presentSet = new Set<string>();
      Object.entries(attendance).forEach(([name, rec]) => {
        if (isPresentRecord(rec)) presentSet.add(normalizeName(name));
      });
      setLatestPresentNames(presentSet);

      setOffline(insightsOffline || lrOffline);
    } catch { /* silent */ } finally { setLoading(false); }
  };

  // Load on mount
  useEffect(() => { load(); }, []);
  
  // Reload when processing completes (new session finished)
  useEffect(() => { 
    if (!status.is_processing) {
      setTimeout(load, 1000); // Wait 1s for data to be written to database
    }
  }, [status.is_processing]);

  useEffect(() => {
    const attendanceFromWs = (result?.attendance || {}) as Record<string, { presence_percentage?: number; presence_seconds?: number }>;
    if (Object.keys(attendanceFromWs).length === 0) return;

    const presentSet = new Set<string>();
    Object.entries(attendanceFromWs).forEach(([name, rec]) => {
      if (isPresentRecord(rec)) presentSet.add(normalizeName(name));
    });
    setLatestPresentNames(presentSet);
  }, [result]);

  const students = data?.students || [];
  const effectiveStudents = students.map((s) => {
    const livePresent = latestPresentNames.has(normalizeName(s.name));
    if (!livePresent) return s;

    const totalSessions = Math.max(s.total_sessions, 1);
    const totalPresent = Math.max(s.total_present, 1);
    const attendanceRate = Math.max(s.attendance_rate, (totalPresent / totalSessions) * 100);

    return {
      ...s,
      total_sessions: totalSessions,
      total_present: totalPresent,
      attendance_rate: attendanceRate,
      last_seen: s.last_seen || new Date().toISOString(),
    };
  });
  const defaulters = effectiveStudents.filter(s =>
    s.total_sessions >= MIN_SESSIONS_FOR_DEFAULTER &&
    s.attendance_rate < DEFAULTER_THRESHOLD &&
    !latestPresentNames.has(normalizeName(s.name))
  );
  const topStudents = [...effectiveStudents].sort((a, b) => b.attendance_rate - a.attendance_rate).slice(0, 5);
  const recentSessions = (data?.sessions || []).slice(0, 5);
  const pieData = effectiveStudents.length > 0 ? [
    { name: 'Present', value: effectiveStudents.reduce((s, st) => s + st.total_present, 0), color: '#10B981' },
    { name: 'Absent', value: effectiveStudents.reduce((s, st) => s + (st.total_sessions - st.total_present), 0), color: '#EF4444' },
  ] : [];

  if (loading && !data) return (
    <div className="flex flex-col items-center justify-center h-80 gap-4">
      <div className="relative">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center animate-pulse-slow">
          <BarChart3 className="w-8 h-8 text-white" />
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Loading Dashboard</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Fetching data from database...</p>
      </div>
    </div>
  );

  const ov = data?.overall;
  const computedAttendanceRate = effectiveStudents.length > 0
    ? (effectiveStudents.reduce((sum, s) => sum + s.attendance_rate, 0) / effectiveStudents.length)
    : 0;
  const avgAttn = effectiveStudents.filter(s => s.avg_attention_score > 0);
  const avgAttentionVal = avgAttn && avgAttn.length > 0
    ? Math.round(avgAttn.reduce((s, st) => s + st.avg_attention_score, 0) / avgAttn.length * 100)
    : 0;

  const trendChartData = (data?.trends || []).map(t => ({
    ...t,
    attention_pct: Math.round((t.avg_attention || 0) * 100),
    name: (t.session_name || '').length > 15 ? (t.session_name || '').slice(0, 15) + '...' : (t.session_name || ''),
  }));

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto animate-fade-in">
      {/* Offline Banner */}
      {offline && data && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 px-4 py-3 flex items-center gap-3">
          <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-300"><strong>Offline Mode</strong> — Showing previously cached data. Start the backend to get live updates.</p>
        </div>
      )}
      {/* Connection status + Refresh */}
      <div className="flex items-center justify-between gap-4">
        <div className={
          'flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-semibold backdrop-blur-sm border ' +
          (isConnected
            ? 'bg-emerald-50/80 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50'
            : 'bg-red-50/80 dark:bg-red-900/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/50')
        }>
          {isConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          {isConnected
            ? (status.is_processing
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing {status.progress}% &mdash; {status.message}</>
              : 'Backend Online')
            : 'Disconnected — retrying...'}
          {isConnected && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
        </div>
        <button onClick={load} className="btn-secondary flex items-center gap-1.5 text-xs">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Processing progress bar */}
      {status.is_processing && (
        <div className="glass-card p-4 animate-slide-up">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary-500 animate-bounce-subtle" />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{status.message}</span>
            </div>
            <span className="text-xs font-bold text-primary-600 dark:text-primary-400">{status.progress}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill bg-gradient-to-r from-primary-400 to-accent-blue" style={{ width: status.progress + '%' }} />
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 animate-stagger">
        {[
          { label: 'Total Sessions', value: ov?.total_sessions ?? 0, icon: History, gradient: 'from-violet-500 to-purple-600', lightBg: 'bg-violet-50 dark:bg-violet-900/15', change: null },
          { label: 'Students', value: effectiveStudents.length, icon: GraduationCap, gradient: 'from-blue-500 to-cyan-600', lightBg: 'bg-blue-50 dark:bg-blue-900/15', change: null },
          { label: 'Attendance Rate', value: computedAttendanceRate.toFixed(1) + '%', icon: TrendingUp, gradient: 'from-emerald-500 to-teal-600', lightBg: 'bg-emerald-50 dark:bg-emerald-900/15', change: computedAttendanceRate >= 75 ? 'up' : 'down' },
          { label: 'Defaulters', value: defaulters.length, icon: AlertTriangle, gradient: 'from-red-500 to-rose-600', lightBg: 'bg-red-50 dark:bg-red-900/15', change: defaulters.length > 0 ? 'down' : 'up' },
          { label: 'Avg Attention', value: avgAttentionVal > 0 ? avgAttentionVal + '%' : '--', icon: Brain, gradient: 'from-amber-500 to-orange-600', lightBg: 'bg-amber-50 dark:bg-amber-900/15', change: null },
        ].map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="kpi-card group" style={{ animationDelay: idx * 60 + 'ms' }}>
              <div className="flex items-start justify-between mb-3">
                <div className={'w-10 h-10 rounded-xl bg-gradient-to-br ' + kpi.gradient + ' flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow'}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                {kpi.change && (
                  <span className={
                    'flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ' +
                    (kpi.change === 'up' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600' : 'bg-red-50 dark:bg-red-900/20 text-red-600')
                  }>
                    {kpi.change === 'up' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {kpi.change === 'up' ? 'Good' : 'Alert'}
                  </span>
                )}
              </div>
              <p className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight">{kpi.value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium">{kpi.label}</p>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attendance Trend with Area Chart */}
        <div className="lg:col-span-2 glass-card p-6 animate-slide-up">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="section-title">Attendance Trend</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Session-by-session attendance rates</p>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-medium">
              <span className="flex items-center gap-1 text-primary-500"><span className="w-2.5 h-2.5 rounded-full bg-primary-500" />Attendance</span>
              <span className="flex items-center gap-1 text-accent-cyan"><span className="w-2.5 h-2.5 rounded-full bg-accent-cyan" />Attention</span>
            </div>
          </div>
          {trendChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trendChartData}>
                <defs>
                  <linearGradient id="attGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6C5CE7" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6C5CE7" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="atnGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00CEC9" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00CEC9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 20px 60px rgba(0,0,0,0.1)', fontSize: 12 }}
                  formatter={(v: number) => v.toFixed(1) + '%'}
                />
                <Area type="monotone" dataKey="attendance_rate" stroke="#6C5CE7" strokeWidth={2.5} fill="url(#attGrad)" name="Attendance %" dot={{ r: 3, fill: '#6C5CE7' }} />
                <Area type="monotone" dataKey="attention_pct" stroke="#00CEC9" strokeWidth={2} fill="url(#atnGrad)" name="Attention %" dot={{ r: 2, fill: '#00CEC9' }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
              <Activity className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm font-medium">No session data yet</p>
              <p className="text-xs mt-1">Run your first analysis to see trends</p>
            </div>
          )}
        </div>

        {/* Attendance Donut */}
        <div className="glass-card p-6 animate-slide-up">
          <h3 className="section-title mb-1">Attendance Split</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Overall present vs absent</p>
          {pieData.reduce((s, d) => s + d.value, 0) > 0 ? (
            <div className="relative">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} dataKey="value" strokeWidth={0}
                    label={({ name, value }) => name + ': ' + value}>
                    {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              {/* Center stat */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{computedAttendanceRate.toFixed(0)}%</p>
                  <p className="text-[10px] text-gray-400 font-medium">Rate</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-52 flex items-center justify-center text-gray-400 text-sm">No data</div>
          )}
          <div className="flex justify-center gap-6 mt-3">
            {pieData.map(d => (
              <div key={d.name} className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-gray-600 dark:text-gray-400 font-medium">{d.name}: {d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Emotion & Engagement Distribution Row */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Emotion Distribution */}
          <div className="glass-card p-6 animate-slide-up">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center">
                <Activity className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="section-title">Emotion Distribution</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">Detected across all sessions</p>
              </div>
            </div>
            {(() => {
              const emotionColors: Record<string, string> = { happy: '#10B981', neutral: '#6366F1', sad: '#3B82F6', angry: '#EF4444', surprise: '#F59E0B', fear: '#F97316', disgust: '#A855F7', unknown: '#94A3B8' };
              const emotionData = Object.entries(data.emotion_distribution || {})
                .filter(([k]) => k !== 'N/A' && k !== 'unknown')
                .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value, color: emotionColors[name] || '#94A3B8' }));
              return emotionData.length > 0 ? (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="55%" height={180}>
                    <PieChart>
                      <Pie data={emotionData} cx="50%" cy="50%" innerRadius={42} outerRadius={70} paddingAngle={3} dataKey="value" strokeWidth={0}>
                        {emotionData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {emotionData.map(d => (
                      <div key={d.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{d.name}</span>
                        </div>
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-44 flex flex-col items-center justify-center text-gray-400">
                  <Activity className="w-8 h-8 mb-2 opacity-20" />
                  <p className="text-sm font-medium">No emotion data yet</p>
                  <p className="text-[10px] mt-0.5">Run enhanced analysis to detect emotions</p>
                </div>
              );
            })()}
          </div>

          {/* Engagement Distribution */}
          <div className="glass-card p-6 animate-slide-up">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="section-title">Engagement Levels</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">Student engagement breakdown</p>
              </div>
            </div>
            {(() => {
              const engColors: Record<string, string> = { 'Highly Engaged': '#10B981', 'Engaged': '#6366F1', 'Moderately Engaged': '#3B82F6', 'Partially Engaged': '#F59E0B', 'Disengaged': '#EF4444', 'Not Analyzed': '#94A3B8' };
              const engData = Object.entries(data.engagement_distribution || {})
                .filter(([k]) => k !== 'N/A' && k !== 'Not Analyzed')
                .map(([name, value]) => ({ name, value, color: engColors[name] || '#94A3B8' }));
              const total = engData.reduce((s, d) => s + d.value, 0);
              return engData.length > 0 ? (
                <div className="space-y-3">
                  {engData.map(d => {
                    const pct = total > 0 ? (d.value / total * 100) : 0;
                    return (
                      <div key={d.name}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{d.name}</span>
                          </div>
                          <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{pct.toFixed(0)}%</span>
                        </div>
                        <div className="w-full h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: pct + '%', backgroundColor: d.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-44 flex flex-col items-center justify-center text-gray-400">
                  <Zap className="w-8 h-8 mb-2 opacity-20" />
                  <p className="text-sm font-medium">No engagement data yet</p>
                  <p className="text-[10px] mt-0.5">Run enhanced analysis to track engagement</p>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* 3-Column Info Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Performers */}
        <div className="glass-card p-5 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="section-title">Top Performers</h3>
              <p className="text-[10px] text-gray-400 mt-0.5">Highest attendance rates</p>
            </div>
            <Link to="/students" className="btn-ghost flex items-center gap-1 text-xs text-primary-500">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2.5">
            {topStudents.map((s, i) => {
              const medals = ['🥇', '🥈', '🥉'];
              return (
                <div key={s.name} className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors group">
                  <div className="flex items-center gap-3">
                    <span className="text-base w-6 text-center">{medals[i] || (i + 1)}</span>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 avatar text-xs">
                      {s.name.charAt(0)}
                    </div>
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-12 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500" style={{ width: Math.min(s.attendance_rate, 100) + '%' }} />
                    </div>
                    <span className={'text-xs font-bold ' + (s.attendance_rate >= 75 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                      {s.attendance_rate}%
                    </span>
                  </div>
                </div>
              );
            })}
            {topStudents.length === 0 && <p className="text-xs text-gray-400 py-6 text-center">No data yet</p>}
          </div>
        </div>

        {/* Defaulter Alerts */}
        <div className="glass-card p-5 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <div>
                <h3 className="section-title">Defaulter Alerts</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">Below {DEFAULTER_THRESHOLD}% attendance</p>
              </div>
            </div>
            <Link to="/defaulters" className="btn-ghost flex items-center gap-1 text-xs text-primary-500">
              Manage <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {defaulters.length > 0 ? (
            <div className="space-y-2">
              {defaulters.slice(0, 5).map(d => (
                <div key={d.name} className="flex items-center justify-between py-2.5 px-3 rounded-xl border-l-[3px] border-red-400 dark:border-red-500 bg-red-50/50 dark:bg-red-900/10 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-red-500 avatar text-[10px]">{d.name.charAt(0)}</div>
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{d.name}</span>
                  </div>
                  <span className="text-xs font-bold text-red-600 dark:text-red-400">{d.attendance_rate}%</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-2">
                <Target className="w-6 h-6 text-emerald-500" />
              </div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {effectiveStudents.length ? 'All students above threshold!' : 'No data yet'}
              </p>
            </div>
          )}
        </div>

        {/* Recent Sessions */}
        <div className="glass-card p-5 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="section-title">Recent Sessions</h3>
              <p className="text-[10px] text-gray-400 mt-0.5">Latest processing runs</p>
            </div>
            <Link to="/sessions" className="btn-ghost flex items-center gap-1 text-xs text-primary-500">
              All <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {recentSessions.map(s => {
              const rate = s.total_students > 0 ? Math.round(s.present_students / s.total_students * 100) : 0;
              return (
                <Link to="/sessions" key={s.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors group">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 avatar text-[10px]">
                      <History className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[120px]">{s.name}</p>
                      <p className="text-[10px] text-gray-400">{s.start_time ? new Date(s.start_time).toLocaleDateString() : ''}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{s.present_students}/{s.total_students}</p>
                    <p className={'text-[10px] font-semibold ' + (s.status === 'completed' ? 'text-emerald-500' : 'text-amber-500')}>{rate}%</p>
                  </div>
                </Link>
              );
            })}
            {recentSessions.length === 0 && <p className="text-xs text-gray-400 py-6 text-center">No sessions yet</p>}
          </div>
        </div>
      </div>

      {/* Student Overview Table */}
      {effectiveStudents.length > 0 && (
        <div className="table-container animate-slide-up">
          <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <div>
              <h3 className="section-title">All Students Overview</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{effectiveStudents.length} students tracked across {ov?.total_sessions ?? 0} sessions</p>
            </div>
            <Link to="/students" className="btn-ghost flex items-center gap-1 text-xs text-primary-500">
              Detailed view <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/80 dark:bg-gray-800/50">
                  <th className="px-6 py-3 table-header">Student</th>
                  <th className="px-4 py-3 table-header text-center">Sessions</th>
                  <th className="px-4 py-3 table-header text-center">Present</th>
                  <th className="px-4 py-3 table-header text-center">Attendance</th>
                  <th className="px-4 py-3 table-header text-center">Attention</th>
                  <th className="px-4 py-3 table-header text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {effectiveStudents.map(s => {
                  const isDefaulter = s.total_sessions > 0 && s.attendance_rate < DEFAULTER_THRESHOLD;
                  return (
                    <tr key={s.name} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/30 transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={'w-8 h-8 rounded-lg avatar text-xs ' + (isDefaulter ? 'bg-gradient-to-br from-red-400 to-red-500' : 'bg-gradient-to-br from-primary-400 to-primary-600')}>
                            {s.name.charAt(0)}
                          </div>
                          <div>
                            <span className="font-semibold text-gray-900 dark:text-white">{s.name}</span>
                            <p className="text-[10px] text-gray-400">Last: {s.last_seen ? new Date(s.last_seen).toLocaleDateString() : 'Never'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center text-gray-600 dark:text-gray-300 font-medium">{s.total_sessions}</td>
                      <td className="px-4 py-3.5 text-center text-gray-600 dark:text-gray-300 font-medium">{s.total_present}</td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="inline-flex items-center gap-2">
                          <div className="w-14 progress-bar h-1.5">
                            <div className={'progress-fill ' + (s.attendance_rate >= 75 ? 'bg-emerald-500' : s.attendance_rate >= 50 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: Math.min(s.attendance_rate, 100) + '%' }} />
                          </div>
                          <span className={'font-bold text-xs ' + (s.attendance_rate >= 75 ? 'text-emerald-600 dark:text-emerald-400' : s.attendance_rate >= 50 ? 'text-amber-600' : 'text-red-600')}>
                            {s.attendance_rate}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{s.avg_attention_score > 0 ? (s.avg_attention_score * 100).toFixed(0) + '%' : '--'}</span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={isDefaulter ? 'status-absent' : 'status-present'}>
                          {isDefaulter ? 'Defaulter' : 'Regular'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
