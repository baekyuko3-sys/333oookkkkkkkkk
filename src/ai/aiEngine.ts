import type { ImportedCharacter } from '../data/characterImport';
import type { ProjectManifest, WorldBook } from '../types';
import type { CharacterMemory } from '../store/characterMemory';
import { buildMemoryContext } from '../store/characterMemory';
import type { AppSettings, ChannelAiSettings } from '../store/appSettings';
import { readAppSettings } from '../store/appSettings';
import { getCharacterAiProfile, mergeCharacterAiSettings } from '../store/characterAiProfiles';
import { resolveCharacterContext, selectWorldBookEntries } from './contextEngine';
import { getCotForTarget } from '../store/cotPresets';
import { buildLineHumanBehaviorPrompt } from '../store/lineReality';

export type AiSettings = Pick<AppSettings, 'provider' | 'apiBaseUrl' | 'apiKey' | 'model' | 'streaming' | 'contextLength' | 'maxOutputTokens' | 'autoSave' | 'temperature'>;

export interface AiReplyInput {
  settings: AiSettings;
  character?: ImportedCharacter | null;
  characterProfile: {
    nickname: string;
    relationship: string;
    callMe: string;
    bio?: string;
  };
  persona?: {
    name?: string;
    identity?: string;
    gender?: string;
    traits?: string;
    background?: string;
    region?: string;
    timezone?: string;
    birthday?: string;
    profession?: string;
    age?: string;
    ageMode?: 'manual' | 'follow-character';
    weather?: string;
  } | null;
  characterWeather?: string;
  worldbooks?: WorldBook[];
  memory?: CharacterMemory | null;
  project?: ProjectManifest | null;
  messages: Array<{
    sender: 'me' | 'other' | 'system' | string;
    text?: string;
    transcript?: string;
    type?: string;
    imageData?: string;
    senderName?: string;
    metadata?: Record<string, unknown>;
    isRecalled?: boolean;
    isRecalledByOther?: boolean;
  }>;
  userMessage: string;
  isGroup?: boolean;
  authorNote?: string;
  stylePreset?: string;
  typingHabit?: string;
  cotTarget?: 'line' | 'offline' | 'group';
  temperature?: number;
  onDelta?: (delta: string) => void;
}

export interface AiReplyResult {
  text: string;
  thinkingSummary?: string;
  actionDescription?: string;
  provider: AiSettings['provider'];
  model: string;
  matchedWorldbookEntries: number;
}

export function parseAiReplyPayload(rawText: string): Pick<AiReplyResult, 'text' | 'thinkingSummary' | 'actionDescription'> {
  const raw = String(rawText || '').replace(/\r\n/g, '\n').trim();
  const withoutHiddenThinking = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '');

  const readTag = (name: string): string => {
    const match = withoutHiddenThinking.match(new RegExp('<' + name + '>\\s*([\\s\\S]*?)\\s*</' + name + '>', 'i'));
    return match ? match[1].trim() : '';
  };

  const thinkingSummary = readTag('summary');
  const actionDescription = readTag('action');
  const messageMatch = withoutHiddenThinking.match(/<message>\s*([\s\S]*?)\s*<\/message>/i);

  const text = (messageMatch?.[1] || withoutHiddenThinking
    .replace(/<summary>[\s\S]*?<\/summary>/gi, '')
    .replace(/<action>[\s\S]*?<\/action>/gi, ''))
    .trim();

  return {
    text,
    thinkingSummary: thinkingSummary || undefined,
    actionDescription: actionDescription || undefined,
  };
}

export function resolveChannelAiSettings(channel: 'chat' | 'moments'): AiSettings {
  const settings = readAppSettings();
  const override: ChannelAiSettings = channel === 'moments' ? settings.momentsApiOverride : settings.chatApiOverride;
  const base: AiSettings = {
    provider: settings.provider,
    apiBaseUrl: settings.apiBaseUrl,
    apiKey: settings.apiKey,
    model: settings.model,
    streaming: settings.streaming,
    contextLength: settings.contextLength,
    maxOutputTokens: settings.maxOutputTokens,
    autoSave: settings.autoSave,
    temperature: settings.temperature,
  };
  if (!override?.enabled) return base;
  return {
    ...base,
    provider: override.provider,
    apiBaseUrl: override.apiBaseUrl,
    apiKey: override.apiKey,
    model: override.model,
    streaming: override.streaming,
    contextLength: override.contextLength,
    maxOutputTokens: override.maxOutputTokens,
    temperature: override.temperature,
  };
}

export function readStoredAiSettings(characterId?: string, characterName?: string): AiSettings {
  const settings = readAppSettings();
  const base: AiSettings = {
    provider: settings.provider,
    apiBaseUrl: settings.apiBaseUrl,
    apiKey: settings.apiKey,
    model: settings.model,
    streaming: settings.streaming,
    contextLength: settings.contextLength,
    maxOutputTokens: settings.maxOutputTokens,
    autoSave: settings.autoSave,
    temperature: settings.temperature,
  };

  if (!characterId && !characterName) return base;
  return mergeCharacterAiSettings(base, getCharacterAiProfile(characterId || characterName || '', characterName));
}

