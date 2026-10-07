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
    title: 'SANE333 角色决策链',
    tag: '<think>...</think>',
    description: '以角色本人为中心，结合前文、设定、人设与状态决定自然回复。',
    template: 'STEP 1 CONTEXT: 当前消息 + 角色上一条回复 + 最近前文 + 当前话题 + 未完成事项。\\nSTEP 2 CHARACTER: 角色设定 + 线上人设 + 表达习惯，只使用角色已知信息。\\nSTEP 3 MEANING: 判断用户表面意思与真实意图，不脱离上下文，不过度脑补。\\nSTEP 4 REACTION: 站在角色立场理解，判断当前状态与第一反应。\\nSTEP 5 RESPONSE: 角色自行决定回答、反问、调侃、安慰、延伸、简短回应或不展开，不强制主动。\\nSTEP 6 STATE BAR: 如果状态栏已启用，每次角色回复后都必须生成一次状态栏；根据当前聊天、前文与角色已知状态生成最新快照。没有变化就自然延续上一状态，有变化就更新；不得凭空创造状态或剧情。\\nSTEP 7 CHECK: 检查角色一致性、前文连续性、知识边界、OOC、禁止事项，以及是否替用户决定行为、想法或反应。\\nFINAL: 只输出角色真正会发送的 LINE 消息，不输出内部分析。',
    exampleThinking: '前文 → 角色设定 → 用户意思 → 角色反应 → 回复决定 → 状态栏 → 连续性/OOC检查。',
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
    if (!Array.isArray(parsed)) return DEFAULT_COT_PRESETS;
    const defaultsById = new Map(DEFAULT_COT_PRESETS.map(item => [item.id, item]));
    return parsed.map((item: CotPreset) => {
      if (item?.id !== 'cot-1' || item.title === 'SANE333 角色决策链') return item;
      return { ...defaultsById.get('cot-1'), ...item, title: DEFAULT_COT_PRESETS[0].title, description: DEFAULT_COT_PRESETS[0].description, template: DEFAULT_COT_PRESETS[0].template, exampleThinking: DEFAULT_COT_PRESETS[0].exampleThinking };
    });
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
