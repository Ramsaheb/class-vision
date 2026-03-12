import React, { useEffect, useState, useMemo } from 'react';
import {
  Users, Search, ChevronDown, ChevronUp, TrendingUp, AlertTriangle,
  X, RefreshCw, GraduationCap, Eye, Clock, Award,
  BarChart3, UserCheck, WifiOff,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, AreaChart, Area,
} from 'recharts';
import { cachedFetch } from '../hooks/useBackend';

const API = 'http://localhost:8000';
const DEFAULTER_THRESHOLD = 75;

interface StudentData {
  name: string;
  total_sessions: number;
  total_present: number;
  last_seen: string | null;
  attendance_rate: number;
  avg_attention_score: number;
  avg_attentiveness_pct: number;
  avg_presence_time: number;
  best_attention_score: number;
  total_participation_events: number;
  avg_participation_rate: number;
  avg_gaze_stability: number;
  avg_blink_rate: number;
  avg_head_movement: number;
}

interface HistoryRecord {
  session_id: number;
  session_name: string;
  date: string;
  present: boolean;
  presence_seconds: number;
  confidence: number;
  attention_score: number;
  attentiveness_pct: number;
  time_attentive: number;
  time_distracted: number;
  time_drowsy: number;
  time_sleeping: number;
  emotion: string;
  engagement: string;
  participation_events: number;
  participation_rate: number;
}

type SortKey = 'name' | 'attendance_rate' | 'avg_attention_score' | 'total_present' | 'avg_presence_time';