function getApplicableWorldBooks(input: AiReplyInput): WorldBook[] {
  const books = input.worldbooks || [];
  const characterId = input.character?.id;
  const characterName = input.character?.name;

  // Character-card lorebooks are private to their source character.
  // Manually imported / global books remain available to every character.
  const selectedIds = new Set(input.character?.worldBookIds || []);
  const hasExplicitSelection = Array.isArray(input.character?.worldBookIds);

  return books.filter(book => {
    // Once a character has an explicit selection, only checked books are injected.
    // This is the same mental model as Tavern's per-character lorebook selection.
    if (hasExplicitSelection) return selectedIds.has(book.id);

    // Legacy cards without selection state keep the old behavior:
    // their own embedded books + global books remain available.
    if (book.sourceType !== 'character-card' && !book.sourceCharacterId) return true;
    if (!characterId && !characterName) return false;
    return (
      book.sourceCharacterId === characterId ||
      (!book.sourceCharacterId && book.sourceCharacterName === characterName)
    );
  });
}

function buildWorldBookScanResolver(input: AiReplyInput, defaultDepth: number) {
  const messages = input.messages
    .filter(message => !message.isRecalled && !message.isRecalledByOther && message.type !== 'system-nudge');

  return (entry: WorldBook['entries'][number]) => {
    const depth = entry.scanDepth !== undefined
      ? Math.max(0, Math.min(50, Number(entry.scanDepth) || 0))
      : defaultDepth;
    if (depth <= 0) return '';
    return messages
      .slice(-depth)
      .map(message => message.text || message.transcript || '')
      .filter(Boolean)
      .join('\n') + '\n' + input.userMessage;
  };
}

