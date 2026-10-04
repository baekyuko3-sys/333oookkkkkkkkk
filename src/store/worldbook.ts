import { readPersistentState, writePersistentState } from './usePersistentState';

export interface WorldBookEntry {
  id: string;
  name: string;
  keys: string[];
  content: string;
  priority: number;
  weight: number;
  insertion: 'before' | 'after' | 'depth';
  depth?: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorldBook {
  id: string;
  name: string;
  description: string;
  entries: WorldBookEntry[];
  createdAt: string;
  updatedAt: string;
}

const KEY = 'phone:worldbooks';

export function getWorldBooks(): WorldBook[] {
  return readPersistentState<WorldBook[]>(KEY, []);
}

export function saveWorldBooks(worldBooks: WorldBook[]): void {
  writePersistentState(KEY, worldBooks);
}

export function upsertWorldBook(book: WorldBook): void {
  const all = getWorldBooks();
  const next = all.some(item => item.id === book.id)
    ? all.map(item => item.id === book.id ? book : item)
    : [book, ...all];
  saveWorldBooks(next);
}

export function deleteWorldBook(id: string): void {
  saveWorldBooks(getWorldBooks().filter(item => item.id !== id));
}

export function createWorldBook(name = '未命名世界书'): WorldBook {
  const now = new Date().toISOString();
  return {
    id: `world-${Date.now()}`,
    name,
    description: '',
    entries: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createWorldBookEntry(): WorldBookEntry {
  const now = new Date().toISOString();
  return {
    id: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    keys: [],
    content: '',
    priority: 100,
    weight: 1,
    insertion: 'depth',
    depth: 4,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}
