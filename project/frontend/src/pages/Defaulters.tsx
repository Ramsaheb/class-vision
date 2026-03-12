import React, { useEffect, useState, useMemo } from 'react';
import {
  AlertTriangle, Mail, Search, TrendingDown, ShieldAlert, Filter,
  CheckCircle, X, RefreshCw, UserX, Send, WifiOff,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
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
}

type Severity = 'all' | 'critical' | 'warning' | 'moderate';

const Defaulters: React.FC = () => {
  const [students, setStudents] = useState<StudentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState<Severity>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showComposer, setShowComposer] = useState(false);
  const [emailSubject, setEmailSubject] = useState('Attendance Alert - Immediate Attention Required');
  const [emailBody, setEmailBody] = useState('');
  const [offline, setOffline] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data: json, offline: isOffline } = await cachedFetch<any>(API + '/student-insights', '/student-insights');
      const d = json?.data || json;
      setStudents(d?.students || []);
      setOffline(isOffline);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const getSeverity = (rate: number): 'critical' | 'warning' | 'moderate' | 'ok' => {
    if (rate < 25) return 'critical';
    if (rate < 50) return 'warning';
    if (rate < DEFAULTER_THRESHOLD) return 'moderate';
    return 'ok';
  };

  const severityConfig = {
    critical: { label: 'Critical', gradient: 'from-red-500 to-rose-600', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800', ring: 'ring-red-200 dark:ring-red-900' },
    warning: { label: 'Warning', gradient: 'from-orange-500 to-amber-600', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200 dark:border-orange-800', ring: 'ring-orange-200 dark:ring-orange-900' },
    moderate: { label: 'Moderate', gradient: 'from-yellow-500 to-amber-500', color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/20', border: 'border-yellow-200 dark:border-yellow-800', ring: 'ring-yellow-200 dark:ring-yellow-900' },
  };

  const defaulters = useMemo(() =>
    students.filter(s => s.total_sessions > 0 && s.attendance_rate < DEFAULTER_THRESHOLD)
  , [students]);

  const filtered = useMemo(() => {
    let list = [...defaulters];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q));
    }
    if (severity !== 'all') {
      list = list.filter(s => getSeverity(s.attendance_rate) === severity);
    }
    list.sort((a, b) => a.attendance_rate - b.attendance_rate);
    return list;
  }, [defaulters, search, severity]);

  const criticalCount = defaulters.filter(s => getSeverity(s.attendance_rate) === 'critical').length;
  const warningCount = defaulters.filter(s => getSeverity(s.attendance_rate) === 'warning').length;
  const moderateCount = defaulters.filter(s => getSeverity(s.attendance_rate) === 'moderate').length;

  const chartData = useMemo(() =>
    [...defaulters].sort((a, b) => a.attendance_rate - b.attendance_rate).slice(0, 15).map(s => ({
      name: s.name,
      attendance: Math.round(s.attendance_rate),
      fill: getSeverity(s.attendance_rate) === 'critical' ? '#EF4444' : getSeverity(s.attendance_rate) === 'warning' ? '#F97316' : '#EAB308',
    }))
  , [defaulters]);

  const toggleSelect = (name: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(s => s.name)));
  };

  const openComposer = () => {
    const names = filtered.filter(s => selectedIds.has(s.name));
    const nameList = names.map(s => s.name + ' (' + s.attendance_rate.toFixed(1) + '%)').join('\n- ');
    setEmailBody(
      'Dear Parent/Guardian,\n\n' +
      'This is to inform you that the following student(s) have attendance below the required ' + DEFAULTER_THRESHOLD + '% threshold:\n\n- ' +
      nameList + '\n\n' +
      'Please ensure regular attendance to avoid academic consequences.\n\n' +
      'Regards,\nAttendance Monitoring System'
    );
    setShowComposer(true);
  };

  const sendEmails = () => {
    const mailto = 'mailto:?subject=' + encodeURIComponent(emailSubject) + '&body=' + encodeURIComponent(emailBody);
    window.open(mailto);
    setShowComposer(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-80 gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center animate-pulse-slow">
          <AlertTriangle className="w-8 h-8 text-white" />
        </div>
        <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">Analyzing defaulters...</p>
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
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Defaulter Management</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Students below {DEFAULTER_THRESHOLD}% attendance threshold</p>
        </div>
        <button onClick={() => loadData()} className="btn-secondary flex items-center gap-1.5 text-xs">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-stagger">
        {[
          { label: 'Total Defaulters', value: String(defaulters.length), icon: UserX, gradient: 'from-red-500 to-rose-600' },
          { label: 'Critical (<25%)', value: String(criticalCount), icon: ShieldAlert, gradient: 'from-red-600 to-red-700' },
          { label: 'Warning (<50%)', value: String(warningCount), icon: TrendingDown, gradient: 'from-orange-500 to-amber-600' },
          { label: 'Moderate (<75%)', value: String(moderateCount), icon: Filter, gradient: 'from-yellow-500 to-amber-500' },
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

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="section-title mb-4">Defaulter Attendance Rates</h3>
          <ResponsiveContainer width="100%" height={Math.min(chartData.length * 34 + 40, 400)}>
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#94a3b8' }} width={80} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 20px 60px rgba(0,0,0,0.1)', fontSize: 12 }} formatter={(v: number) => v + '%'} />
              <Bar dataKey="attendance" name="Attendance %" radius={[0, 6, 6, 0]}>
                {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filters & List */}
      <div className="glass-card">
        <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="section-title">Defaulter List ({filtered.length})</h3>
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
              {(['all', 'critical', 'warning', 'moderate'] as Severity[]).map(s => (
                <button
                  key={s}
                  onClick={() => setSeverity(s)}
                  className={
                    'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ' +
                    (severity === s
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300')
                  }
                >
                  {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-56">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                className="input-field pl-10"
                placeholder="Search..."
              />
            </div>
            {selectedIds.size > 0 && (
              <button onClick={openComposer} className="btn-primary flex items-center gap-1.5">
                <Mail className="w-4 h-4" />
                Email ({selectedIds.size})
              </button>
            )}
          </div>
        </div>

        {/* Defaulter Cards */}
        <div className="p-5">
          {filtered.length > 0 && (
            <div className="mb-4 flex items-center gap-2">
              <button onClick={selectAll} className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline">
                {selectedIds.size === filtered.length ? 'Deselect All' : 'Select All'}
              </button>
              <span className="text-xs text-gray-400">&middot; {selectedIds.size} selected</span>
            </div>
          )}
          <div className="space-y-3">
            {filtered.map(s => {
              const sev = getSeverity(s.attendance_rate);
              const cfg = severityConfig[sev as keyof typeof severityConfig];
              const isSelected = selectedIds.has(s.name);
              const absent = s.total_sessions - s.total_present;
              return (
                <div
                  key={s.name}
                  className={
                    'flex items-center gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer hover:shadow-card ' +
                    (isSelected
                      ? 'border-primary-400 dark:border-primary-600 bg-primary-50/50 dark:bg-primary-900/10 ring-2 ' + 'ring-primary-200 dark:ring-primary-800'
                      : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700')
                  }
                  onClick={() => toggleSelect(s.name)}
                >
                  {/* Checkbox */}
                  <div className={'w-5 h-5 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all ' + (isSelected ? 'border-primary-500 bg-primary-500' : 'border-gray-300 dark:border-gray-600')}>
                    {isSelected && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                  </div>

                  {/* Avatar */}
                  <div className={'avatar w-11 h-11 text-sm bg-gradient-to-br ' + (cfg?.gradient || 'from-gray-400 to-gray-500')}>
                    {s.name.charAt(0)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-bold text-gray-900 dark:text-white">{s.name}</span>
                      <span className={'inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold ' + (cfg?.bg || '') + ' ' + (cfg?.color || '')}>
                        {cfg?.label || 'Unknown'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      <span>Present: <span className="font-semibold text-gray-600 dark:text-gray-300">{s.total_present}/{s.total_sessions}</span></span>
                      <span>Absent: <span className="font-semibold text-red-500">{absent}</span></span>
                      <span>Attention: <span className="font-semibold text-gray-600 dark:text-gray-300">{s.avg_attention_score > 0 ? (s.avg_attention_score * 100).toFixed(0) + '%' : '--'}</span></span>
                      <span>Last: <span className="font-medium">{s.last_seen ? new Date(s.last_seen).toLocaleDateString() : 'Never'}</span></span>
                    </div>
                  </div>

                  {/* Attendance Rate */}
                  <div className="text-right flex-shrink-0">
                    <div className={'text-xl font-extrabold ' + (cfg?.color || '')}>{s.attendance_rate.toFixed(1)}%</div>
                    <div className="w-20 progress-bar h-2 mt-1.5">
                      <div
                        className={'progress-fill bg-gradient-to-r ' + (cfg?.gradient || 'from-gray-400 to-gray-500')}
                        style={{ width: s.attendance_rate + '%' }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-center py-14 text-gray-400">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-semibold">{defaulters.length === 0 ? 'No defaulters! All students meet attendance requirements.' : 'No defaulters match your filter.'}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Email Composer Modal */}
      {showComposer && (
        <div className="modal-overlay" onClick={() => setShowComposer(false)}>
          <div className="modal-content max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Compose Alert Email</h2>
              </div>
              <button onClick={() => setShowComposer(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Subject</label>
                <input
                  value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Body</label>
                <textarea
                  value={emailBody} onChange={e => setEmailBody(e.target.value)}
                  rows={12}
                  className="input-field resize-y"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setShowComposer(false)} className="btn-ghost">Cancel</button>
                <button onClick={sendEmails} className="btn-primary flex items-center gap-2">
                  <Send className="w-4 h-4" />Open in Mail Client
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Defaulters;
