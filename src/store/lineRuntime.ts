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
  return CONVERSATION_PREFIX + id;
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
  const previousUnread = getLineConversationMeta(id)?.unread || 0;
  // A role message that is already marked read belongs to the open/read conversation
  // and must never create a new unread badge.
  const nextUnread = nextMessage.sender === 'other'
    ? (nextMessage.status === 'read' || nextMessage.metadata?.isRead === true ? previousUnread : previousUnread + 1)
    : 0;

  // Keep the visible LINE chat list synchronized with the runtime message stream.
  // This is especially important for background events such as offline-story updates
  // and call records that arrive while the conversation screen is closed.
  if (typeof window !== 'undefined') {
    try {