import type { ImportedCharacter } from '../data/characterImport';
import type { OfflineEvent, ProjectManifest, WorldBook } from '../types';
import { getCharacterProfile } from '../data/characterProfiles';
import { getCharacterMemory } from './characterMemory';
import { getProjectManifest } from './projectManifest';
import { readAppSettings } from './appSettings';
import { generateCreativeText, readStoredAiSettings } from '../ai/aiEngine';
import { emitWorldEvent, setCharacterRuntime, syncWorldCharacters } from './worldRuntime';
import { appendLineMessage, getLineConversationMessages, saveLineConversationMessages } from './lineRuntime';
import { getLineRealitySettings, getCurrentLineTimeContext } from './lineReality';

interface ScheduleItem {
  id: string;
  time: string;
  title: string;
}

interface ProactiveState {
  delivered: Record<string, string>;
  lastSentAt?: Record<string, string>;
}

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveLocal<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage limits; chat itself remains usable.
  }
}

function parseClock(value: string): number | null {
  const match = value.trim().match(/(?:^|\s)(\d{1,2}):(\d{2})(?:\s|$)/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function dayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

function appendProactiveMessage(character: ImportedCharacter, text: string) {
  // LINE conversations are keyed by character id when available. Keeping
  // proactive messages on the same key prevents "notification arrives but
  // chat opens empty" when the contact was created from an imported card.
  const conversationId = character.id || character.name;
  const legacyKey = `line:conversation:${character.name}`;
  const key = `line:conversation:${conversationId}`;
  const messageId = `proactive-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // The runtime store is the single source of truth. If an older name-keyed
  // conversation exists, migrate it once before appending the new normalized message.
  if (conversationId !== character.name) {
    const legacyMessages = readLocal<any[]>(legacyKey, []);
    const currentMessages = getLineConversationMessages(conversationId);
    if (legacyMessages.length && !currentMessages.length) {
      saveLocal(key, legacyMessages);
    }
  }

  appendLineMessage(conversationId, {
    id: messageId,
    sender: 'other',
    text,
    kind: 'text',
    createdAt: new Date().toISOString(),
    status: 'delivered',
    metadata: { proactive: true },
  });
  const chatItems = readLocal<any[]>('line:chat-items', []);
  const existing = chatItems.find(item => item.characterId === character.id || item.name === character.name);
  const updated = existing
    ? chatItems.map(item =>
        item.characterId === character.id || item.name === character.name
          ? {
              ...item,
              characterId: character.id,
              preview: text.replace(/\s+/g, ' ').slice(0, 80),
              time: '刚刚',
              unread: Number(item.unread || 0) + 1,
            }
          : item
      )
    : [{
        id: character.id,
        characterId: character.id,
        name: character.name,
        variantLabel: character.variantLabel || character.characterVersion || '默认版本',
        time: '刚刚',
        preview: text.replace(/\s+/g, ' ').slice(0, 80),
        unread: 1,
        isPinned: false,
        isMuted: false,
        draft: '',
        isGroup: false,
      }, ...chatItems];
  saveLocal('line:chat-items', updated);
  emitWorldEvent('character.message', {
    characterId: character.id,
    characterName: character.name,
    data: { preview: text.replace(/\\s+/g, ' ').slice(0, 120), source: 'proactive' },
  });
  setCharacterRuntime(character.id, {
    activity: '刚刚主动联系了你',
    mood: '想起了你',
    lastInteractionAt: new Date().toISOString(),
  }, character.name);

  window.dispatchEvent(new CustomEvent('sane333:proactive-message', {
    detail: {
      id: messageId,
      character: { id: character.id, name: character.name },
      text,
      kind: 'text',
      createdAt: new Date().toISOString(),
      reason: 'scheduled-proactive',
    },
  }));
}

async function generateProactiveMessage(
  character: ImportedCharacter,
  schedule: ScheduleItem,
): Promise<string> {
  const settings = readStoredAiSettings();
  const appSettings = readAppSettings();
  const proactiveModel = appSettings.proactiveModel.trim();
  const proactiveSettings = proactiveModel
    ? { ...settings, model: proactiveModel, temperature: appSettings.proactiveTemperature }
    : { ...settings, temperature: appSettings.proactiveTemperature };
  if (!proactiveSettings.apiKey.trim()) throw new Error('AI_NOT_CONFIGURED');

  const profile = getCharacterProfile(character.name);
  const memory = getCharacterMemory(character.id, character.name);
  const project = getProjectManifest();
  const worldbooks = readLocal<WorldBook[]>('phone:worldbooks', []);
  const personas = readLocal<any[]>('line:user-personas', []);
  const persona = personas.find(item => item.isDefault) || personas[0] || null;
  const recentMessages = getLineConversationMessages(character.id || character.name).slice(-12);
  const lastInteraction = recentMessages.at(-1)?.createdAt ? Date.parse(recentMessages.at(-1)!.createdAt!) : 0;
  const offlineMinutes = lastInteraction ? Math.max(0, Math.floor((Date.now() - lastInteraction) / 60000)) : null;
  const offlineContext = offlineMinutes === null
    ? '这是你们第一次在当前聊天周期里联系。'
    : offlineMinutes >= 24 * 60
      ? '你们已经超过一天没有联系。可以自然提到这段时间里自己在做的事或现在的状态，但绝对不要责怪用户失联。'
      : offlineMinutes >= 180
        ? '你们已经几个小时没有联系。像一个有自己生活的人一样继续自己的节奏，不要假装一直在等用户。'
        : '你们刚刚还有联系。不要为了主动而重复上一轮话题。';

  const systemPrompt = [
    '你是 Sane333 的主动消息引擎。',
    '你正在代表一个真实存在于私人虚拟手机里的角色，在合适的日程节点主动给用户发一条消息。',
    '这不是系统通知，也不是说明书。只写角色真正会发给用户的聊天内容。',
    '不要替用户说话、不要猜测用户动作，不要写选择菜单。',
    '消息自然、具体、有生活感；不要为了“主动消息”强行煽情。',
    '',
    '【角色】',
    character.name,
    character.description || '',
    character.personality || '',
    character.scenario || '',
    character.systemPrompt || '',
    '',
    '【关系】',
    profile.relationship + '；称呼：' + profile.callMe,
    '',
    '【用户人设】',
    persona ? JSON.stringify(persona) : '未设置',
    '',
    '【长期记忆】',
    memory.summary || '暂无摘要',
    ...memory.items.slice(0, 10).map(item => '- ' + item.content),
    '',
    '【项目】',
    project.name + ' / ' + project.genre,
    project.tone,
    project.globalPrompt || '',
    '',
    '【世界书】',
    worldbooks.flatMap(book => book.enabled
      ? book.entries.filter(entry => entry.enabled).slice(0, 8).map(entry => '- ' + entry.name + ': ' + entry.content)
      : []).join('\n') || '无',
    '',
    '【最近聊天】',
    '【离线期间 / 当前联系状态】\\n' + offlineContext,
    recentMessages.map(message => (message.sender === 'other' ? character.name : '用户') + ': ' + (message.text || message.transcript || '[媒体]')).join('\\n'),
  ].join('\n');

  return generateCreativeText({
    settings,
    systemPrompt,
    userPrompt: [
      '现在触发角色主动消息。',
      '日程时间：' + schedule.time,
      '日程事件：' + schedule.title,
      '请结合角色自己的生活节奏、离线期间发生的事情、长期记忆、最近聊天与当前日程，发出一条自然的主动消息。',
      '主动联系必须有具体动机：刚发生的事、日程、想到某件旧事、分享生活、回复之前未完的话题等；不要只是因为计时器到了就机械问候。',
      '如果长时间没联系，不要说“你为什么不回”“怎么不理我”；角色可以自然地继续自己的生活，再分享现在发生的事。',
      '控制在适合手机聊天的长度，不要解释你为什么主动联系。',
    ].join('\n'),
    temperature: proactiveSettings.temperature ?? 0.85,
  });
}

let running = false;

export async function runProactiveCatchup() {
  if (typeof window === 'undefined' || running) return;
  const settings = readAppSettings();
  if (!settings.backgroundEnabled || !settings.proactiveMessagesEnabled) return;

  const characters = readLocal<ImportedCharacter[]>('phone:characters', []);
  if (!characters.length) return;
  syncWorldCharacters(characters);

  const now = new Date();
  const reality = getLineRealitySettings();
  const timeContext = getCurrentLineTimeContext();
  const zonedParts = new Intl.DateTimeFormat('en-US', { timeZone: reality.timezone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  const currentMinutes = Number(zonedParts.find(part => part.type === 'hour')?.value || 0) * 60 + Number(zonedParts.find(part => part.type === 'minute')?.value || 0);
  const zonedDate = new Intl.DateTimeFormat('en-CA', { timeZone: reality.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const today = zonedDate;
  const cooldownMs = reality.proactiveCooldownMinutes * 60 * 1000;
  const state = readLocal<ProactiveState>('phone:proactive-state', { delivered: {}, lastSentAt: {} });
  state.lastSentAt ||= {};
  let dirty = false;

  running = true;
  try {
    for (const character of characters) {
      const rawSchedule = window.localStorage.getItem(`line:schedule:${character.name}`);
      if (!rawSchedule) continue;

      let schedule: ScheduleItem[] = [];
      try { schedule = JSON.parse(rawSchedule); } catch { continue; }
      const due = schedule
        .map(item => ({ item, minute: parseClock(item.time) }))
        .filter((entry): entry is { item: ScheduleItem; minute: number } => entry.minute !== null && entry.minute <= currentMinutes)
        .sort((a, b) => b.minute - a.minute);

      if (!due.length) continue;

      const candidate = due[0];
      const deliveryKey = today + ':' + character.id + ':' + candidate.item.id;
      if (state.delivered[character.id] === deliveryKey) continue;
      const lastSent = state.lastSentAt?.[character.id] ? Date.parse(state.lastSentAt[character.id]!) : 0;
      if (lastSent && now.getTime() - lastSent < cooldownMs) continue;

      const message = await generateProactiveMessage(character, candidate.item);
      if (!message.trim()) continue;

      appendProactiveMessage(character, message.trim());
      state.delivered[character.id] = deliveryKey;
      state.lastSentAt![character.id] = now.toISOString();
      dirty = true;

      if (settings.notificationEnabled && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(character.name, {
          body: message.trim().slice(0, 180),
          tag: 'sane333-proactive-' + character.id,
        });
      }
    }
  } catch {
    // Proactive messages must never break the phone runtime.
  } finally {
    running = false;
    if (dirty) saveLocal('phone:proactive-state', state);
  }
}
