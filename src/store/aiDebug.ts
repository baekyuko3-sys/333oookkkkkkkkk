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
export function readAiDebugTrace(): AiDebugTrace | null {
  if(typeof window==='undefined') return null;
  try { const v=JSON.parse(localStorage.getItem(TRACE_KEY)||'null'); return v&&typeof v==='object'?v:null; } catch { return null; }
}
export function writeAiDebugTrace(trace: Omit<AiDebugTrace,'id'|'time'> & Partial<Pick<AiDebugTrace,'id'|'time'>>) {
  if(typeof window==='undefined') return;
  localStorage.setItem(TRACE_KEY,JSON.stringify({...trace,id:trace.id||'trace-'+Date.now(),time:trace.time||new Date().toISOString()}));
  window.dispatchEvent(new CustomEvent('sane333:ai-debug-trace-changed'));
}
export function clearAiDebugLog(){ if(typeof window!=='undefined'){localStorage.removeItem(KEY);localStorage.removeItem(TRACE_KEY);window.dispatchEvent(new CustomEvent('sane333:ai-debug-changed'));window.dispatchEvent(new CustomEvent('sane333:ai-debug-trace-changed'));} }
