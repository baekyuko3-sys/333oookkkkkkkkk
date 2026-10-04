export type ChatPunctuationStyle = 'natural' | 'spaces' | 'tight' | 'mixed';

export interface LineRealitySettings {
  timezone: string;
  punctuationStyle: ChatPunctuationStyle;
  avoidRepeatedNudges: boolean;
  naturalTyping: boolean;
  proactiveCooldownMinutes: number;
}

const KEY = 'line:reality-settings';

function defaultTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
  } catch {
    return 'Asia/Shanghai';
  }
}

export function getLineRealitySettings(): LineRealitySettings {
  if (typeof window === 'undefined') {
    return {
      timezone: 'Asia/Shanghai',
      punctuationStyle: 'natural',
      avoidRepeatedNudges: true,
      naturalTyping: true,
      proactiveCooldownMinutes: 90,
    };
  }
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      timezone: typeof parsed.timezone === 'string' && parsed.timezone ? parsed.timezone : defaultTimezone(),
      punctuationStyle: parsed.punctuationStyle || 'natural',
      avoidRepeatedNudges: parsed.avoidRepeatedNudges !== false,
      naturalTyping: parsed.naturalTyping !== false,
      proactiveCooldownMinutes: Math.max(15, Number(parsed.proactiveCooldownMinutes) || 90),
    };
  } catch {
    return {
      timezone: defaultTimezone(),
      punctuationStyle: 'natural',
      avoidRepeatedNudges: true,
      naturalTyping: true,
      proactiveCooldownMinutes: 90,
    };
  }
}

export function saveLineRealitySettings(patch: Partial<LineRealitySettings>) {
  const next = { ...getLineRealitySettings(), ...patch };
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('sane333:line-reality-changed', { detail: next }));
  }
  return next;
}

export function getCurrentLineTimeContext() {
  const settings = getLineRealitySettings();
  const now = new Date();
  let formatted = now.toISOString();
  try {
    formatted = new Intl.DateTimeFormat('zh-CN', {
      timeZone: settings.timezone,
      dateStyle: 'full',
      timeStyle: 'medium',
      hour12: false,
    }).format(now);
  } catch {
    // Keep ISO time if an invalid timezone was saved.
  }
  return {
    now: now.toISOString(),
    timezone: settings.timezone,
    formatted,
  };
}

export function buildLineHumanBehaviorPrompt() {
  const settings = getLineRealitySettings();
  const time = getCurrentLineTimeContext();
  const punctuation = {
    natural: '标点按角色自己的习惯自然变化，不要机械统一。',
    spaces: '角色有明显的空格习惯；该空格时自然留空格，不要每句话都强行加。',
    tight: '角色偏少空格、短句和紧凑输入，像手机上快速聊天。',
    mixed: '角色会自然混用标点、空格、换行和短句，保持个人习惯。',
  }[settings.punctuationStyle];

  return [
    '【LINE 实时感 / 活人感】',
    '当前真实时间：' + time.formatted,
    '当前时区：' + time.timezone,
    '把当前时间当作此刻聊天世界的时间。不要把角色写成永远停在同一时刻的人。',
    '角色拥有自己的生活节奏。用户没有回复时，不要连续发送“你怎么不回”“在吗”“怎么了”之类重复催促。',
    '如果用户没有回复，角色可以暂时去做自己的事；之后再次出现时应有自然的时间间隔、状态变化或新话题，而不是机械续写上一句。',
    '不要为了证明角色“活着”而高频主动发消息。主动消息应该有事件、日程、情绪或自然动机。',
    '角色打字必须有个人习惯。观察角色卡、历史消息和上下文后决定句长、标点、空格、换行、表情和口语程度。',
    punctuation,
    '例如，如果角色平时会说“你吃了吗? 我还没有”，就保持这种节奏；如果会说“你吃了 我也是”，也不要擅自改成书面句式。',
    '不要把每条消息都写成完整工整的句子，也不要每次都用相同的结尾标点。',
    '允许很短的真人式回复，例如“嗯”“好”“我也是”“刚到”“等我一下”，但必须符合上下文。',
  ].join('\\n');
}