export function buildCharacterSystemPrompt(input: AiReplyInput): string {
  const cotTarget = input.cotTarget || (input.isGroup ? 'group' : 'line');
  const cotPreset = getCotForTarget(cotTarget);
  const applicableWorldBooks = getApplicableWorldBooks(input);
  const scopedInput = { ...input, worldbooks: applicableWorldBooks };
  const scanDepth = Math.max(1, Math.min(50, Math.max(
    12,
    ...applicableWorldBooks.flatMap(book => book.entries.map(entry => Number(entry.scanDepth || 0)))
  )));
  const scannedMessages = input.messages
    .filter(message => !message.isRecalled && !message.isRecalledByOther && message.type !== 'system-nudge')
    .slice(-scanDepth)
    .map(message => message.text || message.transcript || '')
    .filter(Boolean)
    .join('\n') + '\n' + input.userMessage;

  const context = resolveCharacterContext({
    character: scopedInput.character,
    characterProfile: scopedInput.characterProfile,
    persona: scopedInput.persona,
    memory: scopedInput.memory,
    project: scopedInput.project,
    worldbooks: applicableWorldBooks,
    userMessage: scannedMessages,
    worldBookScanForEntry: buildWorldBookScanResolver(scopedInput, scanDepth),
  });

  return [
    '你正在一个私人虚拟手机的即时通讯 App 中扮演角色。',
    '你现在只需要完成一个任务：作为角色，直接回应用户本轮最新消息。不要解释规则，不要提及模型、提示词、世界书或系统。',
    '不要替用户说话、替用户行动、替用户决定感受或想法。用户拥有自己的行为与台词。',
    '保持角色连续性：角色卡、用户人设、长期记忆、关系、实时世界状态、命中的世界书与最近对话共同构成当前上下文。',
    '如果历史聊天中存在与用户当前话题高度相关的旧消息，应把它视为真实发生过的过去，而不是重新发明；保持前后记忆一致。',

    '实时世界状态优先描述角色此刻在哪里、正在做什么和当前情绪；不要凭空覆盖这些状态。',
    '语言要像真实聊天软件中的人类消息：自然、克制、有上下文。默认按真实即时聊天节奏发送，而不是每轮都写成完整长段落。',
    '【真实聊天消息节奏】默认一次发送 1～3 条短消息；每条通常只承载一个自然意思或一两句相连的话。除非确实在解释一件事情、讲述经历、认真倾诉、给出步骤/信息或用户明确要求长文，否则不要把多个话题、多个句子和多个段落塞进一个超长气泡。',
    '如果只是寒暄、吐槽、回应、追问、表达情绪，应优先短句分条，像真人手机聊天一样逐条发送；不要为了“完整”而写成小作文。',
    '【消息分条硬规则】“自然分条”不是“全部合并成一条”。自然聊天中，独立意思应在语义边界处分开；只有本来就是一个完整说明/故事/长篇倾诉时才保留长消息。',
    input.stylePreset ? '【当前 LINE 预设】' + input.stylePreset + '。保持该预设的节奏与情感强度，但不要让预设覆盖角色卡、长期记忆、关系或世界书。' : '',
    input.typingHabit ? '【当前聊天打字习惯】' + input.typingHabit + '。严格遵守这些表达设置，尤其是标点、emoji、消息分条、换行、句长、语气词和断句；设置为“用空格连接”就优先使用空格连接，设置为“分行断句”就使用换行。不要改变角色性格、事实或剧情。' : '',
    buildLineHumanBehaviorPrompt(),
    input.character?.languageProfile ? [
      '【角色个人语言指纹】',
      '角色语言：' + input.character!.languageProfile.language,
      '双语模式：' + input.character!.languageProfile.bilingualMode,
      '双语布局：' + input.character!.languageProfile.bilingualLayout,
      '双语顺序：' + input.character!.languageProfile.bilingualTranslationDirection,
      '标点习惯：' + input.character!.languageProfile.punctuationStyle,
      '句子长度：' + input.character!.languageProfile.sentenceLength,
      '换行习惯：' + input.character!.languageProfile.lineBreakStyle,
      '口语程度：' + input.character!.languageProfile.colloquialLevel,
      '语气词：' + (input.character!.languageProfile.fillerWords || []).join('、'),
      'Emoji：' + input.character!.languageProfile.emojiStyle,
      '大小写：' + input.character!.languageProfile.capitalizationStyle,
      '数字习惯：' + input.character!.languageProfile.numberStyle,
      '是否偏好空格：' + (input.character!.languageProfile.preferredSpaces ? '是' : '否'),
      '消息分组：' + ({ single: '尽量一句一句发送，每个短句独立成一条消息。', double: '倾向把相邻两句自然地合并成一条消息，不要一句一句碎发。', natural: '根据语境自然决定一条还是两条，不要机械切分。' }[input.character!.languageProfile.messageGrouping || 'natural']),
      '语言示例：' + (input.character!.languageProfile.examples || []).join(' / '),
      '保持稳定，但不要机械复制每条消息的格式。',
      '非普通话且双语开启时，在同一次角色发言中提供原文与中文翻译，不要生成两条独立消息。',
      input.character!.languageProfile.bilingualLayout === 'below-bubble' ? '译文属于同一消息，应显示在原气泡下方。' : '原文与译文属于同一个气泡。'
    ].join('\\n') : '',
    '除非角色卡明确要求，否则不要每轮都过度煽情或重复昵称。',
    input.isGroup ? '这是群聊：回复可以体现群聊语境，但不要替其他成员完成完整对话。' : '这是私聊：只扮演当前角色。',
    context.worldBookBefore ? '【世界书 · 角色定义前】\n' + context.worldBookBefore : '',
    '【角色上下文】\n' + context.character,
    '',
    '【用户人设】\n' + context.persona,
    input.persona ? [
      '【用户个人资料】',
      '姓名：' + (input.persona.name || ''),
      '年龄：' + (input.persona.age || ''),
      '职业：' + (input.persona.profession || ''),
      '地区：' + (input.persona.region || ''),
      '时区：' + (input.persona.timezone || ''),
      '生日：' + (input.persona.birthday || ''),
      '年龄模式：' + (input.persona.ageMode || 'manual'),
      input.persona.weather ? '用户所在地区当前天气：' + input.persona.weather : '',
      '这些资料属于用户本人。相关时自然参考，不要每轮机械提及。'
    ].join('\n') : '',
    input.characterWeather ? '【角色所在地天气】' + input.characterWeather + '。角色可以知道自己所在地的当前天气，但不要每轮主动播报。' : '',
    '',
    '【关系状态】\n' + context.relationship,
    '',
    '【长期记忆】\n' + context.memory,
    '',
    '【实时世界状态】\n' + context.world,
    '',
    '【项目设定】\n' + context.project,
    context.worldBookAfter ? '【世界书 · 角色定义后】\n' + context.worldBookAfter : '',
    '',
    input.stylePreset ? '【聊天风格预设】\n' + input.stylePreset : '【聊天风格预设】自然、沉浸、像真实聊天。',
    input.authorNote ? '【作者注释】\n' + input.authorNote : '【作者注释】无。',
    cotPreset ? '【内部生成预设】\n' + cotPreset.template + '\n只用于内部生成规划；绝对不要把思维过程、<think> 或 <thought> 标签输出给用户。' : '【内部生成预设】无。',
    '',
    '【当前任务 · 绝对最高优先级】',
    '你只能回答当前用户消息，不要替当前用户补写下一句，也不要自行延续旧话题。',
    '下面这条才是本轮必须处理的用户消息：',
    '<<<CURRENT_USER_MESSAGE>>>',
    input.userMessage,
    '<<<END_CURRENT_USER_MESSAGE>>>',
    '如果旧聊天、记忆、世界书、关系设定与当前消息冲突，当前消息决定本轮要回答什么；其他资料只用于角色身份、事实连续性和语气。',
    '不要因为旧消息里出现过的问题、请求或关键词，就再次回答那个旧问题。',
    '',
        '【当前消息 · 最高优先级】',
    '你现在真正要处理的是本轮用户刚刚发送的这一条消息。',
    '当前用户消息：「' + input.userMessage + '」',
    '回答必须直接针对这条消息。不要因为角色卡、世界书、长期记忆或较早聊天里出现了别的话题，就自行把回复切换到旧话题。',
    '历史内容只用于理解当前消息、保持事实连续性和关系连续性；除非当前消息明确引用过去，否则不要主动回答已经结束的旧话题。',
    '如果当前消息很短，也先回答它本身，不要为了展示上下文而扩展到无关内容。',
    '',
    '【输出约束】',
    '禁止输出原始 <think>、思维链、隐藏推理或内部分析。若系统要求显示思考信息，只允许使用独立的高层次“思考摘要”，不能泄露逐步内部推理。',
    '不要描述用户尚未明确做出的动作。',
    '不要把聊天回复写成旁白长文；保持手机消息的阅读节奏。',
    '不要用“角色动作 + 长段心理描写 + 一大段台词”代替聊天消息；动作描写如果开启必须单独放进 <action>...</action>，正文仍然是正常聊天消息。',
    input.authorNote?.includes('【动作描写：开启】') ? '【动作描写】开启。角色可以在有表现力、有必要时给出简短动作描写，并严格输出为 <action>动作</action>，动作与消息正文分离。不要把动作写进消息气泡正文。' : '【动作描写】关闭。不要输出 <action> 标签，也不要额外写动作旁白。',
    input.authorNote?.includes('【思考摘要：开启】') ? '【思考摘要】开启。只允许提供一句或两句高层次摘要，例如“判断她在开玩笑，所以语气放松一些”，不要输出逐步推理或隐藏思维链。摘要应使用 <summary>...</summary>，最终消息正文放在标签之外。' : '【思考摘要】关闭。不要输出 <summary> 标签。',
    '',
    '【LINE 聊天设定 · 最高优先级格式约束】',
    input.typingHabit ? [
      '以下是用户在“聊天设定”里主动选择的打字习惯。它不是参考建议，而是本次回复必须执行的输出格式。',
      input.typingHabit,
      '执行顺序：先遵守这些聊天设定，再生成角色内容。',
      '标点设置必须直接体现在最终文本中；如果设置为少标点，不要为了语法习惯自动补满句号和逗号。',
      '消息分条设置必须体现在最终文本中；如果设置为一句一句发，应使用独立短句/换行表达，而不是把所有内容合成一大段。',
      '换行与断句设置必须体现在最终文本中；如果设置为分行或用空格连接，不要擅自改成另一种格式。',
      'emoji/表情包设置必须体现在最终文本中；如果设置为经常使用，可以自然加入 emoji，但不要机械每句添加。',
      '句子长度、语气词也必须遵守。角色性格、事实、剧情仍然保持不变。',
    ].join('\n') : '当前没有额外的聊天打字习惯设置。',
  ].join('\n');
}


