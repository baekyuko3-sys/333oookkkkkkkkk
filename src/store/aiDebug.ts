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
export function clearAiDebugLog(){ if(typeof window!=='undefined'){localStorage.removeItem(KEY);window.dispatchEvent(new CustomEvent('sane333:ai-debug-changed'));} }
