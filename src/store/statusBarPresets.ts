export type StatusBarTarget = 'line' | 'offline' | 'character-profile' | 'moments' | 'threads';

export interface StatusBarPreset {
  id: string;
  name: string;
  description: string;
  html: string;
  inputFormat: string;
  promptSuffix: string;
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
    inputFormat: '{{status:地点｜时间｜活动｜心情}}',
    promptSuffix: '请在回复最后严格按照以下文字输入格式输出状态栏，不要添加解释：{{status:地点｜时间｜活动｜心情}}',
    regex: '/\\{\\{status:([^｜}]+)｜([^｜}]+)｜([^｜}]+)｜([^}]+)\\}\\}/gs',
    targets: ['line', 'offline', 'character-profile'],
    createdAt: '2026-10-04T00:00:00.000Z',
    updatedAt: '2026-10-04T00:00:00.000Z',
  },
  {
    id: 'status-romance',
    name: '关系记录',
    description: '适合恋爱 / 羁绊剧情的轻量状态卡。',
    html: '<article class="sane-status romance"><div class="sane-status__title">{{location}}</div><div class="sane-status__meta">{{time}} · {{activity}}</div><div class="sane-status__mood">{{mood}}</div><div class="sane-status__favor">♡ {{favor}}</div></article>',
    inputFormat: '{{status:地点｜时间｜活动｜心情｜好感度}}',
    promptSuffix: '请在回复最后严格按照以下文字输入格式输出状态栏，不要添加解释：{{status:地点｜时间｜活动｜心情｜好感度}}',
    regex: '/\\{\\{status:([^｜}]+)｜([^｜}]+)｜([^｜}]+)｜([^｜}]+)\\}\\}/gs',
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
    if (!Array.isArray(parsed)) return DEFAULT_STATUS_BAR_PRESETS;
    const defaultsById = new Map(DEFAULT_STATUS_BAR_PRESETS.map(item => [item.id, item]));
    return parsed.map(item => defaultsById.has(item?.id) ? { ...defaultsById.get(item.id)!, ...item, regex: defaultsById.get(item.id)!.regex, inputFormat: defaultsById.get(item.id)!.inputFormat, html: defaultsById.get(item.id)!.html, promptSuffix: defaultsById.get(item.id)!.promptSuffix } : item);
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

function toExternalStatusBarPreset(preset: StatusBarPreset) {
  return {
    id: preset.id,
    name: preset.name,
    promptSuffix: preset.promptSuffix,
    regexPattern: preset.regex,
    replacePattern: preset.html,
  };
}

export function exportStatusBarPreset(preset: StatusBarPreset): string {
  return JSON.stringify(toExternalStatusBarPreset(preset), null, 2);
}

export function exportStatusBarPresets(presets = getStatusBarPresets()): string {
  return JSON.stringify(presets.map(toExternalStatusBarPreset), null, 2);
}

export function importStatusBarPresets(raw: string): StatusBarPreset[] {
  const parsed = JSON.parse(raw);
  // Accept the exact POME/Tavern-style single object, an array of those objects,
  // and our older wrapped { presets: [...] } format.
  const incoming = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.presets)
      ? parsed.presets
      : parsed && typeof parsed === 'object'
        ? [parsed]
        : [];
  if (!incoming.length) throw new Error('不是有效的状态栏预设文件。');

  const normalized = incoming.map((item: any, index: number) => {
    const regex = item.regexPattern ?? item.regex ?? '';
    const html = item.replacePattern ?? item.html ?? '';
    return {
      id: String(item.id || `status-import-${Date.now()}-${index}`),
      name: String(item.name || '未命名状态栏'),
      description: String(item.description || ''),
      html: String(html),
      inputFormat: String(item.inputFormat || ''),
      promptSuffix: String(item.promptSuffix || ''),
      regex: String(regex),
      targets: Array.isArray(item.targets) ? item.targets : ['line'],
      createdAt: String(item.createdAt || new Date().toISOString()),
      updatedAt: new Date().toISOString(),
    };
  }) as StatusBarPreset[];
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
  const input = String(text || '').trim();
  const match = regex.exec(input);
  if (!match) return null;
  return {
    match: match[0] || '',
    captures: match.slice(1).map(value => String(value ?? '')),
    groups: Object.fromEntries(Object.entries(match.groups || {}).map(([key, value]) => [key, String(value ?? '')])),
  };
}

