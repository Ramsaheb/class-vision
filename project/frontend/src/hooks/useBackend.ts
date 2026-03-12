import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Local Storage Cache Helpers ──────────────────────────────
const CACHE_PREFIX = 'coris_cache_';

function cacheKey(endpoint: string): string {
  return CACHE_PREFIX + endpoint.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function saveToCache(endpoint: string, data: unknown): void {
  try {
    localStorage.setItem(cacheKey(endpoint), JSON.stringify({ data, ts: Date.now() }));
  } catch { /* quota exceeded – ignore */ }
}

function loadFromCache<T = unknown>(endpoint: string): T | null {
  try {
    const raw = localStorage.getItem(cacheKey(endpoint));
    if (!raw) return null;
    return (JSON.parse(raw) as { data: T }).data;
  } catch { return null; }
}

// ─── Static Snapshot Fallback ─────────────────────────────────
// Maps API endpoint keys to static JSON files exported by the backend.
const SNAPSHOT_MAP: Record<string, string> = {
  '/student-insights': '/data/student-insights.json',
  '/sessions': '/data/sessions.json',
  '/last-result': '/data/last-result.json',
  '/gallery-info': '/data/gallery-info.json',
  '/dashboard-data': '/data/dashboard-data.json',
};

// Dynamic routes: /session/{id} → /data/session-{id}.json  etc.
function resolveSnapshotFile(key: string): string | null {
  // Exact match first
  if (SNAPSHOT_MAP[key]) return SNAPSHOT_MAP[key];
  // /session/5 → /data/session-5.json
  const sessionMatch = key.match(/^\/session\/(\d+)$/);
  if (sessionMatch) return `/data/session-${sessionMatch[1]}.json`;
  // /student-history/Name → /data/student-history-Name.json
  const historyMatch = key.match(/^\/student-history\/(.+)$/);
  if (historyMatch) return `/data/student-history-${decodeURIComponent(historyMatch[1])}.json`;
  return null;
}

async function loadFromSnapshot<T>(key: string): Promise<T | null> {
  const file = resolveSnapshotFile(key);
  if (!file) return null;
  try {
    const res = await fetch(file);
    if (!res.ok) return null;
    const data = (await res.json()) as T;
    // Seed localStorage so future loads are instant
    saveToCache(key, data);
    return data;
  } catch { return null; }
}

/**
 * Fetch with automatic localStorage caching + static snapshot fallback.
 * 1. Try live API
 * 2. Fall back to localStorage cache
 * 3. Fall back to static /data/*.json snapshot (exported after each backend run)
 * Returns { data, offline } so pages can show a banner.
 */
export async function cachedFetch<T = unknown>(
  url: string,
  endpoint?: string,
): Promise<{ data: T | null; offline: boolean }> {
  let key: string;
  try { key = endpoint || new URL(url).pathname; }
  catch { key = endpoint || url.replace(/^https?:\/\/[^/]+/, ''); }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as T;
    saveToCache(key, data);
    return { data, offline: false };
  } catch {
    // Tier 2: localStorage
    const cached = loadFromCache<T>(key);
    if (cached) return { data: cached, offline: true };
    // Tier 3: static snapshot file
    const snapshot = await loadFromSnapshot<T>(key);
    return { data: snapshot, offline: true };
  }
}

// ─── Interfaces ───────────────────────────────────────────────
export interface ProcessingStatus {
  is_processing: boolean;
  progress: number;
  message: string;
}

export interface AttendanceResult {
  error?: string;
  timestamp?: string;
  summary?: {
    total_people: number;
    present_people: number;
    absent_people: number;
    attendance_rate: number;
  };
  attendance?: Record<string, {
    presence_seconds: number;
    presence_percentage?: number;
    avg_confidence: number;
    present: boolean;
    num_tracks: number;
    detection_sources: string[];
  }>;
  attentiveness?: {
    class_average: number;
    focus_score: number;
    individual_scores?: Record<string, {
      attention_pct: number;
      state: string;
      gaze_score: number;
    }>;
  };
  recognition_stats?: Record<string, number>;
  recognition_chart_data?: Array<{name: string; value: number; color: string}>;
  unknown_reasons_chart?: Array<{reason: string; count: number}>;
  cache_info?: {
    gallery_cached: boolean;
    gallery_people_count: number;
    gallery_size_mb: number;
  };
}

export const useWebSocket = (url: string) => {
  const [status, setStatus] = useState<ProcessingStatus>({
    is_processing: false,
    progress: 0,
    message: 'Ready'
  });
  const [result, setResult] = useState<AttendanceResult | null>(() => {
    // Load cached result on init (offline support)
    return loadFromCache<AttendanceResult>('ws_result');
  });
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number>();

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        console.log('WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'status_update') {
            setStatus(message.data);
          } else if (message.type === 'result_update') {
            setResult(message.data);
            // Cache result for offline access
            saveToCache('ws_result', message.data);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        console.log('WebSocket disconnected');
        
        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      // Retry connection after 3 seconds
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    }
  }, [url]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [url, connect]);

  return { status, result, isConnected };
};

