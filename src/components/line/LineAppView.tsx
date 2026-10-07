    setChatItems(prev => {
      let changed = false;
      const next = prev.map(chat => {
        if (chat.personaId) return chat;
        changed = true;
        return { ...chat, personaId: effectivePersonaId };
      });
      return changed ? next : prev;
    });
  }, [effectivePersonaId]);
  const chatItems = Array.isArray(chatItemsRaw)
    ? chatItemsRaw.filter((c): c is LineChatItem => !!c && typeof c === 'object' && typeof c.id === 'string')
      .map(c => ({
        ...c,
        name: typeof c.name === 'string' ? c.name : '未命名聊天',
        preview: typeof c.preview === 'string' ? c.preview : '',
        draft: typeof c.draft === 'string' ? c.draft : '',
        time: typeof c.time === 'string' ? c.time : '',
        unread: Number.isFinite(c.unread) ? c.unread : 0,
      }))
    : [];

  // Recover chat entries from durable conversation storage.
  // Older builds could keep line:conversation:* while line:chat-items lost its row.
  // Only conversations with real messages are restored; imported character cards
  // without a conversation remain out of Chat.
  useEffect(() => {
    const recoverStoredConversations = () => {
      try {
        const recovered = new Map<string, any>();
        for (let index = 0; index < window.localStorage.length; index += 1) {
          const key = window.localStorage.key(index);
          if (!key || !key.startsWith('line:conversation:')) continue;
          const conversationId = key.slice('line:conversation:'.length);
          if (!conversationId) continue;
          const raw = window.localStorage.getItem(key);
          if (!raw) continue;
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed) || parsed.length === 0) continue;
          const realMessages = parsed.filter((message: any) => message && typeof message === 'object' && message.type !== 'system-nudge');
          if (!realMessages.length) continue;
          const latest = realMessages[realMessages.length - 1];
          const existing = chatItemsRaw.find(item => item.id === conversationId || item.characterId === conversationId);
          const character = importedCharacters.find(item => item.id === existing?.characterId || item.id === conversationId);
          const name = existing?.name || character?.name || conversationId;
          const preview = String(
            latest?.text ||
            latest?.transcript ||
            (latest?.type === 'offline-invite' ? '💌 线下剧情邀约' : '') ||
            (latest?.type === 'real-media' ? '[媒体] ' + (latest?.fileName || '附件') : '') ||
            (latest?.type === 'ai-card' ? '[' + (latest?.title || '多媒体') + ']' : '') ||
            '新消息'
          ).replace(/\s+/g, ' ').slice(0, 80);
          recovered.set(conversationId, {
            id: conversationId,
            name,
            characterId: existing?.characterId || character?.id,
            variantLabel: existing?.variantLabel || '默认版本',
            relationship: existing?.relationship || 'new-friend',
            relationshipContext: existing?.relationshipContext || '',
            openingMode: existing?.openingMode || 'none',
            openingGreeting: existing?.openingGreeting || '',
            personaId: existing?.personaId || effectivePersonaId || undefined,
            time: latest?.time || '刚刚',
            preview,
            unread: existing?.unread || 0,
            isPinned: existing?.isPinned || false,
            isMuted: existing?.isMuted || false,
            draft: existing?.draft || '',
            isGroup: existing?.isGroup || false,
          });
        }
        if (!recovered.size) return;
        setChatItems(prev => {
          const next = [...prev];
          for (const [id, item] of recovered) {
            const existingIndex = next.findIndex(chat => chat.id === id || chat.characterId === id);
            if (existingIndex >= 0) {
              next[existingIndex] = { ...next[existingIndex], ...item, unread: next[existingIndex].unread };
            } else {
              next.unshift(item);
            }
          }
          return next;
        });
      } catch {
        // Recovery is best-effort; never block the LINE UI.
      }
    };

    recoverStoredConversations();
  }, [importedCharacters, effectivePersonaId]);
  
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

  // Imported character cards are candidates for adding, not automatically friends.
  // The Add Friend flow must be the only place that creates a friendship.
  useEffect(() => {
    // Migrate the old auto-friend behavior once: those rows were created with
    // online=false. Real Add Friend rows use online=true.
    if (importedCharacters.length) {
      setFriendsList(prev => {
        if (!Array.isArray(prev)) return [];
        const importedIds = new Set(importedCharacters.map(character => character.id));