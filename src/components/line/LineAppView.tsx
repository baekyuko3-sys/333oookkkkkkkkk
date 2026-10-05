import { useEffect, useState } from 'react';
import { usePersistentState } from '../../store/usePersistentState';
import type { ImportedCharacter } from '../../data/characterImport';
import { ScreenType } from '../../types';
import { LineConversationView } from './LineConversationView';
import { createLineGroup } from '../../store/lineGroups';
import { markCharacterRead } from '../../store/worldRuntime';
import { getLineConversationMeta, markLineConversationRead, markLineNotificationsReadForConversation } from '../../store/lineRuntime';
import { generateCreativeText, listOpenAiCompatibleModels, resolveChannelAiSettings, testAiConnection, type AiSettings } from '../../ai/aiEngine';
import { readAppSettings, saveAppSettings, type ChannelAiSettings } from '../../store/appSettings';
import {
  Pin, BellOff, Bookmark, Heart, MessageCircle, Share2, Plus, Search,
  Check, Trash2, X, Sliders, ChevronRight, UserCheck, Shield, Volume2,
  Smartphone, Settings
} from 'lucide-react';

interface LineAppViewProps {
  onNavigateHome: () => void;
  onNavigateScreen?: (screen: ScreenType) => void;
}

interface LineChatItem {
  id: string;
  name: string;
  characterId?: string;
  variantLabel?: string;
  chatLabel?: string;
  groupId?: string;
  time: string;
  preview: string;
  unread: number;
  isPinned: boolean;
  isMuted: boolean;
  draft: string;
  isGroup: boolean;
}

interface LineFriend {
  name: string;
  characterId?: string;
  variantLabel?: string;
  note: string;
  online: boolean;
  pinyin: string;
}

interface LineUserProfile {
  name: string;
  id: string;
  desc: string;
  avatar?: string;
}

