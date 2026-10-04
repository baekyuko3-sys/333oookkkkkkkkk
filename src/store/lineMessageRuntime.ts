export type LineMessageStatus = 'sending' | 'receiving' | 'sent' | 'read' | 'failed' | 'recalled';

export function lineNowTime(date = new Date()): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function normalizeLineMessage(message: any, fallbackSender: 'me' | 'other' = 'other') {
  const sender = message?.sender || fallbackSender;
  const isIncoming = sender !== 'me';
  return {
    ...message,
    sender,
    time: message?.time || lineNowTime(),
    status: message?.status || (isIncoming ? 'sent' : 'sent'),
    isRead: Boolean(message?.isRead),
  };
}

export function nextLineUnread(current: number, message: any, conversationIsOpen: boolean) {
  if (!message || message.sender === 'me' || conversationIsOpen || message.isRead) return Number(current || 0);
  return Number(current || 0) + 1;
}

export function markLineMessagesRead(messages: any[]) {
  return messages.map(message =>
    message.sender === 'me'
      ? { ...message, isRead: true, status: message.status === 'sending' || message.status === 'failed' ? message.status : 'read' }
      : { ...message, isRead: true, status: message.status === 'recalled' ? 'recalled' : 'read' }
  );
}

export function linePreview(message: any): string {
  return String(
    message?.text ||
    message?.transcript ||
    (message?.type === 'offline-invite' ? '💌 线下剧情邀约' : '') ||
    (message?.type === 'real-media' ? '[媒体] ' + (message?.fileName || '附件') : '') ||
    (message?.type === 'ai-card' ? '[' + (message?.title || '多媒体') + ']' : '') ||
    '新消息'
  ).replace(/\s+/g, ' ').slice(0, 80);
}
