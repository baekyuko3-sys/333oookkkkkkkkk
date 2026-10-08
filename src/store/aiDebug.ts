export type AiDebugLevel = 'info' | 'success' | 'error';
export interface AiDebugEntry {
  id: string; time: string; level: AiDebugLevel; event: string; message: string;
  provider?: string; model?: string; durationMs?: number; meta?: Record<string, unknown>;
}
const KEY='phone:ai-debug-log';
export function readAiDebugLog(): AiDebugEntry[] {
  if(typeof window==='undefined') return [];
  try { const v=JSON.parse(localStorage.getItem(KEY)||'[]'); return Array.isArray(v)?v:[]; } catch { return []; }
}
export function pushAiDebugLog(entry: Omit<AiDebugEntry,'id'|'time'>) {
  if(typeof window==='undefined') return;
  const next=[{...entry,id:'dbg-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),time:new Date().toISOString()},...readAiDebugLog()].slice(0,100);
  localStorage.setItem(KEY,JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('sane333:ai-debug-changed'));
}
export interface AiDebugTrace {
  id: string;
  time: string;
  durationMs?: number;
  provider?: string;
  model?: string;
  context?: Record<string, unknown>;
  switches?: Record<string, unknown>;
  request?: { system?: string; messages?: unknown[]; payload?: unknown };
  rawResponse?: string;
  parsed?: Record<string, unknown>;
  final?: Record<string, unknown>;
  error?: { message: string; stack?: string };
}
const TRACE_KEY='phone:ai-debug-trace';
const traceKey = (conversationId?: string) => conversationId ? `${TRACE_KEY}:${conversationId}` : TRACE_KEY;
export function readAiDebugTrace(conversationId?: string): AiDebugTrace | null {
  if(typeof window==='undefined') return null;
  try {
    const key = traceKey(conversationId);
    const v=JSON.parse(localStorage.getItem(key)||'null');
    if(v&&typeof v==='object') return v;
    if(conversationId) {
      const latest=JSON.parse(localStorage.getItem(TRACE_KEY)||'null');
      if(latest && typeof latest==='object' && String(latest.context?.conversationId || '') === conversationId) return latest;
    }
    return null;
  } catch { return null; }
}
export function writeAiDebugTrace(trace: Omit<AiDebugTrace,'id'|'time'> & Partial<Pick<AiDebugTrace,'id'|'time'>>) {
  if(typeof window==='undefined') return;
  const conversationId = String(trace.context?.conversationId || '');
  const value = {...trace,id:trace.id||'trace-'+Date.now(),time:trace.time||new Date().toISOString()};
  localStorage.setItem(traceKey(conversationId || undefined),JSON.stringify(value));
  // Also keep one global "latest" pointer. The chat UI will only use it when the
  // stored conversation id matches, which protects against legacy chat ids changing.
  localStorage.setItem(TRACE_KEY,JSON.stringify(value));
  window.dispatchEvent(new CustomEvent('sane333:ai-debug-trace-changed',{detail:{conversationId}}));
}
export function clearAiDebugLog(){ if(typeof window!=='undefined'){localStorage.removeItem(KEY);localStorage.removeItem(TRACE_KEY); Object.keys(localStorage).filter(k=>k.startsWith(TRACE_KEY+':')).forEach(k=>localStorage.removeItem(k));window.dispatchEvent(new CustomEvent('sane333:ai-debug-changed'));window.dispatchEvent(new CustomEvent('sane333:ai-debug-trace-changed'));} }