const Students: React.FC = () => {
  const [students, setStudents] = useState<StudentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<StudentData | null>(null);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [offline, setOffline] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data: json, offline: isOffline } = await cachedFetch<{ data?: { students?: StudentData[] }; students?: StudentData[] }>(API + '/student-insights', '/student-insights');
      const d = json?.data || json;
      setStudents(d?.students || []);
      setOffline(isOffline);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const loadHistory = async (name: string) => {
    setHistoryLoading(true);
    try {
      const endpoint = '/student-history/' + encodeURIComponent(name);
      const { data: json } = await cachedFetch<{ data?: HistoryRecord[] }>(API + endpoint, endpoint);
      setHistory(json?.data || []);
    } catch { setHistory([]); } finally { setHistoryLoading(false); }
  };

  const openStudent = (s: StudentData) => {
    setSelectedStudent(s);
    loadHistory(s.name);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const filtered = useMemo(() => {
    let list = [...students];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === 'string' && typeof bv === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return list;
  }, [students, search, sortKey, sortAsc]);

  const defaulterCount = students.filter(s => s.total_sessions > 0 && s.attendance_rate < DEFAULTER_THRESHOLD).length;
  const avgAttendance = students.length > 0 ? students.reduce((s, st) => s + st.attendance_rate, 0) / students.length : 0;
  const studentsWithAttn = students.filter(s => s.avg_attention_score > 0);
  const avgAttention = studentsWithAttn.length > 0 ? studentsWithAttn.reduce((s, st) => s + st.avg_attention_score, 0) / studentsWithAttn.length : -1;

  const attendanceDist = useMemo(() => {
    const bins = [
      { range: '0-25%', count: 0, color: '#EF4444' },
      { range: '25-50%', count: 0, color: '#F97316' },
      { range: '50-75%', count: 0, color: '#EAB308' },
      { range: '75-100%', count: 0, color: '#10B981' },
    ];
    students.forEach(s => {
      if (s.attendance_rate < 25) bins[0].count++;
      else if (s.attendance_rate < 50) bins[1].count++;
      else if (s.attendance_rate < 75) bins[2].count++;
      else bins[3].count++;
    });
    return bins;
  }, [students]);

  const statusPie = useMemo(() => [
    { name: 'Regular', value: students.filter(s => s.attendance_rate >= DEFAULTER_THRESHOLD).length, color: '#10B981' },
    { name: 'At Risk', value: students.filter(s => s.attendance_rate >= 50 && s.attendance_rate < DEFAULTER_THRESHOLD).length, color: '#F59E0B' },
    { name: 'Defaulter', value: students.filter(s => s.attendance_rate < 50).length, color: '#EF4444' },
  ].filter(d => d.value > 0), [students]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronDown className="w-3 h-3 opacity-20" />;
    return sortAsc ? <ChevronUp className="w-3 h-3 text-primary-500" /> : <ChevronDown className="w-3 h-3 text-primary-500" />;
  };

  const rateColor = (rate: number) => rate >= 90 ? 'text-emerald-600 dark:text-emerald-400' : rate >= 75 ? 'text-blue-600 dark:text-blue-400' : rate >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';
  const rateGradient = (rate: number) => rate >= 90 ? 'from-emerald-400 to-teal-500' : rate >= 75 ? 'from-blue-400 to-cyan-500' : rate >= 50 ? 'from-amber-400 to-orange-500' : 'from-red-400 to-rose-500';

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-80 gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center animate-pulse-slow">
          <Users className="w-8 h-8 text-white" />
        </div>
        <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">Loading students...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Offline Banner */}
      {offline && students.length > 0 && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 px-4 py-3 flex items-center gap-3">
          <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-300"><strong>Offline Mode</strong> — Showing previously cached data. Start the backend to get live updates.</p>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Student Directory</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{students.length} students registered in the system</p>
        </div>
        <button onClick={() => loadData()} className="btn-secondary flex items-center gap-1.5 text-xs">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-stagger">
        {[
          { label: 'Total Students', value: String(students.length), icon: GraduationCap, gradient: 'from-violet-500 to-purple-600' },
          { label: 'Avg Attendance', value: avgAttendance.toFixed(1) + '%', icon: TrendingUp, gradient: 'from-emerald-500 to-teal-600' },
          { label: 'Avg Attention', value: avgAttention >= 0 ? (avgAttention * 100).toFixed(1) + '%' : '--', icon: Eye, gradient: 'from-blue-500 to-cyan-600' },
          { label: 'Defaulters', value: String(defaulterCount), icon: AlertTriangle, gradient: 'from-red-500 to-rose-600' },
        ].map((c) => (
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

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card p-5">
          <h3 className="section-title mb-4">Attendance Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={attendanceDist}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="range" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 20px 60px rgba(0,0,0,0.1)', fontSize: 12 }} />
              <Bar dataKey="count" name="Students" radius={[6, 6, 0, 0]}>
                {attendanceDist.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card p-5">
          <h3 className="section-title mb-4">Student Status Overview</h3>
          {statusPie.length > 0 ? (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="60%" height={200}>
                <PieChart>
                  <Pie data={statusPie} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value" strokeWidth={0}>
                    {statusPie.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-3">
                {statusPie.map(d => (
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{d.name}</span>
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">No data</div>
          )}
        </div>
      </div>

      {/* Search & Table */}
      <div className="table-container">
        <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <h3 className="section-title">All Students ({filtered.length})</h3>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              className="input-field pl-10"
              placeholder="Search students..."
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 dark:bg-gray-800/50">
                {([['name', 'Name'], ['attendance_rate', 'Attendance'], ['avg_attention_score', 'Attention'], ['total_present', 'Present/Total'], ['avg_presence_time', 'Avg Time']] as [SortKey, string][]).map(
                  ([key, label]) => (
                    <th key={key} className="px-5 py-3.5 table-header cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 transition-colors" onClick={() => handleSort(key)}>
                      <div className="flex items-center gap-1">{label}<SortIcon col={key} /></div>
                    </th>
                  )
                )}
                <th className="px-5 py-3.5 table-header">Status</th>
                <th className="px-5 py-3.5 table-header">Last Seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {filtered.map(s => {
                const isDefaulter = s.total_sessions > 0 && s.attendance_rate < DEFAULTER_THRESHOLD;
                return (
                  <tr key={s.name} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/30 cursor-pointer transition-colors" onClick={() => openStudent(s)}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={'w-9 h-9 rounded-xl avatar text-xs bg-gradient-to-br ' + (isDefaulter ? 'from-red-400 to-rose-500' : 'from-primary-400 to-primary-600')}>
                          {s.name.charAt(0)}
                        </div>
                        <span className="font-semibold text-gray-900 dark:text-white">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-20 progress-bar h-1.5">
                          <div className={'progress-fill bg-gradient-to-r ' + rateGradient(s.attendance_rate)} style={{ width: Math.min(s.attendance_rate, 100) + '%' }} />
                        </div>
                        <span className={'font-bold text-xs ' + rateColor(s.attendance_rate)}>{s.attendance_rate.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={'font-semibold text-xs ' + (s.avg_attention_score > 0 ? rateColor(s.avg_attention_score * 100) : 'text-gray-400 dark:text-gray-500')}>{s.avg_attention_score > 0 ? (s.avg_attention_score * 100).toFixed(0) + '%' : '--'}</span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300 font-medium">{s.total_present}/{s.total_sessions}</td>
                    <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400">{s.avg_presence_time.toFixed(1)}s</td>
                    <td className="px-5 py-3.5">
                      <span className={isDefaulter ? 'status-absent' : 'status-present'}>
                        {isDefaulter ? 'Defaulter' : 'Regular'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-400">{s.last_seen ? new Date(s.last_seen).toLocaleDateString() : 'Never'}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium">No students found</p>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Student Detail Modal */}
      {selectedStudent && (
        <div className="modal-overlay" onClick={() => setSelectedStudent(null)}>
          <div className="modal-content max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="sticky top-0 bg-white dark:bg-card-dark border-b border-gray-100 dark:border-gray-800 px-6 py-5 flex items-center justify-between z-10">
              <div className="flex items-center gap-4">
                <div className={'w-12 h-12 rounded-2xl avatar text-lg bg-gradient-to-br ' + rateGradient(selectedStudent.attendance_rate)}>
                  {selectedStudent.name.charAt(0)}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">{selectedStudent.name}</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                    <span>{selectedStudent.total_sessions} sessions</span>
                    <span className="w-1 h-1 rounded-full bg-gray-300" />
                    <span>Last seen {selectedStudent.last_seen ? new Date(selectedStudent.last_seen).toLocaleDateString() : 'Never'}</span>
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedStudent(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            <div className="p-6 space-y-6">
              {/* Student Stat Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Attendance', value: selectedStudent.attendance_rate.toFixed(1) + '%', sub: selectedStudent.total_present + '/' + selectedStudent.total_sessions, icon: UserCheck, gradient: rateGradient(selectedStudent.attendance_rate) },
                  { label: 'Attention Score', value: (selectedStudent.avg_attention_score * 100).toFixed(0) + '%', sub: 'Best: ' + (selectedStudent.best_attention_score * 100).toFixed(0) + '%', icon: Eye, gradient: 'from-blue-400 to-cyan-500' },
                  { label: 'Avg Presence', value: selectedStudent.avg_presence_time.toFixed(1) + 's', sub: 'Per session', icon: Clock, gradient: 'from-indigo-400 to-violet-500' },
                  { label: 'Participation', value: String(selectedStudent.total_participation_events), sub: 'Rate: ' + (selectedStudent.avg_participation_rate * 100).toFixed(0) + '%', icon: Award, gradient: 'from-emerald-400 to-teal-500' },
                ].map(c => (
                  <div key={c.label} className="rounded-2xl p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={'w-7 h-7 rounded-lg bg-gradient-to-br ' + c.gradient + ' flex items-center justify-center'}>
                        <c.icon className="w-3.5 h-3.5 text-white" />
                      </div>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">{c.label}</p>
                    </div>
                    <p className="text-xl font-extrabold text-gray-900 dark:text-white">{c.value}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{c.sub}</p>
                  </div>
                ))}
              </div>

              {/* History Chart */}
              {historyLoading ? (
                <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" /></div>
              ) : history.length > 0 ? (
                <>
                  <div className="glass-card p-5">
                    <h3 className="section-title mb-4">Session History Timeline</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={history.map(h => ({ ...h, attention_pct: h.attention_score * 100 }))}>
                        <defs>
                          <linearGradient id="attGradM" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6C5CE7" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6C5CE7" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="session_name" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} domain={[0, 100]} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 20px 60px rgba(0,0,0,0.1)', fontSize: 12 }} formatter={(v: number) => v.toFixed(1) + '%'} />
                        <Area type="monotone" dataKey="attentiveness_pct" stroke="#6C5CE7" strokeWidth={2.5} fill="url(#attGradM)" name="Attentiveness" dot={{ r: 3, fill: '#6C5CE7' }} />
                        <Area type="monotone" dataKey="attention_pct" stroke="#00CEC9" strokeWidth={2} fill="none" name="Attention" dot={{ r: 2, fill: '#00CEC9' }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* History Table */}
                  <div className="overflow-x-auto rounded-2xl border border-gray-100 dark:border-gray-800">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50/80 dark:bg-gray-800/50">
                          <th className="px-4 py-3 table-header">Session</th>
                          <th className="px-4 py-3 table-header">Date</th>
                          <th className="px-4 py-3 table-header">Present</th>
                          <th className="px-4 py-3 table-header">Confidence</th>
                          <th className="px-4 py-3 table-header">Attention</th>
                          <th className="px-4 py-3 table-header">Emotion</th>
                          <th className="px-4 py-3 table-header">Engagement</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                        {history.map((h, i) => (
                          <tr key={i} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/30 transition-colors">
                            <td className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">{h.session_name}</td>
                            <td className="px-4 py-3 text-gray-500">{h.date ? new Date(h.date).toLocaleDateString() : '--'}</td>
                            <td className="px-4 py-3">
                              <span className={h.present ? 'status-present' : 'status-absent'}>{h.present ? 'Yes' : 'No'}</span>
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{(h.confidence * 100).toFixed(0)}%</td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{h.attentiveness_pct.toFixed(0)}%</td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400 capitalize">{h.emotion || 'N/A'}</td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400 capitalize">{h.engagement || 'N/A'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="text-center py-10 text-gray-400">
                  <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium">No session history found</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Students;
