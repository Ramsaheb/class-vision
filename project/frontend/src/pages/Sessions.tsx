import React, { useEffect, useState, useMemo } from 'react';
import {
  History, Users, Trash2, X, Search, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle, Zap, RefreshCw, Trash,
  Calendar, Clock, TrendingUp, UserCheck, WifiOff,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, AreaChart, Area, Cell,
} from 'recharts';
import { cachedFetch, useWebSocket } from '../hooks/useBackend';

const API = 'http://localhost:8000';

interface Session {
  id: number;
  name: string;
  start_time: string;
  end_time: string | null;
  duration_seconds: number;
  total_students: number;
  present_students: number;
  absent_students: number;
  enhanced: boolean;
  status: string;
}

interface SessionRecord {
  student_name: string;
  present: boolean;
  presence_seconds: number;
  confidence: number;
  attention_score: number;
  attentiveness_percentage: number;
  engagement_level: string;
  dominant_emotion: string;
  time_attentive_seconds: number;
  time_distracted_seconds: number;
  participation_events: number;
}

interface SessionDetail {
  id: number;
  name: string;
  start_time: string;
  end_time: string | null;
  duration_seconds: number;
  total_students: number;
  present_students: number;
  absent_students: number;
  enhanced_analysis: boolean;
  records: SessionRecord[];
}

type SortKey = 'name' | 'start_time' | 'total_students' | 'present_students' | 'duration_seconds';

