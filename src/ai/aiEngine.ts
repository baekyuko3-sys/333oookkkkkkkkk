import type { ImportedCharacter } from '../data/characterImport';
import type { ProjectManifest, WorldBook } from '../types';
import type { CharacterMemory, MemorySection } from '../store/characterMemory';
import type { StatusBarPreset } from '../store/statusBarPresets';
import { extractStatusMatch } from '../store/statusBarPresets';
import { buildMemoryContext } from '../store/characterMemory';
import type { AppSettings, ChannelAiSettings } from '../store/appSettings';
import { readAppSettings } from '../store/appSettings';
import { getCharacterAiProfile, mergeCharacterAiSettings } from '../store/characterAiProfiles';
import { resolveCharacterContext, selectWorldBookEntries } from './contextEngine';
import { getCotForTarget, type CotPreset } from '../store/cotPresets';
import { buildLineHumanBehaviorPrompt } from '../store/lineReality';
import { pushAiDebugLog, writeAiDebugTrace } from '../store/aiDebug';
import { resolveMacros, type MacroNames } from './macros';

export type AiSettings = Pick<AppSettings, 'provider' | 'apiBaseUrl' | 'apiKey' | 'model' | 'streaming' | 'contextLength' | 'maxOutputTokens' | 'autoSave' | 'temperature' | 'topP' | 'topK' | 'frequencyPenalty' | 'presencePenalty' | 'seed'>;

function macroNamesOf(input: AiReplyInput): MacroNames {
  return {
    char: input.character?.name || input.characterProfile?.nickname,
    user: input.persona?.name,
  };
}

