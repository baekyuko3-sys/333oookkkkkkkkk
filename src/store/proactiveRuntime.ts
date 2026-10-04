import type { ImportedCharacter } from '../data/characterImport';
import type { OfflineEvent, ProjectManifest, WorldBook } from '../types';
import { getOfflineEvents } from './offlineEvents';
import { getLineGroups } from './lineGroups';
import { getWorldRuntime } from './worldRuntime';
import { getCharacterProfile } from '../data/characterProfiles';
import { getCharacterMemory } from './characterMemory';
import { getProjectManifest } from './projectManifest';
import { readAppSettings } from './appSettings';
import { generateCreativeText, readStoredAiSettings } from '../ai/aiEngine';
import { emitWorldEvent, setCharacterRuntime, syncWorldCharacters } from './worldRuntime';
import { appendLineRuntimeMessage, lineNowTime } from './lineMessageRuntime';

interface ScheduleItem {
  id: string;
  time: string;
  title: string;
}

interface ProactiveState {
  delivered: Record<string, string>;
  lastBehaviorAt?: Record<string, number>;
}

interface BehaviorCandidate {
  key: string;
  reason: 'schedule' | 'recent-chat' | 'offline-completed' | 'group';
  context: string;
  groupId?: string;
}

function relationshipHeat(character: ImportedCharacter): string {
  const profile = getCharacterProfile(character.name);
  const raw = String(profile.relationship || '').toLowerCase();
  if (/恋人|爱人|暧昧|喜欢|亲密|伴侣|恋爱|lover|partner|romantic/.test(raw)) return 'high';
  if (/朋友|好友|知己|熟人|friend|close/.test(raw)) return 'medium';
  return 'low';
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
  const message = appendLineRuntimeMessage(character.id || character.name, {
    id: Date.now(),
    sender: 'other',
    senderName: character.name,
    type: 'proactive',
    text,
    time: lineNowTime(),
    isRead: false,
    status: 'sent',
    source: 'proactive-runtime',
  });
  if (!message) return;

  emitWorldEvent('character.message', {
    characterId: character.id,
    characterName: character.name,
    data: { preview: text.replace(/\s+/g, ' ').slice(0, 120), source: 'proactive' },
  });
  setCharacterRuntime(character.id, {
    activity: '刚刚主动联系了你',
    mood: '想起了你',
    lastInteractionAt: new Date().toISOString(),
  }, character.name);

  window.dispatchEvent(new CustomEvent('sane333:proactive-message', {
    detail: { characterName: character.name, message },
  }));
}

async function generateProactiveMessage(
  character: ImportedCharacter,
  candidate: BehaviorCandidate,
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
  const conversationId = character.id || character.name;
  const recentMessages = readLocal<any[]>(`line:conversation:${conversationId}`, []).slice(-16);
  const world = getWorldRuntime();
  const runtime = world.characters[character.id];

  const systemPrompt = [
    '你是 Sane333 的 Character Behavior Runtime。',
    '你不是一个定时器。你要判断一个真实角色“为什么此刻会想联系用户”，然后用角色本人发一条自然的 LINE 消息。',
    '绝对不能替用户说话、替用户行动、替用户决定感受。',
    '不要解释触发原因，不要输出系统提示、标签、选择菜单。',
    '如果是群聊，消息必须像真的发在群里，可以自然 @ 用户。',
    '',
    '【角色】', character.name, character.description || '', character.personality || '', character.scenario || '', character.systemPrompt || '',
    '【关系热度】', relationshipHeat(character), '；关系描述：' + profile.relationship + '；称呼：' + profile.callMe,
    '【角色当前状态】', runtime ? runtime.location + ' / ' + runtime.activity + ' / ' + runtime.mood : '未知',
    '【用户人设】', persona ? JSON.stringify(persona) : '未设置',
    '【长期记忆】', memory.summary || '暂无摘要',
    ...memory.items.slice(0, 10).map(item => '- ' + item.content),
    '【项目】', project.name + ' / ' + project.genre, project.tone, project.globalPrompt || '',
    '【世界书】',
    worldbooks.flatMap(book => book.enabled
      ? book.entries.filter(entry => entry.enabled).slice(0, 8).map(entry => '- ' + entry.name + ': ' + entry.content)
      : []).join('\n') || '无',
    '【最近聊天】',
    recentMessages.map(message => (message.sender === 'other' ? (message.senderName || character.name) : '用户') + ': ' + (message.text || message.transcript || '[媒体]')).join('\n') || '暂无',
  ].join('\n');

  const target = candidate.groupId ? '群聊' : '私聊';
  return generateCreativeText({
    settings: proactiveSettings,
    systemPrompt,
    userPrompt: [
      '现在触发一次角色行为。',
      '目标：' + target,
      '行为理由：' + candidate.reason,
      '行为上下文：' + candidate.context,
      '请根据这个理由、最近聊天、关系热度、角色状态和长期记忆，决定角色此刻最自然的说法。',
      '如果是群聊，可以自然 @ 用户，但不要机械重复 @。',
      '适合手机聊天：1～4句即可。',
    ].join('\n'),
    temperature: proactiveSettings.temperature ?? 0.85,
  });
}