export function sanitizeHtmlFragment(html: string): string {
  if (typeof window === 'undefined') return '';
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  template.content.querySelectorAll('script,iframe,object,embed,form,style,link,meta').forEach(node => node.remove());
  template.content.querySelectorAll('*').forEach(node => {
    Array.from(node.attributes).forEach(attribute => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc' || ((name === 'href' || name === 'src') && value.startsWith('javascript:'))) {
        node.removeAttribute(attribute.name);
      }
    });
  });
  return template.innerHTML.trim();
}

export function renderStatusBarHtml(
  preset: StatusBarPreset | null,
  sourceText: string,
  fallbackValues: Record<string,string> = {},
): string {
  if (!preset) return '';
  const extracted = extractStatusMatch(sourceText, preset.regex);
  if (!extracted) return '';
  const values: Record<string,string> = { ...fallbackValues };
  extracted?.captures.forEach((value, index) => { values[String(index + 1)] = value; });
  Object.assign(values, extracted?.groups || {});
  values.match = extracted?.match || '';
  let html = String(preset.html || '');
  html = html.replace(/\{\{match\}\}/g, values.match || '');
  html = html.replace(/\{\{([\w-]+)\}\}/g, (_, key: string) => { const aliases: Record<string, string> = { location: '1', time: '2', activity: '3', mood: '4', favor: '5' }; return values[key] ?? (aliases[key] ? values[aliases[key]] : '') ?? ''; });
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

const HISTORY_KEY_PREFIX = 'line:status-bar-history:';
const RANDOM_KEY_PREFIX = 'line:status-bar-random:';

export function getStatusBarHistory(conversationId: string): StatusBarSnapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HISTORY_KEY_PREFIX + conversationId) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function saveStatusBarHistory(conversationId: string, history: StatusBarSnapshot[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(HISTORY_KEY_PREFIX + conversationId, JSON.stringify(history.slice(-100)));
  window.dispatchEvent(new CustomEvent('sane333:status-bar-history-changed', { detail: { conversationId } }));
}

export function appendStatusBarSnapshot(conversationId: string, snapshot: StatusBarSnapshot) {
  saveStatusBarHistory(conversationId, [...getStatusBarHistory(conversationId), snapshot]);
}

export function deleteStatusBarSnapshot(conversationId: string, snapshotId: string) {
  saveStatusBarHistory(conversationId, getStatusBarHistory(conversationId).filter(item => item.id !== snapshotId));
}

export function clearStatusBarHistory(conversationId: string) {
  saveStatusBarHistory(conversationId, []);
}

export function getStatusBarRandomMode(conversationId: string): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(RANDOM_KEY_PREFIX + conversationId) === 'true';
}

export function saveStatusBarRandomMode(conversationId: string, enabled: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(RANDOM_KEY_PREFIX + conversationId, String(enabled));
  window.dispatchEvent(new CustomEvent('sane333:status-bar-random-changed', { detail: { conversationId, enabled } }));
}

export type StatusBarAssignments = Partial<Record<StatusBarTarget, string>>;
const ASSIGN_KEY = 'line:status-bar-assignments';
export function getStatusBarAssignments(): StatusBarAssignments { if (typeof window === 'undefined') return {}; try { return JSON.parse(window.localStorage.getItem(ASSIGN_KEY) || '{}'); } catch { return {}; } }
export function saveStatusBarAssignment(target: StatusBarTarget, presetId: string) { if (typeof window === 'undefined') return; const next={...getStatusBarAssignments(),[target]:presetId}; window.localStorage.setItem(ASSIGN_KEY,JSON.stringify(next)); window.dispatchEvent(new CustomEvent('sane333:status-bar-assignments-changed')); }
export function getStatusBarForTarget(target: StatusBarTarget): StatusBarPreset | null { const id=getStatusBarAssignments()[target]; return getStatusBarPresets().find(item=>item.id===id) || getStatusBarPresets().find(item=>item.targets.includes(target)) || null; }