export interface AiReplyInput {
  settings: AiSettings;
  character?: ImportedCharacter | null;
  characterProfile: {
    nickname: string;
    relationship: string;
    callMe: string;
    bio?: string;
    canCharacterSelfJudge?: boolean;
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
  cotPreset?: Pick<CotPreset, 'id' | 'title' | 'template' | 'tag'>;
  statusBarPreset?: Pick<StatusBarPreset, 'name' | 'promptSuffix' | 'regex' | 'html'>;
  temperature?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  seed?: number | null;
  onDelta?: (delta: string) => void;
  debugConversationId?: string;
}

export interface AiReplyResult {
  text: string;
  thinkingSummary?: string;
  actionDescription?: string;
  statusBarRaw?: string;
  rawResponse?: string;
  provider: AiSettings['provider'];
  model: string;
  matchedWorldbookEntries: number;
}

export function parseAiReplyPayload(
  rawText: string,
  cotTag?: string,
  statusRegex?: string,
): Pick<AiReplyResult, 'text' | 'thinkingSummary' | 'actionDescription' | 'statusBarRaw'> {
  const raw = String(rawText || '').replace(/\r\n/g, '\n').trim();
  const readTag = (name: string, source: string = raw): string => {
    const match = source.match(new RegExp('<' + name + '>\\s*([\\s\\S]*?)\\s*</' + name + '>', 'i'));
    return match ? match[1].trim() : '';
  };
  const readBracket = (name: string, source: string = raw): string => {
    const match = source.match(new RegExp('\\[' + name + '\\]\\s*([\\s\\S]*?)\\s*\\[\\/' + name + '\\]', 'i'));
    return match ? match[1].trim() : '';
  };
  const readTitled = (name: string, source: string = raw): string => {
    const match = source.match(new RegExp('【' + name + '】\\s*([\\s\\S]*?)(?=【(?:COT|动作|状态栏)】|$)', 'i'));
    return match ? match[1].trim() : '';
  };
  const customTagName = cotTag?.match(/^<([A-Za-z][\\w:-]*)>/)?.[1] || '';
  const thinkingSummary = (customTagName ? readTag(customTagName) : '') ||
    readTag('thinking') || readTag('cot') || readTag('think') || readTag('thought') ||
    readTag('summary') || readTag('decision') || readTag('decision_summary') ||
    readBracket('COT') || readTitled('COT') || '';
  let withoutMetadata = raw;
  const metadataTags = new Set(['think','thought','thinking','cot','summary','decision','decision_summary']);
  if (customTagName) metadataTags.add(customTagName);
  for (const tag of metadataTags) {
    withoutMetadata = withoutMetadata.replace(new RegExp('<' + tag + '>[\\s\\S]*?</' + tag + '>', 'gi'), '');
  }
  withoutMetadata = withoutMetadata.replace(/\[COT\][\s\S]*?\[\/COT\]/gi, '').replace(/【COT】[\s\S]*?(?=【(?:动作|状态栏)】|$)/gi, '');
  const actionDescription = readTag('action', withoutMetadata) || readBracket('动作', withoutMetadata) || readTitled('动作', withoutMetadata) || '';
  const statusMatch = withoutMetadata.match(/\[状态栏\]\s*([\s\S]*?)\s*\[\/状态栏\]/i) ||
    withoutMetadata.match(/<status(?:bar)?>\s*([\s\S]*?)\s*<\/status(?:bar)?>/i) ||
    withoutMetadata.match(/【状态栏】\s*([\s\S]*?)(?=【(?:动作|COT)】|$)/i);
  let statusBarRaw = statusMatch?.[1]?.trim() || '';
  if (!statusBarRaw && statusRegex) {
    const extracted = extractStatusMatch(withoutMetadata, statusRegex);
    if (extracted?.match) {
      statusBarRaw = extracted.match.trim();
      withoutMetadata = withoutMetadata.replace(extracted.match, '').trim();
    }
  }
  withoutMetadata = withoutMetadata.replace(/\[状态栏\][\s\S]*?\[\/状态栏\]/gi, '').replace(/<status(?:bar)?>[\s\S]*?<\/status(?:bar)?>/gi, '').replace(/【状态栏】[\s\S]*?(?=【(?:动作|COT)】|$)/gi, '');
  const messageMatch = /<message>\s*([\s\S]*?)\s*<\/message>/i.exec(withoutMetadata);
  const text = (messageMatch?.[1] || withoutMetadata.replace(/<action>[\s\S]*?<\/action>/gi, '').replace(/\[动作\][\s\S]*?\[\/动作\]/gi, '').replace(/【动作】[\s\S]*?(?=【(?:状态栏|COT)】|$)/gi, '').replace(/<message>[\s\S]*?<\/message>/gi, '')).trim();
  return { text, thinkingSummary: thinkingSummary || undefined, actionDescription: actionDescription || undefined, statusBarRaw: statusBarRaw || undefined };
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
    topP: settings.topP,
    topK: settings.topK,
    frequencyPenalty: settings.frequencyPenalty,
    presencePenalty: settings.presencePenalty,
    seed: settings.seed,
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
    topP: override.topP,
    topK: override.topK,
    frequencyPenalty: override.frequencyPenalty,
    presencePenalty: override.presencePenalty,
    seed: override.seed,
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
    topP: settings.topP,
    topK: settings.topK,
    frequencyPenalty: settings.frequencyPenalty,
    presencePenalty: settings.presencePenalty,
    seed: settings.seed,
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
  // The chat screen owns the active COT selection. Only fall back to the global
  // assignment when the caller does not provide the conversation's selected preset.
  const cotPreset = input.cotPreset || getCotForTarget(cotTarget);
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

  const includeCharacterGreeting = input.messages.length === 0;
  const context = resolveCharacterContext({
    character: scopedInput.character,
    characterProfile: scopedInput.characterProfile,
    persona: scopedInput.persona,
    memory: scopedInput.memory,
    project: scopedInput.project,
    worldbooks: applicableWorldBooks,
    userMessage: scannedMessages,
    includeCharacterGreeting,
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
    '【角色自主判断】' + (input.characterProfile.canCharacterSelfJudge !== false
      ? '开启：角色可以基于自己的性格、经历、关系和当前情境形成自己的判断与反应，不需要迎合用户，也不要套用统一模板。'
      : '关闭：角色不要主动改变既有关系判断；仍须遵守角色设定与当前情境。'),
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
    cotPreset ? [
      '【COT 角色回复决策器】先完成角色判断，再输出角色消息：结合当前消息与最近上下文 → 角色设定/关系 → 用户真实意图 → 角色情绪与立场 → 决定自然回应方式与长度 → 检查 OOC/未知信息/是否替用户行动。不要展示隐藏推理。',
      '状态栏不是 COT 的 STEP。状态栏属于本轮角色回复的末尾输出层。',
      '原始预设如下：',
      cotPreset.template
    ].join('\\n') : '【内部生成预设】无。',
    '',
    '【当前任务 · 绝对最高优先级】',
    '你只能回答当前用户消息，不要替当前用户补写下一句，也不要自行延续旧话题。',
    input.statusBarPreset ? '在完成当前角色回复后，再执行状态栏 Prompt；状态栏字段中的自然语言指令必须被“执行”，不能被当成需要复制的模板文字。' : '',
    '下面这条才是本轮必须处理的用户消息：',
    '<<<CURRENT_USER_MESSAGE>>>',
    input.userMessage,
    '<<<END_CURRENT_USER_MESSAGE>>>',
    '如果旧聊天、记忆、世界书、关系设定与当前消息冲突，当前消息决定本轮要回答什么；其他资料只用于角色身份、事实连续性和语气。',
    '不要因为旧消息里出现过的问题、请求或关键词，就再次回答那个旧问题。',
    '',
    '【输出约束】',
    '禁止输出原始 <think>、<thought> 或隐藏推理。COT 不是原始内部思维链，而是给用户看的简短“角色决策记录”：只写高层次判断，不写隐性推理细节。',
    input.cotTarget && cotPreset ? [
      '【COT 强制输出】本轮 COT 已开启，这是硬性输出协议，不允许省略。',
      '你必须先输出一段 1～3 句的高层角色决策记录，再输出角色消息；这段记录不是隐藏思维链，只能写简短、可展示的角色判断摘要。',
      'COT 必须严格使用标签：' + cotPreset.tag + '。如果当前标签示例是 <cot>...</cot>，实际输出必须是 <cot>具体摘要</cot>，不能输出省略号。',
      'COT 标签必须出现在 <message> 之前。不能只输出 <message> 而省略 COT。',
      'COT 与聊天正文严格分离；最终可见聊天正文必须放在 <message>...</message> 中。',
      '正确格式示例：' + cotPreset.tag.replace('...', '判断用户这句话的意思，并决定角色此刻最自然的回应方式。') + '<message>角色真正会发送的消息。</message>',
    ].join('\\n') : '',
    '不要描述用户尚未明确做出的动作。',
    '不要把聊天回复写成旁白长文；保持手机消息的阅读节奏。',
    '不要用“角色动作 + 长段心理描写 + 一大段台词”代替聊天消息；动作描写如果开启必须单独放进 <action>...</action>，正文仍然是正常聊天消息。',
    input.authorNote?.includes('【线上动作描写：开启】') ? '【动作描写】开启。动作是角色线上聊天时可被感知的行为层；每轮必须判断是否有自然、有信息量的线上反应。若有，输出一条简短具体的 <action>...</action>，例如停顿、删改重写、看完后迟疑、输入后又删掉等；若当前语境确实没有值得表现的动作，可输出极短的“停了一下”类反应，但禁止长篇旁白、禁止替用户行动。动作必须与正文分离。' : '【动作描写】关闭。不要输出 <action> 标签，也不要额外写动作旁白。',
    input.authorNote?.includes('【思考摘要：开启】') ? '【思考摘要】开启。必须输出一句或两句高层次角色决策摘要，不得省略；不要输出逐步推理或隐藏思维链。摘要必须使用 <summary>...</summary>。' : '【思考摘要】关闭。不要输出 <summary> 标签。',
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
    '',
    '【输出协议】',
    input.cotTarget && cotPreset
      ? 'COT 开启：输出 1～3 句可展示的高层角色决策摘要，使用当前预设标签 ' + cotPreset.tag + '。这是角色判断摘要，不是原始隐藏思维链。'
      : 'COT 关闭：不要输出 COT 标签。',
    input.authorNote?.includes('【线上动作描写：开启】')
      ? '动作描写开启：如果角色这一轮有自然动作/反应，输出一条简短具体的 <action>...</action>；不要把动作写成长篇旁白。'
      : '动作描写关闭：不要输出 <action>。',
    '正文直接输出正常角色聊天消息。<message>...</message> 不是必需格式；如果模型使用它，解析器会自动剥离外壳。',
    'COT、动作和正文是三个独立层，不要把 COT 或动作混进正文。',
    '不要输出 Markdown 代码块，不要输出格式说明。',
    input.statusBarPreset ? [
      '【状态栏｜本轮回复末尾的原始输出】',
      '本轮状态栏已开启。你必须先正常完成角色聊天正文，然后在同一次 AI 回复的最末尾追加状态栏原文。',
      '【状态栏 Prompt】是当前预设唯一的内容与格式规则，必须严格执行。不要擅自改成其他字段、JSON、自然语言或固定模板。',
      '注意：状态栏 Prompt 可能把“如何生成一个字段”的自然语言指令直接写在 Q=、A=、time= 等字段后面。字段后的文字是“该字段的生成指令”，不是要原样复制到输出里的答案。',
      '你必须逐字段执行这些指令：先理解每个字段要求什么，再把字段值生成出来，最后只输出真正生成后的值。',
      '例如 Prompt 写成“Q=请提出一个问题”时，输出应是实际的问题；写成“A=请以角色口吻回答Q”时，输出应是角色真正的回答，而不是“请以角色口吻回答Q”这句话，更不能输出“……”或“...”占位。',
      '时间字段同理：如果字段要求“当前时间/早于当前5分钟/指定格式”，必须计算并输出真实时间值，而不是复制 Prompt 里的示例时间。',
      '输出前必须自检：每一个字段都已经从“指令文字”变成了实际值；禁止出现模板指令原文、说明文字、……、...、TODO、待填写等占位内容。',
      '不要额外添加 [状态栏]、<status> 等包装；除非当前 Prompt 自己要求，否则不要添加任何外壳。',
      '必须让状态栏原文能够被【本次预设 Regex】直接捕获。Regex 每个预设都可能不同，只认当前预设提供的 Regex。',
      '当前状态栏名称：' + input.statusBarPreset.name,
      '当前状态栏 Prompt：' + (input.statusBarPreset.promptSuffix || ''),
      '当前预设 Regex：' + (input.statusBarPreset.regex || ''),
      '状态栏只描述角色自己的当前状态，不要替用户编造动作、想法或事实。',
      '输出顺序必须是：角色正常消息 → 状态栏原文。状态栏必须在整次回复的最后。',
    ].join('\n') : '【状态栏】关闭：不要输出状态栏。',
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
  idleTimeoutMs = 45000,
  onReasoning?: (delta: string) => void,
  extractReasoning?: (data: any) => string,
): Promise<string> {
  if (!response.body) {
    const data = await response.json();
    const text = extractText(data).trim();
    const reasoning = extractReasoning?.(data) || '';
    if (reasoning) onReasoning?.(reasoning);
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
      const reasoning = extractReasoning?.(data) || '';
      if (reasoning) onReasoning?.(reasoning);
      if (delta) {
        fullText += delta;
        onDelta?.(delta);
      }
    } catch {
      // Ignore non-JSON SSE comments/keep-alives.
    }
  };

  let lastChunkAt = Date.now();
  while (true) {
    const readPromise = reader.read();
    const timeoutPromise = new Promise<{ value: undefined; done: true }>((_, reject) => {
      const timer = window.setTimeout(() => reject(new Error('AI_STREAM_TIMEOUT: 流式接口连续 ' + Math.round(idleTimeoutMs / 1000) + ' 秒没有收到新数据')), idleTimeoutMs);
      readPromise.finally(() => window.clearTimeout(timer));
    });
    const { value, done } = await Promise.race([readPromise, timeoutPromise]);
    if (done) break;
    lastChunkAt = Date.now();
    void lastChunkAt;
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
    .flatMap((value: unknown) => {
      if (typeof value === 'string') return [value];
      if (Array.isArray(value)) {
        return value
          .map((part: any) => typeof part === 'string' ? part : (typeof part?.text === 'string' ? part.text : ''))
          .filter(Boolean);
      }
      return [];
    })
    .join('');
}

function extractOpenAiReasoning(data: any): string {
  return (data?.choices || [])
    .flatMap((choice: any) => [
      choice?.message?.reasoning_content, choice?.message?.reasoning, choice?.message?.thinking,
      choice?.delta?.reasoning_content, choice?.delta?.reasoning, choice?.delta?.thinking,
    ])
    .flatMap((value: unknown) => {
      if (typeof value === 'string') return [value];
      if (Array.isArray(value)) return value.flatMap((part: any) =>
        typeof part === 'string' ? [part] :
        typeof part?.text === 'string' ? [part.text] :
        typeof part?.content === 'string' ? [part.content] : []
      );
      return [];
    })
    .filter(Boolean)
    .join('');
}

function extractGeminiReasoning(data: any): string {
  return (data?.candidates || [])
    .flatMap((candidate: any) => candidate?.content?.parts || [])
    .filter((part: any) => part?.thought === true || part?.type === 'thought' || part?.type === 'reasoning')
    .map((part: any) => typeof part?.text === 'string' ? part.text : '')
    .filter(Boolean)
    .join('');
}

function wrapProviderReasoning(text: string, reasoning: string): string {
  const cleanText = String(text || '').trim();
  const cleanReasoning = String(reasoning || '').trim();
  if (!cleanReasoning || /<(?:think|thinking|thought|cot|summary|decision|decision_summary)>/i.test(cleanText)) return cleanText;
  return '<cot>' + cleanReasoning + '</cot>' + cleanText;
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

  const macroNames = macroNamesOf(input);
  const system = resolveMacros(buildCharacterSystemPrompt(input), macroNames);
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: buildConversationMessages(input).map(message => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [
        { text: resolveMacros(message.content, macroNames) },
        ...(message.imageData ? (() => {
          const match = message.imageData.match(/^data:([^;]+);base64,(.+)$/);
          return match ? [{ inlineData: { mimeType: match[1], data: match[2] } }] : [];
        })() : []),
      ],
    })),
    generationConfig: {
      temperature: Math.max(0, Math.min(2, input.temperature ?? input.settings.temperature ?? 0.85)),
      topP: Math.max(0, Math.min(1, input.topP ?? input.settings.topP ?? 0.95)),
      topK: Math.max(1, Math.min(100, input.topK ?? input.settings.topK ?? 40)),
      maxOutputTokens: Math.max(128, Math.min(12000, Number(input.settings.maxOutputTokens) || 1200)),
    },
  };

  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': settings.apiKey.trim(),
    },
    body: JSON.stringify(body),
  }, 30000);

  if (!response.ok) throw new Error('AI_GEMINI_' + response.status + ': ' + await readError(response));

  if (settings.streaming) {
    let rawStream = '';
    const revealMessage = (delta: string) => {
      rawStream += delta;

      // Do not wait for <message>. Many OpenAI-compatible models return perfectly
      // valid plain text (or only COT/action metadata) without that wrapper. The
      // old streamer therefore looked like "no reply" until the request finished.
      // Keep metadata hidden while revealing the actual chat text as it arrives.
      let visible = rawStream;
      const messageMatch = rawStream.match(/<message>\s*([\s\S]*)$/i);
      if (messageMatch) {
        visible = messageMatch[1];
      } else {
        visible = visible
          .replace(/<(?:cot|thinking|think|thought|summary|decision|decision_summary)>[\s\S]*?(?:<\/(?:cot|thinking|think|thought|summary|decision|decision_summary)>|$)/gi, '')
          .replace(/\\[COT\\][\s\S]*?(?:\\[\/COT\\]|$)/gi, '')
          .replace(/【COT】[\s\S]*?(?=【(?:动作|状态栏)】|$)/gi, '');
      }

      visible = visible
        .replace(/<action>[\s\S]*?<\/action>/gi, '')
        .replace(/\\[动作\\][\s\S]*?\\[\/动作\\]/gi, '')
        .replace(/【动作】[\s\S]*?(?=【(?:状态栏|COT)】|$)/gi, '')
        .replace(/<status(?:bar)?>[\s\S]*?<\/status(?:bar)?>/gi, '')
        .replace(/\\[状态栏\\][\s\S]*?\\[\/状态栏\\]/gi, '')
        .replace(/【状态栏】[\s\S]*?(?=【(?:动作|COT)】|$)/gi, '')
        .replace(/<\/message>[\s\S]*$/i, '')
        .trimStart();

      input.onDelta?.(visible);
    };
    let reasoningStream = '';
    const result = await parseSseResponse(response, extractGeminiText, revealMessage, 45000, (delta) => { reasoningStream += delta; }, extractGeminiReasoning);
    return wrapProviderReasoning(result, reasoningStream);
  }

  const data = await response.json();
  const text = extractGeminiText(data).trim();
  const result = wrapProviderReasoning(text, extractGeminiReasoning(data));
  input.onDelta?.(result);
  return result;
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
  const macroNames = macroNamesOf(input);
  const system = resolveMacros(buildCharacterSystemPrompt(input), macroNames);
  const body = {
    model: input.settings.model.trim(),
    stream: Boolean(input.settings.streaming),
    temperature: Math.max(0, Math.min(2, input.temperature ?? input.settings.temperature ?? 0.85)),
    top_p: Math.max(0, Math.min(1, input.topP ?? input.settings.topP ?? 0.95)),
    frequency_penalty: Math.max(-2, Math.min(2, input.frequencyPenalty ?? input.settings.frequencyPenalty ?? 0)),
    presence_penalty: Math.max(-2, Math.min(2, input.presencePenalty ?? input.settings.presencePenalty ?? 0)),
    ...(input.seed ?? input.settings.seed) !== null && (input.seed ?? input.settings.seed) !== undefined ? { seed: Number(input.seed ?? input.settings.seed) } : {},
    max_tokens: Math.max(128, Math.min(12000, Number(input.settings.maxOutputTokens) || 1200)),
    messages: [
      { role: 'system', content: system },
      ...buildConversationMessages(input).map(message => ({
        role: message.role,
        content: message.imageData
          ? [
              { type: 'text', text: resolveMacros(message.content, macroNames) },
              { type: 'image_url', image_url: { url: message.imageData } },
            ]
          : resolveMacros(message.content, macroNames),
      })),
    ],
  };

  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + input.settings.apiKey.trim(),
    },
    body: JSON.stringify(body),
  }, 30000);

  if (!response.ok) throw new Error('AI_OPENAI_' + response.status + ': ' + await readError(response));

  if (input.settings.streaming) {
    let rawStream = '';
    const revealMessage = (delta: string) => {
      rawStream += delta;
      const match = rawStream.match(/<message>\s*([\s\S]*)$/i);
      if (match) {
        const visible = match[1]
          .replace(/<action>[\s\S]*?<\/action>/gi, '')
          .replace(/<\/message>[\s\S]*$/i, '')
          .trimStart();
        input.onDelta?.(visible);
      }
    };
    let reasoningStream = '';
    const result = await parseSseResponse(response, extractOpenAiText, revealMessage, 45000, (delta) => { reasoningStream += delta; }, extractOpenAiReasoning);
    return wrapProviderReasoning(result, reasoningStream);
  }

  const data = await response.json();
  const text = extractOpenAiText(data).trim();
  const result = wrapProviderReasoning(text, extractOpenAiReasoning(data));
  input.onDelta?.(result);
  return result;
}

