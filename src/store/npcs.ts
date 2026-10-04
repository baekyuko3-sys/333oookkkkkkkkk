import { readPersistentState } from './usePersistentState';

export interface SaneNpc {
  id: string;
  name: string;
  gender?: string;
  age?: string;
  identity: string;
  appearance?: string;
  personality: string;
  background: string;
  relationship: string;
  settingSource: 'project' | 'worldbook' | 'character' | 'manual';
  sourceCharacterId?: string | null;
  sourceCharacterName?: string | null;
  tags: string[];
  avatar?: string;
  createdAt: string;
  updatedAt: string;
  memory?: string;
  active: boolean;
  canCommentMoments: boolean;
}

const KEY = 'phone:npcs';

export function getNpcs(): SaneNpc[] {
  return readPersistentState<SaneNpc[]>(KEY, []);
}

export function upsertNpc(npc: SaneNpc): void {
  if (typeof window === 'undefined') return;
  const all = getNpcs();
  const next = all.some(item => item.id === npc.id)
    ? all.map(item => item.id === npc.id ? npc : item)
    : [npc, ...all];
  window.localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('phone-npcs-updated'));
}

export function deleteNpc(id: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(getNpcs().filter(item => item.id !== id)));
  window.dispatchEvent(new CustomEvent('phone-npcs-updated'));
}

export function updateNpc(id: string, patch: Partial<SaneNpc>): void {
  const npc = getNpcs().find(item => item.id === id);
  if (!npc) return;
  upsertNpc({ ...npc, ...patch, updatedAt: new Date().toISOString() });
}
