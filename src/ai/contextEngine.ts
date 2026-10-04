import type { ImportedCharacter } from '../data/characterImport';
import type { ProjectManifest, WorldBook } from '../types';
import type { CharacterMemory } from '../store/characterMemory';
import { buildMemoryContext } from '../store/characterMemory';
import { getWorldRuntime } from '../store/worldRuntime';

export interface ContextEngineInput {
  character?: ImportedCharacter | null;
  characterProfile?: { relationship?: string; callMe?: string; bio?: string } | null;
  persona?: { name?: string; identity?: string; gender?: string; traits?: string; background?: string } | null;
  memory?: CharacterMemory | null;
  project?: ProjectManifest | null;
  worldbooks?: WorldBook[];
  userMessage: string;
}

export interface ResolvedContext {
  character: string;
  persona: string;
  relationship: string;
  memory: string;
  world: string;
  project: string;
  worldBook: string;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function resolveWorldBook(worldbooks: WorldBook[], userMessage: string) {
  const haystack = normalize(userMessage);
  const selected = worldbooks.flatMap(book => !book.enabled ? [] : book.entries
    .filter(entry => entry.enabled && entry.insertion !== 'depth')
    .map(entry => {
      const matched = entry.keywords.filter(keyword => {
        const key = normalize(keyword);
        return key && haystack.includes(key);
      });
      return matched.length ? { book, entry, matched } : null;
    })
    .filter(Boolean) as Array<{ book: WorldBook; entry: WorldBook['entries'][number]; matched: string[] }>);

  selected.sort((a, b) =>
    b.entry.priority - a.entry.priority ||
    b.entry.weight - a.entry.weight ||
    b.matched.length - a.matched.length
  );

  if (!selected.length) return '当前没有命中的世界书条目。';

  return selected.slice(0, 18).map(({ book, entry, matched }) => [
    '[WORLD BOOK]',
    '书名：' + book.name,
    '条目：' + entry.name,
    '命中关键词：' + matched.join('、'),
    '优先级：' + entry.priority + '；权重：' + entry.weight + '；插入：' + entry.insertion + (entry.insertion === 'depth' ? '；depth=' + entry.depth : ''),
    '内容：',
    entry.content,
  ].join('\n')).join('\n\n');
}

export function resolveCharacterContext(input: ContextEngineInput): ResolvedContext {
  const p = input.characterProfile || {};
  const character = input.character
    ? [
        '姓名：' + input.character.name,
        '描述：' + (input.character.description || '未填写'),
        '性格：' + (input.character.personality || '未填写'),
        '场景：' + (input.character.scenario || '未填写'),
        '创作者注释：' + (input.character.creatorNotes || '未填写'),
        '角色系统提示：' + (input.character.systemPrompt || '未填写'),
        '历史指令：' + (input.character.postHistoryInstructions || '未填写'),
      ].join('\n')
    : [
        '姓名：' + (p.callMe || '角色'),
        '关系：' + (p.relationship || '未设置'),
        '称呼：' + (p.callMe || '未设置'),
        '简介：' + (p.bio || '未填写'),
      ].join('\n');

  const persona = input.persona
    ? [
        '姓名：' + (input.persona.name || '未命名'),
        '身份：' + (input.persona.identity || '未填写'),
        '性别：' + (input.persona.gender || '未设置'),
        '特质：' + (input.persona.traits || '未填写'),
        '背景：' + (input.persona.background || '未填写'),
      ].join('\n')
    : '未设置。';

  const runtime = getWorldRuntime();
  const id = input.character?.id;
  const live = id ? runtime.characters[id] : undefined;
  const world = live
    ? [
        '当前地点：' + live.location,
        '当前活动：' + live.activity,
        '当前情绪：' + live.mood,
        '当前日程：' + (live.currentScheduleTitle || '无'),
        '下一行动：' + (live.nextActionTitle || '无') + (live.nextActionAt ? '（' + live.nextActionAt + '）' : ''),
        '最近互动：' + (live.lastInteractionAt || '暂无'),
        '当前场景：' + (runtime.currentScene || '无'),
      ].join('\n')
    : '当前没有可用的角色实时世界状态。';

  const relationship = [
    '关系：' + (p.relationship || '未设置'),
    'TA希望被称为：' + (p.callMe || '未设置'),
    live ? '当前未读：' + live.unread : '',
  ].filter(Boolean).join('\n');

  const project = input.project
    ? [
        '项目名称：' + input.project.name,
        '类型：' + input.project.genre,
        '语言：' + input.project.language,
        '整体风格：' + input.project.tone,
        input.project.globalPrompt ? '项目级 AI 指令：\\n' + input.project.globalPrompt : '项目级 AI 指令：无。',
      ].join('\n')
    : '使用默认项目规则。';

  return {
    character,
    persona,
    relationship,
    memory: input.memory ? buildMemoryContext(input.memory) : '当前没有已保存的长期记忆。',
    world,
    project,
    worldBook: resolveWorldBook(input.worldbooks || [], input.userMessage),
  };
}
