export type CotPresetTarget = 'line' | 'offline' | 'group';

export interface CotPreset {
  id: string;
  title: string;
  tag: string;
  description: string;
  template: string;
  exampleThinking: string;
  targets: CotPresetTarget[];
  createdAt: string;
  updatedAt: string;
}

const KEY = 'line:cot-presets';

export const DEFAULT_COT_PRESETS: CotPreset[] = [
  {
    id: 'cot-1',
    title: '深度心理侧写与情感博弈预设',
    tag: '<think>...</think>',
    description: '分析潜台词、心理防御与情感策略。',
    template: '在每次发言前，分析当前情境、角色真实欲念、关系阶段与台词策略；只将最终角色消息输出给用户。',
    exampleThinking: '分析潜台词 → 判断关系状态 → 决定情绪暴露尺度 → 形成自然回复。',
    targets: ['line', 'offline', 'group'],
    createdAt: '2026-10-04T00:00:00.000Z',
    updatedAt: '2026-10-04T00:00:00.000Z',
  },
  {
    id: 'cot-2',
    title: '潜意识与微反应',
    tag: '<thought>...</thought>',
    description: '关注视线、停顿、呼吸与无意识动作。',
    template: '在生成角色回复前，结合当前情境推断角色最自然的潜意识反应与微小行为，再决定克制或表达。',
    exampleThinking: '观察刺激点 → 第一反应 → 理性修正 → 自然表达。',
    targets: ['line', 'offline'],
    createdAt: '2026-10-04T00:00:00.000Z',
    updatedAt: '2026-10-04T00:00:00.000Z',
  },
  {
    id: 'cot-3',
    title: '克制隐忍暗涌',
    tag: '<think>...</think>',
    description: '适合冷淡、克制、高岭之花类型角色。',
    template: '保持角色外在克制，重点判断理智防线、微妙动摇与没有说出口的情绪。',
    exampleThinking: '刺激点 → 防御 → 裂痕 → 克制后的表达。',
    targets: ['line', 'offline'],
    createdAt: '2026-10-04T00:00:00.000Z',
    updatedAt: '2026-10-04T00:00:00.000Z',
  },
  {
    id: 'cot-4',
    title: '甜蜜宠溺与偏爱',
    tag: '<think>...</think>',
    description: '以偏爱、治愈和保护感为核心。',
    template: '优先考虑角色如何自然表达关心、偏爱与安全感，但不能替用户决定行动或情绪。',
    exampleThinking: '感受用户状态 → 判断需要的陪伴 → 用角色自己的方式表达。',
    targets: ['line', 'offline'],
    createdAt: '2026-10-04T00:00:00.000Z',
    updatedAt: '2026-10-04T00:00:00.000Z',
  },
];

export function getCotPresets(): CotPreset[] {
  if (typeof window === 'undefined') return DEFAULT_COT_PRESETS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      localStorage.setItem(KEY, JSON.stringify(DEFAULT_COT_PRESETS));
      return DEFAULT_COT_PRESETS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_COT_PRESETS;
  } catch {
    return DEFAULT_COT_PRESETS;
  }
}

export function saveCotPresets(presets: CotPreset[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(presets));
  window.dispatchEvent(new CustomEvent('sane333:cot-presets-changed'));
}

export function exportCotPresets(presets = getCotPresets()): string {
  return JSON.stringify({ type: 'sane333-cot-presets', version: 1, exportedAt: new Date().toISOString(), presets }, null, 2);
}

export function importCotPresets(raw: string): CotPreset[] {
  const parsed = JSON.parse(raw);
  const incoming = Array.isArray(parsed) ? parsed : parsed?.presets;
  if (!Array.isArray(incoming)) throw new Error('不是有效的思维链预设文件。');
  return incoming.map((item: any, index: number) => ({
    ...item,
    id: String(item.id || `cot-import-${Date.now()}-${index}`),
    title: String(item.title || '未命名思维链预设'),
    tag: String(item.tag || '<think>...</think>'),
    description: String(item.description || ''),
    template: String(item.template || ''),
    exampleThinking: String(item.exampleThinking || ''),
    targets: Array.isArray(item.targets) ? item.targets : ['line'],
    createdAt: String(item.createdAt || new Date().toISOString()),
    updatedAt: new Date().toISOString(),
  })) as CotPreset[];
}

export type CotAssignments = Partial<Record<CotPresetTarget, string>>;
const ASSIGN_KEY = 'line:cot-assignments';
export function getCotAssignments(): CotAssignments { if (typeof window === 'undefined') return {}; try { return JSON.parse(window.localStorage.getItem(ASSIGN_KEY) || '{}'); } catch { return {}; } }
export function saveCotAssignment(target: CotPresetTarget, presetId: string) { if (typeof window === 'undefined') return; const next={...getCotAssignments(),[target]:presetId}; window.localStorage.setItem(ASSIGN_KEY,JSON.stringify(next)); window.dispatchEvent(new CustomEvent('sane333:cot-assignments-changed')); }
export function getCotForTarget(target: CotPresetTarget): CotPreset | null {
  const presets = getCotPresets();
  const assignedId = getCotAssignments()[target];
  return presets.find(item => item.id === assignedId)
    || presets.find(item => item.targets.includes(target))
    || (target === 'group' ? presets.find(item => item.targets.includes('line')) || null : null);
}