function extractHistoryKeywords(text: string): string[] {
  const normalized = text.toLowerCase().replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, ' ').trim();
  const words = normalized.split(/\s+/).filter(word => word.length >= 2);
  const chinese = Array.from(normalized.replace(/\s/g, '')).filter(char => /[\u4e00-\u9fff]/u.test(char));
  const bigrams = chinese.slice(0, 80).map((_, index) => chinese.slice(index, index + 2).join('')).filter(word => word.length === 2);
  return Array.from(new Set([...words, ...bigrams])).slice(0, 32);
}

function findRelevantHistory(input: AiReplyInput, recentIds: Set<string>): AiReplyInput['messages'] {
  const keywords = extractHistoryKeywords(input.userMessage);
  if (!keywords.length) return [];

  return input.messages
    .filter(message =>
      message.type !== 'system-nudge' &&
      !message.isRecalled &&
      !message.isRecalledByOther &&
      !recentIds.has(String((message as any).id))
    )
    .map((message, index) => {
      const text = String(message.text || message.transcript || '').toLowerCase();
      if (!text) return null;
      const score = keywords.reduce((total, keyword) => total + (text.includes(keyword) ? Math.min(4, keyword.length) : 0), 0);
      return score > 0 ? { message, score, index } : null;
    })
    .filter((item): item is { message: AiReplyInput['messages'][number]; score: number; index: number } => Boolean(item))
    .sort((a, b) => b.score - a.score || b.index - a.index)
    .slice(0, 8)
    .sort((a, b) => a.index - b.index)
    .map(item => item.message);
}

