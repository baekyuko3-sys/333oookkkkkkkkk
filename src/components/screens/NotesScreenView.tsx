import { useEffect, useState } from 'react';
import { ArrowLeft, FileText, Plus, Trash2 } from 'lucide-react';
import { ScreenType } from '../../types';

interface Note {
  id: string;
  title: string;
  content: string;
  date: string;
}

const KEY = 'phone:notes';

export function NotesScreenView({ onNavigate }: { themeMode?: any; onNavigate: (screen: ScreenType) => void }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [editing, setEditing] = useState<Note | null>(null);

  useEffect(() => {
    try {
      setNotes(JSON.parse(localStorage.getItem(KEY) || '[]') as Note[]);
    } catch {
      setNotes([]);
    }
  }, []);

  const save = () => {
    if (!editing?.title.trim()) return;
    const next = notes.some(note => note.id === editing.id)
      ? notes.map(note => note.id === editing.id ? editing : note)
      : [editing, ...notes];
    setNotes(next);
    localStorage.setItem(KEY, JSON.stringify(next));
    setEditing(null);
  };

  const remove = (id: string) => {
    const next = notes.filter(note => note.id !== id);
    setNotes(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden" style={{ background: 'var(--screen, #fff)', color: 'var(--ink, #242323)' }}>
      <div className="px-5 pt-12 pb-3.5 border-b border-[#ddd6cd] bg-white/90 backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('home')} className="w-8 h-8 rounded-full bg-neutral-100 border border-neutral-200 grid place-items-center"><ArrowLeft className="w-4 h-4" /></button>
          <div><div className="text-[8px] font-mono tracking-[2px] text-[#817a72]">NOTES</div><h2 className="font-serif font-bold text-[16px]">备忘录</h2></div>
        </div>
        <button onClick={() => setEditing({ id: `note-${Date.now()}`, title: '', content: '', date: new Date().toISOString().slice(0, 10) })} className="h-8 px-3 rounded-full bg-[#292724] text-white text-[10px] flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> 新建</button>
      </div>
      <div className="relative z-10 flex-1 overflow-y-auto p-4 no-scrollbar">
        {notes.length === 0 ? (
          <div className="h-full min-h-[520px] flex items-center justify-center">
            <div className="w-full rounded-[24px] border border-dashed border-[#d4cbbf] bg-[#f7f3ec]/70 p-6 text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-white border border-[#e2ddd5] grid place-items-center text-[#8b7560]"><FileText className="w-6 h-6 stroke-[1.4]" /></div>
              <div className="mt-4 font-serif font-bold text-[17px]">没有备忘录</div>
              <div className="mt-2 text-[10px] text-[#8b8782]">这里不会放入任何示例笔记。<br />所有内容由你自己创建。</div>
              <button onClick={() => setEditing({ id: `note-${Date.now()}`, title: '', content: '', date: new Date().toISOString().slice(0, 10) })} className="mt-5 h-10 px-5 rounded-full bg-[#292724] text-white text-[11px]">写第一条</button>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {notes.map(note => (
              <div key={note.id} className="rounded-[20px] border border-[#ded7cd] bg-white/80 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <button onClick={() => setEditing(note)} className="flex-1 text-left min-w-0">
                    <div className="text-[12px] font-semibold truncate">{note.title}</div>
                    <div className="mt-1 text-[8px] font-mono text-[#8b8782]">{note.date}</div>
                  </button>
                  <button onClick={() => remove(note.id)} className="w-7 h-7 rounded-full bg-[#f5ece8] text-[#9b625b] grid place-items-center"><Trash2 className="w-3 h-3" /></button>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-[#6f6a63] whitespace-pre-wrap line-clamp-4">{note.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <div className="absolute inset-0 z-50 bg-black/25 backdrop-blur-sm flex items-end">
          <div className="w-full rounded-t-[28px] bg-[#f4f0e9] p-5 pb-7">
            <div className="flex items-center justify-between"><h3 className="font-serif font-bold text-[16px]">编辑备忘录</h3><button onClick={() => setEditing(null)} className="text-[#8b8782]">×</button></div>
            <input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="标题" className="mt-4 w-full h-10 rounded-xl border border-[#d8d0c5] bg-white px-3 text-[11px]" />
            <textarea value={editing.content} onChange={e => setEditing({ ...editing, content: e.target.value })} rows={7} placeholder="写下你的内容……" className="mt-2 w-full rounded-xl border border-[#d8d0c5] bg-white p-3 text-[11px] resize-none" />
            <button onClick={save} disabled={!editing.title.trim()} className="mt-3 w-full h-10 rounded-xl bg-[#292724] text-white text-[11px] disabled:opacity-35">保存</button>
          </div>
        </div>
      )}
    </div>
  );
}
