export type StatusBarTarget = 'line' | 'offline' | 'character-profile' | 'moments' | 'threads';

export interface StatusBarPreset {
  id: string;
  name: string;
  description: string;
  html: string;
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
    html: '<div class="sane-status"><div class="sane-status__content">{{status}}</div></div>',
    promptSuffix: '请回复一个简洁的当前状态栏，只描述此刻角色的地点、时间、正在做什么和心情。状态必须基于刚刚的聊天，不要解释，不要输出状态栏标签。',
    regex: '',
    targets: ['line', 'offline', 'character-profile'],
    createdAt: '2026-10-04T00:00:00.000Z',
    updatedAt: '2026-10-04T00:00:00.000Z',
  },
  {
    id: 'status-romance',
    name: '关系记录',
    description: '适合恋爱 / 羁绊剧情的轻量状态卡。',
    html: '<article class="sane-status romance"><div class="sane-status__content">{{status}}</div></article>',
    promptSuffix: '请回复一条简洁的关系状态记录，只描述当前地点、时间、正在做什么、心情以及关系变化。状态必须基于刚刚的聊天，不要解释，不要输出状态栏标签。',
    regex: '',
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
    return parsed.map(item => {
      const base = defaultsById.get(item?.id);
      const normalizedTargets = Array.isArray(item?.targets) ? item.targets : (base?.targets || ['line']);
      return {
        ...(base || {}),
        ...(item || {}),
        id: String(item?.id || base?.id || ''),
        name: String(item?.name || base?.name || '未命名状态栏'),
        description: String(item?.description ?? base?.description ?? ''),
        html: String(item?.html ?? item?.replacePattern ?? base?.html ?? ''),
        promptSuffix: String(item?.promptSuffix ?? base?.promptSuffix ?? ''),
        regex: String(item?.regex ?? item?.regexPattern ?? base?.regex ?? ''),
        targets: normalizedTargets,
        createdAt: String(item?.createdAt || base?.createdAt || new Date().toISOString()),
        updatedAt: String(item?.updatedAt || base?.updatedAt || new Date().toISOString()),
      };
    });
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
      const flags = Array.from(new Set((raw.slice(end + 1) + 's').split(''))).join('');
      return new RegExp(raw.slice(1, end), flags);
    }
    return new RegExp(raw, 'gs');
  } catch {
    return null;
  }
}

function literalPrefixOfRegex(source: string): string {
  let raw = String(source || '').trim();
  if (raw.startsWith('/') && raw.lastIndexOf('/') > 0) raw = raw.slice(1, raw.lastIndexOf('/'));
  raw = raw.replace(/^\^/, '');
  let depth = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '\\') { i++; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === '|' && depth === 0) return '';
  }
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '\\') {
      const next = raw[i + 1];
      if (next === undefined || /[A-Za-z0-9]/.test(next)) break;
      out += next;
      i++;
    } else if ('()[]{}.*+?|^$'.includes(ch)) {
      break;
    } else {
      out += ch;
    }
    const after = raw[i + 1];
    if (after && '*+?{'.includes(after)) {
      out = out.slice(0, -1);
      break;
    }
  }
  return out;
}

function tidyAfterStatusRemoval(text: string): string {
  return String(text || '').replace(/```[a-zA-Z0-9_-]*\s*```/g, '').trim();
}

export function splitStatusBarFromText(text: string, regexSource: string): { text: string; status: string } {
  const source = String(text || '');
  const regex = parseRegex(regexSource);
  if (!regex) return { text: source, status: '' };
  const prefix = literalPrefixOfRegex(regexSource);
  const cutIndex = prefix.length >= 2 ? source.indexOf(prefix) : -1;
  const extracted = extractStatusMatch(source, regexSource);

  if (extracted?.match) {
    const globalRegex = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
    let cleaned: string;
    if (globalRegex.test(source)) {
      globalRegex.lastIndex = 0;
      cleaned = source.replace(globalRegex, '');
    } else if (source.includes(extracted.match)) {
      cleaned = source.split(extracted.match).join('');
    } else if (cutIndex >= 0) {
      cleaned = source.slice(0, cutIndex);
    } else {
      cleaned = source;
    }
    return { text: tidyAfterStatusRemoval(cleaned), status: extracted.match.trim() };
  }

  if (cutIndex >= 0) {
    return { text: tidyAfterStatusRemoval(source.slice(0, cutIndex)), status: source.slice(cutIndex).trim() };
  }
  return { text: source, status: '' };
}