function mediaContextLabel(message: AiReplyInput['messages'][number]): string {
  const metadata = message.metadata || {};
  const mediaType = String(metadata.mediaType || message.type || '');
  const fileName = String(metadata.fileName || '');
  const transcript = String(metadata.transcript || message.transcript || '');
  if (mediaType === 'image') return '[图片消息：这是一张之前发送过的图片，当前轮次可参考其记录]' + (fileName ? ' 文件：' + fileName : '');
  if (mediaType === 'voice' || message.type === 'voice') return '[语音消息]' + (transcript ? ' 转写：' + transcript : '');
  if (mediaType === 'video') return '[视频消息]' + (fileName ? ' 文件：' + fileName : '');
  if (mediaType === 'file') return '[文件消息]' + (fileName ? ' 文件：' + fileName : '');
  return '[多媒体消息]';
}

function buildConversationMessages(input: AiReplyInput) {
  // The model must see the current user message as the final conversational turn.
  // Do not mix old "historical chat memory" or depth-injected lorebook messages into
  // the provider's dialogue stream: they can look like fresh instructions and cause
  // the character to answer an older topic instead of what the user just said.
  const turnBudget = Math.max(6, Math.min(16, Number(input.settings.contextLength) || 10));
  const eligible = input.messages
    .filter(message =>
      message.type !== 'system-nudge' &&
      !message.isRecalled &&
      !message.isRecalledByOther
    );

  // Exclude the current user turn here; it is appended exactly once as the final
  // user message below, which makes its priority unambiguous to both Gemini and
  // OpenAI-compatible models.
  const historySource = eligible
    .slice(0, -1)
    .slice(-(turnBudget * 2));

  const history = historySource.map(message => ({
    role: message.sender === 'other' ? 'assistant' as const : 'user' as const,
    content: input.isGroup && message.senderName
      ? '[' + message.senderName + '] ' + (message.text || message.transcript || mediaContextLabel(message))
      : message.text || message.transcript || mediaContextLabel(message),
    imageData: message.imageData,
  }));

  // The current message is deliberately isolated from the older dialogue.
  // This is the single message the character is answering right now.
  history.push({
    role: 'user' as const,
    content: '【当前用户消息】\\n' + input.userMessage,
    imageData: undefined,
  });

  return history;
}

function requireApiKey(settings: AiSettings) {
  if (!settings.apiKey.trim()) {
    throw new Error('AI_NOT_CONFIGURED');
  }
  if (!settings.model.trim()) {
    throw new Error('AI_MODEL_MISSING');
  }
}

async function readError(response: Response): Promise<string> {
  const statusLabel = response.statusText ? ' ' + response.statusText : '';
  try {
    const data = await response.json();
    const error = data?.error ?? data;
    const code = error?.code ?? error?.error_code ?? error?.statusCode;
    const type = error?.type;
    const message = error?.message ?? data?.message;
    const parts = [
      code !== undefined ? 'code=' + String(code) : '',
      type ? 'type=' + String(type) : '',
      message ? String(message) : '',
    ].filter(Boolean);
    return '[' + response.status + statusLabel + ']' + (parts.length ? ' ' + parts.join(' · ') : ' ' + JSON.stringify(data));
  } catch {
    try {
      const text = (await response.text()).trim();
      return '[' + response.status + statusLabel + ']' + (text ? ' ' + text : '');
    } catch {
      return '[' + response.status + statusLabel + '] AI 请求失败';
    }
  }
}

async function parseSseResponse(
  response: Response,
  extractText: (data: any) => string,
  onDelta?: (delta: string) => void,
): Promise<string> {
  if (!response.body) {
    const data = await response.json();
    const text = extractText(data).trim();
    if (text) onDelta?.(text);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('data:')) return;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') return;

    try {
      const data = JSON.parse(payload);
      const delta = extractText(data);
      if (delta) {
        fullText += delta;
        onDelta?.(delta);
      }
    } catch {
      // Ignore non-JSON SSE comments/keep-alives.
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    lines.forEach(processLine);
  }

  buffer += decoder.decode();
  if (buffer) processLine(buffer);

  return fullText.trim();
}

function extractGeminiText(data: any): string {
  return (data?.candidates || [])
    .flatMap((candidate: any) => candidate?.content?.parts || [])
    .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
    .join('');
}

function extractOpenAiText(data: any): string {
  return (data?.choices || [])
    .map((choice: any) => choice?.message?.content ?? choice?.delta?.content ?? '')
    .filter((value: unknown) => typeof value === 'string')
    .join('');
}

