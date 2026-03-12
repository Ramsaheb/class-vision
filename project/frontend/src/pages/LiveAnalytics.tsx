import React, { useState, useEffect, useCallback } from 'react';
import { VideoOff, Users, Play, Loader2, Wifi, WifiOff, Eye, Clock, CheckCircle, Download } from 'lucide-react';
import { useWebSocket, AttendanceResult } from '../hooks/useBackend';

const API = 'http://localhost:8000';

const LiveAnalytics: React.FC = () => {
  const { status, result, isConnected } = useWebSocket('ws://localhost:8000/ws');
  const [lastResult, setLastResult] = useState<AttendanceResult | null>(null);
  const [gallery, setGallery] = useState<{people: Array<{name: string; image_count: number}>} | null>(null);
  const [starting, setStarting] = useState(false);
  const [log, setLog] = useState<Array<{time: string; msg: string; type: string}>>([]);

  const fetchData = useCallback(async () => {
    try {
      const [lr, gi] = await Promise.all([
        fetch(API + '/last-result').then(r => r.json()),
        fetch(API + '/gallery-info').then(r => r.json()),
      ]);
      if (!lr.error) setLastResult(lr);
      if (!gi.error) setGallery(gi);
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
    <div className="space-y-5 max-w-[1400px] mx-auto">
      {/* status bar */}
      <div className={'flex items-center justify-between rounded-xl p-4 border ' + (isConnected ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800')}>
        <div className="flex items-center gap-3">
          {isConnected ? <Wifi className="w-5 h-5 text-green-600" /> : <WifiOff className="w-5 h-5 text-red-600" />}
          <div>
            <p className="font-medium text-sm text-gray-900 dark:text-white">{isConnected ? 'Connected' : 'Disconnected'}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{isConnected ? (status.is_processing ? 'Processing ' + status.progress + '%' : 'Ready') : 'Retrying...'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status.is_processing && (
            <div className="flex items-center gap-2 mr-2">
              <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
              <div className="w-32 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-purple-600 rounded-full transition-all" style={{ width: status.progress + '%' }} />
              </div>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{status.progress}%</span>
            </div>
          )}
          <button onClick={startProcessing} disabled={status.is_processing || starting}
            className={'px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ' + (status.is_processing || starting ? 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed text-gray-500' : 'bg-purple-600 hover:bg-purple-700 text-white')}>
            {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {status.is_processing ? 'Processing...' : 'Run Analysis'}
          </button>
          {lastResult && !lastResult.error && (
            <button onClick={downloadCSV} className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 flex items-center gap-1">
              <Download className="w-4 h-4" /> CSV
            </button>
          )}
        </div>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Students', val: totalStudents, icon: Users, bg: 'bg-blue-50 dark:bg-blue-900/20', ic: 'text-blue-600' },
          { label: 'Present', val: presentStudents, icon: CheckCircle, bg: 'bg-green-50 dark:bg-green-900/20', ic: 'text-green-600' },
          { label: 'Attendance', val: attendanceRate + '%', icon: Clock, bg: 'bg-purple-50 dark:bg-purple-900/20', ic: 'text-purple-600' },
          { label: 'Avg Attention', val: avgAttention ? Math.round(avgAttention) + '%' : '--', icon: Eye, bg: 'bg-orange-50 dark:bg-orange-900/20', ic: 'text-orange-600' },
        ].map(s => {
          const I = s.icon;
          return (
            <div key={s.label} className="bg-card-light dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
              <div className={'p-2 rounded-lg ' + s.bg}><I className={'w-5 h-5 ' + s.ic} /></div>
              <div>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{s.val}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">{s.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* video */}
        <div className="lg:col-span-2 bg-card-light dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Live Video Feed</h3>
            {status.is_processing ? (
              <span className="flex items-center gap-1 bg-red-600 text-white px-2 py-0.5 rounded text-[10px] font-medium"><span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />LIVE</span>
            ) : (
              <span className="text-[10px] font-medium text-gray-400">IDLE</span>
            )}
          </div>
          <div className="p-4">
            <div className="relative aspect-video bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
              {isConnected ? (
                <img src={API + '/video-stream'} alt="Feed" className="w-full h-full object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400"><VideoOff className="w-12 h-12 mb-2" /><p className="text-sm">No feed available</p></div>
              )}
            </div>
          </div>
        </div>

        {/* activity log */}
        <div className="bg-card-light dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Activity Log</h3>
            <button onClick={() => setLog([])} className="text-[10px] text-gray-400 hover:text-gray-600">Clear</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 max-h-80 space-y-2">
            {log.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-xs"><Clock className="w-6 h-6 mx-auto mb-1 opacity-50" />No activity</div>
            ) : log.map((l, i) => (
              <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded bg-gray-50 dark:bg-gray-800">
                <div className={'w-1.5 h-1.5 mt-1.5 rounded-full flex-shrink-0 ' + (l.type === 'pos' ? 'bg-green-500' : l.type === 'err' ? 'bg-red-500' : 'bg-blue-500')} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-700 dark:text-gray-300 break-words">{l.msg}</p>
                  <p className="text-[10px] text-gray-400">{l.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* student grid */}
      {gallery && gallery.people.length > 0 && (
        <div className="bg-card-light dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              Recognition Results <span className="text-gray-400 font-normal ml-1">({presentStudents} present / {totalStudents} total)</span>
            </h3>
          </div>
          <div className="p-5 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3">
            {gallery.people.map(p => {
              const r = att[p.name];
              const present = r ? ((r.presence_percentage || 0) >= 30 || (r.presence_seconds || 0) >= 10) : false;
              return (
                <div key={p.name} className={'p-3 rounded-lg text-center border-2 transition-all ' + (present ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800')}>
                  <div className={'w-11 h-11 mx-auto mb-1.5 rounded-full flex items-center justify-center text-lg font-bold text-white ' + (present ? 'bg-green-500' : 'bg-red-400')}>
                    {p.name.charAt(0)}
                  </div>
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{p.name}</p>
                  <p className={'text-[10px] font-medium ' + (present ? 'text-green-600' : 'text-red-500')}>{present ? 'Present' : 'Absent'}</p>
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
