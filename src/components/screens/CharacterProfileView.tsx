import { useEffect, useState } from 'react';
import { ArrowLeft, Edit3, Plus, Trash2, UserRound, X } from 'lucide-react';
import { ScreenType } from '../../types';
import { SaneNpc, deleteNpc, getNpcs, upsertNpc } from '../../store/npcs';

interface CharacterProfileViewProps {
  themeMode?: any;
  onNavigate: (screen: ScreenType) => void;
}

const emptyNpc = (): SaneNpc => {
  const now = new Date().toISOString();
  return {
    id: `npc-${Date.now()}`,
    name: '',
    gender: '',
    age: '',
    identity: '',
    appearance: '',
    personality: '',
    background: '',
    relationship: '',
    settingSource: 'manual',
    sourceCharacterId: null,
    sourceCharacterName: null,
    tags: [],
    avatar: '',
    createdAt: now,
    updatedAt: now,
    memory: '',
    active: true,
    canCommentMoments: true,
  };
};

export function CharacterProfileView({ onNavigate }: CharacterProfileViewProps) {
  const [npcs, setNpcs] = useState<SaneNpc[]>([]);
  const [editing, setEditing] = useState<SaneNpc | null>(null);

  const refresh = () => setNpcs(getNpcs());

  useEffect(() => {
    refresh();
    const onUpdate = () => refresh();
    window.addEventListener('phone-npcs-updated', onUpdate);
    return () => window.removeEventListener('phone-npcs-updated', onUpdate);
  }, []);

  const save = () => {
    if (!editing?.name.trim()) return;
    upsertNpc({
      ...editing,
      name: editing.name.trim(),
      updatedAt: new Date().toISOString(),
      tags: editing.tags.map(tag => tag.trim()).filter(Boolean),
    });
    refresh();
    setEditing(null);
  };

  const remove = (id: string) => {
    if (!window.confirm('删除这个角色？相关角色资料将从本机移除。')) return;
    deleteNpc(id);
    refresh();
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden" style={{ background: 'var(--screen, #fff)', color: 'var(--ink, #242323)' }}>
      <div className="relative z-10 px-5 pt-12 pb-3 border-b border-[#ddd6cd] bg-[rgba(247,244,238,.92)] backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('home')} className="w-8 h-8 rounded-full bg-white/60 border border-white/70 grid place-items-center active:scale-95">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="text-[8px] font-mono tracking-[2px] text-[#817a72]">CHARACTER MANAGER</div>
            <h2 className="font-serif font-bold text-[16px]">角色中心</h2>
          </div>
        </div>
        <button onClick={() => setEditing(emptyNpc())} className="h-8 px-3 rounded-full bg-[#292724] text-white text-[10px] font-medium flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> 添加角色
        </button>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto p-4 pb-8 no-scrollbar">
        {npcs.length === 0 ? (
          <div className="h-full min-h-[530px] flex items-center justify-center">
            <div className="w-full rounded-[24px] border border-dashed border-[#cfc7bb] bg-[#f7f3ec]/75 p-6 text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-white/80 border border-[#e0dbd3] grid place-items-center text-[#8b7560]">
                <UserRound className="w-6 h-6 stroke-[1.4]" />
              </div>
              <div className="mt-4 font-serif font-bold text-[17px]">角色库是空的</div>
              <p className="mt-2 text-[11px] leading-relaxed text-[#8b8782]">
                不预置任何人物。<br />这里是完整的角色设定、管理与编辑入口。
              </p>
              <button onClick={() => setEditing(emptyNpc())} className="mt-5 h-10 px-5 rounded-full bg-[#292724] text-white text-[11px] font-medium inline-flex items-center gap-2">
                <Plus className="w-3.5 h-3.5" /> 新建第一个角色
              </button>
              <div className="mt-4 text-[8px] font-mono tracking-[1.5px] text-[#a39b91]">EMPTY BY DESIGN · NO PRESET CHARACTERS</div>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1 pb-1">
              <div className="text-[9px] font-mono tracking-[1.5px] text-[#8b8782]">CHARACTERS · {npcs.length}</div>
              <div className="text-[9px] text-[#8b8782]">本机管理</div>
            </div>
            {npcs.map(npc => (
              <div key={npc.id} className="rounded-[20px] border border-[#ded7cd] bg-white/80 p-3.5 shadow-[0_6px_18px_rgba(45,37,30,.04)]">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-[15px] overflow-hidden border border-[#e5dfd7] bg-[#eee9e1] grid place-items-center text-[#8b7560] shrink-0">
                    {npc.avatar ? <img src={npc.avatar} alt="" className="w-full h-full object-cover" /> : <UserRound className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold truncate">{npc.name}</div>
                    <div className="mt-1 text-[9px] text-[#8b8782] truncate">{npc.identity || '尚未填写身份'} · {npc.relationship || '未设置关系'}</div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditing(npc)} className="w-8 h-8 rounded-full bg-[#f5f1ea] grid place-items-center"><Edit3 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => remove(npc.id)} className="w-8 h-8 rounded-full bg-[#f5ece8] text-[#9b625b] grid place-items-center"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 text-[8px] font-mono">
                  <span className="px-2 py-1 rounded bg-[#f5f1ea]">{npc.active ? 'ACTIVE' : 'PAUSED'}</span>
                  <span className="px-2 py-1 rounded bg-[#f5f1ea]">{npc.canCommentMoments ? 'MOMENTS ON' : 'MOMENTS OFF'}</span>
                  {npc.tags.slice(0, 4).map(tag => <span key={tag} className="px-2 py-1 rounded bg-[#f5f1ea] text-[#8b8782]">{tag}</span>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <div className="absolute inset-0 z-50 bg-black/25 backdrop-blur-sm flex items-end">
          <div className="w-full max-h-[86%] overflow-y-auto rounded-t-[28px] bg-[#f4f0e9] p-5 pb-7 no-scrollbar">
            <div className="flex items-center justify-between">
              <div><div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">CHARACTER SETUP</div><h3 className="font-serif font-bold text-[17px]">{npcs.some(item => item.id === editing.id) ? '编辑角色' : '添加角色'}</h3></div>
              <button onClick={() => setEditing(null)}><X className="w-4 h-4" /></button>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4">
              {([
                ['name','名字'], ['gender','性别'], ['age','年龄'], ['identity','身份'],
                ['appearance','外貌'], ['personality','性格'], ['relationship','与你的关系']
              ] as const).map(([key,label]) => (
                <label key={key} className={key === 'appearance' || key === 'personality' || key === 'relationship' ? 'col-span-2 block' : 'block'}>
                  <span className="text-[9px] font-mono text-[#8b8782]">{label}{key === 'name' ? ' *' : ''}</span>
                  <input value={editing[key]} onChange={e => setEditing({ ...editing, [key]: e.target.value })} className="mt-1 w-full h-9 rounded-xl border border-[#d8d0c5] bg-white px-3 text-[11px] outline-none" />
                </label>
              ))}
            </div>

            <label className="block mt-3">
              <span className="text-[9px] font-mono text-[#8b8782]">背景 / 经历</span>
              <textarea value={editing.background} onChange={e => setEditing({ ...editing, background: e.target.value })} rows={4} className="mt-1 w-full rounded-xl border border-[#d8d0c5] bg-white p-3 text-[11px] outline-none resize-none" />
            </label>
            <label className="block mt-3">
              <span className="text-[9px] font-mono text-[#8b8782]">长期记忆 / 补充设定</span>
              <textarea value={editing.memory ?? ''} onChange={e => setEditing({ ...editing, memory: e.target.value })} rows={4} className="mt-1 w-full rounded-xl border border-[#d8d0c5] bg-white p-3 text-[11px] outline-none resize-none" />
            </label>
            <label className="block mt-3">
              <span className="text-[9px] font-mono text-[#8b8782]">头像 URL（可留空）</span>
              <input value={editing.avatar ?? ''} onChange={e => setEditing({ ...editing, avatar: e.target.value })} placeholder="https://..." className="mt-1 w-full h-9 rounded-xl border border-[#d8d0c5] bg-white px-3 text-[11px] outline-none" />
            </label>
            <label className="block mt-3">
              <span className="text-[9px] font-mono text-[#8b8782]">标签</span>
              <input value={editing.tags.join(', ')} onChange={e => setEditing({ ...editing, tags: e.target.value.split(',') })} placeholder="例如：演员, 上海, 冷淡" className="mt-1 w-full h-9 rounded-xl border border-[#d8d0c5] bg-white px-3 text-[11px] outline-none" />
            </label>

            <div className="grid grid-cols-2 gap-2 mt-3">
              <button onClick={() => setEditing({ ...editing, active: !editing.active })} className={`h-9 rounded-xl border text-[10px] ${editing.active ? 'bg-[#eae3d9] border-[#cfc4b7]' : 'bg-white border-[#ded7cd] text-[#8b8782]'}`}>{editing.active ? '角色已启用' : '角色已暂停'}</button>
              <button onClick={() => setEditing({ ...editing, canCommentMoments: !editing.canCommentMoments })} className={`h-9 rounded-xl border text-[10px] ${editing.canCommentMoments ? 'bg-[#eae3d9] border-[#cfc4b7]' : 'bg-white border-[#ded7cd] text-[#8b8782]'}`}>{editing.canCommentMoments ? '允许动态互动' : '关闭动态互动'}</button>
            </div>

            <button onClick={save} disabled={!editing.name.trim()} className="mt-4 w-full h-10 rounded-xl bg-[#292724] text-white text-[11px] font-medium disabled:opacity-35">保存角色</button>
          </div>
        </div>
      )}
    </div>
  );
}
