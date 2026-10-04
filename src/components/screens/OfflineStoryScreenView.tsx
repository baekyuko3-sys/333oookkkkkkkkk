import { useMemo, useState } from 'react';
import {
  ArrowLeft, CalendarClock, Check, ChevronRight, MapPin, Play, Plus, Send,
  Sparkles, Trash2, UserRound
} from 'lucide-react';
import type { OfflineEvent, ScreenType } from '../../types';
import { getOfflineEvents, updateOfflineEvent, upsertOfflineEvent, deleteOfflineEvent } from '../../store/offlineEvents';
import { usePersistentState } from '../../store/usePersistentState';
import type { ImportedCharacter } from '../../data/characterImport';
import type { WorldBook } from '../../types';
import { getProjectManifest } from '../../store/projectManifest';
import { getCharacterMemory } from '../../store/characterMemory';
import { getCharacterProfile } from '../../data/characterProfiles';
import { generateCreativeText, readStoredAiSettings } from '../../ai/aiEngine';
import { setCurrentScene, setCharacterRuntime } from '../../store/worldRuntime';
import { appendOfflineEventToLine } from '../../store/lineMessageRuntime';

const statusLabel: Record<OfflineEvent['status'], string> = {
  draft: '草稿',
  pending: '待确认',
  accepted: '已赴约',
  declined: '已暂缓',
  'in-progress': '剧情进行中',
  completed: '已完成',
};

function nowIso() {
  return new Date().toISOString();
}