export async function generateCharacterReply(input: AiReplyInput): Promise<AiReplyResult> {
  const startedAt = Date.now();
  const cotEnabled = Boolean(input.cotTarget && input.cotPreset);
  const actionEnabled = input.authorNote?.includes('【线上动作描写：开启】') || false;
  const trace: any = {
    provider: input.settings.provider,
    model: input.settings.model,
    context: {
      characterId: input.character?.id,
      characterName: input.character?.name,
      userPersona: input.persona?.name,
      conversationId: input.debugConversationId,
      userMessage: input.userMessage,
      messageCount: input.messages.length,
    },
    stage: 'created',
    stages: [],
    switches: {
      cotEnabled,
      cotTarget: input.cotTarget || null,
      cotPreset: input.cotPreset ? { id: input.cotPreset.id, title: input.cotPreset.title, tag: input.cotPreset.tag } : null,
      actionEnabled,
      actionRule: actionEnabled ? '【线上动作描写：开启】' : '关闭',
    },
  };
  const saveTrace = () => writeAiDebugTrace({ ...trace, durationMs: Date.now() - startedAt });
  const markTraceStage = (stage: string, detail?: string) => {
    trace.stage = stage;
    trace.stages = [...(Array.isArray(trace.stages) ? trace.stages : []), {
      stage,
      at: new Date().toISOString(),
      ...(detail ? { detail: String(detail).slice(0, 500) } : {}),
    }].slice(-24);
    saveTrace();
  };

  // Validation is part of the trace too: a missing key/model should never look like
  // "the request vanished before AI". The caller still receives the same error.
  try {
    requireApiKey(input.settings);
    markTraceStage('config-ready', input.settings.provider + ' / ' + input.settings.model);
  } catch (error) {
    trace.error = { message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined };
    markTraceStage('config-error', trace.error.message);
    throw error;
  }

  // Write immediately so the debug panel is never blank, even if prompt construction,
  // the provider request, or parsing fails later in the turn.
  saveTrace();
  pushAiDebugLog({ level:'info', event:'request:start', message:'开始角色回复请求', provider:input.settings.provider, model:input.settings.model, meta:{ cot:cotEnabled, action:actionEnabled, conversationId: input.debugConversationId } });

  const worldbooks = input.worldbooks || [];
  const scanDepth = Math.max(1, Math.min(50, Math.max(12, ...worldbooks.flatMap(book => book.entries.map(entry => Number(entry.scanDepth || 0))))));
  const scannedText = input.messages
    .filter(message => !message.isRecalled && !message.isRecalledByOther && message.type !== 'system-nudge')
    .slice(-scanDepth)
    .map(message => message.text || message.transcript || '')
    .filter(Boolean)
    .join('\\n') + '\\n' + input.userMessage;
  const matchedWorldbookEntries = selectWorldBookEntries(worldbooks, scannedText, buildWorldBookScanResolver(input, scanDepth)).length;

  const providerInput: AiReplyInput = { ...input, onDelta: undefined };
  const debugSystemPrompt = buildCharacterSystemPrompt(providerInput);
  const debugMessages = buildConversationMessages(providerInput);
  trace.request = {
    system: debugSystemPrompt,
    messages: debugMessages,
    payload: input.settings.provider === 'gemini'
      ? {
          endpoint: ((input.settings.apiBaseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '')) +
            '/models/' + encodeURIComponent(input.settings.model.trim()) + ':' +
            (input.settings.streaming ? 'streamGenerateContent?alt=sse' : 'generateContent'),
          body: {
            systemInstruction: { parts: [{ text: debugSystemPrompt }] },
            contents: [
              ...debugMessages.map(message => ({
                role: message.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: message.content }],
              })),
              { role: 'user', parts: [{ text: input.userMessage }] },
            ],
            generationConfig: {
              temperature: Number(input.settings.temperature ?? 0.85),
              maxOutputTokens: Math.max(128, Math.min(12000, Number(input.settings.maxOutputTokens) || 2200)),
            },
          },
        }
      : {
          endpoint: normalizeOpenAiEndpoint(input.settings.apiBaseUrl),
          body: {
            model: input.settings.model.trim(),
            stream: Boolean(input.settings.streaming),
            temperature: Number(input.settings.temperature ?? 0.85),
            max_tokens: Math.max(128, Math.min(12000, Number(input.settings.maxOutputTokens) || 2200)),
            messages: [
              { role: 'system', content: debugSystemPrompt },
              ...debugMessages,
              { role: 'user', content: input.userMessage },
            ],
          },
        },
  };
  markTraceStage('request-prepared', 'messages=' + debugMessages.length + ', worldbookMatches=' + matchedWorldbookEntries);
  let rawText = '';
  try {
    markTraceStage('request-sending', input.settings.provider + ' / ' + input.settings.model);
    rawText = input.settings.provider === 'gemini'
      ? await callGemini(providerInput)
      : await callOpenAiCompatible(providerInput);
    markTraceStage('response-received', 'rawLength=' + String(rawText || '').length);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    trace.error = { message, stack: error instanceof Error ? error.stack : undefined };
    markTraceStage('request-error', message);
    pushAiDebugLog({ level:'error', event:'request:error', message, provider:input.settings.provider, model:input.settings.model, durationMs:Date.now()-startedAt });
    throw error;
  }

  trace.rawResponse = rawText;
  let parsedRaw = parseAiReplyPayload(rawText, input.cotPreset?.tag, input.statusBarPreset?.regex);
  const replyMacroNames = macroNamesOf(input);

  // A valid status payload is NOT a chat reply. Some models may obey the status
  // format but accidentally omit the normal character message, which previously
  // made the whole turn fail as AI_EMPTY_RESPONSE. Repair only this malformed case:
  // keep the exact status payload, add a natural character reply before it, and
  // re-parse the repaired single response. Normal turns still use one AI request.
  if (input.statusBarPreset?.regex?.trim() && parsedRaw.statusBarRaw && !parsedRaw.text.trim()) {
    pushAiDebugLog({
      level: 'error',
      event: '[SANE333 STATUS BAR] response-status-only',
      message: 'AI 只返回了状态栏，没有正常角色回复；启动同回复修复',
      provider: input.settings.provider,
      model: input.settings.model,
      meta: {
        regex: input.statusBarPreset.regex,
        statusBarRaw: parsedRaw.statusBarRaw,
        userMessage: input.userMessage,
      },
    });

    const repairSystemPrompt = [
      debugSystemPrompt,
      '',
      '【回复结构修复】',
      '上一轮 AI 已经生成了正确的状态栏原文，但错误地没有生成正常角色聊天消息。',
      '这是一次格式修复，不是重新设计状态栏。',
      '必须先生成一段自然、符合当前角色人设的正常聊天回复，然后在整段回复最后原样追加下面提供的状态栏原文。',
      '不要修改、翻译、缩写或重新生成状态栏原文；不要把状态栏内容当成聊天回复。',
      '最终必须同时存在：正常角色聊天消息 + 状态栏原文。',
      '状态栏必须保持在整段输出的最后。',
      '【已经生成的状态栏原文】',
      parsedRaw.statusBarRaw,
    ].join('\n');

    const repairedRaw = (await generateCreativeText({
      settings: { ...input.settings, streaming: false },
      systemPrompt: repairSystemPrompt,
      userPrompt: input.userMessage,
      history: debugMessages,
      macroNames: replyMacroNames,
      temperature: Math.min(0.8, input.settings.temperature ?? 0.8),
    })).trim();

    const repairedParsed = parseAiReplyPayload(
      repairedRaw,
      input.cotPreset?.tag,
      input.statusBarPreset.regex,
    );

    pushAiDebugLog({
      level: repairedParsed.text.trim() && repairedParsed.statusBarRaw ? 'success' : 'error',
      event: '[SANE333 STATUS BAR] response-repair',
      message: repairedParsed.text.trim() && repairedParsed.statusBarRaw
        ? '同回复修复成功：正常角色回复与状态栏同时存在'
        : '同回复修复失败',
      provider: input.settings.provider,
      model: input.settings.model,
      meta: {
        originalStatus: parsedRaw.statusBarRaw,
        repairedRaw,
        repairedText: repairedParsed.text,
        repairedStatus: repairedParsed.statusBarRaw || '',
      },
    });

    if (repairedParsed.text.trim() && repairedParsed.statusBarRaw) {
      parsedRaw = repairedParsed;
      rawText = repairedRaw;
      trace.rawResponse = rawText;
      markTraceStage('response-repaired', 'status-only response repaired with normal chat text');
    }
  }

  const parsed = {
    text: resolveMacros(parsedRaw.text, replyMacroNames),
    thinkingSummary: parsedRaw.thinkingSummary ? resolveMacros(parsedRaw.thinkingSummary, replyMacroNames) : undefined,
    actionDescription: parsedRaw.actionDescription ? resolveMacros(parsedRaw.actionDescription, replyMacroNames) : undefined,
    statusBarRaw: parsedRaw.statusBarRaw ? resolveMacros(parsedRaw.statusBarRaw, replyMacroNames) : undefined,
    rawResponse: rawText,
  };
  trace.parsed = {
    thinkingSummary: parsed.thinkingSummary || null,
    actionDescription: parsed.actionDescription || null,
    statusBarRaw: parsed.statusBarRaw || null,
    rawResponseLength: rawText.length,
    text: parsed.text,
    hasCot: Boolean(parsed.thinkingSummary),
    hasAction: Boolean(parsed.actionDescription),
    expectedCot: cotEnabled,
    expectedAction: actionEnabled,
    missingCot: cotEnabled && !parsed.thinkingSummary,
    missingAction: actionEnabled && !parsed.actionDescription,
  };
  markTraceStage('parsed', 'textLength=' + parsed.text.length + ', cot=' + Boolean(parsed.thinkingSummary) + ', action=' + Boolean(parsed.actionDescription));

  if (!parsed.text) {

    trace.error = { message: 'AI_EMPTY_RESPONSE' };
    markTraceStage('parse-error', 'AI_EMPTY_RESPONSE');
    throw new Error('AI_EMPTY_RESPONSE');
  }

  if (!input.settings.streaming) input.onDelta?.(parsed.text);
  markTraceStage('final-ready', 'replyLength=' + parsed.text.length);
  trace.final = {
    text: parsed.text,
    thinkingSummary: parsed.thinkingSummary || null,
    actionDescription: parsed.actionDescription || null,
    statusBarRaw: parsed.statusBarRaw || null,
    matchedWorldbookEntries,
    expectedCot: cotEnabled,
    expectedAction: actionEnabled,
    hasCot: Boolean(parsed.thinkingSummary),
    hasAction: Boolean(parsed.actionDescription),
  };
  saveTrace();

  pushAiDebugLog({ level:'success', event:'request:success', message:'角色回复成功', provider:input.settings.provider, model:input.settings.model, durationMs:Date.now()-startedAt, meta:{ textLength:parsed.text.length, hasCot:Boolean(parsed.thinkingSummary), hasAction:Boolean(parsed.actionDescription), matchedWorldbookEntries } });
  return {
    text: parsed.text,
    thinkingSummary: parsed.thinkingSummary,
    actionDescription: parsed.actionDescription,
    statusBarRaw: parsed.statusBarRaw,
    rawResponse: rawText,
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
  macroNames?: MacroNames;
}

