import { useState, useRef, useEffect, type PointerEvent } from 'react';
import { usePersistentState } from '../../store/usePersistentState';
import type { ImportedCharacter } from '../../data/characterImport';
import type { ScreenType, WorldBook } from '../../types';
import { generateCharacterReply, generateCreativeText, generateHtmlInterlude, readStoredAiSettings, resolveChannelAiSettings, listOpenAiCompatibleModels, testAiConnection, summarizeConversationMemory, mergeRecentMemoryBatch, type AiSettings } from '../../ai/aiEngine';
import { generateImage, generateSpeech, transcribeAudio } from '../../ai/mediaEngine';
import { readAppSettings } from '../../store/appSettings';
import type { ChannelAiSettings } from '../../store/appSettings';
import { getMedia, putMedia } from '../../store/mediaVault';
import { addRecentMemorySummary, applyMemoryMergeResult, getCharacterMemory } from '../../store/characterMemory';
import { getProjectManifest } from '../../store/projectManifest';
import { getCharacterProfile } from '../../data/characterProfiles';
import { getInitialChatMessages } from '../../data/characterChatSeeds';
import { upsertOfflineEvent, updateOfflineEvent } from '../../store/offlineEvents';
import { getLineGroupByName } from '../../store/lineGroups';
import { getGroupPreset, getGroupPresets } from '../../store/groupPresets';
import { getLineGroups, updateLineGroupMember, addLineGroupMemory, setLineGroupRelationships } from '../../store/lineGroups';
import { createTogetherMusicSession, type TogetherMusicSession } from '../../store/togetherMusic';
import { emitWorldEvent, setCharacterRuntime } from '../../store/worldRuntime';
import { appendStatusBarSnapshot, deleteStatusBarSnapshot, clearStatusBarHistory, getStatusBarHistory, getStatusBarPresets, getStatusBarRandomMode, getStatusBarForCharacter, renderStatusBarHtml, resolveStatusBarTokens, extractStatusMatch, sanitizeHtmlFragment, sanitizeStatusBarHtml, restoreStatusBarPresentationStyles, saveStatusBarRandomMode, type StatusBarPreset, type StatusBarSnapshot } from '../../store/statusBarPresets';
import { getCotPresets, type CotPreset, type CotPresetTarget } from '../../store/cotPresets';
import { getActivePromptPreset } from '../../store/promptPresets';
import { clearAiDebugLog, readAiDebugLog, readAiDebugTrace, writeAiDebugTrace, pushAiDebugLog, type AiDebugEntry, type AiDebugTrace } from '../../store/aiDebug';
import { PresetResourceManager } from './PresetResourceManager';
import { appendLineMessage, editLineMessage, toggleLineReaction, setLineMessageFavorite, recordLineCall, markLineMessageFailed, clearLineConversation, recallLineMessage, updateLineMessage } from '../../store/lineRuntime';
import { getLineConversationMessages, markLineConversationRead, saveLineConversationMessages, searchLineMessages, type LineRuntimeMessage } from '../../store/lineRuntime';
import { fetchLineWeather, formatLineWeather, type LineWeatherSnapshot } from '../../store/lineReality';
import {
  Video, Settings, Plus, Mic, Send, Smile,
  Image as ImageIcon, Film, FileText, Calendar, Sliders, RefreshCw, X,
  PhoneOff, MicOff, Volume2, Sparkles, PlusCircle, BookOpen, UserCheck,
  Palette, SlidersHorizontal, Eye, Code, Users, ChevronRight, ChevronLeft,
  Edit3, Brain, Play, Check, Trash2, Copy, Sparkle, Terminal,
  Phone, Search, CornerUpLeft, Share2, Download, AlertCircle, VolumeX,
  CheckSquare, Square, Pin, PinOff, Bell, BellOff, Bookmark, BookmarkCheck,
  FileDown, MessageCircle, Heart, Music2
} from 'lucide-react';

function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

function splitLineChatText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [''];
  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1 && lines.every((line) => Array.from(line).length <= 80)) return lines;
  return [normalized];
}
function splitGeneratedLineMessages(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1 && lines.every((line) => Array.from(line).length <= 80)) return lines;
  return [normalized];
}

function formatReplyReasonStatus(message: any): { icon: string; label: string; tone: 'wait' | 'muted' } | null {
  const status = String(message?.replyStatus || message?.replyDecision || message?.metadata?.replyStatus || '').toUpperCase();
  if (!status || status === 'REPLY_NOW') return null;
  const reason = String(message?.replyReason || message?.metadata?.replyReason || '').trim();
  const defaults: Record<string, string> = {
    REPLY_LATER: '晚一点再回复',
    READ_NO_REPLY: '看到了，但暂时没空回复',
    NOT_SEEN: '还没看到',
    IGNORE_FOR_NOW: '看到了，暂时不想处理',
  };
  if (!reason && !defaults[status]) return null;
  if (status === 'NOT_SEEN') return { icon: '○', label: reason || defaults[status], tone: 'muted' };
  return { icon: status === 'REPLY_LATER' ? '⌛' : '🚫', label: reason || defaults[status], tone: 'wait' };
}

type LineTimeDisplayLocale = 'zh-CN' | 'en-US';

function formatLineMessageClock(message: any, timezone: string, displayLocale: LineTimeDisplayLocale = 'zh-CN'): string {
  const raw = message?.createdAt || message?.timestamp;
  const date = raw ? new Date(raw) : null;
  if (!date || Number.isNaN(date.getTime())) return String(message?.time || '');
  const options: Intl.DateTimeFormatOptions = { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true };
  try {
    return new Intl.DateTimeFormat(displayLocale, options).format(date);
  } catch {
    return new Intl.DateTimeFormat(displayLocale, { ...options, timeZone: undefined }).format(date);
  }
}

function formatLineMessageExactDateTime(message: any, timezone: string, displayLocale: LineTimeDisplayLocale = 'zh-CN'): string {
  const raw = message?.createdAt || message?.timestamp;
  const date = raw ? new Date(raw) : null;
  if (!date || Number.isNaN(date.getTime())) return String(message?.time || '');
  try {
    return new Intl.DateTimeFormat(displayLocale, {
      timeZone: timezone, year: 'numeric', month: 'short', day: 'numeric', weekday: 'long',
      hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(displayLocale, {
      year: 'numeric', month: 'short', day: 'numeric', weekday: 'long',
      hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
    }).format(date);
  }
}

function getLineMessageDayKey(value: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(value);
    const part = (type: string) => parts.find(item => item.type === type)?.value || '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
}

function getLineMessageDayPeriod(value: Date, timezone: string): 'morning' | 'afternoon' {
  try {
    const hourText = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(value).find(part => part.type === 'hour')?.value;
    const hour = Number(hourText);
    if (Number.isFinite(hour)) return hour < 12 ? 'morning' : 'afternoon';
  } catch {
    // Fall back to the local clock if the configured timezone is invalid.
  }
  return value.getHours() < 12 ? 'morning' : 'afternoon';
}

function formatLineMessageDayLabel(value: Date, timezone: string, displayLocale: LineTimeDisplayLocale = 'zh-CN'): string {
  const dayKey = getLineMessageDayKey(value, timezone);
  const now = new Date();
  const todayKey = getLineMessageDayKey(now, timezone);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayKey = getLineMessageDayKey(yesterday, timezone);
  if (displayLocale === 'en-US') {
    const datePart = new Intl.DateTimeFormat('en-US', { timeZone: timezone, month: 'short', day: 'numeric' }).format(value);
    if (dayKey === todayKey) return 'Today · ' + datePart;
    if (dayKey === yesterdayKey) return 'Yesterday · ' + datePart;
    const sameYear = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric' }).format(value)
      === new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric' }).format(now);
    return new Intl.DateTimeFormat('en-US', { timeZone: timezone, month: 'short', day: 'numeric', weekday: 'short', ...(sameYear ? {} : { year: 'numeric' }) }).format(value);
  }
  const datePart = new Intl.DateTimeFormat('zh-CN', { timeZone: timezone, month: 'long', day: 'numeric' }).format(value);
  if (dayKey === todayKey) return '今天 ' + datePart;
  if (dayKey === yesterdayKey) return '昨天 ' + datePart;
  try {
    const sameYear = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric' }).format(value)
      === new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric' }).format(now);
    return new Intl.DateTimeFormat('zh-CN', { timeZone: timezone, month: 'long', day: 'numeric', weekday: 'short', ...(sameYear ? {} : { year: 'numeric' }) }).format(value);
  } catch {
    return value.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  }
}

function currentUserNameFallback(): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = window.localStorage.getItem('line:current-user');
    return raw ? JSON.parse(raw)?.name || '' : '';
  } catch {
    return '';
  }
}

function hasImportedCharacterInStorage(name: string, characterId?: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem('phone:characters');
    const characters = raw ? JSON.parse(raw) : [];
    return Array.isArray(characters) && characters.some((character: any) => characterId ? character?.id === characterId : character?.name === name);
  } catch {
    return false;
  }
}

interface LineConversationViewProps {
  contactName: string;
  characterId?: string;
  conversationId?: string;
  personaId?: string;
  onSwitchPersona?: () => void;
  personaOptions?: Array<{ id: string; name?: string; avatar?: string }>;
  onSelectPersona?: (personaId: string) => void;
  onBack: (draft?: string) => void;
  onNavigateHome: () => void;
  onNavigateScreen?: (screen: ScreenType) => void;
  initialDraft?: string;
  isGroup?: boolean;
  isPinned?: boolean;
  isMuted?: boolean;
  relationshipContext?: string;
  friendDeleted?: boolean;
  openingContext?: string;
  onTogglePin?: () => void;
  onToggleMute?: () => void;
  onConversationActivity?: (activity: { preview: string; time: string }) => void;
  globalFavorites?: any[];
  onSaveFavorite?: (fav: any) => void;
}

export function LineConversationView({
  contactName,
  characterId,
  conversationId,
  personaId,
  onBack,
  onNavigateScreen,
  onSwitchPersona,
  personaOptions = [],
  onSelectPersona,
  initialDraft = '',
  isGroup = false,
  isPinned = false,
  isMuted = false,
  relationshipContext = '',
  friendDeleted = false,
  openingContext = '',
  onTogglePin,
  onToggleMute,
  onConversationActivity,
}: LineConversationViewProps) {
  // Input & Messages
  const conversationStorageId = conversationId || characterId || contactName;
  const [inputText, setInputText] = useState(initialDraft);
  const [selectedOpeningContext, setSelectedOpeningContext] = usePersistentState<string>(`line:opening-context:${conversationStorageId}`, openingContext || '');
  const [lineLocale] = usePersistentState<'zh-CN' | 'ja-JP'>('line:locale', 'zh-CN');
  const ja = lineLocale === 'ja-JP';
  const tx = (zh: string, jp: string) => ja ? jp : zh;
  const hasImportedCharacter = hasImportedCharacterInStorage(contactName, characterId);
  const [storedMessages, setMessages] = usePersistentState<any[]>(
    `line:conversation:${conversationStorageId}`,
    hasImportedCharacter ? [] : getInitialChatMessages(contactName),
  );
  // Old/local data can be malformed. A bad conversation record must never prevent
  // the chat screen itself from opening.
  const messages = Array.isArray(storedMessages)
    ? storedMessages.filter((message): message is Record<string, any> => !!message && typeof message === 'object')
    : [];

  // Async AI work (especially status-bar generation) must always see the newest
  // conversation state, not the render that started the request.
  const messagesRef = useRef<Record<string, any>[]>([]);
  messagesRef.current = messages;


  // LINE keeps the complete conversation in storage, but only renders the newest
  // page at first. Older messages load naturally as you scroll upward.
  const LINE_PAGE_SIZE = 100; // 100 messages stay freely scrollable; older messages are folded by page.
  const [loadedMessageCount, setLoadedMessageCount] = useState(LINE_PAGE_SIZE);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const loadingOlderMessagesRef = useRef(false);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const visibleMessages = messages.slice(-loadedMessageCount);

  useEffect(() => {
    setLoadedMessageCount(Math.min(LINE_PAGE_SIZE, Math.max(0, messages.length)));
  }, [conversationStorageId]);

  const loadOlderMessages = () => {
    if (loadingOlderMessagesRef.current || loadedMessageCount >= messages.length) return;
    const viewport = messagesViewportRef.current;
    if (!viewport) return;

    // Lock pagination until the scroll offset is restored; otherwise a burst of
    // scroll events near the top can request several pages and fight the wheel.
    loadingOlderMessagesRef.current = true;
    const previousHeight = viewport.scrollHeight;
    const previousTop = viewport.scrollTop;
    setLoadedMessageCount((count) => Math.min(messages.length, count + LINE_PAGE_SIZE));
    requestAnimationFrame(() => {
      const heightDelta = viewport.scrollHeight - previousHeight;
      viewport.scrollTop = previousTop + heightDelta;
      requestAnimationFrame(() => {
        loadingOlderMessagesRef.current = false;
      });
    });
  };

  const scrollToLatestMessage = () => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;
    // Let onScroll hide the button once the viewport actually reaches the bottom.
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
  };

  const jumpToLineMessage = (messageId: number | string) => {
    const index = messages.findIndex((message) => String(message.id) === String(messageId));
    if (index < 0) return;
    setLoadedMessageCount((count) => Math.max(count, messages.length - index + 8));
    window.setTimeout(() => {
      const node = document.querySelector('[data-line-message-id="' + String(messageId).replaceAll('"', '&quot;') + '"]');
      node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  };

  // LINE runtime persistence: keep the existing visual/message UI untouched while
  // giving the conversation a durable runtime layer for search, read state and events.
  useEffect(() => {
    const stored = getLineConversationMessages(conversationStorageId);
    if (stored.length && messages.length === 0) {
      setMessages(stored.map(message => ({
        ...message,
      })));
    }
    markLineConversationRead(conversationStorageId, messages.at(-1)?.id);
  }, [conversationStorageId]);

  useEffect(() => {
    const runtimeMessages: LineRuntimeMessage[] = messages.map((message) => ({
      id: message.id,
      sender: message.sender,
      text: message.text || message.content,
      kind: message.type,
      createdAt: message.createdAt || message.timestamp,
      status: message.sender === 'other'
        ? 'read'
        : (message.status || 'sent'),
      replyToId: message.replyToId,
      reactions: Array.isArray(message.reactions)
        ? Object.fromEntries(message.reactions.map((emoji: string) => [emoji, 1]))
        : message.reactions,
      editedAt: message.editedAt,
      recalledAt: message.recalledAt,
      deletedAt: message.deletedAt,
      metadata: {
        ...(message.metadata || {}),
        mediaType: message.mediaType,
        mediaRef: message.mediaRef,
        transcript: message.transcript,
        fileName: message.fileName,
        thinking: message.thinking,
        thinkingSummary: message.thinkingSummary || message.metadata?.thinkingSummary,
        actionDescription: message.actionDescription || message.metadata?.actionDescription,
        statusBarRaw: message.statusBarRaw || message.metadata?.statusBarRaw,
        hasThinking: message.hasThinking,
        hasAction: message.hasAction,
      },
    }));
    // Mirror the whole visible conversation so older messages remain searchable,
    // recoverable after reload, and available to the AI context layer.
    saveLineConversationMessages(conversationStorageId, runtimeMessages);
    markLineConversationRead(conversationStorageId, messages.at(-1)?.id);
  }, [messages, conversationStorageId]);

  // Sheets & Overlays
  const [showPlusSheet, setShowPlusSheet] = useState(false);
  const [showAiDebugSheet, setShowAiDebugSheet] = useState(false);
  const [showPersonaPicker, setShowPersonaPicker] = useState(false);
  const [aiDebugLog, setAiDebugLog] = useState<AiDebugEntry[]>(() => readAiDebugLog());
  const [aiDebugTrace, setAiDebugTrace] = useState<AiDebugTrace | null>(() => readAiDebugTrace(conversationStorageId));
  const [subSheetType, setSubSheetType] = useState<'image' | 'video' | 'file' | null>(null);
  const [showVoiceSheet, setShowVoiceSheet] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | number | null>(null);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const [showStickerSheet, setShowStickerSheet] = useState(false);
  const [showCreator, setShowCreator] = useState(false);
  const [showTogetherMusic, setShowTogetherMusic] = useState(false);
  const [musicTitle, setMusicTitle] = useState('');
  const [musicArtist, setMusicArtist] = useState('');
  const [musicUrl, setMusicUrl] = useState('');
  const [creatorType, setCreatorType] = useState<'image' | 'video' | 'file' | 'voice'>('image');
  const [creatorPrompt, setCreatorPrompt] = useState('');
  
  useEffect(() => {
    const refreshAiDebug = () => { setAiDebugLog(readAiDebugLog()); setAiDebugTrace(readAiDebugTrace(conversationStorageId)); };
    window.addEventListener('sane333:ai-debug-changed', refreshAiDebug);
    window.addEventListener('sane333:ai-debug-trace-changed', refreshAiDebug);
    return () => { window.removeEventListener('sane333:ai-debug-changed', refreshAiDebug); window.removeEventListener('sane333:ai-debug-trace-changed', refreshAiDebug); };
  }, [conversationStorageId]);

  // Settings & Overlays
  const [showSettings, setShowSettings] = useState(false);
  const [showBehaviourSettings, setShowBehaviourSettings] = useState(false);
  const [showWorldbookSettings, setShowWorldbookSettings] = useState(false);
  const [showOpeningSettings, setShowOpeningSettings] = useState(false);
  const [showHtmlInterludeSettings, setShowHtmlInterludeSettings] = useState(false);
  const [allowRoleInitiatedMessage, setAllowRoleInitiatedMessage] = usePersistentState<boolean>(`line:allow-role-message:${conversationStorageId}`, true);
  const [allowRoleMomentsPost, setAllowRoleMomentsPost] = usePersistentState<boolean>(`line:allow-role-moments:${conversationStorageId}`, true);
  const [allowOfflineInvite, setAllowOfflineInvite] = usePersistentState<boolean>(`line:allow-offline-invite:${conversationStorageId}`, true);
  const [typingHabitPreset, setTypingHabitPreset] = usePersistentState<string>(`line:typing-habit:${conversationStorageId}`, 'natural');
  const [typingHabitCustom, setTypingHabitCustom] = usePersistentState<string>(`line:typing-habit-custom:${conversationStorageId}`, '');
  const [typingPunctuation, setTypingPunctuation] = usePersistentState<string>(`line:typing-punctuation:${conversationStorageId}`, 'natural');
  const [typingEmoji, setTypingEmoji] = usePersistentState<string>(`line:typing-emoji:${conversationStorageId}`, 'rare');
  const [typingSplit, setTypingSplit] = usePersistentState<string>(`line:typing-split:${conversationStorageId}`, 'natural');
  const [typingLineBreak, setTypingLineBreak] = usePersistentState<string>(`line:typing-linebreak:${conversationStorageId}`, 'natural');
  const [typingLength, setTypingLength] = usePersistentState<string>(`line:typing-length:${conversationStorageId}`, 'medium');
  const [typingFillers, setTypingFillers] = usePersistentState<string>(`line:typing-fillers:${conversationStorageId}`, 'natural');
  const [typingSentenceBreak, setTypingSentenceBreak] = usePersistentState<string>(`line:typing-sentence-break:${conversationStorageId}`, 'natural');
  const [replyCountEnabled, setReplyCountEnabled] = usePersistentState<boolean>(`line:reply-count-enabled:${conversationStorageId}`, false);
  const [replyCountMin, setReplyCountMin] = usePersistentState<number>(`line:reply-count-min:${conversationStorageId}`, 1);
  const [replyCountMax, setReplyCountMax] = usePersistentState<number>(`line:reply-count-max:${conversationStorageId}`, 3);

  const [bilingualMode, setBilingualMode] = usePersistentState<'off' | 'auto'>(`line:bilingual-mode:${conversationStorageId}`, 'off');
  const [chatTimeMode, setChatTimeMode] = usePersistentState<'current' | 'virtual'>(`line:chat-time-mode:${conversationStorageId}`, 'current');
  const [virtualChatTime, setVirtualChatTime] = usePersistentState<string>(`line:virtual-chat-time:${conversationStorageId}`, new Date().toISOString().slice(0, 16));
  const [chatTimezone, setChatTimezone] = usePersistentState<string>(`line:chat-timezone:${conversationStorageId}`, Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai');
  const [lineTimeDisplayLocale, setLineTimeDisplayLocale] = usePersistentState<LineTimeDisplayLocale>(`line:time-display-locale:${conversationStorageId}`, 'zh-CN');
  const [characterLanguage, setCharacterLanguage] = usePersistentState<string>(`line:character-language:${conversationStorageId}`, 'auto');
  const [characterRegion, setCharacterRegion] = usePersistentState<string>(`line:character-region:${conversationStorageId}`, '');
  const [characterWeather, setCharacterWeather] = usePersistentState<LineWeatherSnapshot | null>(`line:character-weather:${conversationStorageId}`, null);
  const [characterWeatherBusy, setCharacterWeatherBusy] = useState(false);
  const [storedCharacterTimeSensitivity, setCharacterTimeSensitivity] = usePersistentState<string>(`line:character-time-sensitivity:${conversationStorageId}`, 'natural');
  const characterTimeSensitivity = storedCharacterTimeSensitivity === 'sensitive' ? 'high' : storedCharacterTimeSensitivity === 'insensitive' ? 'low' : (storedCharacterTimeSensitivity === 'low' || storedCharacterTimeSensitivity === 'high' || storedCharacterTimeSensitivity === 'natural' ? storedCharacterTimeSensitivity : 'natural');
  const [chatApiOverride, setChatApiOverride] = usePersistentState<ChannelAiSettings>(`line:chat-api-override:${conversationStorageId}`, {
    ...readAppSettings().chatApiOverride,
    enabled: false,
  });
  const [chatApiModels, setChatApiModels] = useState<string[]>([]);
  const [chatApiBusy, setChatApiBusy] = useState<'models' | 'test' | null>(null);
  const conversationAiSettings = (): AiSettings => {
    const base = readStoredAiSettings(importedCharacter?.id, contactName);
    // The per-chat selector controls recent dialogue rounds for this conversation.
    const selectedRounds = Number.parseInt(String(presetContextLength), 10);
    const contextLength = Number.isFinite(selectedRounds) ? selectedRounds : 20;
    if (!chatApiOverride.enabled) return { ...base, contextLength };
    return {
      ...base,
      provider: chatApiOverride.provider,
      apiBaseUrl: chatApiOverride.apiBaseUrl,
      apiKey: chatApiOverride.apiKey,
      model: chatApiOverride.model,
      streaming: chatApiOverride.streaming,
      contextLength,
      maxOutputTokens: chatApiOverride.maxOutputTokens,
      temperature: chatApiOverride.temperature,
    };
  };
  const updateChatApiOverride = (patch: Partial<ChannelAiSettings>) => {
    setChatApiOverride(prev => ({ ...prev, ...patch }));
  };
  const fetchChatApiModels = async () => {
    if (!chatApiOverride.apiBaseUrl.trim() || !chatApiOverride.apiKey.trim()) { window.alert('请先填写 API 地址和 API Key'); return; }
    setChatApiBusy('models');
    try { setChatApiModels(await listOpenAiCompatibleModels(conversationAiSettings())); } catch (e) { window.alert(e instanceof Error ? e.message : '拉取模型失败'); } finally { setChatApiBusy(null); }
  };
  const testChatApi = async () => {
    if (!chatApiOverride.apiBaseUrl.trim() || !chatApiOverride.apiKey.trim() || !chatApiOverride.model.trim()) { window.alert('请先填写 API、Key 和模型'); return; }
    setChatApiBusy('test');
    try { await testAiConnection(conversationAiSettings()); window.alert('AI 连接测试成功 ✓'); } catch (e) { window.alert(e instanceof Error ? e.message : '连接测试失败'); } finally { setChatApiBusy(null); }
  };
  const [showVideoCall, setShowVideoCall] = useState(false);
  const [showReroll, setShowReroll] = useState(false);
  const [rerollTargetId, setRerollTargetId] = useState<number | string | null>(null);
  const [rerollPrompt, setRerollPrompt] = useState('');
  const [showTranscriptMap, setShowTranscriptMap] = useState<Record<number, boolean>>({});

  // 消息操作菜单 (长按/右键菜单 Context Menu & 引用回复)
  const [contextMenuMsg, setContextMenuMsg] = useState<any | null>(null);
  const [replyingToMsg, setReplyingToMsg] = useState<any | null>(null);
  const [showGroupMembers, setShowGroupMembers] = useState(false);
  const [unreadAnchorId, setUnreadAnchorId] = useState<number | string | null>(null);
  const [showUnreadJump, setShowUnreadJump] = useState(false);
  const [mentionAnchorId, setMentionAnchorId] = useState<number | string | null>(null);
  const [dismissedMentionId, setDismissedMentionId] = useState<number | string | null>(null);

  useEffect(() => {
    if (!isGroup || !messages.length) return;
    const myName = currentUserNameFallback() || '';
    if (!myName.trim()) return;
    const latestMention = [...messages].reverse().find((message) => {
      if (message.sender === 'me' || !message.text) return false;
      const text = String(message.text);
      return text.includes('@' + myName) || text.includes('＠' + myName);
    });
    if (latestMention && String(latestMention.id) !== String(dismissedMentionId)) {
      setMentionAnchorId(latestMention.id);
    }
  }, [messages, isGroup, dismissedMentionId]);

  useEffect(() => {
    if (unreadAnchorId !== null || !messages.length) return;
    const firstUnread = messages.find((message) => message.sender !== 'me' && message.isRead === false);
    if (firstUnread) {
      setUnreadAnchorId(firstUnread.id);
      setShowUnreadJump(true);
    }
  }, [messages, unreadAnchorId]);


  // Mobile LINE-style gestures: swipe right to quote; swipe left to edit your own message or open the message menu.
  const [swipingMessageId, setSwipingMessageId] = useState<number | string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const messageSwipeRef = useRef<{
    id: number | string;
    startX: number;
    startY: number;
    active: boolean;
    horizontalIntent?: boolean;
    longPressTriggered?: boolean;
  } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const clearMessageLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };
  const resetMessageSwipeVisual = (messageId?: number | string) => {
    setSwipingMessageId(current => messageId === undefined || current === messageId ? null : current);
    setSwipeOffset(0);
  };
  const handleMessagePointerDown = (event: PointerEvent, msg: any) => {
    if (isMultiSelectMode || event.pointerType === 'mouse' || event.button !== 0) return;
    clearMessageLongPress();
    // Keep native vertical scrolling browser-controlled.
    messageSwipeRef.current = {
      id: msg.id,
      startX: event.clientX,
      startY: event.clientY,
      active: true,
      horizontalIntent: false,
      longPressTriggered: false,
    };
    longPressTimerRef.current = window.setTimeout(() => {
      const current = messageSwipeRef.current;
      if (!current || current.id !== msg.id || !current.active || current.horizontalIntent) return;
      current.longPressTriggered = true;
      current.active = false;
      resetMessageSwipeVisual(msg.id);
      setContextMenuMsg(msg);
    }, 520);
  };
  const handleMessagePointerMove = (event: PointerEvent, msg: any) => {
    const start = messageSwipeRef.current;
    if (!start || !start.active || start.id !== msg.id || isMultiSelectMode || event.pointerType === 'mouse') return;

    const dx = event.clientX - start.startX;
    const dy = event.clientY - start.startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (absX > 9 || absY > 9) clearMessageLongPress();

    if (absY > 9 && absY > absX + 7) {
      start.active = false;
      start.horizontalIntent = false;
      resetMessageSwipeVisual(msg.id);
      return;
    }

    if (absX > 12 && absX > absY + 7) {
      start.horizontalIntent = true;
      setSwipingMessageId(msg.id);
      setSwipeOffset(Math.max(-82, Math.min(82, dx)));
    }
  };
  const handleMessagePointerUp = (event: PointerEvent, msg: any) => {
    clearMessageLongPress();
    const start = messageSwipeRef.current;
    messageSwipeRef.current = null;
    if (!start || start.id !== msg.id || isMultiSelectMode || event.pointerType === 'mouse') {
      resetMessageSwipeVisual(msg.id);
      return;
    }
    if (start.longPressTriggered) {
      resetMessageSwipeVisual(msg.id);
      return;
    }

    const dx = event.clientX - start.startX;
    if (start.horizontalIntent && dx >= 64) {
      setReplyingToMsg(msg);
      showToast('已引用这条消息');
    } else if (start.horizontalIntent && dx <= -64) {
      if (msg.text || msg.content) {
        setEditingMessageId(String(msg.id));
        setEditingMessageText(String(msg.text || msg.content || ''));
      } else {
        setContextMenuMsg(msg);
      }
    }
    resetMessageSwipeVisual(msg.id);
  };
  const cancelMessageSwipe = () => {
    clearMessageLongPress();
    messageSwipeRef.current = null;
    setSwipingMessageId(null);
    setSwipeOffset(0);
  };

  // 语音通话状态 (Voice Audio Call)
  const [showAudioCall, setShowAudioCall] = useState(false);
  const [audioCallDuration, setAudioCallDuration] = useState(0);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);

  // 聊天记录内搜索
  const [showInChatSearch, setShowInChatSearch] = useState(false);
  const [lineRuntimeSearchResults, setLineRuntimeSearchResults] = useState<LineRuntimeMessage[]>([]);
  const [inChatSearchQuery, setInChatSearchQuery] = useState('');
  useEffect(() => {
    setLineRuntimeSearchResults(inChatSearchQuery.trim() ? searchLineMessages(conversationStorageId, inChatSearchQuery) : []);
  }, [inChatSearchQuery, conversationStorageId, messages]);

  // 转发弹窗
  const [forwardMsg, setForwardMsg] = useState<any | null>(null);

  // 全屏大图 Lightbox
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [mediaCache, setMediaCache] = useState<Record<string, string>>({});

  // 消息编辑状态 (In-place Message Edit)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState('');
  const [swipedMessageId, setSwipedMessageId] = useState<number | null>(null);
  const [swipeAction, setSwipeAction] = useState<'edit' | 'quote' | null>(null);

  // 思维链只显示安全的高层摘要，不显示隐藏推理
  const [enableChainOfThought, setEnableChainOfThought] = usePersistentState<boolean>(`line:generate-thinking-summary:${conversationStorageId}`, true);
  const [showChainOfThoughtInChat, setShowChainOfThoughtInChat] = usePersistentState<boolean>(`line:show-thinking-in-chat:${conversationStorageId}`, true);
  const [lineActionDescriptionsEnabled, setLineActionDescriptionsEnabled] = usePersistentState<boolean>(`line:show-action-descriptions:${conversationStorageId}`, true);
  // The previous default was off and was persisted automatically for many existing
  // conversations. One-time migration makes the new default effective there too.
  // Users can still switch the option off again after this migration.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const migrationKey = `line:show-action-descriptions-default-v2:${conversationStorageId}`;
    try {
      if (window.localStorage.getItem(migrationKey)) return;
      const settingKey = `line:show-action-descriptions:${conversationStorageId}`;
      const storedSetting = window.localStorage.getItem(settingKey);
      if (storedSetting === null || storedSetting === 'false') {
        setLineActionDescriptionsEnabled(true);
      }
      window.localStorage.setItem(migrationKey, 'true');
    } catch {
      // A storage error must not block Line from opening.
    }
  }, [conversationStorageId, setLineActionDescriptionsEnabled]);
  const [preventUserFabrication, setPreventUserFabrication] = usePersistentState<boolean>(`line:prevent-user-fabrication:${conversationStorageId}`, true);
  const [naturalAddressing, setNaturalAddressing] = usePersistentState<boolean>(`line:behavior-natural-addressing:${conversationStorageId}`, true);
  const [stableNicknames, setStableNicknames] = usePersistentState<boolean>(`line:behavior-stable-nicknames:${conversationStorageId}`, true);
  const [relationshipAwareAddressing, setRelationshipAwareAddressing] = usePersistentState<boolean>(`line:behavior-relationship-addressing:${conversationStorageId}`, true);
  const [characterAutonomy, setCharacterAutonomy] = usePersistentState<boolean>(`line:behavior-character-autonomy:${conversationStorageId}`, true);
  const [avoidRepetition, setAvoidRepetition] = usePersistentState<boolean>(`line:behavior-avoid-repetition:${conversationStorageId}`, true);
  const [emotionContinuity, setEmotionContinuity] = usePersistentState<boolean>(`line:behavior-emotion-continuity:${conversationStorageId}`, true);

  // 普通聊天软件核心能力 (Standard Mobile Messenger Features)
  const [isTyping, setIsTyping] = useState(false);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState<number[]>([]);
  const [favorites, setFavorites] = usePersistentState<any[]>(`line:favorites:${conversationStorageId}`, []);
  const [showFavoritesModal, setShowFavoritesModal] = useState(false);
  const [showGroupNotice, setShowGroupNotice] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [nudgeAvatar, setNudgeAvatar] = useState(false);
  const [localPinned, setLocalPinned] = useState(isPinned);
  const [localMuted, setLocalMuted] = useState(isMuted);
  const [togetherMusic, setTogetherMusic] = usePersistentState<TogetherMusicSession | null>('line:together-music:' + conversationStorageId, null);

  // 我的人设管理器 (User Persona Manager)
  const [showPersonaManager, setShowPersonaManager] = useState(false);
  const [storedUserPersonas, setUserPersonas] = usePersistentState<any[]>('line:user-personas', []);
  const userPersonas = Array.isArray(storedUserPersonas)
    ? storedUserPersonas.filter((persona): persona is Record<string, any> => !!persona && typeof persona === 'object')
    : [];
  const [activePersonaId, setActivePersonaId] = usePersistentState<string | null>('line:active-persona', null);
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);
  const [showMyAvatar, setShowMyAvatar] = usePersistentState<boolean>(`line:show-my-avatar:${conversationStorageId}`, true);
  const myAvatarFileRef = useRef<HTMLInputElement>(null);
  const characterProfileAvatarFileRef = useRef<HTMLInputElement>(null);
  const characterCoverFileRef = useRef<HTMLInputElement>(null);
  const [showNewPersonaModal, setShowNewPersonaModal] = useState(false);
  const [newPersonaData, setNewPersonaData] = useState({
    name: '',
    age: '',
    profession: '',
    setting: '',
    avatar: '',
  });
  const [appearancePresets, setAppearancePresets] = usePersistentState<any[]>('line:appearance-presets', []);
  const [appearancePresetName, setAppearancePresetName] = useState('');

  // 美化管理器与自定义 CSS 编辑器 (Custom CSS Manager)
  const [showCssManager, setShowCssManager] = useState(false);
  const [currentWallpaper, setCurrentWallpaper] = usePersistentState<'pure-white' | 'warm-light' | 'tokyo-rain' | 'rose-mist'>(`line:wallpaper:${conversationStorageId}`, 'pure-white');
  const [customCss, setCustomCss] = usePersistentState(`line:custom-css:${conversationStorageId}`, `/* 酒馆自定义样式 (Custom CSS) */
.custom-chat-view {
  --bubble-border-radius: 16px;
}
.custom-chat-view .bubble-me {
  background: #f7eef0 !important;
  color: #303034 !important;
  box-shadow: 0 1px 3px rgba(212, 170, 181, 0.12);
}
.custom-chat-view .bubble-other {
  background: #f5f5f6 !important;
  color: #303034 !important;
}
.custom-chat-view .thinking-card {
  border-left: 2px solid #d4aab5;
}`);

  // 导入角色卡与全局世界书：真正 AI 回复从这里读取角色核心资料。
  const [storedImportedCharacters] = usePersistentState<ImportedCharacter[]>('phone:characters', []);
  const importedCharacters = Array.isArray(storedImportedCharacters)
    ? storedImportedCharacters.filter((character): character is ImportedCharacter => !!character && typeof character === 'object')
    : [];
  const importedCharacter = characterId
    ? importedCharacters.find(character => character && character.id === characterId) || null
    : importedCharacters.find(character => character && character.name === contactName) || null;
  const characterMemoryForPersona = importedCharacter ? getCharacterMemory(importedCharacter.id, importedCharacter.name) : null;
  const activePersona = userPersonas.find(p => p.id === characterMemoryForPersona?.personaId)
    || userPersonas.find(p => Array.isArray(p.boundCharacterIds) && p.boundCharacterIds.includes(importedCharacter?.id))
    || userPersonas.find(p => p.boundCharacterId === importedCharacter?.id)
    || userPersonas.find(p => p.id === activePersonaId)
    || {
    id: '',
    name: '',
    avatar: '',
    age: '',
    profession: '',
    setting: '',
    identity: '',
    traits: '',
    background: '',
    region: '',
    timezone: '',
    birthday: '',
  };

  const [personaLiveWeather, setPersonaLiveWeather] = useState<LineWeatherSnapshot | null>(null);

  const activeGroup = isGroup ? getLineGroupByName(contactName) : null;
  const safeGroupMembers = Array.isArray(activeGroup?.members)
    ? activeGroup.members.filter((member: any) => !!member && typeof member === 'object')
    : [];
  const groupAiMembers = safeGroupMembers
    .map(member => ({ member, character: importedCharacters.find(character => character.id === member.characterId || character.name === member.name) || null }))
    .filter(item => item.character && item.member.name !== currentUserNameFallback());
  const groupMembers = safeGroupMembers;
  const groupUnreadCount = messages.filter((message) => message.sender !== 'me' && message.isRead === false).length;

  // 群聊 @成员：只在输入框当前 @词时显示候选条。
  const [mentionPickerOpen, setMentionPickerOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');

  const currentMentionQuery = (value: string) => {
    const match = value.match(/(?:^|[\\s])@([^\\s@]*)$/);
    return match ? match[1] : null;
  };

  const filteredMentionMembers = isGroup
    ? groupAiMembers
        .filter(({ member }) => member.name !== currentUserNameFallback())
        .filter(({ member, character }) => {
          const query = mentionQuery.trim().toLowerCase();
          if (!query) return true;
          return [member.name, member.nickname, character?.name]
            .filter(Boolean)
            .some(name => String(name).toLowerCase().includes(query));
        })
        .slice(0, 6)
    : [];

  const handleComposerChange = (value: string) => {
    setInputText(value);
    if (!isGroup) {
      setMentionPickerOpen(false);
      return;
    }
    const query = currentMentionQuery(value);
    if (query !== null) {
      setMentionQuery(query);
      setMentionPickerOpen(true);
    } else {
      setMentionPickerOpen(false);
      setMentionQuery('');
    }
  };

  const insertMention = (name: string) => {
    const match = inputText.match(/(?:^|[\\s])@([^\\s@]*)$/);
    if (!match) return;
    const prefix = inputText.slice(0, match.index! + (match[0].startsWith(' ') ? 1 : 0));
    setInputText(prefix + '@' + name + ' ');
    setMentionPickerOpen(false);
    setMentionQuery('');
    window.setTimeout(() => document.querySelector<HTMLTextAreaElement>('[data-line-composer="true"]')?.focus(), 0);
  };

  const [storedWorldbooks] = usePersistentState<WorldBook[]>('phone:worldbooks', []);
  const worldbooks = Array.isArray(storedWorldbooks)
    ? storedWorldbooks.filter((book): book is WorldBook => !!book && typeof book === 'object' && Array.isArray(book.entries))
    : [];
  const [storedLineFriends] = usePersistentState<Array<{ name: string; characterId?: string; note?: string; online?: boolean; pinyin?: string }>>('line:friends-list', []);
  const lineFriends = Array.isArray(storedLineFriends)
    ? storedLineFriends.filter((friend): friend is { name: string; characterId?: string; note?: string; online?: boolean; pinyin?: string } => !!friend && typeof friend === 'object')
    : [];
  const forwardRecipients = Array.from(new Set([
    ...lineFriends.map(friend => friend.name).filter(Boolean),
    ...getLineGroups().filter(group => group.id !== activeGroup?.id).map(group => group.name).filter(Boolean),
  ]));
  const characterMemory = getCharacterMemory(importedCharacter?.id || contactName, contactName);
  const contactOnline = isGroup
    ? groupAiMembers.some(({ member }) => member.online !== false)
    : (lineFriends.find(friend => friend.characterId === characterId || friend.name === contactName)?.online ?? true);
  const projectManifest = getProjectManifest();

  useEffect(() => {
    const region = String(activePersona?.region || '').trim();
    if (!region) {
      setPersonaLiveWeather(null);
      return;
    }
    let cancelled = false;
    void fetchLineWeather(region).then(weather => {
      if (!cancelled) setPersonaLiveWeather(weather);
    });
    return () => { cancelled = true; };
  }, [activePersona?.id, activePersona?.region]);

  useEffect(() => {
    const region = String(activePersona?.region || '').trim();
    if (!region) {
      setPersonaLiveWeather(null);
      return;
    }
    let cancelled = false;
    void fetchLineWeather(region).then(weather => {
      if (!cancelled) setPersonaLiveWeather(weather);
    });
    return () => { cancelled = true; };
  }, [activePersona?.id, activePersona?.region]);

  useEffect(() => {
    if (!characterRegion.trim()) return;
    let cancelled = false;
    void fetchLineWeather(characterRegion).then(weather => {
      if (!cancelled && weather) setCharacterWeather(weather);
    });
    return () => { cancelled = true; };
  }, [characterRegion]);

  // 酒馆角色核心档案
  const [storedCharacterProfile, setCharacterProfile] = usePersistentState(
    `line:character-profile:${conversationStorageId}`,
    getCharacterProfile(contactName, characterId),
  );
  const [characterChatNote, setCharacterChatNote] = usePersistentState<string>(
    `line:character-chat-note:${conversationStorageId}`,
    '',
  );
  // Recover gracefully from an old/null profile record.
  const rawCharacterProfile =
    storedCharacterProfile && typeof storedCharacterProfile === 'object'
      ? storedCharacterProfile
      : getCharacterProfile(contactName, characterId);
  const characterProfileBase = getCharacterProfile(
    importedCharacter?.name || contactName,
    importedCharacter?.id || characterId,
  );
  const characterIdentity = importedCharacter?.name || contactName || '角色';
  const storedProfileCharacterId = String((rawCharacterProfile as any)?.characterId || '');
  const profileBelongsToCurrentCharacter =
    !storedProfileCharacterId ||
    !importedCharacter?.id ||
    storedProfileCharacterId === importedCharacter.id;

  // The imported Character Card is the source of truth for identity.
  // A conversation-level profile may override relationship/bio settings, but it
  // must never make the AI think this chat belongs to a different character.
  const storedCallMe = String(
    (profileBelongsToCurrentCharacter ? (rawCharacterProfile as any)?.callMe : '') || ''
  ).trim();
  const templateCallMe = new Set(['你', '角色', '小朋友', '阿念', '小摄影师', '我家小朋友', '小祖宗']);
  const characterCallMe = storedCallMe && storedCallMe !== characterIdentity && !templateCallMe.has(storedCallMe)
    ? storedCallMe
    : '';

  const characterProfile = {
    ...characterProfileBase,
    ...(profileBelongsToCurrentCharacter ? rawCharacterProfile : {}),
    characterId: importedCharacter?.id || characterId || undefined,
    nickname: characterIdentity,
    relationship: String(
      (profileBelongsToCurrentCharacter ? (rawCharacterProfile as any)?.relationship : '') ||
      characterProfileBase.relationship ||
      '尚未形成'
    ),
    callMe: characterCallMe,
    canCharacterSelfJudge: Boolean(
      (profileBelongsToCurrentCharacter ? (rawCharacterProfile as any)?.canCharacterSelfJudge : undefined)
      ?? characterProfileBase.canCharacterSelfJudge
      ?? true
    ),
  };

  const lineConversationRules = [
    preventUserFabrication ? '【最高优先级·用户边界】绝对不要替用户编造台词、动作、表情、想法、决定、经历或未提供的事实。用户没有明确说、做、表达或提供的信息，一律不得写成用户已经发生过的事实。只能描述角色自己的行为、语言、表情、想法与反应。' : '',
    bilingualMode === 'auto' ? '【双语模式】除普通话/国语/简体中文与繁体中文外，角色使用其他主要语言时，回复采用自然双语表达：保留角色原语言，并附自然中文对应，不要逐句机械翻译。' : '',
    characterLanguage !== 'auto' ? `【角色语言】本聊天角色主要使用 ${characterLanguage}。除非剧情或用户明确要求其他语言，不要擅自切换语言。` : '【角色语言】跟随角色卡/当前对话自然选择语言，不要无故切换语言。',
    chatTimeMode === 'current' ? `【时间】聊天时间跟随现实当前时间；当前时区为 ${chatTimezone}。涉及现在、今天、今晚、明天等相对时间时，以这个时区的真实日期时间为准。` : `【虚拟时间】本聊天时间固定为 ${virtualChatTime}，时间显示/理解时区为 ${chatTimezone}；涉及现在、今天、今晚、明天等相对时间时，只能依据这个虚拟时间推算。`,
    naturalAddressing ? '【自然称呼】除非当前语境确实需要叫住、强调、认真提醒或表达特殊情绪，普通消息不要机械使用用户姓名。不要为了显得亲密而每句话都喊名字。' : '',
    stableNicknames ? '【称呼稳定性】不要随机给用户创造多个新外号。角色已有的昵称应保持相对稳定；如果角色卡没有明确外号，不要为了制造亲密感而频繁发明新称呼。' : '',
    relationshipAwareAddressing ? '【关系语境称呼】判断称呼必须结合角色自己的性格、关系阶段和当前情境。情侣之间自然使用“老公/老婆/哥哥/宝宝”等亲昵称呼时，不要无理由表现惊讶、排斥或说“为什么这样叫我”；只有在双方关系尚未支持该称呼、角色确实不习惯，或上下文存在真实原因时，才可以自然地产生疑惑或调整。用户使用亲昵称呼本身不是异常行为。' : '',
    characterAutonomy ? '【角色自主判断】角色对称呼、关系、情绪和事件的反应应来自自己的角色设定、经历、关系和当前情境，而不是套用统一模板。不要为了“表现 AI 行为”强行制造反应。' : '',
    avoidRepetition ? '【避免机械重复】不要连续多条消息重复同一个名字、外号、亲昵称呼、情绪标签或固定句式。一次自然使用即可，下一句应像真人一样继续内容。' : '',
    emotionContinuity ? '【情绪连续但不循环】角色的情绪可以持续，也可以随着互动缓和、转移或改变；不要因为一次事件就让角色在每条后续消息里重复同一件事、反复翻旧账。' : '',
    characterTimeSensitivity === 'low' ? '【时间敏感度：不在意】角色基本不因用户多久没回复而产生情绪。允许用户长时间甚至很久不出现；再次出现时通常自然继续聊天。不要主动计算、记录或强调失联时长。' : characterTimeSensitivity === 'high' ? '【时间敏感度：高度在意】角色确实很重视联系与陪伴。长时间失联（例如一天、数天、数周，具体程度必须结合角色性格和关系）可以明显影响角色情绪，例如担心、想念、委屈、不满或生气，并能在用户回来后自然表现出来。但严禁把时间变成计时器：不要报具体分钟、小时，不要机械复述“你多久没回”，不要每隔几分钟催促，不要反复翻旧账。短暂聊天间隔仍然正常。' : '【时间敏感度：自然感知（默认）】角色像现实中的人一样感知联系是否中断。短暂不回复（几分钟、十几分钟等）完全正常，不应催促或计时；较长失联（例如一天、数天甚至更久）是否产生想念、担心、委屈、不满或生气，应由角色性格、关系和情境自然判断。时间可以影响角色情绪，但不要把时间本身当成话题，不要精确计算、报时或反复算账。用户回来后优先自然回应当前内容。',
    lineActionDescriptionsEnabled ? '【线上动作描写：开启】这是 LINE 聊天中的线上描写，不是线下小说旁白。角色可以在确有必要时输出一行简短的线上行为/反应，例如输入很久后删掉重写、看完消息停顿片刻、过了一会儿才回复等。严格使用 <action>...</action>，不要把现实场景动作写成长篇旁白。不是每条消息都必须有动作；没有表现价值时不要生成。' : '【线上动作描写：关闭】不要输出 <action> 标签或任何额外动作旁白。',
  ].filter(Boolean).join('\n');

  // 聊天设定使用真正的全局世界书；选择结果按聊天保存。
  const [selectedWorldBookId, setSelectedWorldBookId] = usePersistentState<string>(`line:selected-worldbook:${conversationStorageId}`, 'all');
  const [selectedWorldBookEntries, setSelectedWorldBookEntries] = usePersistentState<Record<string, string[]>>(`line:selected-worldbook-entries:${conversationStorageId}`, {});
  const [showLorebookInspector, setShowLorebookInspector] = useState(false);
  const activeWorldbooks = (() => {
    const globalBooks = selectedWorldBookId === 'all'
      ? worldbooks
      : selectedWorldBookId === 'none'
        ? []
        : worldbooks.filter(book => book.id === selectedWorldBookId);

    // Character-card lorebooks belong to the character itself and must travel with
    // the character into the AI context. Global/chat-selected books are layered on top.
    const embeddedBooks = importedCharacter?.embeddedWorldBooks || (importedCharacter?.embeddedWorldBook ? [importedCharacter.embeddedWorldBook] : []);
    const merged = [...embeddedBooks, ...globalBooks];
    const seen = new Set<string>();

    return merged
      .filter(book => {
        const key = book.id || 'book:' + book.name;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(book => ({
        ...book,
        entries: (Array.isArray(book.entries) ? book.entries : []).filter(entry => {
          const selected = selectedWorldBookEntries && typeof selectedWorldBookEntries === 'object'
            ? selectedWorldBookEntries[book.id]
            : undefined;
          // Embedded character-card entries remain enabled unless explicitly disabled
          // by their own card data; global books still obey the chat selection UI.
          return selected === undefined ? entry.enabled !== false : selected.includes(entry.id);
        }),
      }));
  })();

  // 酒馆思维链预设系统 (Chain of Thought Presets)
  const [showCotPresetModal, setShowCotPresetModal] = useState(false);
  const [showPresetResourceManager, setShowPresetResourceManager] = useState<'status' | 'cot' | null>(null);
  const [storedCotPresets, setCotPresets] = usePersistentState<CotPreset[]>('line:cot-presets', getCotPresets());
  const cotPresets = Array.isArray(storedCotPresets)
    ? storedCotPresets.filter((preset): preset is CotPreset => !!preset && typeof preset === 'object')
    : [];
  const [activeCotPresetId, setActiveCotPresetId] = usePersistentState(`line:cot-active:${conversationStorageId}`, 'cot-1');
  // Avoid Array.find here: this value is created during the first render and must not
  // close over a minified/hoisted binding while the conversation screen initializes.
  let activeCotPreset: CotPreset | undefined;
  for (const preset of cotPresets) {
    if (preset && preset.id === activeCotPresetId) {
      activeCotPreset = preset;
      break;
    }
  }
  const resolvedCotPreset = activeCotPreset || cotPresets[0] || {
    id: 'cot-fallback',
    title: '默认预设',
    description: '',
    template: '',
    tag: '<think>...</think>',
    exampleThinking: '',
    targets: ['line'] as CotPresetTarget[],
    createdAt: '',
    updatedAt: '',
  };
  const [customCotTemplate, setCustomCotTemplate] = usePersistentState(`line:cot-custom:${conversationStorageId}`, resolvedCotPreset.template);
  useEffect(() => {
    // When a preset is migrated or selected, make the active preset's template the
    // actual template used by replies. Manual edits remain intact until the preset changes.
    setCustomCotTemplate(resolvedCotPreset.template);
  }, [activeCotPresetId]);

  // 酒馆预设 (Presets)
  const [selectedPreset, setSelectedPreset] = usePersistentState(`line:preset:${conversationStorageId}`, 'immersive' as 'immersive' | 'casual' | 'slowburn' | 'sweet');
  const [presetTemp, setPresetTemp] = usePersistentState(`line:preset-temp:${conversationStorageId}`, '0.85');
  const [presetContextLength, setPresetContextLength] = usePersistentState(`line:preset-context:${conversationStorageId}`, '20轮');

  // 状态栏
  const [showRenderedStatusBarModal, setShowRenderedStatusBarModal] = useState(false);
  const [showStatusBarSettings, setShowStatusBarSettings] = useState(false);
  const [statusData, setStatusData] = usePersistentState(`line:status:${conversationStorageId}`, {
    location: '',
    time: '',
    activity: '',
    mood: '',
    favor: '0',
  });

  const [statusRegex, setStatusRegex] = usePersistentState(`line:status-regex:${conversationStorageId}`, '/\\{\\{status:(.*?)\\}\\}/gs');
  const [statusFormat, setStatusFormat] = usePersistentState(`line:status-format:${conversationStorageId}`, 
    '<div class="tavern-status"><span class="badge">📍 {{location}}</span> <span class="badge">🕒 {{time}}</span> <span class="badge">📖 {{activity}}</span> <span class="badge-pink">💖 好感度 {{favor}}</span><div class="mood">心境：{{mood}}</div></div>'
  );
  const [statusTab, setStatusTab] = useState<'preview' | 'regex' | 'format'>('preview');
  const [statusBarPresets, setStatusBarPresets] = usePersistentState<StatusBarPreset[]>('line:status-bar-presets', getStatusBarPresets());
  const characterBoundStatusBar = getStatusBarForCharacter(characterId, 'line');
  const [activeStatusBarPresetId, setActiveStatusBarPresetId] = usePersistentState(`line:status-bar-active:${conversationStorageId}`, characterBoundStatusBar?.id || statusBarPresets[0]?.id || 'status-minimal');
  const [statusBarHistory, setStatusBarHistory] = useState<StatusBarSnapshot[]>(() => getStatusBarHistory(conversationStorageId));
  const [statusBarHistoryIndex, setStatusBarHistoryIndex] = useState(Math.max(0, getStatusBarHistory(conversationStorageId).length - 1));
  const [statusBarRandomMode, setStatusBarRandomMode] = useState(() => getStatusBarRandomMode(conversationStorageId));
  const [statusBarEnabled, setStatusBarEnabled] = usePersistentState<boolean>(`line:status-bar-enabled:${conversationStorageId}`, true);
  const [htmlInterludeEnabled, setHtmlInterludeEnabled] = usePersistentState<boolean>(`line:html-interlude-enabled:${conversationStorageId}`, false);
  const [htmlInterludeChance, setHtmlInterludeChance] = usePersistentState<number>(`line:html-interlude-chance:${conversationStorageId}`, 25);
  const [htmlInterludeTemplate, setHtmlInterludeTemplate] = usePersistentState<string>(
    `line:html-interlude-template:${conversationStorageId}`,
    '<div class="sane-html-insert"><div class="sane-html-insert__eyebrow">SCENE NOTE</div><div class="sane-html-insert__title">{{title}}</div><div class="sane-html-insert__body">{{content}}</div></div>'
  );

  // 角色个人主页 (Threads / Twitter / LINE 混合风格)
  const [showCharacterProfile, setShowCharacterProfile] = useState(false);
  const [characterFeedPosts, setCharacterFeedPosts] = usePersistentState<any[]>(`line:character-feed:${conversationStorageId}`, []);
  const [characterProfileAvatar, setCharacterProfileAvatar] = usePersistentState<string>(`line:profile-avatar:${conversationStorageId}`, '');
  const [characterCover, setCharacterCover] = usePersistentState<string>(`line:profile-cover:${conversationStorageId}`, '');

  // 线下邀约剧情系统 (Offline Meetup System)
  const [showOfflineInviteModal, setShowOfflineInviteModal] = useState(false);
  const [offlineInviteData, setOfflineInviteData] = usePersistentState(`line:offline-draft:${conversationStorageId}`, {
    location: '',
    time: '',
    theme: '',
    letter: '',
    inviteFrom: 'other' as 'me' | 'other',
  });

  const [offlineInviteTheme, setOfflineInviteTheme] = usePersistentState<'white' | 'midnight' | 'parchment' | 'rose'>(`line:offline-theme:${conversationStorageId}`, 'white');
  const [offlineInviteCustomCss, setOfflineInviteCustomCss] = usePersistentState(`line:offline-css:${conversationStorageId}`, `/* 线下邀约卡片自定义样式 */
.custom-invite-card {
  box-shadow: 0 4px 14px rgba(212, 170, 181, 0.18);
}`);

  // 角色主页动态互动
  const [profileNewComment, setProfileNewComment] = useState('');
  const [profileCommentPostId, setProfileCommentPostId] = useState<string | null>(null);

  // 群聊专属设定 (Group Lorebook & Dynamics)
  const [groupRelationships, setGroupRelationships] = useState<Array<{ from: string; to: string; relation: string }>>([]);
  const [groupLorebookActive, setGroupLorebookActive] = useState('');
  const [groupPresetId, setGroupPresetId] = usePersistentState(`line:group-preset:${conversationStorageId}`, 'online-natural');
  const activeGroupPreset = getGroupPreset(groupPresetId, 'online');
  const [groupNoticeText, setGroupNoticeText] = useState('');

  // 角色日程
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleList, setScheduleList] = usePersistentState<any[]>(`line:schedule:${conversationStorageId}`, []);
  const [newScheduleTime, setNewScheduleTime] = useState('21:00');
  const [newScheduleTitle, setNewScheduleTitle] = useState('');
  const [newScheduleKind, setNewScheduleKind] = useState<'message' | 'moment' | 'offline-invite'>('message');
  const [newScheduleLocation, setNewScheduleLocation] = useState('');
  const [newScheduleTheme, setNewScheduleTheme] = useState('');
  const [showAddScheduleRow, setShowAddScheduleRow] = useState(false);

  // 录音模拟
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);

  // Toast
  const [toastMsg, setToastMsg] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingDiscardRef = useRef(false);
  const avatarClickTimerRef = useRef<number | null>(null);
  const memoryMergeBusyRef = useRef(false);
  const statusSwipeStartXRef = useRef<number | null>(null);
  // Status snapshots are tied to completed AI turns, not to a single UI branch.
  // This catches normal replies, Continue, rerolls, and any future reply path.
  const statusBarKnownMessageIdsRef = useRef<Set<string> | null>(null);
  const statusBarProcessingRef = useRef<Set<string>>(new Set());
  const statusBarPresetByTurnRef = useRef<Map<string, StatusBarPreset | undefined>>(new Map());

  useEffect(() => {
    const refresh = () => {
      const next = getStatusBarHistory(conversationStorageId);
      setStatusBarHistory(next);
      setStatusBarHistoryIndex(Math.max(0, next.length - 1));
      setStatusBarRandomMode(getStatusBarRandomMode(conversationStorageId));
    };
    window.addEventListener('sane333:status-bar-history-changed', refresh);
    window.addEventListener('sane333:status-bar-random-changed', refresh);
    return () => {
      window.removeEventListener('sane333:status-bar-history-changed', refresh);
      window.removeEventListener('sane333:status-bar-random-changed', refresh);
    };
  }, [conversationStorageId]);

  const resolveStatusBarPresetForTurn = (): StatusBarPreset | undefined => {
    if (!statusBarEnabled || isGroup) return undefined;
    const all = getStatusBarPresets();
    if (!all.length) return undefined;
    const linePool = all.filter(preset => preset.targets.includes('line'));
    const pool = linePool.length ? linePool : all;
    if (statusBarRandomMode) return pool[Math.floor(Math.random() * pool.length)];
    return getStatusBarForCharacter(characterId, 'line')
      || all.find(preset => preset.id === activeStatusBarPresetId)
      || statusBarPresets.find(preset => preset.id === activeStatusBarPresetId)
      || pool[0];
  };

  useEffect(() => {
    const delivered = messages.filter(message =>
      message.sender === 'other' &&
      message.type === 'ai-reply' &&
      message.status === 'delivered' &&
      String(message.text || '').trim()
    );

    if (!statusBarKnownMessageIdsRef.current) {
      statusBarKnownMessageIdsRef.current = new Set(delivered.map(message => String(message.id)));
      return;
    }

    const known = statusBarKnownMessageIdsRef.current;
    const fresh = delivered.filter(message => !known.has(String(message.id)));
    fresh.forEach(message => known.add(String(message.id)));
    if (!fresh.length || !statusBarEnabled || isGroup) return;

    // A single React update can deliver several turns at once. Process every
    // distinct turn; never drop newly-seen messages just because another turn
    // is currently creating its snapshot.
    const freshTurnIds = Array.from(new Set(fresh.map(message => String(message.turnId || message.id))));
    freshTurnIds.forEach(turnId => {
      if (statusBarProcessingRef.current.has(turnId)) return;
      statusBarProcessingRef.current.add(turnId);
      const turnMessages = messages
        .filter(message => String(message.turnId || message.id) === turnId && message.sender === 'other' && message.type === 'ai-reply')
        .map(message => ({
          id: message.id,
          text: String(message.text || '').trim(),
          statusBarRaw: String(message.statusBarRaw || message.metadata?.statusBarRaw || '').trim(),
        }))
        .filter(message => message.text || message.statusBarRaw);
      const latest = [...turnMessages].reverse().find(message => message.text || message.statusBarRaw);
      if (!latest) {
        statusBarProcessingRef.current.delete(turnId);
        statusBarPresetByTurnRef.current.delete(turnId);
        return;
      }
      const fullReply = turnMessages.map(message => message.text).filter(Boolean).join('\n');
      const rawStatus = turnMessages.map(message => message.statusBarRaw).find(Boolean) || '';
      void createStatusBarSnapshot(
        fullReply || latest.text,
        latest.id,
        rawStatus || undefined,
        statusBarPresetByTurnRef.current.get(turnId),
      ).finally(() => {
        statusBarProcessingRef.current.delete(turnId);
        statusBarPresetByTurnRef.current.delete(turnId);
      });
    });
  }, [messages, statusBarEnabled, isGroup]);

  const createStatusBarSnapshot = async (
    replyText: string,
    sourceMessageId: string | number,
    rawStatusOverride?: string,
    presetOverride?: StatusBarPreset,
    replaceExisting = false,
  ) => {
    const debugEvent = (level: 'info' | 'success' | 'error', event: string, message: string, meta?: Record<string, unknown>) => {
      pushAiDebugLog({
        level,
        event: '[SANE333 STATUS BAR] ' + event,
        message,
        provider: conversationAiSettings().provider,
        model: conversationAiSettings().model,
        meta: { conversationId: conversationStorageId, ...meta },
      });
    };

    try {
      const latestPresets = getStatusBarPresets();
      if (!statusBarEnabled) {
        debugEvent('info', 'disabled', '状态栏开关为关闭');
        return;
      }
      if (!latestPresets.length) {
        debugEvent('error', 'preset:error', '没有任何状态栏预设');
        throw new Error('没有可用的状态栏预设');
      }

      // Prefer the exact preset captured for this AI turn, then the current
      // character binding, and only then the chat's active/global fallback.
      const chosen = presetOverride
        || getStatusBarForCharacter(characterId, 'line')
        || resolveStatusBarPresetForTurn();
      if (!chosen) throw new Error('没有可用的状态栏预设');

      debugEvent('info', 'snapshot:start', '开始创建状态快照', {
        presetId: chosen.id,
        presetName: chosen.name,
        hasPrompt: Boolean(chosen.promptSuffix?.trim()),
        prompt: String(chosen.promptSuffix || ''),
        regex: String(chosen.regex || ''),
        htmlLength: String(chosen.html || '').length,
        rawOverride: Boolean(rawStatusOverride?.trim()),
      });

      // UWU-style status bars are emitted in the SAME character response.
      // Never make a second hidden AI request here: the current preset's Regex
      // must capture the status payload that came back with this exact reply.
      const rawStatus = rawStatusOverride?.trim() || '';
      debugEvent('info', rawStatus ? 'ai:response' : 'ai:response-missing-status',
        rawStatus ? '本轮角色回复已携带状态栏原文' : '本轮角色回复没有携带可匹配的状态栏原文',
        {
          rawStatus,
          rawLength: rawStatus.length,
          replyText: String(replyText || ''),
          presetId: chosen.id,
          regex: String(chosen.regex || ''),
        });

      if (!rawStatus) {
        throw new Error('本轮角色回复没有输出可匹配当前 Regex 的状态栏');
      }

      if (!rawStatus.trim()) throw new Error('AI 没有返回状态栏内容');

      const extracted = chosen.regex ? extractStatusMatch(rawStatus, chosen.regex) : null;
      debugEvent(extracted ? 'success' : 'error', extracted ? 'regex:matched' : 'regex:unmatched',
        extracted ? 'Regex 匹配成功' : 'AI 返回内容没有匹配当前 Regex',
        {
          regex: String(chosen.regex || ''),
          match: extracted?.match || '',
          captures: extracted?.captures || [],
          rawStatus,
        }
      );

      if (chosen.regex?.trim() && !extracted) {
        throw new Error('AI 返回内容没有匹配当前 Regex');
      }

      const html = sanitizeStatusBarHtml(renderStatusBarHtml(chosen, rawStatus, {
        char: '{{char}}',
        user: '{{user}}',
        char_avatar: '{{char_avatar}}',
        user_avatar: '{{user_avatar}}',
      }));
      debugEvent(html.trim() ? 'success' : 'error', html.trim() ? 'html:rendered' : 'html:empty',
        html.trim() ? 'HTML Template 渲染成功' : 'HTML Template 渲染为空',
        { htmlPreview: String(html || '').slice(0, 4000) });

      if (!html.trim()) throw new Error('HTML Template 渲染为空');

      const snapshot: StatusBarSnapshot = {
        id: `status-snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        presetId: chosen.id,
        presetName: chosen.name,
        html,
        sourceMessageId,
        sourceText: rawStatus,
        createdAt: new Date().toISOString(),
      };

      if (replaceExisting) {
        const sourceMessage = messages.find(message => String(message.id) === String(sourceMessageId));
        const sourceTurnId = String(sourceMessage?.turnId || sourceMessageId);
        const sourceMessageIds = new Set(messages
          .filter(message => String(message.turnId || message.id) === sourceTurnId)
          .map(message => String(message.id)));
        sourceMessageIds.add(String(sourceMessageId));
        getStatusBarHistory(conversationStorageId)
          .filter(item => sourceMessageIds.has(String(item.sourceMessageId)))
          .forEach(item => deleteStatusBarSnapshot(conversationStorageId, item.id));
      }
      appendStatusBarSnapshot(conversationStorageId, snapshot);
      const next = getStatusBarHistory(conversationStorageId);
      setStatusBarHistory(next);
      setStatusBarHistoryIndex(Math.max(0, next.length - 1));

      debugEvent('success', 'snapshot:saved', '状态栏快照已写入 History', {
        historyCount: next.length,
        snapshotId: snapshot.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      debugEvent('error', 'snapshot:failed', message, { replyText: String(replyText || '').slice(0, 3000) });
      showToast(`状态栏生成失败：${message.slice(0, 55)}`);
    }
  };

  const maybeGenerateHtmlInterlude = async (replyText: string, sourceMessageId: string | number) => {
    if (!htmlInterludeEnabled || Math.random() * 100 >= Math.max(0, Math.min(100, htmlInterludeChance))) return;
    const template = htmlInterludeTemplate.trim();
    if (!template) return;
    try {
      const raw = await generateHtmlInterlude(
        conversationAiSettings(),
        contactName,
        template,
        messagesRef.current
          .filter(message => String(message.id) !== String(sourceMessageId) && !String(message.id).startsWith(String(sourceMessageId) + '-'))
          .map(message => ({ sender: String(message.sender || 'unknown'), text: message.text, transcript: message.transcript }))
          .concat({ sender: 'other', text: replyText, transcript: '' }),
      );
      const html = sanitizeHtmlFragment(raw);
      if (!html) return;
      setMessages(prev => [
        ...prev,
        {
          id: `html-interlude-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          sender: 'other',
          type: 'html-interlude',
          text: '',
          htmlContent: html,
          sourceMessageId,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch {
      // HTML insertion is optional and must never interrupt chat.
    }
  };

  const handleMessageAvatarClick = () => {
    if (avatarClickTimerRef.current) window.clearTimeout(avatarClickTimerRef.current);
    avatarClickTimerRef.current = window.setTimeout(() => {
      setShowRenderedStatusBarModal(true);
      avatarClickTimerRef.current = null;
    }, 260);
  };

  const handleMessageAvatarDoubleClick = (name: string) => {
    if (avatarClickTimerRef.current) window.clearTimeout(avatarClickTimerRef.current);
    avatarClickTimerRef.current = null;
    handleNudge(name);
  };

  const applyStatusBarPreset = (preset: StatusBarPreset) => {
    setActiveStatusBarPresetId(preset.id);
    setStatusFormat(preset.html);
    setStatusRegex(preset.regex);
    setShowPresetResourceManager(null);
    showToast(`已应用状态栏：${preset.name}`);
  };

  const applyCotPreset = (preset: CotPreset) => {
    setActiveCotPresetId(preset.id);
    setCustomCotTemplate(preset.template);
    setShowPresetResourceManager(null);
    showToast(`已应用生成摘要预设：${preset.title}`);
  };

  const showToast = (text: string) => {
    setToastMsg(text);
    setTimeout(() => setToastMsg(''), 1800);
  };

  const startRealRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      showToast('当前浏览器不支持真实麦克风录音');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];
      recordingDiscardRef.current = false;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = event => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const discard = recordingDiscardRef.current;
        const chunks = recordingChunksRef.current;
        const elapsed = Math.max(1, recordDuration);
        stream.getTracks().forEach(track => track.stop());
        recordingStreamRef.current = null;
        mediaRecorderRef.current = null;
        recordingChunksRef.current = [];

        if (discard || !chunks.length) return;

        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onload = async () => {
          const audioUrl = typeof reader.result === 'string' ? reader.result : '';
          if (!audioUrl) return;

          try {
            const mediaRef = await putMedia(audioUrl);
            let transcript = '（真实语音消息）';
            const appSettings = readAppSettings();

            if (appSettings.sttEnabled && appSettings.sttProvider !== 'browser') {
              try {
                transcript = await transcribeAudio(blob, 'voice.webm', appSettings);
              } catch {
                transcript = '（语音转写失败）';
              }
            }

            setMessages(prev => [...prev, {
              id: Date.now(),
              sender: 'me',
              type: 'voice',
              duration: `0:${elapsed < 10 ? `0${elapsed}` : elapsed}`,
              transcript,
              mediaRef,
              time: '刚刚',
            }]);
            showToast(transcript.startsWith('（') ? '真实语音已发送' : '语音已发送 · 已自动转写');
          } catch {
            showToast('语音保存失败，请重试');
          }
        };
        reader.readAsDataURL(blob);
      };

      recorder.start(250);
      setIsRecording(true);
      showToast('麦克风已开启');
    } catch {
      showToast('无法使用麦克风，请检查浏览器权限');
    }
  };

  const stopRealRecording = (discard: boolean) => {
    recordingDiscardRef.current = discard;
    setIsRecording(false);

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
      return;
    }

    recordingStreamRef.current?.getTracks().forEach(track => track.stop());
    recordingStreamRef.current = null;
  };

  const hasMountedConversationRef = useRef(false);

  useEffect(() => {
    const refs = Array.from(new Set(
      messages
        .map(message => message.mediaRef as string | undefined)
        .filter(Boolean)
    )) as string[];

    if (!refs.length) return;

    let cancelled = false;
    void Promise.all(refs.map(async ref => {
      if (mediaCache[ref]) return [ref, mediaCache[ref]] as const;
      const url = await getMedia(ref).catch(() => null);
      return url ? [ref, url] as const : null;
    })).then(entries => {
      if (cancelled) return;
      const loaded = Object.fromEntries(entries.filter(Boolean) as Array<[string, string]>);
      if (Object.keys(loaded).length) setMediaCache(prev => ({ ...prev, ...loaded }));
    });

    return () => { cancelled = true; };
  }, [messages]);

  // Only follow the conversation when the user is already near the bottom.
  // Never yank the user back down while they are reading older messages.
  const previousMessageCountRef = useRef(messages.length);
  useEffect(() => {
    const viewport = messagesViewportRef.current;
    const previousCount = previousMessageCountRef.current;
    const grew = messages.length > previousCount;
    previousMessageCountRef.current = messages.length;
    if (!viewport || !grew) return;
    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    if (distanceFromBottom < 180) {
      requestAnimationFrame(() => {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
      });
    }
  }, [messages.length]);

  useEffect(() => {
    const onProactive = (event: Event) => {
      const customEvent = event as CustomEvent<{ characterName?: string }>;
      if (customEvent.detail?.characterName !== contactName) return;

      try {
        const raw = window.localStorage.getItem(`line:conversation:${conversationStorageId}`);
        if (raw) setMessages(JSON.parse(raw));
      } catch {
        // Keep the current conversation state.
      }
    };

    window.addEventListener('sane333:proactive-message', onProactive);
    return () => window.removeEventListener('sane333:proactive-message', onProactive);
  }, [contactName]);

  // Keep the parent chat list synchronized with the newest message.
  useEffect(() => {
    if (!hasMountedConversationRef.current) {
      hasMountedConversationRef.current = true;
      return;
    }

    const latest = messages[messages.length - 1];
    if (!latest || !onConversationActivity) return;

    const preview =
      latest.text ||
      latest.transcript ||
      (latest.type === 'offline-invite' ? '💌 线下剧情邀约' : '') ||
      (latest.type === 'real-media' ? `[媒体] ${latest.fileName || '附件'}` : '') ||
      (latest.type === 'ai-card' ? `[${latest.title || '多媒体'}]` : '') ||
      '新消息';

    onConversationActivity({
      preview: String(preview).replace(/\s+/g, ' ').slice(0, 80),
      time: latest.time || '刚刚',
    });
  }, [messages]);

  useEffect(() => {
    let timer: any;
    if (isRecording) {
      timer = setInterval(() => setRecordDuration((prev) => prev + 1), 1000);
    } else {
      setRecordDuration(0);
    }
    return () => clearInterval(timer);
  }, [isRecording]);

  // 语音通话时长计时
  useEffect(() => {
    let timer: any;
    if (showAudioCall) {
      timer = setInterval(() => setAudioCallDuration((prev) => prev + 1), 1000);
    } else {
      setAudioCallDuration(0);
    }
    return () => clearInterval(timer);
  }, [showAudioCall]);

  const handleSend = async (shouldReply = true) => {
    const userText = inputText.trim();
    if (!userText) return;
    if (shouldReply && isTyping) return;
    if (characterProfile.isBlockedByCharacter) { showToast('你已被对方拉黑，暂时无法发送消息'); return; }

    const msgId = Date.now();
    const newMsg: any = {
      id: msgId,
      sender: 'me',
      senderName: currentUserNameFallback() || activePersona?.name || '我',
      text: userText,
      content: userText,
      time: '刚刚',
      createdAt: new Date().toISOString(),
      isRead: false,
    };

    if (replyingToMsg) {
      newMsg.quote = {
        sender: replyingToMsg.sender === 'me' ? '我' : (replyingToMsg.senderName || characterProfile.nickname),
        text: replyingToMsg.text || replyingToMsg.desc || '多媒体内容',
      };
      setReplyingToMsg(null);
    }

    setMessages((prev) => [...prev, newMsg]);
    setInputText('');

    // Debug checkpoint at the actual LINE send entry. This is intentionally written
    // here, before any group/AI branching, so the current chat can never show an
    // empty AI backend after a real send.
    if (shouldReply) {
      // Debug tracing must never be able to stop a real LINE send. localStorage
      // can be full (large worldbooks / traces), so treat this as best-effort only.
      try {
        writeAiDebugTrace({
          context: {
            conversationId: conversationStorageId,
            characterId: importedCharacter?.id || characterId,
            characterName: importedCharacter?.name || characterProfile.nickname || contactName,
            userPersona: activePersona?.name,
            userMessage: userText,
            messageCount: messages.length + 1,
          },
          switches: {
            stage: 'line-send',
            cotEnabled: Boolean(enableChainOfThought),
            cotPreset: resolvedCotPreset ? {
              id: resolvedCotPreset.id,
              title: resolvedCotPreset.title,
              tag: resolvedCotPreset.tag,
            } : null,
            actionEnabled: Boolean(lineActionDescriptionsEnabled),
          },
          final: {
            status: 'send-entered',
            text: userText,
          },
        });
      } catch {
        // Never block the actual AI request because debug storage failed.
      }
    }

    // Enter/Return only sends the user's message. The paper-plane button passes shouldReply=true.
    if (!shouldReply) return;
    setIsTyping(true);

    // LINE read state: once the role starts processing the message, it has been seen.
    // A later role message upgrades the footer from “已读 · 暂未回复” to “已读”.
    setMessages((prev) =>
      prev.map((message) => message.id === msgId ? { ...message, isRead: true } : message)
    );

    if (isGroup) {
      try {
      if (groupAiMembers.length === 0) {
        showToast('这个群还没有导入可接入 AI 的角色卡');
        setMessages(prev => prev.filter(message => message.id !== msgId));
        return;
      }
      const mentioned = groupAiMembers.filter(({ member }) => userText.includes('@' + member.name) || userText.includes('@' + (member.nickname || '')));
      const pool = mentioned.length ? mentioned : groupAiMembers;
      const responders = pool.slice(0, mentioned.length && activeGroupPreset.mentionPriority ? 1 : Math.min(pool.length, activeGroupPreset.maxResponders));
      let workingMessages = [...messages, newMsg].map(message => ({ ...message, sender: message.sender || 'other' }));
      for (let index = 0; index < responders.length; index += 1) {
        const { character } = responders[index];
        if (!character) continue;
        const memberProfile = getCharacterProfile(character.name, character.id);
        const memberMemory = getCharacterMemory(character.id, character.name);
        const replyMsgId = Date.now() + index + 1;
        setMessages(prev => prev);
        let streamedText = '';
        const result = await generateCharacterReply({
          settings: conversationAiSettings(),
          character,
          characterProfile: memberProfile,
          persona: activePersona ? { ...activePersona, weather: personaLiveWeather ? formatLineWeather(personaLiveWeather) : activePersona.weather } : activePersona,
          characterWeather: characterWeather ? formatLineWeather(characterWeather) : '',
          worldbooks: activeWorldbooks,
          memory: memberMemory,
          project: projectManifest,
          messages: workingMessages,
          userMessage: userText,
          isGroup: true,
          authorNote: [
            lineConversationRules,
            '群聊预设：' + activeGroupPreset.name,
            activeGroupPreset.systemPrompt,
            groupNoticeText ? '群公告：' + groupNoticeText : '',
            activeGroup?.relationships?.length ? '【成员关系】\\n' + activeGroup.relationships.map(item => item.from + ' → ' + item.to + '：' + item.relation).join('\\n') : '',
            activeGroup?.events?.length ? '【群事件记忆】\\n' + activeGroup.events.slice(-12).map(item => item.text).join('\\n') : '',
            '【成员状态】\\n' + (activeGroup?.members || []).map(member => member.name + '：' + [member.online === false ? '离线' : '在线', member.mood || '', member.relationship || ''].filter(Boolean).join(' / ')).join('\\n'),
          ].filter(Boolean).join('\n'),
          stylePreset: selectedPreset,
        cotTarget: isGroup ? 'group' : 'line',
        cotPreset: undefined,
          typingHabit: [
            typingHabitPreset === 'custom' ? '总体风格：' + typingHabitCustom : '总体风格：' + typingHabitPreset,
            '标点：' + typingPunctuation,
            'emoji/表情：' + typingEmoji,
            '消息分条：' + typingSplit,
            '换行：' + typingLineBreak,
            '句子长度：' + typingLength,
            '语气词：' + typingFillers,
            '断句：' + typingSentenceBreak,
            replyCountEnabled
              ? `【一次性回复条数】开启：本轮角色必须自然分成 ${Math.max(1, Math.min(5, replyCountMin))}～${Math.max(Math.max(1, Math.min(5, replyCountMin)), Math.min(8, replyCountMax))} 条独立 LINE 消息。不得少于最少条数或超过最多条数；不要为了凑数制造无意义内容。`
              : '【一次性回复条数】关闭：按自然聊天节奏决定本轮消息条数。',
          ].join('；'),
          temperature: Number(presetTemp) || 0.85,
          debugConversationId: conversationStorageId,
          onDelta: delta => {
            streamedText += delta;
            const clean = streamedText.trim();
            if (!clean) return;
            setMessages(prev => {
              if (prev.some(m => m.id === replyMsgId)) return prev.map(m => m.id === replyMsgId ? { ...m, text: clean, senderName: character.name } : m);
              return [...prev, { id: replyMsgId, sender: 'other', senderName: character.name, text: clean, time: '刚刚', type: 'ai-reply', showThinking: false }];
            });
          },
        });
        const groupReplyText = String(result?.text || streamedText || '').trim();
        if (!groupReplyText) throw new Error(`${character.name} 没有返回任何内容，请检查 API、模型或网络连接。`);
        const groupReplyParts = splitGeneratedLineMessages(groupReplyText);
        setMessages(prev => {
          const targetIndex = prev.findIndex(m => m.id === replyMsgId);
          const withoutStreaming = prev.filter(m => m.id !== replyMsgId);
          const insertAt = targetIndex >= 0 ? Math.min(targetIndex, withoutStreaming.length) : withoutStreaming.length;
          const turnId = String(replyMsgId);
          withoutStreaming.splice(insertAt, 0, ...groupReplyParts.map((text, partIndex) => ({
            id: partIndex === 0 ? replyMsgId : `${replyMsgId}-${partIndex}`,
            turnId, sender: 'other', senderName: character.name, text, time: formatLineMessageClock({ createdAt: new Date().toISOString() }, chatTimezone, lineTimeDisplayLocale), createdAt: new Date().toISOString(),
            type: 'ai-reply', aiModel: result.model,
            matchedWorldbookEntries: result.matchedWorldbookEntries, status: 'delivered',
            thinkingSummary: partIndex === 0 ? result.thinkingSummary : undefined,
            actionDescription: partIndex === 0 ? result.actionDescription : undefined,
            showThinking: false,
            hasThinking: partIndex === 0 && Boolean(result.thinkingSummary),
            hasAction: partIndex === 0 && Boolean(result.actionDescription),
            metadata: {
              ...(partIndex === 0 && result.thinkingSummary ? { thinkingSummary: result.thinkingSummary } : {}),
              ...(partIndex === 0 && result.actionDescription ? { actionDescription: result.actionDescription } : {}),
            },
          })));
          return withoutStreaming;
        });
        // 角色真正回复后，用户刚才的消息才变成已读。
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, isRead: true } : m));
        workingMessages = [...workingMessages, { id: replyMsgId, sender: 'other', senderName: character.name, text: String(result?.text || '').trim() }];
        const member = responders[index].member;
        updateLineGroupMember(activeGroup?.id || '', member.id, {
          online: true,
          lastSeenAt: new Date().toISOString(),
          mood: '刚刚参与群聊',
          memory: [...(member.memory || []), result.text.slice(0, 160)].slice(-20),
        });
        addLineGroupMemory(activeGroup?.id || '', character.name + ' 在群聊中说：' + result.text.slice(0, 180));
        window.dispatchEvent(new CustomEvent('sane333:play-sound', { detail: { kind: 'message' } }));
      }
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : '群聊 AI 请求失败';
        // Keep the error path as normal source lines; never embed literal escape text here.
        setMessages(prev => {
          const hasEmpty = prev.some(m => m.type === 'ai-reply' && m.sender === 'other' && !String(m.text || '').trim());
          if (hasEmpty) return prev.map(m => m.type === 'ai-reply' && m.sender === 'other' && !String(m.text || '').trim() ? { ...m, status: 'failed', error: message, text: `回复失败：${message}` } : m);
          return [...prev, { id: Date.now() + 2, sender: 'other', senderName: 'AI', text: `回复失败：${message}`, time: '刚刚', type: 'ai-reply', status: 'failed', error: message }];
        });
        showToast(message.length > 72 ? message.slice(0, 72) + '…' : message);
      } finally {
        setIsTyping(false);
      }
    }

    const replyMsgId = Date.now() + 1;
    let replyMessageCreated = false;
    const ensureReplyMessage = (text = '') => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === replyMsgId)) {
          return prev.map((m) => m.id === replyMsgId ? { ...m, text, time: '刚刚' } : m);
        }
        return [...prev, {
          id: replyMsgId,
          sender: 'other',
          text,
          time: '刚刚',
          type: 'ai-reply',
          showThinking: false,
        }];
      });
      replyMessageCreated = true;
    };

    let streamedText = '';

    try {
      const turnStatusPreset = resolveStatusBarPresetForTurn();
      statusBarPresetByTurnRef.current.set(String(replyMsgId), turnStatusPreset);
      const settings = conversationAiSettings();
      const result = await generateCharacterReply({
        settings,
        character: importedCharacter,
        characterProfile: { ...characterProfile, canCharacterSelfJudge: characterProfile.canCharacterSelfJudge },
        persona: activePersona ? { ...activePersona, background: (activePersona as any).setting || (activePersona as any).background || '' } : activePersona,
        worldbooks: activeWorldbooks,
        memory: characterMemory,
        project: projectManifest,
        messages: [...messages, newMsg].map(message => ({ ...message, sender: message.sender || 'other' })),
        userMessage: userText,
        isGroup,
        stylePreset: selectedPreset,
        cotTarget: isGroup ? 'group' : 'line',
        cotPreset: undefined,
        statusBarPreset: turnStatusPreset,
        authorNote: [
          lineConversationRules,
          relationshipContext.trim() ? '【你们过去的关系背景】\n' + relationshipContext.trim() : '',
          messages.length === 0 && selectedOpeningContext.trim() ? '【角色卡开场白 / 前情提要】\n' + selectedOpeningContext.trim() : '',
           `【预设流程输出】必须依照预设 App 中当前启用的条目顺序逐项执行，并在 <preset_flow>...</preset_flow> 中完整记录每一步的执行结论；不可缩减成 1～3 句总摘要。随后输出角色正文。流程语言遵循角色语言设定；未指定时跟随用户当前消息语言。`,
          lineActionDescriptionsEnabled ? '【线上动作描写：开启】本轮如果有动作/反应必须输出 <action>...</action>，动作与正文分离。' : '【线上动作描写：关闭】不要输出 <action> 标签。',
        ].filter(Boolean).join('\\n'),
        typingHabit: [
          typingHabitPreset === 'custom' ? '总体风格：' + typingHabitCustom : '总体风格：' + typingHabitPreset,
          '标点：' + typingPunctuation,
          'emoji/表情：' + typingEmoji,
          '消息分条：' + typingSplit,
          '换行：' + typingLineBreak,
          '句子长度：' + typingLength,
          '语气词：' + typingFillers,
          '断句：' + typingSentenceBreak,
        ].join('；'),
        temperature: Number(presetTemp) || 0.85,
        debugConversationId: conversationStorageId,
        onDelta: (delta) => {
          streamedText += delta;
          ensureReplyMessage(streamedText);
        },
      });

      const finalReplyText = String(result?.text || streamedText || '').trim();
      if (!finalReplyText) {
        throw new Error('AI 没有返回任何内容，请检查 API、模型或网络连接。');
      }
      if (!replyMessageCreated) ensureReplyMessage(finalReplyText);

      const replyParts = splitGeneratedLineMessages(finalReplyText);
      const replyMetadata = {
        thinkingSummary: result.thinkingSummary,
        actionDescription: result.actionDescription,
      };
      setMessages((prev) => {
        const targetIndex = prev.findIndex((m) => m.id === replyMsgId);
        const withoutStreaming = prev.filter((m) => m.id !== replyMsgId);
        const insertAt = targetIndex >= 0 ? Math.min(targetIndex, withoutStreaming.length) : withoutStreaming.length;
        const turnId = String(replyMsgId);
        withoutStreaming.splice(insertAt, 0, ...replyParts.map((text, index) => ({
          id: index === 0 ? replyMsgId : `${replyMsgId}-${index}`,
          turnId, sender: 'other', text, time: formatLineMessageClock({ createdAt: new Date().toISOString() }, chatTimezone, lineTimeDisplayLocale), createdAt: new Date().toISOString(), type: 'ai-reply',
          status: 'delivered', aiModel: result.model,
          matchedWorldbookEntries: result.matchedWorldbookEntries,
          thinkingSummary: index === 0 ? replyMetadata.thinkingSummary : undefined,
          actionDescription: index === 0 ? replyMetadata.actionDescription : undefined,
          statusBarRaw: index === 0 ? result.statusBarRaw : undefined,
          showThinking: false,
          hasThinking: index === 0 && Boolean(replyMetadata.thinkingSummary),
          hasAction: index === 0 && Boolean(replyMetadata.actionDescription),
          metadata: {
            ...(index === 0 && replyMetadata.thinkingSummary ? { thinkingSummary: replyMetadata.thinkingSummary } : {}),
            ...(index === 0 && replyMetadata.actionDescription ? { actionDescription: replyMetadata.actionDescription } : {}),
            ...(index === 0 && result.statusBarRaw ? { statusBarRaw: result.statusBarRaw } : {}),
          },
        })));
        return withoutStreaming.map((m) => m.id === msgId ? { ...m, isRead: true } : m);
      });

      window.dispatchEvent(new CustomEvent('sane333:play-sound', { detail: { kind: 'message' } }));

      // Status snapshots are created by the delivered-message observer so normal,
      // continued, and image replies share one path without duplicate history entries.
      void maybeGenerateHtmlInterlude(finalReplyText, replyMsgId);

      if (importedCharacter) {
        setCharacterRuntime(importedCharacter.id, {
          activity: result.actionDescription?.trim() || '正在与你聊天',
          mood: result.thinkingSummary?.trim() ? '正在思考如何回应你' : '注意力在你身上',
          lastInteractionAt: new Date().toISOString(),
          lastAction: result.actionDescription?.trim() || '',
          lastThinkingSummary: result.thinkingSummary?.trim() || '',
          lastStatusRaw: result.statusBarRaw?.trim() || '',
        }, importedCharacter.name);
        emitWorldEvent('relationship.changed', {
          characterId: importedCharacter.id,
          characterName: importedCharacter.name,
          data: { source: 'chat', reason: 'conversation-replied' },
        });
      }

      if (result.matchedWorldbookEntries > 0) {
        showToast(`AI 已读取 ${result.matchedWorldbookEntries} 条命中的世界书设定 ✦`);
      }

      const latestSettings = readAppSettings();
      if (latestSettings.voiceEnabled && latestSettings.autoSpeakAiReplies) {
        try {
          await generateSpeech(result.text, latestSettings);
        } catch {
          // Voice failure must never break the chat response.
        }
      }

      const totalConversationMessages = messages.length + 2;

      // Memory candidate generation happens after a chat segment, not on every reply.
      // Ten messages form a lightweight segment; valid candidates enter the shared
      // Recent Memory Pool. Every 100 valid summaries are sent to the AI Merge Engine.
      if (importedCharacter && Math.floor(totalConversationMessages / 10) > Math.floor(messages.length / 10)) {
        void summarizeConversationMemory(
          conversationAiSettings(),
          contactName,
          characterMemory,
          [...messages, newMsg, { sender: 'other', text: result.text }]
        ).then(memoryResult => {
          for (const item of memoryResult.items) {
            const content = String(item.content || '').trim();
            if (!content) continue;
            addRecentMemorySummary(
              importedCharacter.id,
              importedCharacter.name,
              content,
              { source: 'line', importance: item.importance }
            );
          }

          const latestMemory = getCharacterMemory(importedCharacter.id, importedCharacter.name);
          const pending = latestMemory.recentSummaries || [];
          if (pending.length >= 100 && !memoryMergeBusyRef.current) {
            memoryMergeBusyRef.current = true;
            const batch = pending.slice(-100);
            void mergeRecentMemoryBatch(
              conversationAiSettings(),
              importedCharacter.name,
              latestMemory,
              batch
            ).then(mergeResult => {
              applyMemoryMergeResult(
                importedCharacter.id,
                importedCharacter.name,
                batch.map(item => item.id),
                mergeResult
              );
              window.dispatchEvent(new CustomEvent('sane333:memory-merged', {
                detail: {
                  characterId: importedCharacter.id,
                  source: 'line',
                  processed: batch.length,
                },
              }));
            }).catch(() => {
              // A failed merge leaves the 100 summaries untouched for retry.
            }).finally(() => {
              memoryMergeBusyRef.current = false;
            });
          }

          window.dispatchEvent(new CustomEvent('sane333:memory-updated', {
            detail: {
              characterId: importedCharacter.id,
              source: 'line',
              messageCount: totalConversationMessages,
              recentSummaryCount: pending.length,
            },
          }));
        }).catch(() => {
          // Memory maintenance must never interrupt the conversation.
        });
      }

      // 这里不再由系统因为“收到回复”自动修改关系/好感度。
      // 角色自主判断只影响角色自己的关系认知；真正的关系变化应有剧情或角色判断依据。
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI 请求失败';
      ensureReplyMessage(`发送失败：${message}`);
      setMessages((prev) => prev.map(m =>
        m.id === replyMsgId
          ? { ...m, status: 'failed', error: message, text: `发送失败：${message}` }
          : m
      ));
      markLineMessageFailed(conversationStorageId, replyMsgId, message);

      if (error instanceof Error && error.message === 'AI_NOT_CONFIGURED') {
        showToast('还没有配置 AI：打开「设置」填写 API Key');
      } else if (error instanceof Error && error.message === 'AI_BASE_URL_MISSING') {
        showToast('OpenAI Compatible 需要填写 API Base URL');
      } else {
        showToast(message.length > 72 ? message.slice(0, 72) + '…' : message);
      }
    } finally {
      setIsTyping(false);
    }
  };
  // 双击头像“拍一拍 / 戳一戳” (Nudge / Poke)
  const handleNudge = (targetName = characterProfile.nickname) => {
    setNudgeAvatar(true);
    setTimeout(() => setNudgeAvatar(false), 800);
    const nudgeId = Date.now();
    const isSelf = targetName === '自己' || targetName === '我';
    const nudgeMsg = {
      id: nudgeId,
      sender: 'system',
      type: 'system-nudge',
      text: isSelf ? '你拍了拍自己的头顶，并叹了一口气' : `你拍了拍 ${targetName} 的肩膀`,
      time: '刚刚'
    };
    setMessages((prev) => [...prev, nudgeMsg]);
    showToast(isSelf ? '你拍了拍自己' : `你拍了拍 ${targetName}`);

    if (!isSelf) {
      setTimeout(() => {
        const responseMsg = {
          id: Date.now() + 1,
          sender: 'system',
          type: 'system-nudge',
          text: `${targetName} 轻轻揉了揉你的头发，眼神温和：“怎么了？”`,
          time: '刚刚'
        };
        setMessages((prev) => [...prev, responseMsg]);
      }, 1500);
    }
  };

  // 投掷 D20 剧情判定骰子 (D20 Dice Roll)
  const handleRollDice = () => {
    const roll = Math.floor(Math.random() * 20) + 1;
    const isCrit = roll === 20;
    const isFail = roll === 1;
    const outcome = isCrit
      ? '（大成功！✨ 触发高甜惊喜剧情）'
      : isFail
      ? '（大失败！💥 发生了慌乱的小插曲）'
      : roll >= 10
      ? '（判定通过 ✓ 心情舒畅）'
      : '（判定未过 ✗ 略显尴尬）';
    const diceText = `🎲 投掷了 D20 剧情判定骰子：点数【${roll}】${outcome}`;
    const newMsg = {
      id: Date.now(),
      sender: 'me',
      text: diceText,
      time: '刚刚',
    };
    setMessages((prev) => [...prev, newMsg]);
    setShowPlusSheet(false);
    showToast(`骰子点数：${roll}`);
  };

  // 角色个人主页动态发评论
  const handleAddProfileComment = (postId: string) => {
    if (!profileNewComment.trim()) return;
    const userComment = profileNewComment.trim();
    setCharacterFeedPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        return {
          ...p,
          comments: [
            ...p.comments,
            { user: activePersona.name || '你', text: userComment },
          ],
        };
      })
    );
    setProfileNewComment('');
    setProfileCommentPostId(null);
    showToast('评论已发布到TA的动态 ✨');

    // 角色自主回复评论
    setTimeout(() => {
      setCharacterFeedPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p;
          return {
            ...p,
            comments: [
              ...p.comments,
              { user: characterProfile.nickname, text: `回复 @${activePersona.name || '你'}: 猜对了。下周带给你看。` },
            ],
          };
        })
      );
      showToast(`${characterProfile.nickname} 回复了你的评论 💬`);
    }, 2200);
  };

  // 批量操作处理 (Batch Actions)
  const handleBatchDelete = () => {
    if (selectedMsgIds.length === 0) return;
    selectedMsgIds.forEach(id => import('../../store/lineRuntime').then(({ deleteLineMessage }) => deleteLineMessage(conversationStorageId, id)));
    setMessages((prev) => prev.map((m) => selectedMsgIds.includes(m.id) ? { ...m, text: '', status: 'deleted', deletedAt: new Date().toISOString() } : m));
    showToast(`已删除 ${selectedMsgIds.length} 条消息`);
    setIsMultiSelectMode(false);
    setSelectedMsgIds([]);
  };

  const handleBatchFavorite = () => {
    if (selectedMsgIds.length === 0) return;
    const toFav = messages.filter((m) => selectedMsgIds.includes(m.id));
    const newFavs = toFav.map((m) => ({
      id: Date.now() + Math.random(),
      contactName,
      sender: m.sender,
      text: m.text || m.desc || '多媒体内容',
      time: m.time,
      savedAt: '刚刚'
    }));
    setFavorites((prev) => [...newFavs, ...prev]);
    showToast(`已收藏 ${selectedMsgIds.length} 条内容至收藏箱 ☆`);
    setIsMultiSelectMode(false);
    setSelectedMsgIds([]);
  };

  const handleBatchForward = () => {
    if (selectedMsgIds.length === 0) return;
    setForwardMsg({
      text: `[合并转发 ${selectedMsgIds.length} 条聊天记录]`,
      id: Date.now()
    });
    setIsMultiSelectMode(false);
    setSelectedMsgIds([]);
  };

  // 导出聊天记录 (Export Chat Log)
  const handleExportChat = () => {
    const lines = messages
      .filter((m) => m.type !== 'system-nudge')
      .map((m) => {
        const senderName = m.sender === 'me' ? '我' : characterProfile.nickname;
        const content = m.text || (m.descTitle ? `[${m.title}] ${m.desc}` : '[多媒体消息]');
        return `[${m.time}] ${senderName}: ${content}`;
      })
      .join('\n');

    const exportText = `==============================\nLINE 聊天记录导出 · ${contactName}\n导出时间: ${new Date().toLocaleString()}\n==============================\n\n${lines}`;

    navigator.clipboard?.writeText(exportText);
    showToast('聊天记录已复制到剪贴板，可粘贴保存');

    try {
      const blob = new Blob([exportText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `LINE_Chat_${contactName}_${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      // ignore in iframe
    }
  };

  // 清空聊天记录 (Clear Chat)
  const handleClearChat = () => {
    clearLineConversation(conversationStorageId);
    setMessages([]);
    setLoadedMessageCount(LINE_PAGE_SIZE);
    setShowClearConfirm(false);
    setShowSettings(false);
    showToast('已清空所有聊天记录');
  };

  // 消息撤回 (我方撤回)
  const handleRecallMessage = (msgId: number) => {
    // Persist recall in the same runtime record used by search/history/AI.
    import('../../store/lineRuntime').then(({ recallLineMessage }) => recallLineMessage(conversationStorageId, msgId));
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? { ...m, isRecalled: true, recalledOriginalText: m.text }
          : m
      )
    );
    setContextMenuMsg(null);
    showToast('已撤回一条消息');
  };

  // 角色撤回消息 (对方撤回 / 剧情害羞撤回)
  const handleOtherRecallMessage = (msgId: number, isRoleplayEvent = false) => {
    updateLineMessage(conversationStorageId, msgId, {
      text: '对方撤回了一条消息',
      status: 'recalled',
      recalledAt: new Date().toISOString(),
      metadata: { recalledByOther: true, roleplayEvent: isRoleplayEvent },
    });
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? {
              ...m,
              isRecalledByOther: true,
              recalledByOtherReason: isRoleplayEvent
                ? '（刚才手滑发出了内心私语，仓促撤回了……）'
                : '（对方撤回了一条消息）',
            }
          : m
      )
    );
    setContextMenuMsg(null);
    showToast(`${contextMenuMsg?.senderName || characterProfile.nickname} 撤回了一条消息`);

    if (isRoleplayEvent) {
      setTimeout(() => {
        const apologyMsg = {
          id: Date.now() + 1,
          sender: 'other',
          text: '……刚才发错了。你什么都没看到对吧？',
          time: '刚刚',
          thinking: '【情境感知】天哪，刚才不小心把没润色过的内心直白独白发出去了！\n【内心欲念】耳根发烫，心跳瞬间飙到130，生怕她觉得我轻浮或太黏人。\n【台词策略】故作镇静，但字里行间难掩局促害羞。',
          showThinking: false,
        };
        setMessages((prev) => [...prev, apologyMsg]);
      }, 1200);
    }
  };

  const generateRoleOfflineInvite = async () => {
    if (!allowOfflineInvite) {
      showToast('当前聊天已关闭角色主动线下邀约');
      return;
    }
    if (!importedCharacter) {
      showToast('当前聊天没有绑定角色，无法生成角色邀约');
      return;
    }
    showToast('AI 正在根据当前角色与聊天生成邀约……');
    try {
      const inviteResult = await generateCreativeText({
        settings: conversationAiSettings(),
        systemPrompt: [
          '你正在为当前角色设计一张线下见面邀约卡。',
          '只能扮演当前角色，不要替用户行动或说话。',
          '必须根据角色卡、长期记忆、当前聊天记录与世界书生成自然的真实邀约。',
          '地点、时间、主题必须结合当前情境，不得使用固定示例。',
          '不要提 AI、模型或提示词。',
          '严格输出 JSON。',
        ].join('\n'),
        userPrompt: [
          '【角色】' + importedCharacter.name,
          '【角色描述】' + importedCharacter.description,
          '【性格】' + importedCharacter.personality,
          '【角色设定】' + importedCharacter.scenario,
          '【关系档案】' + characterProfile.relationship + ' / ' + (characterProfile.bio || ''),
          '【长期记忆】' + (characterMemory.summary || '暂无'),
          '【世界书】' + (worldbooks.flatMap(book => book.enabled ? book.entries.filter(entry => entry.enabled).map(entry => entry.name + ': ' + entry.content) : []).join('\n') || '暂无'),
          '【最近聊天】' + messages.slice(-12).map(message => (message.sender === 'me' ? '我' : (message.senderName || importedCharacter.name)) + ': ' + (message.text || '')).join('\n'),
          '请输出 JSON：{"location":"地点","time":"时间","theme":"邀约主题","letter":"角色写给用户的邀约正文"}',
        ].join('\n\n'),
        temperature: 0.9,
        macroNames: { char: importedCharacter.name, user: activePersona?.name },
      });
      const cleaned = inviteResult.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
      const parsed = JSON.parse(cleaned);
      setOfflineInviteData({
        location: typeof parsed.location === 'string' ? parsed.location : '',
        time: typeof parsed.time === 'string' ? parsed.time : '',
        theme: typeof parsed.theme === 'string' ? parsed.theme : '',
        letter: typeof parsed.letter === 'string' ? parsed.letter : '',
        inviteFrom: 'other',
      });
      showToast('角色已经写好了一封邀约 ✦');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '生成角色邀约失败');
    }
  };
  // 发起线下邀约 (Offline Meetup Invite)
  const handleSendOfflineInvite = (from: 'me' | 'other') => {
    const inviteId = String(Date.now());
    const newMsg = {
      id: Number(inviteId),
      sender: from,
      type: 'offline-invite',
      inviteFrom: from,
      inviteLocation: offlineInviteData.location,
      inviteTime: offlineInviteData.time,
      inviteTheme: offlineInviteData.theme,
      inviteLetter: offlineInviteData.letter,
      inviteStatus: 'pending',
      time: '刚刚',
    };
    setMessages((prev) => [...prev, newMsg]);

    upsertOfflineEvent({
      id: `offline-${inviteId}`,
      characterId: importedCharacter?.id || contactName,
      characterName: characterProfile.nickname,
      title: offlineInviteData.theme || `与 ${characterProfile.nickname} 的线下见面`,
      location: offlineInviteData.location,
      time: offlineInviteData.time,
      theme: offlineInviteData.theme,
      letter: offlineInviteData.letter,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    setShowOfflineInviteModal(false);
    showToast(from === 'other' ? '角色已向你发起线下邀约 ✉️' : '已向角色发送线下邀约 ✉️');
  };

  // 接受线下邀约：真正交给当前角色模型生成赴约回应。
  const handleAcceptInvite = async (msgId: number) => {
    setMessages(prev => prev.map(message =>
      message.id === msgId ? { ...message, inviteStatus: 'accepted' } : message
    ));
    updateOfflineEvent(`offline-${msgId}`, { status: 'accepted' });
    setStatusData(prev => ({ ...prev, favor: String(Number(prev.favor || 0) + 5) }));
    showToast('已确认赴约！好感度 +5 💖');

    const invite = messages.find(message => message.id === msgId);
    const settings = conversationAiSettings();
    if (!settings.apiKey.trim()) return;

    try {
      const reply = await generateCreativeText({
        settings,
        systemPrompt: [
          '你正在私人 LINE 中扮演当前角色。',
          '用户刚刚接受了你发出的线下见面邀约。',
          '只输出角色下一条真实聊天消息。',
          '不要替用户说话，不要替用户行动，不要输出思维链，不要写成旁白。',
          '',
          '【角色】',
          importedCharacter ? [
            importedCharacter.name,
            importedCharacter.description,
            importedCharacter.personality,
            importedCharacter.scenario,
            importedCharacter.systemPrompt,
          ].join('\n') : characterProfile.nickname + ' · ' + characterProfile.relationship,
          '',
          '【长期记忆】',
          characterMemory.summary,
          ...characterMemory.items.slice(0, 8).map(item => '- ' + item.content),
          '',
          '【项目】',
          projectManifest.name,
          projectManifest.tone,
        ].join('\n'),
        history: messages.slice(-10).map(message => ({
          role: message.sender === 'other' ? 'assistant' as const : 'user' as const,
          content: message.text || message.transcript || '[邀约卡片]',
        })),
        userPrompt: [
          '用户刚刚接受了这条邀约。',
          invite ? '地点：' + invite.inviteLocation : '',
          invite ? '时间：' + invite.inviteTime : '',
          invite ? '主题：' + invite.inviteTheme : '',
          '自然回复一条手机聊天消息，让这次见面有真实的期待感。',
        ].filter(Boolean).join('\n'),
        temperature: settings.temperature,
        macroNames: { char: importedCharacter?.name || characterProfile.nickname, user: activePersona?.name },
      });

      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        sender: 'other',
        text: reply,
        time: '刚刚',
        showThinking: false,
      }]);
    } catch {
      // 邀约状态已经保存；AI 临时失败不影响剧情。
    }
  };

  // 推迟/改期线下邀约
  const handleDeclineInvite = (msgId: number) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, inviteStatus: 'declined' } : m))
    );
    updateOfflineEvent(`offline-${msgId}`, { status: 'declined' });
    showToast('已暂缓本次邀约');
  };

  // 由角色自己判断关系与称呼：依据角色卡、聊天、记忆、世界书，而不是随机模板。
  const handleAiUpdateCharacterJudgment = async () => {
    if (!importedCharacter) {
      showToast('当前聊天没有绑定角色');
      return;
    }
    showToast('AI 正在分析聊天记录、长期记忆与世界书……');
    try {
      const settings = conversationAiSettings();
      const raw = await generateCreativeText({
        settings,
        systemPrompt: [
          '你正在替当前角色判断自己的关系与称呼。',
          '判断必须站在角色自己的立场，而不是站在系统或旁观者立场。',
          '只依据角色卡、当前聊天、长期记忆、世界书与已有关系记录；没有依据就保持未形成，不要编造。',
          'relationship 是角色对你们关系的真实判断；callMe 是这个角色真实会使用的对用户称呼。',
          '禁止使用固定昵称模板、随机昵称或为了好听而虚构称呼。',
          '如果角色没有形成专属称呼，callMe 返回空字符串。',
          '严格输出 JSON：{"relationship":"...","callMe":"..."}',
        ].join('\\n'),
        userPrompt: [
          '【角色】' + importedCharacter.name,
          '【角色设定】' + [importedCharacter.description, importedCharacter.personality, importedCharacter.scenario].filter(Boolean).join('\\n'),
          '【当前关系】' + [characterProfile.relationship, characterProfile.callMe].filter(Boolean).join(' / '),
          '【好感度】' + String(statusData.favor || '未知'),
          '【长期记忆】' + (characterMemory.summary || '暂无'),
          ...characterMemory.items.slice(0, 12).map(item => '- ' + item.content),
          '【世界书】' + (worldbooks.flatMap(book => book.enabled ? book.entries.filter(entry => entry.enabled).map(entry => entry.name + ': ' + entry.content) : []).join('\\n') || '暂无'),
          '【最近聊天】' + messages.slice(-20).map(message => (message.sender === 'me' ? '用户' : (message.senderName || importedCharacter.name)) + ': ' + (message.text || message.transcript || '')).join('\\n'),
        ].join('\\n'),
        temperature: Math.min(0.8, Number(presetTemp) || 0.7),
        macroNames: { char: importedCharacter.name, user: activePersona?.name },
      });
      const parsed = JSON.parse(raw.trim().replace(/^```json\s*/i, '').replace(/```$/i, ''));
      const relationship = String(parsed.relationship || '').trim();
      const callMe = String(parsed.callMe || '').trim();
      if (!relationship && !callMe) throw new Error('角色目前没有形成新的关系判断或专属称呼');
      setCharacterProfile(prev => ({
        ...prev,
        ...(relationship ? { relationship } : {}),
        ...(callMe ? { callMe } : {}),
      }));
      showToast('关系档案已根据当前真实互动更新 ✦');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '关系档案更新失败');
    }
  };

  // AI 推演群聊人际关系网：根据真实群聊内容生成，而不是套固定关系模板。
  const handleAiInferGroupRelations = async () => {
    if (groupAiMembers.length < 2) {
      showToast('当前群聊至少需要两名角色，才能推演人物关系网络');
      return;
    }
    showToast('正在结合群成员、聊天记录与世界书推演关系网络……');
    try {
      const settings = conversationAiSettings();
      const raw = await generateCreativeText({
        settings,
        systemPrompt: [
          '你是私人虚拟手机的群聊关系分析器。',
          '只根据已经发生的群聊、成员资料、群公告和事件记忆判断关系，不要凭空编造。',
          '可以只输出真实存在且有证据的关系；不确定时写“关系尚未明确”。',
          '严格输出 JSON 数组，每项格式：{"from":"成员","to":"成员","relation":"关系"}。',
        ].join('\\n'),
        userPrompt: [
          '【成员】',
          ...groupAiMembers.map(item => {
            const member = item.member;
            return member.name + '：' + [member.relationship, member.mood, member.online === false ? '离线' : '在线'].filter(Boolean).join(' / ');
          }),
          '【群公告】' + (groupNoticeText || '暂无'),
          '【已有关系】' + (activeGroup?.relationships || groupRelationships || []).map(item => item.from + ' → ' + item.to + '：' + item.relation).join('\\n'),
          '【群事件】' + (activeGroup?.events || []).slice(-12).map(item => item.text).join('\\n'),
          '【最近聊天】' + messages.slice(-30).map(message => (message.sender === 'me' ? '我' : (message.senderName || '角色')) + ': ' + (message.text || '')).join('\\n'),
        ].join('\\n'),
        temperature: 0.55,
        macroNames: { char: importedCharacter?.name || characterProfile.nickname, user: activePersona?.name },
      });
      const parsed = JSON.parse(raw.trim().replace(/^\`\`\`json\\s*/i, '').replace(/\`\`\`$/i, ''));
      const inferred = Array.isArray(parsed)
        ? parsed
            .filter(item => item && item.from && item.to && item.relation)
            .slice(0, 12)
            .map(item => ({ from: String(item.from), to: String(item.to), relation: String(item.relation) }))
        : [];
      if (!inferred.length) throw new Error('AI 没有返回有效关系网络');
      setGroupRelationships(inferred);
      if (activeGroup?.id) setLineGroupRelationships(activeGroup.id, inferred);
      showToast('群聊关系网络已根据真实互动更新 ✦');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '群聊关系推演失败');
    }
  };

  // 表情回应 (Reaction)
  const handleAddReaction = (msgId: number, emoji: string) => {
    toggleLineReaction(conversationStorageId, msgId, emoji);
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId) return m;
        const currentReactions = m.reactions || [];
        const exists = currentReactions.includes(emoji);
        const updated = exists
          ? currentReactions.filter((r: string) => r !== emoji)
          : [...currentReactions, emoji];
        return { ...m, reactions: updated };
      })
    );
    setContextMenuMsg(null);
  };

  // 酒馆“继续 (Continue)”生成：真正调用当前角色 AI，不再插入固定假回复。
  const handleContinueGenerating = async () => {
    if (!importedCharacter) {
      showToast('还没有可继续生成的角色');
      return;
    }
    if (isTyping) return;

    const lastOther = [...messages].reverse().find(m => m.sender === 'other' && m.text?.trim());
    const lastUser = [...messages].reverse().find(m => m.sender === 'me' && m.text?.trim());
    const continuationId = Date.now() + 1;
    const settings = conversationAiSettings();

    setIsTyping(true);
    // 不预创建空白 AI 气泡；收到真实文本后才创建。

    let streamedText = '';
    try {
      const turnStatusPreset = resolveStatusBarPresetForTurn();
      statusBarPresetByTurnRef.current.set(String(continuationId), turnStatusPreset);
      const result = await generateCharacterReply({
        settings,
        character: importedCharacter,
        characterProfile,
        persona: activePersona,
        worldbooks: activeWorldbooks,
        memory: characterMemory,
        project: projectManifest,
        messages: messages.map(message => ({ ...message, sender: message.sender || 'other' })),
        // Continue is a new continuation instruction, not a replay of the old user turn.
        // Keeping the full history preserves the last assistant reply in its correct order.
        userMessage: '请接着角色上一条消息自然继续，不要重复已经说过的内容。',
        isGroup,
        authorNote: [
          lineConversationRules,
          '这是 Continue：请自然接着角色上一条未说完的内容继续。',
          lastOther?.text ? '【上一条角色消息】\\n' + lastOther.text : '',
          '不要重复上一条已经说过的内容，也不要突然改变话题；像真实聊天一样自然补完。',
        ].filter(Boolean).join('\\n'),
        statusBarPreset: turnStatusPreset,
        stylePreset: activeCotPreset?.title || selectedPreset,
        cotTarget: isGroup ? 'group' : 'line',
        cotPreset: undefined,
        typingHabit: [
          typingHabitPreset === 'custom' ? '总体风格：' + typingHabitCustom : '总体风格：' + typingHabitPreset,
          '标点：' + typingPunctuation,
          'emoji/表情：' + typingEmoji,
          '消息分条：' + typingSplit,
          '换行：' + typingLineBreak,
          '句子长度：' + typingLength,
          '语气词：' + typingFillers,
          '断句：' + typingSentenceBreak,
        ].join('；'),
        temperature: Number(presetTemp) || 0.85,
        debugConversationId: conversationStorageId,
        onDelta: delta => {
          streamedText += delta;
          const clean = streamedText.trim();
          if (!clean) return;
          setMessages(prev => {
            if (prev.some(m => m.id === continuationId)) return prev.map(m => m.id === continuationId ? { ...m, text: clean, status: 'sending' } : m);
            return [...prev, { id: continuationId, sender: 'other', type: 'ai-reply', text: clean, time: '刚刚', status: 'sending', showThinking: false }];
          });
        },
      });

      const finalText = String(result.text || streamedText || '').trim();
      if (!finalText) throw new Error('角色没有返回任何内容，请检查 API、模型或网络连接。');
      const replyMetadata = {
        thinkingSummary: result.thinkingSummary,
        actionDescription: result.actionDescription,
        statusBarRaw: result.statusBarRaw,
      };
      setMessages(prev => {
        if (prev.some(m => m.id === continuationId)) return prev.map(m => m.id === continuationId ? {
          ...m,
          text: finalText,
          status: 'delivered',
          aiModel: result.model,
          ...replyMetadata,
          hasThinking: Boolean(result.thinkingSummary),
          hasAction: Boolean(result.actionDescription),
          showThinking: false,
          metadata: { ...(m.metadata || {}), ...replyMetadata },
        } : m);
        return [...prev, {
          id: continuationId,
          sender: 'other',
          type: 'ai-reply',
          text: finalText,
          time: '刚刚',
          createdAt: new Date().toISOString(),
          status: 'delivered',
          aiModel: result.model,
          ...replyMetadata,
          hasThinking: Boolean(result.thinkingSummary),
          hasAction: Boolean(result.actionDescription),
          showThinking: false,
          metadata: replyMetadata,
        }];
      });
      appendLineMessage(conversationStorageId, {
        id: continuationId,
        sender: 'other',
        text: finalText,
        kind: 'text',
        status: 'delivered',
        createdAt: new Date().toISOString(),
        metadata: replyMetadata,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '继续生成失败';
      setMessages(prev => {
        if (prev.some(m => m.id === continuationId)) return prev.map(m => m.id === continuationId ? { ...m, status: 'failed', error: message, text: `回复失败：${message}` } : m);
        return [...prev, { id: continuationId, sender: 'other', type: 'ai-reply', text: `回复失败：${message}`, time: '刚刚', status: 'failed', error: message }];
      });
      markLineMessageFailed(conversationStorageId, continuationId, message);
      showToast(message.length > 72 ? message.slice(0, 72) + '…' : message);
    } finally {
      setIsTyping(false);
    }
  };

  // 分支重抽滑动切换 (Swipe variant)
  const handleSwitchVariant = (msgId: number, direction: 'prev' | 'next') => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.variants) return m;
        const total = m.variants.length;
        let newIdx = direction === 'next' ? m.variantIndex + 1 : m.variantIndex - 1;
        if (newIdx < 0) newIdx = total - 1;
        if (newIdx >= total) newIdx = 0;
        return {
          ...m,
          variantIndex: newIdx,
          text: m.variants[newIdx],
        };
      })
    );
  };

  // 发送文字图片/视频/文件/语音卡片
  const handleCreateTextCard = async () => {
    const prompt = creatorPrompt.trim();
    if (!prompt) {
      showToast('先描述一下你想发送的内容');
      return;
    }

    const settings = readAppSettings();
    setCreatorPrompt('');
    setShowCreator(false);

    if (creatorType === 'image' && settings.imageEnabled) {
      showToast('图片模型正在生成……');
      try {
        const result = await generateImage(prompt, settings);
        const mediaRef = result.url.startsWith('data:') ? await putMedia(result.url) : undefined;
        setMessages((prev) => [...prev, {
          id: Date.now(),
          sender: 'me',
          type: 'real-media',
          mediaType: 'image',
          fileName: 'AI_Image.png',
          mediaUrl: mediaRef ? undefined : result.url,
          mediaRef,
          time: '刚刚',
          alt: prompt,
        }]);
        showToast('AI 图片已发送 ✦');
        return;
      } catch (error) {
        showToast(error instanceof Error ? error.message : '图片生成失败');
        return;
      }
    }

    if (creatorType === 'voice' && settings.voiceEnabled) {
      showToast('语音正在生成……');
      try {
        const result = await generateSpeech(prompt, settings);
        if (!result) throw new Error('语音生成失败');
        const mediaRef = result.url ? await putMedia(result.url) : undefined;
        setMessages((prev) => [...prev, {
          id: Date.now(),
          sender: 'me',
          type: 'voice',
          transcript: prompt,
          duration: Math.max(1, Math.round(prompt.length / 5)),
          mediaRef,
          time: '刚刚',
        }]);
        showToast(result.source === 'browser' ? '已调用浏览器语音' : 'AI 语音已发送');
        return;
      } catch (error) {
        showToast(error instanceof Error ? error.message : '语音生成失败');
        return;
      }
    }

    const typeNames: Record<string, { label: string; descTitle: string }> = {
      image: { label: '文字图片', descTitle: '图片描述' },
      video: { label: '文字视频', descTitle: '视频描述' },
      file: { label: '文字文件', descTitle: '文件描述' },
    };
    const info = typeNames[creatorType];
    setMessages((prev) => [...prev, {
      id: Date.now(),
      sender: 'me',
      type: 'ai-card',
      category: creatorType,
      title: info.label,
      descTitle: info.descTitle,
      desc: prompt,
      time: '刚刚',
    }]);
    showToast(`${info.label}已发送给角色`);
  };

  // 真实文件上传模拟
  const handleRealUpload = (type: 'image' | 'video' | 'file' | 'voice', file: File) => {
    const typeLabels: Record<string, string> = {
      image: '真实图片',
      video: '真实视频',
      file: '真实文件',
      voice: '真实语音',
    };

    if (type === 'image' || type === 'voice') {
      const reader = new FileReader();
      reader.onload = async () => {
        const mediaUrl = typeof reader.result === 'string' ? reader.result : '';
        if (!mediaUrl) return;

        void putMedia(mediaUrl).then(async mediaRef => {
          let voiceDuration = '语音';
          if (type === 'voice') {
            try {
              const probe = new Audio(mediaUrl);
              const seconds = await new Promise<number>((resolve, reject) => {
                probe.onloadedmetadata = () => resolve(probe.duration);
                probe.onerror = () => reject(new Error('VOICE_DURATION_UNAVAILABLE'));
              });
              if (Number.isFinite(seconds) && seconds > 0) {
                const total = Math.round(seconds);
                voiceDuration = `0:${total < 10 ? '0' : ''}${total}`;
              }
            } catch {
              // Keep the real audio message even if duration metadata is unavailable.
            }
          }

          const newMsg = {
            id: Date.now(),
            sender: 'me',
            type: type === 'voice' ? 'voice' : 'real-media',
            mediaType: type,
            fileName: file.name,
            mediaRef,
            transcript: type === 'voice' ? '（本地语音消息）' : undefined,
            duration: type === 'voice' ? voiceDuration : undefined,
            time: '刚刚',
          };

          setMessages(prev => [...prev, newMsg]);
        setSubSheetType(null);
        showToast(`${typeLabels[type]}已发送：${file.name}`);

          if (type === 'voice') {
            const appSettings = readAppSettings();
            if (appSettings.sttEnabled && appSettings.sttProvider !== 'browser') {
              try {
                const transcript = await transcribeAudio(
                  file,
                  file.name,
                  appSettings,
                );
                setMessages(prev => prev.map(message =>
                  message.id === newMsg.id ? { ...message, transcript } : message
                ));
              } catch {
                // Voice remains sendable even if STT is unavailable.
              }
            }
          }

          if (type === 'image') {
          const settings = conversationAiSettings();
          if (!settings.apiKey.trim()) return;

          setIsTyping(true);
          const replyMsgId = Date.now() + 1;
          // 图片理解不预创建空白 AI 气泡。

          let streamed = '';
          try {
            const turnStatusPreset = resolveStatusBarPresetForTurn();
            statusBarPresetByTurnRef.current.set(String(replyMsgId), turnStatusPreset);
            const result = await generateCharacterReply({
              settings,
              character: importedCharacter,
              characterProfile,
              persona: activePersona ? { ...activePersona, background: (activePersona as any).background || (activePersona as any).setting || '' } : activePersona,
              worldbooks: activeWorldbooks,
              memory: characterMemory,
              project: projectManifest,
              messages: [
                ...messages.map((message: any) => ({ sender: message.sender || 'other', ...message })),
                {
                  sender: 'me',
                  text: '我给你发了一张图片，请看看这张图片并自然回应。',
                  createdAt: new Date().toISOString(),
                  imageData: mediaUrl,
                },
              ],
              userMessage: '我给你发了一张图片，请看看这张图片并自然回应。',
              isGroup,
              authorNote: lineConversationRules,
              statusBarPreset: turnStatusPreset,
              stylePreset: activeCotPreset?.title || selectedPreset,
        cotTarget: isGroup ? 'group' : 'line',
        cotPreset: undefined,
              typingHabit: [
          typingHabitPreset === 'custom' ? '总体风格：' + typingHabitCustom : '总体风格：' + typingHabitPreset,
          '标点：' + typingPunctuation,
          'emoji/表情：' + typingEmoji,
          '消息分条：' + typingSplit,
          '换行：' + typingLineBreak,
          '句子长度：' + typingLength,
          '语气词：' + typingFillers,
          '断句：' + typingSentenceBreak,
        ].join('；'),
              temperature: Number(presetTemp) || 0.85,
              debugConversationId: conversationStorageId,
              onDelta: delta => {
                streamed += delta;
                setMessages(prev => {
                  if (prev.some(message => message.id === replyMsgId)) {
                    return prev.map(message => message.id === replyMsgId ? { ...message, text: streamed, status: 'sending' } : message);
                  }
                  return [...prev, { id: replyMsgId, sender: 'other', type: 'ai-reply', text: streamed, time: '刚刚', createdAt: new Date().toISOString(), status: 'sending', showThinking: false }];
                });
              },
            });

            if (!result) throw new Error('图片理解失败');

            setMessages(prev => {
              if (prev.some(message => message.id === replyMsgId)) {
                return prev.map(message => message.id === replyMsgId
                  ? {
                    ...message,
                    text: result.text,
                    aiModel: result.model,
                    status: 'delivered',
                    thinkingSummary: result.thinkingSummary,
                    actionDescription: result.actionDescription,
                    statusBarRaw: result.statusBarRaw,
                    hasThinking: Boolean(result.thinkingSummary),
                    hasAction: Boolean(result.actionDescription),
                    showThinking: false,
                    metadata: { ...(message.metadata || {}), thinkingSummary: result.thinkingSummary, actionDescription: result.actionDescription, statusBarRaw: result.statusBarRaw },
                  }
                  : message);
              }
              return [...prev, {
                id: replyMsgId,
                sender: 'other',
                type: 'ai-reply',
                text: result.text,
                time: '刚刚',
                createdAt: new Date().toISOString(),
                aiModel: result.model,
                status: 'delivered',
                thinkingSummary: result.thinkingSummary,
                actionDescription: result.actionDescription,
                statusBarRaw: result.statusBarRaw,
                hasThinking: Boolean(result.thinkingSummary),
                hasAction: Boolean(result.actionDescription),
                showThinking: false,
                metadata: { thinkingSummary: result.thinkingSummary, actionDescription: result.actionDescription, statusBarRaw: result.statusBarRaw },
              }];
            });

            const latestSettings = readAppSettings();
            if (latestSettings.voiceEnabled && latestSettings.autoSpeakAiReplies) {
              try { await generateSpeech(result.text, latestSettings); } catch {}
            }
          } catch (error) {
      setMessages((prev) => prev.map((m) =>
        m.id === replyMsgId
          ? { ...m, status: 'failed', error: error instanceof Error ? error.message : 'AI 请求失败' }
          : m
      ));

            setMessages(prev => prev.filter(message => message.id !== replyMsgId));
            const message = error instanceof Error ? error.message : '图片理解失败';
            showToast(message.length > 72 ? message.slice(0, 72) + '…' : message);
          } finally {
            setIsTyping(false);
          }
          }
        }).catch(() => showToast('媒体保存失败，请重试'));
      };
      reader.readAsDataURL(file);
      return;
    }

    setMessages(prev => [...prev, {
      id: Date.now(),
      sender: 'me',
      type: 'real-media',
      mediaType: type,
      fileName: file.name,
      time: '刚刚',
    }]);
    setSubSheetType(null);
    showToast(`${typeLabels[type]}已发送：${file.name}`);
  };

  // 保存当前聊天的完整设定快照；各项设定仍沿用原有的独立持久化键。
  const handleSaveChatSettings = () => {
    try {
      const settings: Record<string, string> = {};
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (!key || !key.startsWith('line:') || !key.includes(conversationStorageId) || key.startsWith('line:chat-settings-snapshot:')) continue;
        const value = window.localStorage.getItem(key);
        if (value !== null) settings[key] = value;
      }
      window.localStorage.setItem(`line:chat-settings-snapshot:${conversationStorageId}`, JSON.stringify({
        version: 1,
        conversationStorageId,
        savedAt: new Date().toISOString(),
        settings,
      }));
      showToast(`已保存当前聊天的全部设定（${Object.keys(settings).length} 项）`);
    } catch {
      showToast('保存失败：本地存储空间不足或不可用');
    }
  };

  // 保存消息原地编辑
  const handleSaveMessageEdit = (id: number | string) => {
    const nextText = editingMessageText.trim();
    if (!nextText) return;
    editLineMessage(conversationStorageId, id, nextText);
    setMessages((prev) =>
      prev.map((m) => (String(m.id) === String(id) ? { ...m, text: nextText, edited: true, editedAt: new Date().toISOString() } : m))
    );
    setEditingMessageId(null);
    setEditingMessageText('');
    showToast('消息已原地修改');
  };

  // 添加日程项
  const handleAddScheduleItem = () => {
    if (!newScheduleTitle.trim()) {
      showToast('请输入日程内容');
      return;
    }
    setScheduleList((prev) => [
      ...prev,
      { id: String(Date.now()), time: newScheduleTime, title: newScheduleTitle.trim(), kind: newScheduleKind, location: newScheduleLocation.trim(), theme: newScheduleTheme.trim(), conversationId: conversationStorageId },
    ]);
    setNewScheduleTitle('');
    setNewScheduleLocation('');
    setNewScheduleTheme('');
    setNewScheduleKind('message');
    setShowAddScheduleRow(false);
    showToast('已添加新日程');
  };

  // 重新生成 (Reroll)
  const handleDoReroll = async () => {
    const instruction = rerollPrompt.trim();
    if (!instruction) {
      showToast('告诉 AI 这一轮怎么改');
      return;
    }
    const targetIndex = rerollTargetId !== null
      ? messages.findIndex(m => String(m.id) === String(rerollTargetId))
      : [...messages].map((m, index) => ({ m, index })).reverse().find(item => item.m.sender === 'other' && item.m.type !== 'system-nudge')?.index;
    if (targetIndex === undefined || targetIndex < 0 || !importedCharacter) {
      showToast('还没有可以重新生成的角色消息');
      return;
    }
    const target = messages[targetIndex];
    const previousUserIndex = [...messages.slice(0, targetIndex)].map((message, index) => ({ message, index })).reverse().find(item => item.message.sender === 'me' && item.message.text?.trim())?.index ?? -1;
    const previousUser = previousUserIndex >= 0 ? messages[previousUserIndex].text || '' : inputText;
    setShowReroll(false);
    setRerollPrompt('');
    setRerollTargetId(null);
    setIsTyping(true);
    try {
      let streamed = '';
      const turnStatusPreset = resolveStatusBarPresetForTurn();
      const result = await generateCharacterReply({
        settings: conversationAiSettings(),
        character: importedCharacter,
        characterProfile,
        persona: activePersona,
        worldbooks: activeWorldbooks,
        memory: characterMemory,
        project: projectManifest,
        // Rebuild this turn from its user message; do not leave earlier split assistant bubbles before re-appending the same user turn.
        messages: messages.slice(0, previousUserIndex >= 0 ? previousUserIndex : targetIndex).map(message => ({ ...message, sender: message.sender || 'other' })),
        userMessage: previousUser || '继续当前对话',
        isGroup,
        authorNote: [lineConversationRules, '重新生成要求：' + instruction + '；这次只重新生成被选中的这一条消息，不要额外生成其他消息。'].filter(Boolean).join('\\n'),
        statusBarPreset: turnStatusPreset,
        stylePreset: activeCotPreset?.title || selectedPreset,
        cotTarget: isGroup ? 'group' : 'line',
        cotPreset: undefined,
        typingHabit: [
          typingHabitPreset === 'custom' ? '总体风格：' + typingHabitCustom : '总体风格：' + typingHabitPreset,
          '标点：' + typingPunctuation,
          'emoji/表情：' + typingEmoji,
          '消息分条：' + typingSplit,
          '换行：' + typingLineBreak,
          '句子长度：' + typingLength,
          '语气词：' + typingFillers,
          '断句：' + typingSentenceBreak,
        ].join('；'),
        temperature: Number(presetTemp) || 0.85,
        debugConversationId: conversationStorageId,
        onDelta: delta => {
          streamed += delta;
          setMessages(prev => prev.map(message =>
            String(message.id) === String(target.id)
              ? { ...message, text: streamed, status: 'sending', error: undefined, edited: true }
              : message
          ));
        },
      });
      const rerolledText = splitGeneratedLineMessages(String(result.text || streamed)).filter(Boolean)[0] || String(result.text || streamed || '').trim();
      statusBarKnownMessageIdsRef.current?.add(String(target.id));
      setMessages(prev => {
        const next = [...prev];
        const existingIndex = next.findIndex(m => m.id === target.id);
        const nextMessage = {
          ...target,
          text: rerolledText,
          status: 'delivered',
          editedAt: new Date().toISOString(),
          aiModel: result.model,
          thinkingSummary: result.thinkingSummary,
          actionDescription: result.actionDescription,
          statusBarRaw: result.statusBarRaw,
          hasThinking: Boolean(result.thinkingSummary),
          hasAction: Boolean(result.actionDescription),
          showThinking: false,
          metadata: {
            ...(target.metadata || {}),
            thinkingSummary: result.thinkingSummary,
            actionDescription: result.actionDescription,
            statusBarRaw: result.statusBarRaw,
          },
          error: undefined,
          edited: true,
        };
        if (existingIndex >= 0) next[existingIndex] = nextMessage;
        else next.splice(Math.min(targetIndex, next.length), 0, nextMessage);
        return next;
      });
      updateLineMessage(conversationStorageId, target.id, {
        text: rerolledText,
        status: 'delivered',
        metadata: {
          ...(target.metadata || {}),
          thinkingSummary: result.thinkingSummary,
          actionDescription: result.actionDescription,
          statusBarRaw: result.statusBarRaw,
        },
        error: undefined,
        edited: true,
        editedAt: new Date().toISOString(),
      });
      if (statusBarEnabled && !isGroup) await createStatusBarSnapshot(rerolledText, target.id, result.statusBarRaw, turnStatusPreset, true);
      showToast('这一条已经重新生成');
    } catch (error) {
      const message = error instanceof Error ? error.message : '重新生成失败';
      setMessages(prev => {
        const next = [...prev];
        const existingIndex = next.findIndex(m => m.id === target.id);
        const failed = { ...target, status: 'failed', error: message, text: target.text || '回复失败：' + message };
        if (existingIndex >= 0) next[existingIndex] = failed;
        else next.splice(Math.min(targetIndex, next.length), 0, failed);
        return next;
      });
      markLineMessageFailed(conversationStorageId, target.id, message);
      showToast(message.length > 60 ? message.slice(0, 60) + '…' : message);
    } finally {
      setIsTyping(false);
    }
  };

  // 酒馆式 RegEx → Replace With → HTML renderer.
  // Only the latest character message is used as the source for the avatar card.
  const activeStatusBarPreset = statusBarPresets.find(item => item.id === activeStatusBarPresetId)
    || statusBarPresets[0]
    || null;
  const currentStatusSnapshot = statusBarHistory[statusBarHistoryIndex] || statusBarHistory.at(-1) || null;
  const currentStatusSnapshotPreset = statusBarPresets.find(item => item.id === currentStatusSnapshot?.presetId)
    || activeStatusBarPreset;
  // Old snapshots were saved after <style> blocks had been stripped. Restore the
  // current exact preset's scoped visual CSS at render time without editing that preset.
  const currentStatusSnapshotHtml = currentStatusSnapshot
    ? restoreStatusBarPresentationStyles(currentStatusSnapshot.html, currentStatusSnapshotPreset?.html || '')
    : '';
  const statusTokens = {
    char: characterIdentity,
    user: activePersona?.name || '我',
    char_avatar: importedCharacter?.avatar || characterProfileAvatar || '',
    user_avatar: activePersona?.avatar || '',
  };
  const latestCharacterMessageText = [...messages]
    .reverse()
    .find(message => message.sender === 'other' && !message.isRecalled)?.text || '';
  const renderStatusHtml = () => currentStatusSnapshot?.html || renderStatusBarHtml(
    activeStatusBarPreset,
    latestCharacterMessageText,
    {
      location: statusData.location,
      time: statusData.time,
      activity: statusData.activity,
      mood: statusData.mood,
      favor: statusData.favor,
    },
  );

  // 背景
  const wallpaperClass =
    currentWallpaper === 'warm-light'
      ? 'bg-gradient-to-b from-[#fbf8f5] to-[#f4eee6]'
      : currentWallpaper === 'tokyo-rain'
      ? 'bg-gradient-to-b from-[#f2f4f8] to-[#e7ebf2]'
      : currentWallpaper === 'rose-mist'
      ? 'bg-gradient-to-b from-[#faf4f6] to-[#f5e9ed]'
      : 'bg-white';

  return (
    <div className={`relative w-full h-full flex flex-col ${wallpaperClass} text-[#343538] select-none overflow-hidden transition-colors duration-300 custom-chat-view`}>
      
      {/* 实时注入自定义 CSS (Live Injected Custom CSS) */}
      <style dangerouslySetInnerHTML={{ __html: customCss }} />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={subSheetType === 'image' ? 'image/*' : subSheetType === 'video' ? 'video/*' : '*/*'}
        multiple={subSheetType === 'image'}
        className="hidden"
        onChange={(e) => {
          if (subSheetType && e.target.files?.length) {
            const files = Array.from(e.target.files);
            if (subSheetType === 'image' && files.length > 1) {
              files.forEach(file => handleRealUpload('image', file));
            } else {
              handleRealUpload(subSheetType, files[0]);
            }
          }
          e.currentTarget.value = '';
        }}
      />

      {/* 1. CHAT HEADER */}
      <div className="h-[60px] border-b border-[#ededee] flex items-center justify-between px-3 bg-white/97 z-10 shrink-0 backdrop-blur-md">
        {isMultiSelectMode ? (
          <div className="flex items-center justify-between w-full">
            <span className="font-semibold text-sm text-[#27272a]">
              已选择 {selectedMsgIds.length} 条消息
            </span>
            <button
              onClick={() => {
                setIsMultiSelectMode(false);
                setSelectedMsgIds([]);
              }}
              className="text-xs text-[#ae7e89] font-medium px-2 py-1 cursor-pointer"
            >
              完成
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <button
                onClick={() => onBack(inputText)}
                className="w-8 h-9 text-[#333] hover:opacity-70 text-2xl flex items-center justify-center font-light cursor-pointer"
                title="返回并保存草稿"
              >
                ‹
              </button>

              {/* 顶部大头像：只进入角色完整个人主页。状态栏/拍一拍只属于消息气泡里的小头像。 */}
              <div className="flex items-center gap-2.5 min-w-0 group">
                <button
                  onClick={() => setShowCharacterProfile(true)}
                  className="relative cursor-pointer"
                  title="打开角色个人主页"
                >
                <div className="relative">
                  <div className={`w-[38px] h-[38px] rounded-full bg-[#f1f1f2] border border-[#ededee] flex items-center justify-center overflow-hidden shrink-0 group-hover:scale-105 group-hover:ring-2 group-hover:ring-[#d4aab5]/50 transition-all ${
                    nudgeAvatar ? 'scale-110 ring-2 ring-[#d4aab5]' : ''
                  }`}>
                    {importedCharacter?.avatar ? (
                      <img src={importedCharacter.avatar} alt={characterProfile.nickname} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <svg className="w-6 h-6 text-[#999]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 21c.8-4 3.5-6 8-6s7.2 2 8 6" />
                    </svg>
                    )}
                  </div>
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#b9d2c1] border border-white" />
                  </div>
                </button>

                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCharacterProfile(true);
                  }}
                  className="min-w-0"
                  title="点击查看角色个人主页"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-[14px] text-[#27272a] leading-tight truncate group-hover:text-[#ae7e89] transition-colors">
                      {characterProfile.nickname}
                    </span>
                    {onSwitchPersona && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); setShowPersonaPicker(true); }} className="shrink-0 px-1.5 py-0.5 rounded-full border border-[#ece9e9] bg-[#fafafa] text-[8px] text-[#8d777d]" title="切换聊天中的我">我 · 切换</button>
                    )}
                    {localPinned && (
                      <span title="已置顶" className="shrink-0 flex items-center">
                        <Pin className="w-3 h-3 text-[#ae7e89] fill-[#faf1f3]" />
                      </span>
                    )}
                    {localMuted && (
                      <span title="消息免打扰" className="shrink-0 flex items-center">
                        <BellOff className="w-3 h-3 text-[#b2b2b4]" />
                      </span>
                    )}
                    {isGroup && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowGroupMembers(true);
                        }}
                        className="text-[9px] text-[#777] bg-[#f6f6f7] border border-[#ededee] px-1.5 py-0.5 rounded-full shrink-0"
                      >
                        {groupMembers.length}人
                      </button>
                    )}

                  </div>
                  <div className="text-[10px] text-[#aaa] mt-0.5 flex items-center gap-1">
                    <span className={contactOnline ? 'text-[#78927e]' : 'text-[#aaa]'}>
                      {contactOnline
                        ? tx('在线 · 点击查看主页', 'オンライン · プロフィール')
                        : tx('离线 · 点击查看主页', 'オフライン · プロフィール')}
                    </span>
                  </div>

                  {friendDeleted && (
                    <div className="text-[9px] text-[#aaa] mt-0.5">对方不是你的好友</div>
                  )}
                </div>
              </div>
            </div>

            {/* Actions: Search, Audio Call, Video Call, Settings */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => showToast(tx('语音通话 · 未开发', '音声通話 · 未開発'))}
                className="w-8 h-8 rounded-full hover:bg-neutral-50 flex items-center justify-center text-[#303033]"
                title={tx('语音通话 · 未开发', '音声通話 · 未開発')}
              >
                <Phone className="w-4 h-4 stroke-[1.7]" />
              </button>

              <button
                onClick={() => setShowTogetherMusic(true)}
                className="w-8 h-8 rounded-full hover:bg-neutral-50 flex items-center justify-center text-[#8b7560]"
                title={tx('一起听歌', '一緒に音楽を聴く')}
              >
                <Music2 className="w-4 h-4 stroke-[1.7]" />
              </button>

              <button
                onClick={() => showToast(tx('视频通话 · 未开发', 'ビデオ通話 · 未開発'))}
                className="w-8 h-8 rounded-full hover:bg-neutral-50 flex items-center justify-center text-[#303033]"
                title={tx('视频通话 · 未开发', 'ビデオ通話 · 未開発')}
              >
                <Video className="w-4 h-4 stroke-[1.7]" />
              </button>

              <button
                onClick={() => setShowPersonaManager(true)}
                className="w-8 h-8 rounded-full hover:bg-neutral-50 flex items-center justify-center text-[#666]"
                title={`当前我的人设：${activePersona.name}`}
              >
                <UserCheck className="w-4 h-4 text-[#ae7e89]" />
              </button>

              <button
                onClick={() => setShowSettings(true)}
                className="w-8 h-8 rounded-full hover:bg-neutral-50 flex items-center justify-center text-[#303033]"
                title={tx('聊天设置与酒馆设定', 'チャット設定')}
              >
                <Settings className="w-4 h-4 stroke-[1.7]" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Group Notice Banner (群公告折叠栏) */}
      {isGroup && showGroupNotice && groupNoticeText.trim() && (
        <div className="bg-[#faf4f6] border-b border-[#f0dee3] px-3.5 py-1.5 flex items-center justify-between text-[11px] text-[#8c5f6b] animate-in slide-in-from-top">
          <div className="flex items-center gap-1.5 truncate">
            <span>📢</span>
            <span className="font-semibold">{tx('群公告：', 'グループのお知らせ：')}</span>
            <span className="truncate">{groupNoticeText}</span>
          </div>
          <button
            onClick={() => setShowGroupNotice(false)}
            className="text-[#aaa] hover:text-[#555] ml-2 text-xs cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* In-chat Search Input Bar */}
      {showInChatSearch && (
        <div className="px-3 py-1.5 bg-[#f8f8fa] border-b border-[#ededee] animate-in slide-in-from-top duration-200">
          <div className="h-8 flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-[#aaa] shrink-0" />
          <input
            type="text"
            value={inChatSearchQuery}
            onChange={(e) => setInChatSearchQuery(e.target.value)}
            placeholder="搜索当前聊天记录关键字..."
            className="w-full text-xs bg-transparent outline-none text-[#333]"
          />
          {inChatSearchQuery && (
            <button onClick={() => setInChatSearchQuery('')} className="text-xs text-[#aaa]">
              ×
            </button>
          )}
          <button
            onClick={() => setShowInChatSearch(false)}
            className="text-[11px] text-[#ae7e89] font-medium shrink-0 ml-1"
          >
            取消
          </button>
          </div>
          {inChatSearchQuery.trim() && (
            <div className="max-h-40 overflow-y-auto border-t border-[#ededee] mt-1 pt-1">
              {lineRuntimeSearchResults.length === 0 ? (
                <div className="py-2 text-[10px] text-[#aaa] text-center">没有找到相关聊天记录</div>
              ) : (
                lineRuntimeSearchResults.slice(-8).reverse().map((result) => (
                  <button
                    key={result.id}
                    onClick={() => jumpToLineMessage(result.id)}
                    className="w-full text-left px-2 py-1.5 rounded-md hover:bg-white transition-colors"
                  >
                    <div className="text-[9px] text-[#aaa] mb-0.5">
                      {result.sender === 'me' ? '我' : contactName} · {result.createdAt ? new Date(result.createdAt).toLocaleString() : ''}
                    </div>
                    <div className="text-[10.5px] text-[#444] truncate">{result.text || '[媒体消息]'}</div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* 2. MESSAGES STREAM */}
      <div className="min-h-0 flex-1 relative">
      <div
        ref={messagesViewportRef}
        onScroll={(event) => {
          const viewport = event.currentTarget;
          const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
          setShowScrollToLatest((previous) => {
            const next = distanceFromBottom > 220;
            return previous === next ? previous : next;
          });
          if (viewport.scrollTop <= 24 && loadedMessageCount < messages.length) {
            loadOlderMessages();
          }
        }}
        className="h-full w-full overflow-y-auto overscroll-y-auto touch-pan-y px-3.5 py-4 space-y-1.5 relative"
        style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'thin', scrollbarColor: '#d8cbd0 transparent' }}
      >
        {showUnreadJump && unreadAnchorId !== null && (
          <button
            onClick={() => {
              jumpToLineMessage(unreadAnchorId);
              setShowUnreadJump(false);
              setMessages((prev) => prev.map((message) => (
                message.sender === 'me' ? message : { ...message, isRead: true }
              )));
              markLineConversationRead(conversationStorageId, unreadAnchorId);
            }}
            className="sticky top-1 z-30 mx-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/95 border border-[#eadde1] text-[10px] text-[#8c6670] shadow-sm backdrop-blur"
          >
            <span className="font-semibold">{groupUnreadCount || 1} 条新消息</span>
            <span className="text-[#aaa]">↓</span>
          </button>
        )}
        {loadedMessageCount < messages.length && (
          <button
            onClick={loadOlderMessages}
            className="mx-auto block text-[9.5px] text-[#aaa] hover:text-[#ae7e89] py-1.5 px-3 rounded-full hover:bg-[#faf1f3] transition-colors"
          >
            更早的聊天已折叠 · 点击查看上一组 100 条
          </button>
        )}
        {visibleMessages.map((msg, messageIndex) => {
          // Deleted messages must never leave an empty visual row behind.
          if (!msg || msg.deletedAt || msg.isDeleted) return null;
          const previousMessage = visibleMessages[messageIndex - 1];
          const nextMessage = visibleMessages[messageIndex + 1];
          const sameAsPrevious = Boolean(previousMessage && previousMessage.sender === msg.sender && previousMessage.type !== 'system-nudge' && msg.type !== 'system-nudge');
          const sameAsNext = Boolean(nextMessage && nextMessage.sender === msg.sender && nextMessage.type !== 'system-nudge' && msg.type !== 'system-nudge');
          const currentDateRaw = msg.createdAt || msg.timestamp;
          const currentDate = currentDateRaw ? new Date(currentDateRaw) : null;
          const previousDateRaw = previousMessage?.createdAt || previousMessage?.timestamp;
          const previousDate = previousDateRaw ? new Date(previousDateRaw) : null;
          const currentDay = currentDate && !Number.isNaN(currentDate.getTime())
            ? getLineMessageDayKey(currentDate, chatTimezone)
            : '';
          const previousDay = previousDate && !Number.isNaN(previousDate.getTime())
            ? getLineMessageDayKey(previousDate, chatTimezone)
            : '';
          const currentDateIsValid = Boolean(currentDate && !Number.isNaN(currentDate.getTime()));
          const previousDateIsValid = Boolean(previousDate && !Number.isNaN(previousDate.getTime()));
          const showDaySeparator = Boolean(currentDateIsValid
            && (messageIndex === 0 || !previousDateIsValid || currentDay !== previousDay));
          const showPeriodSeparator = Boolean(currentDateIsValid && previousDateIsValid
            && currentDay === previousDay
            && getLineMessageDayPeriod(currentDate as Date, chatTimezone) !== getLineMessageDayPeriod(previousDate as Date, chatTimezone));
          const dayLabel = currentDateIsValid
            ? formatLineMessageDayLabel(currentDate as Date, chatTimezone, lineTimeDisplayLocale)
            : '';

          if (msg.type === 'html-interlude') {
            const safeHtml = sanitizeHtmlFragment(String(msg.htmlContent || ''));
            if (!safeHtml) return null;
            return (
              <div key={msg.id} data-line-message-id={msg.id} className="flex justify-center my-3 px-3">
                <div
                  className="w-full max-w-[88%] text-[11px] leading-relaxed text-[#333] [&_img]:max-w-full [&_img]:rounded-xl [&_a]:text-[#9b6875]"
                  dangerouslySetInnerHTML={{ __html: safeHtml }}
                />
              </div>
            );
          }

          if (msg.type === 'music-together') {
            const session = msg.musicSession as TogetherMusicSession | undefined;
            if (!session) return null;
            return (
              <div key={msg.id} data-line-message-id={msg.id} className={'flex ' + (msg.sender === 'me' ? 'justify-end' : 'justify-start') + ' mb-2'}>
                <div className="max-w-[82%] rounded-[15px] border border-[#e8ddd3] bg-[#fbf7f1] p-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-full bg-[#292724] text-white grid place-items-center"><Music2 className="w-4 h-4" /></div>
                    <div className="min-w-0"><div className="text-[8px] font-mono tracking-[1.2px] text-[#9a8c7f]">TOGETHER LISTENING</div><div className="text-[11px] font-semibold text-[#403a34] truncate">{session.title}</div><div className="text-[9px] text-[#8a8179] truncate">{session.artist}</div></div>
                  </div>
                  <audio controls preload="metadata" src={session.url} className="w-full h-8 mt-2" />
                  <div className="mt-2 text-[8px] text-[#a0958d]">已邀请一起听歌 · 这个聊天的听歌会话独立保存</div>
                </div>
              </div>
            );
          }

          if (msg.type === 'system-nudge') {
            return (
              <div key={msg.id} data-line-message-id={msg.id} className="flex justify-center my-1.5 animate-in fade-in">
                <span className="text-[10px] text-[#999b9f] bg-[#f5f5f6] border border-[#ececee] px-3 py-1 rounded-full shadow-2xs">
                  {msg.text}
                </span>
              </div>
            );
          }

          const isMe = msg.sender === 'me';
          const thinkingContent = msg.thinkingSummary || msg.metadata?.thinkingSummary || msg.thinking || msg.metadata?.thinking || '';
          const hasThinking = Boolean(String(thinkingContent).trim()) && showChainOfThoughtInChat;
          const cotLabel = getActivePromptPreset(isGroup ? 'group' : 'single')?.name || '预设流程';
          const cotStyle = resolvedCotPreset.displayStyle || 'minimal';
          const cotStyleClass = cotStyle === 'soft'
            ? 'bg-[#faf8f9] border-[#eee5e8] text-[#8c6872]'
            : cotStyle === 'mono'
              ? 'bg-[#f7f7f7] border-[#e5e5e5] text-[#666] font-mono'
              : cotStyle === 'outline'
                ? 'bg-white border-[#e4e4e6] text-[#777]'
                : 'bg-transparent border-transparent text-[#888]';
          const hasVariants = msg.variants && msg.variants.length > 1;

          return (
            <div key={msg.id} className="contents">
              {showDaySeparator && (
                <div className="flex justify-center py-1.5">
                  <span
                    title={currentDate ? formatLineMessageExactDateTime(msg, chatTimezone, lineTimeDisplayLocale) : undefined}
                    className="px-3 py-1 rounded-full bg-[#f5f5f6] text-[9px] text-[#a2a2a6]"
                  >
                    {dayLabel}
                  </span>
                </div>
              )}
              {showPeriodSeparator && (
                <div className="flex justify-center py-1.5">
                  <span
                    title={formatLineMessageExactDateTime(msg, chatTimezone, lineTimeDisplayLocale)}
                    className="text-[9px] leading-none text-[#999b9f]"
                  >
                    {formatLineMessageClock(msg, chatTimezone, lineTimeDisplayLocale)}
                  </span>
                </div>
              )}
              {unreadAnchorId !== null && String(msg.id) === String(unreadAnchorId) && showUnreadJump && (
                <div className="flex items-center gap-2 py-2">
                  <div className="h-px flex-1 bg-[#eadde1]" />
                  <span className="text-[9px] font-medium text-[#ae7e89]">NEW MESSAGES</span>
                  <div className="h-px flex-1 bg-[#eadde1]" />
                </div>
              )}
              <div
              data-line-message-id={msg.id}
              onPointerDown={(event) => handleMessagePointerDown(event, msg)}
              onPointerMove={(event) => handleMessagePointerMove(event, msg)}
              onPointerUp={(event) => handleMessagePointerUp(event, msg)}
              onPointerCancel={cancelMessageSwipe}
              style={{ touchAction: 'pan-y' }}
              className={`relative flex items-end gap-2 group ${sameAsNext ? 'mb-0.5' : 'mb-2'}`}
            >
              {swipingMessageId === msg.id && Math.abs(swipeOffset) > 8 && (
                <div
                  className={`absolute ${swipeOffset > 0 ? 'left-0' : 'right-0'} top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full border transition-all duration-100 ${
                    Math.abs(swipeOffset) >= 64
                      ? 'w-9 h-9 bg-[#f8eef1] border-[#e5cbd2] text-[#ae7e89] scale-100 shadow-sm'
                      : 'w-7 h-7 bg-[#fafafa] border-[#ededee] text-[#b5b5b8] scale-90'
                  }`}
                  aria-label={swipeOffset > 0 ? '引用消息' : (msg.sender === 'me' ? '编辑消息' : '消息菜单')}
                >
                  {swipeOffset > 0 ? <CornerUpLeft className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                </div>
              )}
              {(() => {
                const replyStatus = formatReplyReasonStatus(msg);
                if (!replyStatus) return null;
                return (
                  <div className={`flex ${isMe ? 'justify-end pr-1' : 'justify-start pl-1'} mb-1.5`}>
                    <div className={`inline-flex max-w-[86%] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] leading-none shadow-[0_1px_2px_rgba(0,0,0,0.025)] ${replyStatus.tone === 'muted' ? 'border-[#e8e8ea] bg-[#f8f8f9] text-[#999]' : 'border-[#eadde1] bg-[#fbf4f6] text-[#9b737c]'}`}>
                      <span className="text-[9px] opacity-80">{replyStatus.icon}</span>
                      <span className="truncate">{replyStatus.label}</span>
                    </div>
                  </div>
                );
              })()}
              <div
                className={`w-full flex items-end gap-2 transition-transform duration-75 ease-out ${isMe ? 'justify-end' : 'justify-start'}`}
                style={{ transform: swipingMessageId === msg.id ? `translateX(${swipeOffset}px)` : 'translateX(0)' }}
              >
              {/* Multi-select checkbox */}
              {isMultiSelectMode && (
                <div
                  onClick={() => {
                    setSelectedMsgIds((prev) =>
                      prev.includes(msg.id) ? prev.filter((id) => id !== msg.id) : [...prev, msg.id]
                    );
                  }}
                  className="cursor-pointer self-center px-1 text-[#ae7e89] shrink-0"
                >
                  {selectedMsgIds.includes(msg.id) ? (
                    <CheckSquare className="w-4 h-4 fill-[#faf1f3] text-[#ae7e89]" />
                  ) : (
                    <Square className="w-4 h-4 text-[#ccc]" />
                  )}
                </div>
              )}

              {/* Other Avatar */}
              {!isMe && (
                sameAsPrevious ? (
                  <div className="w-[31px] shrink-0" aria-hidden="true" />
                ) : (
                <div
                  onClick={() => {
                    if (isGroup) {
                      handleComposerChange(`${inputText}@${msg.senderName || characterProfile.nickname} `);
                    } else {
                      handleMessageAvatarClick();
                    }
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    handleMessageAvatarDoubleClick(msg.senderName || characterProfile.nickname);
                  }}
                  className={`w-[31px] h-[31px] rounded-full bg-[#f2f2f3] flex items-center justify-center overflow-hidden shrink-0 self-end mb-0.5 cursor-pointer hover:opacity-80 active:scale-95 transition-all ${
                    nudgeAvatar ? 'scale-110 ring-2 ring-[#d4aab5]' : ''
                  }`}
                  title={isGroup ? `单击@${msg.senderName || characterProfile.nickname}，双击拍一拍` : '单击打开状态卡，双击拍一拍'}
                >
                  {(isGroup ? importedCharacters.find(character => character.name === msg.senderName)?.avatar : importedCharacter?.avatar) ? (
                    <img src={(isGroup ? importedCharacters.find(character => character.name === msg.senderName)?.avatar : importedCharacter?.avatar) || ''} alt={msg.senderName || characterProfile.nickname} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <svg className="w-5 h-5 text-[#999]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 21c.8-4 3.5-6 8-6s7.2 2 8 6" />
                  </svg>
                  )}
                </div>
                )
              )}

              {/* Bubble content container */}
              <div
                className={`max-w-[78%] relative touch-pan-y select-none ${isMe ? 'items-end' : 'items-start'}`}
              >
                {/* Preset flow · keep the existing compact disclosure UI */}
                {!isMe && hasThinking && (
                  <div className={`mb-1.5 ${cotStyle === 'minimal' ? '' : 'rounded-[11px] border px-2.5 py-1.5'} ${cotStyleClass}`}>
                    <button
                      type="button"
                      onPointerDown={(event) => event.stopPropagation()}
                      onPointerUp={(event) => event.stopPropagation()}
                      onClick={() =>
                        setMessages((prev) =>
                          prev.map((m) =>
                            m.id === msg.id ? { ...m, showThinking: !m.showThinking } : m
                          )
                        )
                      }
                      className="flex items-center gap-1.5 text-[10px] leading-none cursor-pointer hover:opacity-70 transition-opacity"
                    >
                      <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full ${cotStyle === 'minimal' ? 'bg-[#f3f1f2]' : 'bg-white'} text-[8px] font-semibold`}>P</span>
                      <span className="font-medium">{cotLabel}</span>
                      <span className="text-[9px] opacity-60">{msg.showThinking ? '⌃' : '›'}</span>
                    </button>

                    {msg.showThinking && (
                      <div className="mt-2 pt-2 border-t border-current/10 text-[10px] leading-[1.65] whitespace-pre-wrap break-words animate-in fade-in">
                        {String(thinkingContent)}
                      </div>
                    )}
                  </div>
                )}

                {lineActionDescriptionsEnabled && msg.actionDescription && !msg.isRecalled && (
                  <div className="w-full flex items-center justify-center my-2.5 animate-in fade-in">
                    <div className="relative flex w-full min-w-0 items-center justify-center gap-2 text-center">
                      <span className="h-px w-4 shrink-0 bg-[#eee8eb]" />
                      <span className="min-w-0 max-w-[calc(100%-3rem)] overflow-hidden text-ellipsis whitespace-nowrap text-[10.5px] leading-[1.6] italic tracking-[0.01em] text-[#9b9599]">
                        {msg.actionDescription}
                      </span>
                      <span className="h-px w-4 shrink-0 bg-[#eee8eb]" />
                    </div>
                  </div>
                )}

                {!msg.isRecalled && (currentDateIsValid || msg.time) && (
                  <div
                    title={formatLineMessageExactDateTime(msg, chatTimezone, lineTimeDisplayLocale)}
                    aria-label={formatLineMessageExactDateTime(msg, chatTimezone, lineTimeDisplayLocale)}
                    className={`mb-1 px-1 text-[9px] leading-none text-[#a6a6aa] ${isMe ? 'text-right' : 'text-left'}`}
                  >
                    {formatLineMessageClock(msg, chatTimezone, lineTimeDisplayLocale)}
                  </div>
                )}

                {/* 1.5 引用回复：让聊天真正保留上下文 */}
                {msg.quote && !msg.isRecalled && (
                  <div
                    className={`w-full max-w-[260px] mb-1.5 rounded-[12px] border overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.03)] ${
                      isMe
                        ? 'bg-[#f8eef2] border-[#e5cfd6] ml-auto'
                        : 'bg-[#f7f7f8] border-[#e2e2e4]'
                    }`}
                  >
                    <div className={`px-2.5 py-1 flex items-center gap-1.5 border-b ${
                      isMe
                        ? 'border-[#ead9de] text-[#9d6877]'
                        : 'border-[#e7e7e9] text-[#777]'
                    }`}>
                      <CornerUpLeft className="w-3 h-3 shrink-0" />
                      <span className="text-[9px] font-semibold">引用消息</span>
                      <span className="text-[8.5px] opacity-70 truncate">
                        · {msg.quote.sender || '消息'}
                      </span>
                    </div>
                    <div className={`px-2.5 py-1.5 text-[10px] leading-[1.45] truncate ${
                      isMe ? 'text-[#765963]' : 'text-[#666]'
                    }`}>
                      {msg.quote.text || '多媒体消息'}
                    </div>
                  </div>
                )}

                {/* 2. 主消息体 */}
                {msg.type === 'real-media' && (msg.mediaRef || mediaCache[msg.mediaRef]) ? (
                  <button
                    onClick={() => setLightboxImg(mediaCache[msg.mediaRef] || msg.mediaRef)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenuMsg(msg);
                    }}
                    className="block max-w-[230px] overflow-hidden rounded-[16px] border border-[#ededee] bg-[#f5f5f6] shadow-sm cursor-pointer"
                  >
                    <img
                      src={mediaCache[msg.mediaRef] || msg.mediaRef}
                      alt={msg.fileName || '图片'}
                      className="max-h-[300px] w-full object-cover"
                      loading="lazy"
                    />
                    {msg.fileName && (
                      <span className="block px-2 py-1.5 text-[9px] text-[#888] text-left truncate bg-white">
                        {msg.fileName}
                      </span>
                    )}
                  </button>
                ) : msg.isRecalled ? (
                  /* 我撤回状态展示 (User Recall State) */
                  <div className="py-1 px-3 rounded-full bg-[#f8f8fa] text-[10px] text-[#aaa] border border-[#f0f0f2]">
                    你撤回了一条消息{' '}
                    {msg.recalledOriginalText && (
                      <button
                        onClick={() => {
                          setInputText(msg.recalledOriginalText);
                          setMessages((prev) => prev.filter((m) => m.id !== msg.id));
                        }}
                        className="text-[#ae7e89] hover:underline ml-1 cursor-pointer font-medium"
                      >
                        重新编辑
                      </button>
                    )}
                  </div>
                ) : msg.isRecalledByOther ? (
                  /* 角色撤回状态展示 (Character Recall State) */
                  <div className="py-1.5 px-3.5 rounded-full bg-[#faf4f6] text-[10.5px] text-[#ae7e89] border border-[#f2e6e9] flex items-center gap-1.5 shadow-2xs">
                    <span>{characterProfile.nickname} 撤回了一条消息</span>
                    {msg.recalledByOtherReason && (
                      <span className="text-[9px] text-[#888] italic">
                        {msg.recalledByOtherReason}
                      </span>
                    )}
                  </div>
                ) : msg.type === 'offline-invite' ? (
                  /* 线下邀约卡片 (Offline Meetup Invitation Card) */
                  <div
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenuMsg(msg);
                    }}
                    className={`w-[280px] rounded-[16px] overflow-hidden border shadow-xs select-text text-xs custom-invite-card ${
                      offlineInviteTheme === 'midnight'
                        ? 'bg-[#1e1f24] text-white border-[#333742]'
                        : offlineInviteTheme === 'parchment'
                        ? 'bg-[#fcf7ee] text-[#4a3b2c] border-[#e8dbc3]'
                        : offlineInviteTheme === 'rose'
                        ? 'bg-gradient-to-b from-[#fff5f7] to-[#fae8ec] text-[#4a2e35] border-[#f2d0d9]'
                        : 'bg-gradient-to-b from-[#fdfbfb] to-[#faf3f5] text-[#333] border-[#eedde1]'
                    }`}
                  >
                    <div className={`px-3.5 py-2.5 border-b flex items-center justify-between ${
                      offlineInviteTheme === 'midnight'
                        ? 'bg-[#282a32] border-[#3a3e4b]'
                        : offlineInviteTheme === 'parchment'
                        ? 'bg-[#f5ebd6] border-[#e2d2b5]'
                        : offlineInviteTheme === 'rose'
                        ? 'bg-[#f8dde3] border-[#f0c5cf]'
                        : 'bg-gradient-to-r from-[#faf0f2] to-[#f5e6ea] border-[#f0dee3]'
                    }`}>
                      <div className="flex items-center gap-1.5 font-semibold text-[11.5px] text-[#8c5f6b]">
                        <span>💌</span>
                        <span>线下剧情邀约 · {msg.inviteTheme || '相遇之约'}</span>
                      </div>
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/80 text-[#ae7e89] border border-[#f0dee3]">
                        {msg.inviteFrom === 'other' ? `${characterProfile.nickname}的发函` : '我的邀约'}
                      </span>
                    </div>

                    <div className="p-3.5 space-y-2.5">
                      <div className="space-y-1.5 text-[11px] bg-white/70 p-2.5 rounded-[12px] border border-[#f2e6e9] text-[#444]">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[#ae7e89]">📍</span>
                          <span className="font-medium text-[#222]">约定地点：</span>
                          <span className="truncate">{msg.inviteLocation}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[#ae7e89]">🕒</span>
                          <span className="font-medium text-[#222]">约定时间：</span>
                          <span>{msg.inviteTime}</span>
                        </div>
                      </div>

                      <div className="text-[11.5px] leading-relaxed italic bg-white/50 p-2 rounded-[10px] border-l-2 border-[#d4aab5] text-[#555]">
                        “{msg.inviteLetter}”
                      </div>

                      {/* 交互状态 */}
                      <div className="pt-1">
                        {msg.inviteStatus === 'accepted' ? (
                          <div className="w-full py-2 bg-[#edf7f0] border border-[#cbe8d4] text-[#2b7a4b] rounded-[10px] text-center font-medium text-[11px] flex items-center justify-center gap-1.5">
                            <span>✓ 已欣然赴约，静候碰面</span>
                          </div>
                        ) : msg.inviteStatus === 'declined' ? (
                          <div className="w-full py-2 bg-[#f8f8fa] border border-[#ececee] text-[#888] rounded-[10px] text-center text-[11px]">
                            <span>已暂缓本次邀约</span>
                          </div>
                        ) : msg.inviteFrom === 'other' ? (
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <button
                              onClick={() => handleAcceptInvite(msg.id)}
                              className="py-2 bg-[#ae7e89] hover:bg-[#9d6d78] text-white rounded-[10px] font-semibold cursor-pointer shadow-2xs transition-colors flex items-center justify-center gap-1"
                            >
                              <span>✨ 欣然赴约</span>
                            </button>
                            <button
                              onClick={() => handleDeclineInvite(msg.id)}
                              className="py-2 bg-white hover:bg-neutral-50 text-[#777] border border-[#e6e6e8] rounded-[10px] cursor-pointer"
                            >
                              改天再约
                            </button>
                          </div>
                        ) : (
                          <div className="w-full py-1.5 bg-white/70 text-[#ae7e89] border border-[#f0dee3] rounded-[10px] text-center text-[10.5px]">
                            等待对方确认赴约中…
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : editingMessageId === String(msg.id) ? (
                  /* 原地消息编辑态 (In-place Edit) */
                  <div className="p-2.5 bg-white border border-[#d4aab5] rounded-[14px] shadow-sm space-y-2">
                    <textarea
                      value={editingMessageText}
                      onChange={(e) => setEditingMessageText(e.target.value)}
                      className="w-full text-xs p-1 outline-none resize-none leading-relaxed"
                      rows={3}
                    />
                    <div className="flex justify-end gap-2 text-[10px]">
                      <button
                        onClick={() => setEditingMessageId(null)}
                        className="px-2 py-1 text-[#888] hover:bg-neutral-100 rounded"
                      >
                        取消
                      </button>
                      <button
                        onClick={() => handleSaveMessageEdit(msg.id)}
                        className="px-2.5 py-1 bg-[#d4aab5] text-white rounded font-medium"
                      >
                        保存修改
                      </button>
                    </div>
                  </div>
                ) : msg.type === 'ai-card' ? (
                  /* 白色 AI 描述卡片 */
                  <div 
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenuMsg(msg);
                    }}
                    className="w-[260px] border border-[#e9e9ea] rounded-[14px] overflow-hidden bg-white shadow-2xs"
                  >
                    <div className="h-[34px] px-3 flex items-center justify-between border-b border-[#f0f0f1] text-[11px] text-[#777] bg-[#fdfcfd]">
                      <div className="flex items-center gap-2">
                        <div className="w-[20px] h-[20px] rounded-[6px] bg-[#f6eff1] text-[#c98f9d] flex items-center justify-center text-[10px]">
                          ✦
                        </div>
                        <span className="font-medium text-[#444]">{msg.title}</span>
                      </div>
                      <span className="text-[9px] text-[#aaa]">角色收到</span>
                    </div>
                    <div className="p-3 bg-white">
                      <div className="font-semibold text-[11.5px] mb-1 text-[#27272a]">
                        {msg.descTitle || '内容描述'}
                      </div>
                      <div className="text-[11px] text-[#666] leading-relaxed whitespace-pre-wrap">
                        {msg.desc}
                      </div>
                    </div>
                  </div>
                ) : msg.type === 'real-media' ? (
                  /* 真实媒体 */
                  <div 
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenuMsg(msg);
                    }}
                    className="p-3 rounded-[14px] bg-[#fafafa] border border-[#e8e8e9] space-y-1 text-xs"
                  >
                    {(msg.mediaType === 'image' && (msg.mediaUrl || (msg.mediaRef && mediaCache[msg.mediaRef]))) ? (
                      <div className="space-y-1.5">
                        <img
                          src={msg.mediaUrl || mediaCache[msg.mediaRef]}
                          alt={msg.alt || msg.fileName}
                          className="max-w-full max-h-[260px] rounded-[11px] object-cover cursor-pointer"
                          onClick={() => setLightboxImg(msg.mediaUrl || mediaCache[msg.mediaRef])}
                        />
                        <div className="text-[10px] text-[#999]">{msg.fileName}</div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 text-[#444] font-medium">
                          <span>📁</span>
                          <span className="truncate">{msg.fileName}</span>
                        </div>
                        <div className="text-[10px] text-[#999]">真实附件已发送</div>
                      </>
                    )}
                  </div>
                ) : msg.type === 'voice' ? (
                  /* 语音 */
                  <div 
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenuMsg(msg);
                    }}
                    className="space-y-1.5"
                  >
                    <div
                      onClick={async () => {
                        const source = msg.audioUrl || (msg.mediaRef ? mediaCache[msg.mediaRef] : '');
                        if (!source) return;
                        try {
                          if (voiceAudioRef.current) {
                            voiceAudioRef.current.pause();
                            voiceAudioRef.current.currentTime = 0;
                          }
                          const audio = new Audio(source);
                          voiceAudioRef.current = audio;
                          setPlayingVoiceId(msg.id);
                          audio.onended = () => setPlayingVoiceId(null);
                          audio.onerror = () => setPlayingVoiceId(null);
                          await audio.play();
                        } catch {
                          setPlayingVoiceId(null);
                        }
                      }}
                      className={`min-w-[145px] py-2 px-3 rounded-[16px] flex items-center gap-2.5 cursor-pointer shadow-2xs transition-colors ${playingVoiceId === msg.id ? 'bg-[#eadde1]' : 'bg-[#f5f5f6] hover:bg-[#eeeff1]'}`}
                      title="播放真实语音"
                    >
                      <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-[#555]">
                        <Volume2 className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 flex items-center gap-0.5 h-4">
                        {[7, 12, 17, 9, 14, 6, 12, 16, 8, 13].map((h, i) => (
                          <i
                            key={i}
                            style={{ height: `${h}px` }}
                            className="w-[2px] bg-[#aaa] rounded-full inline-block"
                          />
                        ))}
                      </div>
                      <span className="text-[10px] text-[#999]">{msg.duration || '语音'}</span>
                    </div>

                    {msg.transcript && !String(msg.transcript).startsWith('（') && (
                      <div className="px-2.5 text-[9px] text-[#aaa] leading-relaxed">
                        语音转文字：{msg.transcript}
                      </div>
                    )}
                  </div>
                ) : (
                  /* 常规文本气泡 (支持引用、长按菜单、表情反应) */
                  <div className="relative">
                    <div className={`flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
                      {/* 引用回复预览 (Quoted message) */}
                      {msg.quote && (
                        <div className={`max-w-[240px] rounded-[12px] border px-2.5 py-1.5 text-[9.5px] mb-0.5 ${
                          isMe
                            ? 'bg-[#f8eef1] border-[#ead9de] text-[#8b6871]'
                            : 'bg-[#f7f7f8] border-[#e9e9eb] text-[#777]'
                        }`}>
                          <div className="font-medium mb-0.5 truncate">{msg.quote.sender || '消息'}</div>
                          <div className="truncate opacity-80">{msg.quote.text || '多媒体消息'}</div>
                        </div>
                      )}
                      {splitLineChatText(String(msg.text || '')).map((part, partIndex) => (
                        <div
                          key={`${msg.id}-bubble-${partIndex}`}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenuMsg(msg);
                          }}
                          className={`max-w-full rounded-[18px] px-3.5 py-2 text-[13px] leading-[1.5] whitespace-pre-wrap select-text shadow-[0_1px_2px_rgba(0,0,0,0.02)] ${
                            isMe
                              ? 'bubble-me bg-[#f7eef0] text-[#303034]'
                              : 'bubble-other bg-[#f5f5f6] text-[#303034]'
                          }`}
                        >
                          {part}
                        </div>
                      ))}
                    </div>

                    {/* 表情反应小药丸 (Reaction Badge) */}
                    {msg.reactions && msg.reactions.length > 0 && (
                      <div className="absolute -bottom-2 right-2 bg-white border border-[#eee] rounded-full px-1.5 py-0.5 shadow-2xs text-[10px] flex items-center gap-0.5 z-5">
                        {msg.reactions.map((r: string, idx: number) => (
                          <span key={idx}>{r}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {msg.status === 'failed' && (
                  <div
                    className="max-w-[280px] mt-1 rounded-[12px] border border-[#ead9de] bg-[#fff7f8] px-3 py-2 text-[10px] text-[#8b5d68]"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenuMsg(msg);
                    }}
                  >
                    <div className="font-semibold">回复失败</div>
                    <div className="mt-1 text-[9px] text-[#9a6b75]">失败原因</div>
                    <div className="mt-0.5 font-mono text-[9px] leading-relaxed break-words text-[#9a6b75]">
                      {msg.error || '未提供错误详情'}
                    </div>
                    <div className="mt-1.5 text-[8.5px] text-[#b58b94]">
                      可以检查 API 地址、API Key、模型、网络连接或服务商返回的错误。
                    </div>
                  </div>
                )}

                {isGroup && !isMe && msg.senderName && (
                  <div className="text-[9px] text-[#9a777f] px-1 mb-0.5 font-medium">{msg.senderName}</div>
                )}

                {/* 3. 酒馆分支重抽滑动选择器 & 更多操作 (长按/点击展开) */}
                <div className="flex items-center gap-2 text-[10px] text-[#bbb] px-1 pt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {hasVariants && (
                    <div className="flex items-center gap-1 bg-black/5 px-1.5 py-0.5 rounded-full text-[#666]">
                      <button
                        onClick={() => handleSwitchVariant(msg.id, 'prev')}
                        className="hover:text-black cursor-pointer px-0.5"
                      >
                        ‹
                      </button>
                      <span className="text-[9px]">
                        {msg.variantIndex + 1}/{msg.variants.length}
                      </span>
                      <button
                        onClick={() => handleSwitchVariant(msg.id, 'next')}
                        className="hover:text-black cursor-pointer px-0.5"
                      >
                        ›
                      </button>
                    </div>
                  )}

                  {/* 单条消息操作通过左右滑动触发：左滑编辑，右滑引用。这里不再常驻按钮，保持气泡紧凑。 */}
                </div>

              {/* Keep the existing read receipt, but don't repeat a timestamp beside every bubble. */}
              {!msg.isRecalled && isMe && (
                <div
                  title={formatLineMessageExactDateTime(msg, chatTimezone, lineTimeDisplayLocale)}
                  aria-label={formatLineMessageExactDateTime(msg, chatTimezone, lineTimeDisplayLocale)}
                  className="mt-0.5 flex min-h-[12px] items-center gap-1 px-1 text-[9px] leading-[1.2] text-[#a6a6aa] justify-end"
                >
                  {(() => {
                    const msgIndex = messages.findIndex((candidate) => String(candidate.id) === String(msg.id));
                    const hasRoleReply = msgIndex >= 0 && messages.slice(msgIndex + 1).some((candidate) =>
                      candidate.sender !== 'me' && candidate.type !== 'system-nudge'
                    );
                    const readLabel = hasRoleReply || msg.isRead ? '已读' : '未读';
                    return <span className={msg.isRead ? "text-[#ae7e89] font-medium" : "text-[#b8b8bb] font-medium"}>{readLabel}</span>;
                  })()}
                </div>
              )}

              </div>

              {/* Optional user avatar */}
              {isMe && showMyAvatar && (
                sameAsPrevious ? (
                  <div className="w-[31px] shrink-0" aria-hidden="true" />
                ) : (
                <div
                  className="w-[31px] h-[31px] rounded-full bg-[#f2f2f3] flex items-center justify-center overflow-hidden shrink-0 self-end mb-0.5 border border-white"
                  title={activePersona.name ? `我的人设：${activePersona.name}` : '我的头像'}
                >
                  {activePersona.avatar ? (
                    <img src={activePersona.avatar} alt={activePersona.name || '我的头像'} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="text-[10px] font-medium text-[#999]">{(activePersona.name || '我').slice(0, 1)}</span>
                  )}
                </div>
                )
              )}

              </div>
            </div>
              </div>
          );
        })}
        {/* AI 正在生成时，固定显示在消息流最底部，而不是顶栏 */}
        {isTyping && (
          <div className="flex items-end gap-2 px-0.5 py-1.5 animate-in fade-in">
            <div className="w-[31px] h-[31px] rounded-full bg-[#f2f2f3] flex items-center justify-center overflow-hidden shrink-0 border border-white">
              {importedCharacter?.avatar ? (
                <img src={importedCharacter.avatar} alt={characterProfile.nickname} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="text-[10px] text-[#999]">{characterProfile.nickname.slice(0, 1)}</span>
              )}
            </div>
            <div className="px-1 py-1 flex items-center gap-1">
              {[0, 1, 2].map((dot) => (
                <span key={dot} className="w-1.5 h-1.5 rounded-full bg-[#b8b8bb] animate-bounce" style={{ animationDelay: `${dot * 140}ms`, animationDuration: '900ms' }} />
              ))}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      {showScrollToLatest && (
        <button
          type="button"
          onClick={scrollToLatestMessage}
          className="absolute bottom-3 right-4 z-20 inline-flex items-center gap-1.5 rounded-full border border-[#e9dde1] bg-white/95 px-3 py-2 text-[10px] font-medium text-[#9b737c] shadow-sm backdrop-blur-sm hover:bg-[#fffafb] active:scale-95 transition"
          aria-label="滚动到最新消息"
          title="滚动到最新消息"
        >
          <span aria-hidden="true">↓</span>
          <span>最新消息</span>
        </button>
      )}
      </div>

      {/* 3. RECORDING BAR */}
      {isRecording && (
        <div className="h-[64px] bg-white border-t border-[#ededee] flex items-center justify-between px-5 text-xs animate-in slide-in-from-bottom z-30">
          <button onClick={() => stopRealRecording(true)} className="text-[#888] cursor-pointer">
            取消
          </button>
          <div className="font-semibold text-[#555]">
            00:{recordDuration < 10 ? `0${recordDuration}` : recordDuration}
          </div>
          <button
            onClick={() => stopRealRecording(false)}
            className="text-[#c98f9d] font-medium cursor-pointer"
          >
            松开 发送
          </button>
        </div>
      )}

      {/* 4. COMPOSER */}
      {!isRecording && (
        <div className="border-t border-[#ededee] bg-white z-20">
          {isGroup && mentionAnchorId !== null && (
            <button
              type="button"
              onClick={() => {
                jumpToLineMessage(mentionAnchorId);
                setDismissedMentionId(mentionAnchorId);
                setMentionAnchorId(null);
              }}
              className="w-full px-3 py-2 bg-[#fff9fb] border-b border-[#f0dee3] flex items-center justify-between text-left hover:bg-[#faf2f4] active:bg-[#f7eaee] transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-6 h-6 rounded-full bg-[#f7e9ed] text-[#ae7e89] grid place-items-center text-[11px] font-semibold">@</span>
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold text-[#8c5f6b]">{tx('有人提到了你', 'あなたへのメンション')}</div>
                  <div className="text-[9px] text-[#aaa] truncate">
                    {(() => {
                      const mention = messages.find((message) => String(message.id) === String(mentionAnchorId));
                      return mention?.senderName ? mention.senderName + ' · ' + (mention.text || '') : '点击查看消息';
                    })()}
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#c6a1aa] shrink-0" />
            </button>
          )}

          {/* 引用回复预览条 (Quote Reply Banner) */}
          {replyingToMsg && (
            <div className="px-3 py-1.5 bg-[#faf2f4] border-b border-[#f0dee3] flex items-center justify-between text-xs text-[#ae7e89] animate-in slide-in-from-bottom duration-150">
              <div className="flex items-center gap-1.5 truncate">
                <CornerUpLeft className="w-3.5 h-3.5 shrink-0" />
                <span className="font-medium text-[#8c5f6b]">
                  回复 {replyingToMsg.sender === 'me' ? '自己' : characterProfile.nickname}:
                </span>
                <span className="truncate text-[#666] text-[11px]">
                  {replyingToMsg.text || replyingToMsg.desc || '多媒体内容'}
                </span>
              </div>
              <button
                onClick={() => setReplyingToMsg(null)}
                className="text-[#aaa] hover:text-[#333] ml-2 text-sm font-bold cursor-pointer"
              >
                ×
              </button>
            </div>
          )}

          {isMultiSelectMode ? (
            <div className="h-[58px] bg-white flex items-center justify-around px-4 border-t border-[#ededee]">
              <button
                onClick={handleBatchFavorite}
                disabled={selectedMsgIds.length === 0}
                className="flex flex-col items-center gap-0.5 text-[10px] text-[#555] disabled:opacity-30 cursor-pointer"
              >
                <Bookmark className="w-4 h-4 text-[#ae7e89]" />
                <span>收藏 ({selectedMsgIds.length})</span>
              </button>

              <button
                onClick={handleBatchForward}
                disabled={selectedMsgIds.length === 0}
                className="flex flex-col items-center gap-0.5 text-[10px] text-[#555] disabled:opacity-30 cursor-pointer"
              >
                <Share2 className="w-4 h-4 text-[#555]" />
                <span>合并转发</span>
              </button>

              <button
                onClick={handleBatchDelete}
                disabled={selectedMsgIds.length === 0}
                className="flex flex-col items-center gap-0.5 text-[10px] text-rose-500 disabled:opacity-30 cursor-pointer"
              >
                <Trash2 className="w-4 h-4 text-rose-500" />
                <span>删除</span>
              </button>

              <button
                onClick={() => {
                  setIsMultiSelectMode(false);
                  setSelectedMsgIds([]);
                }}
                className="flex flex-col items-center gap-0.5 text-[10px] text-[#888] cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span>取消</span>
              </button>
            </div>
          ) : (
            <div className="relative min-h-[58px] flex items-center px-2 py-1.5 gap-1.5">
              {isGroup && mentionPickerOpen && filteredMentionMembers.length > 0 && (
                <div className="absolute bottom-full left-2 right-2 mb-1.5 bg-white border border-[#ededee] rounded-[14px] shadow-[0_8px_30px_rgba(0,0,0,0.08)] overflow-hidden z-30">
                  <div className="px-3 py-2 border-b border-[#f1f1f2] text-[9px] text-[#aaa]">
                    {tx('@ 提醒成员', '@ メンション')} · {mentionQuery ? '@' + mentionQuery : '选择成员'}
                  </div>
                  <div className="max-h-[220px] overflow-y-auto">
                    {filteredMentionMembers.map(({ member, character }) => {
                      const name = member.nickname || member.name || character?.name || '成员';
                      const avatar = character?.avatar || '';
                      return (
                        <button key={member.id} type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => insertMention(name)}
                          className="w-full px-3 py-2.5 flex items-center gap-2.5 text-left hover:bg-[#faf7f8] active:bg-[#f5eef1] transition-colors">
                          <div className="w-8 h-8 rounded-full bg-[#f5f5f6] border border-[#ededee] overflow-hidden shrink-0 flex items-center justify-center text-[10px] text-[#999]">
                            {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : name.slice(0, 1)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-semibold text-[#333] truncate">{name}</div>
                            <div className="text-[9px] text-[#aaa] truncate">
                              {member.online === false ? tx('离线', 'オフライン') : tx('在线', 'オンライン')}
                              {member.relationship ? ' · ' + member.relationship : ''}
                            </div>
                          </div>
                          <span className="text-[10px] text-[#c98f9d]">@</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* Plus Button */}
              <button
                onClick={() => setShowPlusSheet(true)}
                className="w-[34px] h-[38px] flex items-center justify-center text-[#555] hover:text-black cursor-pointer"
                title="更多功能"
              >
                <Plus className="w-5 h-5 stroke-[1.65]" />
              </button>

              {/* Microphone in Composer: 点击弹出所有语音选项 */}
              <button
                onClick={() => setShowVoiceSheet(true)}
                className="w-[34px] h-[38px] flex items-center justify-center text-[#555] hover:text-[#ae7e89] cursor-pointer active:scale-95 transition-transform"
                title="点击选择语音发送方式"
              >
                <Mic className="w-5 h-5 stroke-[1.65]" />
              </button>

              {/* Text Area Box */}
              <div className="flex-1 min-h-[38px] max-h-[100px] border border-[#e6e6e7] rounded-full bg-[#fafafa] flex items-center px-3.5">
                <textarea
                  value={inputText}
                  onChange={(e) => handleComposerChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && mentionPickerOpen) {
                      e.preventDefault();
                      setMentionPickerOpen(false);
                      return;
                    }
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend(false);
                    }
                  }}
                  rows={1}
                  placeholder="メッセージを入力…"
                  data-line-composer="true"
                  className="w-full resize-none bg-transparent outline-none text-[13px] text-[#333] placeholder-[#aaa] py-1 font-sans"
                />
              </div>

              {/* Sticker Button */}
              <button
                onClick={() => setShowStickerSheet(true)}
                className="w-[32px] h-[38px] flex items-center justify-center text-[#555] hover:text-black cursor-pointer"
              >
                <Smile className="w-5 h-5 stroke-[1.65]" />
              </button>

              {/* Send Button */}
              <button
                type="button"
                aria-label="发送并请求回复"
                title="发送并让角色回复"
                onPointerUp={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!inputText.trim()) return;
                  void handleSend(true);
                }}
                onClick={(e) => e.stopPropagation()}
                className="relative z-30 pointer-events-auto w-[34px] h-[38px] flex items-center justify-center text-[#c98f9d] hover:text-[#ae7e89] cursor-pointer active:scale-95 transition-transform"
              >
                <Send className="w-5 h-5 stroke-[1.65] pointer-events-none" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* 一起听歌抽屉 */}
      {showTogetherMusic && (
        <div onClick={() => setShowTogetherMusic(false)} className="absolute inset-0 bg-black/25 z-50 flex items-end animate-in fade-in">
          <div onClick={(e) => e.stopPropagation()} className="w-full bg-white rounded-t-[20px] p-4 pb-7 space-y-3.5 animate-in slide-in-from-bottom">
            <div className="w-8 h-1 bg-[#ddd] rounded-full mx-auto" />
            <div className="flex items-center gap-2"><Music2 className="w-4 h-4 text-[#8b7560]" /><div className="font-semibold text-sm text-[#333]">邀请一起听歌</div></div>
            <div className="text-[9px] text-[#999] leading-relaxed">填写一个可以在浏览器直接播放的音频链接。以后可以继续接入你的在线音乐曲库。</div>
            <input value={musicTitle} onChange={e => setMusicTitle(e.target.value)} placeholder="歌曲名称" className="w-full p-2.5 bg-[#f7f7f8] rounded-xl text-xs outline-none" />
            <input value={musicArtist} onChange={e => setMusicArtist(e.target.value)} placeholder="歌手 / 艺术家" className="w-full p-2.5 bg-[#f7f7f8] rounded-xl text-xs outline-none" />
            <input value={musicUrl} onChange={e => setMusicUrl(e.target.value)} placeholder="音频 URL（mp3 / wav / ogg 等）" className="w-full p-2.5 bg-[#f7f7f8] rounded-xl text-[10px] font-mono outline-none" />
            {togetherMusic && <div className="p-2.5 rounded-xl bg-[#faf3f5] border border-[#f0dee3] text-[9px] text-[#8d7078]">当前一起听：{togetherMusic.title} · {togetherMusic.artist}</div>}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setShowTogetherMusic(false)} className="py-2.5 rounded-xl bg-[#f5f5f5] text-[#777] text-xs">取消</button>
              <button
                onClick={() => {
                  const title = musicTitle.trim();
                  const artist = musicArtist.trim() || '未知艺术家';
                  const url = musicUrl.trim();
                  if (!title || !url) { showToast('请输入歌曲名称和音频链接'); return; }
                  const session = createTogetherMusicSession({ conversationId: conversationStorageId, title, artist, url, startedBy: 'me', status: 'invited' });
                  setTogetherMusic(session);
                  setMessages(prev => [...prev, { id: Date.now(), sender: 'me', senderName: currentUserNameFallback() || activePersona?.name || '我', text: '邀请你一起听歌：《' + title + '》', time: '刚刚', type: 'music-together', musicSession: session }]);
                  setMusicTitle(''); setMusicArtist(''); setMusicUrl('');
                  setShowTogetherMusic(false);
                  showToast('已发出一起听歌邀请 ♪');
                }}
                className="py-2.5 rounded-xl bg-[#292724] text-white text-xs"
              >发出邀请 ♪</button>
            </div>
          </div>
        </div>
      )}

      {/* 5. 语音选项抽屉 */}
      {showVoiceSheet && (
        <div
          onClick={() => setShowVoiceSheet(false)}
          className="absolute inset-0 bg-black/25 z-50 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-4 pb-6 space-y-4 animate-in slide-in-from-bottom"
          >
            <div className="w-8 h-1 bg-[#ddd] rounded-full mx-auto" />
            <div className="font-semibold text-sm text-[#333]">语音选项</div>

            <div className="grid grid-cols-2 gap-4 text-center">
              <button
                onClick={() => {
                  setShowVoiceSheet(false);
                  startRealRecording();
                }}
                className="p-4 rounded-[14px] bg-[#f7f7f8] hover:bg-[#efeef1] flex flex-col items-center gap-2 cursor-pointer transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#555] shadow-xs">
                  <Mic className="w-5 h-5" />
                </div>
                <div className="font-semibold text-xs text-[#333]">真实语音录制</div>
                <div className="text-[10px] text-[#999]">启动麦克风录制真实音频发送</div>
              </button>

              <button
                onClick={() => {
                  setShowVoiceSheet(false);
                  setCreatorType('voice');
                  setShowCreator(true);
                }}
                className="p-4 rounded-[14px] bg-[#faf2f4] hover:bg-[#f6e9ec] border border-[#f0dee3] flex flex-col items-center gap-2 cursor-pointer transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#ae7e89] shadow-xs">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="font-semibold text-xs text-[#ae7e89]">文字语音描述卡片</div>
                <div className="text-[10px] text-[#b88c97]">描述说话语气与内容发给AI</div>
              </button>
            </div>

            <button
              onClick={() => setShowVoiceSheet(false)}
              className="w-full py-2.5 rounded-[12px] bg-[#f7f7f7] text-[#777] text-xs font-medium cursor-pointer"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 6. MAIN PLUS SHEET */}
      {showPlusSheet && (
        <div
          onClick={() => setShowPlusSheet(false)}
          className="absolute inset-0 bg-black/25 z-50 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-4 pb-6 space-y-4 animate-in slide-in-from-bottom"
          >
            <div className="w-8 h-1 bg-[#ddd] rounded-full mx-auto" />
            <div className="font-semibold text-sm text-[#333]">发送内容</div>

            <div className="grid grid-cols-4 gap-4 text-center text-[10px] text-[#444]">
              {/* 图片 */}
              <button
                onClick={() => {
                  setShowPlusSheet(false);
                  setSubSheetType('image');
                }}
                className="flex flex-col items-center gap-1.5 cursor-pointer"
              >
                <div className="w-12 h-12 rounded-[14px] bg-[#f7f7f8] flex items-center justify-center text-[#666] hover:bg-[#f0f0f2]">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <span>图片</span>
              </button>

              {/* 视频 */}
              <button
                onClick={() => {
                  setShowPlusSheet(false);
                  setSubSheetType('video');
                }}
                className="flex flex-col items-center gap-1.5 cursor-pointer"
              >
                <div className="w-12 h-12 rounded-[14px] bg-[#f7f7f8] flex items-center justify-center text-[#666] hover:bg-[#f0f0f2]">
                  <Film className="w-5 h-5" />
                </div>
                <span>视频</span>
              </button>

              {/* 文件 */}
              <button
                onClick={() => {
                  setShowPlusSheet(false);
                  setSubSheetType('file');
                }}
                className="flex flex-col items-center gap-1.5 cursor-pointer"
              >
                <div className="w-12 h-12 rounded-[14px] bg-[#f7f7f8] flex items-center justify-center text-[#666] hover:bg-[#f0f0f2]">
                  <FileText className="w-5 h-5" />
                </div>
                <span>文件</span>
              </button>

              {/* 线下邀约 */}
              <button
                onClick={() => {
                  setShowPlusSheet(false);
                  setShowOfflineInviteModal(true);
                }}
                className="flex flex-col items-center gap-1.5 cursor-pointer"
              >
                <div className="w-12 h-12 rounded-[14px] bg-[#faf1f3] text-[#ae7e89] flex items-center justify-center hover:bg-[#f7e6e9]">
                  <Heart className="w-5 h-5" />
                </div>
                <span>线下邀约</span>
              </button>

              {/* AI 后台 / 当前聊天诊断 */}
              <button
                onClick={() => {
                  setAiDebugLog(readAiDebugLog());
                  setAiDebugTrace(readAiDebugTrace(conversationStorageId));
                  setShowPlusSheet(false);
                  setShowAiDebugSheet(true);
                }}
                className="flex flex-col items-center gap-1.5 cursor-pointer"
              >
                <div className="w-12 h-12 rounded-[14px] bg-[#f4f1ed] flex items-center justify-center text-[#6f6963] hover:bg-[#ebe7df]">
                  <Terminal className="w-5 h-5" />
                </div>
                <span>AI后台</span>
              </button>

              {/* D20 判定骰子 */}
              <button
                onClick={handleRollDice}
                className="flex flex-col items-center gap-1.5 cursor-pointer"
              >
                <div className="w-12 h-12 rounded-[14px] bg-[#f7f7f8] flex items-center justify-center text-[#666] hover:bg-[#f0f0f2]">
                  <Sparkles className="w-5 h-5" />
                </div>
                <span>D20骰子</span>
              </button>

              {/* 重新生成 (Reroll) */}
              <button
                onClick={() => {
                  setShowPlusSheet(false);
                  setRerollTargetId(null);
                  setShowReroll(true);
                }}
                className="flex flex-col items-center gap-1.5 cursor-pointer"
              >
                <div className="w-12 h-12 rounded-[14px] bg-[#f7f7f8] flex items-center justify-center text-[#666] hover:bg-[#f0f0f2]">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <span>重新生成</span>
              </button>

              {/* 继续生成 (Continue) */}
              <button
                onClick={() => {
                  setShowPlusSheet(false);
                  handleContinueGenerating();
                }}
                className="flex flex-col items-center gap-1.5 cursor-pointer"
              >
                <div className="w-12 h-12 rounded-[14px] bg-[#f7f7f8] flex items-center justify-center text-[#666] hover:bg-[#f0f0f2]">
                  <Play className="w-5 h-5" />
                </div>
                <span>让角色继续说</span>
              </button>
            </div>

            <button
              onClick={() => setShowPlusSheet(false)}
              className="w-full py-2.5 rounded-[12px] bg-[#f7f7f7] text-[#777] text-xs font-medium cursor-pointer"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 7. AI DEBUG SHEET — show the actual prompt, raw model output and parser result */}
      {showAiDebugSheet && (
        <div onClick={() => setShowAiDebugSheet(false)} className="absolute inset-0 bg-black/30 z-[80] flex items-end">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-h-[92%] bg-[#0b0b0c] text-[#e9e9ea] rounded-t-[22px] flex flex-col overflow-hidden font-mono">
            <div className="px-4 pt-3 pb-2 border-b border-white/10 bg-[#111112]">
              <div className="w-8 h-1 bg-white/15 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[8px] tracking-[1.8px] text-white/35">DEVELOPER CONSOLE · SANE333</div>
                  <div className="text-[14px] font-semibold font-sans">开发者后台</div>
                  <div className="text-[8px] text-white/35 mt-0.5">REAL REQUEST · RAW OUTPUT · PARSER · STATUS BAR PIPELINE</div>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => { setAiDebugTrace(readAiDebugTrace(conversationStorageId)); setAiDebugLog(readAiDebugLog()); }} className="text-[8px] px-2 py-1.5 rounded-lg bg-white/8 border border-white/8">刷新</button>
                  <button onClick={() => { clearAiDebugLog(); setAiDebugTrace(null); setAiDebugLog([]); }} className="text-[8px] px-2 py-1.5 rounded-lg text-[#f0aab5] bg-[#351c21]">清空</button>
                  <button onClick={() => setShowAiDebugSheet(false)} className="text-[14px] px-2 py-1 rounded-lg bg-white/8">×</button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <div className="rounded-xl border border-white/8 bg-[#111112] p-3">
                <div className="flex items-center justify-between">
                  <span className="font-sans text-[9px] text-white/45">TRACE</span>
                  <span className="text-[9px] text-[#9be3c9]">{aiDebugTrace?.stage || 'waiting'}</span>
                </div>
                {aiDebugTrace?.error && <div className="mt-2 rounded-lg bg-[#3a1e24] border border-[#6a303c] p-2 text-[9px] text-[#ffb9c3]">{aiDebugTrace.error.message}</div>}
              </div>

              <div className="rounded-xl border border-white/8 bg-[#09090a] overflow-hidden">
                <div className="px-3 py-2 border-b border-white/8 text-[9px] text-white/45">LIVE LOG</div>
                <div className="max-h-[280px] overflow-y-auto p-2 space-y-1">
                  {aiDebugLog.length ? aiDebugLog.map(entry => (
                    <details key={entry.id} className={`rounded-lg px-2.5 py-2 border ${entry.level === 'error' ? 'bg-[#221216] border-[#542630]' : entry.level === 'success' ? 'bg-[#101b17] border-[#1e4033]' : 'bg-[#111214] border-white/6'}`}>
                      <summary className="cursor-pointer list-none flex items-start gap-2">
                        <span className={`shrink-0 ${entry.level === 'error' ? 'text-[#ff91a1]' : entry.level === 'success' ? 'text-[#8ee1bf]' : 'text-[#aeb4bf]'}`}>{entry.level === 'error' ? '✕' : entry.level === 'success' ? '✓' : '›'}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[8px] text-white/28">{new Date(entry.time).toLocaleTimeString()}</span>
                          <span className="block text-[9px] text-white/75 break-words">{entry.event} <span className="text-white/45">— {entry.message}</span></span>
                        </span>
                      </summary>
                      {entry.meta && <pre className="mt-2 pt-2 border-t border-white/6 whitespace-pre-wrap break-all text-[8px] leading-relaxed text-[#c5c8cf]">{JSON.stringify(entry.meta, null, 2)}</pre>}
                    </details>
                  )) : <div className="py-10 text-center text-[8px] text-white/25">暂无后台日志。发送一条角色消息开始记录。</div>}
                </div>
              </div>

              {aiDebugTrace?.request && (
                <>
                  <details className="rounded-xl bg-[#111112] border border-white/8 p-3">
                    <summary className="cursor-pointer text-[9px] text-white/75">SYSTEM PROMPT</summary>
                    <pre className="mt-2 whitespace-pre-wrap break-words text-[8px] leading-relaxed text-[#c7c9ce]">{aiDebugTrace.request.system || '(无)'}</pre>
                  </details>
                  <details className="rounded-xl bg-[#111112] border border-white/8 p-3">
                    <summary className="cursor-pointer text-[9px] text-white/75">MESSAGES</summary>
                    <pre className="mt-2 whitespace-pre-wrap break-words text-[8px] leading-relaxed text-[#c7c9ce]">{JSON.stringify(aiDebugTrace.request.messages || [], null, 2)}</pre>
                  </details>
                  <details open className="rounded-xl bg-[#171012] border border-[#4b242c] p-3">
                    <summary className="cursor-pointer text-[9px] text-[#f2c1c8]">RAW AI RESPONSE</summary>
                    <pre className="mt-2 whitespace-pre-wrap break-words text-[8px] leading-relaxed text-[#f0dfe2]">{aiDebugTrace.rawResponse || '(无)'}</pre>
                  </details>
                  {aiDebugTrace?.parsed && (
                    <details open className="rounded-xl bg-[#101716] border border-[#24473b] p-3">
                      <summary className="cursor-pointer text-[9px] text-[#9be3c9]">THINKING / COT · 已与状态栏分离</summary>
                      <pre className="mt-2 whitespace-pre-wrap break-all text-[8px] leading-relaxed text-[#cfe9df]">{String(aiDebugTrace.parsed.thinkingSummary || aiDebugTrace.final?.thinkingSummary || '(本轮没有可展示的思维链摘要)')}</pre>
                    </details>
                  )}
                  <details className="rounded-xl bg-[#111112] border border-white/8 p-3">
                    <summary className="cursor-pointer text-[9px] text-white/75">PARSER RESULT</summary>
                    <pre className="mt-2 whitespace-pre-wrap break-all text-[8px] leading-relaxed text-[#c7c9ce]">{JSON.stringify(aiDebugTrace.parsed || {}, null, 2)}</pre>
                  </details>
                </>
              )}
            </div>
          </div>
        </div>
      )}


      {showPersonaPicker && onSwitchPersona && (
        <div onClick={() => setShowPersonaPicker(false)} className="absolute inset-0 bg-black/25 z-[75] flex items-end">
          <div onClick={e => e.stopPropagation()} className="w-full bg-white rounded-t-[22px] p-5 pb-7 space-y-3">
            <div className="flex items-center justify-between"><div><div className="text-[8px] tracking-[1.5px] text-[#aaa] font-mono">CHAT PERSONA</div><div className="text-sm font-semibold mt-1">聊天中的“我”</div></div><button onClick={() => setShowPersonaPicker(false)} className="text-xl text-[#aaa]">×</button></div>
            {personaOptions.length ? personaOptions.map(p => <button key={p.id} onClick={() => { setShowPersonaPicker(false); onSelectPersona?.(p.id); }} className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left ${p.id === personaId ? 'border-[#d4aab5] bg-[#fbf3f5]' : 'border-[#eee] bg-white'}`}><div className="w-9 h-9 rounded-full bg-[#f2f2f2] overflow-hidden grid place-items-center text-xs">{p.avatar ? <img src={p.avatar} className="w-full h-full object-cover" /> : (p.name || '我').slice(0,1)}</div><div><div className="text-xs font-semibold">{p.name || '未命名人设'}</div><div className="text-[8px] text-[#aaa]">{p.id === personaId ? '当前聊天正在使用' : '切换后进入这个“我”的独立聊天记录'}</div></div>{p.id === personaId && <span className="ml-auto text-[9px] text-[#ae7e89]">当前</span>}</button>) : <div className="py-6 text-center text-[10px] text-[#aaa]">还没有创建其他“我”。请先在人设设置里创建。</div>}
          </div>
        </div>
      )}

      {/* 7. SUB-SHEET: 真实 VS 文字 双选项 */}
      {subSheetType && (
        <div
          onClick={() => setSubSheetType(null)}
          className="absolute inset-0 bg-black/25 z-50 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-4 pb-6 space-y-4 animate-in slide-in-from-bottom"
          >
            <div className="w-8 h-1 bg-[#ddd] rounded-full mx-auto" />
            <div className="font-semibold text-sm text-[#333]">
              {subSheetType === 'image' && '图片选项'}
              {subSheetType === 'video' && '视频选项'}
              {subSheetType === 'file' && '文件选项'}
            </div>

            <div className="grid grid-cols-2 gap-4 text-center">
              <button
                onClick={() => {
                  fileInputRef.current?.click();
                }}
                className="p-4 rounded-[14px] bg-[#f7f7f8] hover:bg-[#efeef1] flex flex-col items-center gap-2 cursor-pointer transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#555] shadow-xs">
                  {subSheetType === 'image' && <ImageIcon className="w-5 h-5" />}
                  {subSheetType === 'video' && <Film className="w-5 h-5" />}
                  {subSheetType === 'file' && <FileText className="w-5 h-5" />}
                </div>
                <div className="font-semibold text-xs text-[#333]">
                  真实{subSheetType === 'image' ? '图片' : subSheetType === 'video' ? '视频' : '文件'}
                </div>
                <div className="text-[10px] text-[#999]">本地真实上传发送</div>
              </button>

              <button
                onClick={() => {
                  setCreatorType(subSheetType);
                  setSubSheetType(null);
                  setShowCreator(true);
                }}
                className="p-4 rounded-[14px] bg-[#faf2f4] hover:bg-[#f6e9ec] border border-[#f0dee3] flex flex-col items-center gap-2 cursor-pointer transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#ae7e89] shadow-xs">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="font-semibold text-xs text-[#ae7e89]">
                  文字{subSheetType === 'image' ? '图片' : subSheetType === 'video' ? '视频' : '文件'}
                </div>
                <div className="text-[10px] text-[#b88c97]">白色卡片描述发给AI</div>
              </button>
            </div>

            <button
              onClick={() => setSubSheetType(null)}
              className="w-full py-2.5 rounded-[12px] bg-[#f7f7f7] text-[#777] text-xs font-medium cursor-pointer"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 8. CREATOR MODAL */}
      {showCreator && (
        <div className="absolute inset-0 bg-white z-50 flex flex-col animate-in slide-in-from-right">
          <div className="h-[60px] border-b border-[#ededee] flex items-center justify-between px-3">
            <button onClick={() => setShowCreator(false)} className="text-2xl text-[#555] px-2 cursor-pointer">
              ‹
            </button>
            <span className="font-semibold text-sm text-[#333]">
              {creatorType === 'image' && '发送文字图片'}
              {creatorType === 'video' && '发送文字视频'}
              {creatorType === 'file' && '发送文字文件'}
              {creatorType === 'voice' && '发送文字语音'}
            </span>
            <div className="w-8" />
          </div>

          <div className="p-4 space-y-4 flex-1 overflow-y-auto">
            <div className="text-[11px] text-[#888]">
              {creatorType === 'image' && '输入「图片描述」，将作为一张白色卡片发送给 AI 角色作为聊天内容：'}
              {creatorType === 'video' && '输入「视频描述」，将作为一张白色卡片发送给 AI 角色：'}
              {creatorType === 'file' && '输入「文件描述/内容」，将作为一张白色卡片发送给 AI 角色：'}
              {creatorType === 'voice' && '输入「语音内容/说话语气描述」，将作为一张白色卡片发送给 AI 角色：'}
            </div>

            <textarea
              value={creatorPrompt}
              onChange={(e) => setCreatorPrompt(e.target.value)}
              placeholder={
                creatorType === 'image'
                  ? '例如：窗外下着小雨，桌上一杯冒着热气的红茶，旁边放着我给你的明信片……'
                  : creatorType === 'video'
                  ? '例如：傍晚沿海公路的汽车后视镜，夕阳把云层染成暖粉色……'
                  : creatorType === 'file'
                  ? '例如：整理好的下周末两人旅行攻略.docx，包含景点与路线安排……'
                  : '例如：（轻声耳语）我已经到楼下了，等你一起吃晚饭……'
              }
              className="w-full h-36 bg-[#f8f8f9] border border-[#ededee] rounded-[12px] p-3 text-xs outline-none leading-relaxed resize-none font-sans"
            />

            <button
              onClick={handleCreateTextCard}
              className="w-full h-[45px] bg-[#f5e9ec] hover:bg-[#eddde1] text-[#9e6573] rounded-[12px] text-xs font-semibold active:scale-[0.99] transition-transform cursor-pointer"
            >
              发送白色描述卡片给角色
            </button>
          </div>
        </div>
      )}

      {/* 9. 我的人设管理器 (User Persona Manager - 独立面板) */}
      {showPersonaManager && (
        <div className="absolute inset-0 bg-white z-50 flex flex-col animate-in slide-in-from-bottom">
          <div className="h-[60px] border-b border-[#ededee] flex items-center justify-between px-3">
            <button onClick={() => setShowPersonaManager(false)} className="text-2xl text-[#555] px-2 cursor-pointer">
              ‹
            </button>
            <div className="text-center">
              <div className="font-semibold text-sm text-[#333]">我的人设管理器 (Persona Manager)</div>
              <div className="text-[9px] text-[#aaa]">自由切换与定制你的酒馆身份卡</div>
            </div>
            <div className="w-8" />
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs pb-10">
            {/* 新建人设按钮 */}
            <button
              onClick={() => setShowNewPersonaModal(true)}
              className="w-full py-2.5 rounded-[12px] border border-dashed border-[#d4aab5] bg-[#faf6f7] hover:bg-[#f6eff1] text-[#ae7e89] font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              <span>＋ 新建我的人设卡</span>
            </button>

            {/* 人设卡列表 */}
            <div className="space-y-3">
              {userPersonas.map((persona) => {
                const isActive = persona.id === activePersonaId;
                const isEditing = persona.id === editingPersonaId;
                const updatePersona = (patch: Record<string, any>) => {
                  setUserPersonas(prev => prev.map(item => item.id === persona.id ? {
                    ...item,
                    ...patch,
                    identity: patch.profession ?? item.profession ?? item.identity ?? '',
                    background: patch.setting ?? item.setting ?? item.background ?? '',
                  } : item));
                };
                return (
                  <div key={persona.id} className={`p-3.5 rounded-[14px] border transition-all ${isActive ? 'border-[#d4aab5] bg-[#fdf9fa] ring-1 ring-[#d4aab5]/40' : 'border-[#ededee] bg-white'}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full overflow-hidden border border-[#eee] shrink-0 bg-[#fafafa] grid place-items-center">
                        {persona.avatar ? <img src={persona.avatar} alt={persona.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <span className="text-[10px] text-[#aaa]">头像</span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-[13.5px] text-[#222] truncate">{persona.name || '未命名人设'}</div>
                        <div className="text-[10px] text-[#aaa] mt-0.5">{persona.age ? `${persona.age} 岁` : '未填写年龄'} · {persona.profession || persona.identity || '未填写职业'}</div>
                      </div>
                      {isActive && <span className="text-[9px] bg-[#d4aab5] text-white px-2 py-0.5 rounded-full shrink-0">当前使用 ✓</span>}
                    </div>

                    {isEditing ? (
                      <div className="mt-3 pt-3 border-t border-[#f2f2f4] space-y-2.5" onClick={e => e.stopPropagation()}>
                        <input value={persona.name || ''} onChange={e => updatePersona({ name: e.target.value })} placeholder="姓名" className="w-full p-2 bg-white border border-[#e8e8e9] rounded-md text-[10px] text-[#333]" />
                        <div className="grid grid-cols-2 gap-2">
                          <input value={persona.age || ''} onChange={e => updatePersona({ age: e.target.value })} placeholder="年龄" className="w-full p-2 bg-white border border-[#e8e8e9] rounded-md text-[10px] text-[#333]" />
                          <input value={persona.profession || persona.identity || ''} onChange={e => updatePersona({ profession: e.target.value })} placeholder="职业" className="w-full p-2 bg-white border border-[#e8e8e9] rounded-md text-[10px] text-[#333]" />
                        </div>
                        <textarea value={persona.setting || persona.background || ''} onChange={e => updatePersona({ setting: e.target.value })} placeholder="设定" className="w-full h-24 p-2 bg-white border border-[#e8e8e9] rounded-md text-[10px] text-[#333] leading-relaxed resize-none" />
                        <div className="grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => document.getElementById(`persona-avatar-${persona.id}`)?.click()} className="py-1.5 rounded-[9px] bg-white border border-[#e8e8e9] text-[9px] text-[#666]">更换头像</button>
                          <button type="button" onClick={() => setEditingPersonaId(null)} className="py-1.5 rounded-[9px] bg-[#292724] text-white text-[9px]">保存</button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2.5 pt-2 border-t border-[#f2f2f4] text-[10.5px] text-[#666] leading-relaxed">
                        <span className="font-medium text-[#444]">设定：</span>{persona.setting || persona.background || '未填写'}
                      </div>
                    )}

                    <div className="mt-2 flex gap-2">
                      <input id={`persona-avatar-${persona.id}`} type="file" accept="image/*" className="hidden" onChange={async e => {
                        const file = e.target.files?.[0]; if (!file) return;
                        try {
                          const avatar = await readImageFileAsDataUrl(file);
                          updatePersona({ avatar });
                          showToast(`已更新「${persona.name}」的头像`);
                        } catch { showToast('头像读取失败'); }
                        e.currentTarget.value = '';
                      }} />
                      <button type="button" onClick={() => { setActivePersonaId(persona.id); showToast(`已切换为身份：${persona.name}`); }} className="flex-1 py-1.5 rounded-[9px] bg-[#fafafa] border border-[#e8e8e9] text-[9px] text-[#666]">使用此人设</button>
                      <button type="button" onClick={() => setEditingPersonaId(isEditing ? null : persona.id)} className="flex-1 py-1.5 rounded-[9px] bg-[#fafafa] border border-[#e8e8e9] text-[9px] text-[#666]">{isEditing ? '收起编辑' : '编辑全部设定'}</button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setShowPersonaManager(false)}
              className="w-full py-2.5 rounded-[12px] bg-[#f7f7f7] hover:bg-[#efefef] text-[#666] text-xs font-medium cursor-pointer"
            >
              完成并返回聊天
            </button>
          </div>
        </div>
      )}

      {/* 9.1 新建我的人设弹窗 */}
      {showNewPersonaModal && (
        <div className="absolute inset-0 bg-white z-55 flex flex-col animate-in slide-in-from-right">
          <div className="h-[60px] border-b border-[#ededee] flex items-center justify-between px-3">
            <button onClick={() => setShowNewPersonaModal(false)} className="text-2xl text-[#555] px-2 cursor-pointer">
              ‹
            </button>
            <span className="font-semibold text-sm text-[#333]">新建人设卡</span>
            <div className="w-8" />
          </div>

          <div className="p-4 space-y-3 flex-1 overflow-y-auto text-xs">
            <div className="rounded-[14px] border border-[#ededee] bg-[#fafafa] p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[#444] font-medium">我的头像</div>
                  <div className="text-[9px] text-[#999] mt-0.5">上传本地图片，或粘贴你自己的图片链接。</div>
                </div>
                <div className="w-12 h-12 rounded-full overflow-hidden border border-[#e5e5e7] bg-white grid place-items-center shrink-0">
                  {newPersonaData.avatar ? (
                    <img src={newPersonaData.avatar} alt="我的头像预览" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="text-[10px] text-[#aaa]">头像</span>
                  )}
                </div>
              </div>
              <input
                ref={myAvatarFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const avatar = await readImageFileAsDataUrl(file);
                    setNewPersonaData(prev => ({ ...prev, avatar }));
                  } catch {
                    showToast('头像读取失败');
                  } finally {
                    e.currentTarget.value = '';
                  }
                }}
              />
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => myAvatarFileRef.current?.click()} className="py-2 rounded-[10px] bg-white border border-[#e4e4e6] text-[10px] text-[#555]">上传本地图片</button>
                <button type="button" onClick={() => {
                  const url = window.prompt('粘贴头像图片链接：', newPersonaData.avatar || '');
                  if (url !== null) setNewPersonaData(prev => ({ ...prev, avatar: url.trim() }));
                }} className="py-2 rounded-[10px] bg-white border border-[#e4e4e6] text-[10px] text-[#555]">使用图片链接</button>
              </div>
            </div>

            <div>
              <span className="text-[#666] font-medium">姓名</span>
              <input
                value={newPersonaData.name}
                onChange={(e) => setNewPersonaData({ ...newPersonaData, name: e.target.value })}
                placeholder="例如：苏念"
                className="w-full p-2 bg-[#fafafa] border border-[#e8e8e9] rounded-md text-xs mt-1"
              />
            </div>
            <div>
              <span className="text-[#666] font-medium">年龄</span>
              <input value={newPersonaData.age} onChange={(e) => setNewPersonaData({ ...newPersonaData, age: e.target.value })} placeholder="例如：24" className="w-full p-2 bg-[#fafafa] border border-[#e8e8e9] rounded-md text-xs mt-1" />
            </div>
            <div>
              <span className="text-[#666] font-medium">职业</span>
              <input value={newPersonaData.profession} onChange={(e) => setNewPersonaData({ ...newPersonaData, profession: e.target.value })} placeholder="例如：摄影师" className="w-full p-2 bg-[#fafafa] border border-[#e8e8e9] rounded-md text-xs mt-1" />
            </div>
            <div>
              <span className="text-[#666] font-medium">设定</span>
              <textarea value={newPersonaData.setting} onChange={(e) => setNewPersonaData({ ...newPersonaData, setting: e.target.value })} placeholder="你希望 AI 知道的关于我的设定……" className="w-full h-28 p-2 bg-[#fafafa] border border-[#e8e8e9] rounded-md text-xs mt-1 leading-relaxed resize-none" />
            </div>

            <button
              onClick={() => {
                if (!newPersonaData.name.trim()) {
                  showToast('请输入人设姓名');
                  return;
                }
                const newP = {
                  id: `p-${Date.now()}`,
                  name: newPersonaData.name.trim(),
                  avatar: newPersonaData.avatar.trim(),
                  age: newPersonaData.age.trim(),
                  profession: newPersonaData.profession.trim(),
                  setting: newPersonaData.setting.trim(),
                  identity: newPersonaData.profession.trim(),
                  gender: '',
                  traits: '',
                  background: newPersonaData.setting.trim(),
                  isDefault: false,
                };
                setUserPersonas([...userPersonas, newP]);
                setActivePersonaId(newP.id);
                setShowNewPersonaModal(false);
                setNewPersonaData({ name: '', age: '', profession: '', setting: '', avatar: '' });
                showToast(`已创建并启用新身份：${newP.name}`);
              }}
              className="w-full py-2.5 bg-[#d4aab5] text-white rounded-[12px] font-semibold text-xs mt-4 cursor-pointer"
            >
              保存并立即使用
            </button>
          </div>
        </div>
      )}

      {/* 10. 美化与自定义 CSS 管理器 (Theme & Custom CSS Manager) */}
      {showCssManager && (
        <div className="absolute inset-0 bg-white z-50 flex flex-col animate-in slide-in-from-bottom">
          <div className="h-[60px] border-b border-[#ededee] flex items-center justify-between px-3">
            <button onClick={() => setShowCssManager(false)} className="text-2xl text-[#555] px-2 cursor-pointer">
              ‹
            </button>
            <div className="text-center">
              <div className="font-semibold text-sm text-[#333]">美化管理器与自定义 CSS</div>
              <div className="text-[9px] text-[#aaa]">SillyTavern 风格样式扩展与微调</div>
            </div>
            <div className="w-8" />
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs pb-10">
            {/* 快捷主题色切换 */}
            <div className="space-y-1.5">
              <div className="text-[10px] text-[#aaa] font-medium">氛围底色切换：</div>
              <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
                {[
                  { id: 'pure-white', label: '纯白极简', bg: 'bg-white border-[#ddd]' },
                  { id: 'warm-light', label: '暖杏微光', bg: 'bg-[#fbf8f5] border-[#f0e6da]' },
                  { id: 'tokyo-rain', label: '雨夜微凉', bg: 'bg-[#f2f4f8] border-[#d8e0ec]' },
                  { id: 'rose-mist', label: '粉雾晨曦', bg: 'bg-[#faf4f6] border-[#f2dbe3]' },
                ].map((wp) => (
                  <button
                    key={wp.id}
                    onClick={() => setCurrentWallpaper(wp.id as any)}
                    className={`p-2 rounded-[10px] border flex flex-col items-center gap-1.5 cursor-pointer ${
                      currentWallpaper === wp.id ? 'ring-2 ring-[#d4aab5]' : ''
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full ${wp.bg} shadow-2xs border`} />
                    <span className="text-[#666]">{wp.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#aaa] font-medium">已保存的美化方案</span>
                <button onClick={() => {
                  const name = appearancePresetName.trim() || window.prompt('给当前美化方案起个名字：')?.trim();
                  if (!name) return;
                  setAppearancePresets(prev => [...prev.filter(item => item.name !== name), { id: `appearance-${Date.now()}`, name, wallpaper: currentWallpaper, css: customCss }]);
                  setAppearancePresetName('');
                  showToast(`已保存美化方案「${name}」`);
                }} className="px-2.5 py-1 rounded-full bg-[#292724] text-white text-[9px]">保存当前美化</button>
              </div>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                {appearancePresets.length ? appearancePresets.map(preset => (
                  <div key={preset.id} className="shrink-0 flex items-center gap-1 rounded-full border border-[#e7e2e3] bg-[#faf8f9] pl-2 pr-1 py-1">
                    <button onClick={() => { setCurrentWallpaper(preset.wallpaper); setCustomCss(preset.css); showToast(`已切换到「${preset.name}」`); }} className="text-[9px] text-[#666]">{preset.name}</button>
                    <button onClick={() => setAppearancePresets(prev => prev.filter(item => item.id !== preset.id))} className="w-4 h-4 rounded-full text-[#aaa]" aria-label={`删除${preset.name}`}>×</button>
                  </div>
                )) : <span className="text-[9px] text-[#aaa]">还没有保存过方案。</span>}
              </div>
            </div>

            {/* 快捷 CSS 模板胶囊 */}
            <div className="space-y-1.5 pt-2">
              <div className="text-[10px] text-[#aaa] font-medium">快速插入样式代码片段：</div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  {
                    name: '＋ 气泡圆润',
                    snippet: `\n.custom-chat-view .bubble-me, .custom-chat-view .bubble-other { border-radius: 20px !important; }`,
                  },
                  {
                    name: '＋ 衬线文学风',
                    snippet: `\n.custom-chat-view { font-family: "Songti SC", "Georgia", serif !important; }`,
                  },
                  {
                    name: '＋ 柔光粉雾气泡',
                    snippet: `\n.custom-chat-view .bubble-me { background: #faeff2 !important; box-shadow: 0 2px 10px rgba(212,170,181,0.25) !important; }`,
                  },
                  {
                    name: '＋ 思维链暗粉边框',
                    snippet: `\n.custom-chat-view .thinking-card { border: 1px solid #d4aab5 !important; background: #fffcfd !important; }`,
                  },
                ].map((snip, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setCustomCss((prev) => prev + snip.snippet);
                      showToast(`已插入：${snip.name}`);
                    }}
                    className="px-2 py-1 bg-[#f4f4f6] hover:bg-[#e8e8eb] rounded-md text-[10px] text-[#555] cursor-pointer"
                  >
                    {snip.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom CSS 编辑器 (实时生效) */}
            <div className="space-y-1.5 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#aaa] font-medium flex items-center gap-1">
                  <Terminal className="w-3.5 h-3.5 text-[#ae7e89]" />
                  <span>实时 CSS 编辑器 (支持编写原生 CSS 规则)：</span>
                </span>
                <button
                  onClick={() => {
                    setCustomCss('');
                    showToast('已重置 CSS');
                  }}
                  className="text-[10px] text-rose-400 hover:text-rose-600"
                >
                  清空
                </button>
              </div>

              <textarea
                value={customCss}
                onChange={(e) => setCustomCss(e.target.value)}
                placeholder="/* 在这里写入自定义 CSS 规则，如：\n.bubble-me { font-weight: 500; } */"
                className="w-full h-44 p-3 font-mono text-[11px] bg-[#1e1e20] text-[#a9b7c6] rounded-[12px] outline-none leading-relaxed resize-none shadow-inner"
              />
              <div className="text-[9.5px] text-[#aaa]">
                类名参考：<code>.custom-chat-view</code> (聊天主容器), <code>.bubble-me</code> (我方气泡), <code>.bubble-other</code> (对方气泡), <code>.thinking-card</code> (思维链卡片)
              </div>
            </div>

            <button
              onClick={() => {
                setShowCssManager(false);
                showToast('美化与 CSS 已生效 ✨');
              }}
              className="w-full py-2.5 rounded-[12px] bg-[#d4aab5] text-white text-xs font-semibold cursor-pointer shadow-xs"
            >
              应用并返回聊天
            </button>
          </div>
        </div>
      )}

      {/* 11. 酒馆 RegEx 渲染卡片：头像点击只显示最终 HTML */}
      {showRenderedStatusBarModal && (
        <div
          onClick={() => setShowRenderedStatusBarModal(false)}
          className="absolute inset-0 z-[55] bg-black/25 backdrop-blur-[2px] flex items-center justify-center p-4 animate-in fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-[420px] max-h-[88vh] overflow-y-auto bg-transparent p-0 shadow-none animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[8px] font-mono tracking-[1.6px] text-[#aaa] uppercase">STATUS HISTORY</div>
                <div className="mt-1 text-[13px] font-semibold text-[#252525]">
                  {currentStatusSnapshot?.presetName || activeStatusBarPreset?.name || '状态栏'}
                </div>
              </div>
              <button onClick={() => setShowRenderedStatusBarModal(false)} className="w-7 h-7 rounded-full bg-[#f5f5f7] text-[#777]">×</button>
            </div>

            <div
              className="w-full overflow-visible touch-pan-y"
              onTouchStart={e => { statusSwipeStartXRef.current = e.changedTouches[0]?.clientX ?? null; }}
              onTouchEnd={e => {
                const start = statusSwipeStartXRef.current;
                const end = e.changedTouches[0]?.clientX;
                statusSwipeStartXRef.current = null;
                if (start == null || end == null || Math.abs(end - start) < 45 || !statusBarHistory.length) return;
                if (end < start) setStatusBarHistoryIndex(i => Math.min(statusBarHistory.length - 1, i + 1));
                else setStatusBarHistoryIndex(i => Math.max(0, i - 1));
              }}
            >
              {currentStatusSnapshot ? (
                <div
                  className="uwu-status-render w-full min-w-0 overflow-x-auto break-words"
                  style={{ height: 'auto', minHeight: 0, overflowWrap: 'anywhere' }}
                  dangerouslySetInnerHTML={{ __html: resolveStatusBarTokens(currentStatusSnapshotHtml, statusTokens) }}
                />
              ) : (
                <div className="py-12 text-center text-[10px] text-[#aaa]">
                  还没有成功匹配的状态栏
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between pt-2">
              <button disabled={!statusBarHistory.length} onClick={() => setStatusBarHistoryIndex(i => Math.max(0, i - 1))} className="w-9 h-9 rounded-full border border-[#e8e8e8] text-[#555] disabled:opacity-30">‹</button>
              <div className="text-center">
                <div className="text-[10px] font-medium text-[#444]">{statusBarHistory.length ? `${statusBarHistoryIndex + 1} / ${statusBarHistory.length}` : '0 / 0'}</div>
                <div className="text-[8px] text-[#aaa] mt-0.5">{currentStatusSnapshot ? new Date(currentStatusSnapshot.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '等待角色回复'}</div>
              </div>
              <button disabled={!statusBarHistory.length} onClick={() => setStatusBarHistoryIndex(i => Math.min(statusBarHistory.length - 1, i + 1))} className="w-9 h-9 rounded-full border border-[#e8e8e8] text-[#555] disabled:opacity-30">›</button>
            </div>

            <div className="mt-4 flex items-center gap-2.5">
              <button
                onClick={() => {
                  if (!currentStatusSnapshot) return;
                  deleteStatusBarSnapshot(conversationStorageId, currentStatusSnapshot.id);
                  const next = getStatusBarHistory(conversationStorageId);
                  setStatusBarHistory(next);
                  setStatusBarHistoryIndex(Math.max(0, Math.min(statusBarHistoryIndex, next.length - 1)));
                }}
                disabled={!currentStatusSnapshot}
                className="flex-1 h-11 rounded-full border border-[#d8c7cb] bg-white/90 text-[#9b6874] text-[11px] font-semibold shadow-[0_3px_12px_rgba(80,50,60,0.08)] transition-all hover:bg-[#fbf2f4] active:scale-[0.98] disabled:opacity-30 disabled:shadow-none"
              >删除当前状态</button>
            </div>
          </div>
        </div>
      )}

      {/* 12. CHAT SETTINGS PAGE */}
      {showSettings && (
        <div className="absolute inset-0 bg-[#f7f7f8] z-50 flex flex-col animate-in slide-in-from-right">
          <div className="h-[60px] bg-white border-b border-[#ededee] flex items-center justify-between px-3">
            <button onClick={() => setShowSettings(false)} className="text-2xl text-[#555] px-2 cursor-pointer">
              ‹
            </button>
            <span className="font-semibold text-sm text-[#333]">聊天设定</span>
            <button type="button" onClick={handleSaveChatSettings} className="px-2.5 py-1.5 rounded-full bg-[#f7eef0] text-[#8c5f6b] border border-[#ead6dc] text-[9px] font-medium whitespace-nowrap">保存设定</button>
          </div>

          <div className="p-4 space-y-4 flex-1 overflow-y-auto text-xs pb-10">

            <details open={false} className="bg-white rounded-[14px] border border-[#f0f0f1] overflow-hidden">
              <summary className="list-none cursor-pointer p-3.5 flex items-center justify-between"><div><div className="font-medium text-[#333]">Generation / API</div><div className="text-[10px] text-[#999]">当前聊天独立 API 与模型</div></div><span className="text-[10px] text-[#aaa]">展开</span></summary>
              <div className="p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-[#333]">当前聊天 API</div>
                  <div className="text-[10px] text-[#999]">{chatApiOverride.enabled ? '本聊天使用独立 API' : '跟随全局 / 角色 AI API'}</div>
                </div>
                <button onClick={() => updateChatApiOverride({ enabled: !chatApiOverride.enabled })} className={`px-2.5 py-1 rounded-full text-[9px] ${chatApiOverride.enabled ? 'bg-[#d4aab5] text-white' : 'bg-[#eee] text-[#777]'}`}>{chatApiOverride.enabled ? '独立 API' : '跟随全局'}</button>
              </div>
              {chatApiOverride.enabled && <div className="space-y-2">
                <input value={chatApiOverride.apiBaseUrl} onChange={e => updateChatApiOverride({ apiBaseUrl: e.target.value })} placeholder="API Base URL" className="w-full p-2 bg-[#fafafa] border border-[#e8e8e9] rounded-[9px] text-[10px] outline-none" />
                <input value={chatApiOverride.apiKey} onChange={e => updateChatApiOverride({ apiKey: e.target.value })} placeholder="API Key" type="password" className="w-full p-2 bg-[#fafafa] border border-[#e8e8e9] rounded-[9px] text-[10px] outline-none" />
                <div className="flex gap-2">
                  <div className="flex-1 min-w-0">
                    <select value={chatApiOverride.model} onChange={e => updateChatApiOverride({ model: e.target.value })} className="w-full p-2 bg-[#fafafa] border border-[#e8e8e9] rounded-[9px] text-[10px] outline-none">
                      <option value="">选择模型</option>
                      {chatApiModels.map(model => <option key={model} value={model}>{model}</option>)}
                      {chatApiOverride.model && !chatApiModels.includes(chatApiOverride.model) && <option value={chatApiOverride.model}>{chatApiOverride.model}</option>}
                    </select>
                    {chatApiModels.length > 0 && (
                      <div className="mt-1 max-h-28 overflow-y-auto rounded-[8px] bg-white border border-[#eee] p-1 space-y-0.5">
                        {chatApiModels.map(model => (
                          <button key={model} type="button" onClick={() => updateChatApiOverride({ model })} className={"w-full text-left px-2 py-1.5 rounded-md text-[8px] font-mono truncate " + (chatApiOverride.model === model ? 'bg-[#f0e6e8] text-[#8c5f6b]' : 'text-[#666] hover:bg-[#fafafa]')}>{model}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={fetchChatApiModels} className="px-2.5 self-start rounded-[9px] bg-[#f0e6e8] text-[#8c5f6b] text-[9px]">{chatApiBusy === 'models' ? '拉取中…' : '拉取模型'}</button>
                </div>
                <button onClick={testChatApi} className="w-full py-2 rounded-[9px] bg-[#292724] text-white text-[10px]">{chatApiBusy === 'test' ? '测试中…' : '测试连接'}</button>
              </div>}
              </div>
            </details>

            <details open={showBehaviourSettings} onToggle={(e) => setShowBehaviourSettings((e.currentTarget as HTMLDetailsElement).open)} className="bg-white rounded-[14px] border border-[#f0f0f1] overflow-hidden">
              <summary className="list-none cursor-pointer p-3.5 flex items-center justify-between">
                <div><div className="font-medium text-[#333]">角色主动行为</div><div className="text-[10px] text-[#999]">只对当前角色 × 当前聊天生效</div></div>
                <span className="text-[10px] text-[#aaa]">{showBehaviourSettings ? '收起' : '展开'}</span>
              </summary>
              <div className="px-3.5 pb-3.5 space-y-2">
                {[
                  ['message', '角色主动发消息', '允许角色在合适的剧情时机主动联系你。', allowRoleInitiatedMessage, setAllowRoleInitiatedMessage],
                  ['moments', '角色主动发朋友圈 / VROOM', '允许角色在聊天之外发布动态。', allowRoleMomentsPost, setAllowRoleMomentsPost],
                  ['offline', '角色主动发起线下邀约', '允许角色向你发送线下剧情邀请。', allowOfflineInvite, setAllowOfflineInvite],
                ].map(([id, title, desc, value, setter]: any) => (
                  <button key={id} type="button" onClick={() => setter(!value)} className="w-full flex items-center justify-between gap-3 p-3 rounded-xl bg-[#fafafa] border border-[#eeeeef] text-left">
                    <div><div className="text-[11px] text-[#444] font-medium">{title}</div><div className="text-[9px] text-[#aaa] mt-0.5">{desc}</div></div>
                    <span className={`w-9 h-5 rounded-full p-0.5 ${value ? 'bg-[#d4aab5]' : 'bg-[#d9d9db]'}`}><span className={`block w-4 h-4 rounded-full bg-white shadow-sm ${value ? 'translate-x-4' : ''}`} /></span>
                  </button>
                ))}
              </div>
            </details>

            <details className="bg-white rounded-[14px] border border-[#f0f0f1] overflow-hidden">
              <summary className="list-none cursor-pointer p-3.5 flex items-center justify-between">
                <div>
                  <div className="font-medium text-[#333]">打字习惯</div>
                  <div className="text-[10px] text-[#999]">把角色平时怎么聊天一项一项设定</div>
                </div>
                <span className="text-[10px] text-[#aaa]">可自定义</span>
              </summary>
              <div className="px-3.5 pb-3.5 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['natural', '自然聊天', '自然变化，不刻意统一格式'],
                    ['short', '简短利落', '短句、少解释'],
                    ['fragmented', '碎片化', '更像真实即时消息'],
                    ['warm', '轻松活泼', '口语、语气更轻松'],
                    ['cold', '冷淡克制', '字少、情绪收着'],
                    ['custom', '自定义', '自己写整体习惯'],
                  ].map(([id, title, desc]) => (
                    <button key={id} type="button" onClick={() => setTypingHabitPreset(id)} className={"text-left p-2.5 rounded-xl border " + (typingHabitPreset === id ? 'bg-[#faf1f3] border-[#d4aab5] text-[#8c5f6b]' : 'bg-[#fafafa] border-[#eeeeef] text-[#555]')}>
                      <div className="text-[10px] font-medium">{title}</div>
                      <div className="text-[8.5px] mt-1 text-[#999]">{desc}</div>
                    </button>
                  ))}
                </div>
                {typingHabitPreset === 'custom' && <textarea value={typingHabitCustom} onChange={e => setTypingHabitCustom(e.target.value)} placeholder="例如：很少用句号，喜欢……，开心时会连续发好几条" className="w-full min-h-[60px] p-2.5 bg-[#fafafa] border border-[#eee] rounded-xl text-[10px] outline-none resize-none" />}

                <div>
                  <div className="text-[9.5px] font-medium text-[#666] mb-1.5">标点符号</div>
                  <div className="flex flex-wrap gap-1.5">
                    {[['natural','自然使用'],['full','喜欢标点'],['minimal','很少标点'],['dots','偏爱……/…'],['exclaim','偏爱！/？']].map(([id,title]) => <button key={id} type="button" onClick={() => setTypingPunctuation(id)} className={"px-2.5 py-1.5 rounded-full border text-[8.5px] " + (typingPunctuation === id ? 'bg-[#f7eef0] border-[#d4aab5] text-[#8c5f6b]' : 'bg-[#fafafa] border-[#eee] text-[#777]')}>{title}</button>)}
                  </div>
                </div>
                <div>
                  <div className="text-[9.5px] font-medium text-[#666] mb-1.5">emoji / 表情包</div>
                  <div className="flex flex-wrap gap-1.5">
                    {[['none','基本不用'],['rare','偶尔使用'],['often','经常使用'],['sticker','喜欢表情包']].map(([id,title]) => <button key={id} type="button" onClick={() => setTypingEmoji(id)} className={"px-2.5 py-1.5 rounded-full border text-[8.5px] " + (typingEmoji === id ? 'bg-[#f7eef0] border-[#d4aab5] text-[#8c5f6b]' : 'bg-[#fafafa] border-[#eee] text-[#777]')}>{title}</button>)}
                  </div>
                </div>
                <div>
                  <div className="text-[9.5px] font-medium text-[#666] mb-1.5">消息分条</div>
                  <div className="flex flex-wrap gap-1.5">
                    {[['single','喜欢一句一句发'],['natural','自然分条'],['combined','喜欢合并成一条']].map(([id,title]) => <button key={id} type="button" onClick={() => setTypingSplit(id)} className={"px-2.5 py-1.5 rounded-full border text-[8.5px] " + (typingSplit === id ? 'bg-[#f7eef0] border-[#d4aab5] text-[#8c5f6b]' : 'bg-[#fafafa] border-[#eee] text-[#777]')}>{title}</button>)}
                  </div>
                </div>
                <div>
                  <div className="text-[9.5px] font-medium text-[#666] mb-1.5">换行习惯</div>
                  <div className="flex flex-wrap gap-1.5">
                    {[['frequent','经常换行'],['natural','自然换行'],['rare','很少换行']].map(([id,title]) => <button key={id} type="button" onClick={() => setTypingLineBreak(id)} className={"px-2.5 py-1.5 rounded-full border text-[8.5px] " + (typingLineBreak === id ? 'bg-[#f7eef0] border-[#d4aab5] text-[#8c5f6b]' : 'bg-[#fafafa] border-[#eee] text-[#777]')}>{title}</button>)}
                  </div>
                </div>
                <div>
                  <div className="text-[9.5px] font-medium text-[#666] mb-1.5">句子长度</div>
                  <div className="flex flex-wrap gap-1.5">
                    {[['short','短句'],['medium','中等'],['long','偏长']].map(([id,title]) => <button key={id} type="button" onClick={() => setTypingLength(id)} className={"px-2.5 py-1.5 rounded-full border text-[8.5px] " + (typingLength === id ? 'bg-[#f7eef0] border-[#d4aab5] text-[#8c5f6b]' : 'bg-[#fafafa] border-[#eee] text-[#777]')}>{title}</button>)}
                  </div>
                </div>
                <div>
                  <div className="text-[9.5px] font-medium text-[#666] mb-1.5">语气词</div>
                  <div className="flex flex-wrap gap-1.5">
                    {[['none','基本不用'],['natural','自然使用'],['often','喜欢用“嗯、啊、诶、嘛”等']].map(([id,title]) => <button key={id} type="button" onClick={() => setTypingFillers(id)} className={"px-2.5 py-1.5 rounded-full border text-[8.5px] " + (typingFillers === id ? 'bg-[#f7eef0] border-[#d4aab5] text-[#8c5f6b]' : 'bg-[#fafafa] border-[#eee] text-[#777]')}>{title}</button>)}
                  </div>
                </div>
                <div>
                  <div className="text-[9.5px] font-medium text-[#666] mb-1.5">断句习惯</div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      ['natural','自然断句'],
                      ['space','用空格连接'],
                      ['line','分行断句'],
                      ['short-pause','短句多断'],
                      ['long-pause','长句少断'],
                    ].map(([id,title]) => (
                      <button key={id} type="button" onClick={() => setTypingSentenceBreak(id)} className={"px-2.5 py-1.5 rounded-full border text-[8.5px] " + (typingSentenceBreak === id ? 'bg-[#f7eef0] border-[#d4aab5] text-[#8c5f6b]' : 'bg-[#fafafa] border-[#eee] text-[#777]')}>{title}</button>
                    ))}
                  </div>
                  <div className="text-[8px] text-[#aaa] mt-1">控制一句话内部怎么断开，例如“嗯 我知道了”或“嗯，\n我知道了”。</div>
                </div>
                                <div className="text-[8.5px] leading-relaxed text-[#aaa]">这些只控制“怎么打字”，不会改变角色性格、世界书和剧情。</div>
              </div>
            </details>

            <details className="bg-white rounded-[14px] border border-[#f0f0f1] overflow-hidden">
              <summary className="list-none cursor-pointer p-3.5 flex items-center justify-between">
                <div><div className="font-medium text-[#333]">语言与时间</div><div className="text-[10px] text-[#999]">控制双语输出、聊天时间和角色的时间感</div></div>
                <span className="text-[10px] text-[#aaa]">可自定义</span>
              </summary>
              <div className="px-3.5 pb-3.5 space-y-3">
                <div><div className="text-[9.5px] font-medium text-[#666] mb-1.5">双语模式</div>
                  <div className="flex gap-1.5">
                    {[
                      ['off', '关闭'],
                      ['auto', '自动双语'],
                    ].map(([id, title]) => <button key={id} type="button" onClick={() => setBilingualMode(id as 'off' | 'auto')} className={"px-3 py-1.5 rounded-full border text-[8.5px] " + (bilingualMode === id ? 'bg-[#f7eef0] border-[#d4aab5] text-[#8c5f6b]' : 'bg-[#fafafa] border-[#eee] text-[#777]')}>{title}</button>)}
                  </div>
                  <div className="text-[8px] text-[#aaa] mt-1">普通话/国语/简体中文/繁体中文保持中文；其他主要语言自动附自然中文对应。</div>
                </div>
                <div><div className="text-[9.5px] font-medium text-[#666] mb-1.5">聊天时间</div>
                  <div className="flex gap-1.5">
                    {[
                      ['current', '跟随现在的时间'],
                      ['virtual', '使用虚拟时间'],
                    ].map(([id, title]) => <button key={id} type="button" onClick={() => setChatTimeMode(id as 'current' | 'virtual')} className={"px-3 py-1.5 rounded-full border text-[8.5px] " + (chatTimeMode === id ? 'bg-[#f7eef0] border-[#d4aab5] text-[#8c5f6b]' : 'bg-[#fafafa] border-[#eee] text-[#777]')}>{title}</button>)}
                  </div>
                  {chatTimeMode === 'virtual' && <input type="datetime-local" value={virtualChatTime} onChange={(e) => setVirtualChatTime(e.target.value)} className="mt-2 w-full px-2.5 py-2 bg-[#fafafa] border border-[#eee] rounded-xl text-[10px] text-[#555] outline-none" />}
                </div>
                <div>
                  <div className="text-[9.5px] font-medium text-[#666] mb-1.5">消息时区</div>
                  <select value={chatTimezone} onChange={(e) => setChatTimezone(e.target.value)} className="w-full px-2.5 py-2 bg-[#fafafa] border border-[#eee] rounded-xl text-[10px] text-[#555] outline-none">
                    {[
                      ['Asia/Shanghai', '中国 / 上海（UTC+8）'],
                      ['Asia/Tokyo', '日本 / 东京（UTC+9）'],
                      ['Asia/Seoul', '韩国 / 首尔（UTC+9）'],
                      ['Europe/London', '英国 / 伦敦'],
                      ['Europe/Paris', '欧洲中部 / 巴黎'],
                      ['America/Los_Angeles', '美国 / 洛杉矶'],
                      ['America/New_York', '美国 / 纽约'],
                      ['Australia/Sydney', '澳大利亚 / 悉尼'],
                      ['UTC', 'UTC'],
                    ].map(([id, title]) => <option key={id} value={id}>{title}</option>)}
                  </select>
                  <div className="text-[8px] text-[#aaa] mt-1">消息时间与日期分隔会按所选时区显示。</div>
                  <div className="text-[9.5px] font-medium text-[#666] mt-3 mb-1.5">时间与日期语言</div>
                  <div className="flex gap-1.5">
                    {([
                      ['zh-CN', '中文 · 上午 10:32'],
                      ['en-US', 'English · 10:32 AM'],
                    ] as const).map(([locale, label]) => (
                      <button key={locale} type="button" onClick={() => setLineTimeDisplayLocale(locale)} className={"px-3 py-1.5 rounded-full border text-[8.5px] " + (lineTimeDisplayLocale === locale ? 'bg-[#f7eef0] border-[#d4aab5] text-[#8c5f6b]' : 'bg-[#fafafa] border-[#eee] text-[#777]')}>{label}</button>
                    ))}
                  </div>
                  <div className="text-[8px] text-[#aaa] mt-1">只切换时间和日期文字，不会改变聊天正文语言。</div>
                </div>
                <div className="border-t border-[#f2f2f3] pt-3">
                  <div className="text-[9.5px] font-medium text-[#666] mb-1">角色现实地区</div>
                  <div className="text-[8px] text-[#aaa] leading-relaxed mb-2">给角色一个现实世界中的地区。系统会用真实地理位置查询当地天气，角色可以知道“自己那里”现在是什么天气。</div>
                  <div className="flex gap-2">
                    <input
                      value={characterRegion}
                      onChange={(e) => setCharacterRegion(e.target.value)}
                      placeholder="例如 London / Tokyo / 上海"
                      className="min-w-0 flex-1 px-2.5 py-2 bg-[#fafafa] border border-[#eee] rounded-xl text-[10px] text-[#555] outline-none"
                    />
                    <button
                      type="button"
                      disabled={characterWeatherBusy || !characterRegion.trim()}
                      onClick={async () => {
                        setCharacterWeatherBusy(true);
                        const weather = await fetchLineWeather(characterRegion);
                        if (weather) setCharacterWeather(weather);
                        setCharacterWeatherBusy(false);
                      }}
                      className="px-3 rounded-xl bg-[#292724] text-white text-[9px] disabled:opacity-40"
                    >{characterWeatherBusy ? '查询中…' : '查天气'}</button>
                  </div>
                  {characterWeather && <div className="mt-2 p-2.5 rounded-xl bg-[#f7eef0] border border-[#f0dee3] text-[8.5px] text-[#8c5f6b]">📍 {formatLineWeather(characterWeather)}</div>}
                </div>

                <div>
                  <div className="text-[9.5px] font-medium text-[#666] mb-1.5">角色语言</div>
                  <select value={characterLanguage} onChange={(e) => setCharacterLanguage(e.target.value)} className="w-full px-2.5 py-2 bg-[#fafafa] border border-[#eee] rounded-xl text-[10px] text-[#555] outline-none">
                    {[
                      ['auto', '自动 / 跟随角色卡'],
                      ['zh-CN', '中文（简体）'],
                      ['zh-TW', '中文（繁体）'],
                      ['en', 'English'],
                      ['ja', '日本語'],
                      ['ko', '한국어'],
                      ['fr', 'Français'],
                      ['de', 'Deutsch'],
                      ['es', 'Español'],
                      ['it', 'Italiano'],
                      ['ru', 'Русский'],
                    ].map(([id, title]) => <option key={id} value={id}>{title}</option>)}
                  </select>
                  <div className="text-[8px] text-[#aaa] mt-1">这是角色主要聊天语言，会进入 AI 上下文；双语模式仍按上面的规则工作。</div>
                </div>
                <div className="border-t border-[#f2f2f3] pt-3">
                  <div className="text-[9.5px] font-medium text-[#666] mb-1">角色时间感</div>
                  <div className="text-[8px] text-[#aaa] leading-relaxed mb-2">这里控制的是“角色会不会在意你隔了多久才回复”，不是让角色机械计算现实时间。</div>
                  <div className="space-y-1.5">
                    {[
                      ['low', '不在意', '基本不关心你多久没回复。长时间消失也不会自动产生“你怎么不回我”的情绪；你回来后，通常自然继续聊天。'],
                      ['natural', '自然感知（默认）', '几分钟、十几分钟不回完全正常。一天、几天甚至更久的失联，可以根据角色性格、关系和情境自然产生想念、担心、失望、委屈或生气；不设“超过 X 分钟就触发”的死规则。'],
                      ['high', '高度在意', '角色很重视联系。长期失联可以明显影响情绪，你回来后甚至可能保持一段时间的冷淡、委屈或生气；但依然不能机械计时、催促或反复算账。'],
                    ].map(([id, title, description]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setCharacterTimeSensitivity(id as 'low' | 'natural' | 'high')}
                        className={"w-full text-left p-2.5 rounded-xl border transition-colors " + (characterTimeSensitivity === id ? 'bg-[#faf1f3] border-[#d4aab5]' : 'bg-[#fafafa] border-[#eee] hover:border-[#e5d9dc]')}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className={"text-[9.5px] font-semibold " + (characterTimeSensitivity === id ? 'text-[#8c5f6b]' : 'text-[#444]')}>{title}</div>
                          <span className={"shrink-0 w-2 h-2 rounded-full " + (characterTimeSensitivity === id ? 'bg-[#c48f9d]' : 'bg-[#d8d8da')} />
                        </div>
                        <div className="text-[8.5px] text-[#777] leading-relaxed mt-1">{description}</div>
                      </button>
                    ))}
                  </div>
                  <div className="mt-2.5 p-2.5 rounded-xl bg-[#faf8f9] border border-[#f0e4e7]">
                    <div className="text-[9px] font-semibold text-[#8c5f6b]">共同底层规则</div>
                    <div className="text-[8.5px] text-[#777] leading-relaxed mt-1">
                      时间可以影响角色的情绪，但时间本身不能变成角色反复算账的话题。禁止“你 3 分钟没回我”“你消失了 2 小时 17 分钟”“我等了你 721 分钟”，也禁止每隔几分钟催促、把普通聊天断档都当成剧情事件。
                    </div>
                  </div>
                </div>
              </div>
            </details>
            <details className="bg-white rounded-[14px] border border-[#f0f0f1] overflow-hidden">
              <summary className="list-none cursor-pointer p-3.5 flex items-center justify-between">
                <div><div className="font-medium text-[#333]">AI 行为规则</div><div className="text-[10px] text-[#999]">逐条控制角色的真人感，不是固定模板</div></div>
                <span className="text-[10px] text-[#aaa]">可单独开启</span>
              </summary>
              <div className="px-3.5 pb-3.5 space-y-2">
                <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-[#fafafa]">
                  <div><div className="text-[9.5px] font-medium text-[#444]">自然称呼</div><div className="text-[8px] text-[#aaa] mt-0.5">普通聊天不机械喊名字。</div></div>
                  <button type="button" onClick={() => setNaturalAddressing(!naturalAddressing)} className="shrink-0 w-10 h-6 rounded-full relative shrink-0 p-0.5 border border-black/5 shadow-inner cursor-pointer transition-colors duration-200 relative transition-colors" style={{ backgroundColor: naturalAddressing ? '#d4aab5' : '#ddd' }} aria-label="自然称呼开关"><span className="absolute top-0.5 block w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 left-0.5 transition-transform duration-200 transition-transform" style={{ transform: `translateX(${naturalAddressing ? 16 : 0}px)` }} /></button>
                </div>

                <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-[#fafafa]">
                  <div><div className="text-[9.5px] font-medium text-[#444]">称呼稳定</div><div className="text-[8px] text-[#aaa] mt-0.5">不随机发明一堆外号，已有称呼保持稳定。</div></div>
                  <button type="button" onClick={() => setStableNicknames(!stableNicknames)} className="shrink-0 w-10 h-6 rounded-full relative shrink-0 p-0.5 border border-black/5 shadow-inner cursor-pointer transition-colors duration-200 relative transition-colors" style={{ backgroundColor: stableNicknames ? '#d4aab5' : '#ddd' }} aria-label="称呼稳定开关"><span className="absolute top-0.5 block w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 left-0.5 transition-transform duration-200 transition-transform" style={{ transform: `translateX(${stableNicknames ? 16 : 0}px)` }} /></button>
                </div>

                <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-[#fafafa]">
                  <div><div className="text-[9.5px] font-medium text-[#444]">关系语境称呼</div><div className="text-[8px] text-[#aaa] mt-0.5">根据关系判断“老公/老婆/哥哥”等称呼是否自然。</div></div>
                  <button type="button" onClick={() => setRelationshipAwareAddressing(!relationshipAwareAddressing)} className="shrink-0 w-10 h-6 rounded-full relative shrink-0 p-0.5 border border-black/5 shadow-inner cursor-pointer transition-colors duration-200 relative transition-colors" style={{ backgroundColor: relationshipAwareAddressing ? '#d4aab5' : '#ddd' }} aria-label="关系语境称呼开关"><span className="absolute top-0.5 block w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 left-0.5 transition-transform duration-200 transition-transform" style={{ transform: `translateX(${relationshipAwareAddressing ? 16 : 0}px)` }} /></button>
                </div>

                <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-[#fafafa]">
                  <div><div className="text-[9.5px] font-medium text-[#444]">角色自主判断</div><div className="text-[8px] text-[#aaa] mt-0.5">反应来自角色自己，不套统一 AI 模板。</div></div>
                  <button type="button" onClick={() => setCharacterAutonomy(!characterAutonomy)} className="shrink-0 w-10 h-6 rounded-full relative shrink-0 p-0.5 border border-black/5 shadow-inner cursor-pointer transition-colors duration-200 relative transition-colors" style={{ backgroundColor: characterAutonomy ? '#d4aab5' : '#ddd' }} aria-label="角色自主判断开关"><span className="absolute top-0.5 block w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 left-0.5 transition-transform duration-200 transition-transform" style={{ transform: `translateX(${characterAutonomy ? 16 : 0}px)` }} /></button>
                </div>

                <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-[#fafafa]">
                  <div><div className="text-[9.5px] font-medium text-[#444]">避免重复称呼</div><div className="text-[8px] text-[#aaa] mt-0.5">不连续重复名字、外号、固定称呼和句式。</div></div>
                  <button type="button" onClick={() => setAvoidRepetition(!avoidRepetition)} className="shrink-0 w-10 h-6 rounded-full relative shrink-0 p-0.5 border border-black/5 shadow-inner cursor-pointer transition-colors duration-200 relative transition-colors" style={{ backgroundColor: avoidRepetition ? '#d4aab5' : '#ddd' }} aria-label="避免重复称呼开关"><span className="absolute top-0.5 block w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 left-0.5 transition-transform duration-200 transition-transform" style={{ transform: `translateX(${avoidRepetition ? 16 : 0}px)` }} /></button>
                </div>

                <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-[#fafafa]">
                  <div><div className="text-[9.5px] font-medium text-[#444]">情绪自然延续</div><div className="text-[8px] text-[#aaa] mt-0.5">情绪可以持续，但不会每句话都翻旧账。</div></div>
                  <button type="button" onClick={() => setEmotionContinuity(!emotionContinuity)} className="shrink-0 w-10 h-6 rounded-full relative shrink-0 p-0.5 border border-black/5 shadow-inner cursor-pointer transition-colors duration-200 relative transition-colors" style={{ backgroundColor: emotionContinuity ? '#d4aab5' : '#ddd' }} aria-label="情绪自然延续开关"><span className="absolute top-0.5 block w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 left-0.5 transition-transform duration-200 transition-transform" style={{ transform: `translateX(${emotionContinuity ? 16 : 0}px)` }} /></button>
                </div>

              </div>
            </details>
            <details className="bg-white rounded-[14px] border border-[#f0f0f1] overflow-hidden">
              <summary className="list-none cursor-pointer p-3.5 flex items-center justify-between">
                <div><div className="font-medium text-[#333]">主动行为日程</div><div className="text-[10px] text-[#999]">在这里安排主动消息、VROOM 和线下邀约</div></div>
                <span className="text-[10px] text-[#aaa]">展开</span>
              </summary>
              <div className="px-3.5 pb-3.5">
                <button type="button" onClick={() => setShowScheduleModal(true)} className="w-full py-2.5 rounded-xl bg-[#faf1f3] border border-[#f0dee3] text-[10px] text-[#8c5f6b] font-medium">
                  打开主动行为日程
                </button>
                <div className="mt-2 text-[9px] text-[#aaa]">当前聊天已有 {scheduleList.length} 项安排 · 每项会读取上方的角色行为权限。</div>
              </div>
            </details>

            {/* Section -1: 聊天偏好 (置顶 / 免打扰 / 背景 / 收藏 / 导出) */}
            <details open={false} className="bg-white rounded-[14px] border border-[#f0f0f1] overflow-hidden">
              <summary className="list-none cursor-pointer p-3.5 flex items-center justify-between"><div className="font-medium text-[#333]">聊天偏好</div><span className="text-[10px] text-[#aaa]">展开</span></summary>
              <div className="p-3.5 space-y-3">
              {/* 置顶聊天 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Pin className="w-4 h-4 text-[#ae7e89]" />
                  <span className="text-[#333] font-medium">置顶聊天</span>
                </div>
                <div
                  onClick={() => {
                    const next = !localPinned;
                    setLocalPinned(next);
                    onTogglePin?.();
                    showToast(next ? '已置顶该聊天 📌' : '已取消置顶');
                  }}
                  className={`w-9 h-5 rounded-full relative cursor-pointer transition-colors ${
                    localPinned ? 'bg-[#d4aab5]' : 'bg-[#ddd]'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
                      localPinned ? 'left-4.5' : 'left-0.5'
                    }`}
                  />
                </div>
              </div>

              {/* 消息免打扰 */}
              <div className="flex items-center justify-between border-t border-[#f2f2f3] pt-2.5">
                <div className="flex items-center gap-2">
                  <BellOff className="w-4 h-4 text-[#888]" />
                  <span className="text-[#333] font-medium">消息免打扰</span>
                </div>
                <div
                  onClick={() => {
                    const next = !localMuted;
                    setLocalMuted(next);
                    onToggleMute?.();
                    showToast(next ? '已开启消息免打扰 🔕' : '已恢复新消息提醒');
                  }}
                  className={`w-9 h-5 rounded-full relative cursor-pointer transition-colors ${
                    localMuted ? 'bg-[#d4aab5]' : 'bg-[#ddd]'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
                      localMuted ? 'left-4.5' : 'left-0.5'
                    }`}
                  />
                </div>
              </div>

              {/* 聊天背景壁纸快速切换 */}
              <div className="border-t border-[#f2f2f3] pt-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[#333] font-medium">更换聊天背景</span>
                  <span className="text-[10px] text-[#aaa]">点击即时生效</span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center text-[10.5px]">
                  {[
                    { id: 'pure-white', label: '纯白极简', bg: '#ffffff', border: '#e8e8e9' },
                    { id: 'warm-light', label: '温润米纸', bg: '#fbf8f5', border: '#e6ded4' },
                    { id: 'tokyo-rain', label: '东京雨夜', bg: '#f2f4f8', border: '#d9e0ea' },
                    { id: 'rose-mist', label: '玫瑰暮色', bg: '#faf4f6', border: '#f0dee3' },
                  ].map((wp) => (
                    <button
                      key={wp.id}
                      onClick={() => {
                        setCurrentWallpaper(wp.id as any);
                        showToast(`已更换背景：${wp.label}`);
                      }}
                      style={{ backgroundColor: wp.bg, borderColor: currentWallpaper === wp.id ? '#d4aab5' : wp.border }}
                      className={`py-2 rounded-[10px] border flex flex-col items-center gap-1 cursor-pointer transition-all ${
                        currentWallpaper === wp.id ? 'ring-2 ring-[#d4aab5] font-semibold text-[#8c5f6b]' : 'text-[#666]'
                      }`}
                    >
                      <span>{wp.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 查看我的收藏箱 */}
              <div
                onClick={() => {
                  setShowSettings(false);
                  setShowFavoritesModal(true);
                }}
                className="border-t border-[#f2f2f3] pt-2.5 flex items-center justify-between cursor-pointer hover:bg-neutral-50 px-1 py-1 rounded"
              >
                <div className="flex items-center gap-2 text-[#333]">
                  <Bookmark className="w-4 h-4 text-[#ae7e89]" />
                  <span>我的收藏箱 ({favorites.length})</span>
                </div>
                <span className="text-[10px] text-[#aaa]">查看收藏 ›</span>
              </div>

              {/* 导出当前聊天记录 */}
              <div
                onClick={handleExportChat}
                className="border-t border-[#f2f2f3] pt-2.5 flex items-center justify-between cursor-pointer hover:bg-neutral-50 px-1 py-1 rounded"
              >
                <div className="flex items-center gap-2 text-[#333]">
                  <FileDown className="w-4 h-4 text-[#555]" />
                  <span>导出聊天记录备份</span>
                </div>
                <span className="text-[10px] text-[#ae7e89]">导出 .txt ›</span>
              </div>
              </div>
            </details>
            
            {/* Section -0.5: 聊天显示与工具 */}
            <details open={false} className="bg-white rounded-[14px] border border-[#f0f0f1] overflow-hidden">
              <summary className="list-none cursor-pointer p-3.5 flex items-center justify-between"><div className="font-medium text-[#333]">聊天显示与工具</div><span className="text-[10px] text-[#aaa]">展开</span></summary>
              <div className="p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-[#ae7e89]" />
                  <div>
                    <div className="text-[#333] font-medium">显示我的头像</div>
                    <div className="text-[10px] text-[#aaa]">显示在我发送的消息右侧</div>
                  </div>
                </div>
                <button type="button" onClick={() => setShowMyAvatar(!showMyAvatar)} className={`w-9 h-5 rounded-full relative cursor-pointer transition-colors ${showMyAvatar ? 'bg-[#d4aab5]' : 'bg-[#ddd]'}`} aria-label="切换我的头像显示">
                  <span className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${showMyAvatar ? 'left-4.5' : 'left-0.5'}`} />
                </button>
              </div>
              <div onClick={() => setShowInChatSearch(!showInChatSearch)} className="border-t border-[#f2f2f3] pt-2.5 flex items-center justify-between cursor-pointer hover:bg-neutral-50 px-1 py-1 rounded">
                <div className="flex items-center gap-2 text-[#333]">
                  <Search className="w-4 h-4 text-[#888]" />
                  <div>
                    <div className="font-medium">搜索聊天记录</div>
                    <div className="text-[10px] text-[#aaa]">在当前对话中查找文字</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#bbb]" />
              </div>
              {!isGroup && characterId && (
                <div onClick={() => { setShowSettings(false); try { window.localStorage.setItem('phone:memory-active-character', characterId); } catch {} onNavigateScreen?.('memory'); }} className="border-t border-[#f2f2f3] pt-2.5 flex items-center justify-between cursor-pointer hover:bg-neutral-50 px-1 py-1 rounded">
                  <div className="flex items-center gap-2 text-[#333]">
                    <Brain className="w-4 h-4 text-[#8b7560]" />
                    <div>
                      <div className="font-medium">记忆与长期关系</div>
                      <div className="text-[10px] text-[#aaa]">查看这个角色的长期记忆</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#bbb]" />
                </div>
              )}
              </div>
            </details>

            {/* Generation / 回复表现 */}
            <details open className="bg-white rounded-[16px] border border-[#eceaec] overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <summary className="list-none cursor-pointer px-4 py-3.5 flex items-center justify-between select-none">
                <div className="flex items-center gap-2">
                  <Brain className="w-[17px] h-[17px] text-[#ad7b88]" />
                  <span className="text-[13px] font-semibold tracking-[-0.01em] text-[#303033]">回复表现 / 预设流程</span>
                </div>
                <span className="text-[10px] text-[#aaa]">展开</span>
              </summary>

              <div className="px-4 pb-4">
                {/* 预设规则始终参与生成；此处只展示当前生效项 */}
                <div className="py-3">
                  <div className="text-[12px] font-semibold text-[#353438]">当前生成预设</div>
                  <div className="mt-1 text-[11px] font-medium text-[#9d6e7b]">{getActivePromptPreset(isGroup ? 'group' : 'single')?.name || '默认预设'}</div>
                  <div className="mt-1 text-[9.5px] leading-[1.45] text-[#a2a0a4]">
                    当前分类的已启用条目会直接注入角色回复。展开 / 折叠只控制下方摘要的显示，不会关闭预设。
                  </div>
                </div>

                <div className="flex items-center justify-between py-3 border-t border-[#eee8e6]">
                  <div className="min-w-0 pr-4">
                    <div className="text-[12px] font-semibold text-[#353438]">在聊天里显示预设流程</div>
                    <div className="mt-1 text-[9.5px] leading-[1.45] text-[#a2a0a4]">
                      开启后，角色回复上方会出现可折叠的预设流程摘要；关闭只是不显示，不影响预设规则执行。
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showChainOfThoughtInChat}
                    aria-label={showChainOfThoughtInChat ? '关闭聊天内预设流程显示' : '开启聊天内预设流程显示'}
                    onClick={() => setShowChainOfThoughtInChat(!showChainOfThoughtInChat)}
                    className="relative w-11 h-6 shrink-0 rounded-full p-0.5 border border-black/[0.04] shadow-inner transition-colors duration-200 focus:outline-none"
                    style={{ backgroundColor: showChainOfThoughtInChat ? '#d5aab6' : '#dedee1' }}
                  >
                    <span
                      className="absolute top-[2px] left-[2px] block w-5 h-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.16)] transition-transform duration-200"
                      style={{ transform: showChainOfThoughtInChat ? 'translateX(20px)' : 'translateX(0)' }}
                    />
                  </button>
                </div>

                {/* 当前生成预设 */}
                <button
                  type="button"
                  onClick={() => {
                    setShowSettings(false);
                    onNavigateScreen?.('group-presets');
                  }}
                  className="w-full text-left rounded-[13px] border border-[#eee3e6] bg-[#fcf8f9] px-3.5 py-3 flex items-center justify-between gap-3 transition-colors hover:bg-[#faf3f5]"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-[#9d6e7b]">预设工坊</div>
                    <div className="mt-1 text-[12px] font-medium text-[#4a4144] truncate">
                      {activeCotPreset?.title || '默认预设'}
                    </div>
                    <div className="mt-1 text-[9px] text-[#aaa]">
                      点击进入预设工坊，编辑实际生成规则
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 shrink-0 text-[#b6a4aa]" />
                </button>

                {/* 回复细节 */}
                <div className="mb-2 rounded-[13px] border border-[#eee3e6] bg-[#fcf8f9] px-3.5 py-3">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 pr-4">
                      <div className="text-[12px] font-semibold text-[#353438]">一次性回复条数</div>
                      <div className="mt-1 text-[9.5px] leading-[1.45] text-[#a2a0a4]">控制角色这一轮连续发送多少条 LINE 消息</div>
                    </div>
                    <button type="button" role="switch" aria-checked={replyCountEnabled}
                      onClick={() => setReplyCountEnabled(!replyCountEnabled)}
                      className="relative w-11 h-6 shrink-0 rounded-full p-0.5 border border-black/[0.04] shadow-inner transition-colors"
                      style={{ backgroundColor: replyCountEnabled ? '#d5aab6' : '#dedee1' }}>
                      <span className="absolute top-[2px] left-[2px] block w-5 h-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.16)] transition-transform"
                        style={{ transform: replyCountEnabled ? 'translateX(20px)' : 'translateX(0)' }} />
                    </button>
                  </div>
                  {replyCountEnabled && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <label className="rounded-[11px] bg-white border border-[#eee3e6] p-2.5">
                        <div className="text-[9px] text-[#aaa] mb-1">最少</div>
                        <select value={replyCountMin} onChange={e => {
                          const n = Math.min(5, Math.max(1, Number(e.target.value)));
                          setReplyCountMin(n);
                          if (replyCountMax < n) setReplyCountMax(n);
                        }} className="w-full bg-transparent outline-none text-[12px] text-[#444]">
                          {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} 句</option>)}
                        </select>
                      </label>
                      <label className="rounded-[11px] bg-white border border-[#eee3e6] p-2.5">
                        <div className="text-[9px] text-[#aaa] mb-1">最多</div>
                        <select value={Math.max(replyCountMin, replyCountMax)} onChange={e => setReplyCountMax(Math.min(8, Math.max(replyCountMin, Number(e.target.value))))}
                          className="w-full bg-transparent outline-none text-[12px] text-[#444]">
                          {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n} disabled={n < replyCountMin}>{n} 句</option>)}
                        </select>
                      </label>
                    </div>
                  )}
                </div>

                <div className="mt-3 border-t border-[#f1f0f1] pt-1">
                  <div className="flex items-center justify-between py-3">
                    <div className="min-w-0 pr-4">
                      <div className="text-[12px] font-semibold text-[#353438]">角色动作描写</div>
                      <div className="mt-1 text-[9.5px] leading-[1.45] text-[#a2a0a4]">
                        与消息正文分开显示，例如“指尖停了一下”
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={lineActionDescriptionsEnabled}
                      aria-label={lineActionDescriptionsEnabled ? '关闭角色动作描写' : '开启角色动作描写'}
                      onClick={() => setLineActionDescriptionsEnabled(!lineActionDescriptionsEnabled)}
                      className="relative w-11 h-6 shrink-0 rounded-full p-0.5 border border-black/[0.04] shadow-inner transition-colors duration-200 focus:outline-none"
                      style={{ backgroundColor: lineActionDescriptionsEnabled ? '#d5aab6' : '#dedee1' }}
                    >
                      <span
                        className="absolute top-[2px] left-[2px] block w-5 h-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.16)] transition-transform duration-200"
                        style={{ transform: lineActionDescriptionsEnabled ? 'translateX(20px)' : 'translateX(0)' }}
                      />
                    </button>
                  </div>

                  <div className="border-t border-[#f3f2f3]" />

                  <div className="flex items-center justify-between py-3">
                    <div className="min-w-0 pr-4">
                      <div className="text-[12px] font-semibold text-[#353438]">禁止编造 User</div>
                      <div className="mt-1 text-[9.5px] leading-[1.45] text-[#a2a0a4]">
                        不替你补台词、动作、表情、想法、决定或未提供的事实
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={preventUserFabrication}
                      aria-label={preventUserFabrication ? '关闭禁止编造 User' : '开启禁止编造 User'}
                      onClick={() => setPreventUserFabrication(!preventUserFabrication)}
                      className="relative w-11 h-6 shrink-0 rounded-full p-0.5 border border-black/[0.04] shadow-inner transition-colors duration-200 focus:outline-none"
                      style={{ backgroundColor: preventUserFabrication ? '#d5aab6' : '#dedee1' }}
                    >
                      <span
                        className="absolute top-[2px] left-[2px] block w-5 h-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.16)] transition-transform duration-200"
                        style={{ transform: preventUserFabrication ? 'translateX(20px)' : 'translateX(0)' }}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </details>

            {/* Section 1: 角色档案与羁绊 OR 群聊专属设定系统 */}
            {isGroup || contactName === '我们的小角落' ? (
              <div className="space-y-1.5">
                <div className="text-[10px] text-[#aaa] font-medium px-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3 text-[#ae7e89]" />
                    <span>当前群聊专属设定与世界书联动</span>
                  </span>
                  <span className="text-[9.5px] text-[#ae7e89] bg-[#faf1f3] px-2 py-0.5 rounded-full font-medium border border-[#f0dee3]">
                    群聊模式已激活
                  </span>
                </div>

                <div className="bg-white rounded-[14px] border border-[#f0f0f1] p-3.5 space-y-3">
                  {/* 群公告与背景 */}
                  <div>
                    <div className="text-[#444] font-medium mb-1">群聊公告与背景设定</div>
                    <textarea
                      value={groupNoticeText}
                      onChange={(e) => setGroupNoticeText(e.target.value)}
                      placeholder="输入当前群聊需要知晓的背景与公告…"
                      className="w-full p-2 bg-[#fafafa] border border-[#e8e8e9] rounded-md text-xs font-sans leading-relaxed resize-none text-[#333]"
                      rows={2}
                    />
                  </div>

                  {/* 群聊人际关系网 */}
                  <div className="border-t border-[#f2f2f3] pt-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-[#444] font-medium">群成员人际关系网 (关系矩阵)</div>
                      <button
                        onClick={handleAiInferGroupRelations}
                        className="text-[10px] text-[#ae7e89] hover:underline flex items-center gap-1 cursor-pointer font-medium"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>AI推演关系网</span>
                      </button>
                    </div>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {groupRelationships.map((rel, idx) => (
                        <div key={idx} className="p-2 bg-[#faf8f9] rounded-lg border border-[#f0e4e7] flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-[#8c5f6b] shrink-0">{rel.from} ➔ {rel.to}:</span>
                          <input
                            value={rel.relation}
                            onChange={(e) => {
                              const val = e.target.value;
                              setGroupRelationships((prev) =>
                                prev.map((r, i) => (i === idx ? { ...r, relation: val } : r))
                              );
                            }}
                            className="bg-transparent text-right outline-none text-[#555] flex-1 ml-2 text-xs truncate"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 群聊独立预设 */}
                  <div className="border-t border-[#f2f2f3] pt-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-[#444] font-medium">群聊预设</div>
                      <span className="text-[8px] text-[#9a6c78] font-mono">{activeGroupPreset.kind === 'online' ? 'ONLINE' : 'OFFLINE'}</span>
                    </div>
                    <select
                      value={groupPresetId}
                      onChange={(e) => setGroupPresetId(e.target.value)}
                      className="w-full p-2 bg-[#fafafa] border border-[#e8e8e9] rounded-[10px] text-[10px] text-[#555] outline-none"
                    >
                      {getGroupPresets().filter(preset => preset.kind === 'online').map(preset => (
                        <option key={preset.id} value={preset.id}>{preset.name}</option>
                      ))}
                    </select>
                    <div className="mt-1.5 text-[9px] text-[#999] leading-relaxed">{activeGroupPreset.description}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="text-[10px] text-[#aaa] font-medium px-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3 text-[#ae7e89]" />
                    <span>角色档案、称呼与羁绊关系</span>
                  </span>
                  <button
                    onClick={() => {
                      setShowSettings(false);
                      setShowCharacterProfile(true);
                    }}
                    className="text-[10px] text-[#ae7e89] hover:underline flex items-center gap-0.5 cursor-pointer font-medium"
                  >
                    <span>查看TA的主页 ›</span>
                  </button>
                </div>
                
                <div className="bg-white rounded-[14px] border border-[#f0f0f1] p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[#444] font-medium">角色名称 / 聊天备注</span>
                    <input
                      value={characterChatNote}
                      onChange={(e) => setCharacterChatNote(e.target.value)}
                      placeholder={characterIdentity}
                      className="p-1 px-2 text-right bg-[#fafafa] border border-[#e8e8e9] rounded-md text-xs w-36 text-[#333]"
                    />
                  </div>

                  <div className="flex items-center justify-between border-t border-[#f2f2f3] pt-2.5">
                    <span className="text-[#444] font-medium">角色生日</span>
                    <input
                      value={characterProfile.birthday}
                      onChange={(e) => setCharacterProfile({ ...characterProfile, birthday: e.target.value })}
                      className="p-1 px-2 text-right bg-[#fafafa] border border-[#e8e8e9] rounded-md text-xs w-44 text-[#333]"
                    />
                  </div>

                  <div className="border-t border-[#f2f2f3] pt-2.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[#444] font-medium">与角色的羁绊关系</span>
                        <span className="text-[9.5px] text-[#aaa] ml-1.5">(自己填写或让角色更新)</span>
                      </div>
                      <button
                        onClick={handleAiUpdateCharacterJudgment}
                        className="text-[10px] text-[#ae7e89] hover:underline flex items-center gap-1 cursor-pointer font-medium"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>让角色判断关系</span>
                      </button>
                    </div>
                    <input
                      value={characterProfile.relationship}
                      onChange={(e) => setCharacterProfile({ ...characterProfile, relationship: e.target.value })}
                      placeholder="如：暗恋未满 · 彼此在意的挚友"
                      className="w-full p-2 bg-[#fafafa] border border-[#e8e8e9] rounded-md text-xs text-[#333]"
                    />
                  </div>

                  <div className="flex items-center justify-between border-t border-[#f2f2f3] pt-2.5">
                    <div>
                      <div className="font-medium text-[#333]">角色自主判断关系</div>
                      <div className="text-[10px] text-[#aaa]">由角色根据自己的性格、聊天、记忆与剧情判断你们的关系，不由系统自动替换</div>
                    </div>
                    <div
                      onClick={() =>
                        setCharacterProfile({
                          ...characterProfile,
                          canCharacterSelfJudge: !characterProfile.canCharacterSelfJudge,
                        })
                      }
                      className={`w-9 h-5 rounded-full relative cursor-pointer transition-colors ${
                        characterProfile.canCharacterSelfJudge ? 'bg-[#d4a3ad]' : 'bg-[#ddd]'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
                          characterProfile.canCharacterSelfJudge ? 'left-4.5' : 'left-0.5'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-[#f2f2f3] pt-2.5">
                    <div>
                      <div className="font-medium text-[#333]">角色行为权限</div>
                      <div className="text-[10px] text-[#aaa]">允许角色在关系恶化或剧情条件满足时拉黑你</div>
                    </div>
                    <div
                      onClick={() => setCharacterProfile({ ...characterProfile, canBlockUser: !characterProfile.canBlockUser })}
                      className={`w-9 h-5 rounded-full relative cursor-pointer transition-colors ${characterProfile.canBlockUser ? 'bg-[#d4a3ad]' : 'bg-[#ddd]'}`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${characterProfile.canBlockUser ? 'left-4.5' : 'left-0.5'}`} />
                    </div>
                  </div>
                  <div className="border-t border-[#f2f2f3] pt-2.5 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-[#333]">当前拉黑状态</div>
                      <div className="text-[10px] text-[#aaa]">{characterProfile.isBlockedByCharacter ? '你目前无法向 TA 发送消息' : '正常联系中'}</div>
                    </div>
                    <button
                      onClick={() => {
                        const next = !characterProfile.isBlockedByCharacter;
                        setCharacterProfile({ ...characterProfile, isBlockedByCharacter: next });
                        showToast(next ? '已模拟角色拉黑你' : '已解除拉黑');
                      }}
                      className={`px-3 py-1.5 rounded-full text-[10px] ${characterProfile.isBlockedByCharacter ? 'bg-[#292724] text-white' : 'bg-[#f3f3f4] text-[#555]'}`}
                    >
                      {characterProfile.isBlockedByCharacter ? '解除拉黑' : '拉黑我'}
                    </button>
                  </div>

                  <div className="border-t border-[#f2f2f3] pt-2.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[#444] font-medium">角色对我的称呼</span>
                        <span className="text-[9.5px] text-[#aaa] ml-1.5">(由角色自己形成，不使用模板)</span>
                      </div>
                      <button
                        onClick={handleAiUpdateCharacterJudgment}
                        className="text-[10px] text-[#ae7e89] hover:underline flex items-center gap-1 cursor-pointer font-medium"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>让角色判断称呼</span>
                      </button>
                    </div>
                    <input
                      value={characterProfile.callMe}
                      onChange={(e) => setCharacterProfile({ ...characterProfile, callMe: e.target.value })}
                      placeholder="尚未形成专属称呼，由角色自己判断"
                      className="w-full p-2 bg-[#fafafa] border border-[#e8e8e9] rounded-md text-xs text-[#333]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Section 2: 世界书选择 (Lorebook) */}
            <details open={showWorldbookSettings} onToggle={(e) => setShowWorldbookSettings((e.currentTarget as HTMLDetailsElement).open)} className="bg-white rounded-[14px] border border-[#f0f0f1] overflow-hidden">
              <summary className="list-none cursor-pointer p-3 flex items-center justify-between"><div className="flex items-center gap-1.5 text-[10px] font-medium text-[#555]"><BookOpen className="w-3 h-3 text-[#ae7e89]" />世界书设定</div><span className="text-[9px] text-[#aaa]">{showWorldbookSettings ? '收起' : '展开'}</span></summary>
              <div className="px-3 pb-3"><div className="space-y-1.5">
              <div className="text-[10px] text-[#aaa] font-medium px-1 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <BookOpen className="w-3 h-3 text-[#ae7e89]" />
                  <span>世界书设定 (World Info)</span>
                </span>
                <button
                  onClick={() => setShowLorebookInspector(!showLorebookInspector)}
                  className="text-[#ae7e89] hover:underline cursor-pointer"
                >
                  {showLorebookInspector ? '收起条目' : '查看条目关键词'}
                </button>
              </div>

              <div className="bg-white rounded-[14px] border border-[#f0f0f1] p-3 space-y-2">
                <select
                  value={isGroup ? groupLorebookActive : selectedWorldBookId}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (isGroup) setGroupLorebookActive(val);
                    else setSelectedWorldBookId(val);
                  }}
                  className="w-full p-2 bg-[#f8f8fa] border border-[#e8e8e9] rounded-[10px] text-xs outline-none text-[#333]"
                >
                  <option value="all">全部启用世界书</option>
                  <option value="none">不使用世界书</option>
                  {worldbooks.filter(book => book.enabled).map((book) => (
                    <option key={book.id} value={book.id}>
                      {book.name} ({book.entries.filter(entry => entry.enabled).length} 条目)
                    </option>
                  ))}
                </select>

                {showLorebookInspector && (
                  <div className="p-2.5 bg-[#faf8f9] rounded-[10px] border border-[#f0e4e7] space-y-2 animate-in fade-in">
                    <div className="font-semibold text-[11px] text-[#333]">世界书条目 · 单独启用</div>
                    <div className="text-[9px] text-[#999]">和酒馆一样：先选择世界书，再单独勾选这本书里的条目。未勾选的条目不会进入本次聊天上下文。</div>
                    {(selectedWorldBookId === 'all' ? worldbooks : selectedWorldBookId === 'none' ? [] : worldbooks.filter(book => book.id === selectedWorldBookId))
                      .filter(book => book.enabled)
                      .map(book => {
                        const selected = selectedWorldBookEntries[book.id];
                        const allEntries = book.entries;
                        const allChecked = selected === undefined
                          ? allEntries.every(entry => entry.enabled)
                          : selected.length === allEntries.length;
                        return (
                          <div key={book.id} className="bg-white rounded-[10px] border border-[#eee] p-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-[10px] font-semibold text-[#444] truncate">{book.name}</div>
                              <button
                                onClick={() => setSelectedWorldBookEntries(prev => ({ ...prev, [book.id]: allChecked ? allEntries.map(e => e.id) : [] }))}
                                className="text-[9px] text-[#ae7e89] shrink-0"
                              >{allChecked ? '取消全选' : '全选条目'}</button>
                            </div>
                            <div className="mt-1.5 space-y-1">
                              {allEntries.map(entry => {
                                const checked = selected === undefined ? entry.enabled : selected.includes(entry.id);
                                return (
                                  <label key={entry.id} className="flex items-start gap-2 p-1.5 rounded-lg hover:bg-[#faf7f8] cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => {
                                        const next = checked
                                          ? (selected === undefined ? allEntries.filter(item => item.id !== entry.id).map(item => item.id) : selected.filter(id => id !== entry.id))
                                          : [...(selected || []), entry.id];
                                        setSelectedWorldBookEntries(prev => ({ ...prev, [book.id]: next }));
                                      }}
                                      className="mt-0.5 accent-[#ae7e89]"
                                    />
                                    <span className="text-[9px] text-[#555] leading-relaxed">{entry.name}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div></div></details>

            {/* Section 2.4: 角色开场白选择 */}
            {!isGroup && importedCharacter && (() => {
              const greetings = [importedCharacter.firstMessage, ...importedCharacter.alternateGreetings].filter(Boolean);
              const currentOpening = selectedOpeningContext;
              return greetings.length ? (
                <details open={showOpeningSettings} onToggle={(e) => setShowOpeningSettings((e.currentTarget as HTMLDetailsElement).open)} className="bg-white rounded-[14px] border border-[#f0f0f1] overflow-hidden">
                  <summary className="list-none cursor-pointer p-3 flex items-center justify-between"><div className="text-[10px] text-[#555] font-medium">角色开场白</div><span className="text-[9px] text-[#aaa]">{showOpeningSettings ? '收起' : '展开'}</span></summary>
                  <div className="px-3 pb-3">
                  <div className="bg-white rounded-[14px] border border-[#f0f0f1] p-3 space-y-2">
                    <div className="text-[9px] text-[#aaa] leading-relaxed">每条开场白都会完整保留。点击即可展开；选中的内容会作为前情提要提供给 AI。</div>
                    <div className="space-y-2">
                      {greetings.map((greeting, index) => {
                        const selected = currentOpening === greeting;
                        return (
                          <details key={index} className={`rounded-xl border overflow-hidden ${selected ? 'border-[#d4aab5] bg-[#fdf8fa]' : 'border-[#e7e7e8] bg-white'}`}>
                            <summary className="list-none cursor-pointer px-3 py-2.5 flex items-center justify-between">
                              <span className="text-[10px] font-medium text-[#444]">开场白 {index + 1}</span>
                              <span className="text-[8.5px] text-[#aaa]">展开 / 收起</span>
                            </summary>
                            <div className="px-3 pb-3">
                              <div className="text-[9.5px] leading-[1.75] whitespace-pre-wrap break-words text-[#555] max-h-[260px] overflow-y-auto">{greeting}</div>
                              <button
                                type="button"
                                onClick={() => setSelectedOpeningContext(selected ? '' : greeting)}
                                className={`mt-2 w-full py-2 rounded-lg text-[9px] ${selected ? 'bg-[#f0dfe4] text-[#8c5f6b]' : 'bg-[#292724] text-white'}`}
                              >
                                {selected ? '✓ 已作为前情提要' : '设为前情提要'}
                              </button>
                            </div>
                          </details>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedOpeningContext('')}
                      className={`w-full py-2 rounded-lg border text-[9px] ${!currentOpening ? 'border-[#d4aab5] bg-[#faf1f3] text-[#8c5f6b]' : 'border-[#e5e5e6] text-[#777]'}`}
                    >
                      不使用开场白作为前情提要
                    </button>
                  </div>
                  </div>
                </details>
              ) : null;
            })()}

            {/* Section 2.6: HTML 中插 */}
            <div className="space-y-1.5">
              <button onClick={() => setShowHtmlInterludeSettings(value => !value)} className="w-full bg-white rounded-[14px] border border-[#f0f0f1] p-3 flex items-center justify-between text-left">
                <span className="flex items-center gap-1.5 text-[10px] text-[#555] font-medium"><Code className="w-3 h-3 text-[#ae7e89]" />HTML 中插</span>
                <span className="text-[9px] text-[#aaa]">{showHtmlInterludeSettings ? '收起' : '展开设置'}</span>
              </button>
              {showHtmlInterludeSettings && (
                <div className="bg-white rounded-[14px] border border-[#f0f0f1] p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-[11px] text-[#333]">根据剧情随机插入</div>
                      <div className="text-[9px] text-[#aaa] mt-0.5">AI 会根据最近聊天决定这张卡片该写什么</div>
                    </div>
                    <button onClick={() => setHtmlInterludeEnabled(v => !v)} className={`px-2.5 py-1.5 rounded-full text-[9px] ${htmlInterludeEnabled ? 'bg-[#292724] text-white' : 'bg-[#f1f1f2] text-[#777]'}`}>
                      {htmlInterludeEnabled ? '已开启' : '关闭'}
                    </button>
                  </div>
                  <label className="block text-[9px] text-[#888]">
                    出现概率
                    <input type="range" min="0" max="100" value={htmlInterludeChance} onChange={e => setHtmlInterludeChance(Number(e.target.value))} className="w-full mt-2" />
                    <div className="text-right text-[9px] text-[#aaa]">{htmlInterludeChance}%</div>
                  </label>
                  <label className="block text-[9px] text-[#888]">
                    HTML 模板
                    <textarea value={htmlInterludeTemplate} onChange={e => setHtmlInterludeTemplate(e.target.value)} className="w-full h-24 mt-1.5 p-2.5 rounded-lg bg-[#fafafa] border border-[#e8e8e8] text-[9px] font-mono outline-none resize-none" />
                  </label>
                  <div className="text-[8px] leading-relaxed text-[#aaa]">
                    只允许正常 HTML 内容；脚本、事件属性、javascript: 链接等危险内容会被过滤。
                  </div>
                </div>
              )}
            </div>

            {/* Section 2.5: 酒馆状态栏 */}
            <div className="space-y-1.5">
              <button onClick={() => setShowStatusBarSettings(value => !value)} className="w-full bg-white rounded-[14px] border border-[#f0f0f1] p-3 flex items-center justify-between text-left">
                <span className="flex items-center gap-1.5 text-[10px] text-[#555] font-medium"><Sliders className="w-3 h-3 text-[#ae7e89]" />酒馆状态栏</span>
                <span className="text-[9px] text-[#aaa]">{showStatusBarSettings ? '收起' : '展开设置'}</span>
              </button>

              {showStatusBarSettings && (
                <div className="bg-white rounded-[14px] border border-[#f0f0f1] p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-[11px] text-[#333]">回复后生成状态</div>
                      <div className="text-[9px] text-[#aaa] mt-0.5">{statusBarEnabled ? '每次角色回复都会保存一张新的状态快照' : '已关闭，不生成状态栏'}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setStatusBarEnabled(prev => !prev)}
                        className={`px-2.5 py-1.5 rounded-full text-[9px] ${statusBarEnabled ? 'bg-[#292724] text-white' : 'bg-[#f1f1f2] text-[#777]'}`}
                      >
                        {statusBarEnabled ? '已开启' : '已关闭'}
                      </button>
                      <button
                        onClick={() => {
                        const next = !statusBarRandomMode;
                        setStatusBarRandomMode(next);
                        saveStatusBarRandomMode(conversationStorageId, next);
                      }}
                      className={`px-2.5 py-1.5 rounded-full text-[9px] ${statusBarRandomMode ? 'bg-[#292724] text-white' : 'bg-[#f1f1f2] text-[#777]'}`}
                    >
                      {statusBarRandomMode ? '随机选择' : '固定选择'}
                    </button>
                    </div>
                  </div>

                  <div className="rounded-[12px] bg-[#fafafa] border border-[#eee] p-3">
                    <div className="text-[9px] text-[#999] mb-1.5">当前状态栏</div>
                    <select
                      value={activeStatusBarPresetId}
                      onChange={e => setActiveStatusBarPresetId(e.target.value)}
                      className="w-full p-2.5 rounded-lg bg-white border border-[#e8e8e8] text-[10px] outline-none"
                    >
                      {statusBarPresets.filter(preset => preset.targets.includes('line')).map(preset => (
                        <option key={preset.id} value={preset.id}>{preset.name}</option>
                      ))}
                    </select>
                    <div className="text-[8px] text-[#aaa] mt-1.5">
                      开启「随机选择」后，每次回复会从这些状态栏模板中随机选一个。
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowPresetResourceManager('status')}
                      className="flex-1 py-2.5 rounded-xl bg-[#292724] text-white text-[9px]"
                    >
                      管理正则 / HTML
                    </button>
                    <button
                      onClick={() => {
                        setShowRenderedStatusBarModal(true);
                        setStatusBarHistoryIndex(Math.max(0, statusBarHistory.length - 1));
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-[#f4f1ec] border border-[#e8e3dc] text-[#555] text-[9px]"
                    >
                      查看状态历史
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-[9px] text-[#aaa]">
                    <span>历史快照</span>
                    <span>{statusBarHistory.length} 条</span>
                  </div>

                  <button
                    disabled={statusBarHistory.length === 0}
                    onClick={() => {
                      if (!window.confirm('确定删除当前聊天的全部状态栏历史吗？此操作无法撤销。')) return;
                      clearStatusBarHistory(conversationStorageId);
                      setStatusBarHistory([]);
                      setStatusBarHistoryIndex(0);
                      setShowRenderedStatusBarModal(false);
                      showToast('已清空当前聊天的全部状态栏历史');
                    }}
                    className="w-full py-2.5 rounded-xl border border-[#ead7d7] bg-[#fff8f8] text-[#a75d5d] text-[9px] disabled:opacity-40"
                  >
                    一键删除全部状态栏历史
                  </button>
                </div>
              )}
            </div>

            {/* Section 3: 我的人设管理器快捷入口 */}
            <div className="bg-white rounded-[14px] border border-[#f0f0f1] p-3.5 flex items-center justify-between cursor-pointer hover:bg-neutral-50"
                 onClick={() => {
                   setShowSettings(false);
                   setShowPersonaManager(true);
                 }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#faf1f3] text-[#ae7e89] flex items-center justify-center">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-medium text-[#333]">我的人设管理器</div>
                  <div className="text-[10px] text-[#999]">当前身份：{activePersona.name} ({activePersona.identity})</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#ccc]" />
            </div>

            {/* Section 4: 美化与自定义 CSS 管理器快捷入口 */}
            <div className="bg-white rounded-[14px] border border-[#f0f0f1] p-3.5 flex items-center justify-between cursor-pointer hover:bg-neutral-50"
                 onClick={() => {
                   setShowSettings(false);
                   setShowCssManager(true);
                 }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#f2f4f8] text-[#556987] flex items-center justify-center">
                  <Palette className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-medium text-[#333]">美化管理器与自定义 CSS</div>
                  <div className="text-[10px] text-[#999]">编写自定义 CSS、调整氛围底色与气泡样式</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#ccc]" />
            </div>

            {/* Section 5: API 参数 */}
            <div className="space-y-1.5">
              <div className="text-[10px] text-[#aaa] font-medium px-1 flex items-center gap-1">
                <SlidersHorizontal className="w-3 h-3 text-[#ae7e89]" />
                <span>API 参数</span>
              </div>

              <div className="bg-white rounded-[14px] border border-[#f0f0f1] p-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] text-[#999]">随机度 Temperature: {presetTemp}</span>
                    <input
                      type="range"
                      min="0.5"
                      max="1.2"
                      step="0.05"
                      value={presetTemp}
                      onChange={(e) => setPresetTemp(e.target.value)}
                      className="w-full mt-1 accent-[#d4aab5]"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-[#999]">上下文轮数: {presetContextLength}</span>
                    <select
                      value={presetContextLength}
                      onChange={(e) => setPresetContextLength(e.target.value)}
                      className="w-full p-1 bg-[#fafafa] border border-[#e8e8e9] rounded-md text-xs mt-1"
                    >
                      <option>10轮</option>
                      <option>20轮</option>
                      <option>40轮</option>
                      <option>80轮 (深度记忆)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowClearConfirm(true)}
              className="w-full py-3 bg-white text-rose-500 rounded-[14px] border border-[#f0f0f1] font-medium cursor-pointer hover:bg-rose-50/30 transition-colors"
            >
              清空聊天记录
            </button>
          </div>
        </div>
      )}

      {/* 13. ROLE SCHEDULE MODAL */}
      {showScheduleModal && (
        <div className="absolute inset-0 bg-white z-50 flex flex-col animate-in slide-in-from-bottom">
          <div className="h-[60px] border-b border-[#ededee] flex items-center justify-between px-3">
            <button onClick={() => setShowScheduleModal(false)} className="text-2xl text-[#555] px-2 cursor-pointer">
              ‹
            </button>
            <div className="text-center">
              <div className="font-semibold text-sm text-[#333]">{characterProfile.nickname} · 角色日程</div>
              <div className="text-[9px] text-[#aaa]">支持 AI 自动生成日程或手动添加</div>
            </div>
            <div className="w-8" />
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const generated = [
                    { id: String(Date.now() + 1), time: '09:00', title: '早安 · 查看手机是否有你的留言' },
                    { id: String(Date.now() + 2), time: '11:30', title: '工作室 · 调色与设计方案' },
                    { id: String(Date.now() + 3), time: '15:20', title: '下午茶 · 点了你提过的草莓大福' },
                    { id: String(Date.now() + 4), time: '18:45', title: '散步吹风 · 拍摄好看的晚霞' },
                    { id: String(Date.now() + 5), time: '21:30', title: '夜谈 · 等你一起聊天' },
                  ];
                  setScheduleList(generated);
                  showToast('已为当前角色重新生成日程 ✨');
                }}
                className="flex-1 py-2.5 rounded-[12px] bg-[#faf1f3] hover:bg-[#f6e6e9] text-[#ae7e89] font-medium flex items-center justify-center gap-1.5 cursor-pointer border border-[#f0dee3]"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>生成当前角色日程</span>
              </button>

              <button
                onClick={() => setShowAddScheduleRow(!showAddScheduleRow)}
                className="py-2.5 px-3.5 rounded-[12px] bg-[#f2f2f4] hover:bg-[#e8e8ea] text-[#555] font-medium flex items-center gap-1 cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>添加日程</span>
              </button>
            </div>

            {showAddScheduleRow && (
              <div className="p-3 bg-[#faf8f9] border border-[#f2e6e9] rounded-[12px] space-y-2 animate-in fade-in">
                <div className="font-semibold text-xs text-[#333]">为 {characterProfile.nickname} 添加新日程：</div>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={newScheduleTime}
                    onChange={(e) => setNewScheduleTime(e.target.value)}
                    className="p-1.5 bg-white border border-[#ddd] rounded-md text-xs font-mono"
                  />
                  <input
                    type="text"
                    value={newScheduleTitle}
                    onChange={(e) => setNewScheduleTitle(e.target.value)}
                    placeholder="输入日程活动，如：在便利店等雨停..."
                    className="flex-1 p-1.5 bg-white border border-[#ddd] rounded-md text-xs"
                  />
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    ['message', '主动聊天'],
                    ['moment', '发朋友圈'],
                    ['offline-invite', '线下邀约'],
                  ] as const).map(([kind, label]) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setNewScheduleKind(kind)}
                      className={`py-1.5 rounded-lg border text-[9px] ${newScheduleKind === kind ? 'bg-[#f3dfe4] border-[#d4aab5] text-[#8f5968]' : 'bg-white border-[#e5e5e6] text-[#777]'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {newScheduleKind === 'offline-invite' && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      value={newScheduleLocation}
                      onChange={(e) => setNewScheduleLocation(e.target.value)}
                      placeholder="见面地点（可选）"
                      className="p-1.5 bg-white border border-[#ddd] rounded-md text-[10px]"
                    />
                    <input
                      value={newScheduleTheme}
                      onChange={(e) => setNewScheduleTheme(e.target.value)}
                      placeholder="见面主题（可选）"
                      className="p-1.5 bg-white border border-[#ddd] rounded-md text-[10px]"
                    />
                  </div>
                )}
                  <button
                    onClick={handleAddScheduleItem}
                    className="px-3 py-1.5 bg-[#d4aab5] text-white rounded-md font-medium text-xs cursor-pointer"
                  >
                    保存
                  </button>
                </div>
            )}

            <div className="border border-[#ededee] rounded-[14px] overflow-hidden divide-y divide-[#f1f1f2]">
              {scheduleList.map((item) => (
                <div key={item.id} className="p-3 bg-white flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-semibold text-[#ae7e89] w-12">
                      {item.time}
                    </span>
                    <span className="text-xs text-[#333]">
                      {item.kind === 'moment' ? '◌' : item.kind === 'offline-invite' ? '💌' : '•'} {item.title}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setScheduleList(scheduleList.filter((s) => s.id !== item.id));
                      showToast('日程已删除');
                    }}
                    className="text-[#ccc] hover:text-rose-500 text-sm px-1 cursor-pointer"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                setShowScheduleModal(false);
                showToast('日程已同步');
              }}
              className="w-full py-2.5 rounded-[12px] bg-[#f7f7f7] hover:bg-[#efefef] text-[#666] text-xs font-medium cursor-pointer"
            >
              完成
            </button>
          </div>
        </div>
      )}

      {/* 14. REROLL MODAL */}
      {showReroll && (
        <div className="absolute inset-0 bg-white z-50 flex flex-col animate-in slide-in-from-bottom">
          <div className="h-[60px] border-b border-[#ededee] flex items-center justify-between px-3">
            <button onClick={() => setShowReroll(false)} className="text-2xl text-[#555] px-2 cursor-pointer">
              ‹
            </button>
            <span className="font-semibold text-sm text-[#333]">重新生成 (Reroll)</span>
            <div className="w-8" />
          </div>

          <div className="p-4 space-y-3 flex-1 overflow-y-auto">
            <div className="text-[11px] text-[#888]">当前角色回复</div>
            <div className="p-3 bg-[#f8f8f8] rounded-[13px] text-xs leading-relaxed text-[#666]">
              那就先休息一会儿。<br />不急着做别的。
            </div>

            <div className="text-[11px] text-[#888] pt-2">快捷调整方向</div>
            <div className="flex flex-wrap gap-2">
              {[
                '不符合人设，他不会这么直接说',
                '让他说话更克制一点',
                '这一轮不要推进感情',
                '按照现在的场景继续，不要跳时间',
                '保持刚才的语气和节奏',
              ].map((pill, i) => (
                <button
                  key={i}
                  onClick={() => setRerollPrompt(pill)}
                  className="px-2.5 py-1.5 rounded-full bg-[#f7eef0] text-[#9b6874] text-[10px] cursor-pointer"
                >
                  {pill}
                </button>
              ))}
            </div>

            <textarea
              value={rerollPrompt}
              onChange={(e) => setRerollPrompt(e.target.value)}
              placeholder="告诉 AI 这一轮应该怎么改……"
              className="w-full h-24 border border-[#e8e8e9] rounded-[12px] p-3 text-xs outline-none resize-none mt-2 font-sans"
            />

            <button
              onClick={handleDoReroll}
              className="w-full h-[44px] rounded-[12px] bg-[#f5e9ec] hover:bg-[#eddde1] text-[#9e6573] text-xs font-semibold mt-3 cursor-pointer"
            >
              重新生成这一条
            </button>
          </div>
        </div>
      )}

      {showPresetResourceManager && (
        <PresetResourceManager
          kind={showPresetResourceManager}
          statusPresets={statusBarPresets}
          setStatusPresets={setStatusBarPresets}
          cotPresets={cotPresets}
          setCotPresets={setCotPresets}
          activeStatusId={activeStatusBarPresetId}
          activeCotId={activeCotPresetId}
          characterId={characterId}
          characterName={contactName}
          onApplyStatus={applyStatusBarPreset}
          onApplyCot={applyCotPreset}
          onClose={() => setShowPresetResourceManager(null)}
        />
      )}

      {/* 14.5. TAVERN COT PRESET MANAGER MODAL (思维链预设管理器) */}
      {showCotPresetModal && (
        <div className="absolute inset-0 bg-white z-50 flex flex-col animate-in slide-in-from-bottom">
          <div className="h-[60px] border-b border-[#ededee] flex items-center justify-between px-3">
            <button onClick={() => setShowCotPresetModal(false)} className="text-2xl text-[#555] px-2 cursor-pointer">
              ‹
            </button>
            <div className="text-center">
              <div className="font-semibold text-sm text-[#333]">旧版决策模板（兼容管理）</div>
              <div className="text-[9px] text-[#aaa]">SillyTavern 风格思考模板与心理引导</div>
            </div>
            <button onClick={() => { setShowCotPresetModal(false); setShowPresetResourceManager('cot'); }} className="px-2 py-1 rounded-lg bg-[#f8f4f5] text-[#ae7e89] text-[9px] border border-[#f0dee3]">管理 / 导入导出</button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs pb-10">
            {/* Presets Grid */}
            <div className="space-y-2">
              <div className="text-[10px] text-[#aaa] font-medium">选择思考预设模板：</div>
              <div className="space-y-2.5">
                {cotPresets.map((preset) => {
                  const isActive = preset.id === activeCotPresetId;

                  return (
                    <div
                      key={preset.id}
                      onClick={() => {
                        setActiveCotPresetId(preset.id);
                        setCustomCotTemplate(preset.template);
                        if (enableChainOfThought) setShowChainOfThoughtInChat(true);
                        // 动态更新消息中的思维链演示
                        setMessages((prev) =>
                          prev.map((m) =>
                            m.thinking
                              ? {
                                  ...m,
                                  thinking: preset.exampleThinking,
                                }
                              : m
                          )
                        );
                        showToast(`已切换思维链预设：${preset.title}`);
                      }}
                      className={`p-3 rounded-[14px] border cursor-pointer transition-all ${
                        isActive
                          ? 'border-[#d4aab5] bg-[#fdf9fa] ring-1 ring-[#d4aab5]/40 shadow-2xs'
                          : 'border-[#ededee] bg-white hover:bg-neutral-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-semibold text-xs text-[#222]">
                          <span>{preset.title}</span>
                          <span className="text-[9px] font-mono text-[#ae7e89] bg-[#faf1f3] px-1.5 py-0.2 rounded">
                            {preset.tag}
                          </span>
                        </div>
                        {isActive && (
                          <span className="text-[10px] text-[#ae7e89] bg-white border border-[#f0dee3] px-2 py-0.5 rounded-full font-medium">
                            当前生效 ✓
                          </span>
                        )}
                      </div>
                      <div className="text-[10.5px] text-[#888] mt-1 leading-snug">
                        {preset.description}
                      </div>

                      {/* 思考模板预览折叠 */}
                      <div className="mt-2 pt-2 border-t border-[#f2f2f4] text-[10px] text-[#666] font-mono leading-relaxed bg-[#fafafa] p-2 rounded-md">
                        {preset.exampleThinking}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 自定义思维链提示词模板编辑器 */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#aaa] font-medium flex items-center gap-1">
                  <Terminal className="w-3.5 h-3.5 text-[#ae7e89]" />
                  <span>当前预设 Prompt 注入模板 (支持自定义编辑)：</span>
                </span>
                <button
                  onClick={() => {
                    setCustomCotTemplate(resolvedCotPreset.template);
                    showToast('已重置为预设默认');
                  }}
                  className="text-[10px] text-[#ae7e89] hover:underline cursor-pointer"
                >
                  恢复默认
                </button>
              </div>

              <textarea
                value={customCotTemplate}
                onChange={(e) => setCustomCotTemplate(e.target.value)}
                className="w-full h-36 p-3 font-mono text-[11px] bg-[#faf8f9] border border-[#f0e4e7] rounded-[12px] outline-none leading-relaxed resize-none text-[#444]"
              />
              <div className="text-[9.5px] text-[#aaa] leading-relaxed">
                此 Prompt 引导词将在生成时注入给 AI 模型，强制模型在输出正文前先在 &lt;think&gt; 内部展开心理博弈与台词规划。
              </div>
            </div>

            <button
              onClick={() => {
                setShowCotPresetModal(false);
                showToast('思维链预设已生效并保存 ✨');
              }}
              className="w-full py-2.5 rounded-[12px] bg-[#d4aab5] text-white text-xs font-semibold cursor-pointer shadow-xs"
            >
              应用预设并返回聊天
            </button>
          </div>
        </div>
      )}

      {/* 15. STICKER SHEET */}
      {showStickerSheet && (
        <div
          onClick={() => setShowStickerSheet(false)}
          className="absolute inset-0 bg-black/25 z-50 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-4 pb-6 space-y-3 animate-in slide-in-from-bottom"
          >
            <div className="w-8 h-1 bg-[#ddd] rounded-full mx-auto" />
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-[#333]">贴纸</span>
              <button
                onClick={() => showToast('已添加自定义贴纸')}
                className="text-[11px] text-[#aaa] cursor-pointer"
              >
                ＋ 自定义
              </button>
            </div>

            <div className="grid grid-cols-4 gap-4 py-2 text-2xl text-center">
              {['♡', '☁', '✦', '☾', '☺', '☆', '♪', '🌸'].map((s, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setShowStickerSheet(false);
                    const newMsg = {
                      id: Date.now(),
                      sender: 'me',
                      text: s,
                      time: '刚刚',
                    };
                    setMessages((prev) => [...prev, newMsg]);
                  }}
                  className="hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowStickerSheet(false)}
              className="w-full py-2.5 rounded-[12px] bg-[#f7f7f7] text-[#777] text-xs font-medium cursor-pointer"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 16. FULLSCREEN VIDEO CALL OVERLAY */}
      {showVideoCall && (
        <div className="absolute inset-0 bg-[#19191b] z-50 flex flex-col justify-between p-6 text-white animate-in zoom-in-95">
          <div className="flex items-center justify-between text-sm">
            <button onClick={() => { setShowVideoCall(false); recordLineCall(conversationStorageId, { direction: 'outgoing', kind: 'video', status: 'ended' }); }} className="text-xl opacity-80 cursor-pointer">
              ×
            </button>
            <span className="text-xs text-[#aaa]">端到端加密通话</span>
            <div className="w-4" />
          </div>

          <div className="text-center space-y-3">
            <div className="w-20 h-20 rounded-full bg-[#343437] mx-auto flex items-center justify-center">
              <svg className="w-12 h-12 text-[#aaa]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c.8-4 3.5-6 8-6s7.2 2 8 6" />
              </svg>
            </div>
            <div className="font-semibold text-base">{characterProfile.nickname}</div>
            <div className="text-xs text-[#aaa]">正在连接……</div>
          </div>

          <div className="flex items-center justify-center gap-6">
            <button className="w-12 h-12 rounded-full bg-white/12 flex items-center justify-center cursor-pointer">
              <MicOff className="w-5 h-5 text-white" />
            </button>
            <button
              onClick={() => { setShowVideoCall(false); recordLineCall(conversationStorageId, { direction: 'outgoing', kind: 'video', status: 'ended' }); }}
              className="w-14 h-14 rounded-full bg-[#d56f7d] flex items-center justify-center shadow-lg active:scale-95 cursor-pointer"
            >
              <PhoneOff className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>
      )}

      {/* 16.5. FULLSCREEN AUDIO VOICE CALL OVERLAY (语音通话) */}
      {showAudioCall && (
        <div className="absolute inset-0 bg-[#23252a] z-50 flex flex-col justify-between p-6 text-white animate-in zoom-in-95">
          <div className="flex items-center justify-between text-sm">
            <button onClick={() => { setShowAudioCall(false); recordLineCall(conversationStorageId, { direction: 'outgoing', kind: 'audio', status: 'ended', duration: audioCallDuration }); }} className="text-xl opacity-80 cursor-pointer">
              ×
            </button>
            <span className="text-xs text-[#aaa]">LINE 语音通话</span>
            <div className="w-4" />
          </div>

          <div className="text-center space-y-3">
            <div className="w-24 h-24 rounded-full bg-[#343740] mx-auto flex items-center justify-center border-2 border-[#434752] shadow-xl">
              <svg className="w-14 h-14 text-[#aaa]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c.8-4 3.5-6 8-6s7.2 2 8 6" />
              </svg>
            </div>
            <div className="font-semibold text-lg">{characterProfile.nickname}</div>
            <div className="text-xs text-[#b9d2c1] font-mono">
              通话中 00:{audioCallDuration < 10 ? `0${audioCallDuration}` : audioCallDuration}
            </div>
          </div>

          <div className="flex items-center justify-center gap-6 pb-6">
            <button
              onClick={() => setIsAudioMuted(!isAudioMuted)}
              className={`w-12 h-12 rounded-full flex items-center justify-center cursor-pointer transition-colors ${
                isAudioMuted ? 'bg-[#d56f7d] text-white' : 'bg-white/12 text-white'
              }`}
              title="静音"
            >
              <MicOff className="w-5 h-5" />
            </button>

            <button
              onClick={() => { setShowAudioCall(false); recordLineCall(conversationStorageId, { direction: 'outgoing', kind: 'audio', status: 'ended', duration: audioCallDuration }); }}
              className="w-16 h-16 rounded-full bg-[#d56f7d] hover:bg-[#c95867] flex items-center justify-center shadow-lg active:scale-95 cursor-pointer"
              title="挂断"
            >
              <PhoneOff className="w-7 h-7 text-white" />
            </button>

            <button
              onClick={() => setIsSpeakerOn(!isSpeakerOn)}
              className={`w-12 h-12 rounded-full flex items-center justify-center cursor-pointer transition-colors ${
                isSpeakerOn ? 'bg-[#b9d2c1] text-black' : 'bg-white/12 text-white'
              }`}
              title="免提扬声器"
            >
              <Volume2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Group members sheet */}
      {showGroupMembers && isGroup && (
        <div
          onClick={() => setShowGroupMembers(false)}
          className="absolute inset-0 bg-black/20 z-55 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-h-[72%] overflow-y-auto bg-white rounded-t-[22px] p-4 pb-7 animate-in slide-in-from-bottom"
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-bold text-[15px] text-[#222]">{contactName}</div>
                <div className="text-[10px] text-[#aaa] mt-0.5">{groupMembers.length} {tx('位成员', '人のメンバー')}</div>
              </div>
              <button onClick={() => setShowGroupMembers(false)} className="w-8 h-8 rounded-full bg-[#f6f6f7] text-[#888] text-lg">×</button>
            </div>
            <div className="space-y-1">
              {groupMembers.map((member: any) => {
                const character = importedCharacters.find((item) => item.id === member.characterId || item.name === member.name);
                const isMeMember = member.name === currentUserNameFallback();
                return (
                  <button
                    key={member.id || member.characterId || member.name}
                    onClick={() => {
                      if (!isMeMember && character) {
                        setShowGroupMembers(false);
                        setShowCharacterProfile(true);
                      }
                    }}
                    className="w-full flex items-center gap-3 p-2.5 rounded-[13px] hover:bg-[#fafafa] text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#f2f2f3] border border-[#ededee] overflow-hidden shrink-0 flex items-center justify-center text-xs text-[#888]">
                      {character?.avatar ? <img src={character.avatar} alt="" className="w-full h-full object-cover" /> : (member.nickname || member.name || '?').slice(0, 1)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-[#333] truncate">{member.nickname || member.name}</span>
                        {isMeMember && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-[#f5f5f6] text-[#999]">我</span>}
                        {!isMeMember && member.online !== false && <span className="w-1.5 h-1.5 rounded-full bg-[#9db8a5]" />}
                      </div>
                      <div className="text-[10px] text-[#aaa] truncate mt-0.5">
                        {[member.relationship, member.mood, member.online === false ? '离线' : '在线'].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {!isMeMember && <ChevronRight className="w-4 h-4 text-[#c3c3c5]" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 16.6. 消息长按/操作菜单 (Context Action Sheet) */}
      {contextMenuMsg && (
        <div
          onClick={() => setContextMenuMsg(null)}
          className="absolute inset-0 bg-black/25 z-55 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-4 pb-6 space-y-3.5 animate-in slide-in-from-bottom"
          >
            <div className="w-8 h-1 bg-[#ddd] rounded-full mx-auto" />

            {/* 表情回应条 (Emoji Reactions) */}
            <div className="flex items-center justify-around bg-[#f8f8fa] py-2 px-3 rounded-full text-xl shadow-2xs">
              {['❤️', '👍', '😂', '😮', '😭', '🥺'].map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleAddReaction(contextMenuMsg.id, emoji)}
                  className="hover:scale-125 active:scale-95 transition-transform cursor-pointer"
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* 操作选项列表 (回复 / 复制 / 转发 / 撤回 / 删除) */}
            <div className="divide-y divide-[#f2f2f4] text-xs">
              {/* 回复 */}
              <div
                onClick={() => {
                  setReplyingToMsg(contextMenuMsg);
                  setContextMenuMsg(null);
                  showToast('已选中回复消息');
                }}
                className="py-3 flex items-center gap-3 cursor-pointer hover:bg-neutral-50 px-2"
              >
                <CornerUpLeft className="w-4 h-4 text-[#ae7e89]" />
                <span className="text-[#333]">引用回复</span>
              </div>

              {/* 复制 */}
              {contextMenuMsg.text && (
                <div
                  onClick={() => {
                    navigator.clipboard?.writeText(contextMenuMsg.text);
                    setContextMenuMsg(null);
                    showToast('已复制到剪贴板');
                  }}
                  className="py-3 flex items-center gap-3 cursor-pointer hover:bg-neutral-50 px-2"
                >
                  <Copy className="w-4 h-4 text-[#666]" />
                  <span className="text-[#333]">复制文本</span>
                </div>
              )}

              {/* 编辑：允许直接修改自己或角色发送的文字消息 */}
              {contextMenuMsg.text && (
                <div
                  onClick={() => {
                    setEditingMessageId(String(contextMenuMsg.id));
                    setEditingMessageText(String(contextMenuMsg.text || contextMenuMsg.content || ''));
                    setContextMenuMsg(null);
                  }}
                  className="py-3 flex items-center gap-3 cursor-pointer hover:bg-neutral-50 px-2"
                >
                  <Edit3 className="w-4 h-4 text-[#666]" />
                  <span className="text-[#333]">编辑消息</span>
                </div>
              )}

              {/* 单条 Reroll：只作用于当前长按的这一条角色消息 */}
              {contextMenuMsg.sender !== 'me' && contextMenuMsg.type !== 'system-nudge' && contextMenuMsg.text && (
                <div onClick={() => {
                  setRerollTargetId(contextMenuMsg.id);
                  setRerollPrompt('只重新生成这一条消息，不要重写同一轮的其他消息。');
                  setShowReroll(true);
                  setContextMenuMsg(null);
                }} className="py-3 flex items-center gap-3 cursor-pointer hover:bg-neutral-50 px-2 text-[#ae7e89]">
                  <RefreshCw className="w-4 h-4" />
                  <span className="text-[#333]">只重抽这一条</span>
                </div>
              )}

              {/* 失败消息重试 */}
              {contextMenuMsg.status === 'failed' && (
                <div
                  onClick={() => {
                    setRerollTargetId(contextMenuMsg.id);
                    setRerollPrompt('请基于这一条消息之前的上下文重新生成这一条，保持角色设定与语气。');
                    setShowReroll(true);
                    setContextMenuMsg(null);
                  }}
                  className="py-3 flex items-center gap-3 cursor-pointer hover:bg-neutral-50 px-2 text-[#ae7e89]"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span className="text-[#333]">失败重试</span>
                </div>
              )}

              {/* 转发 */}
              <div
                onClick={() => {
                  setForwardMsg(contextMenuMsg);
                  setContextMenuMsg(null);
                }}
                className="py-3 flex items-center gap-3 cursor-pointer hover:bg-neutral-50 px-2"
              >
                <Share2 className="w-4 h-4 text-[#666]" />
                <span className="text-[#333]">转发消息</span>
              </div>

              {/* 收藏 */}
              <div
                onClick={() => {
                  const newFav = {
                    id: Date.now(),
                    contactName,
                    sender: contextMenuMsg.sender,
                    text: contextMenuMsg.text || contextMenuMsg.desc || '多媒体内容',
                    time: contextMenuMsg.time,
                    savedAt: '刚刚'
                  };
                  setFavorites((prev) => [newFav, ...prev]);
                  setLineMessageFavorite(conversationStorageId, contextMenuMsg.id, true);
                  setContextMenuMsg(null);
                  showToast('已收藏此条消息至收藏箱 ☆');
                }}
                className="py-3 flex items-center gap-3 cursor-pointer hover:bg-neutral-50 px-2"
              >
                <Bookmark className="w-4 h-4 text-[#ae7e89]" />
                <span className="text-[#333]">收藏此条消息</span>
              </div>

              {/* 多选 */}
              <div
                onClick={() => {
                  setIsMultiSelectMode(true);
                  setSelectedMsgIds([contextMenuMsg.id]);
                  setContextMenuMsg(null);
                }}
                className="py-3 flex items-center gap-3 cursor-pointer hover:bg-neutral-50 px-2"
              >
                <CheckSquare className="w-4 h-4 text-[#666]" />
                <span className="text-[#333]">多选</span>
              </div>

              {/* 撤回 (我发的可撤回，角色发的也可令其撤回) */}
              {contextMenuMsg.sender === 'me' ? (
                <div
                  onClick={() => handleRecallMessage(contextMenuMsg.id)}
                  className="py-3 flex items-center gap-3 cursor-pointer hover:bg-neutral-50 px-2 text-[#ae7e89]"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>撤回我的消息</span>
                </div>
              ) : (
                <div
                  onClick={() => handleOtherRecallMessage(contextMenuMsg.id, true)}
                  className="py-3 flex items-center gap-3 cursor-pointer hover:bg-neutral-50 px-2 text-[#ae7e89]"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>令TA撤回此消息 (剧情撤回)</span>
                </div>
              )}

              {/* 删除 */}
              <div
                onClick={() => {
                  setMessages((prev) => prev.filter((m) => String(m.id) !== String(contextMenuMsg.id)));
                  setContextMenuMsg(null);
                  showToast('消息已删除');
                }}
                className="py-3 flex items-center gap-3 cursor-pointer hover:bg-neutral-50 px-2 text-rose-500"
              >
                <Trash2 className="w-4 h-4" />
                <span>删除消息</span>
              </div>
            </div>

            <button
              onClick={() => setContextMenuMsg(null)}
              className="w-full py-2.5 rounded-[12px] bg-[#f7f7f7] text-[#777] text-xs font-medium cursor-pointer"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 16.7. 转发好友弹窗 (Forward Modal) */}
      {forwardMsg && (
        <div
          onClick={() => setForwardMsg(null)}
          className="absolute inset-0 bg-black/25 z-60 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-4 pb-6 space-y-3 animate-in slide-in-from-bottom"
          >
            <div className="w-8 h-1 bg-[#ddd] rounded-full mx-auto" />
            <div className="font-semibold text-sm text-[#333]">转发给好友</div>

            <div className="divide-y divide-[#f2f2f4] text-xs">
              {forwardRecipients.map((f, i) => (
                <div
                  key={i}
                  onClick={() => {
                    const forwardedText = forwardMsg.text || '[多媒体消息]';
                    const forwardedId = `forward-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                    import('../../store/lineRuntime').then(({ appendLineMessage }) => appendLineMessage(f, {
                      id: forwardedId,
                      sender: 'me',
                      text: forwardedText,
                      kind: 'text',
                      createdAt: new Date().toISOString(),
                      status: 'sent',
                      metadata: { forwarded: true, fromConversationId: conversationStorageId, sourceMessageId: forwardMsg.id },
                    }));
                    setForwardMsg(null);
                    showToast(`已将消息转发给 ${f}`);
                  }}
                  className="py-2.5 flex items-center justify-between cursor-pointer hover:bg-neutral-50 px-2"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[#f1f1f2] border border-[#eee] flex items-center justify-center text-[10px] text-[#888]">
                      {f[0]}
                    </div>
                    <span className="font-medium text-[#333]">{f}</span>
                  </div>
                  <span className="text-[10px] text-[#ae7e89] border border-[#f0dee3] px-2 py-0.5 rounded-full">
                    发送
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setForwardMsg(null)}
              className="w-full py-2.5 rounded-[12px] bg-[#f7f7f7] text-[#777] text-xs font-medium cursor-pointer"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 16.8. 我的收藏箱抽屉 (Favorites Drawer) */}
      {showFavoritesModal && (
        <div className="absolute inset-0 bg-[#f7f7f8] z-60 flex flex-col animate-in slide-in-from-right">
          <div className="h-[60px] bg-white border-b border-[#ededee] flex items-center justify-between px-3">
            <button onClick={() => setShowFavoritesModal(false)} className="text-2xl text-[#555] px-2 cursor-pointer">
              ‹
            </button>
            <div className="text-center">
              <span className="font-semibold text-sm text-[#333]">我的收藏箱</span>
              <div className="text-[9px] text-[#aaa]">已收藏 {favorites.length} 条心动消息</div>
            </div>
            <div className="w-8" />
          </div>

          <div className="p-4 space-y-3 flex-1 overflow-y-auto text-xs pb-10">
            {favorites.length === 0 ? (
              <div className="py-24 text-center text-[#aaa] space-y-2">
                <Bookmark className="w-10 h-10 mx-auto text-[#ddd]" />
                <div>暂无收藏的消息</div>
                <div className="text-[10px]">在聊天中长按或右键消息，选择「收藏此条消息」即可添加</div>
              </div>
            ) : (
              favorites.map((fav) => (
                <div key={fav.id} className="p-3.5 bg-white rounded-[14px] border border-[#f0f0f1] shadow-2xs space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-[#888] pb-1 border-b border-[#f6f6f7]">
                    <div className="flex items-center gap-1.5 font-medium text-[#555]">
                      <Bookmark className="w-3 h-3 text-[#ae7e89]" />
                      <span>{fav.contactName}</span>
                    </div>
                    <span className="text-[10px] text-[#aaa]">{fav.time || fav.savedAt}</span>
                  </div>

                  <div className="text-[12px] text-[#333] leading-relaxed whitespace-pre-wrap">
                    {fav.text}
                  </div>

                  <div className="flex justify-end gap-2 pt-1 text-[10px]">
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(fav.text);
                        showToast('已复制内容');
                      }}
                      className="px-2.5 py-1 rounded bg-[#f5f5f7] text-[#555] hover:bg-[#eaeaea] cursor-pointer"
                    >
                      复制
                    </button>
                    <button
                      onClick={() => {
                        setFavorites((prev) => prev.filter((f) => f.id !== fav.id));
                        showToast('已移出收藏');
                      }}
                      className="px-2.5 py-1 rounded bg-rose-50 text-rose-500 hover:bg-rose-100 cursor-pointer"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 16.10. 清空聊天记录确认弹窗 (Clear Chat Confirmation Modal) */}
      {showClearConfirm && (
        <div
          onClick={() => setShowClearConfirm(false)}
          className="absolute inset-0 bg-black/30 z-70 flex items-center justify-center p-6 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[280px] bg-white rounded-[20px] p-5 text-center space-y-3.5 shadow-xl animate-in zoom-in-95"
          >
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-500 mx-auto flex items-center justify-center">
              <Trash2 className="w-6 h-6 stroke-[1.7]" />
            </div>
            <div>
              <div className="font-semibold text-sm text-[#222]">确认清空聊天记录？</div>
              <div className="text-[11px] text-[#888] mt-1 leading-relaxed">
                将清空与 {characterProfile.nickname} 的所有对话记录，此操作不可恢复。
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="py-2.5 rounded-[12px] bg-[#f5f5f7] text-[#666] font-medium cursor-pointer hover:bg-[#eee]"
              >
                取消
              </button>
              <button
                onClick={handleClearChat}
                className="py-2.5 rounded-[12px] bg-rose-500 text-white font-medium cursor-pointer hover:bg-rose-600 shadow-xs"
              >
                确认清空
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 16.11. 角色个人主页 (Threads / Twitter / 动态主页) */}
      {showCharacterProfile && (
        <div className="absolute inset-0 bg-[#fafafa] z-60 flex flex-col animate-in slide-in-from-right overflow-hidden">
          {/* Top Bar */}
          <div className="h-[56px] px-3 flex items-center justify-between bg-white border-b border-[#ededee] shrink-0 z-10">
            <button
              onClick={() => setShowCharacterProfile(false)}
              className="text-2xl text-[#444] px-2 cursor-pointer hover:opacity-70"
            >
              ‹
            </button>
            <div className="text-center">
              <div className="font-bold text-sm text-[#222]">{characterProfile.nickname} 的主页</div>
              <div className="text-[9.5px] text-[#aaa]">@guyan.whisper · 个人动态与设定</div>
            </div>
            <button
              onClick={() => showToast('已分享TA的主页链接')}
              className="text-sm text-[#666] px-2 cursor-pointer hover:text-[#ae7e89]"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar pb-10">
            {/* Cover Banner：头像与背景都可替换 */}
            <div className="h-[140px] relative overflow-hidden">
              <input ref={characterCoverFileRef} type="file" accept="image/*" className="hidden" onChange={async e => {
                const file = e.target.files?.[0]; if (!file) return;
                try { setCharacterCover(await readImageFileAsDataUrl(file)); showToast('主页背景已更新'); } catch { showToast('背景读取失败'); }
                e.currentTarget.value = '';
              }} />
              {characterCover ? <img src={characterCover} alt="主页背景" className="absolute inset-0 w-full h-full object-cover" /> : <div className="absolute inset-0 bg-gradient-to-r from-[#e8dadf] via-[#efe6e8] to-[#ded6dc]" />}
              <button onClick={() => characterCoverFileRef.current?.click()} className="absolute top-3 right-3 px-2.5 py-1.5 rounded-full bg-black/35 text-white text-[9px] backdrop-blur">更换背景</button>
              <div className="absolute -bottom-7 left-4">
                <div className="w-[66px] h-[66px] rounded-full bg-[#f1f1f2] border-3 border-white shadow-md flex items-center justify-center overflow-hidden">
                  {characterProfileAvatar ? <img src={characterProfileAvatar} alt={characterProfile.nickname} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : importedCharacter?.avatar ? <img src={importedCharacter.avatar} alt={characterProfile.nickname} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <svg className="w-10 h-10 text-[#999]" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4 3.5-6 8-6s7.2 2 8 6" /></svg>}
                </div>
                <input ref={characterProfileAvatarFileRef} type="file" accept="image/*" className="hidden" onChange={async e => {
                  const file = e.target.files?.[0]; if (!file) return;
                  try { setCharacterProfileAvatar(await readImageFileAsDataUrl(file)); showToast('主页头像已更新'); } catch { showToast('头像读取失败'); }
                  e.currentTarget.value = '';
                }} />
                <button onClick={() => characterProfileAvatarFileRef.current?.click()} className="mt-1 ml-2 text-[8px] text-[#ae7e89]">更换头像</button>
              </div>

              <div className="absolute bottom-2.5 right-4 flex items-center gap-2">
                <button
                  onClick={() => {
                    handleNudge(characterProfile.nickname);
                  }}
                  className="px-3 py-1 bg-white/90 backdrop-blur-sm border border-[#e5d8dc] rounded-full text-xs text-[#ae7e89] font-medium shadow-2xs hover:bg-white cursor-pointer active:scale-95 transition-all"
                >
                  拍一拍TA
                </button>
                <button
                  onClick={() => {
                    setShowCharacterProfile(false);
                    setShowOfflineInviteModal(true);
                  }}
                  className="px-3 py-1 bg-[#ae7e89] text-white rounded-full text-xs font-semibold shadow-xs hover:bg-[#9d6d78] cursor-pointer active:scale-95 transition-all"
                >
                  发起线下见面 💌
                </button>
              </div>
            </div>

            {/* Profile Info */}
            <div className="px-4 pt-9 pb-3 bg-white border-b border-[#f0f0f1]">
              <div className="flex items-center gap-2">
                <span className="text-[19px] font-bold text-[#202124]">{characterProfile.nickname}</span>

              </div>
              <div className="text-[11px] text-[#aaa] mt-0.5 font-mono">
                ID: guyan_silent · {characterProfile.birthday}
              </div>

              {/* Bio / 个性签名 */}
              <div className="mt-2 text-xs text-[#444] leading-relaxed">
                深水静流，只对特定的人有温度。常年在旧书屋与暗房出没。
              </div>

              {/* Tags / 专属称呼 */}
              <div className="mt-2.5 flex flex-wrap gap-1.5 text-[10px]">
                <span className="px-2 py-0.5 rounded-md bg-[#f6f6f7] text-[#666]">
                  叫我：<span className="text-[#ae7e89] font-medium">{characterProfile.callMe}</span>
                </span>
                <span className="px-2 py-0.5 rounded-md bg-[#f6f6f7] text-[#666]">
                  好感度：<span className="text-[#ae7e89] font-medium">{statusData.favor} / 100</span>
                </span>
                <span className="px-2 py-0.5 rounded-md bg-[#f6f6f7] text-[#666]">
                  当前位置：{statusData.location}
                </span>
              </div>

              {/* Follower Stats */}
              <div className="mt-3 flex items-center gap-4 text-xs text-[#555]">
                <div>
                  <span className="font-bold text-[#222]">48</span>{' '}
                  <span className="text-[#999] text-[11px]">正在关注</span>
                </div>
                <div>
                  <span className="font-bold text-[#222]">1,280</span>{' '}
                  <span className="text-[#999] text-[11px]">关注者</span>
                </div>
                <div>
                  <span className="font-bold text-[#222]">3.4k</span>{' '}
                  <span className="text-[#999] text-[11px]">获赞</span>
                </div>
              </div>
            </div>

            {/* Profile Tabs：主页只保留动态与相册；记忆 / 世界书统一在聊天设置 */}
            <div className="h-[42px] bg-white border-b border-[#ededee] flex text-xs font-medium text-[#777]">
              <div className="flex-1 flex items-center justify-center border-b-2 border-[#ae7e89] text-[#ae7e89]">动态 (Threads)</div>
              <div onClick={() => showToast('相册正在整理中…')} className="flex-1 flex items-center justify-center cursor-pointer hover:text-[#333]">胶片相册</div>
            </div>

            {/* Dynamic Posts Feed (Threads / Moments style) */}
            <div className="divide-y divide-[#f0f0f2]">
              {characterFeedPosts.map((post) => (
                <div key={post.id} className="p-4 bg-white space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-[#f1f1f2] border border-[#ededee] flex items-center justify-center text-[10px] text-[#888]">
                        {characterProfile.nickname[0]}
                      </div>
                      <div>
                        <div className="font-semibold text-xs text-[#222]">{characterProfile.nickname}</div>
                        <div className="text-[9.5px] text-[#aaa]">{post.time}</div>
                      </div>
                    </div>
                    <span className="text-[10px] text-[#ae7e89] bg-[#faf1f3] px-2 py-0.5 rounded-full">
                      {post.tag}
                    </span>
                  </div>

                  <div className="text-xs text-[#333] leading-relaxed whitespace-pre-wrap pl-1">
                    {post.text}
                  </div>

                  {/* Actions: Like, Comment, Repost */}
                  <div className="flex items-center gap-6 pt-1 text-xs text-[#888] pl-1">
                    <button
                      onClick={() => {
                        setCharacterFeedPosts((prev) =>
                          prev.map((p) => {
                            if (p.id !== post.id) return p;
                            const nextLiked = !p.liked;
                            return {
                              ...p,
                              liked: nextLiked,
                              likes: nextLiked ? p.likes + 1 : p.likes - 1,
                            };
                          })
                        );
                      }}
                      className={`flex items-center gap-1 cursor-pointer transition-colors ${
                        post.liked ? 'text-[#ae7e89] font-medium' : 'hover:text-[#555]'
                      }`}
                    >
                      <Heart className={`w-3.5 h-3.5 ${post.liked ? 'fill-[#ae7e89]' : ''}`} />
                      <span>{post.likes}</span>
                    </button>

                    <button
                      onClick={() => {
                        setProfileCommentPostId(profileCommentPostId === post.id ? null : post.id);
                      }}
                      className="flex items-center gap-1 cursor-pointer hover:text-[#555]"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>{post.comments.length} 条评论</span>
                    </button>
                  </div>

                  {/* Comments Section */}
                  <div className="mt-2 pt-2 border-t border-[#f5f5f7] space-y-2">
                    {post.comments.map((comment: { user: string; text: string }, i: number) => (
                      <div key={i} className="text-[11px] leading-snug bg-[#fafafa] p-2 rounded-lg">
                        <span className="font-semibold text-[#555]">{comment.user}: </span>
                        <span className="text-[#333]">{comment.text}</span>
                      </div>
                    ))}

                    {/* Write a comment */}
                    <div className="flex gap-2 pt-1">
                      <input
                        type="text"
                        placeholder={`给 ${characterProfile.nickname} 的动态留句言…`}
                        value={profileCommentPostId === post.id ? profileNewComment : ''}
                        onFocus={() => setProfileCommentPostId(post.id)}
                        onChange={(e) => {
                          setProfileCommentPostId(post.id);
                          setProfileNewComment(e.target.value);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleAddProfileComment(post.id);
                          }
                        }}
                        className="flex-1 px-3 py-1.5 bg-[#f6f6f7] rounded-full text-xs outline-none text-[#333]"
                      />
                      <button
                        onClick={() => handleAddProfileComment(post.id)}
                        className="px-3 py-1.5 bg-[#ae7e89] hover:bg-[#9d6d78] text-white rounded-full text-xs font-medium cursor-pointer shadow-2xs"
                      >
                        发送
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 16.12. 线下剧情邀约抽屉 (Offline Meetup System) */}
      {showOfflineInviteModal && (
        <div className="absolute inset-0 bg-[#f7f7f8] z-60 flex flex-col animate-in slide-in-from-bottom overflow-hidden">
          <div className="h-[56px] px-3 flex items-center justify-between bg-white border-b border-[#ededee] shrink-0">
            <button
              onClick={() => setShowOfflineInviteModal(false)}
              className="text-2xl text-[#444] px-2 cursor-pointer hover:opacity-70"
            >
              ‹
            </button>
            <div className="text-center">
              <div className="font-bold text-sm text-[#222]">线下剧情邀约系统</div>
              <div className="text-[9.5px] text-[#aaa]">沉浸式酒馆剧情邀约函设计</div>
            </div>
            <div className="w-8" />
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs pb-10">
            {/* 发起方式单选 (3 种方式满足用户全部诉求) */}
            <div className="space-y-1.5">
              <div className="text-[10px] text-[#aaa] font-medium">选择邀约发起模式：</div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    id: 'other',
                    title: '要角色邀请我',
                    desc: '角色主动发函给你',
                    badge: '推荐',
                  },
                  {
                    id: 'me',
                    title: '我发起的邀约',
                    desc: '主动向角色发函',
                    badge: '主动',
                  },
                  {
                    id: 'ai-prompt',
                    title: '根据聊天引导',
                    desc: 'AI判断剧情发起',
                    badge: '剧情',
                  },
                ].map((mode) => {
                  const isSelected =
                    mode.id === 'ai-prompt'
                      ? false
                      : offlineInviteData.inviteFrom === mode.id;
                  return (
                    <button
                      key={mode.id}
                      onClick={() => {
                        if (mode.id === 'other' || mode.id === 'ai-prompt') {
                          void generateRoleOfflineInvite();
                        } else {
                          setOfflineInviteData({
                            ...offlineInviteData,
                            inviteFrom: mode.id as any,
                          });
                        }
                      }}
                      className={`p-2.5 rounded-[12px] border text-left cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-[#faf1f3] border-[#d4aab5] text-[#ae7e89] shadow-2xs ring-1 ring-[#d4aab5]'
                          : 'bg-white border-[#ededee] text-[#555] hover:bg-neutral-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[11px]">{mode.title}</span>
                        <span className="text-[8.5px] px-1 rounded bg-[#f4e6ea] text-[#ae7e89]">
                          {mode.badge}
                        </span>
                      </div>
                      <div className="text-[9px] text-[#aaa] mt-1">{mode.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 邀约卡片详情输入表单 */}
            <div className="bg-white rounded-[14px] border border-[#f0f0f1] p-3.5 space-y-3">
              <div className="font-semibold text-xs text-[#222]">
                {offlineInviteData.inviteFrom === 'other'
                  ? `【${characterProfile.nickname} 的发函内容】`
                  : '【你的发函内容】'}
              </div>

              <div>
                <span className="text-[10px] text-[#888]">约定地点：</span>
                <input
                  value={offlineInviteData.location}
                  onChange={(e) =>
                    setOfflineInviteData({ ...offlineInviteData, location: e.target.value })
                  }
                  className="w-full p-2 bg-[#fafafa] border border-[#e8e8e9] rounded-md text-xs mt-1 text-[#333]"
                  placeholder="例如：神保町·雨夜旧书屋二层咖啡阁"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-[#888]">约定时间：</span>
                  <input
                    value={offlineInviteData.time}
                    onChange={(e) =>
                      setOfflineInviteData({ ...offlineInviteData, time: e.target.value })
                    }
                    className="w-full p-2 bg-[#fafafa] border border-[#e8e8e9] rounded-md text-xs mt-1 text-[#333]"
                    placeholder="例如：明晚 19:30"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-[#888]">邀约主题：</span>
                  <input
                    value={offlineInviteData.theme}
                    onChange={(e) =>
                      setOfflineInviteData({ ...offlineInviteData, theme: e.target.value })
                    }
                    className="w-full p-2 bg-[#fafafa] border border-[#e8e8e9] rounded-md text-xs mt-1 text-[#333]"
                    placeholder="例如：私享特调咖啡与夜谈"
                  />
                </div>
              </div>

              <div>
                <span className="text-[10px] text-[#888]">邀请信笺附言 / 剧情台词：</span>
                <textarea
                  value={offlineInviteData.letter}
                  onChange={(e) =>
                    setOfflineInviteData({ ...offlineInviteData, letter: e.target.value })
                  }
                  className="w-full h-20 p-2 bg-[#fafafa] border border-[#e8e8e9] rounded-md text-xs mt-1 leading-relaxed resize-none text-[#333]"
                  placeholder="写下动人的剧情邀约话语…"
                />
              </div>
            </div>

            {/* 卡片美化风格与自定义 CSS 设计 */}
            <div className="bg-white rounded-[14px] border border-[#f0f0f1] p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-[#222]">卡片样式设计与 CSS 美化</span>
                <span className="text-[10px] text-[#ae7e89]">酒馆定制风</span>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center text-[10.5px]">
                {[
                  { id: 'white', label: '极简雅白', bg: '#ffffff', border: '#e8e8e9' },
                  { id: 'midnight', label: '暗夜微醺', bg: '#252730', border: '#3a3e4c', text: '#fff' },
                  { id: 'parchment', label: '羊皮纸卷', bg: '#fdf7ea', border: '#e6dabf' },
                  { id: 'rose', label: '绯红初恋', bg: '#fdf3f5', border: '#f0d2da' },
                ].map((st) => (
                  <button
                    key={st.id}
                    onClick={() => setOfflineInviteTheme(st.id as any)}
                    style={{ backgroundColor: st.bg, borderColor: offlineInviteTheme === st.id ? '#ae7e89' : st.border }}
                    className={`py-2 rounded-[10px] border flex flex-col items-center gap-1 cursor-pointer transition-all ${
                      offlineInviteTheme === st.id ? 'ring-2 ring-[#ae7e89] font-bold text-[#8c5f6b]' : 'text-[#666]'
                    }`}
                  >
                    <span>{st.label}</span>
                  </button>
                ))}
              </div>

              {/* 自定义 CSS 代码输入框 */}
              <div className="border-t border-[#f2f2f3] pt-2.5 space-y-1">
                <div className="flex items-center justify-between text-[10px] text-[#888]">
                  <span>自定义 CSS 样式规则：</span>
                  <button
                    onClick={() => {
                      setOfflineInviteCustomCss(`/* 线下邀约卡片自定义样式 */
.custom-invite-card {
  box-shadow: 0 4px 14px rgba(212, 170, 181, 0.18);
  border-radius: 20px !important;
}`);
                      showToast('已重置默认 CSS');
                    }}
                    className="text-[#ae7e89] hover:underline"
                  >
                    恢复默认
                  </button>
                </div>
                <textarea
                  value={offlineInviteCustomCss}
                  onChange={(e) => setOfflineInviteCustomCss(e.target.value)}
                  className="w-full h-18 p-2 font-mono text-[10px] bg-[#1e1e20] text-[#a9b7c6] rounded-[10px] outline-none leading-relaxed resize-none shadow-inner"
                />
              </div>
            </div>

            {/* 发送邀约按钮 */}
            <button
              onClick={() => handleSendOfflineInvite(offlineInviteData.inviteFrom)}
              className="w-full py-3 bg-[#ae7e89] hover:bg-[#9d6d78] text-white rounded-[14px] text-xs font-semibold cursor-pointer shadow-sm transition-colors flex items-center justify-center gap-2"
            >
              <span>💌</span>
              <span>
                {offlineInviteData.inviteFrom === 'other'
                  ? `让 ${characterProfile.nickname} 发送线下邀约函到聊天`
                  : '发送我的线下邀约函'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* 17. TOAST */}
      {toastMsg && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-20 bg-black/85 text-white px-3.5 py-1.5 rounded-full text-[11px] shadow-lg pointer-events-none z-50 animate-in fade-in">
          {toastMsg}
        </div>
      )}

    </div>
  );
}