export function OfflineStoryScreenView({ onNavigate }: { onNavigate: (screen: ScreenType) => void }) {
  const [events, setEvents] = usePersistentState<OfflineEvent[]>('phone:offline-events-cache', getOfflineEvents());
  const [characters] = usePersistentState<ImportedCharacter[]>('phone:characters', []);
  const [worldbooks] = usePersistentState<WorldBook[]>('phone:worldbooks', []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sceneBusy, setSceneBusy] = useState(false);
  const [actionText, setActionText] = useState('');
  const [notice, setNotice] = useState('');

  const selected = events.find(event => event.id === selectedId) || null;
  const activeEvents = useMemo(
    () => events.filter(event => ['pending', 'accepted', 'in-progress'].includes(event.status)),
    [events],
  );

  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2000);
  };

  const sync = () => setEvents(getOfflineEvents());

  const getCharacterForEvent = (event: OfflineEvent) => {
    return characters.find(character => character.id === event.characterId)
      || characters.find(character => character.name === event.characterName)
      || null;
  };

  const patchEvent = (patch: Partial<OfflineEvent>) => {
    if (!selected) return;
    const updated = updateOfflineEvent(selected.id, { ...patch, updatedAt: nowIso() });
    if (updated) setEvents(getOfflineEvents());
  };

  const createDraft = () => {
    const defaultCharacter = characters[0];
    const event: OfflineEvent = {
      id: 'offline-' + Date.now(),
      characterId: defaultCharacter?.id || 'unassigned',
      characterName: defaultCharacter?.name || '未指定角色',
      title: '新的线下剧情',
      location: '待设置地点',
      time: '待设置时间',
      theme: '未定主题',
      letter: '写下这次相遇为什么值得发生……',
      status: 'draft',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      sceneLog: [],
    };
    upsertOfflineEvent(event);
    sync();
    setSelectedId(event.id);
  };

  const acceptInvite = (event: OfflineEvent) => {
    updateOfflineEvent(event.id, { status: 'accepted', updatedAt: nowIso() });
    appendOfflineEventToLine(event, '已接受你的线下邀约。之后就按约定见面吧。', 'accepted');
    sync();
    notify('已接受邀约，可以开始这条线下剧情');
  };

  const startScene = async (event: OfflineEvent) => {
    if (!event.characterId || event.characterId === 'unassigned') {
      notify('请先为剧情选择一个角色');
      return;
    }

    setSelectedId(event.id);
    setSceneBusy(true);
    const character = getCharacterForEvent(event);
    const profile = getCharacterProfile(character?.name || event.characterName);
    const memory = character ? getCharacterMemory(character.id, character.name) : null;
    const project = getProjectManifest();
    const settings = readStoredAiSettings();

    try {
      const systemPrompt = [
        '你是一个沉浸式线下剧情引擎。',
        '你需要把即时通讯中的线下邀约，真正变成一个可以持续玩的场景。',
        '输出环境、角色当前可观察的状态、角色说的话和自然的现场细节。',
        '绝对不要替用户说话、替用户行动、替用户决定情绪或选择。',
        '不要写成游戏规则说明，不要输出选择菜单，保持文学化但可继续互动的节奏。',
        '',
        '【项目】',
        project.name + ' · ' + project.genre,
        project.tone,
        project.globalPrompt,
        '',
        '【角色】',
        character ? [
          '姓名：' + character.name,
          '描述：' + character.description,
          '性格：' + character.personality,
          '场景：' + character.scenario,
          '开场习惯：' + character.firstMessage,
        ].join('\n') : '角色档案：' + profile.nickname + '；关系：' + profile.relationship,
        '',
        memory ? [
          '【长期记忆】',
          memory.summary,
          ...memory.items.slice(0, 12).map(item => '- ' + item.content),
        ].join('\n') : '【长期记忆】无。',
        '',
        '【世界书】',
        worldbooks.flatMap(book => book.enabled ? book.entries.filter(entry => entry.enabled).slice(0, 10).map(entry => '- ' + entry.name + ': ' + entry.content) : []).join('\n') || '无。',
      ].join('\n');

      const prompt = [
        '现在开始线下剧情。',
        '时间：' + event.time,
        '地点：' + event.location,
        '主题：' + event.theme,
        '邀约信：' + event.letter,
        '',
        '请写出这一幕的正式开场。让角色先出现，并给用户留下明确的可回应空间。',
      ].join('\n');

      const text = await generateCreativeText({
        settings,
        systemPrompt,
        userPrompt: prompt,
        temperature: settings.temperature,
      });

      const updated = updateOfflineEvent(event.id, {
        status: 'in-progress',
        sceneIntro: text,
        sceneLog: [{ id: 'scene-' + Date.now(), speaker: 'narrator', text, createdAt: nowIso() }],
        updatedAt: nowIso(),
      });
      if (updated) {
        setEvents(getOfflineEvents());
        appendOfflineEventToLine(updated, '线下剧情已经开始：' + updated.location + ' · ' + updated.time, 'in-progress');
        setCurrentScene(event.id);
        setCharacterRuntime(event.characterId, {
          location: event.location,
          activity: '正在与你见面',
          mood: '在等你',
          lastInteractionAt: nowIso(),
        }, event.characterName);
      }
      notify('线下场景已生成');
    } catch (error) {
      notify(error instanceof Error ? error.message : '线下场景生成失败');
    } finally {
      setSceneBusy(false);
    }
  };

  const continueScene = async () => {
    if (!selected || !actionText.trim() || sceneBusy) return;
    const character = getCharacterForEvent(selected);
    const profile = getCharacterProfile(character?.name || selected.characterName);
    const memory = character ? getCharacterMemory(character.id, character.name) : null;
    const project = getProjectManifest();
    const settings = readStoredAiSettings();

    setSceneBusy(true);
    const history = (selected.sceneLog || []).map(item => ({
      role: item.speaker === 'me' ? 'user' as const : 'assistant' as const,
      content: item.text,
    }));

    try {
      const systemPrompt = [
        '继续一条沉浸式线下剧情。',
        '绝对不能替用户说话或替用户做出未明确的动作、决定和感受。',
        '你只负责环境变化、NPC/角色反应和角色台词。',
        '保持地点、时间、人物关系、长期记忆和世界书连续。',
        '',
        '【项目】' + project.name + ' / ' + project.tone,
        character ? '【角色】' + character.name + '\n' + character.description + '\n' + character.personality + '\n' + character.scenario : '【角色】' + profile.nickname,
        memory ? '【长期记忆】' + memory.summary + '\n' + memory.items.slice(0, 12).map(item => '- ' + item.content).join('\n') : '【长期记忆】无。',
      ].join('\n');

      const userText = actionText.trim();
      const generated = await generateCreativeText({
        settings,
        systemPrompt,
        history,
        userPrompt: '用户刚刚在现场做了 / 说了：\n' + userText + '\n\n请自然继续这一幕，给用户留下下一步回应空间。',
        temperature: settings.temperature,
      });

      updateOfflineEvent(selected.id, {
        status: 'in-progress',
        sceneLog: [
          ...(selected.sceneLog || []),
          { id: 'me-' + Date.now(), speaker: 'me', text: userText, createdAt: nowIso() },
          { id: 'role-' + Date.now(), speaker: 'role', text: generated, createdAt: nowIso() },
        ],
        updatedAt: nowIso(),
      });
      sync();
      setActionText('');
    } catch (error) {
      notify(error instanceof Error ? error.message : '剧情继续失败');
    } finally {
      setSceneBusy(false);
    }
  };

  const completeScene = () => {
    if (!selected) return;
    const completed = updateOfflineEvent(selected.id, { status: 'completed', updatedAt: nowIso() });
    if (completed) appendOfflineEventToLine(completed, '这次见面已经结束。线下剧情已存档。', 'completed');
    setCurrentScene(null);
    setCharacterRuntime(selected.characterId, { activity: '刚结束一次见面' }, selected.characterName);
    sync();
    notify('这一幕已存档');
  };

  const removeEvent = () => {
    if (!selected || !window.confirm('删除这条线下剧情存档？')) return;
    deleteOfflineEvent(selected.id);
    sync();
    setSelectedId(null);
    notify('剧情存档已删除');
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
      <div className="absolute inset-0 opacity-15 bg-paper-noise pointer-events-none" />

      <header className="relative z-10 px-5 pt-12 pb-3.5 border-b border-[rgba(40,36,31,.12)] bg-[rgba(247,244,238,.88)] backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => onNavigate('home')} className="w-8 h-8 rounded-full bg-white/40 border border-white/60 grid place-items-center text-[#242323] shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <div className="text-[8px] font-mono tracking-[2px] text-[#817a72] uppercase">OFFLINE STORY · SCENE ENGINE</div>
            <h2 className="font-serif font-bold text-base tracking-tight text-[#242323]">线下剧情 · Story</h2>
          </div>
        </div>
        <button onClick={createDraft} className="w-8 h-8 rounded-full bg-[#292724] text-white grid place-items-center">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </header>

      {selected && (selected.status === 'in-progress' || selected.status === 'completed') && (
        <div className="relative z-10 flex-1 flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-black/5 bg-white/35">
            <button onClick={() => setSelectedId(null)} className="text-[9px] text-[#8b7560]">← 返回剧情库</button>
            <div className="mt-2 flex items-start justify-between gap-2">
              <div>
                <div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">NOW PLAYING</div>
                <h3 className="mt-1 font-serif font-bold text-lg text-[#242323]">{selected.title}</h3>
                <div className="mt-1 text-[9px] text-[#7a736b]">{selected.characterName} · {selected.location} · {selected.time}</div>
              </div>
              <span className="px-2 py-1 rounded-full bg-[#eee9df] text-[8px] font-mono text-[#8b7560]">{statusLabel[selected.status]}</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-3">
            {(selected.sceneLog || []).map(item => (
              <div key={item.id} className={item.speaker === 'me' ? 'flex justify-end' : item.speaker === 'role' ? 'flex justify-start' : 'flex justify-center'}>
                <div className={
                  item.speaker === 'me'
                    ? 'max-w-[80%] rounded-2xl bg-[#292724] text-white px-3 py-2.5 text-[11px] leading-relaxed whitespace-pre-wrap'
                    : item.speaker === 'role'
                    ? 'max-w-[86%] rounded-2xl bg-white/72 border border-[rgba(40,36,31,.1)] px-3.5 py-3 text-[11px] leading-[1.8] text-[#423d38] whitespace-pre-wrap font-serif-sc'
                    : 'w-full rounded-2xl bg-[#ebe7df]/70 border border-black/5 px-3.5 py-3 text-[11px] leading-[1.9] text-[#4d4741] whitespace-pre-wrap font-serif-sc'
                }>
                  {item.text}
                </div>
              </div>
            ))}

            {sceneBusy && (
              <div className="flex items-center justify-center py-3 text-[9px] font-mono text-[#8b8782]">
                <Sparkles className="w-3 h-3 mr-1.5 animate-pulse" /> SCENE ENGINE · GENERATING
              </div>
            )}
          </div>

          <div className="relative z-10 p-3 border-t border-black/5 bg-[rgba(247,244,238,.88)] backdrop-blur-xl">
            <div className="flex gap-2">
              <textarea
                value={selected.status === 'completed' ? '' : actionText}
                disabled={selected.status === 'completed' || sceneBusy}
                onChange={e => setActionText(e.target.value)}
                placeholder={selected.status === 'completed' ? '本幕已完成 · 可回到剧情库继续管理' : '写下你此刻说的话 / 做的动作……'}
                className="flex-1 min-h-[44px] max-h-[100px] bg-white/70 border border-black/5 rounded-2xl px-3 py-2 text-[10.5px] outline-none resize-none"
              />
              <button
                onClick={continueScene}
                disabled={selected.status === 'completed' || sceneBusy || !actionText.trim()}
                className="w-11 rounded-2xl bg-[#292724] text-white disabled:opacity-30 grid place-items-center"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <button onClick={completeScene} disabled={selected.status === 'completed'} className="mt-2 w-full py-2 rounded-xl bg-[#ebe7df] border border-black/5 text-[9px] text-[#5d5751] disabled:opacity-40">
              <Check className="w-3 h-3 inline mr-1" />结束本幕并存档
            </button>
          </div>
        </div>
      )}

      {selected && !['in-progress', 'completed'].includes(selected.status) && (
        <div className="relative z-10 flex-1 overflow-y-auto no-scrollbar p-4">
          <button onClick={() => setSelectedId(null)} className="text-[9px] text-[#8b7560]">← 返回剧情库</button>
          <section className="mt-3 p-4 rounded-2xl bg-[#eee9df] border border-[rgba(40,36,31,.13)] space-y-2.5">
            <div className="flex items-center gap-2"><UserRound className="w-4 h-4 text-[#8b7560]" /><span className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">SCENE SETUP</span></div>
            <label className="block text-[9px] text-[#7e7770]">角色
              <select value={selected.characterId} onChange={e => {
                const c = characters.find(item => item.id === e.target.value);
                patchEvent({ characterId: e.target.value, characterName: c?.name || '未指定角色' });
              }} className="w-full mt-1 bg-white/70 rounded-xl p-2.5 text-xs outline-none">
                <option value="unassigned">选择角色</option>
                {characters.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}
              </select>
            </label>
            {(['title', 'location', 'time', 'theme', 'letter'] as const).map(key => (
              <label key={key} className="block text-[9px] text-[#7e7770]">
                {key === 'title' ? '剧情标题' : key === 'location' ? '地点' : key === 'time' ? '时间' : key === 'theme' ? '主题' : '邀约 / 开场文字'}
                {key === 'letter' ? (
                  <textarea value={selected[key]} onChange={e => patchEvent({ [key]: e.target.value })} className="w-full mt-1 min-h-[80px] bg-white/70 rounded-xl p-2.5 text-[10.5px] outline-none resize-y" />
                ) : (
                  <input value={selected[key]} onChange={e => patchEvent({ [key]: e.target.value })} className="w-full mt-1 bg-white/70 rounded-xl p-2.5 text-xs outline-none" />
                )}
              </label>
            ))}
            <div className="grid grid-cols-2 gap-2 pt-1">
              {selected.status === 'pending' ? (
                <button onClick={() => acceptInvite(selected)} className="py-2.5 rounded-xl bg-[#292724] text-white text-[10px] flex items-center justify-center gap-1.5"><Check className="w-3.5 h-3.5" />接受邀约</button>
              ) : (
                <button onClick={() => startScene(selected)} disabled={sceneBusy} className="py-2.5 rounded-xl bg-[#292724] text-white text-[10px] flex items-center justify-center gap-1.5 disabled:opacity-40"><Play className="w-3.5 h-3.5" />生成线下场景</button>
              )}
              <button onClick={removeEvent} className="py-2.5 rounded-xl bg-white/65 border border-[rgba(40,36,31,.1)] text-[#9b625b] text-[10px] flex items-center justify-center gap-1.5"><Trash2 className="w-3.5 h-3.5" />删除存档</button>
            </div>
          </section>
        </div>
      )}

      {!selected && (
        <div className="relative z-10 flex-1 overflow-y-auto no-scrollbar p-4 space-y-3">
          <section className="p-4 rounded-2xl bg-white/65 border border-[rgba(40,36,31,.1)] overflow-hidden relative">
            <div className="absolute -right-8 -bottom-10 text-[90px] font-serif text-[#d4aab5]/10">STORY</div>
            <div className="relative text-[8px] font-mono tracking-[2px] text-[#aaa]">OFFLINE / SCENE ENGINE</div>
            <div className="relative mt-2 text-[17px] font-serif font-bold text-[#292724]">角色发来的邀约，现在真的可以走进去了。</div>
            <p className="relative mt-2 text-[10px] leading-relaxed text-[#817a72]">LINE 负责“邀约发生”，这里负责“见面发生什么”。角色卡、长期记忆、项目设定与 World Book 会一起进入线下场景。</p>
            <button onClick={() => onNavigate('chat')} className="relative mt-3 text-[10px] text-[#ae7e89]">← 去 LINE 看角色的邀约</button>
          </section>

          {activeEvents.map(event => (
            <button key={event.id} onClick={() => setSelectedId(event.id)} className="w-full text-left p-4 rounded-2xl bg-[#eee9df] border border-[rgba(40,36,31,.13)] shadow-xs hover:bg-[#e8e2d9] transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">{statusLabel[event.status]}</span>
                <ChevronRight className="w-4 h-4 text-[#8b7560]" />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#9b625b]" />
                <div className="min-w-0">
                  <div className="font-serif font-bold text-sm text-[#242323] truncate">{event.title}</div>
                  <div className="mt-1 text-[10px] text-[#746d66] truncate">{event.characterName} · {event.location}</div>
                </div>
              </div>
            </button>
          ))}

          {events.filter(event => !activeEvents.includes(event)).map(event => (
            <button key={event.id} onClick={() => setSelectedId(event.id)} className="w-full text-left p-4 rounded-2xl bg-white/50 border border-[rgba(40,36,31,.1)]">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-serif font-bold text-sm text-[#242323] truncate">{event.title}</div>
                  <div className="mt-1 text-[9px] text-[#8b8782] truncate">{event.characterName} · {statusLabel[event.status]}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#8b7560]" />
              </div>
            </button>
          ))}

          {!events.length && (
            <div className="h-[330px] rounded-2xl border border-dashed border-[rgba(40,36,31,.18)] bg-white/30 grid place-items-center text-center p-6 text-[#8b8782]">
              <div>
                <div className="text-3xl mb-2">✦</div>
                <div className="font-serif text-sm">还没有线下剧情存档。</div>
                <div className="mt-1 text-[9px]">先让角色在 LINE 发一个邀约，或者自己创建一条。</div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="relative z-10 p-3 text-center text-[9px] text-[#8b8782] font-mono border-t border-[rgba(40,36,31,.1)]">OFFLINE STORY ARCHIVE · PRIVATE DEVICE</div>
      {notice && <div className="absolute z-50 left-1/2 -translate-x-1/2 bottom-16 bg-[#292724] text-white px-3.5 py-2 rounded-full text-[10px] shadow-lg">{notice}</div>}
    </div>
  );
}
