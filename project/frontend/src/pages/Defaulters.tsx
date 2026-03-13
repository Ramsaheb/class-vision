import React, { useEffect, useState, useMemo } from 'react';
import {
  AlertTriangle, Mail, Search, TrendingDown, ShieldAlert, Filter,
  CheckCircle, X, RefreshCw, UserX, Send, WifiOff, Loader2,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { cachedFetch, useWebSocket } from '../hooks/useBackend';

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

interface EmailResult {
  type: 'success' | 'error';
  message: string;
  sent?: { name: string; email: string }[];
  failed?: { name: string; email: string; error: string }[];
}

const Defaulters: React.FC = () => {
  const { status, result } = useWebSocket('ws://localhost:8000/ws');
  const [students, setStudents] = useState<StudentData[]>([]);
  const [latestPresentNames, setLatestPresentNames] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState<Severity>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showComposer, setShowComposer] = useState(false);
  const [emailSubject, setEmailSubject] = useState('Attendance Alert - Immediate Attention Required');
  const [emailBody, setEmailBody] = useState('');
  const [offline, setOffline] = useState(false);
  const [sending, setSending] = useState(false);
  const [emailResult, setEmailResult] = useState<EmailResult | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [{ data: insightsJson, offline: insightsOffline }, { data: lrJson, offline: lrOffline }] = await Promise.all([
        cachedFetch<any>(API + '/student-insights', '/student-insights'),
        cachedFetch<any>(API + '/last-result', '/last-result'),
      ]);

      const d = insightsJson?.data || insightsJson;
      setStudents(d?.students || []);

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
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  // Load on mount
  useEffect(() => { loadData(); }, []);
  // Reload when processing completes (new session finished)
  useEffect(() => {
    if (!status.is_processing) {
      setTimeout(loadData, 1000); // Wait 1s for data to be written
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

  const getSeverity = (rate: number): 'critical' | 'warning' | 'moderate' | 'ok' => {
    if (rate < 25) return 'critical';
    if (rate < 50) return 'warning';
    if (rate < DEFAULTER_THRESHOLD) return 'moderate';
    return 'ok';
  };

  const severityConfig = {
    critical: { label: 'Critical', gradient: 'from-red-500 to-rose-600', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800', ring: 'ring-red-200 dark:ring-red-900' },
    moderate: { label: 'Moderate', gradient: 'from-yellow-500 to-amber-500', color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/20', border: 'border-yellow-200 dark:border-yellow-800', ring: 'ring-yellow-200 dark:ring-yellow-900' },
  };

  const defaulters = useMemo(() =>
    students.filter(s =>
      s.total_sessions >= MIN_SESSIONS_FOR_DEFAULTER &&
      s.attendance_rate < DEFAULTER_THRESHOLD &&
      !latestPresentNames.has(normalizeName(s.name))
    )
  , [students, latestPresentNames]);

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

  const sendEmails = async () => {
    setSending(true);
    setEmailResult(null);
    try {
      const selectedNames = filtered.filter(s => selectedIds.has(s.name)).map(s => s.name);
      const res = await fetch(API + '/send-defaulter-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_names: selectedNames,
          subject: emailSubject,
          body: emailBody,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setEmailResult({ type: 'error', message: data.error });
      } else {
        setEmailResult({
          type: 'success',
          message: `Sent ${data.total_sent} email(s) successfully${data.total_failed > 0 ? `, ${data.total_failed} failed` : ''}`,
          sent: data.sent,
          failed: data.failed,
        });
        if (data.total_sent > 0 && data.total_failed === 0) {
          setTimeout(() => { setShowComposer(false); setEmailResult(null); }, 3000);
        }
      }
    } catch {
      setEmailResult({ type: 'error', message: 'Failed to connect to backend. Is the server running?' });
    } finally {
      setSending(false);
    }
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
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Students below {DEFAULTER_THRESHOLD}% attendance threshold ({MIN_SESSIONS_FOR_DEFAULTER}+ sessions)</p>
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
                <button onClick={() => { setShowComposer(false); setEmailResult(null); }} className="btn-ghost">Cancel</button>
                <button onClick={sendEmails} disabled={sending} className="btn-primary flex items-center gap-2">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {sending ? 'Sending...' : 'Send Emails'}
                </button>
              </div>
              {emailResult && (
                <div className={'mt-4 rounded-xl px-4 py-3 text-sm ' + (emailResult.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800')}>
                  <p className="font-semibold">{emailResult.type === 'success' ? '✅ ' : '❌ '}{emailResult.message}</p>
                  {emailResult.sent && emailResult.sent.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs opacity-80">
                      {emailResult.sent.map(s => <li key={s.name}>Sent to {s.name} → {s.email}</li>)}
                    </ul>
                  )}
                  {emailResult.failed && emailResult.failed.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs opacity-80">
                      {emailResult.failed.map(s => <li key={s.name}>Failed: {s.name} → {s.email} ({s.error})</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Defaulters;
