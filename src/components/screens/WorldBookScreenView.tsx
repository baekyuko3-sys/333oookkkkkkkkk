import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Download, Plus, Trash2, ToggleLeft, ToggleRight, Settings2, ChevronDown, ChevronUp } from 'lucide-react';
import { ScreenType, WorldBook, WorldBookEntry } from '../../types';
import { usePersistentState } from '../../store/usePersistentState';
import { exportNativeWorldBook, exportSillyTavernWorldBook, importWorldBooks } from '../../store/worldbookFormats';

const starterBook: WorldBook = {
  id: 'worldbook-template',
  name: '新世界书',
  description: '',
  category: '未分类',
  tags: [],
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
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [notice, setNotice] = useState('');
  const [manageBooks, setManageBooks] = useState(false);
  const [bookInfoOpen, setBookInfoOpen] = useState(true);

  const book = books.find(item => item.id === selectedBookId) || books[0] || null;
  const selectedEntry = book?.entries.find(item => item.id === selectedEntryId) || book?.entries[0] || null;

  const filteredEntries = useMemo(() => {
    if (!book) return [];
    const q = search.trim().toLowerCase();
    return book.entries.filter(entry =>
      (!q ||
        entry.name.toLowerCase().includes(q) ||
        entry.keywords.some(keyword => keyword.toLowerCase().includes(q)) ||
        entry.content.toLowerCase().includes(q)) &&
      (categoryFilter === 'all' || (book.category || '未分类') === categoryFilter)
    );
  }, [book, search, categoryFilter]);

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
      category: '未分类',
      tags: [],
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

  const removeBook = (bookId = book?.id) => {
    if (!bookId) return;
    const target = books.find(item => item.id === bookId);
    if (!target) return;
    if (!window.confirm(`删除世界书「${target.name}」？其中 ${target.entries.length} 条世界设定也会一起删除。`)) return;
    const next = books.filter(item => item.id !== bookId);
    setBooks(next);
    if (selectedBookId === bookId) {
      setSelectedBookId(next[0]?.id || '');
      setSelectedEntryId(next[0]?.entries[0]?.id || '');
    }
    showNotice('世界书已删除');
  };

  const importBook = async (file?: File) => {
    if (!file) return;
    try {
      const normalized = importWorldBooks(await file.text());
      setBooks(prev => [
        ...normalized,
        ...prev.filter(existing => !normalized.some(item => item.id === existing.id)),
      ]);
      setSelectedBookId(normalized[0]?.id || '');
      setSelectedEntryId(normalized[0]?.entries?.[0]?.id || '');
      showNotice(`已识别并导入 ${normalized.length} 本世界书`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : '世界书导入失败');
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
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-[8px] tracking-[1.8px] font-mono text-[#8b847d]">LOREBOOK ARCHIVE</div>
              <div className="mt-1 text-sm font-serif font-bold text-[#302d29]">我的世界书</div>
            </div>
            <button
              onClick={() => setManageBooks(value => !value)}
              className={`px-3 py-1.5 rounded-full border text-[9px] inline-flex items-center gap-1.5 ${manageBooks ? 'bg-[#292724] text-white border-[#292724]' : 'bg-white/65 text-[#655f59] border-[rgba(40,36,31,.12)]'}`}
            >
              <Settings2 className="w-3 h-3" />{manageBooks ? '完成管理' : '管理'}
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {books.map(item => (
              <div key={item.id} className={`shrink-0 w-[145px] rounded-2xl border p-3 transition-all ${item.id === book?.id ? 'bg-[#292724] text-white border-[#292724]' : 'bg-white/60 text-[#4f4943] border-[rgba(40,36,31,.12)]'}`}>
                <button
                  onClick={() => { setSelectedBookId(item.id); setSelectedEntryId(item.entries[0]?.id || ''); setManageBooks(false); }}
                  className="w-full text-left"
                >
                  <div className="text-[11px] font-serif font-bold truncate">{item.name || '未命名世界书'}</div>
                  <div className={`mt-1 text-[8px] ${item.id === book?.id ? 'text-white/65' : 'text-[#918980]'}`}>
                    {item.entries.length} 条设定 · {item.enabled ? '启用' : '停用'}
                  </div>
                  {item.sourceType === 'character-card' && (
                    <div className={`mt-1.5 text-[7px] truncate ${item.id === book?.id ? 'text-white/55' : 'text-[#9b625b]'}`}>
                      来自角色卡 · {item.sourceCharacterName || '角色'}
                    </div>
                  )}
                </button>
                {manageBooks && (
                  <div className="mt-2 pt-2 border-t border-white/15 flex items-center justify-between">
                    <button
                      onClick={() => setBooks(prev => prev.map(bookItem => bookItem.id === item.id ? { ...bookItem, enabled: !bookItem.enabled, updatedAt: new Date().toISOString() } : bookItem))}
                      className="text-[8px] opacity-80"
                    >
                      {item.enabled ? '停用' : '启用'}
                    </button>
                    <button onClick={() => removeBook(item.id)} className="text-[8px] text-[#e3aaa2]">删除</button>
                  </div>
                )}
              </div>
            ))}
            {books.length === 0 && (
              <div className="w-full py-5 text-center rounded-2xl border border-dashed border-[rgba(40,36,31,.18)] text-[9px] text-[#8b847d]">
                还没有世界书 · 可以从角色卡自动导入，或右上角 ＋ 新建
              </div>
            )}
          </div>
        </div>

        <div className="px-4 pb-2">
          <button
            onClick={() => setBookInfoOpen(value => !value)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white/55 border border-[rgba(40,36,31,.1)] text-[9px] text-[#6d665f]"
          >
            <span className="inline-flex items-center gap-1.5"><BookOpen className="w-3 h-3" />世界书信息</span>
            {bookInfoOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {bookInfoOpen && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="p-2 rounded-xl bg-white/55 border border-[rgba(40,36,31,.1)] text-[8px] font-mono text-[#8b8782]">
            RESOURCE NAME
            <input
              value={book?.name || ''}
              onChange={e => patchBook({ name: e.target.value })}
              className="w-full mt-1 bg-transparent text-[10px] font-serif font-semibold text-[#242323] outline-none"
              placeholder="世界书名称"
            />
          </label>
          <label className="p-2 rounded-xl bg-white/55 border border-[rgba(40,36,31,.1)] text-[8px] font-mono text-[#8b8782]">
            CATEGORY
            <input
              value={book?.category || ''}
              onChange={e => patchBook({ category: e.target.value })}
              className="w-full mt-1 bg-transparent text-[10px] text-[#444] outline-none"
              placeholder="人物 / 世界 / 剧情"
            />
          </label>
          <label className="col-span-2 p-2 rounded-xl bg-white/55 border border-[rgba(40,36,31,.1)] text-[8px] font-mono text-[#8b8782]">
            DESCRIPTION · TAGS
            <input
              value={book ? (book.description || '') + (book.tags?.length ? ' · ' + book.tags.join(', ') : '') : ''}
              onChange={e => {
                const [description, ...tags] = e.target.value.split('·');
                patchBook({
                  description: description.trim(),
                  tags: tags.join('·').split(',').map(v => v.trim()).filter(Boolean),
                });
              }}
              className="w-full mt-1 bg-transparent text-[9px] text-[#444] outline-none"
              placeholder="描述 · tag1, tag2"
            />
              </label>
            </div>
          )}
        </div>

        <div className="min-h-0 px-4 pb-4 grid grid-rows-[auto_1fr] gap-2">
          <div className="flex gap-2 items-center">
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="w-[86px] bg-white/60 border border-[rgba(40,36,31,.12)] rounded-xl px-2 py-2 text-[9px] outline-none text-[#444]"
            >
              <option value="all">全部资源</option>
              {[...new Set(books.map(item => item.category || '未分类'))].map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
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
              onClick={() => book && downloadJson(`${book.name}.json`, JSON.parse(exportNativeWorldBook(book)))}
              className="px-3 py-2 rounded-xl bg-[#ebe7df] border border-[rgba(40,36,31,.12)] text-[10px] text-[#5d5751]"
            >
              <Download className="w-3 h-3 inline mr-1" />导出
            </button>
            <button
              onClick={() => book && downloadJson(`${book.name}-tavern.json`, JSON.parse(exportSillyTavernWorldBook(book)))}
              className="px-3 py-2 rounded-xl bg-[#292724] text-white text-[10px]"
              title="导出为 SillyTavern World Info 格式"
            >
              Tavern
            </button>
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
                  <div className="p-2.5 rounded-xl bg-white/50 border border-black/5 space-y-2">
                    <div className="text-[8px] font-mono tracking-[1.2px] text-[#8b8782]">ADVANCED TRIGGERS</div>
                    <label className="text-[9px] block">
                      Secondary Keys
                      <input
                        value={(selectedEntry.secondaryKeywords || []).join(', ')}
                        onChange={e => patchEntry({ secondaryKeywords: e.target.value.split(',').map(v => v.trim()).filter(Boolean) })}
                        className="w-full mt-1 bg-white/70 border border-[rgba(40,36,31,.1)] rounded-xl px-2.5 py-2 text-[9px] outline-none"
                        placeholder="可选：额外条件关键词"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="bg-white/55 rounded-xl p-2 text-[9px]">
                        Probability %
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={selectedEntry.probability ?? 100}
                          onChange={e => patchEntry({ probability: Math.max(0, Math.min(100, Number(e.target.value) || 0)), useProbability: true })}
                          className="w-full mt-1 bg-transparent outline-none font-mono text-xs"
                        />
                      </label>
                      <label className="bg-white/55 rounded-xl p-2 text-[9px]">
                        Scan Depth
                        <input
                          type="number"
                          min="0"
                          max="50"
                          value={selectedEntry.scanDepth ?? 0}
                          onChange={e => patchEntry({ scanDepth: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })}
                          className="w-full mt-1 bg-transparent outline-none font-mono text-xs"
                        />
                      </label>
                    </div>
                    <label className="flex items-center justify-between text-[9px] py-1">
                      <span>Constant · 常驻</span>
                      <input type="checkbox" checked={Boolean(selectedEntry.constant)} onChange={e => patchEntry({ constant: e.target.checked })} />
                    </label>
                    <label className="flex items-center justify-between text-[9px] py-1">
                      <span>Selective · 使用 Secondary Keys</span>
                      <input type="checkbox" checked={Boolean(selectedEntry.selective)} onChange={e => patchEntry({ selective: e.target.checked })} />
                    </label>
                    <label className="flex items-center justify-between text-[9px] py-1">
                      <span>Case Sensitive · 区分大小写</span>
                      <input type="checkbox" checked={Boolean(selectedEntry.caseSensitive)} onChange={e => patchEntry({ caseSensitive: e.target.checked })} />
                    </label>
                    <label className="flex items-center justify-between text-[9px] py-1">
                      <span>Whole Words · 完整单词</span>
                      <input type="checkbox" checked={Boolean(selectedEntry.matchWholeWords)} onChange={e => patchEntry({ matchWholeWords: e.target.checked })} />
                    </label>
                    {selectedEntry.selective && (
                      <label className="text-[9px] block">
                        Selective Logic
                        <select
                          value={selectedEntry.selectiveLogic ?? 0}
                          onChange={e => patchEntry({ selectiveLogic: Number(e.target.value) as 0 | 1 | 2 | 3 })}
                          className="w-full mt-1 bg-white/70 rounded-xl px-2.5 py-2 text-[9px] outline-none"
                        >
                          <option value="0">AND ANY</option>
                          <option value="1">NOT ALL</option>
                          <option value="2">NOT ANY</option>
                          <option value="3">AND ALL</option>
                        </select>
                      </label>
                    )}
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="bg-white/55 rounded-xl p-2 text-[9px]">
                        Role · Depth
                        <select
                          value={selectedEntry.role || 'system'}
                          onChange={e => patchEntry({ role: e.target.value as WorldBookEntry['role'] })}
                          className="w-full mt-1 bg-transparent outline-none text-[9px]"
                        >
                          <option value="system">SYSTEM</option>
                          <option value="user">USER</option>
                          <option value="assistant">ASSISTANT</option>
                        </select>
                      </label>
                      <label className="bg-white/55 rounded-xl p-2 text-[9px]">
                        Group
                        <input
                          value={selectedEntry.group || ''}
                          onChange={e => patchEntry({ group: e.target.value })}
                          className="w-full mt-1 bg-transparent outline-none text-[9px]"
                          placeholder="例如：school"
                        />
                      </label>
                      <label className="bg-white/55 rounded-xl p-2 text-[9px]">
                        Group Weight
                        <input
                          type="number"
                          min="0"
                          value={selectedEntry.groupWeight ?? 100}
                          onChange={e => patchEntry({ groupWeight: Math.max(0, Number(e.target.value) || 0) })}
                          className="w-full mt-1 bg-transparent outline-none font-mono text-[9px]"
                        />
                      </label>
                      <label className="bg-white/55 rounded-xl p-2 text-[9px]">
                        Outlet
                        <input
                          value={selectedEntry.outletName || ''}
                          onChange={e => patchEntry({ outletName: e.target.value })}
                          className="w-full mt-1 bg-transparent outline-none text-[9px]"
                          placeholder="可选"
                        />
                      </label>
                    </div>
                    <label className="flex items-center justify-between text-[9px] py-1">
                      <span>Prevent Recursion · 阻止继续递归</span>
                      <input type="checkbox" checked={Boolean(selectedEntry.preventRecursion)} onChange={e => patchEntry({ preventRecursion: e.target.checked })} />
                    </label>
                    <label className="flex items-center justify-between text-[9px] py-1">
                      <span>Exclude Recursion · 不被递归触发</span>
                      <input type="checkbox" checked={Boolean(selectedEntry.excludeRecursion)} onChange={e => patchEntry({ excludeRecursion: e.target.checked })} />
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
