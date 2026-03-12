import React, { useEffect, useState, useMemo } from 'react';
import { Users, Search, ChevronDown, ChevronUp, TrendingUp, AlertTriangle, X, Target, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid, LineChart, Line } from 'recharts';

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

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetch(API + '/student-insights');
      const json = await res.json();
      const d = json.data || json;
      setStudents(d.students || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const loadHistory = async (name: string) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(API + '/student-history/' + encodeURIComponent(name));
      const json = await res.json();
      setHistory(json.data || []);
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
  const avgAttention = students.length > 0 ? students.reduce((s, st) => s + st.avg_attention_score, 0) / students.length : 0;

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
    if (sortKey !== col) return <ChevronDown className="w-3 h-3 opacity-30" />;
    return sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  };

  const rateColor = (rate: number) => rate >= 90 ? 'text-green-600 dark:text-green-400' : rate >= 75 ? 'text-blue-600 dark:text-blue-400' : rate >= 50 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400';
  const rateBg = (rate: number) => rate >= 90 ? 'bg-green-100 dark:bg-green-900/30' : rate >= 75 ? 'bg-blue-100 dark:bg-blue-900/30' : rate >= 50 ? 'bg-yellow-100 dark:bg-yellow-900/30' : 'bg-red-100 dark:bg-red-900/30';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex items-center justify-end">
        <button onClick={() => loadData()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Students', value: String(students.length), icon: Users, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20' },
          { label: 'Avg Attendance', value: avgAttendance.toFixed(1) + '%', icon: TrendingUp, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' },
          { label: 'Avg Attention', value: (avgAttention * 100).toFixed(1) + '%', icon: Target, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Defaulters', value: String(defaulterCount), icon: AlertTriangle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
        ].map((c) => (
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

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card-light dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Attendance Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={attendanceDist}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis dataKey="range" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Students" radius={[4, 4, 0, 0]}>
                {attendanceDist.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card-light dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Student Status</h3>
          {statusPie.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusPie} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" label={({ name, value }) => name + ': ' + value}>
                  {statusPie.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">No data</div>
          )}
        </div>
      </div>

      {/* Search & Table */}
      <div className="bg-card-light dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">All Students ({filtered.length})</h3>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none text-gray-900 dark:text-white"
              placeholder="Search students..."
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                {([['name', 'Name'], ['attendance_rate', 'Attendance'], ['avg_attention_score', 'Attention'], ['total_present', 'Present/Total'], ['avg_presence_time', 'Avg Time']] as [SortKey, string][]).map(
                  ([key, label]) => (
                    <th key={key} className="px-4 py-3 font-medium cursor-pointer hover:text-gray-700 dark:hover:text-gray-200" onClick={() => handleSort(key)}>
                      <div className="flex items-center gap-1">{label}<SortIcon col={key} /></div>
                    </th>
                  )
                )}
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const isDefaulter = s.total_sessions > 0 && s.attendance_rate < DEFAULTER_THRESHOLD;
                return (
                  <tr key={s.name} className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors" onClick={() => openStudent(s)}>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        <div className={'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ' + (isDefaulter ? 'bg-red-500' : 'bg-purple-500')}>
                          {s.name.charAt(0)}
                        </div>
                        {s.name}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className={'h-full rounded-full ' + (s.attendance_rate >= 75 ? 'bg-green-500' : s.attendance_rate >= 50 ? 'bg-yellow-500' : 'bg-red-500')} style={{ width: s.attendance_rate + '%' }} />
                        </div>
                        <span className={'font-medium ' + rateColor(s.attendance_rate)}>{s.attendance_rate.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={'font-medium ' + rateColor(s.avg_attention_score * 100)}>{(s.avg_attention_score * 100).toFixed(0)}%</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{s.total_present}/{s.total_sessions}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{s.avg_presence_time.toFixed(1)}s</td>
                    <td className="px-4 py-3">
                      <span className={'inline-flex px-2 py-0.5 rounded-full text-xs font-medium ' + (isDefaulter ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300')}>
                        {isDefaulter ? 'Defaulter' : 'Regular'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{s.last_seen ? new Date(s.last_seen).toLocaleDateString() : 'Never'}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">No students found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Student Detail Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedStudent(null)}>
          <div className="bg-card-light dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-card-light dark:bg-card-dark border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold">{selectedStudent.name.charAt(0)}</div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">{selectedStudent.name}</h2>
                  <p className="text-xs text-gray-500">{selectedStudent.total_sessions} sessions &middot; Last seen {selectedStudent.last_seen ? new Date(selectedStudent.last_seen).toLocaleDateString() : 'Never'}</p>
                </div>
              </div>
              <button onClick={() => setSelectedStudent(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 space-y-6">
              {/* Student Stat Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Attendance', value: selectedStudent.attendance_rate.toFixed(1) + '%', sub: selectedStudent.total_present + '/' + selectedStudent.total_sessions, color: rateColor(selectedStudent.attendance_rate), bg: rateBg(selectedStudent.attendance_rate) },
                  { label: 'Attention Score', value: (selectedStudent.avg_attention_score * 100).toFixed(0) + '%', sub: 'Best: ' + (selectedStudent.best_attention_score * 100).toFixed(0) + '%', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
                  { label: 'Avg Presence', value: selectedStudent.avg_presence_time.toFixed(1) + 's', sub: 'Per session', color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
                  { label: 'Participation', value: String(selectedStudent.total_participation_events), sub: 'Rate: ' + (selectedStudent.avg_participation_rate * 100).toFixed(0) + '%', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
                ].map(c => (
                  <div key={c.label} className={'rounded-xl p-3 ' + c.bg}>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">{c.label}</p>
                    <p className={'text-xl font-bold ' + c.color}>{c.value}</p>
                    <p className="text-[10px] text-gray-400">{c.sub}</p>
                  </div>
                ))}
              </div>

              {/* History Chart */}
              {historyLoading ? (
                <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600" /></div>
              ) : history.length > 0 ? (
                <>
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Session History</h3>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={history.map(h => ({ ...h, attention_pct: h.attention_score * 100 }))}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                        <XAxis dataKey="session_name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                        <Tooltip formatter={(v: number) => v.toFixed(1) + '%'} />
                        <Line type="monotone" dataKey="attentiveness_pct" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 3 }} name="Attentiveness" />
                        <Line type="monotone" dataKey="attention_pct" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} name="Attention" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* History Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                          <th className="px-3 py-2">Session</th>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Present</th>
                          <th className="px-3 py-2">Confidence</th>
                          <th className="px-3 py-2">Attention</th>
                          <th className="px-3 py-2">Emotion</th>
                          <th className="px-3 py-2">Engagement</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((h, i) => (
                          <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{h.session_name}</td>
                            <td className="px-3 py-2 text-gray-500">{h.date}</td>
                            <td className="px-3 py-2">
                              <span className={h.present ? 'text-green-600' : 'text-red-500'}>{h.present ? 'Yes' : 'No'}</span>
                            </td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{(h.confidence * 100).toFixed(0)}%</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{h.attentiveness_pct.toFixed(0)}%</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400 capitalize">{h.emotion || 'N/A'}</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400 capitalize">{h.engagement || 'N/A'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="text-center py-6 text-gray-400 text-sm">No session history found</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Students;
