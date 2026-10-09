export type PromptPresetScope = 'single' | 'group' | 'offline';
type Entry = { id?: string; name?: string; content?: string; enabled?: boolean; role?: string; position?: string; order?: number };
type Preset = { id: string; name: string; desc?: string; scope: PromptPresetScope; isDefault?: boolean; entries?: Entry[] };
type Libraries = Record<PromptPresetScope, Preset[]>;
const LIBRARIES_KEY = 'phone:preset-studio-v1';
const ACTIVE_KEY = 'phone:preset-active-v1';
const FALLBACK: Record<PromptPresetScope, string> = { single: '遵守角色卡与事实，结合上下文自然回应，不替用户编造台词、行动、想法或感受。', group: '保持群成员声音独立，自然决定谁接话，不替用户编造发言、行动或想法。', offline: '保持场景与事件连续，只描写角色和环境，为用户留下回应空间。' };
export function getActivePromptPreset(scope: PromptPresetScope): Preset | null {
 if (typeof window === 'undefined') return null;
 try { const lib = JSON.parse(localStorage.getItem(LIBRARIES_KEY) || 'null') as Libraries | null; const list = lib?.[scope]; if (!Array.isArray(list) || !list.length) return null; const active = JSON.parse(localStorage.getItem(ACTIVE_KEY) || '{}') as Partial<Record<PromptPresetScope,string>>; return list.find(p => p.id === active[scope]) || list.find(p => p.isDefault) || list[0] || null; } catch { return null; }
}
export function buildPromptPresetInstructions(scope: PromptPresetScope): string {
 const preset = getActivePromptPreset(scope); if (!preset) return '【预设 App】\n' + FALLBACK[scope];
 const pos: Record<string,string> = { before_main:'主要规则前', after_main:'主要规则后', before_history:'历史记录前', after_history:'历史记录后', in_history:'历史记录内', post_history:'历史记录后置' };
 const entries = [...(preset.entries || [])].filter(e => e.enabled !== false && String(e.content || '').trim()).sort((a,b) => Number(a.order || 0) - Number(b.order || 0));
 return ['【预设 App · 当前生效】','分类：' + scope,'预设：' + preset.name,preset.desc || '',...entries.map((e,i) => '['+(i+1)+'] '+(e.name || '规则')+'（'+(pos[e.position || 'after_main'] || '主要规则后')+'；角色：'+(e.role || 'system')+'）\n'+String(e.content || '').trim())].filter(Boolean).join('\n\n');
}