function escapeHtmlText(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function resolveStatusBarTokens(
  html: string,
  tokens: { char?: string; user?: string; char_avatar?: string; user_avatar?: string },
): string {
  return String(html || '').replace(/\{\{(char_avatar|user_avatar|char|user)\}\}/g,
    (_, key: 'char_avatar' | 'user_avatar' | 'char' | 'user') => escapeHtmlText(tokens[key] || ''));
}

export function extractStatusMatch(text: string, regexSource: string): { match: string; captures: string[]; groups: Record<string,string> } | null {
  // Match the current preset's Regex as authored; punctuation normalization can corrupt values.
  const regex = parseRegex(regexSource);
  if (!regex) return null;
  const input = String(text || '').trim();
  const stripped = input.replace(/^```[a-zA-Z0-9_-]*\s*/, '').replace(/\s*```$/, '').trim();
  const candidates = stripped && stripped !== input ? [input, stripped] : [input];
  let match: RegExpExecArray | null = null;
  for (const candidate of candidates) {
    regex.lastIndex = 0;
    match = regex.exec(candidate);
    if (match) break;
  }
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
  const extracted = preset.regex ? extractStatusMatch(sourceText, preset.regex) : null;
  const values: Record<string,string> = { ...fallbackValues };
  if (extracted) {
    extracted.captures.forEach((value, index) => { values[String(index + 1)] = value; });
    Object.assign(values, extracted.groups || {});
    values.match = extracted.match || '';
    values['0'] = extracted.match || '';
  } else {
    values.match = String(sourceText || '').trim();
    values.status = values.match;
  }
  // HTML templates receive escaped data values, not raw model/user text.
  // Keep trusted template markup intact while preventing status text from
  // injecting arbitrary HTML or event handlers through {{match}} / captures.
  const escapeHtml = (value: unknown) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  let html = String(preset.html || '');
  html = html.replace(/\{\{(?:match|status)\}\}/g, escapeHtml(values.match || ''));
  html = html.replace(/\{\{([\w-]+)\}\}/g, (_, key: string) => { const aliases: Record<string, string> = { location: '1', time: '2', activity: '3', mood: '4', favor: '5' }; return escapeHtml(values[key] ?? (aliases[key] ? values[aliases[key]] : '') ?? ''); });
  html = html.replace(/\$(\d+)/g, (_, index: string) => escapeHtml(values[index] ?? ''));
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
  window.localStorage.setItem(HISTORY_KEY_PREFIX + conversationId, JSON.stringify(history.slice(-20)));
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
export type CharacterStatusBarAssignments = Record<string, string>;
const ASSIGN_KEY = 'line:status-bar-assignments';
const CHARACTER_ASSIGN_KEY = 'line:status-bar-character-assignments';
export function getStatusBarAssignments(): StatusBarAssignments { if (typeof window === 'undefined') return {}; try { return JSON.parse(window.localStorage.getItem(ASSIGN_KEY) || '{}'); } catch { return {}; } }
export function saveStatusBarAssignment(target: StatusBarTarget, presetId: string) { if (typeof window === 'undefined') return; const next={...getStatusBarAssignments(),[target]:presetId}; window.localStorage.setItem(ASSIGN_KEY,JSON.stringify(next)); window.dispatchEvent(new CustomEvent('sane333:status-bar-assignments-changed')); }
export function getStatusBarForTarget(target: StatusBarTarget): StatusBarPreset | null {
  const id=getStatusBarAssignments()[target];
  return getStatusBarPresets().find(item=>item.id===id) || getStatusBarPresets().find(item=>item.targets.includes(target)) || null;
}
export function getCharacterStatusBarAssignments(): CharacterStatusBarAssignments {
  if (typeof window === 'undefined') return {};
  try { const raw = window.localStorage.getItem(CHARACTER_ASSIGN_KEY); const value = raw ? JSON.parse(raw) : {}; return value && typeof value === 'object' ? value : {}; } catch { return {}; }
}
export function saveCharacterStatusBarAssignment(characterId: string, presetId: string) {
  if (typeof window === 'undefined' || !characterId.trim()) return;
  const next = { ...getCharacterStatusBarAssignments(), [characterId]: presetId };
  window.localStorage.setItem(CHARACTER_ASSIGN_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('sane333:status-bar-character-assignments-changed', { detail: { characterId, presetId } }));
}
export function getStatusBarForCharacter(characterId: string | undefined, target: StatusBarTarget): StatusBarPreset | null {
  const presets = getStatusBarPresets();
  if (characterId) {
    const assignedId = getCharacterStatusBarAssignments()[characterId];
    const assigned = presets.find(item => item.id === assignedId);
    if (assigned) return assigned;
  }
  return getStatusBarForTarget(target);
}
