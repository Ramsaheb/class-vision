import React, { useEffect, useState, useMemo } from 'react';
import { AlertTriangle, Mail, Search, TrendingDown, ShieldAlert, Filter, CheckCircle, X, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';

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

  const getSeverity = (rate: number): 'critical' | 'warning' | 'moderate' | 'ok' => {
    if (rate < 25) return 'critical';
    if (rate < 50) return 'warning';
    if (rate < DEFAULTER_THRESHOLD) return 'moderate';
    return 'ok';
  };

  const severityConfig = {
    critical: { label: 'Critical', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30', border: 'border-red-200 dark:border-red-800', badge: 'bg-red-500' },
    warning: { label: 'Warning', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30', border: 'border-orange-200 dark:border-orange-800', badge: 'bg-orange-500' },
    moderate: { label: 'Moderate', color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/30', border: 'border-yellow-200 dark:border-yellow-800', badge: 'bg-yellow-500' },
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
          { label: 'Total Defaulters', value: String(defaulters.length), icon: AlertTriangle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
          { label: 'Critical (<25%)', value: String(criticalCount), icon: ShieldAlert, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
          { label: 'Warning (<50%)', value: String(warningCount), icon: TrendingDown, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20' },
          { label: 'Moderate (<75%)', value: String(moderateCount), icon: Filter, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
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

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="bg-card-light dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Defaulter Attendance Rates</h3>
          <ResponsiveContainer width="100%" height={Math.min(chartData.length * 32 + 40, 400)}>
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
              <Tooltip formatter={(v: number) => v + '%'} />
              <Bar dataKey="attendance" name="Attendance %" radius={[0, 4, 4, 0]}>
                {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filters & Actions */}
      <div className="bg-card-light dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Defaulter List ({filtered.length})</h3>
            <div className="flex gap-1">
              {(['all', 'critical', 'warning', 'moderate'] as Severity[]).map(s => (
                <button
                  key={s}
                  onClick={() => setSeverity(s)}
                  className={
                    'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ' +
                    (severity === s
                      ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                      : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700')
                  }
                >
                  {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none text-gray-900 dark:text-white"
                placeholder="Search..."
              />
            </div>
            {selectedIds.size > 0 && (
              <button
                onClick={openComposer}
                className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors"
              >
                <Mail className="w-4 h-4" />
                Email ({selectedIds.size})
              </button>
            )}
          </div>
        </div>

        {/* Defaulter Cards */}
        <div className="p-4">
          {filtered.length > 0 && (
            <div className="mb-3 flex items-center gap-2">
              <button onClick={selectAll} className="text-xs text-purple-600 dark:text-purple-400 hover:underline">
                {selectedIds.size === filtered.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          )}
          <div className="space-y-2">
            {filtered.map(s => {
              const sev = getSeverity(s.attendance_rate);
              const cfg = severityConfig[sev as keyof typeof severityConfig];
              const selected = selectedIds.has(s.name);
              const absent = s.total_sessions - s.total_present;
              return (
                <div
                  key={s.name}
                  className={
                    'flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer ' +
                    (selected
                      ? 'border-purple-400 dark:border-purple-600 bg-purple-50/50 dark:bg-purple-900/10 ring-1 ring-purple-300 dark:ring-purple-700'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50')
                  }
                  onClick={() => toggleSelect(s.name)}
                >
                  {/* Checkbox */}
                  <div className={'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ' + (selected ? 'border-purple-500 bg-purple-500' : 'border-gray-300 dark:border-gray-600')}>
                    {selected && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                  </div>

                  {/* Avatar */}
                  <div className={'w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ' + (cfg?.badge || 'bg-gray-400')}>
                    {s.name.charAt(0)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 dark:text-white">{s.name}</span>
                      <span className={'inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ' + (cfg?.bg || '') + ' ' + (cfg?.color || '')}>
                        {cfg?.label || 'Unknown'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <span>Present: {s.total_present}/{s.total_sessions}</span>
                      <span>Absent: {absent}</span>
                      <span>Attention: {(s.avg_attention_score * 100).toFixed(0)}%</span>
                      <span>Last: {s.last_seen ? new Date(s.last_seen).toLocaleDateString() : 'Never'}</span>
                    </div>
                  </div>

                  {/* Attendance Rate */}
                  <div className="text-right flex-shrink-0">
                    <div className={'text-lg font-bold ' + (cfg?.color || '')}>{s.attendance_rate.toFixed(1)}%</div>
                    <div className="w-20 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mt-1 overflow-hidden">
                      <div
                        className={'h-full rounded-full ' + (sev === 'critical' ? 'bg-red-500' : sev === 'warning' ? 'bg-orange-500' : 'bg-yellow-500')}
                        style={{ width: s.attendance_rate + '%' }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">{defaulters.length === 0 ? 'No defaulters! All students meet attendance requirements.' : 'No defaulters match your filter.'}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Email Composer Modal */}
      {showComposer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowComposer(false)}>
          <div className="bg-card-light dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Compose Alert Email</h2>
              <button onClick={() => setShowComposer(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Subject</label>
                <input
                  value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Body</label>
                <textarea
                  value={emailBody} onChange={e => setEmailBody(e.target.value)}
                  rows={12}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none text-gray-900 dark:text-white resize-y"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowComposer(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
                <button onClick={sendEmails} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors">
                  <Mail className="w-4 h-4" />Open in Mail Client
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
