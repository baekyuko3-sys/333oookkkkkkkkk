import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Play, Pause, SkipBack, SkipForward, Heart, Search, Settings2,
  UsersRound, Shuffle, Music2, UserRound, ChevronRight, Volume2, X,
} from 'lucide-react';
import { ScreenType } from '../../types';
import type { ImportedCharacter } from '../../data/characterImport';
import { usePersistentState } from '../../store/usePersistentState';
import { generateCreativeText, readStoredAiSettings } from '../../ai/aiEngine';
import {
  addTrackToCharacterPlaylist,
  getCharacterPlaylists,
  readMusicApiSettings,
  readMusicCurrent,
  readStrangerSession,
  resolveTrackUrl,
  saveMusicApiSettings,
  saveMusicCurrent,
  saveStrangerSession,
  searchMusic,
  type CharacterPlaylist,
  type MusicStrangerSession,
  type MusicTrack,
} from '../../store/music';

interface MusicScreenViewProps {
  themeMode?: any;
  onNavigate: (screen: ScreenType) => void;
}

type MusicTab = 'player' | 'search' | 'characters';

export function MusicScreenView({ onNavigate }: MusicScreenViewProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [characters] = usePersistentState<ImportedCharacter[]>('phone:characters', []);
  const [liked, setLiked] = usePersistentState('phone:music-liked', false);
  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(() => readMusicCurrent());
  const [isPlaying, setIsPlaying] = useState(false);
  const [tab, setTab] = useState<MusicTab>('player');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MusicTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [toast, setToast] = useState('');
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [apiBaseUrl, setApiBaseUrl] = useState(() => readMusicApiSettings().baseUrl);
  const [apiTesting, setApiTesting] = useState(false);
  const [apiTestStatus, setApiTestStatus] = useState('');
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(() => characters[0]?.id || null);
  const [characterPlaylists, setCharacterPlaylists] = useState<CharacterPlaylist[]>(() => getCharacterPlaylists());
  const [strangerSession, setStrangerSession] = useState<MusicStrangerSession | null>(() => readStrangerSession());
  const [strangerLoading, setStrangerLoading] = useState(false);
  const [strangerReaction, setStrangerReaction] = useState('');
  const [showInviteCharacter, setShowInviteCharacter] = useState(false);

  const selectedCharacter = useMemo(
    () => characters.find(character => character.id === selectedCharacterId) || null,
    [characters, selectedCharacterId],
  );

  const selectedCharacterPlaylists = useMemo(
    () => characterPlaylists.filter(playlist => playlist.characterId === selectedCharacterId),
    [characterPlaylists, selectedCharacterId],
  );

  useEffect(() => {
    const onMusicChanged = () => setCurrentTrack(readMusicCurrent());
    const onStrangerChanged = () => setStrangerSession(readStrangerSession());
    window.addEventListener('sane333:music-changed', onMusicChanged);
    window.addEventListener('sane333:music-stranger-changed', onStrangerChanged);
    return () => {
      window.removeEventListener('sane333:music-changed', onMusicChanged);
      window.removeEventListener('sane333:music-stranger-changed', onStrangerChanged);
    };
  }, []);

  useEffect(() => {
    if (!audioRef.current || !currentTrack?.playUrl) return;
    audioRef.current.src = currentTrack.playUrl;
    audioRef.current.load();
    if (isPlaying) void audioRef.current.play().catch(() => setIsPlaying(false));
  }, [currentTrack]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 1800);
  };

  const playTrack = async (track: MusicTrack, autoplay = true) => {
    try {
      const resolved = await resolveTrackUrl(track);
      if (!resolved.playUrl) {
        throw new Error('接口没有返回可播放地址。这首歌可能暂不可用，请换一首测试。');
      }

      setCurrentTrack(resolved);
      saveMusicCurrent(resolved);
      setLiked(false);

      // Start playback directly after resolving the URL. Relying only on the
      // currentTrack effect can miss autoplay because isPlaying may still be false
      // in that effect's render closure.
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.src = resolved.playUrl;
        audio.load();
        if (autoplay) {
          try {
            await audio.play();
            setIsPlaying(true);
          } catch {
            setIsPlaying(false);
            throw new Error('已取得歌曲地址，但浏览器播放失败。请换一首歌测试；若都无法播放，需要检查接口返回的音源地址。');
          }
        } else {
          setIsPlaying(false);
        }
      } else if (autoplay) {
        setIsPlaying(true);
      }

      if (strangerSession && strangerSession.status !== 'ended') {
        setStrangerSession(prev => prev ? { ...prev, track: resolved, updatedAt: new Date().toISOString() } : prev);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '歌曲播放失败');
    }
  };

  const search = async () => {
    if (!query.trim() || searching) return;
    setSearching(true);
    try {
      const tracks = await searchMusic(query.trim());
      setResults(tracks);
      if (!tracks.length) showToast('没有找到相关歌曲');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '音乐搜索失败');
    } finally {
      setSearching(false);
    }
  };

  const testAndSaveMusicApi = async () => {
    const baseUrl = apiBaseUrl.trim();
    if (!baseUrl) {
      setApiTestStatus('请先填写 API 地址。');
      return;
    }
    if (apiTesting) return;
    setApiTesting(true);
    setApiTestStatus('正在测试网易云搜索接口……');
    const settings = { ...readMusicApiSettings(), baseUrl };
    try {
      const tracks = await searchMusic('周杰伦', settings);
      if (!tracks.length) {
        setApiTestStatus('接口有响应，但没有解析到歌曲列表。请确认地址是 API 根地址，并检查接口格式。');
      } else {
        saveMusicApiSettings({ baseUrl });
        setApiTestStatus('连接成功！已找到 ' + tracks.length + ' 首测试歌曲，API 地址已保存。');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setApiTestStatus(
        /failed to fetch|networkerror|load failed/i.test(message)
          ? '连接失败：浏览器无法访问此接口。请检查地址、HTTPS 和跨域 CORS 设置。'
          : '连接失败：' + message
      );
    } finally {
      setApiTesting(false);
    }
  };


  const publishMusicInviteToLine = (session: MusicStrangerSession) => {
    if (typeof window === 'undefined') return;
    const chatKey = 'line:conversation:' + session.id;
    const existingRaw = window.localStorage.getItem(chatKey);
    if (!existingRaw) {
      window.localStorage.setItem(chatKey, JSON.stringify([{
        id: Date.now(),
        sender: 'me',
        senderName: '我',
        text: '邀请一起听歌：《' + session.track.name + '》',
        time: '刚刚',
        type: 'music-together',
        musicSession: session,
      }]));
    }
    window.dispatchEvent(new CustomEvent('sane333:music-invite-created', { detail: { session } }));
  };

  const startDirectListening = async (character: ImportedCharacter) => {
    if (!currentTrack) {
      showToast('先播放一首歌，再邀请角色');
      setTab('search');
      return;
    }
    const session: MusicStrangerSession = {
      mode: 'direct',
      id: 'music-direct-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      characterId: character.id,
      characterName: character.name,
      variantLabel: character.variantLabel || character.characterVersion || '默认版本',
      track: currentTrack,
      status: 'listening',
      reactionLog: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setStrangerSession(session);
    saveStrangerSession(session);
    publishMusicInviteToLine(session);
    setShowInviteCharacter(false);
    setStrangerLoading(true);
    setStrangerReaction('');
    const reaction = await askStrangerReaction(session, currentTrack);
    const next = reaction
      ? { ...session, reactionLog: [{ trackId: currentTrack.id, text: reaction, createdAt: new Date().toISOString() }], updatedAt: new Date().toISOString() }
      : session;
    setStrangerSession(next);
    saveStrangerSession(next);
    setStrangerReaction(reaction);
    setSelectedCharacterId(character.id);
    setStrangerLoading(false);
    showToast('已邀请 ' + character.name + ' 一起听歌');
  };

  const askStrangerReaction = async (session: MusicStrangerSession, track: MusicTrack) => {
    const character = characters.find(item => item.id === session.characterId);
    if (!character) return '';
    const isStranger = session.mode === 'stranger';
    try {
      const settings = readStoredAiSettings(character.id, character.name);
      return await generateCreativeText({
        settings,
        systemPrompt: [
          isStranger ? '你正在参加一个“音乐陌生人”体验。' : '你正在和一个熟悉的角色关系对象一起听歌。',
          isStranger ? '你是一个刚刚随机遇见用户的陌生人，不认识用户，不知道用户与其他角色的关系。' : '可以依据你自己的角色设定自然回应，但不要虚构不存在的共同听歌经历。',
          isStranger ? '不要读取、假设或引用既有聊天关系、长期记忆、恋爱关系。' : '当前只是一起听歌，不要强行把聊天写成剧情。',
          '只依据你的角色卡、当前歌曲和这场第一次偶遇来回应。',
          '回复要像真实的人在音乐社交房里说话，短一些，自然，有一点人格。',
          '不要解释自己是 AI。',
          '',
          '【角色卡】',
          character.description,
          character.personality,
          character.scenario,
        ].join('\n'),
        userPrompt: [
          isStranger ? '你刚刚和一个陌生用户随机进入同一间听歌房。' : '你刚刚收到对方发来的这首歌，正在和对方一起听。',
          '当前歌曲：《' + track.name + '》 - ' + track.artist,
          '请说一句你对这首歌的第一反应。可以喜欢、无感、吐槽，也可以问用户为什么选这首。',
        ].join('\n'),
        temperature: settings.temperature,
      });
    } catch {
      return '';
    }
  };

  const startStrangerListening = async () => {
    if (!currentTrack) {
      showToast('先播放一首歌，再随机寻找音乐陌生人');
      setTab('search');
      return;
    }
    if (!characters.length) {
      showToast('先导入至少一个角色卡，才能随机遇见音乐陌生人');
      return;
    }
    const character = characters[Math.floor(Math.random() * characters.length)];
    const session: MusicStrangerSession = {
      mode: 'stranger',
      id: 'music-stranger-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      characterId: character.id,
      characterName: character.name,
      variantLabel: character.variantLabel || character.characterVersion || '默认版本',
      track: currentTrack,
      status: 'listening',
      reactionLog: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setStrangerSession(session);
    saveStrangerSession(session);
    publishMusicInviteToLine(session);
    setStrangerLoading(true);
    setStrangerReaction('');
    const reaction = await askStrangerReaction(session, currentTrack);
    const next = reaction
      ? { ...session, reactionLog: [{ trackId: currentTrack.id, text: reaction, createdAt: new Date().toISOString() }], updatedAt: new Date().toISOString() }
      : session;
    setStrangerSession(next);
    saveStrangerSession(next);
    setStrangerReaction(reaction);
    setSelectedCharacterId(character.id);
    setStrangerLoading(false);
    showToast('你随机遇见了 ' + character.name + ' · ' + (character.variantLabel || character.characterVersion || '默认版本'));
  };

  const reactToCurrentSong = async () => {
    if (!strangerSession || !currentTrack || strangerLoading) return;
    setStrangerLoading(true);
    const reaction = await askStrangerReaction(strangerSession, currentTrack);
    const now = new Date().toISOString();
    const next = reaction
      ? { ...strangerSession, track: currentTrack, reactionLog: [...strangerSession.reactionLog, { trackId: currentTrack.id, text: reaction, createdAt: now }].slice(-30), updatedAt: now }
      : strangerSession;
    setStrangerSession(next);
    saveStrangerSession(next);
    setStrangerReaction(reaction);
    setStrangerLoading(false);
  };

  const letStrangerChoose = async () => {
    if (!strangerSession || strangerLoading) return;
    const character = characters.find(item => item.id === strangerSession.characterId);
    if (!character) return;
    setStrangerLoading(true);
    try {
      const settings = readStoredAiSettings(character.id, character.name);
      const suggestion = await generateCreativeText({
        settings,
        systemPrompt: '你是一个刚认识用户的音乐陌生人。不要引用既有聊天关系。根据角色性格和当前歌曲，提出下一首你想听的歌。只输出“歌名 - 歌手”，不要解释。',
        userPrompt: '当前播放：《' + (currentTrack?.name || '') + '》 - ' + (currentTrack?.artist || '') + '\n请选一首你真的想和这个陌生人继续听的歌。',
        temperature: settings.temperature,
      });
      const clean = suggestion.replace(/^[“"'「]?[\s]*/, '').replace(/[”"'」][\s]*$/, '').trim();
      const tracks = await searchMusic(clean);
      const nextTrack = tracks[0];
      if (!nextTrack) throw new Error('没有搜到 TA 选的歌');
      await playTrack(nextTrack, true);
      addTrackToCharacterPlaylist(character, nextTrack, '喜欢的歌');
      setCharacterPlaylists(getCharacterPlaylists());
      await reactToSongAfterSwitch(strangerSession, nextTrack);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'TA 切歌失败');
      setStrangerLoading(false);
    }
  };

  const reactToSongAfterSwitch = async (session: MusicStrangerSession, track: MusicTrack) => {
    const reaction = await askStrangerReaction({ ...session, track }, track);
    const next = reaction
      ? { ...session, track, reactionLog: [...session.reactionLog, { trackId: track.id, text: reaction, createdAt: new Date().toISOString() }].slice(-30), updatedAt: new Date().toISOString() }
      : { ...session, track };
    setStrangerSession(next);
    saveStrangerSession(next);
    setStrangerReaction(reaction);
    setStrangerLoading(false);
  };

  const saveCurrentToCharacter = () => {
    if (!currentTrack || !selectedCharacter) {
      showToast('请选择一个角色');
      return;
    }
    addTrackToCharacterPlaylist(selectedCharacter, currentTrack, '喜欢的歌');
    setCharacterPlaylists(getCharacterPlaylists());
    showToast('已加入 ' + selectedCharacter.name + ' 的「喜欢的歌」');
  };

  const onLoadedMetadata = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.duration && Number.isFinite(audio.duration)) {
      // React state is intentionally minimal; the browser owns exact progress.
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col p-5 select-none overflow-hidden" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
      <div className="absolute inset-0 opacity-15 bg-paper-noise pointer-events-none" />

      <header className="relative z-10 pt-7 pb-3 flex items-center justify-between border-b border-black/5">
        <button onClick={() => onNavigate('home')} className="w-8 h-8 rounded-full bg-white/50 border border-white/70 grid place-items-center text-[#242323]">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="text-center">
          <div className="text-[8px] font-mono tracking-[2px] text-[#8b8782]">MUSIC / SANE333</div>
          <div className="text-[15px] font-serif font-bold text-[#242323]">音乐</div>
        </div>
        <button onClick={() => setShowApiSettings(true)} className="w-8 h-8 rounded-full bg-white/50 border border-white/70 grid place-items-center text-[#777]">
          <Settings2 className="w-4 h-4" />
        </button>
      </header>

      <div className="relative z-10 flex gap-1.5 py-2.5 overflow-x-auto no-scrollbar">
        {([
          ['player', '正在播放'],
          ['search', '找歌'],
          ['characters', '角色歌单'],
        ] as Array<[MusicTab, string]>).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={'shrink-0 px-3 py-1.5 rounded-full text-[9px] border ' + (tab === key ? 'bg-[#292724] text-white border-[#292724]' : 'bg-white/55 border-black/5 text-[#6f6963]')}>
            {label}
          </button>
        ))}
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto no-scrollbar">
        {tab === 'player' && (
          <div className="space-y-3">
            <div className="p-3 rounded-2xl bg-white/55 border border-black/5">
              <div className="flex items-center gap-3">
                <div className="w-[86px] h-[86px] rounded-xl overflow-hidden bg-[#ded7cc] border border-black/5 shrink-0 grid place-items-center">
                  {currentTrack?.cover ? <img src={currentTrack.cover} alt={currentTrack.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <DiscIcon />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[8px] font-mono text-[#9b9086] tracking-[1.4px]">NOW PLAYING</div>
                  <div className="mt-1 font-serif font-bold text-[15px] text-[#292724] truncate">{currentTrack?.name || '还没有选择歌曲'}</div>
                  <div className="text-[10px] text-[#8b7560] mt-0.5 truncate">{currentTrack?.artist || '去找一首你想听的歌'}</div>
                  {currentTrack?.album && <div className="text-[8px] text-[#aaa] mt-1 truncate">{currentTrack.album}</div>}
                </div>
              </div>

              <audio
                ref={audioRef}
                preload="metadata"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                onLoadedMetadata={onLoadedMetadata}
                className="w-full mt-3 h-8"
                controls
              />

              <div className="mt-2 flex items-center justify-center gap-7">
                <button disabled={!currentTrack} className="text-[#8b8782] disabled:opacity-30"><SkipBack className="w-4 h-4" /></button>
                <button
                  disabled={!currentTrack}
                  onClick={() => {
                    const audio = audioRef.current;
                    if (!audio) return;
                    if (audio.paused) void audio.play(); else audio.pause();
                  }}
                  className="w-11 h-11 rounded-full bg-[#292724] text-white grid place-items-center disabled:opacity-30"
                >
                  {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                </button>
                <button onClick={() => setLiked(!liked)} disabled={!currentTrack} className={liked ? 'text-[#9b625b]' : 'text-[#8b8782]'}>
                  <Heart className={'w-4 h-4 ' + (liked ? 'fill-current' : '')} />
                </button>
              </div>
            </div>

            <button onClick={() => void startStrangerListening()} className="w-full p-3 rounded-2xl bg-[#efe9df] border border-[#dfd3c4] flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-full bg-[#292724] text-white grid place-items-center"><Shuffle className="w-4 h-4" /></div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-[#403a34]">随机遇见音乐陌生人</div>
                <div className="text-[8px] text-[#8d837a] mt-0.5">不读取既有关系 · 随机一个角色 · 从一首歌认识彼此</div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#9c9186]" />
            </button>


            <button onClick={() => setShowInviteCharacter(true)} className="w-full p-3 rounded-2xl bg-white/60 border border-black/5 flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-full bg-[#faf1f3] text-[#ae7e89] grid place-items-center"><Music2 className="w-4 h-4" /></div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-[#403a34]">邀请角色一起听</div>
                <div className="text-[8px] text-[#8d837a] mt-0.5">指定一个版本，不走陌生人模式</div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#aaa]" />
            </button>

            {strangerSession && (
              <section className="p-3 rounded-2xl bg-white/60 border border-[#eadfe2]">
                <div className="text-[8px] font-mono tracking-[1.5px] text-[#9a8c7f]">MUSIC STRANGER</div>
                <div className="mt-2 flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-full bg-[#f0eeea] grid place-items-center overflow-hidden">
                    {characters.find(c => c.id === strangerSession.characterId)?.avatar
                      ? <img src={characters.find(c => c.id === strangerSession.characterId)?.avatar} alt="" className="w-full h-full object-cover" />
                      : <UserRound className="w-4 h-4 text-[#999]" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold text-[#3d3935]">{strangerSession.characterName} <span className="text-[8px] font-normal text-[#a49b95]">· {strangerSession.variantLabel}</span></div>
                    <div className="text-[8px] text-[#9b9189]">{strangerSession.mode === 'stranger' ? '第一次遇见 · 只因为同一首歌' : '一起听歌 · 当前角色'}</div>
                  </div>
                  <UsersRound className="w-4 h-4 text-[#9b7e88]" />
                </div>
                <div className="mt-2.5 p-2.5 rounded-xl bg-[#faf4f6] border border-[#f0e2e6] text-[10px] text-[#5b5150] leading-relaxed min-h-[42px]">
                  {strangerLoading ? 'TA 正在听……' : strangerReaction || strangerSession.reactionLog[strangerSession.reactionLog.length - 1]?.text || '你们刚刚坐进同一间音乐房。'}
                </div>
                <div className="grid grid-cols-3 gap-1.5 mt-2">
                  <button onClick={() => void reactToCurrentSong()} className="py-2 rounded-lg bg-white border border-black/5 text-[8px]">听听 TA 怎么说</button>
                  <button onClick={() => void letStrangerChoose()} className="py-2 rounded-lg bg-white border border-black/5 text-[8px]">让 TA 切歌</button>
                  <button onClick={saveCurrentToCharacter} className="py-2 rounded-lg bg-white border border-black/5 text-[8px]">加进歌单</button>
                </div>
              </section>
            )}
          </div>
        )}

        {tab === 'search' && (
          <div className="space-y-2.5">
            <div className="flex gap-1.5">
              <div className="flex-1 flex items-center bg-white/65 border border-black/5 rounded-xl px-3">
                <Search className="w-4 h-4 text-[#aaa] mr-2" />
                <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void search(); }} placeholder="搜索网易云音乐…" className="w-full py-2.5 bg-transparent outline-none text-[10px]" />
              </div>
              <button onClick={() => void search()} className="px-3 rounded-xl bg-[#292724] text-white text-[9px]">{searching ? '…' : '搜索'}</button>
            </div>
            <div className="space-y-1">
              {results.map(track => (
                <button key={track.id} onClick={() => void playTrack(track)} className="w-full p-2.5 bg-white/55 border border-black/5 rounded-xl text-left flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg overflow-hidden bg-[#eee9df] shrink-0 grid place-items-center">
                    {track.cover ? <img src={track.cover} alt="" className="w-full h-full object-cover" /> : <Music2 className="w-4 h-4 text-[#999]" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold text-[#403a34] truncate">{track.name}</div>
                    <div className="text-[8px] text-[#8b7560] truncate">{track.artist}</div>
                  </div>
                  <Play className="w-3.5 h-3.5 text-[#8d7b6a]" />
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'characters' && (
          <div className="space-y-2.5">
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {characters.map(character => (
                <button key={character.id} onClick={() => setSelectedCharacterId(character.id)} className={'shrink-0 px-3 py-1.5 rounded-full border text-[9px] ' + (selectedCharacterId === character.id ? 'bg-[#292724] text-white border-[#292724]' : 'bg-white/55 border-black/5 text-[#6f6963]')}>
                  {character.name} · {character.variantLabel || character.characterVersion || '默认'}
                </button>
              ))}
            </div>
            {!characters.length && <div className="p-8 text-center text-[9px] text-[#aaa]">还没有角色歌单。先导入角色卡，再和 TA 一起听歌。</div>}
            {selectedCharacterPlaylists.map(playlist => (
              <section key={playlist.characterId + '-' + playlist.name} className="p-3 rounded-2xl bg-white/55 border border-black/5">
                <div className="flex items-center justify-between">
                  <div><div className="text-[11px] font-semibold text-[#3e3934]">{playlist.name}</div><div className="text-[8px] text-[#aaa] mt-0.5">{playlist.description}</div></div>
                  <span className="text-[8px] font-mono text-[#a0958d]">{playlist.tracks.length} 首</span>
                </div>
                <div className="mt-2 space-y-1">
                  {playlist.tracks.map(track => (
                    <button key={track.id} onClick={() => void playTrack(track)} className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white/60 text-left">
                      <div className="w-8 h-8 rounded-md bg-[#eee9df] overflow-hidden shrink-0">{track.cover && <img src={track.cover} alt="" className="w-full h-full object-cover" />}</div>
                      <div className="min-w-0 flex-1"><div className="text-[9px] font-medium truncate">{track.name}</div><div className="text-[8px] text-[#999] truncate">{track.artist}</div></div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>


      {showInviteCharacter && (
        <div onClick={() => setShowInviteCharacter(false)} className="absolute inset-0 z-50 bg-black/25 flex items-end">
          <div onClick={e => e.stopPropagation()} className="w-full bg-white rounded-t-[20px] p-4 pb-6 space-y-3">
            <div className="flex items-center justify-between"><div className="font-semibold text-sm">选择一起听的人</div><button onClick={() => setShowInviteCharacter(false)}><X className="w-4 h-4 text-[#999]" /></button></div>
            <div className="space-y-1.5 max-h-[45vh] overflow-y-auto">
              {characters.map(character => (
                <button key={character.id} onClick={() => void startDirectListening(character)} className="w-full flex items-center gap-2.5 p-2.5 rounded-xl bg-[#faf9f7] border border-black/5 text-left">
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-[#eee9df] grid place-items-center">
                    {character.avatar ? <img src={character.avatar} alt="" className="w-full h-full object-cover" /> : <UserRound className="w-4 h-4 text-[#aaa]" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold truncate">{character.name}</div>
                    <div className="text-[8px] text-[#999] truncate">{character.variantLabel || character.characterVersion || '默认版本'}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#aaa]" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showApiSettings && (
        <div onClick={() => setShowApiSettings(false)} className="absolute inset-0 z-50 bg-black/25 flex items-end">
          <div onClick={e => e.stopPropagation()} className="w-full bg-white rounded-t-[20px] p-4 pb-6 space-y-3">
            <div className="flex items-center justify-between"><div className="font-semibold text-sm">网易云 Music API</div><button onClick={() => setShowApiSettings(false)}><X className="w-4 h-4 text-[#999]" /></button></div>
            <div className="text-[8px] text-[#8b8782] leading-relaxed">填写网易云 API 的根地址（不是某个具体接口路径）。会使用 /cloudsearch 和 /song/url 等接口。GitHub Pages 不能直接运行后端代理；如果接口跨域被拦截，需要 API 服务端允许 CORS。</div>
            <input value={apiBaseUrl} onChange={e => { setApiBaseUrl(e.target.value); setApiTestStatus(''); }} placeholder="https://你的音乐API域名" className="w-full p-2.5 rounded-xl bg-[#f7f7f8] text-[10px] font-mono outline-none" />
            {apiTestStatus && <div className={'text-[9px] leading-relaxed rounded-xl p-2.5 ' + (apiTestStatus.startsWith('连接成功') ? 'bg-[#edf7ef] text-[#386b47]' : apiTestStatus.startsWith('正在') ? 'bg-[#f7f7f8] text-[#777]' : 'bg-[#fff2f0] text-[#a14f48]')}>{apiTestStatus}</div>}
            <button disabled={apiTesting} onClick={() => void testAndSaveMusicApi()} className="w-full py-2.5 rounded-xl bg-[#292724] text-white text-xs disabled:opacity-50">{apiTesting ? '正在测试…' : '测试连接并保存'}</button>
            <button onClick={() => { saveMusicApiSettings({ baseUrl: apiBaseUrl.trim() }); setShowApiSettings(false); showToast('音乐 API 地址已保存'); }} className="w-full py-2.5 rounded-xl bg-white border border-black/10 text-[#514b45] text-xs">仅保存地址</button>
          </div>
        </div>
      )}

      <audio className="hidden" />
      {toast && <div className="absolute left-1/2 -translate-x-1/2 bottom-5 z-60 px-3 py-2 rounded-full bg-[#292724] text-white text-[9px] shadow-lg">{toast}</div>}
    </div>
  );
}

function DiscIcon() {
  return <div className="w-12 h-12 rounded-full border-2 border-[#8b7560] grid place-items-center text-[#8b7560]"><Volume2 className="w-4 h-4" /></div>;
}
