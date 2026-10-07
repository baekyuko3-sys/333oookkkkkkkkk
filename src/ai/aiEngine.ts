  const raw = String(rawText || '').replace(/\r\n/g, '\n').trim();
  const readRawTag = (names: string[]): string => {
    const pattern = names.join('|');
    const match = raw.match(new RegExp('<(?:' + pattern + ')>\\s*([\\s\\S]*?)\\s*</(?:' + pattern + ')>', 'i'));
    return match ? match[1].trim() : '';
  };

  // COT is a safe, user-visible high-level decision record. Never expose
  // arbitrary hidden reasoning such as <think>/<thought> verbatim.
  const cotSummary = readRawTag(['cot', 'summary']);
  const withoutHiddenThinking = raw
    .replace(/<think>[\\s\\S]*?<\\/think>/gi, '')
    .replace(/<thought>[\\s\\S]*?<\\/thought>/gi, '')
    .replace(/<thinking>[\\s\\S]*?<\\/thinking>/gi, '')
    .replace(/<thought>[\\s\\S]*?<\\/thought>/gi, '')
    .replace(/<think>[\\s\\S]*?<\\/think>/gi, '')
    .replace(/<cot>[\\s\\S]*?<\\/cot>/gi, '')
    .replace(/<summary>[\\s\\S]*?<\\/summary>/gi, '');

  const readTag = (name: string): string => {
    const match = withoutHiddenThinking.match(new RegExp('<' + name + '>\\s*([\\s\\S]*?)\\s*</' + name + '>', 'i'));
    return match ? match[1].trim() : '';
  };

  const thinkingSummary = cotSummary || readTag('thinking') || readTag('summary');
  const actionDescription = readTag('action');
  const messageMatch = withoutHiddenThinking.match(/<message>\s*([\s\S]*?)\s*<\/message>/i);

  const text = (messageMatch?.[1] || withoutHiddenThinking
    .replace(/<(?:cot|thinking)>[\s\S]*?<\/(?:cot|thinking)>/gi, '')
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