async function callGemini(input: AiReplyInput): Promise<string> {
  const { settings } = input;
  const base = (settings.apiBaseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
  const action = settings.streaming ? 'streamGenerateContent' : 'generateContent';
  const suffix = settings.streaming ? '?alt=sse' : '';
  const endpoint =
    base +
    '/models/' +
    encodeURIComponent(settings.model.trim()) +
    ':' +
    action +
    suffix;

  const system = buildCharacterSystemPrompt(input);
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: buildConversationMessages(input).map(message => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [
        { text: message.content },
        ...(message.imageData ? (() => {
          const match = message.imageData.match(/^data:([^;]+);base64,(.+)$/);
          return match ? [{ inlineData: { mimeType: match[1], data: match[2] } }] : [];
        })() : []),
      ],
    })),
    generationConfig: {
      temperature: Math.max(0, Math.min(2, input.temperature ?? input.settings.temperature ?? 0.85)),
      maxOutputTokens: Math.max(128, Math.min(12000, Number(input.settings.maxOutputTokens) || 1200)),
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': settings.apiKey.trim(),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error('AI_GEMINI_' + response.status + ': ' + await readError(response));

  if (settings.streaming) {
    return parseSseResponse(response, extractGeminiText, input.onDelta);
  }

  const data = await response.json();
  const text = extractGeminiText(data).trim();
  input.onDelta?.(text);
  return text;
}

function normalizeOpenAiEndpoint(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (!base) throw new Error('AI_BASE_URL_MISSING');
  return /\/chat\/completions$/i.test(base) ? base : base + '/chat/completions';
}

function isLocalAiBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '0.0.0.0';
  } catch {
    return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/|$)/i.test(baseUrl.trim());
  }
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 30000): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('AI_TIMEOUT: Docker AI 接口超过 ' + Math.round(timeoutMs / 1000) + ' 秒没有响应');
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