export const useApi = (baseUrl: string) => {
  const startProcessing = useCallback(async (options: {
    gallery_dir?: string;
    video_path?: string;
    output_video?: string;
    use_cache?: boolean;
    clear_cache?: boolean;
  } = {}) => {
    try {
      const response = await fetch(`${baseUrl}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          use_cache: true,
          clear_cache: false,
          ...options
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error starting processing:', error);
      throw error;
    }
  }, [baseUrl]);

  const getLastResult = useCallback(async () => {
    try {
      const response = await fetch(`${baseUrl}/last-result`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching last result:', error);
      throw error;
    }
  }, [baseUrl]);

  const getCacheInfo = useCallback(async () => {
    try {
      const response = await fetch(`${baseUrl}/cache-info`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching cache info:', error);
      throw error;
    }
  }, [baseUrl]);

  const clearCache = useCallback(async () => {
    try {
      const response = await fetch(`${baseUrl}/clear-cache`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error clearing cache:', error);
      throw error;
    }
  }, [baseUrl]);

  const getGalleryInfo = useCallback(async () => {
    try {
      const response = await fetch(`${baseUrl}/gallery-info`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching gallery info:', error);
      throw error;
    }
  }, [baseUrl]);

  // Database API endpoints
  const getDashboardData = useCallback(async () => {
    try {
      const response = await fetch(`${baseUrl}/dashboard-data`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      throw error;
    }
  }, [baseUrl]);

  const getStudents = useCallback(async () => {
    try {
      const response = await fetch(`${baseUrl}/students`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching students:', error);
      throw error;
    }
  }, [baseUrl]);

  const getStudent = useCallback(async (studentName: string) => {
    try {
      const response = await fetch(`${baseUrl}/student/${encodeURIComponent(studentName)}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching student:', error);
      throw error;
    }
  }, [baseUrl]);

  const getSessions = useCallback(async () => {
    try {
      const response = await fetch(`${baseUrl}/sessions`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching sessions:', error);
      throw error;
    }
  }, [baseUrl]);

  const getSession = useCallback(async (sessionId: number) => {
    try {
      const response = await fetch(`${baseUrl}/session/${sessionId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching session:', error);
      throw error;
    }
  }, [baseUrl]);

  const getDatabaseStatus = useCallback(async () => {
    try {
      const response = await fetch(`${baseUrl}/database-status`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching database status:', error);
      throw error;
    }
  }, [baseUrl]);

  const getAttentivenessConfig = useCallback(async () => {
    try {
      const response = await fetch(`${baseUrl}/attentiveness-config`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching attentiveness config:', error);
      throw error;
    }
  }, [baseUrl]);

  const syncStudents = useCallback(async () => {
    try {
      const response = await fetch(`${baseUrl}/sync-students`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error syncing students:', error);
      throw error;
    }
  }, [baseUrl]);

  const startEnhancedProcessing = useCallback(async (options: {
    gallery_dir?: string;
    video_path?: string;
    output_video?: string;
    enable_attentiveness?: boolean;
    enable_pose?: boolean;
    enable_gaze?: boolean;
    use_cache?: boolean;
    clear_cache?: boolean;
  } = {}) => {
    try {
      const response = await fetch(`${baseUrl}/process-enhanced`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enable_attentiveness: true,
          enable_pose: true,
          enable_gaze: true,
          use_cache: true,
          clear_cache: false,
          ...options
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error starting enhanced processing:', error);
      throw error;
    }
  }, [baseUrl]);

  const getEnhancedResults = useCallback(async () => {
    try {
      const response = await fetch(`${baseUrl}/enhanced-results`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching enhanced results:', error);
      throw error;
    }
  }, [baseUrl]);

  const getStudentInsights = useCallback(async () => {
    try {
      const response = await fetch(`${baseUrl}/student-insights`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching student insights:', error);
      throw error;
    }
  }, [baseUrl]);

  const getStudentHistory = useCallback(async (studentName: string) => {
    try {
      const response = await fetch(`${baseUrl}/student-history/${encodeURIComponent(studentName)}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching student history:', error);
      throw error;
    }
  }, [baseUrl]);

  const deleteSession = useCallback(async (sessionId: number) => {
    try {
      const response = await fetch(`${baseUrl}/session/${sessionId}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error deleting session:', error);
      throw error;
    }
  }, [baseUrl]);

  const deleteAllSessions = useCallback(async () => {
    try {
      const response = await fetch(`${baseUrl}/sessions/all`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error deleting all sessions:', error);
      throw error;
    }
  }, [baseUrl]);

  return {
    startProcessing,
    getLastResult,
    getCacheInfo,
    clearCache,
    getGalleryInfo,
    getDashboardData,
    getStudents,
    getStudent,
    getSessions,
    getSession,
    getDatabaseStatus,
    getAttentivenessConfig,
    syncStudents,
    startEnhancedProcessing,
    getEnhancedResults,
    getStudentInsights,
    getStudentHistory,
    deleteSession,
    deleteAllSessions,
  };
};