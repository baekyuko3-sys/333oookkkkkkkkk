import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, ChevronDown, Edit3, Plus, Trash2, X } from 'lucide-react';
import { ScreenType } from '../../types';
import {
  WorldBook,
  WorldBookEntry,
  createWorldBook,
  createWorldBookEntry,
  deleteWorldBook,
  getWorldBooks,
  upsertWorldBook,
} from '../../store/worldbook';

interface WorldBookScreenViewProps {
  onNavigate: (screen: ScreenType) => void;
}

export function WorldBookScreenView({ onNavigate }: WorldBookScreenViewProps) {
  const [books, setBooks] = useState<WorldBook[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingBook, setEditingBook] = useState(false);
  const [editingEntry, setEditingEntry] = useState<WorldBookEntry | null>(null);
  const [newBookName, setNewBookName] = useState('');
  const [bookDescription, setBookDescription] = useState('');

  useEffect(() => {
    const stored = getWorldBooks();
    setBooks(stored);
    setSelectedId(stored[0]?.id ?? null);
  }, []);

  const selectedBook = books.find(book => book.id === selectedId) ?? null;

  const refresh = (next: WorldBook[]) => {
    setBooks(next);
    if (!selectedId && next[0]) setSelectedId(next[0].id);
  };

  const handleCreateBook = () => {
    const name = window.prompt('世界书名称', '')?.trim();
    if (!name) return;
    const book = createWorldBook(name);
    upsertWorldBook(book);
    refresh(getWorldBooks());
    setSelectedId(book.id);
  };

  const handleSaveBook = () => {
    if (!selectedBook || !newBookName.trim()) return;
    const updated = {
      ...selectedBook,
      name: newBookName.trim(),
      description: bookDescription,
      updatedAt: new Date().toISOString(),
    };
    upsertWorldBook(updated);
    setBooks(getWorldBooks());
    setEditingBook(false);
  };

  const handleDeleteBook = (id: string) => {
    if (!window.confirm('删除这个世界书？其中的条目也会一起删除。')) return;
    deleteWorldBook(id);
    const next = getWorldBooks();
    setBooks(next);
    setSelectedId(next[0]?.id ?? null);
  };

  const handleNewEntry = () => {
    if (!selectedBook) return;
    setEditingEntry(createWorldBookEntry());
  };

  const handleSaveEntry = () => {
    if (!selectedBook || !editingEntry) return;
    if (!editingEntry.name.trim()) return;
    const nextEntries = selectedBook.entries.some(item => item.id === editingEntry.id)
      ? selectedBook.entries.map(item => item.id === editingEntry.id ? editingEntry : item)
      : [editingEntry, ...selectedBook.entries];
    const updated = { ...selectedBook, entries: nextEntries, updatedAt: new Date().toISOString() };
    upsertWorldBook(updated);
    setBooks(getWorldBooks());
    setEditingEntry(null);
  };

  const handleDeleteEntry = (entryId: string) => {
    if (!selectedBook) return;
    const updated = {
      ...selectedBook,
      entries: selectedBook.entries.filter(entry => entry.id !== entryId),
      updatedAt: new Date().toISOString(),
    };
    upsertWorldBook(updated);
    setBooks(getWorldBooks());
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden" style={{ background: 'var(--screen, #fff)', color: 'var(--ink, #242323)' }}>
      <div className="relative z-10 px-5 pt-12 pb-3 border-b border-[rgba(40,36,31,.12)] bg-[rgba(247,244,238,.92)] backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('home')} className="w-8 h-8 rounded-full bg-white/55 border border-white/70 grid place-items-center active:scale-95">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="text-[8px] font-mono tracking-[2px] text-[#817a72]">WORLD BOOK</div>
            <h2 className="font-serif font-bold text-[16px]">世界书</h2>
          </div>
        </div>
        <button onClick={handleCreateBook} className="h-8 px-3 rounded-full bg-[#292724] text-white text-[10px] font-medium flex items-center gap-1.5 active:scale-95">
          <Plus className="w-3.5 h-3.5" /> 新建
        </button>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
        {books.length === 0 ? (
          <div className="h-full min-h-[520px] flex items-center justify-center">
            <div className="w-full rounded-[24px] border border-dashed border-[#cfc7bb] bg-[#f7f3ec]/75 p-6 text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-white/80 border border-[#e0dbd3] grid place-items-center text-[#8b7560]">
                <BookOpen className="w-6 h-6 stroke-[1.4]" />
              </div>
              <div className="mt-4 font-serif font-bold text-[17px]">还没有世界书</div>
              <p className="mt-2 text-[11px] leading-relaxed text-[#8b8782]">
                这里是设定的容器，不会预置任何世界观。<br />你可以从零建立世界、地点、人物关系与规则。
              </p>
              <button onClick={handleCreateBook} className="mt-5 h-10 px-5 rounded-full bg-[#292724] text-white text-[11px] font-medium inline-flex items-center gap-2">
                <Plus className="w-3.5 h-3.5" /> 创建第一本世界书
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {books.map(book => (
                <button
                  key={book.id}
                  onClick={() => setSelectedId(book.id)}
                  className={`shrink-0 px-3 py-2 rounded-xl border text-left ${selectedId === book.id ? 'bg-[#292724] text-white border-[#292724]' : 'bg-white/70 border-[#ded7cd]'}`}
                >
                  <div className="text-[11px] font-semibold max-w-[120px] truncate">{book.name}</div>
                  <div className={`mt-0.5 text-[8px] font-mono ${selectedId === book.id ? 'text-white/60' : 'text-[#8b8782]'}`}>
                    {book.entries.length} ENTRIES
                  </div>
                </button>
              ))}
            </div>

            {selectedBook && (
              <div className="rounded-[22px] border border-[#ded7cd] bg-[#faf8f4]/85 p-4 shadow-[0_8px_24px_rgba(45,37,30,.05)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[8px] font-mono tracking-[1.6px] text-[#8b8782]">CURRENT WORLD</div>
                    <div className="mt-1 font-serif font-bold text-[17px] truncate">{selectedBook.name}</div>
                    <div className="mt-1 text-[10px] leading-relaxed text-[#8b8782]">{selectedBook.description || '尚未填写世界书说明。'}</div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => {
                        setNewBookName(selectedBook.name);
                        setBookDescription(selectedBook.description);
                        setEditingBook(true);
                      }}
                      className="w-8 h-8 rounded-full bg-white border border-[#e4ded5] grid place-items-center"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDeleteBook(selectedBook.id)} className="w-8 h-8 rounded-full bg-white border border-[#e4ded5] text-[#9b625b] grid place-items-center">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-mono tracking-[1.4px] text-[#8b8782]">ENTRIES</div>
                    <div className="text-[12px] font-semibold">{selectedBook.entries.length} 条设定</div>
                  </div>
                  <button onClick={handleNewEntry} className="h-9 px-3 rounded-full bg-[#292724] text-white text-[10px] flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> 添加条目
                  </button>
                </div>
              </div>
            )}

            {selectedBook?.entries.length === 0 ? (
              <div className="rounded-[20px] border border-dashed border-[#d8d0c5] p-5 text-center">
                <div className="text-[12px] font-serif font-semibold">这个世界还是空白的</div>
                <div className="mt-1.5 text-[10px] text-[#8b8782]">世界书本身已经建立，现在可以添加第一条设定。</div>
              </div>
            ) : (
              <div className="space-y-2">
                {selectedBook?.entries.map(entry => (
                  <div key={entry.id} className="rounded-[19px] border border-[#ded7cd] bg-white/80 p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-[12px] truncate">{entry.name}</div>
                        <div className="mt-1 text-[9px] text-[#8b8782] font-mono truncate">{entry.keys.join(' · ') || 'NO KEYWORDS'}</div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => setEditingEntry(entry)} className="w-7 h-7 rounded-full bg-[#f6f2eb] grid place-items-center"><Edit3 className="w-3 h-3" /></button>
                        <button onClick={() => handleDeleteEntry(entry.id)} className="w-7 h-7 rounded-full bg-[#f6f2eb] text-[#9b625b] grid place-items-center"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    </div>
                    <p className="mt-2 text-[10px] leading-relaxed text-[#6f6a63] whitespace-pre-wrap line-clamp-3">{entry.content}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[8px] font-mono text-[#8b8782]">
                      <span className="px-2 py-1 rounded bg-[#f6f2eb]">P {entry.priority}</span>
                      <span className="px-2 py-1 rounded bg-[#f6f2eb]">W {entry.weight}</span>
                      <span className="px-2 py-1 rounded bg-[#f6f2eb]">{entry.insertion === 'depth' ? `DEPTH ${entry.depth ?? 4}` : entry.insertion.toUpperCase()}</span>
                      <span className={`px-2 py-1 rounded ${entry.enabled ? 'bg-[#eee8de] text-[#6c5c4d]' : 'bg-neutral-100'}`}>{entry.enabled ? 'ON' : 'OFF'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {editingBook && selectedBook && (
        <div className="absolute inset-0 z-50 bg-black/25 backdrop-blur-sm flex items-end">
          <div className="w-full rounded-t-[28px] bg-[#f4f0e9] p-5 pb-7">
            <div className="flex items-center justify-between">
              <h3 className="font-serif font-bold text-[16px]">编辑世界书</h3>
              <button onClick={() => setEditingBook(false)}><X className="w-4 h-4" /></button>
            </div>
            <label className="block mt-4 text-[9px] font-mono tracking-widest text-[#8b8782]">名称</label>
            <input value={newBookName} onChange={e => setNewBookName(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-[#d8d0c5] bg-white px-3 text-[12px] outline-none" />
            <label className="block mt-3 text-[9px] font-mono tracking-widest text-[#8b8782]">说明</label>
            <textarea value={bookDescription} onChange={e => setBookDescription(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-[#d8d0c5] bg-white p-3 text-[11px] outline-none resize-none" />
            <button onClick={handleSaveBook} className="mt-4 w-full h-10 rounded-xl bg-[#292724] text-white text-[11px] font-medium">保存</button>
          </div>
        </div>
      )}

      {editingEntry && (
        <div className="absolute inset-0 z-50 bg-black/25 backdrop-blur-sm flex items-end">
          <div className="w-full max-h-[82%] overflow-y-auto rounded-t-[28px] bg-[#f4f0e9] p-5 pb-7 no-scrollbar">
            <div className="flex items-center justify-between">
              <h3 className="font-serif font-bold text-[16px]">{selectedBook?.entries.some(item => item.id === editingEntry.id) ? '编辑条目' : '添加条目'}</h3>
              <button onClick={() => setEditingEntry(null)}><X className="w-4 h-4" /></button>
            </div>
            <label className="block mt-4 text-[9px] font-mono tracking-widest text-[#8b8782]">条目名称 *</label>
            <input value={editingEntry.name} onChange={e => setEditingEntry({ ...editingEntry, name: e.target.value })} placeholder="例如：某个地点 / 规则 / 人物关系" className="mt-1 w-full h-10 rounded-xl border border-[#d8d0c5] bg-white px-3 text-[11px] outline-none" />
            <label className="block mt-3 text-[9px] font-mono tracking-widest text-[#8b8782]">关键词</label>
            <input value={editingEntry.keys.join(', ')} onChange={e => setEditingEntry({ ...editingEntry, keys: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="关键词，逗号分隔" className="mt-1 w-full h-10 rounded-xl border border-[#d8d0c5] bg-white px-3 text-[11px] outline-none" />
            <label className="block mt-3 text-[9px] font-mono tracking-widest text-[#8b8782]">设定内容</label>
            <textarea value={editingEntry.content} onChange={e => setEditingEntry({ ...editingEntry, content: e.target.value })} rows={6} placeholder="这里填写真正要注入上下文的世界观内容。" className="mt-1 w-full rounded-xl border border-[#d8d0c5] bg-white p-3 text-[11px] outline-none resize-none" />
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div>
                <label className="block text-[9px] font-mono text-[#8b8782]">优先级</label>
                <input type="number" value={editingEntry.priority} onChange={e => setEditingEntry({ ...editingEntry, priority: Number(e.target.value) || 0 })} className="mt-1 w-full h-9 rounded-xl border border-[#d8d0c5] bg-white px-3 text-[11px]" />
              </div>
              <div>
                <label className="block text-[9px] font-mono text-[#8b8782]">权重</label>
                <input type="number" step="0.1" value={editingEntry.weight} onChange={e => setEditingEntry({ ...editingEntry, weight: Number(e.target.value) || 0 })} className="mt-1 w-full h-9 rounded-xl border border-[#d8d0c5] bg-white px-3 text-[11px]" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div>
                <label className="block text-[9px] font-mono text-[#8b8782]">插入位置</label>
                <div className="relative mt-1">
                  <select value={editingEntry.insertion} onChange={e => setEditingEntry({ ...editingEntry, insertion: e.target.value as WorldBookEntry['insertion'] })} className="appearance-none w-full h-9 rounded-xl border border-[#d8d0c5] bg-white px-3 text-[11px]">
                    <option value="before">主提示词前</option>
                    <option value="after">主提示词后</option>
                    <option value="depth">深度插入</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 pointer-events-none text-[#8b8782]" />
                </div>
              </div>
              <div>
                <label className="block text-[9px] font-mono text-[#8b8782]">深度</label>
                <input type="number" value={editingEntry.depth ?? 4} onChange={e => setEditingEntry({ ...editingEntry, depth: Number(e.target.value) || 0 })} className="mt-1 w-full h-9 rounded-xl border border-[#d8d0c5] bg-white px-3 text-[11px]" />
              </div>
            </div>
            <button
              onClick={() => setEditingEntry({ ...editingEntry, enabled: !editingEntry.enabled })}
              className={`mt-3 w-full h-9 rounded-xl border text-[10px] ${editingEntry.enabled ? 'bg-[#ece6dd] border-[#cfc4b7]' : 'bg-white border-[#ddd6cd] text-[#8b8782]'}`}
            >
              {editingEntry.enabled ? '已启用 · 点击关闭' : '已停用 · 点击启用'}
            </button>
            <button onClick={handleSaveEntry} className="mt-4 w-full h-10 rounded-xl bg-[#292724] text-white text-[11px] font-medium">保存条目</button>
          </div>
        </div>
      )}
    </div>
  );
}