async function callOpenAiCompatible(input: AiReplyInput): Promise<string> {
  const endpoint = normalizeOpenAiEndpoint(input.settings.apiBaseUrl);
  const system = buildCharacterSystemPrompt(input);
  const body = {
    model: input.settings.model.trim(),
    stream: Boolean(input.settings.streaming),
    temperature: Math.max(0, Math.min(2, input.temperature ?? input.settings.temperature ?? 0.85)),
    max_tokens: Math.max(128, Math.min(12000, Number(input.settings.maxOutputTokens) || 1200)),
    messages: [
      { role: 'system', content: system },
      ...buildConversationMessages(input).map(message => ({
        role: message.role,
        content: message.imageData
          ? [
              { type: 'text', text: message.content },
              { type: 'image_url', image_url: { url: message.imageData } },
            ]
          : message.content,
      })),
    ],
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + input.settings.apiKey.trim(),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error('AI_OPENAI_' + response.status + ': ' + await readError(response));

  if (input.settings.streaming) {
    return parseSseResponse(response, extractOpenAiText, input.onDelta);
  }

  const data = await response.json();
  const text = extractOpenAiText(data).trim();
  input.onDelta?.(text);
  return text;
}

export async function generateCharacterReply(input: AiReplyInput): Promise<AiReplyResult> {
  requireApiKey(input.settings);

  const worldbooks = input.worldbooks || [];
  const scanDepth = Math.max(1, Math.min(50, Math.max(12, ...worldbooks.flatMap(book => book.entries.map(entry => Number(entry.scanDepth || 0))))));
  const scannedText = input.messages
    .filter(message => !message.isRecalled && !message.isRecalledByOther && message.type !== 'system-nudge')
    .slice(-scanDepth)
    .map(message => message.text || message.transcript || '')
    .filter(Boolean)
    .join('\n') + '\n' + input.userMessage;
  const matchedWorldbookEntries = selectWorldBookEntries(worldbooks, scannedText, buildWorldBookScanResolver(input, scanDepth)).length;

  // Parse structured output only after the provider finishes. Raw <summary>/<action>
  // tags must never be streamed directly into the chat bubble.
  const providerInput: AiReplyInput = { ...input, onDelta: undefined };
  const rawText =
    input.settings.provider === 'gemini'
      ? await callGemini(providerInput)
      : await callOpenAiCompatible(providerInput);

  const parsed = parseAiReplyPayload(rawText);
  if (!parsed.text) throw new Error('AI_EMPTY_RESPONSE');

  input.onDelta?.(parsed.text);

  return {
    text: parsed.text,
    thinkingSummary: parsed.thinkingSummary,
    actionDescription: parsed.actionDescription,
    provider: input.settings.provider,
    model: input.settings.model.trim(),
    matchedWorldbookEntries,
  };
}

export async function testAiConnection(
  settings: AiSettings,
): Promise<{ ok: true; text: string } | never> {
  await generateCharacterReply({
    settings: { ...settings, streaming: false },
    character: null,
    characterProfile: {
      nickname: '测试角色',
      relationship: '测试关系',
      callMe: '朋友',
      bio: '连接测试',
    },
    persona: null,
    worldbooks: [],
    messages: [],
    userMessage: '请只回复两个字：已连接',
  });

  return { ok: true, text: '已连接' };
}


export interface CreativeTextInput {
  settings: AiSettings;
  systemPrompt: string;
  userPrompt: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  temperature?: number;
  onDelta?: (delta: string) => void;
  timeoutMs?: number;
}

export async function generateCreativeText(input: CreativeTextInput): Promise<string> {
  requireApiKey(input.settings);
  const temperature = Math.max(0, Math.min(2, input.temperature ?? input.settings.temperature ?? 0.85));
  const history = input.history || [];

  const proxyChat = async () => {
    const response = await fetch('/api/ai-models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'chat',
        provider: input.settings.provider,
        baseUrl: input.settings.apiBaseUrl,
        apiKey: input.settings.apiKey.trim(),
        model: input.settings.model.trim(),
        systemPrompt: input.systemPrompt,
        userPrompt: input.userPrompt,
        history,
      }),
    });
    if (!response.ok) throw new Error('AI_PROXY_' + response.status + ': ' + await readError(response));
    const data = await response.json();
    const text = input.settings.provider === 'gemini' ? extractGeminiText(data).trim() : extractOpenAiText(data).trim();
    if (!text) throw new Error('AI_EMPTY_RESPONSE');
    input.onDelta?.(text);
    return text;
  };

  try {
    if (input.settings.provider === 'gemini') {
      const base = (input.settings.apiBaseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
      const action = input.settings.streaming ? 'streamGenerateContent' : 'generateContent';
      const suffix = input.settings.streaming ? '?alt=sse' : '';
      const endpoint = base + '/models/' + encodeURIComponent(input.settings.model.trim()) + ':' + action + suffix;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': input.settings.apiKey.trim() },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.systemPrompt }] },
          contents: [
            ...history.map(message => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] })),
            { role: 'user', parts: [{ text: input.userPrompt }] },
          ],
          generationConfig: { temperature, maxOutputTokens: 2200 },
        }),
      });
      if (!response.ok) throw new Error('AI_GEMINI_' + response.status + ': ' + await readError(response));
      if (input.settings.streaming) return parseSseResponse(response, extractGeminiText, input.onDelta);
      const data = await response.json();
      const text = extractGeminiText(data).trim();
      input.onDelta?.(text);
      return text;
    }

    const endpoint = normalizeOpenAiEndpoint(input.settings.apiBaseUrl);
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + input.settings.apiKey.trim(),
      },
      body: JSON.stringify({
        model: input.settings.model.trim(),
        stream: Boolean(input.settings.streaming),
        temperature,
        max_tokens: Math.max(128, Math.min(12000, Number(input.settings.maxOutputTokens) || 2200)),
        messages: [
          { role: 'system', content: input.systemPrompt },
          ...history,
          { role: 'user', content: input.userPrompt },
        ],
      }),
    }, input.timeoutMs ?? 30000);
    if (!response.ok) throw new Error('AI_OPENAI_' + response.status + ': ' + await readError(response));
    if (input.settings.streaming) return parseSseResponse(response, extractOpenAiText, input.onDelta);
    const data = await response.json();
    const text = extractOpenAiText(data).trim();
    input.onDelta?.(text);
    return text;
  } catch (error) {
    // A local Docker endpoint must stay in the browser. Vercel cannot reach
    // the user's localhost, so proxying localhost requests only creates a hang.
    if (!isLocalAiBaseUrl(input.settings.apiBaseUrl) &&
        (error instanceof TypeError || /Failed to fetch|NetworkError|Load failed|CORS/i.test(String(error)))) {
      return proxyChat();
    }
    throw error;
  }
}

