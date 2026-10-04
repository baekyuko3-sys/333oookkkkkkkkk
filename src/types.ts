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
  | 'world-book'
  | 'threads'
  | 'spy-phone'
  | 'settings';

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
