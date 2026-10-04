import type { OfflineEvent } from '../types';

export type LineMessageKind =
  | 'text' | 'image' | 'video' | 'file' | 'voice' | 'sticker'
  | 'system' | 'offline-invite' | 'music-invite';

export interface LineRuntimeMessage {
  id: number | string;
  sender?: 'me' | 'other' | 'system' | string;
  text?: string;
  kind?: LineMessageKind;
  createdAt?: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'recalled' | 'deleted';
  replyToId?: number | string;
  editedAt?: string;
  recalledAt?: string;
  deletedAt?: string;
  reactions?: Record<string, number>;
  metadata?: Record<string, unknown>;
}

export interface LineConversationMeta {
  id: string;
  characterId?: string;
  name: string;
  isGroup: boolean;
  lastReadMessageId?: number | string | null;
  updatedAt: string;
  unread: number;
  muted: boolean;
  pinned: boolean;
}

export interface LineNotification {
  id: string;
  type: 'message' | 'invite' | 'call' | 'system';
  conversationId?: string;
  characterId?: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  payload?: Record<string, unknown>;
}

const META_KEY = 'line:runtime:conversations';
const NOTIFICATION_KEY = 'line:runtime:notifications';
const MAX_NOTIFICATIONS = 200;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function conversationKey(id: string) {
  return `line:conversation:${id}`;
}

export function getLineConversationMessages(id: string): LineRuntimeMessage[] {
  return readJson<LineRuntimeMessage[]>(conversationKey(id), []);
}

export function saveLineConversationMessages(id: string, messages: LineRuntimeMessage[]) {
  const normalized = messages.map(normalizeLineMessage);
  writeJson(conversationKey(id), normalized);
  return normalized;
}

export function normalizeLineMessage(message: LineRuntimeMessage, fallbackIndex = 0): LineRuntimeMessage {
  return {
    ...message,
    id: message.id ?? `line-msg-${Date.now()}-${fallbackIndex}`,
    createdAt: message.createdAt || new Date().toISOString(),
    status: message.status || (message.sender === 'me' ? 'sent' : 'delivered'),
  };
}

export function appendLineMessage(id: string, message: LineRuntimeMessage): LineRuntimeMessage[] {
  const current = getLineConversationMessages(id);
  const nextMessage = normalizeLineMessage(message, current.length);
  if (current.some(item => String(item.id) === String(nextMessage.id))) return current;
  const next = [...current, nextMessage];
  saveLineConversationMessages(id, next);
  touchLineConversation(id, {
    unread: nextMessage.sender === 'other' ? getLineConversationMeta(id)?.unread ?? 0 + 1 : 0,
  });
  return next;
}

export function updateLineMessage(id: string, messageId: number | string, patch: Partial<LineRuntimeMessage>) {
  const next = getLineConversationMessages(id).map(message =>
    String(message.id) === String(messageId) ? normalizeLineMessage({ ...message, ...patch }) : message
  );
  saveLineConversationMessages(id, next);
  return next;
}

export function recallLineMessage(id: string, messageId: number | string) {
  return updateLineMessage(id, messageId, {
    text: '你撤回了一条消息',
    status: 'recalled',
    recalledAt: new Date().toISOString(),
  });
}

export function deleteLineMessage(id: string, messageId: number | string) {
  return updateLineMessage(id, messageId, {
    text: '',
    status: 'deleted',
    deletedAt: new Date().toISOString(),
  });
}

export function searchLineMessages(id: string, query: string): LineRuntimeMessage[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return getLineConversationMessages(id).filter(message =>
    String(message.text || '').toLowerCase().includes(q)
  );
}

export function getLineConversationPage(id: string, page = 0, pageSize = 80): LineRuntimeMessage[] {
  const all = getLineConversationMessages(id);
  const safeSize = Math.max(10, Math.min(200, pageSize));
  const end = Math.max(0, all.length - page * safeSize);
  return all.slice(Math.max(0, end - safeSize), end);
}

export function getLineConversationMeta(id: string): LineConversationMeta | null {
  const all = readJson<Record<string, LineConversationMeta>>(META_KEY, {});
  return all[id] || null;
}

export function touchLineConversation(id: string, patch: Partial<LineConversationMeta> = {}) {
  const all = readJson<Record<string, LineConversationMeta>>(META_KEY, {});
  const current = all[id] || {
    id,
    name: patch.name || id,
    isGroup: Boolean(patch.isGroup),
    updatedAt: new Date().toISOString(),
    unread: 0,
    muted: false,
    pinned: false,
  };
  all[id] = { ...current, ...patch, id, updatedAt: new Date().toISOString() };
  writeJson(META_KEY, all);
  window.dispatchEvent(new CustomEvent('sane333:line-runtime-changed', { detail: all[id] }));
  return all[id];
}

export function markLineConversationRead(id: string, messageId?: number | string) {
  return touchLineConversation(id, {
    unread: 0,
    lastReadMessageId: messageId ?? getLineConversationMessages(id).at(-1)?.id ?? null,
  });
}