const Sessions: React.FC = () => {
  const { status } = useWebSocket('ws://localhost:8000/ws');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('start_time');
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [offline, setOffline] = useState(false);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const { data: json, offline: isOffline } = await cachedFetch<any>(API + '/sessions', '/sessions');
      setSessions(json?.sessions || []);
      setOffline(isOffline);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  // Load on mount
  useEffect(() => { loadSessions(); }, []);
  
  // Reload when processing completes (new session finished)
  useEffect(() => {
    if (!status.is_processing) {
      setTimeout(loadSessions, 1000); // Wait 1s for data to be written
    }
  }, [status.is_processing]);

  const openDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const endpoint = '/session/' + id;
      const { data: json } = await cachedFetch<any>(API + endpoint, endpoint);
      if (json && !json.error) setSelected(json);
    } catch { /* ignore */ } finally { setDetailLoading(false); }
  };

  const deleteSession = async (id: number) => {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    setDeleting(id);
    try {
      const res = await fetch(API + '/session/' + id, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setSessions(s => {
        const updated = s.filter(x => x.id !== id);
        // Update localStorage cache so deleted session doesn't reappear
        try { localStorage.setItem('coris_cache__sessions', JSON.stringify({ data: { sessions: updated }, ts: Date.now() })); } catch {}
        return updated;
      });
      if (selected && selected.id === id) setSelected(null);
    } catch { alert('Failed to delete session. Is the backend running?'); } finally { setDeleting(null); }
  };

  const deleteAllSessions = async () => {
    if (!confirm('Delete ALL sessions? This will permanently remove all session data and cannot be undone.')) return;
    setDeletingAll(true);
    try {
      const res = await fetch(API + '/sessions/all', { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setSessions([]);
      setSelected(null);
      // Clear cached sessions
      try { localStorage.setItem('coris_cache__sessions', JSON.stringify({ data: { sessions: [] }, ts: Date.now() })); } catch {}
    } catch { alert('Failed to delete sessions. Is the backend running?'); } finally { setDeletingAll(false); }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === 'name'); }
  };

  const filtered = useMemo(() => {
    let list = [...sessions];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q) || s.start_time.includes(q));
    }
    list.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === 'string' && typeof bv === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return list;
  }, [sessions, search, sortKey, sortAsc]);

  const totalPresent = sessions.reduce((s, x) => s + x.present_students, 0);
  const totalAbsent = sessions.reduce((s, x) => s + x.absent_students, 0);
  const avgAttendance = sessions.length > 0
    ? sessions.reduce((s, x) => s + (x.total_students > 0 ? (x.present_students / x.total_students) * 100 : 0), 0) / sessions.length
    : 0;

  const trendData = useMemo(() =>
    [...sessions].sort((a, b) => a.start_time.localeCompare(b.start_time)).slice(-15).map(s => ({
      name: s.name.length > 12 ? s.name.slice(0, 12) + '...' : s.name,
      attendance: s.total_students > 0 ? Math.round((s.present_students / s.total_students) * 100) : 0,
      present: s.present_students,
      absent: s.absent_students,
    }))
  , [sessions]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronDown className="w-3 h-3 opacity-20" />;
    return sortAsc ? <ChevronUp className="w-3 h-3 text-primary-500" /> : <ChevronDown className="w-3 h-3 text-primary-500" />;
  };

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return d; }
  };

  const formatDuration = (sec: number | null) => {
    if (sec == null || sec <= 0) return '--';
    if (sec < 60) return sec.toFixed(0) + 's';
    return Math.floor(sec / 60) + 'm ' + Math.round(sec % 60) + 's';
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-80 gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center animate-pulse-slow">
          <History className="w-8 h-8 text-white" />
        </div>
        <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">Loading sessions...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Offline Banner */}
      {offline && sessions.length > 0 && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 px-4 py-3 flex items-center gap-3">
          <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-300"><strong>Offline Mode</strong> — Showing previously cached data. Start the backend to get live updates.</p>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Session History</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sessions.length} sessions recorded</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => loadSessions()} className="btn-secondary flex items-center gap-1.5 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          {sessions.length > 0 && (
            <button onClick={deleteAllSessions} disabled={deletingAll} className="btn-danger flex items-center gap-1.5 text-xs disabled:opacity-50">
              <Trash className="w-3.5 h-3.5" /> Delete All
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-stagger">
        {[
          { label: 'Total Sessions', value: String(sessions.length), icon: Calendar, gradient: 'from-violet-500 to-purple-600' },
          { label: 'Avg Attendance', value: avgAttendance.toFixed(1) + '%', icon: TrendingUp, gradient: 'from-emerald-500 to-teal-600' },
          { label: 'Total Present', value: String(totalPresent), icon: UserCheck, gradient: 'from-blue-500 to-cyan-600' },
          { label: 'Total Absent', value: String(totalAbsent), icon: AlertTriangle, gradient: 'from-red-500 to-rose-600' },
        ].map(c => (
          <div key={c.label} className="kpi-card">
            <div className="flex items-center gap-3">
              <div className={'w-10 h-10 rounded-xl bg-gradient-to-br ' + c.gradient + ' flex items-center justify-center shadow-md'}>
                <c.icon className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{c.label}</p>
                <p className="text-xl font-extrabold text-gray-900 dark:text-white">{c.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Attendance Trend Chart */}
      {trendData.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="section-title mb-4">Attendance Trend (Last 15 Sessions)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="sessGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6C5CE7" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6C5CE7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} angle={-25} textAnchor="end" height={50} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} domain={[0, 100]} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 20px 60px rgba(0,0,0,0.1)', fontSize: 12 }} formatter={(v: number) => v + '%'} />
              <Area type="monotone" dataKey="attendance" name="Attendance %" stroke="#6C5CE7" strokeWidth={2.5} fill="url(#sessGrad)" dot={{ r: 3, fill: '#6C5CE7' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Session List */}
      <div className="table-container">
        <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <h3 className="section-title">All Sessions ({filtered.length})</h3>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              className="input-field pl-10"
              placeholder="Search sessions..."
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 dark:bg-gray-800/50">
                {([['name', 'Session'], ['start_time', 'Date'], ['total_students', 'Students'], ['present_students', 'Present'], ['duration_seconds', 'Duration']] as [SortKey, string][]).map(
                  ([key, label]) => (
                    <th key={key} className="px-5 py-3.5 table-header cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 transition-colors" onClick={() => handleSort(key)}>
                      <div className="flex items-center gap-1">{label}<SortIcon col={key} /></div>
                    </th>
                  )
                )}
                <th className="px-5 py-3.5 table-header">Type</th>
                <th className="px-5 py-3.5 table-header">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {filtered.map(s => {
                const rate = s.total_students > 0 ? (s.present_students / s.total_students) * 100 : 0;
                return (
                  <tr key={s.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/30 cursor-pointer transition-colors" onClick={() => openDetail(s.id)}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center shadow-sm">
                          <History className="w-4 h-4 text-white" />
                        </div>
                        <span className="font-semibold text-gray-900 dark:text-white truncate max-w-[200px]">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400 text-xs flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" />{formatDate(s.start_time)}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300 font-medium">{s.total_students}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-16 progress-bar h-1.5">
                          <div className={'progress-fill ' + (rate >= 75 ? 'bg-gradient-to-r from-emerald-400 to-teal-500' : rate >= 50 ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-gradient-to-r from-red-400 to-rose-500')} style={{ width: Math.min(rate, 100) + '%' }} />
                        </div>
                        <span className={'font-bold text-xs ' + (rate >= 75 ? 'text-emerald-600 dark:text-emerald-400' : rate >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400')}>
                          {s.present_students}/{s.total_students}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400 text-xs flex items-center gap-1">
                      <Clock className="w-3 h-3" />{formatDuration(s.duration_seconds)}
                    </td>
                    <td className="px-5 py-3.5">
                      {s.enhanced ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-gradient-to-r from-blue-500/10 to-cyan-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                          <Zap className="w-3 h-3" />Enhanced
                        </span>
                      ) : (
                        <span className="inline-flex px-2.5 py-1 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Basic</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => deleteSession(s.id)}
                        disabled={deleting === s.id}
                        className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all disabled:opacity-50"
                        title="Delete session"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400">
                  <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium">No sessions found</p>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Session Detail Modal */}
      {(selected || detailLoading) && (
        <div className="modal-overlay" onClick={() => { if (!detailLoading) setSelected(null); }}>
          <div className="modal-content max-w-5xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {detailLoading ? (
              <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" /></div>
            ) : selected && (
              <>
                <div className="sticky top-0 bg-white dark:bg-card-dark border-b border-gray-100 dark:border-gray-800 px-6 py-5 flex items-center justify-between z-10">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
                      <History className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900 dark:text-white">{selected.name}</h2>
                      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                        <span>{formatDate(selected.start_time)}</span>
                        <span className="w-1 h-1 rounded-full bg-gray-300" />
                        <span>{formatDuration(selected.duration_seconds)}</span>
                        <span className="w-1 h-1 rounded-full bg-gray-300" />
                        <span>{selected.enhanced_analysis ? 'Enhanced' : 'Basic'}</span>
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setSelected(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"><X className="w-5 h-5 text-gray-400" /></button>
                </div>

                <div className="p-6 space-y-6">
                  {/* Session Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'Total Students', value: String(selected.total_students), icon: Users, gradient: 'from-violet-500 to-purple-600' },
                      { label: 'Present', value: String(selected.present_students), icon: CheckCircle, gradient: 'from-emerald-500 to-teal-600' },
                      { label: 'Absent', value: String(selected.absent_students), icon: AlertTriangle, gradient: 'from-red-500 to-rose-600' },
                      { label: 'Rate', value: (selected.total_students > 0 ? (selected.present_students / selected.total_students * 100).toFixed(1) : '0') + '%', icon: TrendingUp, gradient: 'from-blue-500 to-cyan-600' },
                    ].map(c => (
                      <div key={c.label} className="rounded-2xl p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50">
                        <div className="flex items-center gap-2 mb-2">
                          <div className={'w-7 h-7 rounded-lg bg-gradient-to-br ' + c.gradient + ' flex items-center justify-center'}>
                            <c.icon className="w-3.5 h-3.5 text-white" />
                          </div>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">{c.label}</p>
                        </div>
                        <p className="text-xl font-extrabold text-gray-900 dark:text-white">{c.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Attention Scores Chart */}
                  {selected.records.length > 0 && (
                    <div className="glass-card p-5">
                      <h3 className="section-title mb-4">Student Attention Scores</h3>
                      <ResponsiveContainer width="100%" height={Math.min(selected.records.length * 32 + 40, 300)}>
                        <BarChart data={selected.records.map(r => ({ name: r.student_name, score: Math.round(r.attentiveness_percentage || r.attention_score), present: r.present }))} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                          <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#94a3b8' }} width={80} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 20px 60px rgba(0,0,0,0.1)', fontSize: 12 }} formatter={(v: number) => v + '%'} />
                          <Bar dataKey="score" name="Attention %" radius={[0, 6, 6, 0]}>
                            {selected.records.map((r, i) => {
                              const s = Math.round(r.attentiveness_percentage || r.attention_score);
                              return <Cell key={i} fill={s >= 75 ? '#10B981' : s >= 50 ? '#F59E0B' : '#EF4444'} />;
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Records Table */}
                  <div className="overflow-x-auto rounded-2xl border border-gray-100 dark:border-gray-800">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50/80 dark:bg-gray-800/50">
                          <th className="px-4 py-3 table-header">Student</th>
                          <th className="px-4 py-3 table-header">Present</th>
                          <th className="px-4 py-3 table-header">Time</th>
                          <th className="px-4 py-3 table-header">Confidence</th>
                          <th className="px-4 py-3 table-header">Attention</th>
                          <th className="px-4 py-3 table-header">Emotion</th>
                          <th className="px-4 py-3 table-header">Engagement</th>
                          <th className="px-4 py-3 table-header">Participation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                        {selected.records.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/30 transition-colors">
                            <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{r.student_name}</td>
                            <td className="px-4 py-3">
                              <span className={r.present ? 'status-present' : 'status-absent'}>{r.present ? 'Present' : 'Absent'}</span>
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{r.presence_seconds.toFixed(1)}s</td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{(r.confidence * 100).toFixed(0)}%</td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{r.attentiveness_percentage.toFixed(0)}%</td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400 capitalize">{r.dominant_emotion}</td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400 capitalize">{r.engagement_level}</td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{r.participation_events}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Sessions;
