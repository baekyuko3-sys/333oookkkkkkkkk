import YAML from 'yaml';
import type { WorldBook } from '../types';
import { importWorldBooks } from '../store/worldbookFormats';
export interface ImportedCharacter {
  id: string;
  name: string;
  variantLabel: string;
  avatar?: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  exampleDialogue: string;
  creatorNotes: string;
  systemPrompt: string;
  postHistoryInstructions: string;
  alternateGreetings: string[];
  tags: string[];
  creator: string;
  characterVersion: string;
  extensions?: Record<string, unknown>;
  embeddedWorldBook?: WorldBook;
  groupId?: string | null;
  sourceFormat: 'json' | 'yaml' | 'png' | 'manual';
  importedAt: string;
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(cleanString).filter(Boolean);
}

function getCardPayload(raw: any): any {
  if (raw?.data && typeof raw.data === 'object') return raw.data;
  if (raw?.character && typeof raw.character === 'object') return raw.character;
  return raw || {};
}

function normalizeCharacter(raw: any, sourceFormat: ImportedCharacter['sourceFormat']): ImportedCharacter {
  const data = getCardPayload(raw);
  const now = new Date().toISOString();
  const name = cleanString(data.name) || '未命名角色';
  const variantLabel = cleanString(data.variantLabel) || cleanString(data.variant_label) || cleanString(data.lifeStage) || cleanString(data.life_stage) || cleanString(data.timeline) || cleanString(data.characterVersion) || cleanString(data.character_version) || '默认版本';

  return {
    id: cleanString(data.id) || `char-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    variantLabel,
    avatar: cleanString(data.avatar) || cleanString(data.avatar_url),
    description: cleanString(data.description) || cleanString(data.desc),
    personality: cleanString(data.personality),
    scenario: cleanString(data.scenario),
    firstMessage: cleanString(data.first_mes) || cleanString(data.firstMessage),
    exampleDialogue: cleanString(data.mes_example) || cleanString(data.exampleDialogue),
    creatorNotes: cleanString(data.creator_notes) || cleanString(data.creatorNotes),
    systemPrompt: cleanString(data.system_prompt) || cleanString(data.systemPrompt),
    postHistoryInstructions:
      cleanString(data.post_history_instructions) ||
      cleanString(data.postHistoryInstructions),
    alternateGreetings:
      cleanArray(data.alternate_greetings).length > 0
        ? cleanArray(data.alternate_greetings)
        : cleanArray(data.alternateGreetings),
    tags: cleanArray(data.tags),
    creator: cleanString(data.creator),
    characterVersion:
      cleanString(data.character_version) || cleanString(data.characterVersion),
    extensions: data.extensions && typeof data.extensions === 'object' ? data.extensions : undefined,
    embeddedWorldBook: data.character_book && typeof data.character_book === 'object'
      ? (() => { try { return importWorldBooks(JSON.stringify(data.character_book))[0]; } catch { return undefined; } })()
      : undefined,
    groupId: cleanString(data.groupId) || cleanString(data.group_id) || null,
    sourceFormat,
    importedAt: now,
  };
}

function readPngTextChunks(buffer: ArrayBuffer): Record<string, string> {
  const bytes = new Uint8Array(buffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 8 || !signature.every((value, i) => bytes[i] === value)) {
    throw new Error('不是有效的 PNG 文件。');
  }

  const decoder = new TextDecoder('utf-8', { fatal: false });
  const result: Record<string, string> = {};
  let offset = 8;

  while (offset + 12 <= bytes.length) {
    const view = new DataView(buffer);
    const length = view.getUint32(offset, false);
    if (length > 50_000_000 || offset + 12 + length > bytes.length) break;

    const type = decoder.decode(bytes.slice(offset + 4, offset + 8));
    const chunk = bytes.slice(offset + 8, offset + 8 + length);

    if (type === 'tEXt') {
      const zero = chunk.indexOf(0);
      if (zero > 0) {
        const keyword = decoder.decode(chunk.slice(0, zero));
        const value = decoder.decode(chunk.slice(zero + 1));
        result[keyword] = value;
      }
    }

    // iTXt is used by some card exporters.
    if (type === 'iTXt') {
      let cursor = 0;
      const readNullTerminated = () => {
        const start = cursor;
        while (cursor < chunk.length && chunk[cursor] !== 0) cursor += 1;
        const value = decoder.decode(chunk.slice(start, cursor));
        cursor += 1;
        return value;
      };
      const keyword = readNullTerminated();
      if (keyword) {
        if (cursor + 2 > chunk.length) {
          offset += length + 12;
          continue;
        }
        const compressionFlag = chunk[cursor];
        cursor += 1;
        cursor += 1; // compression method
        readNullTerminated(); // language tag
        readNullTerminated(); // translated keyword
        if (compressionFlag === 0 && cursor <= chunk.length) {
          result[keyword] = decoder.decode(chunk.slice(cursor));
        }
      }
    }

    offset += length + 12;
    if (type === 'IEND') break;
  }

  return result;
}

export async function parseCharacterFile(file: File): Promise<ImportedCharacter> {
  const lower = file.name.toLowerCase();

  if (lower.endsWith('.png')) {
    const chunks = readPngTextChunks(await file.arrayBuffer());
    const encoded = chunks.chara || chunks.char || chunks.character;
    if (!encoded) throw new Error('PNG 中没有找到角色卡数据。');

    let jsonText = '';
    try {
      jsonText = decodeURIComponent(
        escape(atob(encoded))
      );
    } catch {
      try {
        jsonText = new TextDecoder().decode(
          Uint8Array.from(atob(encoded), c => c.charCodeAt(0))
        );
      } catch {
        jsonText = atob(encoded);
      }
    }

    const parsed = normalizeCharacter(JSON.parse(jsonText), 'png');
    if (!parsed.avatar) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      parsed.avatar = `data:${file.type || 'image/png'};base64,${btoa(binary)}`;
    }
    return parsed;
  }

  const text = await file.text();
  if (lower.endsWith('.json')) {
    return normalizeCharacter(JSON.parse(text), 'json');
  }

  // Full YAML parsing supports nested Character Card documents.
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) {
    const parsed = YAML.parse(text);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('YAML 角色卡内容不是有效对象。');
    }
    return normalizeCharacter(parsed, 'yaml');
  }

  throw new Error('支持的角色卡格式：PNG / JSON / YAML / YML。');
}

export function exportCharacterJson(character: ImportedCharacter): string {
  return JSON.stringify(
    {
      name: character.name,
      variantLabel: character.variantLabel,
      description: character.description,
      personality: character.personality,
      scenario: character.scenario,
      first_mes: character.firstMessage,
      mes_example: character.exampleDialogue,
      creator_notes: character.creatorNotes,
      system_prompt: character.systemPrompt,
      post_history_instructions: character.postHistoryInstructions,
      alternate_greetings: character.alternateGreetings,
      tags: character.tags,
      creator: character.creator,
      character_version: character.characterVersion,
      groupId: character.groupId || null,
      extensions: character.extensions || {},
      ...(character.embeddedWorldBook ? { character_book: character.embeddedWorldBook } : {}),
    },
    null,
    2,
  );
}

export function exportCharacterCardV2(character: ImportedCharacter): string {
  return JSON.stringify({
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: character.name,
      description: character.description,
      personality: character.personality,
      scenario: character.scenario,
      first_mes: character.firstMessage,
      mes_example: character.exampleDialogue,
      creator_notes: character.creatorNotes,
      system_prompt: character.systemPrompt,
      post_history_instructions: character.postHistoryInstructions,
      alternate_greetings: character.alternateGreetings,
      tags: character.tags,
      creator: character.creator,
      character_version: character.characterVersion,
      extensions: character.extensions || {},
      ...(character.embeddedWorldBook ? { character_book: character.embeddedWorldBook } : {}),
    },
  }, null, 2);
}
