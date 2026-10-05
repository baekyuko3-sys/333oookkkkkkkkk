export interface CharacterMemoryItem {
  id: string;
  content: string;
  source: 'manual' | 'ai-summary' | 'conversation';
  createdAt: string;
  updatedAt: string;
  importance: number;
  kind?: 'fact' | 'diary' | 'relationship' | 'preference' | 'event';
}

export interface CharacterMemory {
  characterId: string;
  characterName: string;
  summary: string;
  items: CharacterMemoryItem[];
  updatedAt: string;
}

const keyFor = (characterId: string) => `phone:character-memory:${characterId}`;

function emptyMemory(characterId: string, characterName: string): CharacterMemory {
  return {
    characterId,
    characterName,
    summary: '',
    items: [],
    updatedAt: new Date().toISOString(),
  };
}

export function getCharacterMemory(characterId: string, characterName: string): CharacterMemory {
  if (typeof window === 'undefined') return emptyMemory(characterId, characterName);
  try {
    const raw = window.localStorage.getItem(keyFor(characterId));
    if (!raw) return emptyMemory(characterId, characterName);
    const parsed = JSON.parse(raw) as Partial<CharacterMemory>;
    return {
      ...emptyMemory(characterId, characterName || parsed.characterName || ''),
      ...parsed,
      characterId,
      characterName: characterName || parsed.characterName || '',
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch {
    return emptyMemory(characterId, characterName);
  }
}

export function saveCharacterMemory(memory: CharacterMemory): CharacterMemory {
  const next = { ...memory, updatedAt: new Date().toISOString() };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(keyFor(memory.characterId), JSON.stringify(next));
    } catch {
      // Keep the application usable when local storage is unavailable.
    }
  }
  return next;
}

export function updateCharacterMemory(
  characterId: string,
  characterName: string,
  patch: Partial<CharacterMemory>,
): CharacterMemory {
  return saveCharacterMemory({
    ...getCharacterMemory(characterId, characterName),
    ...patch,
    characterId,
    characterName,
  });
}

export function addCharacterMemoryItem(
  characterId: string,
  characterName: string,
  content: string,
  options?: {
    source?: CharacterMemoryItem['source'];
    importance?: number;
    kind?: CharacterMemoryItem['kind'];
  },
): CharacterMemory {
  const trimmed = content.trim();
  if (!trimmed) return getCharacterMemory(characterId, characterName);

  const now = new Date().toISOString();
  const current = getCharacterMemory(characterId, characterName);
  const importance = Math.max(0, Math.min(100, Number(options?.importance ?? 50) || 50));
  const normalized = normalizeMemoryText(trimmed);

  const duplicate = current.items.find(item => {
    const existing = normalizeMemoryText(item.content);
    return existing === normalized || existing.includes(normalized) || normalized.includes(existing);
  });

  if (duplicate) {
    const mergedContent = trimmed.length > duplicate.content.length ? trimmed : duplicate.content;
    const updatedItems = current.items.map(item =>
      item.id === duplicate.id
        ? { ...item, content: mergedContent, updatedAt: now, importance: Math.max(item.importance, importance), source: options?.source || item.source, kind: options?.kind || item.kind }
        : item
    );
    return saveCharacterMemory({ ...current, items: updatedItems });
  }

  const item: CharacterMemoryItem = {
    id: `memory-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    content: trimmed,
    source: options?.source || 'manual',
    createdAt: now,
    updatedAt: now,
    importance,
    kind: options?.kind || 'fact',
  };

  return saveCharacterMemory({ ...current, items: [item, ...current.items].slice(0, 120) });
}

function normalizeMemoryText(value: string): string {
  return value.toLowerCase().replace(/[“”‘’]/g, '').replace(/[，。！？、；：,.!?;:]/g, '').replace(/\s+/g, '').trim();
}

export function updateCharacterMemoryItem(
  characterId: string,
  characterName: string,
  itemId: string,
  patch: Partial<Pick<CharacterMemoryItem, 'content' | 'importance' | 'kind'>>,
): CharacterMemory {
  const current = getCharacterMemory(characterId, characterName);
  const now = new Date().toISOString();
  return saveCharacterMemory({
    ...current,
    items: current.items.map(item => item.id === itemId ? {
      ...item,
      ...patch,
      content: patch.content?.trim() || item.content,
      importance: patch.importance === undefined ? item.importance : Math.max(0, Math.min(100, Number(patch.importance) || 0)),
      updatedAt: now,
    } : item),
  });
}

export function mergeCharacterMemoryItems(
  characterId: string,
  characterName: string,
  itemIds: string[],
): CharacterMemory {
  const current = getCharacterMemory(characterId, characterName);
  const selected = current.items.filter(item => itemIds.includes(item.id));
  if (selected.length < 2) return current;

  const merged = selected.map(item => item.content).filter(Boolean).join('；');
  const keep = selected.slice().sort((a, b) => b.importance - a.importance)[0];
  const ids = new Set(selected.map(item => item.id));
  const nextItems = current.items.filter(item => !ids.has(item.id));
  nextItems.unshift({ ...keep, content: merged, importance: Math.max(...selected.map(item => item.importance)), updatedAt: new Date().toISOString() });
  return saveCharacterMemory({ ...current, items: nextItems.slice(0, 120) });
}

export function deleteCharacterMemoryItem(characterId: string, itemId: string): CharacterMemory | null {
  if (typeof window === 'undefined') return null;
  const current = getCharacterMemory(characterId, '');
  const next = {
    ...current,
    items: current.items.filter(item => item.id !== itemId),
  };
  return saveCharacterMemory(next);
}

export function buildMemoryContext(memory: CharacterMemory, maxItems = 20): string {
  const sections: string[] = [];
  if (memory.summary.trim()) {
    sections.push('【长期记忆摘要】\n' + memory.summary.trim());
  }

  const items = [...memory.items]
    .sort((a, b) => b.importance - a.importance || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, maxItems);

  if (items.length) {
    sections.push(
      '【长期记忆条目】\n' +
      items.map(item => `- [重要度 ${item.importance}] ${item.content}`).join('\n')
    );
  }

  return sections.join('\n\n') || '当前没有已保存的长期记忆。';
}
