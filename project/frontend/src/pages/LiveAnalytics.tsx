import React, { useState, useEffect, useCallback } from 'react';
import {
  VideoOff, Users, Play, Loader2, Wifi, WifiOff, Eye, Clock,
  CheckCircle, Download, Activity, Radio, Zap,
} from 'lucide-react';
import { useWebSocket, AttendanceResult, cachedFetch } from '../hooks/useBackend';

const API = 'http://localhost:8000';

const LiveAnalytics: React.FC = () => {
  const { status, result, isConnected } = useWebSocket('ws://localhost:8000/ws');
  const [lastResult, setLastResult] = useState<AttendanceResult | null>(null);
  const [gallery, setGallery] = useState<{people: Array<{name: string; image_count: number}>} | null>(null);
  const [starting, setStarting] = useState(false);
  const [log, setLog] = useState<Array<{time: string; msg: string; type: string}>>([]);
  const [offline, setOffline] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [lrResult, giResult] = await Promise.all([
        cachedFetch<any>(API + '/last-result', '/last-result'),
        cachedFetch<any>(API + '/gallery-info', '/gallery-info'),
      ]);
      if (lrResult.data && !lrResult.data.error) setLastResult(lrResult.data);
      if (giResult.data && !giResult.data.error) setGallery(giResult.data);
      setOffline(lrResult.offline && giResult.offline);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (result) { setLastResult(result); addLog('Processing completed', 'pos'); } }, [result]);
  useEffect(() => { if (status.is_processing) addLog(status.message, 'info'); }, [status.message, status.is_processing]);

  const addLog = (msg: string, type: string) => {
    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLog(p => [{ time, msg, type }, ...p.slice(0, 19)]);
  };

  const startProcessing = async () => {
    try {
      setStarting(true);
      addLog('Starting processing...', 'info');
      const res = await fetch(API + '/process', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ use_cache: true, clear_cache: false }) });
      const d = await res.json();
      if (d.error) addLog('Error: ' + d.error, 'err');
      else addLog('Processing started', 'pos');
    } catch { addLog('Failed to start', 'err'); }
    finally { setStarting(false); }
  };

  const downloadCSV = () => {
    const att = lastResult?.attendance || {};
    const allStudents = gallery?.people || [];
    const headers = ['Student', 'Status', 'Presence(s)', 'Presence(%)', 'Confidence', 'Attention', 'Attention State'];
    const rows = allStudents.map(s => {
      const r = att[s.name];
      const present = r ? ((r.presence_percentage || 0) >= 30 || (r.presence_seconds || 0) >= 10) : false;
      const attn = lastResult?.attentiveness?.individual_scores?.[s.name];
      return [s.name, present ? 'Present' : 'Absent', (r?.presence_seconds || 0).toFixed(1),
        (r?.presence_percentage || 0).toFixed(1), ((r?.avg_confidence || 0) * 100).toFixed(0) + '%',
        attn ? attn.attention_pct.toFixed(0) + '%' : 'N/A', attn?.state || (present ? 'N/A' : 'Absent')];
    });
    const csv = [headers, ...rows].map(r => r.map(c => '"' + c + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'attendance_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
  };

  const att = lastResult?.attendance || {};
  const totalStudents = gallery?.people?.length || 0;
  const presentStudents = Object.values(att).filter((d) => (d.presence_percentage || 0) >= 30 || (d.presence_seconds || 0) >= 10).length;
  const attendanceRate = totalStudents > 0 ? Math.round(presentStudents / totalStudents * 100) : 0;
  const avgAttention = lastResult?.attentiveness?.class_average || 0;

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto animate-fade-in">
      {/* Offline Banner */}
      {offline && lastResult && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 px-4 py-3 flex items-center gap-3">
          <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-300"><strong>Offline Mode</strong> — Showing previously cached data. Start the backend to get live updates.</p>
        </div>
      )}
      {/* Connection Status Bar */}
      <div className={'glass-card p-4 flex items-center justify-between ' + (isConnected ? 'ring-1 ring-emerald-200 dark:ring-emerald-800' : 'ring-1 ring-red-200 dark:ring-red-800')}>
        <div className="flex items-center gap-3">
          <div className={'w-10 h-10 rounded-xl flex items-center justify-center ' + (isConnected ? 'bg-gradient-to-br from-emerald-400 to-teal-500' : 'bg-gradient-to-br from-red-400 to-rose-500')}>
            {isConnected ? <Wifi className="w-5 h-5 text-white" /> : <WifiOff className="w-5 h-5 text-white" />}
          </div>
          <div>
            <p className="font-semibold text-sm text-gray-900 dark:text-white">{isConnected ? 'Connected to Backend' : 'Disconnected'}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{isConnected ? (status.is_processing ? 'Processing ' + status.progress + '%' : 'Ready for analysis') : 'Attempting to reconnect...'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {status.is_processing && (
            <div className="flex items-center gap-3 mr-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
              <div className="w-36 progress-bar h-2">
                <div className="progress-fill bg-gradient-to-r from-primary-400 to-primary-600" style={{ width: status.progress + '%' }} />
              </div>
              <span className="text-xs font-bold text-primary-600 dark:text-primary-400">{status.progress}%</span>
            </div>
          )}
          <button onClick={startProcessing} disabled={status.is_processing || starting}
            className={'btn-primary flex items-center gap-2 ' + (status.is_processing || starting ? 'opacity-50 cursor-not-allowed' : '')}>
            {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {status.is_processing ? 'Processing...' : 'Run Analysis'}
          </button>
          {lastResult && !lastResult.error && (
            <button onClick={downloadCSV} className="btn-secondary flex items-center gap-1.5">
              <Download className="w-4 h-4" /> CSV
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-stagger">
        {[
          { label: 'Total Students', val: totalStudents, icon: Users, gradient: 'from-blue-500 to-cyan-600' },
          { label: 'Present', val: presentStudents, icon: CheckCircle, gradient: 'from-emerald-500 to-teal-600' },
          { label: 'Attendance', val: attendanceRate + '%', icon: Activity, gradient: 'from-violet-500 to-purple-600' },
          { label: 'Avg Attention', val: avgAttention ? Math.round(avgAttention) + '%' : '--', icon: Eye, gradient: 'from-amber-500 to-orange-600' },
        ].map(s => (
          <div key={s.label} className="kpi-card">
            <div className="flex items-center gap-3">
              <div className={'w-10 h-10 rounded-xl bg-gradient-to-br ' + s.gradient + ' flex items-center justify-center shadow-md'}>
                <s.icon className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{s.label}</p>
                <p className="text-xl font-extrabold text-gray-900 dark:text-white">{s.val}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Video Feed */}
        <div className="lg:col-span-2 glass-card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h3 className="section-title">Live Video Feed</h3>
            {status.is_processing ? (
              <span className="flex items-center gap-1.5 bg-gradient-to-r from-red-500 to-rose-600 text-white px-3 py-1 rounded-full text-[10px] font-bold shadow-md">
                <Radio className="w-3 h-3 animate-pulse" />LIVE
              </span>
            ) : (
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">IDLE</span>
            )}
          </div>
          <div className="p-4">
            <div className="relative aspect-video bg-gray-100 dark:bg-gray-800 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700">
              {isConnected ? (
                <img src={API + '/video-stream'} alt="Feed" className="w-full h-full object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                    <VideoOff className="w-8 h-8" />
                  </div>
                  <p className="text-sm font-medium">No feed available</p>
                  <p className="text-xs text-gray-400">Start an analysis to begin streaming</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Activity Log */}
        <div className="glass-card flex flex-col">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h3 className="section-title flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" /> Activity Log
            </h3>
            <button onClick={() => setLog([])} className="text-[10px] font-semibold text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 uppercase tracking-wider transition-colors">Clear</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 max-h-80 space-y-2">
            {log.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs font-medium">No activity yet</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Run an analysis to see events</p>
              </div>
            ) : log.map((l, i) => (
              <div key={i} className="flex items-start gap-2.5 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <div className={'w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ' + (l.type === 'pos' ? 'bg-emerald-500' : l.type === 'err' ? 'bg-red-500' : 'bg-blue-500')} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-700 dark:text-gray-300 break-words font-medium">{l.msg}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{l.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Student Recognition Grid */}
      {gallery && gallery.people.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h3 className="section-title">
              Recognition Results
              <span className="text-xs font-normal text-gray-400 ml-2">
                {presentStudents} present / {totalStudents} total
              </span>
            </h3>
          </div>
          <div className="p-5 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3">
            {gallery.people.map(p => {
              const r = att[p.name];
              const present = r ? ((r.presence_percentage || 0) >= 30 || (r.presence_seconds || 0) >= 10) : false;
              return (
                <div key={p.name} className={'p-3 rounded-2xl text-center border-2 transition-all hover:scale-[1.02] ' + (present ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-300 dark:border-emerald-800 shadow-sm' : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900 shadow-sm')}>
                  <div className={'avatar w-12 h-12 mx-auto mb-2 text-lg bg-gradient-to-br ' + (present ? 'from-emerald-400 to-teal-500' : 'from-red-400 to-rose-500')}>
                    {p.name.charAt(0)}
                  </div>
                  <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">{p.name}</p>
                  <p className={'text-[10px] font-semibold mt-0.5 ' + (present ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>{present ? 'Present' : 'Absent'}</p>
                  {r && <p className="text-[9px] text-gray-400 mt-0.5">{Math.round(r.presence_seconds || 0)}s &middot; {((r.avg_confidence || 0) * 100).toFixed(0)}%</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveAnalytics;
