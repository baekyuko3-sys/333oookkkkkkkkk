export type ChatPunctuationStyle = 'natural' | 'spaces' | 'tight' | 'mixed';
export type CharacterLanguage = 'zh-CN' | 'zh-TW' | 'yue' | 'en' | 'ja' | 'ko' | 'fr' | 'es' | 'de' | 'other';
export type BilingualLayout = 'inside-bubble' | 'below-bubble';
export type BilingualMode = 'off' | 'auto';

export interface LineRealitySettings {
  timezone: string;
  punctuationStyle: ChatPunctuationStyle;
  language: CharacterLanguage;
  bilingualMode: BilingualMode;
  bilingualLayout: BilingualLayout;
  bilingualTranslationDirection: 'original-first' | 'translation-first';
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
      language: 'zh-CN',
      bilingualMode: 'off',
      bilingualLayout: 'below-bubble',
      bilingualTranslationDirection: 'original-first',
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
      language: parsed.language || 'zh-CN',
      bilingualMode: parsed.bilingualMode || 'off',
      bilingualLayout: parsed.bilingualLayout || 'below-bubble',
      bilingualTranslationDirection: parsed.bilingualTranslationDirection || 'original-first',
      avoidRepeatedNudges: parsed.avoidRepeatedNudges !== false,
      naturalTyping: parsed.naturalTyping !== false,
      proactiveCooldownMinutes: Math.max(15, Number(parsed.proactiveCooldownMinutes) || 90),
    };
  } catch {
    return {
      timezone: defaultTimezone(),
      punctuationStyle: 'natural',
      language: 'zh-CN',
      bilingualMode: 'off',
      bilingualLayout: 'below-bubble',
      bilingualTranslationDirection: 'original-first',
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
  const language = {
    'zh-CN': '角色主要使用普通话/简体中文；不要无理由切换语言。',
    'zh-TW': '角色主要使用繁體中文。',
    yue: '角色主要使用粤语。',
    en: '角色主要使用英语。',
    ja: '角色主要使用日语。',
    ko: '角色主要使用韩语。',
    fr: '角色主要使用法语。',
    es: '角色主要使用西班牙语。',
    de: '角色主要使用德语。',
    other: '角色使用设定的其他语言。',
  }[settings.language];
  const bilingual = settings.bilingualMode === 'auto'
    ? '开启双语：只要角色主要语言不是普通话，就同时提供原文与中文翻译。双语是同一条消息的自然呈现，不要把翻译写成解释。'
    : '不开启双语。';
  const layout = settings.bilingualLayout === 'inside-bubble'
    ? '双语翻译放在同一个聊天气泡内部，原文与译文保持清晰层级。'
    : '双语翻译显示在原聊天气泡下方，作为同一条消息的辅助译文；不要生成第二个独立聊天气泡。';
  const direction = settings.bilingualTranslationDirection === 'translation-first'
    ? '双语顺序：中文翻译在前，原文在后。'
    : '双语顺序：原文在前，中文翻译在后。';

  return [
    '【LINE 实时感 / 活人感】',
    '当前真实时间：' + time.formatted,
    '当前时区：' + time.timezone,
    '把当前时间当作此刻聊天世界的时间。不要把角色写成永远停在同一时刻的人。',
    '角色拥有自己的生活节奏。用户没有回复时，不要监控、计算或强调用户沉默了多少分钟。',
    '正常聊天间隔不是剧情事件：1～5 分钟、十几分钟甚至更久的普通断档，都不应自动触发催促、抱怨、质问或“你怎么不回”。',
    '如果用户没有回复，角色可以自然去做自己的事；用户回来后直接根据最新内容继续聊天。只有角色性格、关系和情境确实支持时，才可以在较长等待后自然提到“等了你一会儿”。',
    '不要为了证明角色“活着”而高频主动发消息。主动消息应该有事件、日程、情绪或自然动机。',
    '角色打字必须有个人习惯。观察角色卡、历史消息和上下文后决定句长、标点、空格、换行、表情和口语程度。',
    punctuation,
    '【角色语言】' + language,
    bilingual,
    layout,
    direction,
    '不要把双语内容重复生成成两条独立消息；它仍然是一次角色发言。',
    '例如，如果角色平时会说“你吃了吗? 我还没有”，就保持这种节奏；如果会说“你吃了 我也是”，也不要擅自改成书面句式。',
    '不要把每条消息都写成完整工整的句子，也不要每次都用相同的结尾标点。',
    '允许很短的真人式回复，例如“嗯”“好”“我也是”“刚到”“等我一下”，但必须符合上下文。',
  ].join('\\n');
}