export function LineAppView({ onNavigateHome, onNavigateScreen }: LineAppViewProps) {
  // Tabs: 'chat' | 'friends' | 'moments' | 'me'
  const [activeTab, setActiveTab] = useState<'chat' | 'friends' | 'moments' | 'me'>('chat');
  const [lineLocale, setLineLocale] = usePersistentState<'zh-CN' | 'ja-JP'>('line:locale', 'zh-CN');
  const ja = lineLocale === 'ja-JP';
  const tx = (zh: string, jp: string) => ja ? jp : zh;
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  // Search queries
  const [chatSearch, setChatSearch] = useState('');
  const [friendSearch, setFriendSearch] = useState('');

  // Toast
  const updateChannelSettings = (channel: 'chat' | 'moments', patch: Partial<ChannelAiSettings>) => {
    setChannelSettings(prev => {
      const next = { ...prev, [channel]: { ...prev[channel], ...patch } };
      saveAppSettings(channel === 'chat' ? { chatApiOverride: next.chat } : { momentsApiOverride: next.moments });
      return next;
    });
  };

  const channelAsAiSettings = (channel: 'chat' | 'moments'): AiSettings => {
    const base = readAppSettings();
    const s = channelSettings[channel];
    return {
      provider: s.provider,
      apiBaseUrl: s.apiBaseUrl,
      apiKey: s.apiKey,
      model: s.model,
      streaming: s.streaming,
      contextLength: s.contextLength,
      maxOutputTokens: s.maxOutputTokens,
      autoSave: base.autoSave,
      temperature: s.temperature,
    };
  };

  const generateMomentsPost = async () => {
    const source = importedCharacters[Math.floor(Math.random() * importedCharacters.length)];
    if (!source) { showToast('先导入至少一个角色卡，朋友圈 AI 才有角色可以发动态'); return; }
    setIsRefreshingMoments(true);
    try {
      const settings = channelSettings.moments.enabled ? channelAsAiSettings('moments') : resolveChannelAiSettings('moments');
      const text = await generateCreativeText({
        settings,
        systemPrompt: [
          '你正在一个私人虚拟手机的朋友圈中扮演角色。',
          '只写一条自然的朋友圈动态，不要解释自己是 AI。',
          '不要替用户行动，也不要编造不存在的聊天经历。',
          '可以根据角色卡、当前状态与日常生活写一点真实的小事，长度适中。',
          '',
          '【角色卡】',
          source.description,
          source.personality,
          source.scenario,
        ].join('\n'),
        userPrompt: '请为“' + source.name + '”写一条今天的朋友圈动态。',
        temperature: settings.temperature,
      });
      if (text.trim()) {
        setMomentsPosts(prev => [{
          id: 'moment-ai-' + Date.now().toString(36),
          name: source.name,
          text: text.trim(),
          time: '刚刚',
          tag: '#AI动态',
          liked: false,
          likes: 0,
          commentsList: [],
          characterId: source.id,
        }, ...prev]);
        showToast(source.name + ' 发布了一条朋友圈');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : '朋友圈 AI 请求失败');
    } finally {
      setIsRefreshingMoments(false);
    }
  };

  const fetchChannelModels = async (channel: 'chat' | 'moments') => {
    const s = channelSettings[channel];
    if (!s.apiBaseUrl.trim() || !s.apiKey.trim()) { showToast('请先填写 API 地址和 API Key'); return; }
    setChannelBusy(channel + '-models' as any);
    try {
      const models = await listOpenAiCompatibleModels(channelAsAiSettings(channel));
      setChannelModels(prev => ({ ...prev, [channel]: models }));
      showToast(models.length ? '模型列表已更新' : '接口没有返回模型列表');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '拉取模型失败');
    } finally { setChannelBusy(null); }
  };

  const testChannel = async (channel: 'chat' | 'moments') => {
    const s = channelSettings[channel];
    if (!s.apiBaseUrl.trim() || !s.apiKey.trim() || !s.model.trim()) { showToast('请先填写 API、Key 和模型'); return; }
    setChannelBusy(channel + '-test' as any);
    try {
      await testAiConnection(channelAsAiSettings(channel));
      showToast('AI 连接测试成功 ✓');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '连接测试失败');
    } finally { setChannelBusy(null); }
  };

  const [toastMsg, setToastMsg] = useState('');
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 1800);
  };

  // Modals state
  const [showMaskModal, setShowMaskModal] = useState(false);
  const [showCreateMaskDrawer, setShowCreateMaskDrawer] = useState(false);
  const [newMaskName, setNewMaskName] = useState('');
  const [newMaskDesc, setNewMaskDesc] = useState('');

  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupFriends, setSelectedGroupFriends] = useState<string[]>([]);

  const [showFriendModal, setShowFriendModal] = useState(false);
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [showCreateFriendDrawer, setShowCreateFriendDrawer] = useState(false);
  const [newFriendName, setNewFriendName] = useState('');
  const [newFriendNote, setNewFriendNote] = useState('');

  const [showPostModal, setShowPostModal] = useState(false);
  const [newPostText, setNewPostText] = useState('');
  const [newPostTag, setNewPostTag] = useState('#日常');

  // Moments interactive comments drawer
  const [commentingPostId, setCommentingPostId] = useState<string | null>(null);
  const [commentInputText, setCommentInputText] = useState('');

  // Me tab drawers
  const [showMyMomentsModal, setShowMyMomentsModal] = useState(false);
  const [showFavoritesModal, setShowFavoritesModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showGlobalChatSettingsModal, setShowGlobalChatSettingsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showGeneralSettingsModal, setShowGeneralSettingsModal] = useState(false);
  const [channelSettings, setChannelSettings] = useState(() => {
    const settings = readAppSettings();
    return { chat: settings.chatApiOverride, moments: settings.momentsApiOverride };
  });
  const [channelModels, setChannelModels] = useState<{ chat: string[]; moments: string[] }>({ chat: [], moments: [] });
  const [channelBusy, setChannelBusy] = useState<'chat-models' | 'chat-test' | 'moments-models' | 'moments-test' | null>(null);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [friendProfile, setFriendProfile] = useState<LineFriend | null>(null);
  const [postDetail, setPostDetail] = useState<any | null>(null);
  const [showMyProfilePage, setShowMyProfilePage] = useState(false);
  const [newPostImage, setNewPostImage] = useState('');

  // Notification toggles
  const [notifSound, setNotifSound] = useState(true);
  const [notifVibrate, setNotifVibrate] = useState(true);
  const [notifPreview, setNotifPreview] = useState(true);

  // Chat item long-press / context action
  const [chatContextMenu, setChatContextMenu] = useState<any | null>(null);

  // Moments refresh state
  const [isRefreshingMoments, setIsRefreshingMoments] = useState(false);

  // User / Mask State
  const [importedCharacters] = usePersistentState<ImportedCharacter[]>('phone:characters', []);

  const [currentUser, setCurrentUser] = usePersistentState<LineUserProfile>('line:current-user', {
    name: '',
    id: '',
    desc: '',
    avatar: '',
  });
  const [profileDraft, setProfileDraft] = useState<LineUserProfile>(currentUser);

  const [masks, setMasks] = usePersistentState<Array<{ name: string; id: string; desc: string }>>('line:masks', []);
  // Chat Data with Pin, Mute, Draft, and Group capabilities
  const [chatItems, setChatItems] = usePersistentState<LineChatItem[]>('line:chat-items', []);

  // Background proactive messages can update the chat list without reopening LINE.
  useEffect(() => {
    const refreshFromRuntime = () => {
      try {
        const raw = window.localStorage.getItem('line:chat-items');
        if (raw) setChatItems(JSON.parse(raw));
      } catch {
        // Keep current in-memory list.
      }
    };

    const handleMusicInvite = (event: Event) => {
      try {
        const detail = (event as CustomEvent<{ session?: { id: string; characterId: string; characterName: string; variantLabel?: string; track: { name: string }; mode: 'direct' | 'stranger' } }>).detail;
        const session = detail?.session;
        if (!session?.id) return;
        setChatItems(prev => {
          if (prev.some(item => item.id === session.id)) return prev;
          const item: LineChatItem = {
            id: session.id,
            name: session.characterName,
            characterId: session.characterId,
            variantLabel: session.variantLabel || '默认版本',
            chatLabel: session.mode === 'stranger' ? '音乐陌生人' : '一起听歌',
            time: '刚刚',
            preview: '🎵 ' + session.track.name,
            unread: 1,
            isPinned: false,
            isMuted: false,
            draft: '',
            isGroup: false,
          };
          return [item, ...prev];
        });
      } catch {
        // Ignore malformed invite events.
      }
    };
    window.addEventListener('sane333:proactive-message', refreshFromRuntime);
    window.addEventListener('sane333:music-invite-created', handleMusicInvite);
    window.addEventListener('sane333:line-runtime-changed', refreshFromRuntime);
    window.addEventListener('sane333:line-runtime-message', refreshFromRuntime);
    return () => {
      window.removeEventListener('sane333:proactive-message', refreshFromRuntime);
      window.removeEventListener('sane333:music-invite-created', handleMusicInvite);
      window.removeEventListener('sane333:line-runtime-changed', refreshFromRuntime);
      window.removeEventListener('sane333:line-runtime-message', refreshFromRuntime);
    };
  }, []);

  // Imported character cards automatically become LINE contacts.
  useEffect(() => {
    if (!importedCharacters.length) return;

    setChatItems(prev => {
      const existingCharacterIds = new Set(prev.map(item => item.characterId).filter(Boolean));
      const added = importedCharacters
        .filter(character => !existingCharacterIds.has(character.id) && !prev.some(item => item.name === character.name && item.id === character.id))
        .map(character => ({
          id: character.id,
          characterId: character.id,
          name: character.name,
          variantLabel: character.variantLabel || character.characterVersion || '默认版本',
          time: '刚刚',
          preview: character.firstMessage || character.description || '新导入角色，等待你的消息。',
          unread: 0,
          isPinned: false,
          isMuted: false,
          draft: '',
          isGroup: false,
        }));

      return added.length ? [...added, ...prev] : prev;
    });

    setFriendsList(prev => {
      const existingIds = new Set(prev.map(friend => friend.characterId).filter(Boolean));
      const added = importedCharacters
        .filter(character => !existingIds.has(character.id))
        .map(character => ({
          name: character.name,
          characterId: character.id,
          variantLabel: character.variantLabel || character.characterVersion || '默认版本',
          note: character.description || '已导入角色卡',
          online: false,
          pinyin: character.name.slice(0, 1).toUpperCase(),
        }));

      return added.length ? [...added, ...prev] : prev;
    });
  }, [importedCharacters]);

  // Global Favorites start empty; favorites are created by the user.
  const [globalFavorites, setGlobalFavorites] = usePersistentState<any[]>('line:global-favorites', []);

  // Friends Data
  const [friendsList, setFriendsList] = usePersistentState<LineFriend[]>('line:friends-list', []);

  // Moments Posts are created by the user and imported characters; start empty.
  const [momentsPosts, setMomentsPosts] = usePersistentState<any[]>('line:moments-posts', []);

  // Filtered & Sorted Chats (Pinned items always float to the top)
  const filteredChats = chatItems.filter((c) =>
    c.name.toLowerCase().includes(chatSearch.toLowerCase()) ||
    c.preview.toLowerCase().includes(chatSearch.toLowerCase()) ||
    c.draft.toLowerCase().includes(chatSearch.toLowerCase())
  );

  const sortedChats = [...filteredChats].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return 0;
  });

  // If a chat is open, render the detail view
  if (activeChatId) {
    const activeItem = chatItems.find((c) => c.id === activeChatId);
    if (activeItem?.characterId) markCharacterRead(activeItem.characterId);
    const activeChatName = activeItem?.name || activeChatId;
    const activeCharacterId = activeItem?.characterId || undefined;
    const conversationId = activeItem?.id || activeCharacterId || activeItem?.name || activeChatId;
    return (
      <div className="w-full h-full pt-[30px] bg-white">
        <LineConversationView
          contactName={activeChatName}
          characterId={activeCharacterId}
          conversationId={conversationId}
          onBack={(draft?: string) => {
            if (typeof draft === 'string') {
              setChatItems((prev) =>
                prev.map((c) => (c.id === activeChatId ? { ...c, draft } : c))
              );
            }
            setActiveChatId(null);
          }}
          onNavigateHome={onNavigateHome}
          onNavigateScreen={onNavigateScreen}
          initialDraft={activeItem?.draft || ''}
          isGroup={activeItem?.isGroup || activeChatName === '我们的小角落'}
          isPinned={activeItem?.isPinned || false}
          isMuted={activeItem?.isMuted || false}
          onConversationActivity={({ preview, time }) => {
            setChatItems((prev) =>
              prev.map((c) =>
                c.id === activeChatId
                  ? { ...c, preview, time, unread: 0 }
                  : c
              )
            );
          }}
          onTogglePin={() => {
            setChatItems((prev) =>
              prev.map((c) =>
                c.id === activeChatId ? { ...c, isPinned: !c.isPinned } : c
              )
            );
          }}
          onToggleMute={() => {
            setChatItems((prev) =>
              prev.map((c) =>
                c.id === activeChatId ? { ...c, isMuted: !c.isMuted } : c
              )
            );
          }}
        />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex flex-col justify-between bg-white text-[#343538] select-none font-sans overflow-hidden pt-[30px]">
      
      {/* =====================================================
           PAGE 1: CHAT (聊天列表)
      ===================================================== */}
      {activeTab === 'chat' && (
        <div className="flex-1 overflow-y-auto no-scrollbar pb-20">
          {/* Header */}
          <div className="h-[78px] px-5 pt-4 pb-2.5 flex items-start justify-between bg-white">
            <div>
              <div className="text-[25px] font-bold tracking-[-0.8px] text-[#202124] leading-tight">
                {tx('聊天', 'トーク')}
              </div>
              <div className="mt-1 text-[10px] text-[#b2b2b4] tracking-[0.7px]">
                {tx('トーク · 今日はゆっくり。', '今日はゆっくり。')}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setSelectedGroupFriends([]);
                  setNewGroupName('');
                  setShowGroupModal(true);
                }}
                className="w-[35px] h-[35px] border border-[#e7e7e8] rounded-full flex items-center justify-center text-lg text-[#555] hover:bg-[#f7f7f7] cursor-pointer"
                title={tx('创建群聊', 'グループを作成')}
              >
                ＋
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="mx-4 mb-3 h-[38px] bg-[#f6f6f7] rounded-[11px] flex items-center px-3.5 text-[#aaa] text-[13px]">
            <span className="mr-2 text-base">⌕</span>
            <input
              type="text"
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              placeholder={tx('搜索联系人或聊天记录', '連絡先・チャットを検索')}
              className="w-full bg-transparent outline-none text-xs text-[#555] font-sans"
            />
            {chatSearch && (
              <button onClick={() => setChatSearch('')} className="text-xs text-[#aaa] px-1">
                ×
              </button>
            )}
          </div>

          {/* Chat List */}
          <div className="divide-y divide-[#f1f1f1]">
            {sortedChats.map((item) => (
              <div
                key={item.id}
                onClick={() => {
                  // Clear unread on open
                  setChatItems((prev) =>
                    prev.map((c) => (c.id === item.id ? { ...c, unread: 0 } : c))
                  );
                  markLineConversationRead(item.id);
                  markLineNotificationsReadForConversation(item.id);
                  setActiveChatId(item.id);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setChatContextMenu(item);
                }}
                className={`h-[76px] px-4 flex items-center cursor-pointer transition-colors ${
                  item.isPinned
                    ? 'bg-[#faf6f7]/60 hover:bg-[#f8f1f3]'
                    : 'hover:bg-[#fafafa] active:bg-[#f5f5f5]'
                }`}
              >
                {/* Default Avatar SVG from template */}
                <div className="relative">
                  <div className="w-[49px] h-[49px] rounded-full bg-[#f1f1f2] border border-[#e8e8e9] flex items-center justify-center shrink-0 overflow-hidden">
                    {importedCharacters.find(character => character.id === item.characterId)?.avatar || importedCharacters.find(character => character.name === item.name)?.avatar ? (
                      <img
                        src={importedCharacters.find(character => character.id === item.characterId)?.avatar || importedCharacters.find(character => character.name === item.name)?.avatar}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <svg className="w-[31px] h-[31px] text-[#b7b7b9]" viewBox="0 0 48 48" fill="currentColor">
                        <circle cx="24" cy="17" r="8" />
                        <path d="M10 40c1.8-8.1 6.8-12 14-12s12.2 3.9 14 12" />
                      </svg>
                    )}
                  </div>
                  {item.isPinned && (
                    <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#ae7e89] text-white flex items-center justify-center text-[7px] shadow-2xs">
                      📌
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0 ml-3">
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-[14px] font-semibold text-[#28292b]">{item.name}</span>
                      {item.variantLabel && !item.isGroup && <span className="text-[8px] text-[#a69da0] shrink-0">· {item.variantLabel}</span>}
                      {item.isMuted && (
                        <BellOff className="w-3 h-3 text-[#b2b2b4] shrink-0" />
                      )}
                    </div>
                    <span className="text-[10px] text-[#b5b5b6] shrink-0 ml-1">
                      {item.time}
                    </span>
                  </div>

                  <div className="text-[12px] text-[#999b9f] truncate pr-2">
                    {item.draft ? (
                      <span>
                        <span className="text-[#ae7e89] font-medium">[草稿] </span>
                        {item.draft}
                      </span>
                    ) : (
                      item.preview
                    )}
                  </div>
                </div>

                {item.unread > 0 && (
                  <div className="w-[17px] h-[17px] rounded-full bg-[#d7b0ba] text-white text-[9px] flex items-center justify-center shrink-0 ml-2 font-medium">
                    {item.unread}
                  </div>
                )}
              </div>
            ))}

            {sortedChats.length === 0 && (
              <div className="py-16 text-center text-xs text-[#aaa]">
                未搜到相关记录
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================
           PAGE 2: FRIENDS (通讯录好友)
      ===================================================== */}
      {activeTab === 'friends' && (
        <div className="flex-1 overflow-y-auto no-scrollbar pb-20">
          {/* Header */}
          <div className="h-[78px] px-5 pt-4 pb-2.5 flex items-start justify-between bg-white">
            <div>
              <div className="text-[25px] font-bold tracking-[-0.8px] text-[#202124] leading-tight">
                {tx('好友', '友だち')}
              </div>
              <div className="mt-1 text-[10px] text-[#b2b2b4] tracking-[0.7px]">
                {tx('友だち · 大切な人たち', '大切な人たち')} · ({friendsList.length})
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFriendModal(true)}
                className="w-[35px] h-[35px] border border-[#e7e7e8] rounded-full flex items-center justify-center text-lg text-[#555] hover:bg-[#f7f7f7] cursor-pointer"
                title="添加好友"
              >
                ＋
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="mx-4 mb-3 h-[38px] bg-[#f6f6f7] rounded-[11px] flex items-center px-3.5 text-[#aaa] text-[13px]">
            <span className="mr-2 text-base">⌕</span>
            <input
              type="text"
              value={friendSearch}
              onChange={(e) => setFriendSearch(e.target.value)}
              placeholder="搜索联系人"
              className="w-full bg-transparent outline-none text-xs text-[#555] font-sans"
            />
          </div>

          {/* Friends List */}
          <div className="divide-y divide-[#f2f2f2]">
            {friendsList
              .filter((f) =>
                f.name.toLowerCase().includes(friendSearch.toLowerCase()) ||
                f.note.toLowerCase().includes(friendSearch.toLowerCase())
              )
              .map((friend, idx) => (
                <div
                  key={friend.characterId || friend.name + '-' + idx}
                  onClick={() => setFriendProfile(friend)}
                  className="h-[67px] px-5 flex items-center cursor-pointer hover:bg-[#fafafa] active:bg-[#f5f5f5] transition-colors"
                >
                  <div className="w-[49px] h-[49px] rounded-full bg-[#f1f1f2] border border-[#e8e8e9] flex items-center justify-center shrink-0 overflow-hidden">
                    {(importedCharacters.find(character => character.id === friend.characterId)?.avatar || importedCharacters.find(character => character.name === friend.name)?.avatar) ? (
                      <img
                        src={importedCharacters.find(character => character.id === friend.characterId)?.avatar || importedCharacters.find(character => character.name === friend.name)?.avatar}
                        alt={friend.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <svg className="w-[31px] h-[31px] text-[#b7b7b9]" viewBox="0 0 48 48" fill="currentColor">
                        <circle cx="24" cy="17" r="8" />
                        <path d="M10 40c1.8-8.1 6.8-12 14-12s12.2 3.9 14 12" />
                      </svg>
                    )}
                  </div>

                  <div className="ml-3 flex-1 min-w-0">
                    <div className="text-[14px] text-[#303134] font-medium">
                      {friend.name} {friend.variantLabel && <span className="text-[8px] text-[#aaa]">· {friend.variantLabel}</span>}
                    </div>
                    <div className="text-[10px] text-[#aaa] mt-1 truncate">
                      {friend.note}
                    </div>
                  </div>

                  {friend.online && (
                    <div className="w-[6px] h-[6px] bg-[#b9d2c1] rounded-full ml-auto shrink-0" />
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* =====================================================
           PAGE 3: MOMENTS (朋友圈)
      ===================================================== */}
      {activeTab === 'moments' && (
        <div className="flex-1 overflow-y-auto no-scrollbar pb-20">
          {/* Header */}
          <div className="h-[78px] px-5 pt-4 pb-2.5 flex items-start justify-between bg-white">
            <div>
              <div className="text-[25px] font-bold tracking-[-0.8px] text-[#202124] leading-tight">
                VROOM
              </div>
              <div className="mt-1 text-[10px] text-[#b2b2b4] tracking-[0.7px]">
                {tx('记录一些小事', '小さなことを記録する')}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  void generateMomentsPost();
                }}
                className="w-[35px] h-[35px] border border-[#e7e7e8] rounded-full flex items-center justify-center text-sm text-[#555] hover:bg-[#f7f7f7] cursor-pointer"
                title="刷新"
              >
                ↻
              </button>
              <button
                onClick={() => setShowPostModal(true)}
                className="w-[35px] h-[35px] border border-[#e7e7e8] rounded-full flex items-center justify-center text-lg text-[#555] hover:bg-[#f7f7f7] cursor-pointer"
                title="发表动态"
              >
                ＋
              </button>
            </div>
          </div>

          {/* Moments Banner */}
          <div className="h-[185px] mb-7 relative bg-[#eeeeed]">
            <div
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(circle at 78% 22%, rgba(255,255,255,.75), transparent 28%), radial-gradient(circle at 22% 80%, rgba(255,255,255,.48), transparent 30%), linear-gradient(135deg, #e8e8e6 0%, #f4f4f2 52%, #dededc 100%)',
              }}
            />

            {/* Profile overlapping banner */}
            <div className="absolute right-[18px] -bottom-[24px] z-5 flex items-end gap-[9px]">
              <span className="mb-2 text-[14px] font-semibold text-[#303134] drop-shadow-sm">
                {currentUser.name}
              </span>
              <div className="w-[62px] h-[62px] rounded-full bg-[#f1f1f2] border-[3px] border-white shadow-md flex items-center justify-center overflow-hidden">
                <svg className="w-[39px] h-[39px] text-[#b7b7b9]" viewBox="0 0 48 48" fill="currentColor">
                  <circle cx="24" cy="17" r="8" />
                  <path d="M10 40c1.8-8.1 6.8-12 14-12s12.2 3.9 14 12" />
                </svg>
              </div>
            </div>
          </div>

          {/* Posts List */}
          <div
            className={`pt-2 transition-opacity duration-300 ${
              isRefreshingMoments ? 'opacity-35' : 'opacity-100'
            }`}
          >
            {momentsPosts.map((post) => (
              <div key={post.id} onClick={() => setPostDetail(post)} className="px-[18px] pb-5 border-b border-[#f0f0f0] mb-[18px] cursor-pointer">
                <div className="flex items-center">
                  <div className="w-[49px] h-[49px] rounded-full bg-[#f1f1f2] border border-[#e8e8e9] flex items-center justify-center shrink-0 overflow-hidden">
                    <svg className="w-[31px] h-[31px] text-[#b7b7b9]" viewBox="0 0 48 48" fill="currentColor">
                      <circle cx="24" cy="17" r="8" />
                      <path d="M10 40c1.8-8.1 6.8-12 14-12s12.2 3.9 14 12" />
                    </svg>
                  </div>
                  <span className="ml-2.5 text-[13px] font-semibold">{post.name}</span>
                  <span className="ml-auto text-[9px] text-[#aaa]">{post.time}</span>
                </div>

                <div className="ml-[59px] mt-2.5 text-[12px] leading-[1.8] text-[#555] whitespace-pre-wrap">
                  {post.text}
                </div>
                {post.image && <img src={post.image} alt="" className="ml-[59px] mt-3 max-w-[78%] max-h-[220px] rounded-[12px] object-cover border border-[#eeeeef]" />}

                <div className="ml-[59px] mt-2 inline-block text-[9px] text-[#b88c97] bg-[#faf3f5] px-2 py-0.5 rounded-[4px]">
                  {post.tag}
                </div>

                {/* Interactions: Like & Comment */}
                <div className="ml-[59px] mt-3 flex items-center gap-5 text-[#aaa] text-[11px]">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMomentsPosts((prev) =>
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
                    className={`cursor-pointer flex items-center gap-1 hover:text-[#ae7e89] transition-colors ${
                      post.liked ? 'text-[#ae7e89] font-medium' : ''
                    }`}
                  >
                    <span>{post.liked ? '♥' : '♡'}</span>
                    <span>{post.likes}</span>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCommentingPostId(post.id);
                      setCommentInputText('');
                    }}
                    className="hover:text-[#555] cursor-pointer flex items-center gap-1"
                  >
                    <span>评论</span>
                    <span>{post.commentsList ? post.commentsList.length : 0}</span>
                  </button>
                </div>

                {/* Live Comments List */}
                {post.commentsList && post.commentsList.length > 0 && (
                  <div className="ml-[59px] mt-2.5 bg-[#f8f8f9] rounded-[9px] p-2.5 space-y-1.5 text-[11px]">
                    {post.commentsList.map((c: { user: string; text: string }, idx: number) => (
                      <div key={idx} className="leading-snug">
                        <span className="font-semibold text-[#555]">{c.user}: </span>
                        <span className="text-[#444]">{c.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =====================================================
           PAGE 4: ME (个人中心)
      ===================================================== */}
      {activeTab === 'me' && (
        <div className="flex-1 overflow-y-auto no-scrollbar pb-20">
          {/* Header */}
          <div className="h-[78px] px-5 pt-4 pb-2.5 bg-white">
            <div className="text-[25px] font-bold tracking-[-0.8px] text-[#202124] leading-tight">
              ME
            </div>
            <div className="mt-1 text-[10px] text-[#b2b2b4] tracking-[0.7px]">
              {tx('个人中心 · 当前身份', 'プロフィール · 今の自分')}
            </div>
          </div>

          {/* Profile Card */}
          <div onClick={() => setShowMyProfilePage(true)} className="p-5 border-b-[7px] border-[#fafafa] cursor-pointer hover:bg-[#fcfcfc]">
            <div className="flex items-center">
              <div className="w-[64px] h-[64px] rounded-full bg-[#f1f1f2] border border-[#e8e8e9] flex items-center justify-center shrink-0 overflow-hidden">
                {currentUser.avatar ? (
                  <img src={currentUser.avatar} alt={currentUser.name || '我的头像'} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[20px] text-[#aaa] font-serif">{currentUser.name.trim() ? currentUser.name.trim()[0] : '·'}</span>
                )}
              </div>

              <div className="ml-4 min-w-0 flex-1">
                <div className="text-[18px] font-semibold text-[#202124] truncate">
                  {currentUser.name.trim() || '未设置昵称'}
                </div>
                <div className="text-[10px] text-[#aaa] mt-1 truncate">
                  {currentUser.id.trim() ? '@' + currentUser.id.replace(/^@/, '') : '尚未设置账号 ID'}
                </div>
                <div className="text-[10px] text-[#888] mt-1.5 line-clamp-2">
                  {currentUser.desc.trim() || '还没有个人简介'}
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setProfileDraft(currentUser);
                  setShowProfileEditor(true);
                }}
                className="ml-2 shrink-0 px-3 py-1.5 border border-[#dedcdf] rounded-full text-[10px] text-[#444] hover:bg-[#f7f7f8]"
              >
                编辑主页
              </button>
            </div>
          </div>

          {/* Settings Rows with Real Drawer Connections */}
          <div className="divide-y divide-[#f1f1f1]">
            <div
              onClick={() => setShowMyMomentsModal(true)}
              className="h-[57px] px-5 flex items-center cursor-pointer hover:bg-[#fafafa]"
            >
              <span className="w-[31px] text-[#999] text-[16px]">♡</span>
              <span className="text-[13px] text-[#444]" >{tx('我的朋友圈', 'マイモーメンツ')}</span>
              <span className="ml-auto text-[#ccc] text-lg">›</span>
            </div>

            <div
              onClick={() => setShowFavoritesModal(true)}
              className="h-[57px] px-5 flex items-center cursor-pointer hover:bg-[#fafafa]"
            >
              <span className="w-[31px] text-[#999] text-[16px]">☆</span>
              <span className="text-[13px] text-[#444]">收藏</span>
              <span className="ml-auto text-[#ccc] text-lg">›</span>
            </div>

            <div
              onClick={() => setShowNotificationModal(true)}
              className="h-[57px] px-5 flex items-center cursor-pointer hover:bg-[#fafafa]"
            >
              <span className="w-[31px] text-[#999] text-[16px]">◌</span>
              <span className="text-[13px] text-[#444]">新消息通知</span>
              <span className="ml-auto text-[#ccc] text-lg">›</span>
            </div>

            <div
              onClick={() => setShowGlobalChatSettingsModal(true)}
              className="h-[57px] px-5 flex items-center cursor-pointer hover:bg-[#fafafa]"
            >
              <span className="w-[31px] text-[#999] text-[16px]">◒</span>
              <span className="text-[13px] text-[#444]">聊天设置</span>
              <span className="ml-auto text-[#ccc] text-lg">›</span>
            </div>

            <div
              onClick={() => setShowPrivacyModal(true)}
              className="h-[57px] px-5 flex items-center cursor-pointer hover:bg-[#fafafa]"
            >
              <span className="w-[31px] text-[#999] text-[16px]">⌁</span>
              <span className="text-[13px] text-[#444]">隐私权限</span>
              <span className="ml-auto text-[#ccc] text-lg">›</span>
            </div>

            <div
              onClick={() => setShowGeneralSettingsModal(true)}
              className="h-[57px] px-5 flex items-center cursor-pointer hover:bg-[#fafafa]"
            >
              <span className="w-[31px] text-[#999] text-[16px]">⚙</span>
              <span className="text-[13px] text-[#444]" >{tx('系统通用设置', 'システム設定')}</span>
              <span className="ml-auto text-[#ccc] text-lg">›</span>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
           BOTTOM NAVIGATION BAR
      ===================================================== */}
      <div className="absolute left-0 right-0 bottom-0 h-[68px] bg-white/98 border-t border-[#eeeeef] flex items-center z-20">
        {/* Tab 1: 聊天 */}
        <div
          onClick={() => setActiveTab('chat')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
            activeTab === 'chat' ? 'text-[#ad7d88]' : 'text-[#aaa]'
          }`}
        >
          <div className="text-[19px] leading-none">◯</div>
          <div className="text-[9px]" >CHAT</div>
        </div>

        {/* Tab 2: 好友 */}
        <div
          onClick={() => setActiveTab('friends')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
            activeTab === 'friends' ? 'text-[#ad7d88]' : 'text-[#aaa]'
          }`}
        >
          <div className="text-[19px] leading-none">♧</div>
          <div className="text-[9px]" >FRIENDS</div>
        </div>

        {/* Tab 3: 朋友圈 */}
        <div
          onClick={() => setActiveTab('moments')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
            activeTab === 'moments' ? 'text-[#ad7d88]' : 'text-[#aaa]'
          }`}
        >
          <div className="text-[19px] leading-none">⌁</div>
          <div className="text-[9px]" >VROOM</div>
        </div>

        {/* Tab 4: 我的 */}
        <div
          onClick={() => setActiveTab('me')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
            activeTab === 'me' ? 'text-[#ad7d88]' : 'text-[#aaa]'
          }`}
        >
          <div className="text-[19px] leading-none">○</div>
          <div className="text-[9px]" >ME</div>
        </div>
      </div>

      {/* =====================================================
           MODAL 1: MASK SWITCHER (切换面具)
      ===================================================== */}
      {showMaskModal && (
        <div
          onClick={() => setShowMaskModal(false)}
          className="absolute inset-0 bg-black/20 z-50 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-5 pb-8 max-h-[75%] overflow-y-auto animate-in slide-in-from-bottom"
          >
            <div className="flex justify-between items-center mb-1">
              <span className="text-[17px] font-semibold text-[#202124]">切换面具</span>
              <button onClick={() => setShowMaskModal(false)} className="text-xl text-[#aaa] cursor-pointer">
                ×
              </button>
            </div>
            <div className="text-[10px] text-[#aaa] mb-4">选择你现在使用的用户身份</div>

            <div className="space-y-2 mb-3">
              {masks.map((mask) => (
                <div
                  key={mask.id}
                  onClick={() => {
                    setCurrentUser(mask);
                    setShowMaskModal(false);
                    showToast(`已切换身份为 ${mask.name}`);
                  }}
                  className={`h-[64px] border rounded-[12px] flex items-center px-3 cursor-pointer transition-colors ${
                    currentUser.name === mask.name
                      ? 'border-[#d7b0ba] bg-[#fdf8f9]'
                      : 'border-[#ededee] hover:bg-neutral-50'
                  }`}
                >
                  <div className="w-[42px] h-[42px] rounded-full bg-[#f1f1f2] border border-[#e8e8e9] flex items-center justify-center shrink-0 overflow-hidden">
                    <svg className="w-[26px] h-[26px] text-[#b7b7b9]" viewBox="0 0 48 48" fill="currentColor">
                      <circle cx="24" cy="17" r="8" />
                      <path d="M10 40c1.8-8.1 6.8-12 14-12s12.2 3.9 14 12" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <div className="text-[13px] font-semibold text-[#202124]">{mask.name}</div>
                    <div className="text-[9px] text-[#aaa] mt-0.5">{mask.desc}</div>
                  </div>
                  {currentUser.name === mask.name && (
                    <span className="ml-auto text-[#b78792] font-bold">✓</span>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                setShowMaskModal(false);
                setShowCreateMaskDrawer(true);
              }}
              className="w-full h-[45px] border border-dashed border-[#ddd] rounded-[10px] flex items-center justify-center text-[#999] text-[11px] cursor-pointer hover:border-[#ae7e89] hover:text-[#ae7e89]"
            >
              ＋ 创建新的用户身份
            </button>
          </div>
        </div>
      )}

      {/* 创建新身份抽屉 */}
      {friendProfile && (() => {
        const character = importedCharacters.find(c => c.id === friendProfile.characterId) || importedCharacters.find(c => c.name === friendProfile.name);
        const chat = chatItems.find(c => c.characterId === friendProfile.characterId) || chatItems.find(c => c.name === friendProfile.name);
        return (
          <div className="absolute inset-0 z-[70] bg-white animate-in slide-in-from-right">
            <div className="h-full overflow-y-auto no-scrollbar">
              <div className="h-[190px] bg-[#f0efed] relative">
                <button onClick={() => setFriendProfile(null)} className="absolute top-4 left-4 w-8 h-8 rounded-full bg-white/80 text-[#555] z-10">‹</button>
                <div className="absolute -bottom-9 left-5 w-[78px] h-[78px] rounded-full border-4 border-white bg-[#f1f1f2] overflow-hidden grid place-items-center shadow-sm">
                  {character?.avatar ? <img src={character.avatar} alt="" className="w-full h-full object-cover" /> : <span className="text-xl text-[#aaa]">{friendProfile.name[0] || '·'}</span>}
                </div>
              </div>
              <div className="px-5 pt-12 pb-8">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[21px] font-semibold text-[#222]">{friendProfile.name}</div>
                    <div className="text-[10px] text-[#aaa] mt-1">{friendProfile.online ? '● 在线' : '最近没有上线'} · {friendProfile.variantLabel || '默认身份'}</div>
                  </div>
                  {friendProfile.online && <span className="text-[9px] px-2 py-1 rounded-full bg-[#f1f7f2] text-[#719178]">ONLINE</span>}
                </div>
                <div className="mt-5 text-[12px] leading-7 text-[#555]">{friendProfile.note || character?.description || '还没有个人简介。'}</div>
                <div className="grid grid-cols-2 gap-2 mt-6">
                  <button onClick={() => { setFriendProfile(null); setActiveChatId(chat?.id || friendProfile.characterId || friendProfile.name); }} className="h-11 rounded-xl bg-[#292724] text-white text-xs font-semibold">发消息</button>
                  <button onClick={() => showToast('好友资料已保存')} className="h-11 rounded-xl border border-[#e4e4e5] text-xs text-[#444]">备注 / 管理</button>
                </div>
                <div className="mt-8 pt-5 border-t border-[#f0f0f1]">
                  <div className="text-[9px] tracking-[1.5px] text-[#aaa]">RELATIONSHIP</div>
                  <div className="mt-2 text-[13px] text-[#444]">{character ? 'AI / 角色联系人 · 已连接聊天世界' : '普通联系人 · 可直接进入聊天'}</div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {postDetail && (
        <div className="absolute inset-0 z-[70] bg-white animate-in slide-in-from-right">
          <div className="h-full overflow-y-auto no-scrollbar">
            <div className="h-[64px] px-5 flex items-center border-b border-[#f0f0f1]">
              <button onClick={() => setPostDetail(null)} className="w-8 h-8 rounded-full bg-[#f5f5f6] text-[#555]">‹</button>
              <div className="ml-3 text-[14px] font-semibold">VROOM · 动态</div>
            </div>
            <div className="p-5">
              <div className="flex items-center">
                <div className="w-11 h-11 rounded-full bg-[#f1f1f2] grid place-items-center overflow-hidden">
                  <span className="text-[#aaa]">{postDetail.name?.[0] || '·'}</span>
                </div>
                <div className="ml-3">
                  <div className="text-[13px] font-semibold">{postDetail.name}</div>
                  <div className="text-[9px] text-[#aaa]">{postDetail.time} · {postDetail.tag}</div>
                </div>
              </div>
              <div className="mt-6 text-[14px] leading-8 whitespace-pre-wrap text-[#444]">{postDetail.text}</div>
              {postDetail.image && <img src={postDetail.image} alt="" className="mt-5 w-full max-h-[420px] rounded-[14px] object-cover" />}
              <div className="mt-7 pt-4 border-t border-[#f0f0f1]">
                <button onClick={() => { setPostDetail(null); setCommentingPostId(postDetail.id); setCommentInputText(''); }} className="text-xs text-[#666]">评论 · {postDetail.commentsList?.length || 0}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showMyProfilePage && (
        <div className="absolute inset-0 z-[70] bg-white animate-in slide-in-from-right">
          <div className="h-full overflow-y-auto no-scrollbar">
            <div className="h-[220px] bg-[#efeeec] relative">
              <button onClick={() => setShowMyProfilePage(false)} className="absolute top-4 left-4 w-8 h-8 rounded-full bg-white/85 text-[#555] z-10">‹</button>
              <div className="absolute -bottom-10 left-5 w-[88px] h-[88px] rounded-full border-4 border-white bg-[#f1f1f2] overflow-hidden shadow-sm grid place-items-center">
                {currentUser.avatar ? <img src={currentUser.avatar} alt="" className="w-full h-full object-cover" /> : <span className="text-2xl text-[#aaa]">{currentUser.name?.[0] || '·'}</span>}
              </div>
            </div>
            <div className="px-5 pt-14 pb-10">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[22px] font-semibold text-[#222]">{currentUser.name || '未设置昵称'}</div>
                  <div className="text-[10px] text-[#aaa] mt-1">{currentUser.id ? '@' + currentUser.id.replace(/^@/, '') : '尚未设置账号 ID'}</div>
                </div>
                <button onClick={() => { setProfileDraft(currentUser); setShowProfileEditor(true); }} className="px-3 py-1.5 rounded-full border border-[#ddd] text-[10px]">编辑</button>
              </div>
              <div className="mt-4 text-[12px] leading-6 text-[#555]">{currentUser.desc || '还没有个人简介。'}</div>
              <div className="grid grid-cols-3 gap-2 mt-7">
                <div className="rounded-xl bg-[#f7f7f8] p-3 text-center"><div className="text-lg font-semibold">{momentsPosts.filter(p => p.name === currentUser.name).length}</div><div className="text-[9px] text-[#999]">动态</div></div>
                <div className="rounded-xl bg-[#f7f7f8] p-3 text-center"><div className="text-lg font-semibold">{friendsList.length}</div><div className="text-[9px] text-[#999]">好友</div></div>
                <div className="rounded-xl bg-[#f7f7f8] p-3 text-center"><div className="text-lg font-semibold">{globalFavorites.length}</div><div className="text-[9px] text-[#999]">收藏</div></div>
              </div>
              <div className="mt-8 pt-5 border-t border-[#f0f0f1]">
                <div className="text-[9px] tracking-[1.5px] text-[#aaa]">MY VROOM</div>
                <div className="mt-3 space-y-3">
                  {momentsPosts.filter(p => p.name === currentUser.name).slice(0,5).map(p => (
                    <button key={p.id} onClick={() => setPostDetail(p)} className="w-full text-left rounded-xl border border-[#eee] p-3 hover:bg-[#fafafa]">
                      <div className="text-[10px] text-[#aaa]">{p.time} · {p.tag}</div>
                      <div className="mt-1 text-xs text-[#444] line-clamp-3">{p.text}</div>
                    </button>
                  ))}
                  {!momentsPosts.some(p => p.name === currentUser.name) && <div className="text-xs text-[#aaa]">还没有发布过动态。</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showProfileEditor && (
        <div
          className="absolute inset-0 z-60 bg-black/25 flex items-end"
          onClick={() => setShowProfileEditor(false)}
        >
          <div
            className="w-full rounded-t-[26px] bg-white p-5 pb-7 space-y-3 animate-in slide-in-from-bottom"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[8px] font-mono tracking-[1.5px] text-[#aaa]">MY PROFILE · PRIVATE</div>
                <div className="mt-1 font-semibold text-[15px] text-[#222]">编辑我的个人主页</div>
              </div>
              <button onClick={() => setShowProfileEditor(false)} className="text-xl text-[#aaa]">×</button>
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <label className="text-[10px] text-[#888]">昵称</label>
                <input
                  value={profileDraft.name}
                  onChange={e => setProfileDraft({ ...profileDraft, name: e.target.value })}
                  placeholder="你的名字"
                  className="w-full mt-1 h-10 rounded-xl bg-[#f7f7f8] px-3 text-xs outline-none"
                />
              </div>
              <label className="w-10 h-10 rounded-xl bg-[#f1f1f2] border border-[#e5e5e6] grid place-items-center cursor-pointer overflow-hidden">
                {profileDraft.avatar ? <img src={profileDraft.avatar} alt="" className="w-full h-full object-cover" /> : <span className="text-[10px] text-[#999]">头像</span>}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => setProfileDraft(prev => ({ ...prev, avatar: String(reader.result || '') }));
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            </div>

            <div>
              <label className="text-[10px] text-[#888]">账号 ID</label>
              <input
                value={profileDraft.id}
                onChange={e => setProfileDraft({ ...profileDraft, id: e.target.value })}
                placeholder="例如：my_private_id"
                className="w-full mt-1 h-10 rounded-xl bg-[#f7f7f8] px-3 text-xs outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] text-[#888]">个人简介</label>
              <textarea
                value={profileDraft.desc}
                onChange={e => setProfileDraft({ ...profileDraft, desc: e.target.value })}
                placeholder="写一句只属于你的简介……"
                rows={3}
                className="w-full mt-1 rounded-xl bg-[#f7f7f8] px-3 py-2.5 text-xs outline-none resize-none"
              />
            </div>

            <button
              onClick={() => {
                const next = {
                  ...profileDraft,
                  name: profileDraft.name.trim(),
                  id: profileDraft.id.trim().replace(/^@/, ''),
                  desc: profileDraft.desc.trim(),
                };
                setCurrentUser(next);
                localStorage.setItem('line:current-user', JSON.stringify(next));
                window.dispatchEvent(new CustomEvent('sane333:user-profile-changed'));
                setShowProfileEditor(false);
                showToast('个人主页已保存');
              }}
              className="w-full py-2.5 rounded-xl bg-[#292724] text-white text-[11px] font-semibold"
            >
              保存个人主页
            </button>
          </div>
        </div>
      )}

      {showCreateMaskDrawer && (
        <div
          onClick={() => setShowCreateMaskDrawer(false)}
          className="absolute inset-0 bg-black/25 z-55 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-5 pb-8 space-y-4 animate-in slide-in-from-bottom"
          >
            <div className="flex justify-between items-center">
              <span className="font-semibold text-sm text-[#222]">创建新面具身份</span>
              <button onClick={() => setShowCreateMaskDrawer(false)} className="text-xl text-[#aaa]">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <span className="text-[11px] text-[#666]">身份昵称</span>
                <input
                  type="text"
                  placeholder="例如：苏念、林夏..."
                  value={newMaskName}
                  onChange={(e) => setNewMaskName(e.target.value)}
                  className="w-full mt-1 p-2.5 bg-[#f6f6f7] rounded-[10px] text-xs outline-none"
                />
              </div>
              <div>
                <span className="text-[11px] text-[#666]">个性签名 / 身份描述</span>
                <input
                  type="text"
                  placeholder="例如：东京 · 摄影师"
                  value={newMaskDesc}
                  onChange={(e) => setNewMaskDesc(e.target.value)}
                  className="w-full mt-1 p-2.5 bg-[#f6f6f7] rounded-[10px] text-xs outline-none"
                />
              </div>
            </div>
            <button
              onClick={() => {
                if (!newMaskName.trim()) {
                  showToast('请输入身份姓名');
                  return;
                }
                const newMask = {
                  name: newMaskName.trim(),
                  id: `mask_${Date.now()}`,
                  desc: newMaskDesc.trim() || '自定义新身份',
                };
                setMasks((prev) => [...prev, newMask]);
                setCurrentUser(newMask);
                setNewMaskName('');
                setNewMaskDesc('');
                setShowCreateMaskDrawer(false);
                showToast(`已创建并切换为 ${newMask.name}`);
              }}
              className="w-full py-2.5 bg-[#d4aab5] text-white rounded-[12px] text-xs font-semibold cursor-pointer"
            >
              完成创建
            </button>
          </div>
        </div>
      )}

      {/* =====================================================
           MODAL 2: CREATE GROUP (创建群聊抽屉)
      ===================================================== */}
      {showGroupModal && (
        <div
          onClick={() => setShowGroupModal(false)}
          className="absolute inset-0 bg-black/25 z-50 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-5 pb-8 space-y-4 animate-in slide-in-from-bottom max-h-[80%] flex flex-col"
          >
            <div className="flex justify-between items-center">
              <div>
                <div className="text-[16px] font-semibold text-[#202124]">创建新群聊</div>
                <div className="text-[10px] text-[#aaa]">选择群成员一起聊天</div>
              </div>
              <button onClick={() => setShowGroupModal(false)} className="text-xl text-[#aaa] cursor-pointer">
                ×
              </button>
            </div>

            <div>
              <span className="text-[11px] text-[#666]">群聊名称</span>
              <input
                type="text"
                placeholder="给群聊起个好听的名字…"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="w-full mt-1 p-2.5 bg-[#f6f6f7] rounded-[10px] text-xs outline-none text-[#333]"
              />
            </div>

            <div>
              <span className="text-[11px] text-[#666]">勾选好友加入群聊：</span>
              <div className="mt-2 divide-y divide-[#f2f2f4] max-h-48 overflow-y-auto text-xs">
                {friendsList.map((friend, i) => {
                  const isSelected = selectedGroupFriends.includes(friend.name);
                  return (
                    <div
                      key={i}
                      onClick={() => {
                        setSelectedGroupFriends((prev) =>
                          prev.includes(friend.name)
                            ? prev.filter((n) => n !== friend.name)
                            : [...prev, friend.name]
                        );
                      }}
                      className="py-2.5 px-2 flex items-center justify-between cursor-pointer hover:bg-[#fafafa]"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-[#f1f1f2] flex items-center justify-center text-[10px] text-[#888]">
                          {friend.name[0]}
                        </div>
                        <span className="font-medium text-[#333]">{friend.name}</span>
                      </div>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        isSelected ? 'bg-[#ae7e89] border-[#ae7e89] text-white text-[9px]' : 'border-[#ccc]'
                      }`}>
                        {isSelected && '✓'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              onClick={() => {
                const groupTitle = newGroupName.trim() || '我们的新群聊';
                const group = createLineGroup({
                  name: groupTitle,
                  ownerId: currentUser.id,
                  ownerName: currentUser.name,
                  memberNames: selectedGroupFriends,
                  characterIds: Object.fromEntries(
                    importedCharacters
                      .filter(character => selectedGroupFriends.includes(character.name))
                      .map(character => [character.name, character.id])
                  ),
                  announcement: '',
                });
                const newChat = {
                  id: group.id,
                  name: group.name,
                  time: '刚刚',
                  preview: `${currentUser.name} 创建了群聊`,
                  unread: 0,
                  isPinned: false,
                  isMuted: false,
                  draft: '',
                  isGroup: true,
                  groupId: group.id,
                };
                setChatItems((prev) => [newChat, ...prev]);
                setShowGroupModal(false);
                showToast(`已创建群聊「${groupTitle}」`);
              }}
              className="w-full py-2.5 bg-[#d4aab5] text-white rounded-[12px] text-xs font-semibold cursor-pointer"
            >
              完成并进入群聊
            </button>
          </div>
        </div>
      )}

      {/* =====================================================
           MODAL 3: ADD FRIEND (添加好友抽屉)
      ===================================================== */}
      {showFriendModal && (
        <div
          onClick={() => setShowFriendModal(false)}
          className="absolute inset-0 bg-black/25 z-50 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-5 pb-8 space-y-4 animate-in slide-in-from-bottom"
          >
            <div className="flex justify-between items-center">
              <span className="text-[16px] font-semibold text-[#202124]">添加新好友</span>
              <button onClick={() => setShowFriendModal(false)} className="text-xl text-[#aaa] cursor-pointer">
                ×
              </button>
            </div>

            <div className="space-y-3">
              <div className="h-[40px] bg-[#f6f6f7] rounded-[11px] flex items-center px-3.5 text-xs text-[#555]">
                <Search className="w-4 h-4 text-[#aaa] mr-2" />
                <input
                  type="text"
                  placeholder="搜索好友 ID / 手机号"
                  value={friendSearchQuery}
                  onChange={(e) => setFriendSearchQuery(e.target.value)}
                  className="w-full bg-transparent outline-none"
                />
              </div>

              {friendSearchQuery && (
                <div className="p-3 bg-[#faf8f9] rounded-[12px] border border-[#f0dee3] flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-[#333]">{friendSearchQuery}</div>
                    <div className="text-[10px] text-[#aaa]">匹配到用户</div>
                  </div>
                  <button
                    onClick={() => {
                      const newF = { name: friendSearchQuery, note: '新添加的好友', online: true, pinyin: 'N' };
                      setFriendsList((prev) => [newF, ...prev]);
                      setChatItems((prev) => [
                        { id: `c_${Date.now()}`, name: friendSearchQuery, time: '刚刚', preview: '打个招呼吧', unread: 0, isPinned: false, isMuted: false, draft: '', isGroup: false },
                        ...prev
                      ]);
                      setFriendSearchQuery('');
                      setShowFriendModal(false);
                      showToast(`已添加 ${friendSearchQuery} 为好友`);
                    }}
                    className="px-3 py-1 bg-[#ae7e89] text-white rounded-full text-xs cursor-pointer"
                  >
                    添加好友
                  </button>
                </div>
              )}

              <button
                onClick={() => {
                  setShowFriendModal(false);
                  setShowCreateFriendDrawer(true);
                }}
                className="w-full h-[45px] border border-dashed border-[#ddd] rounded-[10px] flex items-center justify-center text-[#888] text-xs cursor-pointer hover:border-[#ae7e89] hover:text-[#ae7e89]"
              >
                ＋ 手动创建新的联系人
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 手动创建联系人抽屉 */}
      {showCreateFriendDrawer && (
        <div
          onClick={() => setShowCreateFriendDrawer(false)}
          className="absolute inset-0 bg-black/25 z-55 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-5 pb-8 space-y-4 animate-in slide-in-from-bottom"
          >
            <div className="flex justify-between items-center">
              <span className="font-semibold text-sm text-[#222]">新建联系人</span>
              <button onClick={() => setShowCreateFriendDrawer(false)} className="text-xl text-[#aaa]">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <span className="text-[11px] text-[#666]">联系人姓名</span>
                <input
                  type="text"
                  placeholder="输入朋友名字..."
                  value={newFriendName}
                  onChange={(e) => setNewFriendName(e.target.value)}
                  className="w-full mt-1 p-2.5 bg-[#f6f6f7] rounded-[10px] text-xs outline-none"
                />
              </div>
              <div>
                <span className="text-[11px] text-[#666]">备注信息 / 标签</span>
                <input
                  type="text"
                  placeholder="如：咖啡馆初遇、大学好友..."
                  value={newFriendNote}
                  onChange={(e) => setNewFriendNote(e.target.value)}
                  className="w-full mt-1 p-2.5 bg-[#f6f6f7] rounded-[10px] text-xs outline-none"
                />
              </div>
            </div>
            <button
              onClick={() => {
                if (!newFriendName.trim()) {
                  showToast('请输入好友名字');
                  return;
                }
                const name = newFriendName.trim();
                const note = newFriendNote.trim() || '珍视的好友';
                setFriendsList((prev) => [{ name, note, online: true, pinyin: name[0] }, ...prev]);
                setChatItems((prev) => [
                  { id: `c_${Date.now()}`, name, time: '刚刚', preview: '打个招呼吧', unread: 0, isPinned: false, isMuted: false, draft: '', isGroup: false },
                  ...prev,
                ]);
                setNewFriendName('');
                setNewFriendNote('');
                setShowCreateFriendDrawer(false);
                showToast(`已添加联系人 ${name}`);
              }}
              className="w-full py-2.5 bg-[#d4aab5] text-white rounded-[12px] text-xs font-semibold cursor-pointer"
            >
              保存联系人
            </button>
          </div>
        </div>
      )}

      {/* =====================================================
           MODAL 4: POST TO MOMENTS (发朋友圈抽屉)
      ===================================================== */}
      {showPostModal && (
        <div
          onClick={() => setShowPostModal(false)}
          className="absolute inset-0 bg-black/25 z-50 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-5 pb-8 space-y-4 animate-in slide-in-from-bottom"
          >
            <div className="flex justify-between items-center">
              <span className="text-[16px] font-semibold text-[#202124]">分享生活动态</span>
              <button onClick={() => setShowPostModal(false)} className="text-xl text-[#aaa] cursor-pointer">
                ×
              </button>
            </div>

            <textarea
              value={newPostText}
              onChange={(e) => setNewPostText(e.target.value)}
              placeholder="记录这一刻的心情、文字或所见所闻……"
              className="w-full h-28 bg-[#f8f8f9] rounded-[12px] p-3 text-xs outline-none resize-none leading-relaxed text-[#333]"
            />

            <label className="h-[42px] border border-dashed border-[#ddd] rounded-[11px] flex items-center justify-center text-[11px] text-[#888] cursor-pointer hover:border-[#ae7e89] hover:text-[#ae7e89]">
              {newPostImage ? '已选择图片 · 点击更换' : '＋ 添加一张图片'}
              <input type="file" accept="image/*" className="hidden" onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => setNewPostImage(String(reader.result || ''));
                reader.readAsDataURL(file);
              }} />
            </label>

            <div>
              <span className="text-[11px] text-[#888]">选择话题标签：</span>
              <div className="flex gap-2 mt-1.5 text-[10px]">
                {['#日常', '#午后', '#散步', '#咖啡', '#夜读'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setNewPostTag(t)}
                    className={`px-2.5 py-1 rounded-full cursor-pointer transition-colors ${
                      newPostTag === t
                        ? 'bg-[#faf1f3] text-[#ae7e89] border border-[#f0dee3] font-medium'
                        : 'bg-[#f4f4f5] text-[#666]'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                if (!newPostText.trim()) {
                  showToast('请输入动态内容');
                  return;
                }
                const newPost = {
                  id: `p_${Date.now()}`,
                  name: currentUser.name,
                  time: '刚刚',
                  text: newPostText.trim(),
                  tag: newPostTag,
                  likes: 0,
                  liked: false,
                  commentsList: [],
                  image: newPostImage || undefined,
                };
                setMomentsPosts((prev) => [newPost, ...prev]);
                setNewPostText('');
                setNewPostImage('');
                setShowPostModal(false);
                showToast('朋友圈动态已发布 ✨');
              }}
              className="w-full py-2.5 bg-[#d4aab5] text-white rounded-[12px] text-xs font-semibold cursor-pointer"
            >
              发布到朋友圈
            </button>
          </div>
        </div>
      )}

      {/* =====================================================
           MODAL 4.5: MOMENTS COMMENT INPUT DRAWER (评论抽屉)
      ===================================================== */}
      {commentingPostId && (
        <div
          onClick={() => setCommentingPostId(null)}
          className="absolute inset-0 bg-black/25 z-55 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-4 pb-6 space-y-3 animate-in slide-in-from-bottom"
          >
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-[#333]">写下你的评论</span>
              <button onClick={() => setCommentingPostId(null)} className="text-lg text-[#aaa]">×</button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={commentInputText}
                onChange={(e) => setCommentInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && commentInputText.trim()) {
                    setMomentsPosts((prev) =>
                      prev.map((p) => {
                        if (p.id !== commentingPostId) return p;
                        return {
                          ...p,
                          commentsList: [
                            ...(p.commentsList || []),
                            { user: currentUser.name, text: commentInputText.trim(), time: '刚刚' },
                          ],
                        };
                      })
                    );
                    setCommentingPostId(null);
                    setCommentInputText('');
                    showToast('评论已发送');
                  }
                }}
                placeholder="发送一条友好的评论…"
                className="flex-1 bg-[#f6f6f7] p-2.5 rounded-[12px] text-xs outline-none"
              />
              <button
                onClick={() => {
                  if (!commentInputText.trim()) return;
                  setMomentsPosts((prev) =>
                    prev.map((p) => {
                      if (p.id !== commentingPostId) return p;
                      return {
                        ...p,
                        commentsList: [
                          ...(p.commentsList || []),
                          { user: currentUser.name, text: commentInputText.trim(), time: '刚刚' },
                        ],
                      };
                    })
                  );
                  setCommentingPostId(null);
                  setCommentInputText('');
                  showToast('评论已发送');
                }}
                className="px-3.5 py-2.5 bg-[#d4aab5] text-white rounded-[12px] text-xs font-semibold cursor-pointer"
              >
                发送
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
           MODAL 5: CHAT ITEM CONTEXT ACTION SHEET (长按会话操作)
      ===================================================== */}
      {chatContextMenu && (
        <div
          onClick={() => setChatContextMenu(null)}
          className="absolute inset-0 bg-black/25 z-60 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-4 pb-6 space-y-3 animate-in slide-in-from-bottom"
          >
            <div className="w-8 h-1 bg-[#ddd] rounded-full mx-auto" />
            <div className="font-semibold text-sm text-[#333] px-2">
              {chatContextMenu.name}
              {chatContextMenu.variantLabel && <span className="ml-1 text-[9px] font-normal text-[#aaa]">· {chatContextMenu.variantLabel}</span>}
              {chatContextMenu.chatLabel && <div className="text-[9px] font-normal text-[#aaa] mt-0.5">{chatContextMenu.chatLabel}</div>}
            </div>
            {!chatContextMenu.isGroup && chatContextMenu.characterId && (
              <button
                onClick={() => {
                  const existing = chatItems.filter(item => item.characterId === chatContextMenu.characterId);
                  const newChat: LineChatItem = {
                    ...chatContextMenu,
                    id: `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
                    chatLabel: `聊天 ${existing.length + 1}`,
                    time: '刚刚',
                    preview: '新的独立聊天',
                    unread: 0,
                    isPinned: false,
                    isMuted: false,
                    draft: '',
                  };
                  setChatItems(prev => [newChat, ...prev]);
                  setChatContextMenu(null);
                  setActiveChatId(newChat.id);
                  showToast(`已创建 ${chatContextMenu.name} 的新聊天`);
                }}
                className="w-full px-2.5 py-2.5 rounded-xl bg-[#faf3f5] text-[#ae7e89] text-xs text-left cursor-pointer"
              >
                ＋ 为这个角色新建聊天
              </button>
            )}

            <div className="divide-y divide-[#f2f2f4] text-xs">
              {/* 置顶切换 */}
              <div
                onClick={() => {
                  setChatItems((prev) =>
                    prev.map((c) =>
                      c.id === chatContextMenu.id ? { ...c, isPinned: !c.isPinned } : c
                    )
                  );
                  setChatContextMenu(null);
                  showToast(chatContextMenu.isPinned ? '已取消置顶' : '已置顶会话 📌');
                }}
                className="py-3 px-2 flex items-center justify-between cursor-pointer hover:bg-neutral-50"
              >
                <span className="text-[#333]">{chatContextMenu.isPinned ? '取消置顶' : '置顶聊天'}</span>
                <Pin className="w-4 h-4 text-[#ae7e89]" />
              </div>

              {/* 免打扰切换 */}
              <div
                onClick={() => {
                  setChatItems((prev) =>
                    prev.map((c) =>
                      c.id === chatContextMenu.id ? { ...c, isMuted: !c.isMuted } : c
                    )
                  );
                  setChatContextMenu(null);
                  showToast(chatContextMenu.isMuted ? '已开启新消息提醒' : '已设为免打扰 🔕');
                }}
                className="py-3 px-2 flex items-center justify-between cursor-pointer hover:bg-neutral-50"
              >
                <span className="text-[#333]">{chatContextMenu.isMuted ? '开启通知提醒' : '消息免打扰'}</span>
                <BellOff className="w-4 h-4 text-[#888]" />
              </div>

              {/* 标为已读/未读 */}
              <div
                onClick={() => {
                  setChatItems((prev) =>
                    prev.map((c) =>
                      c.id === chatContextMenu.id
                        ? { ...c, unread: c.unread > 0 ? 0 : 1 }
                        : c
                    )
                  );
                  setChatContextMenu(null);
                  showToast('已更新消息标记');
                }}
                className="py-3 px-2 flex items-center justify-between cursor-pointer hover:bg-neutral-50"
              >
                <span className="text-[#333]">{chatContextMenu.unread > 0 ? '标为已读' : '标为未读'}</span>
                <span className="text-xs text-[#ae7e89]">✉</span>
              </div>

              {/* 删除此会话 */}
              <div
                onClick={() => {
                  setChatItems((prev) => prev.filter((c) => c.id !== chatContextMenu.id));
                  setChatContextMenu(null);
                  showToast('已删除会话');
                }}
                className="py-3 px-2 flex items-center justify-between cursor-pointer hover:bg-neutral-50 text-rose-500"
              >
                <span>删除此对话</span>
                <Trash2 className="w-4 h-4" />
              </div>
            </div>

            <button
              onClick={() => setChatContextMenu(null)}
              className="w-full py-2.5 rounded-[12px] bg-[#f7f7f7] text-[#777] text-xs font-medium cursor-pointer"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* =====================================================
           MODAL 6: MY MOMENTS DRAWER (我的朋友圈)
      ===================================================== */}
      {showMyMomentsModal && (
        <div
          onClick={() => setShowMyMomentsModal(false)}
          className="absolute inset-0 bg-black/25 z-55 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-5 pb-8 space-y-4 max-h-[85%] overflow-y-auto animate-in slide-in-from-bottom"
          >
            <div className="flex justify-between items-center">
              <div>
                <span className="text-[17px] font-semibold text-[#202124]" >{tx('我的朋友圈', 'マイモーメンツ')}</span>
                <div className="text-[10px] text-[#aaa]">当前身份：{currentUser.name}</div>
              </div>
              <button onClick={() => setShowMyMomentsModal(false)} className="text-xl text-[#aaa] cursor-pointer">
                ×
              </button>
            </div>

            <div className="divide-y divide-[#f2f2f4]">
              {momentsPosts
                .filter((p) => p.name === currentUser.name)
                .map((post) => (
                  <div key={post.id} className="py-3 space-y-1.5">
                    <div className="flex justify-between text-[11px] text-[#aaa]">
                      <span>{post.time}</span>
                      <span className="text-[#ae7e89]">{post.tag}</span>
                    </div>
                    <div className="text-xs text-[#333] leading-relaxed">{post.text}</div>
                    <div className="text-[10px] text-[#888] flex items-center justify-between pt-1">
                      <span>♥ {post.likes} 赞 · {post.commentsList?.length || 0} 评论</span>
                      <button
                        onClick={() => {
                          setMomentsPosts((prev) => prev.filter((p) => p.id !== post.id));
                          showToast('已删除该动态');
                        }}
                        className="text-rose-400 hover:text-rose-600 cursor-pointer"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}

              {momentsPosts.filter((p) => p.name === currentUser.name).length === 0 && (
                <div className="py-12 text-center text-xs text-[#aaa]">
                  当前身份尚未发布过动态
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
           MODAL 7: FAVORITES DRAWER (收藏箱)
      ===================================================== */}
      {showFavoritesModal && (
        <div
          onClick={() => setShowFavoritesModal(false)}
          className="absolute inset-0 bg-black/25 z-55 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-5 pb-8 space-y-4 max-h-[85%] overflow-y-auto animate-in slide-in-from-bottom"
          >
            <div className="flex justify-between items-center">
              <div>
                <span className="text-[17px] font-semibold text-[#202124]" >{tx('我的收藏', 'お気に入り')}</span>
                <div className="text-[10px] text-[#aaa]">共 {globalFavorites.length} 条珍藏内容</div>
              </div>
              <button onClick={() => setShowFavoritesModal(false)} className="text-xl text-[#aaa] cursor-pointer">
                ×
              </button>
            </div>

            <div className="divide-y divide-[#f2f2f4]">
              {globalFavorites.map((fav) => (
                <div key={fav.id} className="py-3 space-y-1">
                  <div className="flex justify-between text-[11px] text-[#888]">
                    <span className="font-semibold text-[#ae7e89]">{fav.contactName}</span>
                    <span className="text-[#aaa]">{fav.time}</span>
                  </div>
                  <div className="text-xs text-[#333] leading-relaxed whitespace-pre-wrap">{fav.text}</div>
                  <div className="flex justify-end gap-2 pt-1 text-[10px]">
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(fav.text);
                        showToast('已复制内容');
                      }}
                      className="px-2 py-0.5 rounded bg-[#f5f5f7] text-[#555] hover:bg-[#eaeaea] cursor-pointer"
                    >
                      复制
                    </button>
                    <button
                      onClick={() => {
                        setGlobalFavorites((prev) => prev.filter((f) => f.id !== fav.id));
                        showToast('已移除收藏');
                      }}
                      className="px-2 py-0.5 rounded bg-rose-50 text-rose-500 hover:bg-rose-100 cursor-pointer"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
           MODAL 8: NOTIFICATION SETTINGS (新消息通知)
      ===================================================== */}
      {showNotificationModal && (
        <div
          onClick={() => setShowNotificationModal(false)}
          className="absolute inset-0 bg-black/25 z-55 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-5 pb-8 space-y-4 animate-in slide-in-from-bottom"
          >
            <div className="flex justify-between items-center">
              <span className="text-[17px] font-semibold text-[#202124]" >{tx('新消息通知设置', '通知設定')}</span>
              <button onClick={() => setShowNotificationModal(false)} className="text-xl text-[#aaa] cursor-pointer">
                ×
              </button>
            </div>

            <div className="divide-y divide-[#f2f2f4] text-xs">
              <div className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-[#333]">接收新消息通知</div>
                  <div className="text-[10px] text-[#aaa]">收到消息时在通知栏提示</div>
                </div>
                <div
                  onClick={() => setNotifSound(!notifSound)}
                  className={`w-9 h-5 rounded-full relative cursor-pointer transition-colors ${
                    notifSound ? 'bg-[#d4aab5]' : 'bg-[#ddd]'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
                    notifSound ? 'left-4.5' : 'left-0.5'
                  }`} />
                </div>
              </div>

              <div className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-[#333]">振动提醒</div>
                  <div className="text-[10px] text-[#aaa]">收到消息时触发微震</div>
                </div>
                <div
                  onClick={() => setNotifVibrate(!notifVibrate)}
                  className={`w-9 h-5 rounded-full relative cursor-pointer transition-colors ${
                    notifVibrate ? 'bg-[#d4aab5]' : 'bg-[#ddd]'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
                    notifVibrate ? 'left-4.5' : 'left-0.5'
                  }`} />
                </div>
              </div>

              <div className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-[#333]">通知显示消息详情</div>
                  <div className="text-[10px] text-[#aaa]">锁屏时展示发送人与文字摘要</div>
                </div>
                <div
                  onClick={() => setNotifPreview(!notifPreview)}
                  className={`w-9 h-5 rounded-full relative cursor-pointer transition-colors ${
                    notifPreview ? 'bg-[#d4aab5]' : 'bg-[#ddd]'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
                    notifPreview ? 'left-4.5' : 'left-0.5'
                  }`} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
           MODAL 9: GLOBAL CHAT SETTINGS (全局聊天设置)
      ===================================================== */}
      {showGlobalChatSettingsModal && (
        <div
          onClick={() => setShowGlobalChatSettingsModal(false)}
          className="absolute inset-0 bg-black/25 z-55 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-5 pb-8 space-y-4 animate-in slide-in-from-bottom"
          >
            <div className="flex justify-between items-center">
              <span className="text-[17px] font-semibold text-[#202124]" >{tx('聊天通用设置', 'チャット設定')}</span>
              <button onClick={() => setShowGlobalChatSettingsModal(false)} className="text-xl text-[#aaa] cursor-pointer">
                ×
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {(['chat', 'moments'] as const).map((channel) => {
                const s = channelSettings[channel];
                const label = channel === 'chat' ? 'LINE 聊天 API' : '朋友圈 Moments API';
                const models = channelModels[channel];
                return (
                  <div key={channel} className="p-3 bg-[#faf8f9] rounded-[12px] border border-[#f0e4e7] space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-[#ae7e89]">{label}</div>
                        <div className="text-[9px] text-[#999] mt-0.5">{s.enabled ? '当前聊天频道使用独立 API' : '默认跟随全局 AI API'}</div>
                      </div>
                      <button onClick={() => updateChannelSettings(channel, { enabled: !s.enabled })} className={`px-2.5 py-1 rounded-full text-[9px] ${s.enabled ? 'bg-[#d4aab5] text-white' : 'bg-[#eee] text-[#777]'}`}>{s.enabled ? '独立 API' : '跟随全局'}</button>
                    </div>
                    {s.enabled && <div className="space-y-2">
                      <input value={s.apiBaseUrl} onChange={e => updateChannelSettings(channel, { apiBaseUrl: e.target.value })} placeholder="API Base URL" className="w-full p-2 bg-white border border-[#e8e8e9] rounded-[9px] text-[10px] outline-none" />
                      <input value={s.apiKey} onChange={e => updateChannelSettings(channel, { apiKey: e.target.value })} placeholder="API Key" type="password" className="w-full p-2 bg-white border border-[#e8e8e9] rounded-[9px] text-[10px] outline-none" />
                      <div className="flex gap-2">
                        <select value={s.model} onChange={e => updateChannelSettings(channel, { model: e.target.value })} className="flex-1 p-2 bg-white border border-[#e8e8e9] rounded-[9px] text-[10px] outline-none">
                          <option value="">选择模型</option>
                          {models.map(model => <option key={model} value={model}>{model}</option>)}
                          {s.model && !models.includes(s.model) && <option value={s.model}>{s.model}</option>}
                        </select>
                        <button onClick={() => fetchChannelModels(channel)} className="px-2.5 rounded-[9px] bg-[#f0e6e8] text-[#8c5f6b] text-[9px]">{channelBusy === channel + '-models' ? '拉取中…' : '拉取模型'}</button>
                      </div>
                      <button onClick={() => testChannel(channel)} className="w-full py-2 rounded-[9px] bg-[#292724] text-white text-[10px]">{channelBusy === channel + '-test' ? '测试中…' : '测试连接'}</button>
                    </div>}
                  </div>
                );
              })}
              <div onClick={() => { setChatItems(prev => prev.map(c => ({ ...c, unread: 0 }))); showToast('已全部标记为已读'); }} className="p-3 bg-[#f8f8fa] rounded-[12px] flex items-center justify-between cursor-pointer hover:bg-[#f0f0f2]"><span className="text-[#333]">一键全部标为已读</span><span className="text-[#aaa]">›</span></div>
              <div onClick={() => { setChatItems(prev => prev.map(c => ({ ...c, draft: '' }))); showToast('已清空所有草稿记录'); }} className="p-3 bg-[#f8f8fa] rounded-[12px] flex items-center justify-between cursor-pointer hover:bg-[#f0f0f2]"><span className="text-[#333]">清空所有草稿记录</span><span className="text-[#aaa]">›</span></div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
           MODAL 10: PRIVACY SETTINGS (隐私权限)
      ===================================================== */}
      {showPrivacyModal && (
        <div
          onClick={() => setShowPrivacyModal(false)}
          className="absolute inset-0 bg-black/25 z-55 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-5 pb-8 space-y-3 animate-in slide-in-from-bottom text-xs"
          >
            <div className="flex justify-between items-center mb-1">
              <span className="text-[17px] font-semibold text-[#202124]" >{tx('隐私权限与安全', 'プライバシーと安全')}</span>
              <button onClick={() => setShowPrivacyModal(false)} className="text-xl text-[#aaa] cursor-pointer">
                ×
              </button>
            </div>
            <div className="p-3 bg-[#fafafa] rounded-[12px] border border-[#f0f0f2] space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[#333]">加我为好友需要验证</span>
                <span className="text-[#ae7e89] font-semibold">已开启</span>
              </div>
              <div className="border-t border-[#eee] pt-2 flex justify-between items-center">
                <span className="text-[#333]">朋友圈可见范围</span>
                <span className="text-[#888]">全部公开</span>
              </div>
              <div className="border-t border-[#eee] pt-2 flex justify-between items-center">
                <span className="text-[#333]">端到端加密通话</span>
                <span className="text-[#8c5f6b]">有效保护中</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
           MODAL 11: GENERAL SETTINGS (系统通用设置)
      ===================================================== */}
      {showGeneralSettingsModal && (
        <div
          onClick={() => setShowGeneralSettingsModal(false)}
          className="absolute inset-0 bg-black/25 z-55 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-5 pb-8 space-y-3 animate-in slide-in-from-bottom text-xs"
          >
            <div className="flex justify-between items-center mb-1">
              <span className="text-[17px] font-semibold text-[#202124]" >{tx('系统通用设置', 'システム設定')}</span>
              <button onClick={() => setShowGeneralSettingsModal(false)} className="text-xl text-[#aaa] cursor-pointer">
                ×
              </button>
            </div>
            <div className="divide-y divide-[#f2f2f4]">
              <div className="py-2.5 flex justify-between items-center">
                <div>
                  <div className="text-[#333]">全局 AI</div>
                  <div className="text-[9px] text-[#aaa] mt-0.5">LINE 默认聊天与未单独指定频道使用</div>
                </div>
                <span className="text-[#888]">{readAppSettings().apiKey && readAppSettings().model ? readAppSettings().model : '未配置'}</span>
              </div>
              <div className="py-2.5 flex justify-between items-center">
                <div>
                  <div className="text-[#333]">频道 API</div>
                  <div className="text-[9px] text-[#aaa] mt-0.5">聊天与朋友圈可分别覆盖全局</div>
                </div>
                <span className="text-[#ae7e89]">已支持独立配置</span>
              </div>
              <button
                onClick={() => onNavigateScreen?.('settings')}
                className="w-full py-2.5 text-left flex justify-between items-center cursor-pointer hover:bg-neutral-50"
              >
                <span className="text-[#333]">打开系统 AI / 媒体 API 设置</span>
                <span className="text-[#ae7e89]">前往 ›</span>
              </button>
              <div className="py-2.5 flex justify-between items-center">
                <span className="text-[#333]">{tx('多语言 (Language)', '言語 (Language)')}</span>
                <button onClick={() => setLineLocale(ja ? 'zh-CN' : 'ja-JP')} className="text-[#ae7e89]">{ja ? '日本語' : '简体中文'} ↔</button>
              </div>
              <div className="py-2.5 flex justify-between items-center">
                <span className="text-[#333]">版本</span>
                <span className="text-[#888]">LINE — White Edition v2.5</span>
              </div>
              <div
                onClick={() => {
                  showToast('本地缓存已清理完毕');
                }}
                className="py-2.5 flex justify-between items-center cursor-pointer hover:bg-neutral-50"
              >
                <span className="text-[#333]">清除缓存数据</span>
                <span className="text-[#ae7e89]">立即清理 ›</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toastMsg && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-20 bg-black/85 text-white px-3.5 py-1.5 rounded-full text-[11px] shadow-lg pointer-events-none z-60 animate-in fade-in">
          {toastMsg}
        </div>
      )}

    </div>
  );
}
