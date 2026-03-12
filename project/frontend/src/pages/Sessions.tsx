import React, { useEffect, useState, useMemo } from 'react';
import { History, Users, Trash2, X, Search, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, Zap, RefreshCw, Trash } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

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
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('start_time');
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const res = await fetch(API + '/sessions');
      const json = await res.json();
      setSessions(json.sessions || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { loadSessions(); }, []);

  const openDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const res = await fetch(API + '/session/' + id);
      const json = await res.json();
      if (!json.error) setSelected(json);
    } catch { /* ignore */ } finally { setDetailLoading(false); }
  };

  const deleteSession = async (id: number) => {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    setDeleting(id);
    try {
      await fetch(API + '/session/' + id, { method: 'DELETE' });
      setSessions(s => s.filter(x => x.id !== id));
      if (selected && selected.id === id) setSelected(null);
    } catch { /* ignore */ } finally { setDeleting(null); }
  };

  const deleteAllSessions = async () => {
    if (!confirm('Delete ALL sessions? This will permanently remove all session data and cannot be undone.')) return;
    setDeletingAll(true);
    try {
      await fetch(API + '/sessions/all', { method: 'DELETE' });
      setSessions([]);
      setSelected(null);
    } catch { /* ignore */ } finally { setDeletingAll(false); }
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
    if (sortKey !== col) return <ChevronDown className="w-3 h-3 opacity-30" />;
    return sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="flex items-center justify-between">
        <div />
        <div className="flex items-center gap-2">
          <button onClick={() => loadSessions()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          {sessions.length > 0 && (
            <button onClick={deleteAllSessions} disabled={deletingAll} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors disabled:opacity-50">
              <Trash className="w-3.5 h-3.5" /> Delete All
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Sessions', value: String(sessions.length), icon: History, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20' },
          { label: 'Avg Attendance', value: avgAttendance.toFixed(1) + '%', icon: Users, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' },
          { label: 'Total Present', value: String(totalPresent), icon: CheckCircle, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Total Absent', value: String(totalAbsent), icon: AlertTriangle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
        ].map(c => (
          <div key={c.label} className="bg-card-light dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-3">
              <div className={'p-2 rounded-lg ' + c.bg}><c.icon className={'w-5 h-5 ' + c.color} /></div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{c.label}</p>
                <p className={'text-xl font-bold ' + c.color}>{c.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Attendance Trend Chart */}
      {trendData.length > 0 && (
        <div className="bg-card-light dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Attendance Trend (Last 15 Sessions)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
              <Tooltip formatter={(v: number) => v + '%'} />
              <Bar dataKey="attendance" name="Attendance %" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Session List */}
      <div className="bg-card-light dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">All Sessions ({filtered.length})</h3>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none text-gray-900 dark:text-white"
              placeholder="Search sessions..."
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                {([['name', 'Session'], ['start_time', 'Date'], ['total_students', 'Students'], ['present_students', 'Present'], ['duration_seconds', 'Duration']] as [SortKey, string][]).map(
                  ([key, label]) => (
                    <th key={key} className="px-4 py-3 font-medium cursor-pointer hover:text-gray-700 dark:hover:text-gray-200" onClick={() => handleSort(key)}>
                      <div className="flex items-center gap-1">{label}<SortIcon col={key} /></div>
                    </th>
                  )
                )}
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const rate = s.total_students > 0 ? (s.present_students / s.total_students) * 100 : 0;
                return (
                  <tr key={s.id} className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors" onClick={() => openDetail(s.id)}>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        <History className="w-4 h-4 text-purple-500 flex-shrink-0" />
                        <span className="truncate max-w-[200px]">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-xs">{formatDate(s.start_time)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{s.total_students}</td>
                    <td className="px-4 py-3">
                      <span className={rate >= 75 ? 'text-green-600 dark:text-green-400' : rate >= 50 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}>
                        {s.present_students}/{s.total_students}
                      </span>
                      <span className="text-[10px] text-gray-400 ml-1">({rate.toFixed(0)}%)</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-xs">{formatDuration(s.duration_seconds)}</td>
                    <td className="px-4 py-3">
                      {s.enhanced ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                          <Zap className="w-3 h-3" />Enhanced
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">Basic</span>
                      )}
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => deleteSession(s.id)}
                        disabled={deleting === s.id}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                        title="Delete session"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">No sessions found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Session Detail Modal */}
      {(selected || detailLoading) && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { if (!detailLoading) setSelected(null); }}>
          <div className="bg-card-light dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl w-full max-w-5xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {detailLoading ? (
              <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" /></div>
            ) : selected && (
              <>
                <div className="sticky top-0 bg-card-light dark:bg-card-dark border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between z-10">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">{selected.name}</h2>
                    <p className="text-xs text-gray-500">{formatDate(selected.start_time)} &middot; {formatDuration(selected.duration_seconds)} &middot; {selected.enhanced_analysis ? 'Enhanced' : 'Basic'}</p>
                  </div>
                  <button onClick={() => setSelected(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-6 space-y-6">
                  {/* Session Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'Total Students', value: String(selected.total_students), color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20' },
                      { label: 'Present', value: String(selected.present_students), color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' },
                      { label: 'Absent', value: String(selected.absent_students), color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
                      { label: 'Rate', value: (selected.total_students > 0 ? (selected.present_students / selected.total_students * 100).toFixed(1) : '0') + '%', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
                    ].map(c => (
                      <div key={c.label} className={'rounded-xl p-3 ' + c.bg}>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">{c.label}</p>
                        <p className={'text-xl font-bold ' + c.color}>{c.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Attendance Bar Chart */}
                  {selected.records.length > 0 && (
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Student Attention Scores</h3>
                      <ResponsiveContainer width="100%" height={Math.min(selected.records.length * 30 + 40, 300)}>
                        <BarChart data={selected.records.map(r => ({ name: r.student_name, score: Math.round(r.attentiveness_percentage || r.attention_score), present: r.present ? 1 : 0 }))} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                          <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
                          <Tooltip formatter={(v: number) => v + '%'} />
                          <Bar dataKey="score" name="Attention %" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Records Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                          <th className="px-3 py-2">Student</th>
                          <th className="px-3 py-2">Present</th>
                          <th className="px-3 py-2">Time</th>
                          <th className="px-3 py-2">Confidence</th>
                          <th className="px-3 py-2">Attention</th>
                          <th className="px-3 py-2">Emotion</th>
                          <th className="px-3 py-2">Engagement</th>
                          <th className="px-3 py-2">Participation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.records.map((r, i) => (
                          <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                            <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{r.student_name}</td>
                            <td className="px-3 py-2">
                              <span className={r.present ? 'text-green-600' : 'text-red-500'}>{r.present ? 'Yes' : 'No'}</span>
                            </td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{r.presence_seconds.toFixed(1)}s</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{(r.confidence * 100).toFixed(0)}%</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{r.attentiveness_percentage.toFixed(0)}%</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400 capitalize">{r.dominant_emotion}</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400 capitalize">{r.engagement_level}</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{r.participation_events}</td>
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