export async function listOpenAiCompatibleModels(
  settings: AiSettings,
): Promise<string[]> {
  if (!settings.apiKey.trim()) throw new Error('AI_NOT_CONFIGURED');

  let base = (
    settings.apiBaseUrl.trim() ||
    (settings.provider === 'gemini'
      ? 'https://generativelanguage.googleapis.com/v1beta'
      : '')
  ).replace(/\/+$/, '');
  if (!base) throw new Error('AI_BASE_URL_MISSING');

  base = base
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/responses$/i, '')
    .replace(/\/models$/i, '')
    .replace(/\/+$/, '');

  const endpoint = base + '/models';
  let response: Response | null = null;
  let directError: unknown = null;

  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + settings.apiKey.trim(),
      },
    }, 15000);
  } catch (error) {
    directError = error;
  }

  // Gemini discovery uses the server-side proxy. Local Docker OpenAI-compatible
  // endpoints must remain browser-side because a Vercel function cannot reach
  // the user's localhost.
  if (settings.provider === 'gemini' || (!response && !isLocalAiBaseUrl(base))) {
    try {
      response = await fetch('/api/ai-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'models',
          provider: settings.provider,
          baseUrl: base,
          apiKey: settings.apiKey.trim(),
        }),
      });
    } catch (proxyError) {
      throw new Error(
        'AI_MODELS_NETWORK: ' +
        (proxyError instanceof Error
          ? proxyError.message
          : directError instanceof Error
            ? directError.message
            : '无法连接模型接口'),
      );
    }
  }

  if (!response) {
    throw new Error('AI_MODELS_NETWORK: ' + (directError instanceof Error ? directError.message : '无法连接模型接口'));
  }

  if (!response.ok) {
    throw new Error('AI_MODELS_' + response.status + ': ' + await readError(response));
  }

  const data = await response.json();
  const rawModels =
    Array.isArray(data?.data) ? data.data :
    Array.isArray(data?.models) ? data.models :
    Array.isArray(data) ? data :
    [];

  const models = rawModels
    .map((item: any) => typeof item === 'string' ? item : item?.id || item?.name)
    .filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
    .map((id: string) => id.trim())
    .map((id: string) => settings.provider === 'gemini' ? id.replace(/^models\//i, '') : id);

  return Array.from(new Set(models));
}


export async function summarizeConversationMemory(
  settings: AiSettings,
  characterName: string,
  currentMemory: CharacterMemory,
  messages: Array<{ sender: string; text?: string; transcript?: string }>,
): Promise<{ summary: string; items: Array<{ content: string; kind: 'fact' | 'diary' | 'relationship' | 'preference' | 'event'; importance: number }> }> {
  const appSettings = readAppSettings();
  if (!appSettings.memoryEnabled) return { summary: currentMemory.summary, items: [] };

  const conversation = messages
    .slice(-Math.max(10, appSettings.memoryContextMessages || 40))
    .map(message => {
      const speaker = message.sender === 'other' ? characterName : message.sender === 'me' ? '用户' : '系统';
      return speaker + ': ' + (message.text || message.transcript || '[媒体消息]');
    })
    .join('\n');

  const mode = appSettings.memoryMode || 'hybrid';
  const roleModel =
    mode === 'diary' ? appSettings.memoryDiaryModel.trim() :
    mode === 'facts' ? appSettings.memoryFactsModel.trim() :
    mode === 'relationship' ? appSettings.memoryRelationshipModel.trim() :
    '';
  const model = roleModel || appSettings.memoryModel.trim() || settings.model;
  const memorySettings: AiSettings = { ...settings, model, temperature: appSettings.memoryTemperature };
  const modeInstruction =
    mode === 'diary' ? '重点整理成关系日记：记录发生了什么、氛围与值得记住的经历，不虚构用户感受。' :
    mode === 'facts' ? '重点整理成结构化事实：偏好、承诺、关系变化、持续事件、稳定人物信息，每条尽量一句话。' :
    mode === 'relationship' ? '重点整理关系状态：关键事件、关系变化、未完成约定。' :
    '混合提取稳定事实、关系变化、重要事件和少量值得保留的互动日记。';

  const systemPrompt = [
    '你是 Sane333 的长期记忆引擎，不是聊天角色。',
    '把聊天记录压缩成以后仍然有用的长期上下文。',
    modeInstruction,
    '只记录聊天中有证据支持的内容；禁止猜测、脑补或替用户决定感受。',
    '与已有记忆重复的内容要合并或跳过。',
    '输出严格 JSON，不要 Markdown。',
    JSON.stringify({ summary: '80-220 字长期摘要', items: [{ content: '一条长期记忆', kind: 'fact', importance: 80 }] }),
  ].join('\n');

  const userPrompt = [
    '【角色】' + characterName,
    '【模式】' + mode,
    '【已有长期摘要】' + (currentMemory.summary || '暂无'),
    '【已有重要记忆】',
    currentMemory.items.slice(0, 25).map(item => '- [' + (item.kind || 'fact') + '] ' + item.content).join('\n') || '暂无',
    '',
    '【最近聊天】',
    conversation || '暂无',
    '',
    '去重、合并、压缩，最多输出 12 条新记忆；重要度 0-100。',
  ].join('\n');

  const raw = await generateCreativeText({
    settings: memorySettings,
    systemPrompt,
    userPrompt,
    temperature: appSettings.memoryTemperature,
  });
  const cleaned = raw.trim().replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/i, '');
  const parsed = JSON.parse(cleaned);

  return {
    summary: typeof parsed?.summary === 'string' ? parsed.summary.trim() : currentMemory.summary,
    items: Array.isArray(parsed?.items)
      ? parsed.items.filter((item: any) => item && typeof item.content === 'string' && item.content.trim()).map((item: any) => ({
          content: item.content.trim(),
          kind: ['fact','diary','relationship','preference','event'].includes(item.kind) ? item.kind : (mode === 'diary' ? 'diary' : mode === 'relationship' ? 'relationship' : 'fact'),
          importance: Math.max(0, Math.min(100, Number(item.importance) || 50)),
        })).slice(0, 12)
      : [],
  };
}
