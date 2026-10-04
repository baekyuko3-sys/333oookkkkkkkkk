export type ThemeMode = 'dark-luxury' | 'nordic-light' | 'ocean-breeze';

export type ScreenType = 
  | 'lock'
  | 'home'
  | 'inbox'
  | 'chat'
  | 'character-profile'
  | 'moments'
  | 'gallery'
  | 'music'
  | 'notes'
  | 'calendar'
  | 'npc'
  | 'group-presets'
  | 'world-book'
  | 'threads'
  | 'spy-phone'
  | 'settings'
  | 'offline-story'
  | 'project-studio'
  | 'memory'
  | 'appearance';

export interface CharacterGroup {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterInfo {
  id: string;
  name: string;
  avatar: string;
  heroImage: string;
  status: string;
  age: number;
  height: string;
  constellation: string;
  location: string;
  bio: string;
  quote: string;
  recentMoments: string[];
  unreadCount?: number;
}

export interface CharacterProfile {
  nickname: string;
  birthday: string;
  relationship: string;
  canAutoChangeRelation: boolean;
  canBlockUser?: boolean;
  isBlockedByCharacter?: boolean;
  callMe: string;
  selectedLorebook: string;
  bio?: string;
}

export interface WorldBookEntry {
  id: string;
  name: string;
  keywords: string[];
  content: string;
  enabled: boolean;
  priority: number;
  weight: number;
  insertion: 'before' | 'after' | 'depth';
  depth: number;
  secondaryKeywords?: string[];
  selective?: boolean;
  selectiveLogic?: 0 | 1 | 2 | 3;
  constant?: boolean;
  useProbability?: boolean;
  probability?: number;
  scanDepth?: number;
  caseSensitive?: boolean;
  matchWholeWords?: boolean;
  order?: number;
  role?: 'system' | 'user' | 'assistant';
  outletName?: string;
  group?: string;
  groupWeight?: number;
  preventRecursion?: boolean;
  excludeRecursion?: boolean;
}

export interface WorldBook {
  id: string;
  name: string;
  description: string;
  category?: string;
  tags?: string[];
  entries: WorldBookEntry[];
  enabled: boolean;
  updatedAt: string;
}

export interface OfflineEvent {
  id: string;
  characterId: string;
  characterName: string;
  title: string;
  location: string;
  time: string;
  theme: string;
  letter: string;
  status: 'draft' | 'pending' | 'accepted' | 'declined' | 'in-progress' | 'completed';
  createdAt: string;
  updatedAt?: string;
  sceneIntro?: string;
  sceneLog?: Array<{ id: string; speaker: 'role' | 'me' | 'narrator'; text: string; createdAt: string }>;
}

export interface WidgetConfig {
  weatherCity: string;
  weatherTemp: string;
  weatherCondition: string;
  weatherHighLow: string;
  quoteContent: string;
  quoteAuthor: string;
  musicTitle: string;
  musicArtist: string;
  anniversaryDays: number;
  anniversaryText: string;
}


export interface ProjectManifest {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  genre: string;
  language: string;
  tone: string;
  globalPrompt: string;
  activeCharacterId: string | null;
  activeWorldBookId: string | null;
  createdAt: string;
  updatedAt: string;
}
