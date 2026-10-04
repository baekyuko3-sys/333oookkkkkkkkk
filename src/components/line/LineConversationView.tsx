import { useState, useRef, useEffect } from 'react';
import { usePersistentState } from '../../store/usePersistentState';
import type { ImportedCharacter } from '../../data/characterImport';
import type { ScreenType, WorldBook } from '../../types';
import { generateCharacterReply, generateCreativeText, readStoredAiSettings, resolveChannelAiSettings, listOpenAiCompatibleModels, testAiConnection, summarizeConversationMemory, type AiSettings } from '../../ai/aiEngine';
import { generateImage, generateSpeech, transcribeAudio } from '../../ai/mediaEngine';
import { readAppSettings } from '../../store/appSettings';
import type { ChannelAiSettings } from '../../store/appSettings';
import { getMedia, putMedia } from '../../store/mediaVault';
import { addCharacterMemoryItem, getCharacterMemory, updateCharacterMemory } from '../../store/characterMemory';
import { getProjectManifest } from '../../store/projectManifest';
import { getCharacterProfile } from '../../data/characterProfiles';
import { getInitialChatMessages } from '../../data/characterChatSeeds';
import { upsertOfflineEvent, updateOfflineEvent } from '../../store/offlineEvents';
import { getLineGroupByName } from '../../store/lineGroups';
import { getGroupPreset, getGroupPresets } from '../../store/groupPresets';
import { getLineGroups } from '../../store/lineGroups';
import { createTogetherMusicSession, type TogetherMusicSession } from '../../store/togetherMusic';
import { emitWorldEvent, setCharacterRuntime } from '../../store/worldRuntime';
import { getStatusBarPresets, type StatusBarPreset } from '../../store/statusBarPresets';
import { getCotPresets, type CotPreset } from '../../store/cotPresets';
import { PresetResourceManager } from './PresetResourceManager';
import {
  Video, Settings, Plus, Mic, Send, Smile,
  Image as ImageIcon, Film, FileText, Calendar, Sliders, RefreshCw, X,
  PhoneOff, MicOff, Volume2, Sparkles, PlusCircle, BookOpen, UserCheck,
  Palette, SlidersHorizontal, Eye, Code, Users, ChevronRight, ChevronLeft,
  Edit3, Brain, Play, Check, Trash2, Copy, Sparkle, Compass, Terminal,
  Phone, Search, CornerUpLeft, Share2, Download, AlertCircle, VolumeX,
  CheckSquare, Square, Pin, PinOff, Bell, BellOff, Bookmark, BookmarkCheck,
  FileDown, MessageCircle, Heart, Music2
} from 'lucide-react';

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
  onBack: (draft?: string) => void;
  onNavigateHome: () => void;
  onNavigateScreen?: (screen: ScreenType) => void;
  initialDraft?: string;
  isGroup?: boolean;
  isPinned?: boolean;
  isMuted?: boolean;
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
  onBack,
  initialDraft = '',
  isGroup = false,
  isPinned = false,
  isMuted = false,
  onTogglePin,
  onToggleMute,
  onConversationActivity,
}: LineConversationViewProps) {
  // Input & Messages
  const [inputText, setInputText] = useState(initialDraft);
  const conversationStorageId = conversationId || characterId || contactName;
  const hasImportedCharacter = hasImportedCharacterInStorage(contactName, characterId);
  const [messages, setMessages] = usePersistentState<any[]>(
    `line:conversation:${conversationStorageId}`,
    hasImportedCharacter ? [] : getInitialChatMessages(contactName),
  );

  // Sheets & Overlays
  const [showPlusSheet, setShowPlusSheet] = useState(false);
  const [subSheetType, setSubSheetType] = useState<'image' | 'video' | 'file' | null>(null);
  const [showVoiceSheet, setShowVoiceSheet] = useState(false);
  const [showStickerSheet, setShowStickerSheet] = useState(false);
  const [showCreator, setShowCreator] = useState(false);
  const [showTogetherMusic, setShowTogetherMusic] = useState(false);
  const [musicTitle, setMusicTitle] = useState('');
  const [musicArtist, setMusicArtist] = useState('');
  const [musicUrl, setMusicUrl] = useState('');
  const [creatorType, setCreatorType] = useState<'image' | 'video' | 'file' | 'voice'>('image');
  const [creatorPrompt, setCreatorPrompt] = useState('');
  
  // Settings & Overlays
  const [showSettings, setShowSettings] = useState(false);
  const [chatApiOverride, setChatApiOverride] = usePersistentState<ChannelAiSettings>(`line:chat-api-override:${conversationStorageId}`, {
    ...readAppSettings().chatApiOverride,
    enabled: false,
  });
  const [chatApiModels, setChatApiModels] = useState<string[]>([]);
  const [chatApiBusy, setChatApiBusy] = useState<'models' | 'test' | null>(null);
  const conversationAiSettings = (): AiSettings => {
    if (!chatApiOverride.enabled) return readStoredAiSettings(importedCharacter?.id, contactName);
    const base = readStoredAiSettings(importedCharacter?.id, contactName);
    return {
      ...base,
      provider: chatApiOverride.provider,
      apiBaseUrl: chatApiOverride.apiBaseUrl,
      apiKey: chatApiOverride.apiKey,
      model: chatApiOverride.model,
      streaming: chatApiOverride.streaming,
      contextLength: chatApiOverride.contextLength,
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
  const [rerollPrompt, setRerollPrompt] = useState('');
  const [showTranscriptMap, setShowTranscriptMap] = useState<Record<number, boolean>>({});

  // 消息操作菜单 (长按/右键菜单 Context Menu & 引用回复)
  const [contextMenuMsg, setContextMenuMsg] = useState<any | null>(null);
  const [replyingToMsg, setReplyingToMsg] = useState<any | null>(null);

  // 语音通话状态 (Voice Audio Call)
  const [showAudioCall, setShowAudioCall] = useState(false);
  const [audioCallDuration, setAudioCallDuration] = useState(0);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);

  // 聊天记录内搜索
  const [showInChatSearch, setShowInChatSearch] = useState(false);
  const [inChatSearchQuery, setInChatSearchQuery] = useState('');

  // 转发弹窗
  const [forwardMsg, setForwardMsg] = useState<any | null>(null);

  // 全屏大图 Lightbox
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [mediaCache, setMediaCache] = useState<Record<string, string>>({});

  // 消息编辑状态 (In-place Message Edit)
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingMessageText, setEditingMessageText] = useState('');

  // 思维链 (Chain of Thought) 全局开关
  const [enableChainOfThought, setEnableChainOfThought] = useState(true);

  // 酒馆作者注释 (Author's Note / A/N)
  const [authorsNote, setAuthorsNote] = usePersistentState(`line:authors-note:${conversationStorageId}`, '');
  const [authorsNoteDepth, setAuthorsNoteDepth] = useState('3');

  // 普通聊天软件核心能力 (Standard Mobile Messenger Features)
  const [isTyping, setIsTyping] = useState(false);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState<number[]>([]);
  const [favorites, setFavorites] = usePersistentState<any[]>(`line:favorites:${conversationStorageId}`, []);
  const [showFavoritesModal, setShowFavoritesModal] = useState(false);
  const [showQuickPhrases, setShowQuickPhrases] = useState(false);
  const [quickPhrases, setQuickPhrases] = usePersistentState('line:quick-phrases', [
    '在忙吗？',
    '刚刚忙完回到家~',
    '今天有点累，想听听你的声音',
    '晚安，做个好梦 🌙',
    '明天见！别忘了带伞',
    '收到啦，马上处理！',
    '今天天气真好，想和你散步',
  ]);
  const [showGroupNotice, setShowGroupNotice] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [nudgeAvatar, setNudgeAvatar] = useState(false);
  const [localPinned, setLocalPinned] = useState(isPinned);
  const [localMuted, setLocalMuted] = useState(isMuted);
  const [togetherMusic, setTogetherMusic] = usePersistentState<TogetherMusicSession | null>('line:together-music:' + conversationStorageId, null);

  // 我的人设管理器 (User Persona Manager)
  const [showPersonaManager, setShowPersonaManager] = useState(false);
  const [userPersonas, setUserPersonas] = usePersistentState<any[]>('line:user-personas', []);
  const [activePersonaId, setActivePersonaId] = usePersistentState<string | null>('line:active-persona', null);
  const activePersona = userPersonas.find(p => p.id === activePersonaId) || {
    id: '',
    name: '',
    avatar: '',
    identity: '',
    gender: '',
    traits: '',
    background: '',
  };
  const [showNewPersonaModal, setShowNewPersonaModal] = useState(false);
  const [newPersonaData, setNewPersonaData] = useState({
    name: '',
    identity: '',
    gender: '女',
    traits: '',
    background: '',
  });

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
  const [importedCharacters] = usePersistentState<ImportedCharacter[]>('phone:characters', []);
  const importedCharacter = characterId
    ? importedCharacters.find(character => character.id === characterId) || null
    : importedCharacters.find(character => character.name === contactName) || null;
  const activeGroup = isGroup ? getLineGroupByName(contactName) : null;
  const groupAiMembers = activeGroup?.members
    .map(member => ({ member, character: importedCharacters.find(character => character.id === member.characterId || character.name === member.name) || null }))
    .filter(item => item.character && item.member.name !== currentUserNameFallback()) || [];
  const [worldbooks] = usePersistentState<WorldBook[]>('phone:worldbooks', []);
  const [lineFriends] = usePersistentState<Array<{ name: string; characterId?: string; note?: string; online?: boolean; pinyin?: string }>>('line:friends-list', []);
  const forwardRecipients = Array.from(new Set([
    ...lineFriends.map(friend => friend.name).filter(Boolean),
    ...getLineGroups().filter(group => group.id !== activeGroup?.id).map(group => group.name).filter(Boolean),
  ]));
  const characterMemory = getCharacterMemory(importedCharacter?.id || contactName, contactName);
  const projectManifest = getProjectManifest();

  // 酒馆角色核心档案
  const [characterProfile, setCharacterProfile] = usePersistentState(
    `line:character-profile:${conversationStorageId}`,
    getCharacterProfile(contactName, characterId),
  );

  // 酒馆世界书条目库 (Lorebook Entries)
  const [lorebooks, setLorebooks] = usePersistentState<any[]>(`line:lorebooks:${conversationStorageId}`, []);
  const [showLorebookInspector, setShowLorebookInspector] = useState(false);

  // 酒馆思维链预设系统 (Chain of Thought Presets)
  const [showCotPresetModal, setShowCotPresetModal] = useState(false);
  const [showPresetResourceManager, setShowPresetResourceManager] = useState<'status' | 'cot' | null>(null);
  const [cotPresets, setCotPresets] = usePersistentState<CotPreset[]>('line:cot-presets', getCotPresets());
  const [activeCotPresetId, setActiveCotPresetId] = usePersistentState(`line:cot-active:${conversationStorageId}`, 'cot-1');
  const activeCotPreset = cotPresets.find((p) => p.id === activeCotPresetId) || cotPresets[0];
  const [customCotTemplate, setCustomCotTemplate] = usePersistentState(`line:cot-custom:${conversationStorageId}`, activeCotPreset.template);

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
  const [activeStatusBarPresetId, setActiveStatusBarPresetId] = usePersistentState(`line:status-bar-active:${conversationStorageId}`, statusBarPresets[0]?.id || 'status-minimal');

  // 角色个人主页 (Threads / Twitter / LINE 混合风格)
  const [showCharacterProfile, setShowCharacterProfile] = useState(false);
  const [characterFeedPosts, setCharacterFeedPosts] = usePersistentState<any[]>(`line:character-feed:${conversationStorageId}`, []);

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
    showToast(`已应用思维链预设：${preset.title}`);
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  const handleSend = async () => {
    const userText = inputText.trim();
    if (!userText || isTyping) return;
    if (characterProfile.isBlockedByCharacter) { showToast('你已被对方拉黑，暂时无法发送消息'); return; }

    const msgId = Date.now();
    const newMsg: any = {
      id: msgId,
      sender: 'me',
      senderName: currentUserNameFallback() || activePersona?.name || '我',
      text: userText,
      time: '刚刚',
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
    setIsTyping(true);

    // 保留 LINE 的已读节奏，但回复本身改为真正的模型请求。
    window.setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, isRead: true } : m))
      );
    }, 1200);

    if (isGroup) {
      try {
      if (groupAiMembers.length === 0) {
        showToast('这个群还没有导入可接入 AI 的角色卡');
        return;
      }
      const mentioned = groupAiMembers.filter(({ member }) => userText.includes('@' + member.name) || userText.includes('@' + (member.nickname || '')));
      const pool = mentioned.length ? mentioned : groupAiMembers;
      const responders = pool.slice(0, mentioned.length && activeGroupPreset.mentionPriority ? 1 : Math.min(pool.length, activeGroupPreset.maxResponders));
      let workingMessages: any[] = [...messages, newMsg];
      for (let index = 0; index < responders.length; index += 1) {
        const { character } = responders[index];
        if (!character) continue;
        const memberProfile = getCharacterProfile(character.name, character.id);
        const memberMemory = getCharacterMemory(character.id, character.name);
        const replyMsgId = Date.now() + index + 1;
        setMessages(prev => [...prev, { id: replyMsgId, sender: 'other', senderName: character.name, text: '', time: '刚刚', type: 'ai-reply', showThinking: false }]);
        let streamedText = '';
        const result = await generateCharacterReply({
          settings: conversationAiSettings(),
          character,
          characterProfile: memberProfile,
          persona: activePersona,
          worldbooks,
          memory: memberMemory,
          project: projectManifest,
          messages: workingMessages,
          userMessage: userText,
          isGroup: true,
          authorNote: [authorsNote, '群聊预设：' + activeGroupPreset.name, activeGroupPreset.systemPrompt, groupNoticeText ? '群公告：' + groupNoticeText : ''].filter(Boolean).join('\n'),
          stylePreset: activeCotPreset?.title || selectedPreset,
          temperature: Number(presetTemp) || 0.85,
          onDelta: delta => {
            streamedText += delta;
            setMessages(prev => prev.map(m => m.id === replyMsgId ? { ...m, text: streamedText, senderName: character.name } : m));
          },
        });
        setMessages(prev => prev.map(m => m.id === replyMsgId ? { ...m, text: result.text, senderName: character.name, aiModel: result.model, matchedWorldbookEntries: result.matchedWorldbookEntries } : m));
        workingMessages = [...workingMessages, { id: replyMsgId, sender: 'other', senderName: character.name, text: result.text }];
        window.dispatchEvent(new CustomEvent('sane333:play-sound', { detail: { kind: 'message' } }));
      }
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : '群聊 AI 请求失败';
        // Keep the error path as normal source lines; never embed literal escape text here.
        showToast(message.length > 72 ? message.slice(0, 72) + '…' : message);
      } finally {
        setIsTyping(false);
      }
    }

    const replyMsgId = Date.now() + 1;
    setMessages((prev) => [
      ...prev,
      {
        id: replyMsgId,
        sender: 'other',
        text: '',
        time: '刚刚',
        type: 'ai-reply',
        showThinking: false,
      },
    ]);

    let streamedText = '';

    try {
      const settings = conversationAiSettings();
      const result = await generateCharacterReply({
        settings,
        character: importedCharacter,
        characterProfile,
        persona: activePersona,
        worldbooks,
        memory: characterMemory,
        project: projectManifest,
        messages: [...messages, newMsg],
        userMessage: userText,
        isGroup,
        authorNote: authorsNote,
        stylePreset: activeCotPreset?.title || selectedPreset,
        temperature: Number(presetTemp) || 0.85,
        onDelta: (delta) => {
          streamedText += delta;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === replyMsgId
                ? { ...m, text: streamedText, time: '刚刚' }
                : m
            )
          );
        },
      });

      // 非流式供应商或异常情况下，确保最终正文完整写入。
      setMessages((prev) =>
        prev.map((m) =>
          m.id === replyMsgId
            ? {
                ...m,
                text: result.text,
                time: '刚刚',
                type: 'ai-reply',
                aiModel: result.model,
                matchedWorldbookEntries: result.matchedWorldbookEntries,
              }
            : m
        )
      );

      window.dispatchEvent(new CustomEvent('sane333:play-sound', { detail: { kind: 'message' } }));

      if (importedCharacter) {
        setCharacterRuntime(importedCharacter.id, {
          activity: '正在与你聊天',
          mood: '注意力在你身上',
          lastInteractionAt: new Date().toISOString(),
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

      if (
        latestSettings.autoMemoryEnabled &&
        importedCharacter &&
        latestSettings.autoMemoryEveryMessages > 0 &&
        totalConversationMessages % latestSettings.autoMemoryEveryMessages === 0
      ) {
        void summarizeConversationMemory(
          conversationAiSettings(),
          contactName,
          characterMemory,
          [...messages, newMsg, { sender: 'other', text: result.text }]
        ).then(memoryResult => {
          if (memoryResult.summary.trim()) {
            updateCharacterMemory(importedCharacter.id, importedCharacter.name, {
              summary: memoryResult.summary,
            });
          }
          for (const item of memoryResult.items) {
            addCharacterMemoryItem(importedCharacter.id, importedCharacter.name, item.content, {
              source: 'ai-summary',
              importance: item.importance,
              kind: item.kind,
            });
          }
          window.dispatchEvent(new CustomEvent('sane333:memory-updated', {
            detail: { characterId: importedCharacter.id },
          }));
          showToast('长期记忆已自动整理 ✦');
        }).catch(() => {
          // Memory maintenance must never interrupt the conversation.
        });
      }

      // 角色好感度微增
      if (characterProfile.canAutoChangeRelation) {
        setStatusData((prev) => ({ ...prev, favor: String(Number(prev.favor) + 1) }));
      }
    } catch (error) {
      setMessages((prev) => {
        const partial = prev.find(m => m.id === replyMsgId)?.text;
        return partial
          ? prev.map(m => m.id === replyMsgId ? { ...m, text: partial } : m)
          : prev.filter(m => m.id !== replyMsgId);
      });

      if (error instanceof Error && error.message === 'AI_NOT_CONFIGURED') {
        showToast('还没有配置 AI：打开「设置」填写 API Key');
      } else if (error instanceof Error && error.message === 'AI_BASE_URL_MISSING') {
        showToast('OpenAI Compatible 需要填写 API Base URL');
      } else {
        const message = error instanceof Error ? error.message : 'AI 请求失败';
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
    setMessages((prev) => prev.filter((m) => !selectedMsgIds.includes(m.id)));
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
    setMessages([
      {
        id: Date.now(),
        sender: 'system',
        type: 'system-nudge',
        text: '聊天记录已清空',
        time: '刚刚'
      }
    ]);
    setShowClearConfirm(false);
    setShowSettings(false);
    showToast('已清空所有聊天记录');
  };

  // 消息撤回 (我方撤回)
  const handleRecallMessage = (msgId: number) => {
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

  // AI 动态推演角色与用户关系、称呼
  const handleAiUpdateRelationship = () => {
    showToast('AI 正在分析聊天记录、好感度与世界书……');
    setTimeout(() => {
      const currentFavorNum = Number(statusData.favor) || 90;
      let newRel = '心意相通 · 晚间常伴的特别存在';
      let newCall = '我的小摄影师';
      if (currentFavorNum >= 95) {
        newRel = '已确认心意 · 双向偏爱的恋人未满';
        newCall = '我的宝藏女孩';
      }
      setCharacterProfile((prev) => ({
        ...prev,
        relationship: newRel,
        callMe: newCall,
      }));
      showToast(`已推演更新关系：${newRel}，专属称呼：${newCall} ✨`);
    }, 1200);
  };

  // AI 推演群聊人际关系网
  const handleAiInferGroupRelations = () => {
    if (groupAiMembers.length < 2) {
      showToast('当前群聊至少需要两名角色，才能推演人物关系网络');
      return;
    }
    showToast('正在结合当前群成员、聊天记录与世界书推演关系网络……');
    window.setTimeout(() => {
      const inferred = groupAiMembers.slice(0, 6).map((item, index) => ({
        from: item.member.name,
        to: index === 0 ? '我' : groupAiMembers[index - 1].member.name,
        relation: '待继续推演',
      }));
      setGroupRelationships(inferred);
      showToast('已基于当前群成员建立关系网络框架');
    }, 600);
  };

  // 表情回应 (Reaction)
  const handleAddReaction = (msgId: number, emoji: string) => {
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

  // 酒馆“继续 (Continue)”生成
  const handleContinueGenerating = () => {
    showToast('AI 正在继续生成后半段……');
    setTimeout(() => {
      const continuationMsg = {
        id: Date.now(),
        sender: 'other',
        thinking: '【角色潜意识】刚才的话好像还没表达完整，想再多补充一句关照。',
        showThinking: false,
        text: '顺便……明早想喝什么？路过那家烘焙店的时候，我顺路带给你。',
        time: '刚刚',
      };
      setMessages((prev) => [...prev, continuationMsg]);
    }, 1000);
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
          duration: Math.max(1, Math.round(prompt.length / 5)) + '"',
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
      voice: { label: '文字语音', descTitle: '语音内容/描述' },
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
          const newMsg = {
            id: Date.now(),
            sender: 'me',
            type: type === 'voice' ? 'voice' : 'real-media',
            mediaType: type,
            fileName: file.name,
            mediaRef,
            transcript: type === 'voice' ? '（本地语音消息）' : undefined,
            duration: type === 'voice' ? '语音' : undefined,
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
          setMessages(prev => [...prev, {
            id: replyMsgId,
            sender: 'other',
            type: 'ai-reply',
            text: '',
            time: '刚刚',
            showThinking: false,
          }]);

          let streamed = '';
          try {
            const result = await generateCharacterReply({
              settings,
              character: importedCharacter,
              characterProfile,
              persona: activePersona,
              worldbooks,
              memory: characterMemory,
              project: projectManifest,
              messages: [
                ...messages,
                {
                  sender: 'me',
                  text: '我给你发了一张图片，请看看这张图片并自然回应。',
                  imageData: mediaUrl,
                },
              ],
              userMessage: '我给你发了一张图片，请看看这张图片并自然回应。',
              isGroup,
              authorNote: authorsNote,
              stylePreset: activeCotPreset?.title || selectedPreset,
              temperature: Number(presetTemp) || 0.85,
              onDelta: delta => {
                streamed += delta;
                setMessages(prev => prev.map(message =>
                  message.id === replyMsgId ? { ...message, text: streamed } : message
                ));
              },
            });

            if (!result) throw new Error('图片理解失败');

            setMessages(prev => prev.map(message =>
              message.id === replyMsgId
                ? { ...message, text: result.text, aiModel: result.model }
                : message
            ));

            const latestSettings = readAppSettings();
            if (latestSettings.voiceEnabled && latestSettings.autoSpeakAiReplies) {
              try { await generateSpeech(result.text, latestSettings); } catch {}
            }
          } catch (error) {
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

  // 保存消息原地编辑
  const handleSaveMessageEdit = (id: number) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, text: editingMessageText } : m))
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
      { id: String(Date.now()), time: newScheduleTime, title: newScheduleTitle.trim() },
    ]);
    setNewScheduleTitle('');
    setShowAddScheduleRow(false);
    showToast('已添加新日程');
  };

  // 重新生成 (Reroll)
  const handleDoReroll = () => {
    if (!rerollPrompt.trim()) {
      showToast('告诉 AI 这一轮怎么改');
      return;
    }
    setShowReroll(false);
    setRerollPrompt('');
    showToast('正在重新生成这一条……');
  };

  // 状态栏 HTML
  const renderStatusHtml = () => {
    return statusFormat
      .replace(/\{\{location\}\}/g, statusData.location)
      .replace(/\{\{time\}\}/g, statusData.time)
      .replace(/\{\{activity\}\}/g, statusData.activity)
      .replace(/\{\{mood\}\}/g, statusData.mood)
      .replace(/\{\{favor\}\}/g, statusData.favor);
  };

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
    <div className={`relative w-full h-full flex flex-col ${wallpaperClass} text-[#343538] select-none font-sans overflow-hidden transition-colors duration-300 custom-chat-view`}>
      
      {/* 实时注入自定义 CSS (Live Injected Custom CSS) */}
      <style dangerouslySetInnerHTML={{ __html: customCss }} />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0] && subSheetType) {
            handleRealUpload(subSheetType, e.target.files[0]);
          }
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
                    <span className="text-[9px] text-[#ae7e89] bg-[#faf1f3] px-1 rounded-sm shrink-0">
                      {characterProfile.relationship}
                    </span>
                  </div>
                  <div className="text-[10px] text-[#aaa] mt-0.5 flex items-center gap-1">
                    {isTyping ? (
                      <span className="text-[#ae7e89] font-medium animate-pulse flex items-center gap-1">
                        <span>对方正在输入</span>
                        <span className="inline-block animate-bounce">.</span>
                        <span className="inline-block animate-bounce delay-100">.</span>
                        <span className="inline-block animate-bounce delay-200">.</span>
                      </span>
                    ) : (
                      <span>在线 · 点击看状态栏与主页 · 双击拍一拍</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Actions: Search, Audio Call, Video Call, Settings */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowInChatSearch(!showInChatSearch)}
                className="w-8 h-8 rounded-full hover:bg-neutral-50 flex items-center justify-center text-[#555]"
                title="搜索聊天记录"
              >
                <Search className="w-4 h-4 stroke-[1.7]" />
              </button>

              <button
                onClick={() => setShowAudioCall(true)}
                className="w-8 h-8 rounded-full hover:bg-neutral-50 flex items-center justify-center text-[#303033]"
                title="语音通话"
              >
                <Phone className="w-4 h-4 stroke-[1.7]" />
              </button>

              <button
                onClick={() => setShowTogetherMusic(true)}
                className="w-8 h-8 rounded-full hover:bg-neutral-50 flex items-center justify-center text-[#8b7560]"
                title="一起听歌"
              >
                <Music2 className="w-4 h-4 stroke-[1.7]" />
              </button>

              <button
                onClick={() => setShowVideoCall(true)}
                className="w-8 h-8 rounded-full hover:bg-neutral-50 flex items-center justify-center text-[#303033]"
                title="视频通话"
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

              {onNavigateScreen && !isGroup && characterId && (
                <button
                  onClick={() => {
                    try { window.localStorage.setItem('phone:memory-active-character', characterId); } catch {}
                    onNavigateScreen('memory');
                  }}
                  className="w-8 h-8 rounded-full hover:bg-neutral-50 flex items-center justify-center text-[#8b7560]"
                  title="打开这个角色的长期记忆"
                >
                  <Brain className="w-4 h-4 stroke-[1.7]" />
                </button>
              )}

              <button
                onClick={() => setShowSettings(true)}
                className="w-8 h-8 rounded-full hover:bg-neutral-50 flex items-center justify-center text-[#303033]"
                title="聊天设置与酒馆设定"
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
            <span className="font-semibold">群公告：</span>
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
        <div className="h-10 px-3 bg-[#f8f8fa] border-b border-[#ededee] flex items-center gap-2 animate-in slide-in-from-top duration-200">
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
      )}

      {/* 2. MESSAGES STREAM */}
      <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-4 no-scrollbar">
        <div className="text-center text-[10px] text-[#b3b3b7] my-1">
          今天
        </div>

        {messages.map((msg) => {
          if (msg.type === 'music-together') {
            const session = msg.musicSession as TogetherMusicSession | undefined;
            if (!session) return null;
            return (
              <div key={msg.id} className={'flex ' + (msg.sender === 'me' ? 'justify-end' : 'justify-start') + ' mb-2'}>
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
              <div key={msg.id} className="flex justify-center my-1.5 animate-in fade-in">
                <span className="text-[10px] text-[#999b9f] bg-[#f5f5f6] border border-[#ececee] px-3 py-1 rounded-full shadow-2xs">
                  {msg.text}
                </span>
              </div>
            );
          }

          const isMe = msg.sender === 'me';
          const hasThinking = Boolean(msg.thinking) && enableChainOfThought;
          const hasVariants = msg.variants && msg.variants.length > 1;

          return (
            <div
              key={msg.id}
              className={`flex items-end gap-2 group ${isMe ? 'justify-end' : 'justify-start'}`}
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
                <div
                  onClick={() => {
                    if (isGroup) {
                      setInputText((prev) => `${prev}@${msg.senderName || characterProfile.nickname} `);
                    } else {
                      handleMessageAvatarClick();
                    }
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    handleMessageAvatarDoubleClick(msg.senderName || characterProfile.nickname);
                  }}
                  className={`w-[31px] h-[31px] rounded-full bg-[#f2f2f3] flex items-center justify-center overflow-hidden shrink-0 self-start mt-0.5 cursor-pointer hover:opacity-80 active:scale-95 transition-all ${
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
              )}

              {/* Time for me */}
              {isMe && (
                <span className="text-[9px] text-[#b8b8bb] pb-0.5">
                  {msg.time}
                </span>
              )}

              {/* Bubble content container */}
              <div className="max-w-[78%] space-y-1.5">
                
                {/* 1. 酒馆思维链 (Chain of Thought / 内心独白折叠卡) */}
                {!isMe && hasThinking && (
                  <div className="thinking-card bg-[#faf8f9] border border-[#f0e4e7] rounded-[12px] p-2 text-xs transition-all">
                    <div className="w-full flex items-center justify-between text-[10.5px] font-medium text-[#ae7e89]">
                      <div
                        onClick={() =>
                          setMessages((prev) =>
                            prev.map((m) =>
                              m.id === msg.id ? { ...m, showThinking: !m.showThinking } : m
                            )
                          )
                        }
                        className="flex items-center gap-1.5 cursor-pointer hover:opacity-80"
                      >
                        <Brain className="w-3.5 h-3.5 text-[#d4aab5]" />
                        <span>思维链预设 · {activeCotPreset.title.replace('预设', '')}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowCotPresetModal(true);
                          }}
                          className="text-[9px] text-[#ae7e89] bg-white border border-[#f0dee3] px-1.5 py-0.5 rounded cursor-pointer hover:bg-[#faf1f3]"
                          title="切换或自定义思维链预设"
                        >
                          ⚙ 预设
                        </button>
                        <span
                          onClick={() =>
                            setMessages((prev) =>
                              prev.map((m) =>
                                m.id === msg.id ? { ...m, showThinking: !m.showThinking } : m
                              )
                            )
                          }
                          className="text-[10px] text-[#b88c97] cursor-pointer"
                        >
                          {msg.showThinking ? '收起 ▴' : '展开内心OS ▾'}
                        </span>
                      </div>
                    </div>

                    {msg.showThinking && (
                      <div className="mt-2 pt-2 border-t border-[#f2e6e9] text-[11px] leading-relaxed text-[#666] font-mono whitespace-pre-wrap animate-in fade-in">
                        {msg.thinking}
                      </div>
                    )}
                  </div>
                )}

                {/* 2. 主消息体 */}
                {msg.isRecalled ? (
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
                ) : editingMessageId === msg.id ? (
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
                      onClick={() =>
                        setShowTranscriptMap((prev) => ({ ...prev, [msg.id]: !prev[msg.id] }))
                      }
                      className="min-w-[145px] py-2 px-3 bg-[#f5f5f6] hover:bg-[#eeeff1] rounded-[16px] flex items-center gap-2.5 cursor-pointer shadow-2xs transition-colors"
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
                      <span className="text-[10px] text-[#999]">{msg.duration}</span>
                    </div>

                    {(msg.audioUrl || (msg.mediaRef && mediaCache[msg.mediaRef])) && (
                      <audio controls preload="none" src={msg.audioUrl || mediaCache[msg.mediaRef]} className="w-[190px] h-8 mt-1" />
                    )}
                    {showTranscriptMap[msg.id] && (
                      <div className="p-2.5 rounded-[9px] bg-[#fafafa] border border-[#f0f0f1] text-[#888] text-[10px] leading-relaxed animate-in fade-in">
                        语音转文字：<br />
                        {msg.transcript || '未提供转写'}
                      </div>
                    )}
                  </div>
                ) : (
                  /* 常规文本气泡 (支持引用、长按菜单、表情反应) */
                  <div className="relative">
                    <div
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenuMsg(msg);
                      }}
                      className={`rounded-[16px] px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap select-text ${
                        isMe
                          ? 'bubble-me bg-[#f7eef0] text-[#303034]'
                          : 'bubble-other bg-[#f5f5f6] text-[#303034]'
                      }`}
                    >
                      {/* 引用回复预览 (Quoted message) */}
                      {msg.quote && (
                        <div className="mb-1.5 pb-1 border-b border-black/10 text-[10.5px] text-[#777] flex items-center gap-1">
                          <CornerUpLeft className="w-3 h-3 text-[#ae7e89] shrink-0" />
                          <span className="font-semibold text-[#555]">{msg.quote.sender}:</span>
                          <span className="truncate">{msg.quote.text}</span>
                        </div>
                      )}

                      {msg.text}
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

                  {!msg.isRecalled && (
                    <button
                      onClick={() => setContextMenuMsg(msg)}
                      className="hover:text-[#ae7e89] flex items-center gap-0.5 cursor-pointer"
                      title="操作菜单"
                    >
                      <span>操作</span>
                    </button>
                  )}

                  {!msg.isRecalled && (
                    <button
                      onClick={() => {
                        setEditingMessageId(msg.id);
                        setEditingMessageText(msg.text);
                      }}
                      className="hover:text-[#ae7e89] flex items-center gap-0.5 cursor-pointer"
                      title="原地编辑消息"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>编辑</span>
                    </button>
                  )}
                </div>

              </div>

              {/* Time & LINE Iconic "已读" status for me */}
              {isMe && !msg.isRecalled && (
                <div className="flex flex-col items-end text-[9px] text-[#b8b8bb] pb-0.5 leading-none shrink-0">
                  {msg.isRead && (
                    <span className="text-[8.5px] text-[#ae7e89] font-medium mb-0.5">已读</span>
                  )}
                  <span>{msg.time}</span>
                </div>
              )}

              {/* Time for other */}
              {!isMe && !msg.isRecalled && (
                <span className="text-[9px] text-[#b8b8bb] pb-0.5">
                  {msg.time}
                </span>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* 底部继续按钮 (酒馆 Continue 机制) */}
      <div className="px-4 py-1 flex justify-center">
        <button
          onClick={handleContinueGenerating}
          className="px-3 py-1 bg-white/90 hover:bg-white border border-[#ededee] rounded-full text-[10px] text-[#888] hover:text-[#ae7e89] flex items-center gap-1 shadow-2xs backdrop-blur-sm cursor-pointer transition-colors"
        >
          <Play className="w-2.5 h-2.5 fill-current" />
          <span>让角色继续说……</span>
        </button>
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
            <div className="min-h-[58px] flex items-center px-2 py-1.5 gap-1.5">
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
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  rows={1}
                  placeholder="输入消息…"
                  className="w-full resize-none bg-transparent outline-none text-[13px] text-[#333] placeholder-[#aaa] py-1 font-sans"
                />
              </div>

              {/* 快捷短语按钮 (Quick Phrases) */}
              <button
                onClick={() => setShowQuickPhrases(true)}
                className="w-[32px] h-[38px] flex items-center justify-center text-[#777] hover:text-[#ae7e89] cursor-pointer"
                title="常用快捷短语"
              >
                <MessageCircle className="w-4 h-4 stroke-[1.65]" />
              </button>

              {/* Sticker Button */}
              <button
                onClick={() => setShowStickerSheet(true)}
                className="w-[32px] h-[38px] flex items-center justify-center text-[#555] hover:text-black cursor-pointer"
              >
                <Smile className="w-5 h-5 stroke-[1.65]" />
              </button>

              {/* Send Button */}
              <button
                onClick={handleSend}
                className="w-[34px] h-[38px] flex items-center justify-center text-[#c98f9d] hover:text-[#ae7e89] cursor-pointer"
              >
                <Send className="w-5 h-5 stroke-[1.65]" />
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

              {/* 日程 */}
              <button
                onClick={() => {
                  setShowPlusSheet(false);
                  setShowScheduleModal(true);
                }}
                className="flex flex-col items-center gap-1.5 cursor-pointer"
              >
                <div className="w-12 h-12 rounded-[14px] bg-[#f7f7f8] flex items-center justify-center text-[#666] hover:bg-[#f0f0f2]">
                  <Calendar className="w-5 h-5" />
                </div>
                <span>角色日程</span>
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
                <span>继续生成</span>
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

                return (
                  <div
                    key={persona.id}
                    onClick={() => {
                      setActivePersonaId(persona.id);
                      showToast(`已切换为身份：${persona.name}`);
                    }}
                    className={`p-3.5 rounded-[14px] border transition-all cursor-pointer ${
                      isActive
                        ? 'border-[#d4aab5] bg-[#fdf9fa] shadow-2xs ring-1 ring-[#d4aab5]/40'
                        : 'border-[#ededee] bg-white hover:bg-neutral-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-full overflow-hidden border border-[#eee] shrink-0">
                          <img
                            src={persona.avatar}
                            alt={persona.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-[13.5px] text-[#222]">
                              {persona.name}
                            </span>
                            <span className="text-[10px] text-[#888] bg-[#f0f0f2] px-1.5 py-0.2 rounded-md">
                              {persona.identity}
                            </span>
                          </div>
                          <div className="text-[10px] text-[#aaa] mt-0.5">
                            {persona.traits}
                          </div>
                        </div>
                      </div>

                      {isActive ? (
                        <span className="text-[10px] bg-[#d4aab5] text-white px-2 py-0.5 rounded-full font-medium">
                          当前使用 ✓
                        </span>
                      ) : (
                        <span className="text-[10px] text-[#bbb] hover:text-[#ae7e89]">
                          点击切换
                        </span>
                      )}
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-[#f2f2f4] text-[11px] text-[#666] leading-relaxed">
                      <span className="font-medium text-[#444]">背景渊源：</span>
                      {persona.background}
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
            <div>
              <span className="text-[#666] font-medium">你的名字 / 昵称</span>
              <input
                value={newPersonaData.name}
                onChange={(e) => setNewPersonaData({ ...newPersonaData, name: e.target.value })}
                placeholder="例如：苏念"
                className="w-full p-2 bg-[#fafafa] border border-[#e8e8e9] rounded-md text-xs mt-1"
              />
            </div>
            <div>
              <span className="text-[#666] font-medium">身份 / 职业</span>
              <input
                value={newPersonaData.identity}
                onChange={(e) => setNewPersonaData({ ...newPersonaData, identity: e.target.value })}
                placeholder="例如：法学院研究生"
                className="w-full p-2 bg-[#fafafa] border border-[#e8e8e9] rounded-md text-xs mt-1"
              />
            </div>
            <div>
              <span className="text-[#666] font-medium">性格与偏好特征</span>
              <input
                value={newPersonaData.traits}
                onChange={(e) => setNewPersonaData({ ...newPersonaData, traits: e.target.value })}
                placeholder="例如：温和沉着、条理清晰、偏爱黑巧"
                className="w-full p-2 bg-[#fafafa] border border-[#e8e8e9] rounded-md text-xs mt-1"
              />
            </div>
            <div>
              <span className="text-[#666] font-medium">与当前角色的前置渊源</span>
              <textarea
                value={newPersonaData.background}
                onChange={(e) => setNewPersonaData({ ...newPersonaData, background: e.target.value })}
                placeholder="例如：自小相识，因他搬家多年未见，如今再度重聚……"
                className="w-full h-24 p-2 bg-[#fafafa] border border-[#e8e8e9] rounded-md text-xs mt-1 leading-relaxed resize-none"
              />
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
                  avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=200&q=80',
                  identity: newPersonaData.identity || '旅人',
                  gender: newPersonaData.gender,
                  traits: newPersonaData.traits || '温和自然',
                  background: newPersonaData.background || '彼此相识的朋友',
                  isDefault: false,
                };
                setUserPersonas([...userPersonas, newP]);
                setActivePersonaId(newP.id);
                setShowNewPersonaModal(false);
                setNewPersonaData({ name: '', identity: '', gender: '女', traits: '', background: '' });
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

      {/* 11. 渲染好的酒馆状态栏抽屉 (点击头像弹出) */}
      {showRenderedStatusBarModal && (
        <div
          onClick={() => setShowRenderedStatusBarModal(false)}
          className="absolute inset-0 bg-black/25 z-55 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[24px] p-5 pb-8 space-y-4 animate-in slide-in-from-bottom max-h-[85%] flex flex-col shadow-2xl"
          >
            <div className="w-9 h-1 bg-[#ddd] rounded-full mx-auto" />

            {/* 角色卡片头部 */}
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-3">
                <div className="w-[50px] h-[50px] rounded-full bg-[#f1f1f2] border border-[#ededee] flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
                  <svg className="w-8 h-8 text-[#999]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 21c.8-4 3.5-6 8-6s7.2 2 8 6" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[16px] text-[#222]">{characterProfile.nickname}</span>
                    <span className="text-[9.5px] text-[#ae7e89] bg-[#faf1f3] px-2 py-0.5 rounded-full font-medium border border-[#f0dee3]">
                      {characterProfile.relationship}
                    </span>
                  </div>
                  <div className="text-[10px] text-[#aaa] mt-0.5">
                    @guyan.whisper · {characterProfile.birthday}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowRenderedStatusBarModal(false)}
                className="w-7 h-7 rounded-full bg-[#f5f5f7] hover:bg-[#eaeaea] text-[#777] flex items-center justify-center text-sm cursor-pointer"
              >
                ×
              </button>
            </div>

            {/* 快捷操作栏：查看主页 & 拍一拍 */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => {
                  setShowRenderedStatusBarModal(false);
                  setShowCharacterProfile(true);
                }}
                className="py-2.5 px-3 bg-[#faf1f3] hover:bg-[#f6e6e9] text-[#ae7e89] rounded-[12px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer border border-[#f0dee3] shadow-2xs transition-colors"
              >
                <span>📱</span>
                <span>查看TA的个人主页</span>
              </button>

              <button
                onClick={() => {
                  handleNudge(characterProfile.nickname);
                  setShowRenderedStatusBarModal(false);
                }}
                className="py-2.5 px-3 bg-[#f5f5f7] hover:bg-[#ececee] text-[#555] rounded-[12px] font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <span>💫</span>
                <span>拍一拍TA</span>
              </button>
            </div>

            {/* 渲染好的酒馆状态栏 (Rendered HTML Status Bar) */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-[11px] text-[#777]">
                <div className="flex items-center gap-1 font-semibold text-[#444]">
                  <Sparkles className="w-3.5 h-3.5 text-[#ae7e89]" />
                  <span>实时酒馆状态栏 (HTML已渲染)：</span>
                </div>
                <button
                  onClick={() => {
                    showToast('AI 正在推演角色最新动态……');
                    setTimeout(() => {
                      setStatusData({
                        location: '书房 · 窗边单人沙发',
                        time: '23:10',
                        activity: '泡了一杯热洋甘菊茶，听着你那边的动静',
                        mood: '温柔而专注，只想把时间留给你',
                        favor: String(Number(statusData.favor) + 1),
                      });
                      showToast('角色状态已结合最新剧情刷新 ✨');
                    }, 800);
                  }}
                  className="text-[10px] text-[#ae7e89] hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>刷新状态</span>
                </button>
              </div>

              {/* 渲染容器 */}
              <div className="p-4 bg-[#fafafa] border border-[#ececee] rounded-[16px] shadow-2xs">
                <div
                  dangerouslySetInnerHTML={{ __html: renderStatusHtml() }}
                  className="prose prose-xs max-w-none text-xs text-[#333] [&_.tavern-status]:space-y-2 [&_.badge]:inline-flex [&_.badge]:items-center [&_.badge]:bg-white [&_.badge]:border [&_.badge]:border-[#e5e5e7] [&_.badge]:text-[#444] [&_.badge]:px-2.5 [&_.badge]:py-1 [&_.badge]:rounded-lg [&_.badge]:text-[11px] [&_.badge]:mr-1.5 [&_.badge]:shadow-2xs [&_.badge-pink]:inline-flex [&_.badge-pink]:items-center [&_.badge-pink]:bg-[#faf1f3] [&_.badge-pink]:border [&_.badge-pink]:border-[#f0dee3] [&_.badge-pink]:text-[#ae7e89] [&_.badge-pink]:px-2.5 [&_.badge-pink]:py-1 [&_.badge-pink]:rounded-lg [&_.badge-pink]:text-[11px] [&_.badge-pink]:font-semibold [&_.mood]:text-[11.5px] [&_.mood]:text-[#666] [&_.mood]:mt-2 [&_.mood]:italic"
                />
              </div>
            </div>

            {/* 底部跳转设置 */}
            <div className="pt-2 border-t border-[#f0f0f1] flex items-center justify-between text-xs">
              <button
                onClick={() => {
                  setShowRenderedStatusBarModal(false);
                  setShowPresetResourceManager('status');
                }}
                className="text-[11px] text-[#888] hover:text-[#ae7e89] flex items-center gap-1 cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>管理全部状态栏 / 导入导出 ›</span>
              </button>
              <button
                onClick={() => setShowRenderedStatusBarModal(false)}
                className="px-4 py-1.5 bg-[#f5f5f7] hover:bg-[#eaeaea] text-[#555] rounded-full text-xs font-medium cursor-pointer"
              >
                知道了
              </button>
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
            <span className="font-semibold text-sm text-[#333]">聊天设置与酒馆设定</span>
            <div className="w-8" />
          </div>

          <div className="p-4 space-y-4 flex-1 overflow-y-auto text-xs pb-10">

            <div className="bg-white rounded-[14px] border border-[#f0f0f1] p-3.5 space-y-3">
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
                  <select value={chatApiOverride.model} onChange={e => updateChatApiOverride({ model: e.target.value })} className="flex-1 p-2 bg-[#fafafa] border border-[#e8e8e9] rounded-[9px] text-[10px] outline-none">
                    <option value="">选择模型</option>{chatApiModels.map(model => <option key={model} value={model}>{model}</option>)}{chatApiOverride.model && !chatApiModels.includes(chatApiOverride.model) && <option value={chatApiOverride.model}>{chatApiOverride.model}</option>}
                  </select>
                  <button onClick={fetchChatApiModels} className="px-2.5 rounded-[9px] bg-[#f0e6e8] text-[#8c5f6b] text-[9px]">{chatApiBusy === 'models' ? '拉取中…' : '拉取模型'}</button>
                </div>
                <button onClick={testChatApi} className="w-full py-2 rounded-[9px] bg-[#292724] text-white text-[10px]">{chatApiBusy === 'test' ? '测试中…' : '测试连接'}</button>
              </div>}
            </div>

            {/* Section -1: 聊天偏好 (置顶 / 免打扰 / 背景 / 收藏 / 导出) */}
            <div className="bg-white rounded-[14px] border border-[#f0f0f1] p-3.5 space-y-3">
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
            
            {/* Section 0: 思维链预设系统 (Chain of Thought Presets) */}
            <div className="bg-white rounded-[14px] border border-[#f0f0f1] p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-medium text-[#333]">
                  <Brain className="w-4 h-4 text-[#ae7e89]" />
                  <span>角色思维链预设 (CoT Presets)</span>
                </div>
                <div
                  onClick={() => setEnableChainOfThought(!enableChainOfThought)}
                  className={`w-9 h-5 rounded-full relative cursor-pointer transition-colors ${
                    enableChainOfThought ? 'bg-[#d4aab5]' : 'bg-[#ddd]'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
                      enableChainOfThought ? 'left-4.5' : 'left-0.5'
                    }`}
                  />
                </div>
              </div>

              {/* 点击进入思维链预设管理器 */}
              <div
                onClick={() => {
                  setShowSettings(false);
                  setShowCotPresetModal(true);
                }}
                className="p-2.5 rounded-[10px] bg-[#faf8f9] border border-[#f0e4e7] flex items-center justify-between cursor-pointer hover:bg-[#f6eff1] transition-colors"
              >
                <div>
                  <div className="font-semibold text-xs text-[#ae7e89]">
                    当前预设：{activeCotPreset.title}
                  </div>
                  <div className="text-[10px] text-[#888] mt-0.5 leading-snug">
                    {activeCotPreset.description}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#aaa] shrink-0 ml-2" />
              </div>
            </div>

            {/* Section 0.5: 作者注释 (Author's Note / A/N) */}
            <div className="bg-white rounded-[14px] border border-[#f0f0f1] p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[#333] flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-[#ae7e89]" />
                  <span>作者注释 (Author's Note)</span>
                </span>
                <span className="text-[10px] text-[#888]">注入深度: {authorsNoteDepth}</span>
              </div>
              <textarea
                value={authorsNote}
                onChange={(e) => setAuthorsNote(e.target.value)}
                placeholder="[指导原则: ...]"
                className="w-full h-16 p-2 bg-[#fafafa] border border-[#e8e8e9] rounded-md text-xs font-sans leading-relaxed resize-none"
              />
            </div>

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
                    <span className="text-[#444] font-medium">角色昵称 / 备注</span>
                    <input
                      value={characterProfile.nickname}
                      onChange={(e) => setCharacterProfile({ ...characterProfile, nickname: e.target.value })}
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
                        onClick={handleAiUpdateRelationship}
                        className="text-[10px] text-[#ae7e89] hover:underline flex items-center gap-1 cursor-pointer font-medium"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>角色自主更新关系</span>
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
                      <div className="font-medium text-[#333]">角色可以自己更改关系</div>
                      <div className="text-[10px] text-[#aaa]">角色可随聊天好感度或情节自主提出推进或改变关系</div>
                    </div>
                    <div
                      onClick={() =>
                        setCharacterProfile({
                          ...characterProfile,
                          canAutoChangeRelation: !characterProfile.canAutoChangeRelation,
                        })
                      }
                      className={`w-9 h-5 rounded-full relative cursor-pointer transition-colors ${
                        characterProfile.canAutoChangeRelation ? 'bg-[#d4a3ad]' : 'bg-[#ddd]'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
                          characterProfile.canAutoChangeRelation ? 'left-4.5' : 'left-0.5'
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
                        <span className="text-[#444] font-medium">角色对我的昵称 / 专属备注</span>
                        <span className="text-[9.5px] text-[#aaa] ml-1.5">(对方叫我什么)</span>
                      </div>
                      <button
                        onClick={() => {
                          const nicknames = ['小朋友', '阿念', '小摄影师', '我家小朋友', '小祖宗'];
                          const picked = nicknames[Math.floor(Math.random() * nicknames.length)];
                          setCharacterProfile((prev) => ({ ...prev, callMe: picked }));
                          showToast(`角色已自拟对你的专属称呼：「${picked}」✨`);
                        }}
                        className="text-[10px] text-[#ae7e89] hover:underline flex items-center gap-1 cursor-pointer font-medium"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>角色自拟称呼</span>
                      </button>
                    </div>
                    <input
                      value={characterProfile.callMe}
                      onChange={(e) => setCharacterProfile({ ...characterProfile, callMe: e.target.value })}
                      className="w-full p-2 bg-[#fafafa] border border-[#e8e8e9] rounded-md text-xs text-[#333]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Section 2: 世界书选择 (Lorebook) */}
            <div className="space-y-1.5">
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
                  value={isGroup ? groupLorebookActive : characterProfile.selectedLorebook}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (isGroup) {
                      setGroupLorebookActive(val);
                    } else {
                      setCharacterProfile({ ...characterProfile, selectedLorebook: val });
                    }
                  }}
                  className="w-full p-2 bg-[#f8f8fa] border border-[#e8e8e9] rounded-[10px] text-xs outline-none text-[#333]"
                >
                  {lorebooks.map((book) => (
                    <option key={book.id} value={book.title}>
                      {book.title} ({book.entriesCount}条目)
                    </option>
                  ))}
                </select>

                {showLorebookInspector && (
                  <div className="p-2.5 bg-[#faf8f9] rounded-[10px] border border-[#f0e4e7] space-y-1.5 animate-in fade-in">
                    <div className="font-semibold text-[11px] text-[#333]">生效词条触发器：</div>
                    <div className="text-[10px] text-[#888] leading-relaxed">
                      当对话中出现 <code className="text-[#ae7e89]">便利店</code>、<code className="text-[#ae7e89]">雨伞</code>、<code className="text-[#ae7e89]">旧书店</code> 等关键词时，将自动激活对应背景知识。
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 2.5: 酒馆状态栏格式与正则表达式配置 (Regex & Status Bar Settings) */}
            <div className="space-y-1.5">
              <div className="text-[10px] text-[#aaa] font-medium px-1 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Sliders className="w-3 h-3 text-[#ae7e89]" />
                  <span>酒馆状态栏格式与正则表达式配置 (Regex & Template)</span>
                </span>
                <span className="text-[10px] text-[#ae7e89]">单独配置</span>
              </div>

              <div className="bg-white rounded-[14px] border border-[#f0f0f1] p-3.5 space-y-3">
                {/* 状态变量 */}
                <div className="space-y-2">
                  <div className="font-semibold text-xs text-[#333]">编辑实时状态变量：</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-[#999]">地点 location</span>
                      <input
                        value={statusData.location}
                        onChange={(e) => setStatusData({ ...statusData, location: e.target.value })}
                        className="w-full p-1.5 bg-[#fafafa] border border-[#ddd] rounded-md text-xs mt-0.5 text-[#333]"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-[#999]">时间 time</span>
                      <input
                        value={statusData.time}
                        onChange={(e) => setStatusData({ ...statusData, time: e.target.value })}
                        className="w-full p-1.5 bg-[#fafafa] border border-[#ddd] rounded-md text-xs mt-0.5 text-[#333]"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-[#999]">当前活动 activity</span>
                      <input
                        value={statusData.activity}
                        onChange={(e) => setStatusData({ ...statusData, activity: e.target.value })}
                        className="w-full p-1.5 bg-[#fafafa] border border-[#ddd] rounded-md text-xs mt-0.5 text-[#333]"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-[#999]">好感度 favor</span>
                      <input
                        value={statusData.favor}
                        onChange={(e) => setStatusData({ ...statusData, favor: e.target.value })}
                        className="w-full p-1.5 bg-[#fafafa] border border-[#ddd] rounded-md text-xs mt-0.5 text-[#333]"
                      />
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#999]">内心心境 mood</span>
                    <input
                      value={statusData.mood}
                      onChange={(e) => setStatusData({ ...statusData, mood: e.target.value })}
                      className="w-full p-1.5 bg-[#fafafa] border border-[#ddd] rounded-md text-xs mt-0.5 text-[#333]"
                    />
                  </div>
                </div>

                {/* HTML 渲染模板 */}
                <div className="border-t border-[#f2f2f3] pt-2.5 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-[#555]">
                    <span className="font-semibold">HTML 渲染模板：</span>
                    <span className="text-[10px] text-[#aaa]">支持变量占位符</span>
                  </div>
                  <textarea
                    value={statusFormat}
                    onChange={(e) => setStatusFormat(e.target.value)}
                    className="w-full h-24 p-2 font-mono text-[11px] bg-[#f8f8fa] border border-[#e6e6e8] rounded-[10px] outline-none leading-relaxed resize-none text-[#333]"
                  />
                  <div className="text-[9.5px] text-[#aaa]">
                    可用标签：<code>{`{{location}}`}</code>, <code>{`{{time}}`}</code>, <code>{`{{activity}}`}</code>, <code>{`{{mood}}`}</code>, <code>{`{{favor}}`}</code>
                  </div>
                </div>

                {/* 正则表达式匹配 */}
                <div className="border-t border-[#f2f2f3] pt-2.5 space-y-1">
                  <div className="font-semibold text-[11px] text-[#555]">酒馆状态提取正则表达式 (Regex)：</div>
                  <input
                    value={statusRegex}
                    onChange={(e) => setStatusRegex(e.target.value)}
                    className="w-full p-2 font-mono text-xs bg-[#f8f8fa] border border-[#e6e6e8] rounded-[10px] outline-none text-[#333]"
                  />
                </div>
              </div>
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

            {/* Section 5: 预设选择 */}
            <div className="space-y-1.5">
              <div className="text-[10px] text-[#aaa] font-medium px-1 flex items-center gap-1">
                <SlidersHorizontal className="w-3 h-3 text-[#ae7e89]" />
                <span>生成预设与模型风格 (Presets)</span>
              </div>

              <div className="bg-white rounded-[14px] border border-[#f0f0f1] p-3.5 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-center text-xs">
                  {[
                    { id: 'immersive', label: '深度细腻沉浸', desc: '心理描写丰富' },
                    { id: 'casual', label: '日常随性轻快', desc: '像平时微信聊天' },
                    { id: 'slowburn', label: '高冷克制拉扯', desc: '字字千金，暗涌' },
                    { id: 'sweet', label: '甜蜜宠溺治愈', desc: '偏爱情绪价值' },
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => setSelectedPreset(preset.id as any)}
                      className={`p-2.5 rounded-[10px] border text-left cursor-pointer transition-all ${
                        selectedPreset === preset.id
                          ? 'border-[#d4aab5] bg-[#faf1f3] text-[#ae7e89]'
                          : 'border-[#ededee] bg-[#fafafa] text-[#555]'
                      }`}
                    >
                      <div className="font-semibold text-[11px]">{preset.label}</div>
                      <div className="text-[9px] text-[#aaa] mt-0.5">{preset.desc}</div>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 border-t border-[#f2f2f3] pt-2.5">
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
                  <button
                    onClick={handleAddScheduleItem}
                    className="px-3 py-1.5 bg-[#d4aab5] text-white rounded-md font-medium text-xs cursor-pointer"
                  >
                    保存
                  </button>
                </div>
              </div>
            )}

            <div className="border border-[#ededee] rounded-[14px] overflow-hidden divide-y divide-[#f1f1f2]">
              {scheduleList.map((item) => (
                <div key={item.id} className="p-3 bg-white flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-semibold text-[#ae7e89] w-12">
                      {item.time}
                    </span>
                    <span className="text-xs text-[#333]">{item.title}</span>
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
              <div className="font-semibold text-sm text-[#333]">思维链预设 (CoT Presets)</div>
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
                    setCustomCotTemplate(activeCotPreset.template);
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
            <button onClick={() => setShowVideoCall(false)} className="text-xl opacity-80 cursor-pointer">
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
              onClick={() => setShowVideoCall(false)}
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
            <button onClick={() => setShowAudioCall(false)} className="text-xl opacity-80 cursor-pointer">
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
              onClick={() => setShowAudioCall(false)}
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
                  setMessages(messages.filter((m) => m.id !== contextMenuMsg.id));
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

      {/* 16.9. 快捷常用语抽屉 (Quick Phrases Sheet) */}
      {showQuickPhrases && (
        <div
          onClick={() => setShowQuickPhrases(false)}
          className="absolute inset-0 bg-black/25 z-60 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-4 pb-6 space-y-3 animate-in slide-in-from-bottom max-h-[70%] flex flex-col"
          >
            <div className="w-8 h-1 bg-[#ddd] rounded-full mx-auto" />
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-[#333]">快捷常用语</span>
              <span className="text-[10px] text-[#aaa]">点击即刻填入输入框</span>
            </div>

            <div className="divide-y divide-[#f2f2f4] overflow-y-auto flex-1 text-xs">
              {quickPhrases.map((phrase, i) => (
                <div
                  key={i}
                  onClick={() => {
                    setInputText(phrase);
                    setShowQuickPhrases(false);
                    showToast('已填入输入框');
                  }}
                  className="py-2.5 px-2 flex items-center justify-between hover:bg-[#fafafa] cursor-pointer group rounded-md"
                >
                  <span className="text-[#333] group-hover:text-[#ae7e89] transition-colors">{phrase}</span>
                  <span className="text-[10px] text-[#ae7e89] opacity-0 group-hover:opacity-100 transition-opacity">填入 ›</span>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-[#f0f0f1] flex gap-2">
              <input
                type="text"
                placeholder="添加自定义快捷语..."
                id="newQuickPhraseInput"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                    setQuickPhrases([...quickPhrases, e.currentTarget.value.trim()]);
                    e.currentTarget.value = '';
                    showToast('已添加新常用语');
                  }
                }}
                className="flex-1 px-3 py-1.5 bg-[#f6f6f7] rounded-[10px] text-xs outline-none"
              />
              <button
                onClick={() => {
                  const input = document.getElementById('newQuickPhraseInput') as HTMLInputElement;
                  if (input && input.value.trim()) {
                    setQuickPhrases([...quickPhrases, input.value.trim()]);
                    input.value = '';
                    showToast('已添加新常用语');
                  }
                }}
                className="px-3 py-1.5 bg-[#faf1f3] text-[#ae7e89] rounded-[10px] text-xs font-medium cursor-pointer"
              >
                添加
              </button>
            </div>

            <button
              onClick={() => setShowQuickPhrases(false)}
              className="w-full py-2.5 rounded-[12px] bg-[#f7f7f7] text-[#777] text-xs font-medium cursor-pointer"
            >
              取消
            </button>
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
            {/* Cover Banner */}
            <div className="h-[140px] bg-gradient-to-r from-[#e8dadf] via-[#efe6e8] to-[#ded6dc] relative">
              <div
                className="absolute inset-0"
                style={{
                  background: 'radial-gradient(circle at 80% 20%, rgba(255,255,255,0.7), transparent 40%), linear-gradient(135deg, #e4d7dc 0%, #efe5e8 50%, #ded7dc 100%)',
                }}
              />
              <div className="absolute -bottom-7 left-4">
                <div className="w-[66px] h-[66px] rounded-full bg-[#f1f1f2] border-3 border-white shadow-md flex items-center justify-center overflow-hidden">
                  <svg className="w-10 h-10 text-[#999]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 21c.8-4 3.5-6 8-6s7.2 2 8 6" />
                  </svg>
                </div>
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
                <span className="text-[9.5px] px-2 py-0.5 rounded-full bg-[#faf1f3] text-[#ae7e89] border border-[#f0dee3] font-medium">
                  {characterProfile.relationship}
                </span>
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

            {/* Profile Tab Header: 动态 (Threads) | 记忆与世界书 | 胶片相册 */}
            <div className="h-[42px] bg-white border-b border-[#ededee] flex text-xs font-medium text-[#777]">
              <div className="flex-1 flex items-center justify-center border-b-2 border-[#ae7e89] text-[#ae7e89]">
                动态 (Threads)
              </div>
              <div
                onClick={() => {
                  setShowCharacterProfile(false);
                  setShowLorebookInspector(true);
                  setShowSettings(true);
                }}
                className="flex-1 flex items-center justify-center cursor-pointer hover:text-[#333]"
              >
                记忆与世界书
              </div>
              <div
                onClick={() => showToast('相册正在整理中…')}
                className="flex-1 flex items-center justify-center cursor-pointer hover:text-[#333]"
              >
                胶片相册
              </div>
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
