import type { ThemeMode, WidgetConfig } from '../types';

export interface AppearanceScheme {
  id: string;
  name: string;
  themeMode: ThemeMode;
  appTitle: string;
  greeting: string;
  subtitle: string;
  wallpaper: string;
  widget: WidgetConfig;
  updatedAt: string;
}

const KEY = 'sane333:appearance';
const SCHEMES_KEY = 'sane333:appearance-schemes';

export const DEFAULT_APPEARANCE: AppearanceScheme = {
  id: 'default',
  name: 'Sane333 Default',
  themeMode: 'nordic-light',
  appTitle: 'Sane333',
  greeting: 'GOOD EVENING · PRIVATE DEVICE',
  subtitle: '这是你的私人设备。\n内容由你自己建立。',
  wallpaper: '',
  widget: {
    weatherCity: 'YOUR CITY',
    weatherTemp: '21°',
    weatherCondition: 'CLEAR',
    weatherHighLow: 'H 24° · L 16°',
    quoteContent: 'Make it yours.',
    quoteAuthor: 'Sane333',
    musicTitle: '暂无正在播放',
    musicArtist: 'MUSIC APP',
    anniversaryDays: 0,
    anniversaryText: 'PRIVATE MEMORY',
  },
  updatedAt: new Date(0).toISOString(),
};

function safeParse<T>(raw: string | null, fallback: T): T {
  try {
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function normalizeAppearance(value: Partial<AppearanceScheme>): AppearanceScheme {
  const widget = { ...DEFAULT_APPEARANCE.widget, ...(value.widget || {}) };
  return {
    ...DEFAULT_APPEARANCE,
    ...value,
    widget,
    id: String(value.id || DEFAULT_APPEARANCE.id),
    name: String(value.name || DEFAULT_APPEARANCE.name),
    appTitle: String(value.appTitle ?? DEFAULT_APPEARANCE.appTitle),
    greeting: String(value.greeting ?? DEFAULT_APPEARANCE.greeting),
    subtitle: String(value.subtitle ?? DEFAULT_APPEARANCE.subtitle),
    wallpaper: String(value.wallpaper ?? ''),
    updatedAt: String(value.updatedAt || new Date().toISOString()),
  };
}

export function readAppearance(): AppearanceScheme {
  if (typeof window === 'undefined') return DEFAULT_APPEARANCE;
  const parsed = safeParse<Partial<AppearanceScheme>>(window.localStorage.getItem(KEY), {});
  return normalizeAppearance(parsed);
}

export function saveAppearance(value: Partial<AppearanceScheme>): AppearanceScheme {
  const next = normalizeAppearance({ ...readAppearance(), ...value, updatedAt: new Date().toISOString() });
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('sane333:appearance-changed'));
  }
  return next;
}

export function getAppearanceSchemes(): AppearanceScheme[] {
  if (typeof window === 'undefined') return [DEFAULT_APPEARANCE];
  const parsed = safeParse<unknown>(window.localStorage.getItem(SCHEMES_KEY), []);
  if (!Array.isArray(parsed) || !parsed.length) return [DEFAULT_APPEARANCE];
  return parsed.map(item => normalizeAppearance(item as Partial<AppearanceScheme>));
}

export function saveAppearanceScheme(name: string): AppearanceScheme {
  const current = readAppearance();
  const scheme = {
    ...current,
    id: 'scheme-' + Date.now().toString(36),
    name: name.trim() || '未命名方案',
    updatedAt: new Date().toISOString(),
  };
  const next = [...getAppearanceSchemes().filter(item => item.id !== scheme.id), scheme];
  if (typeof window !== 'undefined') window.localStorage.setItem(SCHEMES_KEY, JSON.stringify(next));
  return scheme;
}

export function applyAppearanceScheme(id: string): AppearanceScheme {
  const scheme = getAppearanceSchemes().find(item => item.id === id);
  if (!scheme) return readAppearance();
  return saveAppearance(scheme);
}

export function deleteAppearanceScheme(id: string) {
  if (id === DEFAULT_APPEARANCE.id || typeof window === 'undefined') return;
  const next = getAppearanceSchemes().filter(item => item.id !== id);
  window.localStorage.setItem(SCHEMES_KEY, JSON.stringify(next));
}