function chooseBehavior(
  character: ImportedCharacter,
  now: Date,
  schedule: ScheduleItem[],
  state: ProactiveState,
): BehaviorCandidate | null {
  const id = character.id || character.name;
  const lastBehavior = state.lastBehaviorAt?.[id] || 0;
  if (now.getTime() - lastBehavior < 30 * 60_000) return null;

  const messages = readLocal<any[]>(`line:conversation:${id}`, []);
  const last = messages[messages.length - 1];
  if (last?.sender === 'me') {
    const age = now.getTime() - (typeof last.createdAt === 'string' ? new Date(last.createdAt).getTime() : now.getTime());
    if (age >= 2 * 60_000) {
      return {
        key: 'chat:' + String(last.id),
        reason: 'recent-chat',
        context: '用户上一条消息已经过去一段时间，角色可以自然接住这段对话，但不要替用户补完答案。',
      };
    }
  }

  const completed = getOfflineEvents()
    .filter(event => event.characterId === character.id && event.status === 'completed')
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())[0];
  if (completed) {
    const completedAt = new Date(completed.updatedAt || completed.createdAt).getTime();
    if (now.getTime() - completedAt < 30 * 60_000) {
      return {
        key: 'offline:' + completed.id,
        reason: 'offline-completed',
        context: '刚刚结束线下剧情「' + completed.title + '」，地点：' + completed.location + '。角色可以带着见面后的情绪继续联系用户。',
      };
    }
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const due = schedule
    .map(item => ({ item, minute: parseClock(item.time) }))
    .filter((entry): entry is { item: ScheduleItem; minute: number } => entry.minute !== null && entry.minute <= currentMinutes)
    .sort((a, b) => b.minute - a.minute);
  if (due.length) {
    const item = due[0].item;
    return {
      key: 'schedule:' + item.id + ':' + dayKey(now),
      reason: 'schedule',
      context: '角色今天的日程节点「' + item.title + '」到了，时间：' + item.time + '。不要像系统提醒一样说话，要像角色自然想起这件事。',
    };
  }
  return null;
}

function appendBehaviorMessage(character: ImportedCharacter, text: string, groupId?: string) {
  const conversationId = groupId || character.id || character.name;
  const message = appendLineRuntimeMessage(conversationId, {
    id: Date.now(),
    sender: 'other',
    senderName: character.name,
    type: groupId ? 'group-proactive' : 'proactive',
    text,
    time: lineNowTime(),
    isRead: false,
    status: 'sent',
    source: 'character-behavior-runtime',
    groupId: groupId || undefined,
  });
  if (!message) return null;
  emitWorldEvent('character.message', {
    characterId: character.id,
    characterName: character.name,
    data: { preview: text.replace(/\s+/g, ' ').slice(0, 120), source: 'character-behavior', groupId },
  });
  setCharacterRuntime(character.id, {
    activity: groupId ? '刚在群里说了句话' : '刚刚主动联系了你',
    mood: '想起了你',
    lastInteractionAt: new Date().toISOString(),
  }, character.name);
  window.dispatchEvent(new CustomEvent('sane333:proactive-message', {
    detail: { characterName: character.name, message },
  }));
  return message;
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
  const today = dayKey(now);
  const state = readLocal<ProactiveState>('phone:proactive-state', { delivered: {}, lastBehaviorAt: {} });
  state.lastBehaviorAt = state.lastBehaviorAt || {};
  let dirty = false;

  running = true;
  try {
    for (const character of characters) {
      const scheduleKeys = Array.from(new Set([
        `line:schedule:${character.id}`,
        `line:schedule:${character.name}`,
      ].filter(Boolean)));
      let schedule: ScheduleItem[] = [];
      for (const scheduleKey of scheduleKeys) {
        const rawSchedule = window.localStorage.getItem(scheduleKey);
        if (!rawSchedule) continue;
        try {
          const parsed = JSON.parse(rawSchedule);
          if (Array.isArray(parsed)) schedule = [...schedule, ...parsed];
        } catch {}
      }

      const candidate = chooseBehavior(character, now, schedule, state);
      if (!candidate) continue;

      const deliveryKey = today + ':' + character.id + ':' + candidate.key;
      if (state.delivered[character.id] === deliveryKey) continue;

      const message = await generateProactiveMessage(character, candidate);
      if (!message.trim()) continue;

      const sent = appendBehaviorMessage(character, message.trim());
      if (!sent) continue;

      state.delivered[character.id] = deliveryKey;
      state.lastBehaviorAt[character.id] = now.getTime();
      dirty = true;

      if (settings.notificationEnabled && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(character.name, {
          body: message.trim().slice(0, 180),
          tag: 'sane333-proactive-' + character.id,
        });
      }
    }

    // 群聊主动插话：只在群里最近有人说话且角色属于该群时触发，避免无意义刷屏。
    for (const group of getLineGroups()) {
      const memberCharacters = group.members
        .map(member => characters.find(character => character.id === member.characterId || character.name === member.name))
        .filter(Boolean) as ImportedCharacter[];
      if (!memberCharacters.length) continue;

      const groupMessages = readLocal<any[]>(`line:conversation:${group.id}`, []);
      const last = groupMessages[groupMessages.length - 1];
      if (!last || last.sender === 'other') continue;
      const lastTime = typeof last.createdAt === 'string' ? new Date(last.createdAt).getTime() : now.getTime();
      if (now.getTime() - lastTime < 2 * 60_000 || now.getTime() - lastTime > 20 * 60_000) continue;

      const actor = memberCharacters[0];
      const key = 'group:' + group.id + ':' + String(last.id);
      if (state.delivered[group.id] === today + ':' + key) continue;

      const candidate: BehaviorCandidate = {
        key,
        reason: 'group',
        groupId: group.id,
        context: '群成员刚刚发言，角色可以自然接话。群名：' + group.name + '。最近一句：' + (last.text || ''),
      };
      const message = await generateProactiveMessage(actor, candidate);
      if (!message.trim()) continue;
      const sent = appendBehaviorMessage(actor, message.trim(), group.id);
      if (!sent) continue;
      state.delivered[group.id] = today + ':' + key;
      dirty = true;
    }
  } catch {
    // Character behavior must never break the phone runtime.
  } finally {
    running = false;
    if (dirty) saveLocal('phone:proactive-state', state);
  }
}
