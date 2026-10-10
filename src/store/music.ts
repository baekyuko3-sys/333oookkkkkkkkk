export interface MusicTrack {
  id: string;
  name: string;
  artist: string;
  album: string;
  duration: number;
  cover: string;
  playUrl: string;
  source: 'netease' | 'custom';
  raw?: unknown;
}

export interface MusicApiSettings {
  enabled: boolean;
  provider: 'netease' | 'custom';
  baseUrl: string;
  searchPath: string;
  songPath: string;
  playlistPath: string;
  urlPath: string;
  searchParam: 'keyword' | 'keywords';
}

export interface CharacterPlaylist {
  characterId: string;
  characterName: string;
  variantLabel?: string;
  name: string;
  description: string;
  tracks: MusicTrack[];
  updatedAt: string;
}

export interface MusicStrangerSession {
  id: string;
  mode: 'direct' | 'stranger';
  characterId: string;
  characterName: string;
  variantLabel?: string;
  track: MusicTrack;
  status: 'listening' | 'paused' | 'ended';
  reactionLog: Array<{ trackId: string; text: string; createdAt: string }>;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_MUSIC_API_SETTINGS: MusicApiSettings = {
  enabled: true,
  provider: 'netease',
  baseUrl: 'https://netease-cloud-music-api-backup-wheat-nu.vercel.app',
  searchPath: '/cloudsearch',
  songPath: '/song/detail',
  playlistPath: '/playlist/detail',
  urlPath: '/song/url',
  searchParam: 'keywords',
};

const MUSIC_SETTINGS_KEY = 'phone:music-api-settings';
const MUSIC_CURRENT_KEY = 'phone:music-current';
const MUSIC_CHARACTER_PLAYLISTS_KEY = 'phone:music-character-playlists';
const MUSIC_STRANGER_KEY = 'phone:music-stranger-session';

function mergeSettings(raw: unknown): MusicApiSettings {
  const saved = raw && typeof raw === 'object' ? raw as Partial<MusicApiSettings> : {};
  const merged = { ...DEFAULT_MUSIC_API_SETTINGS, ...saved };
  // Migrate the old placeholder proxy URL to the user's actual NetEase API host.
  if (!saved.baseUrl || saved.baseUrl === '/api/music/v1') {
    merged.baseUrl = DEFAULT_MUSIC_API_SETTINGS.baseUrl;
  }
  // Migrate the previous UI-only defaults to the NetEase API's actual endpoint names.
  if (saved.searchPath === '/search') merged.searchPath = '/cloudsearch';
  if (saved.songPath === '/song') merged.songPath = '/song/detail';
  if (saved.playlistPath === '/playlist') merged.playlistPath = '/playlist/detail';
  if (saved.urlPath === '/url') merged.urlPath = '/song/url';
  if (saved.searchParam === 'keyword') merged.searchParam = 'keywords';
  return merged;
}

export function readMusicApiSettings(): MusicApiSettings {
  if (typeof window === 'undefined') return DEFAULT_MUSIC_API_SETTINGS;
  try {
    return mergeSettings(JSON.parse(window.localStorage.getItem(MUSIC_SETTINGS_KEY) || '{}'));
  } catch {
    return DEFAULT_MUSIC_API_SETTINGS;
  }
}

export function saveMusicApiSettings(patch: Partial<MusicApiSettings>): MusicApiSettings {
  const next = { ...readMusicApiSettings(), ...patch };
  if (typeof window !== 'undefined') window.localStorage.setItem(MUSIC_SETTINGS_KEY, JSON.stringify(next));
  return next;
}

export function readMusicCurrent(): MusicTrack | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MUSIC_CURRENT_KEY) || 'null');
    return parsed && typeof parsed === 'object' ? parsed as MusicTrack : null;
  } catch {
    return null;
  }
}

export function saveMusicCurrent(track: MusicTrack | null): void {
  if (typeof window === 'undefined') return;
  if (track) window.localStorage.setItem(MUSIC_CURRENT_KEY, JSON.stringify(track));
  else window.localStorage.removeItem(MUSIC_CURRENT_KEY);
  window.dispatchEvent(new CustomEvent('sane333:music-changed'));
}

