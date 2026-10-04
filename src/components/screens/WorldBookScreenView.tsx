import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Download, FilePlus2, Plus, Save, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { ScreenType, WorldBook, WorldBookEntry } from '../../types';
import { usePersistentState } from '../../store/usePersistentState';
import { exportSillyTavernWorldBook, importWorldBooks } from '../../store/worldbookFormats';

const starterBook: WorldBook = {
  id: 'worldbook-template',
  name: '新世界书',
  description: '',
  enabled: true,
  updatedAt: new Date().toISOString(),
  entries: [],
};

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function createEntry(): WorldBookEntry {
  return {
    id: `entry-${Date.now()}`,
    name: '新条目',
    keywords: [],
    content: '',
    enabled: true,
    priority: 10,
    weight: 100,
    insertion: 'before',
    depth: 0,
  };
}

export function WorldBookScreenView({ onNavigate }: { onNavigate: (screen: ScreenType) => void }) {
  const importRef = useRef<HTMLInputElement>(null);
  const [books, setBooks] = usePersistentState<WorldBook[]>('phone:worldbooks', []);
  const [selectedBookId, setSelectedBookId] = useState(books[0]?.id || '');
  const [selectedEntryId, setSelectedEntryId] = useState(books[0]?.entries[0]?.id || '');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');

  const book = books.find(item => item.id === selectedBookId) || books[0] || null;
  const selectedEntry = book?.entries.find(item => item.id === selectedEntryId) || book?.entries[0] || null;

  const filteredEntries = useMemo(() => {
    if (!book) return [];
    const q = search.trim().toLowerCase();
    if (!q) return book.entries;
    return book.entries.filter(entry =>
      entry.name.toLowerCase().includes(q) ||
      entry.keywords.some(keyword => keyword.toLowerCase().includes(q))
    );
  }, [book, search]);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 1800);
  };

  const patchBook = (patch: Partial<WorldBook>) => {
    if (!book) return;
    setBooks(prev => prev.map(item =>
      item.id === book.id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item
    ));
  };

  const patchEntry = (patch: Partial<WorldBookEntry>) => {
    if (!book || !selectedEntry) return;
    patchBook({
      entries: book.entries.map(entry =>
        entry.id === selectedEntry.id ? { ...entry, ...patch } : entry
      ),
    });
  };

  const addBook = () => {
    const id = `worldbook-${Date.now()}`;
    const next: WorldBook = {
      ...starterBook,
      id,
      name: '新世界书',
      description: '',
      entries: [],
      updatedAt: new Date().toISOString(),
    };
    setBooks(prev => [next, ...prev]);
    setSelectedBookId(id);
    setSelectedEntryId('');
    showNotice('已创建世界书');
  };

  const addEntry = () => {
    if (!book) return;
    const entry = createEntry();
    patchBook({ entries: [...book.entries, entry] });
    setSelectedEntryId(entry.id);
    showNotice('已新增条目');
  };

  const removeEntry = () => {
    if (!book || !selectedEntry) return;
    const nextEntries = book.entries.filter(entry => entry.id !== selectedEntry.id);
    patchBook({ entries: nextEntries });
    setSelectedEntryId(nextEntries[0]?.id || '');
    showNotice('条目已删除');
  };

  const removeBook = () => {
    if (!book) return;
    const next = books.filter(item => item.id !== book.id);
    setBooks(next);
    setSelectedBookId(next[0]?.id || '');
    setSelectedEntryId(next[0]?.entries[0]?.id || '');
    showNotice('世界书已删除');
  };

  const importBook = async (file?: File) => {
    if (!file) return;
    try {
      const incoming = importWorldBooks(await file.text());
      setBooks(prev => [...incoming, ...prev.filter(existing => !incoming.some(item => item.id === existing.id))]);
      setSelectedBookId(incoming[0]?.id || '');
      setSelectedEntryId(incoming[0]?.entries?.[0]?.id || '');
      showNotice(`已导入 ${incoming.length} 本世界书（JSON / YAML）`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : '世界书解析失败');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
      <div className="absolute inset-0 opacity-15 bg-paper-noise pointer-events-none" />

      <header className="relative z-10 px-5 pt-12 pb-3.5 border-b border-[rgba(40,36,31,.12)] bg-[rgba(247,244,238,.85)] backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('home')}
            className="w-8 h-8 rounded-full bg-white/40 border border-white/60 grid place-items-center text-xs text-[#242323]"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="text-[8px] font-mono tracking-[2px] text-[#817a72] uppercase">LOREBOOK ARCHIVE · CONTEXT RULES</div>
            <h2 className="font-serif font-bold text-base tracking-tight text-[#242323]">世界书 · Lorebook</h2>
          </div>
        </div>
        <button onClick={addBook} className="w-8 h-8 rounded-full bg-[#292724] text-white grid place-items-center">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </header>

      <div className="relative z-10 flex-1 overflow-hidden grid grid-rows-[auto_1fr]">
        <div className="p-4 pb-2 flex items-center gap-2">
          <select
            value={book?.id || ''}
            onChange={e => {
              const next = books.find(item => item.id === e.target.value);
              setSelectedBookId(e.target.value);
              setSelectedEntryId(next?.entries[0]?.id || '');
            }}
            className="flex-1 bg-[#ebe7df] border border-[rgba(40,36,31,.12)] rounded-xl px-3 py-2 text-xs text-[#242323] outline-none"
          >
            {books.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <button
            onClick={() => book && setBooks(prev => prev.map(item => item.id === book.id ? { ...item, enabled: !item.enabled, updatedAt: new Date().toISOString() } : item))}
            className="px-3 py-2 rounded-xl bg-white/65 border border-[rgba(40,36,31,.12)] text-[10px] text-[#6d665f]"
          >
            {book?.enabled ? '已启用' : '已停用'}
          </button>
        </div>

        <div className="min-h-0 px-4 pb-4 grid grid-rows-[auto_1fr] gap-2">
          <div className="flex gap-2 items-center">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索条目 / 关键词"
              className="flex-1 bg-white/60 border border-[rgba(40,36,31,.12)] rounded-xl px-3 py-2 text-xs outline-none text-[#444]"
            />
            <button onClick={() => importRef.current?.click()} className="px-3 py-2 rounded-xl bg-[#ebe7df] border border-[rgba(40,36,31,.12)] text-[10px] text-[#5d5751]">
              导入
            </button>
            <button
              onClick={() => book && downloadJson(`${book.name}.json`, book)}
              className="px-3 py-2 rounded-xl bg-[#ebe7df] border border-[rgba(40,36,31,.12)] text-[10px] text-[#5d5751]"
            >
              <Download className="w-3 h-3 inline mr-1" />导出
            </button>
            <button
              onClick={() => book && downloadJson(`${book.name}-st.json`, JSON.parse(exportSillyTavernWorldBook(book)))}
              className="px-3 py-2 rounded-xl bg-[#ebe7df] border border-[rgba(40,36,31,.12)] text-[10px] text-[#5d5751]"
              title="导出 SillyTavern 格式"
            >ST</button>
            <input ref={importRef} type="file" accept=".json,.yaml,.yml" className="hidden" onChange={e => importBook(e.target.files?.[0])} />
          </div>

          <div className="min-h-0 grid grid-cols-[112px_1fr] gap-2">
            <div className="min-h-0 overflow-y-auto no-scrollbar space-y-1.5">
              {filteredEntries.map(entry => (
                <button
                  key={entry.id}
                  onClick={() => setSelectedEntryId(entry.id)}
                  className={`w-full text-left p-2.5 rounded-xl border transition-all ${
                    selectedEntry?.id === entry.id
                      ? 'bg-[#292724] text-white border-[#292724]'
                      : 'bg-white/55 text-[#5e5852] border-[rgba(40,36,31,.12)]'
                  }`}
                >
                  <div className="text-[10px] font-semibold truncate">{entry.name}</div>
                  <div className="mt-1 text-[8px] font-mono opacity-70">{entry.priority} · {entry.keywords.length} key</div>
                </button>
              ))}
              <button onClick={addEntry} className="w-full p-2.5 rounded-xl border border-dashed border-[#8b7560]/40 text-[10px] text-[#8b7560]">
                ＋ 新条目
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto no-scrollbar">
              {selectedEntry ? (
                <div className="rounded-2xl bg-[#ebe7df] border border-[rgba(40,36,31,.12)] p-3 space-y-3">
                  <input
                    value={selectedEntry.name}
                    onChange={e => patchEntry({ name: e.target.value })}
                    className="w-full bg-white/70 rounded-xl px-3 py-2 text-sm font-serif font-bold outline-none text-[#242323]"
                  />
                  <div>
                    <label className="text-[8px] font-mono text-[#8b8782]">KEYWORDS</label>
                    <input
                      value={selectedEntry.keywords.join(', ')}
                      onChange={e => patchEntry({ keywords: e.target.value.split(',').map(v => v.trim()).filter(Boolean) })}
                      className="w-full mt-1 bg-white/65 border border-[rgba(40,36,31,.1)] rounded-xl px-3 py-2 text-[10px] outline-none"
                      placeholder="人物, 地点, 物件"
                    />
                  </div>
                  <div>
                    <label className="text-[8px] font-mono text-[#8b8782]">CONTENT</label>
                    <textarea
                      value={selectedEntry.content}
                      onChange={e => patchEntry({ content: e.target.value })}
                      className="w-full mt-1 h-[190px] bg-white/65 border border-[rgba(40,36,31,.1)] rounded-xl p-3 text-[10.5px] leading-relaxed outline-none resize-none"
                      placeholder="世界规则 / 触发内容 / 人物设定……"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="bg-white/55 rounded-xl p-2 text-[9px]">
                      Priority
                      <input type="number" value={selectedEntry.priority} onChange={e => patchEntry({ priority: Number(e.target.value) || 0 })} className="w-full mt-1 bg-transparent outline-none font-mono text-xs" />
                    </label>
                    <label className="bg-white/55 rounded-xl p-2 text-[9px]">
                      Weight
                      <input type="number" value={selectedEntry.weight} onChange={e => patchEntry({ weight: Number(e.target.value) || 0 })} className="w-full mt-1 bg-transparent outline-none font-mono text-xs" />
                    </label>
                    <label className="bg-white/55 rounded-xl p-2 text-[9px]">
                      Insertion
                      <select value={selectedEntry.insertion} onChange={e => patchEntry({ insertion: e.target.value as WorldBookEntry['insertion'] })} className="w-full mt-1 bg-transparent outline-none text-xs">
                        <option value="before">Before</option>
                        <option value="after">After</option>
                        <option value="depth">Depth</option>
                      </select>
                    </label>
                    <label className="bg-white/55 rounded-xl p-2 text-[9px]">
                      Depth
                      <input type="number" value={selectedEntry.depth} onChange={e => patchEntry({ depth: Number(e.target.value) || 0 })} className="w-full mt-1 bg-transparent outline-none font-mono text-xs" />
                    </label>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <button
                      onClick={() => patchEntry({ enabled: !selectedEntry.enabled })}
                      className="inline-flex items-center gap-1.5 text-[10px] text-[#655f59]"
                    >
                      {selectedEntry.enabled ? <ToggleRight className="w-4 h-4 text-[#8b7560]" /> : <ToggleLeft className="w-4 h-4" />}
                      条目 {selectedEntry.enabled ? '启用' : '停用'}
                    </button>
                    <button onClick={removeEntry} className="inline-flex items-center gap-1.5 text-[10px] text-[#9b625b]">
                      <Trash2 className="w-3.5 h-3.5" />删除条目
                    </button>
                  </div>
                </div>
              ) : (
                <div className="h-full rounded-2xl bg-white/45 border border-dashed border-[rgba(40,36,31,.18)] grid place-items-center text-center p-4 text-[#8b8782]">
                  <BookOpen className="w-8 h-8 mb-2 mx-auto" />
                  <div className="text-xs">还没有条目</div>
                  <button onClick={addEntry} className="mt-2 text-[10px] text-[#8b7560]">创建第一条</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {book && books.length > 1 && (
        <button
          onClick={removeBook}
          className="absolute z-30 right-4 bottom-12 px-3 py-1.5 rounded-full bg-[#292724] text-white text-[9px]"
        >
          删除当前世界书
        </button>
      )}

      {notice && (
        <div className="absolute z-50 left-1/2 -translate-x-1/2 bottom-16 bg-[#292724] text-white px-3.5 py-2 rounded-full text-[10px]">
          {notice}
        </div>
      )}
    </div>
  );
}
