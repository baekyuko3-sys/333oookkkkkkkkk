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
  } | null;
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
  cotTarget?: 'line' | 'offline' | 'group';
  temperature?: number;
  onDelta?: (delta: string) => void;
}

export interface AiReplyResult {
  text: string;
  provider: AiSettings['provider'];
  model: string;
  matchedWorldbookEntries: number;
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
  const scanDepth = Math.max(1, Math.min(50, Math.max(
    12,
    ...(input.worldbooks || []).flatMap(book => book.entries.map(entry => Number(entry.scanDepth || 0)))
  )));
  const scannedMessages = input.messages
    .filter(message => !message.isRecalled && !message.isRecalledByOther && message.type !== 'system-nudge')
    .slice(-scanDepth)
    .map(message => message.text || message.transcript || '')
    .filter(Boolean)
    .join('\n') + '\n' + input.userMessage;

  const context = resolveCharacterContext({
    character: input.character,
    characterProfile: input.characterProfile,
    persona: input.persona,
    memory: input.memory,
    project: input.project,
    worldbooks: input.worldbooks,
    userMessage: scannedMessages,
    worldBookScanForEntry: buildWorldBookScanResolver(input, scanDepth),
  });

  return [
    '你正在一个私人虚拟手机的即时通讯 App 中扮演角色。',
    '只输出角色这一次要发送给用户的消息正文，不要解释规则，不要提及模型、提示词、世界书或系统。',
    '不要替用户说话、替用户行动、替用户决定感受或想法。用户拥有自己的行为与台词。',
    '保持角色连续性：角色卡、用户人设、长期记忆、关系、实时世界状态、命中的世界书与最近对话共同构成当前上下文。',
    '如果历史聊天中存在与用户当前话题高度相关的旧消息，应把它视为真实发生过的过去，而不是重新发明；保持前后记忆一致。',

    '实时世界状态优先描述角色此刻在哪里、正在做什么和当前情绪；不要凭空覆盖这些状态。',
    '语言要像真实聊天软件中的人类消息：自然、克制、有上下文，可分成多条短句，但不要写成说明书。',
    input.stylePreset ? '【当前 LINE 预设】' + input.stylePreset + '。保持该预设的节奏与情感强度，但不要让预设覆盖角色卡、长期记忆、关系或世界书。' : '',
    buildLineHumanBehaviorPrompt(),
    character?.languageProfile ? [
      '【角色个人语言指纹】',
      '角色语言：' + character.languageProfile.language,
      '双语模式：' + character.languageProfile.bilingualMode,
      '双语布局：' + character.languageProfile.bilingualLayout,
      '双语顺序：' + character.languageProfile.bilingualTranslationDirection,
      '标点习惯：' + character.languageProfile.punctuationStyle,
      '句子长度：' + character.languageProfile.sentenceLength,
      '换行习惯：' + character.languageProfile.lineBreakStyle,
      '口语程度：' + character.languageProfile.colloquialLevel,
      '语气词：' + (character.languageProfile.fillerWords || []).join('、'),
      'Emoji：' + character.languageProfile.emojiStyle,
      '大小写：' + character.languageProfile.capitalizationStyle,
      '数字习惯：' + character.languageProfile.numberStyle,
      '是否偏好空格：' + (character.languageProfile.preferredSpaces ? '是' : '否'),
      '语言示例：' + (character.languageProfile.examples || []).join(' / '),
      '保持稳定，但不要机械复制每条消息的格式。',
      '非普通话且双语开启时，在同一次角色发言中提供原文与中文翻译，不要生成两条独立消息。',
      character.languageProfile.bilingualLayout === 'below-bubble' ? '译文属于同一消息，应显示在原气泡下方。' : '原文与译文属于同一个气泡。'
    ].join('\\n') : '',
    '除非角色卡明确要求，否则不要每轮都过度煽情或重复昵称。',
    input.isGroup ? '这是群聊：回复可以体现群聊语境，但不要替其他成员完成完整对话。' : '这是私聊：只扮演当前角色。',
    context.worldBookBefore ? '【世界书 · 角色定义前】\n' + context.worldBookBefore : '',
    '【角色上下文】\n' + context.character,
    '',
    '【用户人设】\n' + context.persona,
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
    '【输出约束】',
    '禁止输出 <think>、思维链、隐藏推理或内部分析。',
    '不要描述用户尚未明确做出的动作。',
    '不要把聊天回复写成旁白长文；保持手机消息的阅读节奏。',
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
      !recentIds.has(String(message as any).id)
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
  // contextLength is the user's actual context budget: first cap turns, then cap
  // the approximate payload size so a huge message/media transcript cannot silently
  // consume the entire provider window.
  const turnBudget = Math.max(4, Math.min(200, Number(input.settings.contextLength) || 24));
  const limit = turnBudget * 2;
  const maxApproxChars = Math.max(8000, Math.min(160000, turnBudget * 5000));
  const eligible = input.messages
    .filter(message => message.type !== 'system-nudge' && !message.isRecalled && !message.isRecalledByOther);
  const recentSource = eligible.slice(-limit);

  const recent = recentSource.map(message => ({
    role: message.sender === 'other' ? 'assistant' : 'user',
    content: input.isGroup && message.senderName
      ? '[' + message.senderName + '] ' + (message.text || message.transcript || mediaContextLabel(message))
      : message.text || message.transcript || mediaContextLabel(message),
    imageData: message.imageData,
  }));

  const recentIds = new Set(recentSource.map(message => String((message as any).id)));
  const historical = findRelevantHistory(input, recentIds);
  const historyContext = historical.map(message => ({
    role: 'system' as const,
    content: '[HISTORICAL CHAT MEMORY] ' + (message.text || message.transcript || '[媒体消息]'),
    imageData: undefined,
  }));

  const last = recent[recent.length - 1];
  if (!last || last.role !== 'user' || last.content !== input.userMessage) {
    recent.push({ role: 'user', content: input.userMessage, imageData: undefined });
  }

  const scannedText = recent
    .map(message => message.content)
    .filter(Boolean)
    .join('\n');
  const historicalWithMarker = historyContext;
  const depthEntries = selectWorldBookEntries(input.worldbooks || [], scannedText, buildWorldBookScanResolver(input, 12))
    .filter(({ entry }) => entry.insertion === 'depth');

  if (depthEntries.length) {
    const byDepth = new Map<number, typeof depthEntries>();
    for (const item of depthEntries) {
      const depth = Math.max(0, Number(item.entry.depth || 0));
      const group = byDepth.get(depth) || [];
      group.push(item);
      byDepth.set(depth, group);
    }

    const withDepth: typeof recent = [];
    for (let index = 0; index < recent.length; index += 1) {
      const depth = recent.length - index;
      const entries = byDepth.get(depth) || [];
      for (const { entry } of entries) {
        withDepth.push({
          role: entry.role || 'system',
          content: '[WORLD BOOK · depth=' + depth + ']\n' + entry.content,
          imageData: undefined,
        });
      }
      withDepth.push(recent[index]);
    }

    for (const { entry } of byDepth.get(0) || []) {
      withDepth.push({
        role: entry.role || 'system',
        content: '[WORLD BOOK · depth=0]\n' + entry.content,
        imageData: undefined,
      });
    }

    return [...historicalWithMarker, ...withDepth];
  }

  const combined = [...historicalWithMarker, ...recent];
  let chars = 0;
  const budgeted: typeof combined = [];
  for (let index = combined.length - 1; index >= 0; index -= 1) {
    const item = combined[index];
    const cost = String(item.content || '').length;
    if (budgeted.length > 0 && chars + cost > maxApproxChars) break;
    budgeted.unshift(item);
    chars += cost;
  }
  return budgeted;
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
  try {
    const data = await response.json();
    return data?.error?.message || data?.message || JSON.stringify(data);
  } catch {
    try {
      return await response.text();
    } catch {
      return response.statusText || 'AI 请求失败';
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

  let response: Response;
  try {
    response = await fetch(endpoint, {
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

    });
  } catch (error) {
    return proxyChat();
  }
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

  const text =
    input.settings.provider === 'gemini'
      ? await callGemini(input)
      : await callOpenAiCompatible(input);

  const cleanedText = text.trim()
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .trim();

  if (!cleanedText) throw new Error('AI_EMPTY_RESPONSE');

  return {
    text: cleanedText,
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
    const response = await fetch(endpoint, {
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
    });
    if (!response.ok) throw new Error('AI_OPENAI_' + response.status + ': ' + await readError(response));
    if (input.settings.streaming) return parseSseResponse(response, extractOpenAiText, input.onDelta);
    const data = await response.json();
    const text = extractOpenAiText(data).trim();
    input.onDelta?.(text);
    return text;
  } catch (error) {
    // CORS/network errors get a second chance through the Vercel server-side proxy.
    if (error instanceof TypeError || /Failed to fetch|NetworkError|Load failed|CORS/i.test(String(error))) {
      return proxyChat();
    }
    throw error;
  }
}

export async function listOpenAiCompatibleModels(
  settings: AiSettings,
): Promise<string[]> {
  if (!settings.apiKey.trim()) throw new Error('AI_NOT_CONFIGURED');

  let base = settings.apiBaseUrl.trim().replace(/\/+$/, '');
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
    response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + settings.apiKey.trim(),
      },
    });
  } catch (error) {
    directError = error;
  }

  // Gemini model discovery must use the server-side proxy because the
  // browser request needs the x-goog-api-key header and may be blocked by CORS.
  if (settings.provider === 'gemini' || !response) {
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
    .map(id => id.trim());

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