export function setLineConversationUnread(id: string, unread: number) {
  return touchLineConversation(id, { unread: Math.max(0, unread) });
}

export function getLineNotifications(): LineNotification[] {
  return readJson<LineNotification[]>(NOTIFICATION_KEY, []);
}

export function addLineNotification(input: Omit<LineNotification, 'id' | 'createdAt' | 'read'>) {
  const notification: LineNotification = {
    ...input,
    id: `line-notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    read: false,
  };
  const next = [notification, ...getLineNotifications()].slice(0, MAX_NOTIFICATIONS);
  writeJson(NOTIFICATION_KEY, next);
  window.dispatchEvent(new CustomEvent('sane333:line-notification', { detail: notification }));
  return notification;
}

export function markLineNotificationRead(id: string) {
  writeJson(NOTIFICATION_KEY, getLineNotifications().map(item => item.id === id ? { ...item, read: true } : item));
}

export function markAllLineNotificationsRead() {
  writeJson(NOTIFICATION_KEY, getLineNotifications().map(item => ({ ...item, read: true })));
}

export function getLineUnreadNotificationCount() {
  return getLineNotifications().filter(item => !item.read).length;
}

export interface LineBackup {
  version: 1;
  exportedAt: string;
  conversations: Record<string, LineRuntimeMessage[]>;
  metadata: Record<string, LineConversationMeta>;
  notifications: LineNotification[];
}

export function exportLineBackup(): LineBackup {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    conversations: readJson<Record<string, LineRuntimeMessage[]>>('line:runtime:conversations', {}),
    metadata: readJson<Record<string, LineConversationMeta>>(META_KEY, {}),
    notifications: getLineNotifications(),
  };
}

export function importLineBackup(backup: LineBackup) {
  if (!backup || backup.version !== 1) throw new Error('LINE_BACKUP_VERSION_UNSUPPORTED');
  writeJson('line:runtime:conversations', backup.conversations || {});
  writeJson(META_KEY, backup.metadata || {});
  writeJson(NOTIFICATION_KEY, backup.notifications || []);
  window.dispatchEvent(new CustomEvent('sane333:line-runtime-changed'));
}

export function clearLineConversation(id: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(conversationKey(id));
  const meta = readJson<Record<string, LineConversationMeta>>(META_KEY, {});
  delete meta[id];
  writeJson(META_KEY, meta);
  window.dispatchEvent(new CustomEvent('sane333:line-runtime-changed'));
}

export function bindLineRuntimeEvents() {
  if (typeof window === 'undefined') return () => {};
  const onProactive = (event: Event) => {
    const detail = (event as CustomEvent<any>).detail || {};
    const character = detail.character;
    if (!character?.id && !character?.name) return;
    const id = character.id || character.name;
    const text = detail.text || detail.message || '收到一条新消息';
    setLineConversationUnread(id, (getLineConversationMeta(id)?.unread || 0) + 1);
    addLineNotification({
      type: 'message',
      conversationId: id,
      characterId: character.id,
      title: character.name || '新消息',
      body: String(text).slice(0, 120),
      payload: detail,
    });
  };
  const onWorldEvent = (event: Event) => {
    const detail = (event as CustomEvent<any>).detail || {};
    if (!['offline.invite', 'offline.accepted'].includes(detail.type)) return;
    addLineNotification({
      type: 'invite',
      conversationId: detail.characterId,
      characterId: detail.characterId,
      title: detail.characterName || '线下剧情',
      body: detail.type === 'offline.invite' ? '发来了一份线下邀约' : '线下邀约已接受',
      payload: detail,
    });
  };
  const onCall = (event: Event) => {
    const detail = (event as CustomEvent<any>).detail || {};
    addLineNotification({
      type: 'call',
      conversationId: detail.characterId,
      characterId: detail.characterId,
      title: detail.characterName || '来电',
      body: '有人正在呼叫你',
      payload: detail,
    });
  };
  window.addEventListener('sane333:proactive-message', onProactive);
  window.addEventListener('sane333:world-event', onWorldEvent);
  window.addEventListener('sane333:incoming-call', onCall);
  return () => {
    window.removeEventListener('sane333:proactive-message', onProactive);
    window.removeEventListener('sane333:world-event', onWorldEvent);
    window.removeEventListener('sane333:incoming-call', onCall);
  };
}

export function buildLineTranscript(id: string, limit = 120) {
  return getLineConversationMessages(id)
    .slice(-limit)
    .map(message => `${message.sender || 'unknown'}: ${message.text || '[媒体消息]'}`)
    .join('\n');
}

export function recordOfflineEventInLine(event: OfflineEvent) {
  if (event.status === 'draft' || event.status === 'declined') return;
  const id = event.characterId || event.characterName;
  appendLineMessage(id, {
    id: `offline-${event.id}-${event.status}`,
    sender: 'system',
    kind: 'offline-invite',
    text: event.status === 'completed' ? `线下剧情已完成：${event.title}` : `线下剧情状态更新：${event.title}`,
    metadata: { offlineEventId: event.id, location: event.location, time: event.time, status: event.status },
  });
}
