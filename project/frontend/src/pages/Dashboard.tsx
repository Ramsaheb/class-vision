import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, Users, Loader2, Wifi, WifiOff, Brain, AlertTriangle, History, ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from 'recharts';
import { useWebSocket } from '../hooks/useBackend';

const API = 'http://localhost:8000';
const DEFAULTER_THRESHOLD = 75;

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
  const { status, isConnected } = useWebSocket('ws://localhost:8000/ws');
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch(API + '/student-insights');
      const json = await res.json();
      if (json.data) setData(json.data);
    } catch { /* silent */ } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (!status.is_processing) setTimeout(load, 2000); }, [status.is_processing]);

  const defaulters = data?.students.filter(s => s.total_sessions > 0 && s.attendance_rate < DEFAULTER_THRESHOLD) || [];
  const topStudents = [...(data?.students || [])].sort((a, b) => b.attendance_rate - a.attendance_rate).slice(0, 5);
  const recentSessions = (data?.sessions || []).slice(0, 5);
  const pieData = data ? [
    { name: 'Present', value: data.students.reduce((s, st) => s + st.total_present, 0), color: '#10B981' },
    { name: 'Absent', value: data.students.reduce((s, st) => s + (st.total_sessions - st.total_present), 0), color: '#EF4444' },
  ] : [];

  if (loading && !data) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
    </div>
  );

  const ov = data?.overall;
  const avgAttn = data?.students.filter(s => s.avg_attention_score > 0);
  const avgAttentionVal = avgAttn && avgAttn.length > 0
    ? Math.round(avgAttn.reduce((s, st) => s + st.avg_attention_score, 0) / avgAttn.length * 100) + '%'
    : '--';

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* connection strip */}
      <div className={'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium ' + (isConnected ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400')}>
        {isConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
        {isConnected ? (status.is_processing ? 'Processing ' + status.progress + '% — ' + status.message : 'Backend connected') : 'Disconnected — retrying...'}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total Sessions', value: ov?.total_sessions ?? 0, icon: History, bg: 'bg-purple-50 dark:bg-purple-900/20', ic: 'text-purple-600' },
          { label: 'Students', value: ov?.total_students ?? 0, icon: Users, bg: 'bg-blue-50 dark:bg-blue-900/20', ic: 'text-blue-600' },
          { label: 'Attendance Rate', value: (ov?.overall_attendance_rate ?? 0) + '%', icon: TrendingUp, bg: 'bg-green-50 dark:bg-green-900/20', ic: 'text-green-600' },
          { label: 'Defaulters', value: defaulters.length, icon: AlertTriangle, bg: 'bg-red-50 dark:bg-red-900/20', ic: 'text-red-600' },
          { label: 'Avg Attention', value: avgAttentionVal, icon: Brain, bg: 'bg-orange-50 dark:bg-orange-900/20', ic: 'text-orange-600' },
        ].map(kpi => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="bg-card-light dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center gap-3">
                <div className={'p-2 rounded-lg ' + kpi.bg}>
                  <Icon className={'w-5 h-5 ' + kpi.ic} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{kpi.value}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{kpi.label}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* attendance trend */}
        <div className="lg:col-span-2 bg-card-light dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-4">Attendance Trend</h3>
          {(data?.trends?.length || 0) > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data!.trends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="session_name" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.length > 12 ? v.slice(0, 12) + '...' : v} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => v + '%'} />
                <Bar dataKey="attendance_rate" fill="#8B5CF6" name="Attendance %" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">No session data yet</div>
          )}
        </div>

        {/* attendance pie */}
        <div className="bg-card-light dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-4">Overall Attendance Split</h3>
          {pieData.reduce((s, d) => s + d.value, 0) > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value"
                  label={({ name, value }) => name + ': ' + value}>
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-gray-400 text-sm">No data</div>
          )}
        </div>
      </div>

      {/* 3-column info row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* top performers */}
        <div className="bg-card-light dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Top Performers</h3>
            <Link to="/students" className="text-purple-600 dark:text-purple-400 text-xs hover:underline flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></Link>
          </div>
          <div className="space-y-2">
            {topStudents.map((s, i) => {
              const rankColors = ['bg-yellow-500', 'bg-gray-400', 'bg-amber-600', 'bg-purple-500', 'bg-blue-500'];
              return (
                <div key={s.name} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    <span className={'w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center text-white ' + rankColors[i]}>{i + 1}</span>
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{s.name}</span>
                  </div>
                  <span className={'text-xs font-semibold px-2 py-0.5 rounded-full ' + (s.attendance_rate >= 75 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400')}>{s.attendance_rate}%</span>
                </div>
              );
            })}
            {topStudents.length === 0 && <p className="text-xs text-gray-400 py-4 text-center">No data yet</p>}
          </div>
        </div>

        {/* defaulter alert */}
        <div className="bg-card-light dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" /> Defaulter Alerts
            </h3>
            <Link to="/defaulters" className="text-purple-600 dark:text-purple-400 text-xs hover:underline flex items-center gap-1">Manage <ArrowRight className="w-3 h-3" /></Link>
          </div>
          {defaulters.length > 0 ? (
            <div className="space-y-2">
              {defaulters.slice(0, 5).map(d => (
                <div key={d.name} className="flex items-center justify-between py-1.5 border-l-2 border-red-400 pl-3">
                  <span className="text-sm text-gray-800 dark:text-gray-200">{d.name}</span>
                  <span className="text-xs text-red-600 font-semibold">{d.attendance_rate}%</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-sm text-gray-400">
              {data?.students.length ? 'All students above 75%' : 'No data yet'}
            </div>
          )}
        </div>

        {/* recent sessions */}
        <div className="bg-card-light dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Recent Sessions</h3>
            <Link to="/sessions" className="text-purple-600 dark:text-purple-400 text-xs hover:underline flex items-center gap-1">All <ArrowRight className="w-3 h-3" /></Link>
          </div>
          <div className="space-y-2">
            {recentSessions.map(s => (
              <Link to="/sessions" key={s.id} className="flex items-center justify-between py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 -mx-2 px-2 rounded transition-colors">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate max-w-[140px]">{s.name}</p>
                  <p className="text-[10px] text-gray-400">{s.start_time ? new Date(s.start_time).toLocaleDateString() : ''}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-green-600">{s.present_students}/{s.total_students}</p>
                  <p className={'text-[10px] font-medium ' + (s.status === 'completed' ? 'text-green-500' : 'text-yellow-500')}>{s.status}</p>
                </div>
              </Link>
            ))}
            {recentSessions.length === 0 && <p className="text-xs text-gray-400 py-4 text-center">No sessions yet</p>}
          </div>
        </div>
      </div>

      {/* student overview table */}
      {data && data.students.length > 0 && (
        <div className="bg-card-light dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">All Students Overview</h3>
            <Link to="/students" className="text-purple-600 dark:text-purple-400 text-xs hover:underline flex items-center gap-1">Detailed view <ArrowRight className="w-3 h-3" /></Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 text-left text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-2.5 font-semibold">Student</th>
                  <th className="px-4 py-2.5 font-semibold text-center">Sessions</th>
                  <th className="px-4 py-2.5 font-semibold text-center">Present</th>
                  <th className="px-4 py-2.5 font-semibold text-center">Attendance</th>
                  <th className="px-4 py-2.5 font-semibold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {data.students.map(s => {
                  const isDefaulter = s.attendance_rate < 75;
                  return (
                    <tr key={s.name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className={'w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold ' + (isDefaulter ? 'bg-red-400' : 'bg-purple-500')}>{s.name.charAt(0)}</div>
                          <span className="font-medium text-gray-800 dark:text-gray-200">{s.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center text-gray-600 dark:text-gray-300">{s.total_sessions}</td>
                      <td className="px-4 py-2.5 text-center text-gray-600 dark:text-gray-300">{s.total_present}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={'inline-flex px-2 py-0.5 rounded-full font-semibold ' + (s.attendance_rate >= 75 ? 'bg-green-100 dark:bg-green-900/30 text-green-700' : 'bg-red-100 dark:bg-red-900/30 text-red-700')}>{s.attendance_rate}%</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={'text-[10px] font-semibold px-2 py-0.5 rounded ' + (isDefaulter ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : 'bg-green-100 dark:bg-green-900/30 text-green-600')}>{isDefaulter ? 'Defaulter' : 'Regular'}</span>
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