export async function generateCreativeText(input: CreativeTextInput): Promise<string> {
  const resolved: CreativeTextInput = {
    ...input,
    systemPrompt: resolveMacros(input.systemPrompt, input.macroNames),
    userPrompt: resolveMacros(input.userPrompt, input.macroNames),
    history: input.history?.map(message => ({ ...message, content: resolveMacros(message.content, input.macroNames) })),
  };
  return resolveMacros(await generateCreativeTextRaw(resolved), input.macroNames);
}

async function generateCreativeTextRaw(input: CreativeTextInput): Promise<string> {
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




export async function generateStatusBarContent(
  settings: AiSettings,
  characterName: string,
  preset: { name: string; promptSuffix?: string; regex: string; html: string },
  conversation: Array<{ sender: string; text?: string; transcript?: string }>,
  currentStatus?: string,
  userName?: string,
): Promise<string> {
  const recent = conversation.slice(-16).map(message => {
    const speaker = message.sender === 'other' ? characterName : message.sender === 'me' ? '用户' : '系统';
    return speaker + ': ' + (message.text || message.transcript || '[媒体]');
  }).join('\n');

  const resolvedPrompt = resolveMacros(
    preset.promptSuffix || '请根据刚刚的聊天回复生成当前状态。',
    { char: characterName, user: userName },
  );
  const regexSource = String(preset.regex || '').trim();

  const systemPrompt = [
    '你是角色聊天的状态栏原始输出生成器。',
    '你的工作不是设计 HTML，也不是解释状态栏，而是严格执行这个预设自己的 Prompt，生成一段原始状态文本，供应用随后用 Regex 捕获并交给 HTML 模板渲染。',
    '【最重要规则】预设 Prompt 是唯一的输出格式规则。Prompt 要求什么结构，就必须原样输出什么结构。',
    '如果 Prompt 要求 [QA: Q=..., QT=..., A=..., AT=...]，你就必须真的输出完整的 [QA: ...]，不能只输出 Q/A 内容，也不能把它改成 JSON、列表或自然语言。',
    '不要为了“更自然”而删除 Prompt 里的标签、括号、字段名、等号、逗号或分隔符。',
    '不要输出 Markdown 代码块、解释、前后注释或额外文本。',
    currentStatus ? '【最近状态（由旧到新，最后一条是最新）】\n' + currentStatus + '\n只在当前聊天提供依据时更新最新一条；时间只能向后推进，不要倒退或跳变。' : '【上一状态】暂无。',
    '【状态栏名称】' + preset.name,
    '【状态栏 Prompt｜必须执行】\n' + resolvedPrompt,
    regexSource ? '【Regex｜输出必须匹配】\n' + regexSource : '【Regex】未配置；按 Prompt 自身格式输出。',
    regexSource ? '输出前自检：整段原始输出中必须包含一段能够被上面 Regex 匹配的完整文本；如果不匹配，就重新生成，直到匹配为止。' : '',
  ].filter(Boolean).join('\n');

  const userPrompt = [
    '角色：' + characterName,
    '最近聊天：',
    recent || '暂无',
    '',
    '现在生成这一轮最新状态快照。',
    '严格执行【状态栏 Prompt｜必须执行】。',
    regexSource ? '严格确保最终原始输出能够被【Regex｜输出必须匹配】捕获。只返回最终原始状态，不要附加说明。' : '只返回最终原始状态，不要附加说明。',
  ].join('\n');

  const raw = (await generateCreativeText({
    settings: { ...settings, streaming: false },
    systemPrompt,
    userPrompt,
    macroNames: { char: characterName, user: userName },
    temperature: Math.min(0.75, settings.temperature ?? 0.75),
  })).trim();

  pushAiDebugLog({
    level: regexSource ? (extractStatusMatch(raw, regexSource) ? 'success' : 'error') : 'info',
    event: '[SANE333 STATUS BAR] generator',
    message: regexSource && !extractStatusMatch(raw, regexSource)
      ? '状态栏 AI 首次返回未匹配 Regex，准备进行格式修复重试'
      : '状态栏 AI 首次返回完成',
    provider: settings.provider,
    model: settings.model,
    meta: { characterName, preset: preset.name, prompt: resolvedPrompt, regex: regexSource, rawStatus: raw },
  });

  if (regexSource && !extractStatusMatch(raw, regexSource)) {
    // Every status-bar preset owns its own Regex. Never assume a fixed field
    // layout such as Q/QT/A/AT; the current preset's regex is the only parser rule.
    const repairPrompt = [
      '把下面这段 AI 状态栏原文修复成“能够匹配当前预设 Regex”的最终原文。',
      '当前预设的 Regex 就是唯一需要满足的结构规则。不要假设字段名、字段数量、字段顺序、标签文字或包装形式。',
      '不要重新编造事实；尽可能保留原始返回中的事实与内容，只把输出调整到当前 Regex 能捕获的结构。',
      '最终只输出一段原始状态文本，不要解释。',
      '【本次预设的 Regex】' + regexSource,
      '【本次预设的 Prompt】' + resolvedPrompt,
      '【AI 第一次原始返回】' + raw,
      '在输出前自检：把最终原文代入【本次预设的 Regex】，必须能够得到匹配结果。',
    ].join('\n');

    const repaired = (await generateCreativeText({
      settings: { ...settings, streaming: false, temperature: 0.15 },
      systemPrompt: '你是状态栏 Regex 格式修复器。只针对当前请求提供的 Regex 修复当前原文；绝对不要套用任何预设示例或固定字段。',
      userPrompt: repairPrompt,
      macroNames: { char: characterName, user: userName },
      temperature: 0.15,
    })).trim();

    const repairedMatch = extractStatusMatch(repaired, regexSource);
    pushAiDebugLog({
      level: repairedMatch ? 'success' : 'error',
      event: '[SANE333 STATUS BAR] generator-repair',
      message: repairedMatch ? '状态栏格式修复成功，已匹配 Regex' : '状态栏格式修复后仍未匹配 Regex',
      provider: settings.provider,
      model: settings.model,
      meta: { regex: regexSource, original: raw, repaired, captures: repairedMatch?.captures || [] },
    });
    return repaired;
  }

  return raw;
}

export async function generateHtmlInterlude(
  settings: AiSettings,
  characterName: string,
  htmlTemplate: string,
  conversation: Array<{ sender: string; text?: string; transcript?: string }>,
): Promise<string> {
  const recent = conversation.slice(-18).map(message => {
    const speaker = message.sender === 'other' ? characterName : message.sender === 'me' ? '用户' : '系统';
    return speaker + ': ' + (message.text || message.transcript || '[媒体]');
  }).join('\n');

  const systemPrompt = [
    '你是聊天里的 HTML 中插生成器。',
    '根据当前剧情决定这一轮是否适合出现一个轻量的视觉内容卡片。',
    '只输出 HTML 片段，不要 Markdown 代码块，不要解释。',
    '必须遵守提供的 HTML 模板结构，不得添加 script、style、iframe、form、事件属性、javascript: URL 或外部资源。',
    '内容必须直接来自最近聊天，不能凭空制造已经发生的事实。',
    'HTML 可以有标题、正文、标签、列表、时间、地点、引用、简单装饰结构。',
    '如果模板提供占位符，就替换成与当前聊天相关的内容。',
    '【HTML 模板】' + htmlTemplate,
  ].join('\n');

  const userPrompt = [
    '角色：' + characterName,
    '最近聊天：',
    recent || '暂无',
    '',
    '生成一张适合插入当前聊天的 HTML 内容卡片。',
  ].join('\n');

  return (await generateCreativeText({
    settings: { ...settings, streaming: false },
    systemPrompt,
    userPrompt,
    temperature: Math.min(0.9, settings.temperature ?? 0.85),
  })).trim();
}


export interface MemoryMergeResult {
  summary: string;
  updates: Array<{
    action: 'add' | 'update' | 'delete';
    id?: string;
    content?: string;
    section?: MemorySection;
    kind?: 'fact' | 'diary' | 'relationship' | 'preference' | 'event';
    importance?: number;
  }>;
}

function memoryStyleInstructions(memory: CharacterMemory): string {
  const style = memory.memoryStyle;
  if (!style) return '使用角色自己的自然记忆方式，但绝不改变事实。';
  const personalityMap: Record<string,string> = {
    balanced: '平衡、克制，优先保留真正有用的信息。',
    observant: '像一个细心观察的人，重视细节与行为变化。',
    diary: '像角色自己的私人记录，保留事件与当时氛围。',
    analytical: '重视因果、关系变化与稳定事实。',
    warm: '更关注关系中的重要时刻与情绪，但不替用户编造感受。',
    'character-style': '完全按照这个角色自己的性格、经历和既有记忆来决定什么值得记住。',
  };
  const sectionLines = Object.entries(style.sections || {}).map(([section, preset]) =>
    section + ': ' + preset.length + ', 最多 ' + preset.maxChars + ' 字, 重点=' + preset.focus
  );
  return [
    '整体记忆人格：' + (personalityMap[style.personality] || personalityMap['character-style']),
    '每一层记忆的总结方式：',
    ...sectionLines,
    '“角色自己的风格”只能改变选择、详略、语气和主观侧重点，绝对不能凭空创造事实。',
  ].join('\n');
}

export async function mergeRecentMemoryBatch(
  settings: AiSettings,
  characterName: string,
  currentMemory: CharacterMemory,
  batch: Array<{ id: string; content: string; importance: number; source: string; createdAt: string }>,
): Promise<MemoryMergeResult> {
  const appSettings = readAppSettings();
  const model = appSettings.memoryModel.trim() || settings.model;
  const mergeSettings: AiSettings = { ...settings, model, temperature: appSettings.memoryTemperature };
  const existing = currentMemory.items.slice(0, 120).map(item =>
    JSON.stringify({ id: item.id, section: item.section || 'stage', kind: item.kind || 'fact', importance: item.importance, content: item.content })
  ).join('\n');
  const incoming = batch.map(item =>
    JSON.stringify({ id: item.id, importance: item.importance, source: item.source, createdAt: item.createdAt, content: item.content })
  ).join('\n');

  const systemPrompt = [
    '你是角色 Memory Merge Engine。',
    '这里有一批已经通过候选判断的近期 Memory Summary。它们不是聊天原文，而是值得进一步整理的候选记忆。',
    '你的任务不是简单压缩成一段话，而是把它们与已有长期记忆逐项比较。',
    '必须：去重、合并相关记忆、识别新旧冲突、处理过时信息、更新长期记忆、分类到七个固定层。',
    '七个层只能使用：stage, about-you, relationship, understanding, confirm, todo, done。',
    '普通闲聊不要进入长期记忆。',
    '发生冲突时，以更晚、证据更明确的信息更新旧记忆；必要时保留时间关系，不要同时保留明显互相矛盾的永久事实。',
    'delete 用于明确已经失效或被新信息完全取代的旧条目。',
    memoryStyleInstructions(currentMemory),
    '只能使用输入中的事实。绝不脑补。',
    '输出严格 JSON，不要 Markdown。',
    JSON.stringify({
      summary: '新的长期记忆总览',
      updates: [
        { action: 'add', content: '...', section: 'about-you', kind: 'fact', importance: 80 },
        { action: 'update', id: '已有记忆ID', content: '...', section: 'relationship', kind: 'relationship', importance: 90 },
        { action: 'delete', id: '已有记忆ID' }
      ]
    }),
  ].join('\n');

  const userPrompt = [
    '【角色】' + characterName,
    '【角色现有长期记忆】',
    existing || '暂无',
    '',
    '【本次刚满 100 条的近期 Summary】',
    incoming,
    '',
    '请完成一次完整 Merge。不要为了填满七层而制造内容。',
  ].join('\n');

  const raw = await generateCreativeText({
    settings: mergeSettings,
    systemPrompt,
    userPrompt,
    temperature: appSettings.memoryTemperature,
  });
  const cleaned = raw.trim().replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/i, '');
  const parsed = JSON.parse(cleaned);
  const validSections = new Set(['stage','about-you','relationship','understanding','confirm','todo','done']);
  const validKinds = new Set(['fact','diary','relationship','preference','event']);
  const updates = Array.isArray(parsed?.updates) ? parsed.updates.map((item: any) => ({
    action: item?.action === 'delete' ? 'delete' : item?.action === 'update' ? 'update' : 'add',
    id: typeof item?.id === 'string' ? item.id : undefined,
    content: typeof item?.content === 'string' ? item.content.trim() : undefined,
    section: validSections.has(item?.section) ? item.section : 'stage',
    kind: validKinds.has(item?.kind) ? item.kind : 'fact',
    importance: Math.max(0, Math.min(100, Number(item?.importance) || 50)),
  })).filter((item: any) => item.action === 'delete' ? Boolean(item.id) : Boolean(item.content)).slice(0, 120) : [];
  return {
    summary: typeof parsed?.summary === 'string' ? parsed.summary.trim() : currentMemory.summary,
    updates,
  };
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
    memoryStyleInstructions(currentMemory),
    '这是候选记忆生成，不是最终长期记忆写入。',
    '先判断信息是否值得未来继续影响角色对用户的理解；普通闲聊、寒暄、一次性废话、没有持续价值的内容必须忽略。',
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