export function getCharacterPlaylists(): CharacterPlaylist[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MUSIC_CHARACTER_PLAYLISTS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCharacterPlaylist(playlist: CharacterPlaylist): void {
  if (typeof window === 'undefined') return;
  const current = getCharacterPlaylists();
  const next = current.some(item => item.characterId === playlist.characterId && item.name === playlist.name)
    ? current.map(item => item.characterId === playlist.characterId && item.name === playlist.name ? playlist : item)
    : [playlist, ...current];
  window.localStorage.setItem(MUSIC_CHARACTER_PLAYLISTS_KEY, JSON.stringify(next));
}

export function addTrackToCharacterPlaylist(character: { id: string; name: string; variantLabel?: string }, track: MusicTrack, playlistName = '喜欢的歌'): void {
  const current = getCharacterPlaylists();
  const existing = current.find(item => item.characterId === character.id && item.name === playlistName);
  const playlist: CharacterPlaylist = existing
    ? { ...existing, tracks: existing.tracks.some(item => item.id === track.id) ? existing.tracks : [track, ...existing.tracks], updatedAt: new Date().toISOString() }
    : {
        characterId: character.id,
        characterName: character.name,
        variantLabel: character.variantLabel,
        name: playlistName,
        description: '角色在一起听歌中收藏的歌曲。',
        tracks: [track],
        updatedAt: new Date().toISOString(),
      };
  saveCharacterPlaylist(playlist);
}

export function readStrangerSession(): MusicStrangerSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MUSIC_STRANGER_KEY) || 'null');
    return parsed && typeof parsed === 'object' ? parsed as MusicStrangerSession : null;
  } catch {
    return null;
  }
}

export function saveStrangerSession(session: MusicStrangerSession | null): void {
  if (typeof window === 'undefined') return;
  if (session) window.localStorage.setItem(MUSIC_STRANGER_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(MUSIC_STRANGER_KEY);
  window.dispatchEvent(new CustomEvent('sane333:music-stranger-changed'));
}

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const next = path.startsWith('/') ? path : '/' + path;
  return base + next;
}

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('MUSIC_API_' + response.status);
  return response.json();
}

function extractItems(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.result?.songs)) return payload.result.songs;
  if (Array.isArray(payload?.songs)) return payload.songs;
  if (Array.isArray(payload?.playlist?.tracks)) return payload.playlist.tracks;
  if (Array.isArray(payload?.data?.songs)) return payload.data.songs;
  if (Array.isArray(payload?.data?.playlist?.tracks)) return payload.data.playlist.tracks;
  return [];
}

function normalizeTrack(raw: any, settings: MusicApiSettings): MusicTrack {
  const id = String(raw?.id ?? raw?.songId ?? '');
  const arList = Array.isArray(raw?.ar) ? raw.ar : Array.isArray(raw?.artists) ? raw.artists : [];
  const ar = arList.map((a: any) => a?.name).filter(Boolean).join('/');
  const al = raw?.al?.name || raw?.album?.name || raw?.album || '';
  const cover = raw?.pic || raw?.picUrl || raw?.al?.picUrl || raw?.album?.picUrl || '';
  const durationMs = Number(raw?.dt ?? raw?.duration ?? 0);
  const url = raw?.url || raw?.playUrl || raw?.audio || '';
  return {
    id,
    name: String(raw?.name || raw?.title || '未知歌曲'),
    artist: String(raw?.artist || raw?.singer || ar || '未知歌手'),
    album: String(al || '未知专辑'),
    duration: durationMs > 10000 ? durationMs / 1000 : durationMs,
    cover: String(cover),
    playUrl: String(url),
    source: settings.provider === 'netease' ? 'netease' : 'custom',
    raw,
  };
}

export async function searchMusic(keyword: string, settings = readMusicApiSettings()): Promise<MusicTrack[]> {
  if (!settings.baseUrl.trim()) throw new Error('请先填写网易云 Music API Base URL');
  const url = new URL(joinUrl(settings.baseUrl, settings.searchPath), window.location.origin);
  url.searchParams.set(settings.searchParam, keyword);
  url.searchParams.set('limit', '30');
  const payload = await fetchJson(url.toString());
  return extractItems(payload).map(item => normalizeTrack(item, settings)).filter(track => track.id);
}

export async function resolveTrackUrl(track: MusicTrack, settings = readMusicApiSettings()): Promise<MusicTrack> {
  if (track.playUrl) return track;
  const url = new URL(joinUrl(settings.baseUrl, settings.urlPath), window.location.origin);
  url.searchParams.set('id', track.id);
  const payload = await fetchJson(url.toString());
  const data = payload?.data?.[0]?.url || payload?.data?.url || payload?.data?.items?.[0]?.url || payload?.result?.data?.[0]?.url || payload?.url || payload?.data?.[0]?.playUrl || payload?.data?.items?.[0]?.playUrl;
  return { ...track, playUrl: String(data || '') };
}

export async function getMusicPlaylist(playlistId: string, settings = readMusicApiSettings()): Promise<MusicTrack[]> {
  const url = new URL(joinUrl(settings.baseUrl, settings.playlistPath), window.location.origin);
  url.searchParams.set('id', playlistId);
  const payload = await fetchJson(url.toString());
  return extractItems(payload).map(item => normalizeTrack(item, settings)).filter(track => track.id);
}
