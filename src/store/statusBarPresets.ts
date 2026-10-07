export type StatusBarTarget = 'line' | 'offline' | 'character-profile' | 'moments' | 'threads';

export interface StatusBarPreset {
  id: string;
  name: string;
  description: string;
  html: string;
  regex: string;
  targets: StatusBarTarget[];
  createdAt: string;
  updatedAt: string;
}

const KEY = 'line:status-bar-presets';

export const DEFAULT_STATUS_BAR_PRESETS: StatusBarPreset[] = [
  {
    id: 'status-minimal',
    name: '极简日常',
    description: '轻量地点、时间与当前状态。',
    html: '<div class="sane-status"><div class="sane-status__line"><span>📍 {{location}}</span><span>·</span><span>{{time}}</span></div><div class="sane-status__activity">{{activity}}</div><div class="sane-status__mood">{{mood}}</div></div>',
    regex: '/\\{\\{status:(.*?)\\}\\}/gs',
    targets: ['line', 'offline', 'character-profile'],
    createdAt: '2026-10-04T00:00:00.000Z',
    updatedAt: '2026-10-04T00:00:00.000Z',
  },
  {
    id: 'status-romance',
    name: '关系记录',
    description: '适合恋爱 / 羁绊剧情的轻量状态卡。',
    html: '<article class="sane-status romance"><div class="sane-status__title">{{location}}</div><div class="sane-status__meta">{{time}} · {{activity}}</div><div class="sane-status__mood">{{mood}}</div><div class="sane-status__favor">♡ {{favor}}</div></article>',
    regex: '/\\{\\{status:(.*?)\\}\\}/gs',
    targets: ['line', 'offline'],
    createdAt: '2026-10-04T00:00:00.000Z',
    updatedAt: '2026-10-04T00:00:00.000Z',
  },
];

export function getStatusBarPresets(): StatusBarPreset[] {
  if (typeof window === 'undefined') return DEFAULT_STATUS_BAR_PRESETS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      localStorage.setItem(KEY, JSON.stringify(DEFAULT_STATUS_BAR_PRESETS));
      return DEFAULT_STATUS_BAR_PRESETS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_STATUS_BAR_PRESETS;
  } catch {
    return DEFAULT_STATUS_BAR_PRESETS;
  }
}

export function saveStatusBarPresets(presets: StatusBarPreset[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(presets));
  window.dispatchEvent(new CustomEvent('sane333:status-bar-presets-changed'));
}

export function upsertStatusBarPreset(preset: StatusBarPreset) {
  const presets = getStatusBarPresets();
  saveStatusBarPresets(presets.some(item => item.id === preset.id)
    ? presets.map(item => item.id === preset.id ? preset : item)
    : [preset, ...presets]);
}

export function deleteStatusBarPreset(id: string) {
  saveStatusBarPresets(getStatusBarPresets().filter(item => item.id !== id));
}

export function exportStatusBarPresets(presets = getStatusBarPresets()): string {
  return JSON.stringify({ type: 'sane333-status-bar-presets', version: 1, exportedAt: new Date().toISOString(), presets }, null, 2);
}

export function importStatusBarPresets(raw: string): StatusBarPreset[] {
  const parsed = JSON.parse(raw);
  const incoming = Array.isArray(parsed) ? parsed : parsed?.presets;
  if (!Array.isArray(incoming)) throw new Error('不是有效的状态栏预设文件。');
  const normalized = incoming.map((item: any, index: number) => ({
    ...item,
    id: String(item.id || `status-import-${Date.now()}-${index}`),
    name: String(item.name || '未命名状态栏'),
    description: String(item.description || ''),
    html: String(item.html || ''),
    regex: String(item.regex || '/\\\\{\\\\{status:(.*?)\\\\}\\\\}/gs'),
    targets: Array.isArray(item.targets) ? item.targets : ['line'],
    createdAt: String(item.createdAt || new Date().toISOString()),
    updatedAt: new Date().toISOString(),
  })) as StatusBarPreset[];
  return normalized;
}



function parseRegex(source: string): RegExp | null {
  const raw = String(source || '').trim();
  if (!raw) return null;
  try {
    if (raw.startsWith('/') && raw.lastIndexOf('/') > 0) {
      const end = raw.lastIndexOf('/');
      return new RegExp(raw.slice(1, end), raw.slice(end + 1));
    }
    return new RegExp(raw, 'gs');
  } catch {
    return null;
  }
}

export function extractStatusMatch(text: string, regexSource: string): { match: string; captures: string[]; groups: Record<string,string> } | null {
  const regex = parseRegex(regexSource);
  if (!regex) return null;
  regex.lastIndex = 0;
  const match = regex.exec(String(text || ''));
  if (!match) return null;
  return {
    match: match[0] || '',
    captures: match.slice(1).map(value => String(value ?? '')),
    groups: Object.fromEntries(Object.entries(match.groups || {}).map(([key, value]) => [key, String(value ?? '')])),
  };
}

export function renderStatusBarHtml(
  preset: StatusBarPreset | null,
  sourceText: string,
  fallbackValues: Record<string,string> = {},
): string {
  if (!preset) return '';
  const extracted = extractStatusMatch(sourceText, preset.regex);
  const values: Record<string,string> = { ...fallbackValues };
  extracted?.captures.forEach((value, index) => { values[String(index + 1)] = value; });
  Object.assign(values, extracted?.groups || {});
  values.match = extracted?.match || '';
  let html = String(preset.html || '');
  html = html.replace(/\{\{match\}\}/g, values.match || '');
  html = html.replace(/\{\{([\w-]+)\}\}/g, (_, key: string) => values[key] ?? '');
  html = html.replace(/\$(\d+)/g, (_, index: string) => values[index] ?? '');
  return html;
}

export interface StatusBarSnapshot {
  id: string;
  presetId: string;
  presetName: string;
  html: string;
  sourceMessageId: string | number;
  sourceText: string;
  createdAt: string;
}

export type StatusBarAssignments = Partial<Record<StatusBarTarget, string>>;
const ASSIGN_KEY = 'line:status-bar-assignments';
export function getStatusBarAssignments(): StatusBarAssignments { if (typeof window === 'undefined') return {}; try { return JSON.parse(window.localStorage.getItem(ASSIGN_KEY) || '{}'); } catch { return {}; } }
export function saveStatusBarAssignment(target: StatusBarTarget, presetId: string) { if (typeof window === 'undefined') return; const next={...getStatusBarAssignments(),[target]:presetId}; window.localStorage.setItem(ASSIGN_KEY,JSON.stringify(next)); window.dispatchEvent(new CustomEvent('sane333:status-bar-assignments-changed')); }
export function getStatusBarForTarget(target: StatusBarTarget): StatusBarPreset | null { const id=getStatusBarAssignments()[target]; return getStatusBarPresets().find(item=>item.id===id) || getStatusBarPresets().find(item=>item.targets.includes(target)) || null; }
