import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, Plus, Trash2, X } from 'lucide-react';
import { ScreenType } from '../../types';

interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  note: string;
}

const KEY = 'phone:calendar-events';

export function CalendarScreenView({ onNavigate }: { onNavigate: (screen: ScreenType) => void }) {
  const today = new Date();
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [draftDate, setDraftDate] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftNote, setDraftNote] = useState('');

  useEffect(() => {
    try {
      setEvents(JSON.parse(localStorage.getItem(KEY) || '[]') as CalendarEvent[]);
    } catch {
      setEvents([]);
    }
  }, []);

  const save = (next: CalendarEvent[]) => {
    setEvents(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  const days = useMemo(() => {
    const start = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array(start).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  }, [month]);

  const monthLabel = month.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' });

  const dateKey = (day: number) => {
    const m = String(month.getMonth() + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${month.getFullYear()}-${m}-${d}`;
  };

  const addEvent = () => {
    if (!draftDate || !draftTitle.trim()) return;
    const event: CalendarEvent = { id: `event-${Date.now()}`, date: draftDate, title: draftTitle.trim(), note: draftNote.trim() };
    save([event, ...events]);
    setDraftDate(null);
    setDraftTitle('');
    setDraftNote('');
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden" style={{ background: 'var(--screen)', color: 'var(--ink)' }}>
      <div className="px-5 pt-12 pb-3.5 border-b border-[#ddd6cd] bg-white/90 backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('home')} className="w-8 h-8 rounded-full bg-neutral-100 border border-neutral-200 grid place-items-center"><ArrowLeft className="w-4 h-4" /></button>
          <div><div className="text-[8px] font-mono tracking-[2px] text-[#817a72]">CALENDAR</div><h2 className="font-serif font-bold text-[16px]">日历</h2></div>
        </div>
        <button onClick={() => setDraftDate(dateKey(today.getDate()))} className="h-8 px-3 rounded-full bg-[#292724] text-white text-[10px] flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> 新事件</button>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto p-4 no-scrollbar">
        <div className="flex items-center justify-between">
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="text-[12px] px-2">‹</button>
          <div className="font-serif font-bold text-[15px]">{monthLabel}</div>
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="text-[12px] px-2">›</button>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[8px] font-mono text-[#8b8782]">
          {['日','一','二','三','四','五','六'].map(d => <div key={d} className="py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, index) => {
            if (!day) return <div key={index} className="h-10" />;
            const key = dateKey(day);
            const hasEvent = events.some(event => event.date === key);
            const isToday = key === dateKey(today.getDate()) && month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();
            return (
              <button key={key} onClick={() => setDraftDate(key)} className={`h-10 rounded-xl border text-[10px] relative ${isToday ? 'bg-[#292724] text-white border-[#292724]' : 'bg-white/75 border-[#e4ded5]'}`}>
                {day}
                {hasEvent && <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${isToday ? 'bg-white' : 'bg-[#8b7560]'}`} />}
              </button>
            );
          })}
        </div>

        <div className="mt-5">
          <div className="flex items-center gap-2 text-[9px] font-mono tracking-[1.5px] text-[#8b8782]"><CalendarDays className="w-3.5 h-3.5" /> EVENTS</div>
          {events.length === 0 ? (
            <div className="mt-2 rounded-[18px] border border-dashed border-[#d7cec3] p-5 text-center text-[10px] text-[#8b8782]">暂无事件。点击日期或右上角“新事件”开始添加。</div>
          ) : (
            <div className="mt-2 space-y-2">
              {events.map(event => (
                <div key={event.id} className="rounded-[16px] border border-[#ded7cd] bg-white/75 p-3 flex items-start gap-3">
                  <div className="flex-1"><div className="text-[11px] font-semibold">{event.title}</div><div className="mt-0.5 text-[8px] font-mono text-[#8b8782]">{event.date}</div>{event.note && <div className="mt-1 text-[9px] text-[#6f6a63]">{event.note}</div>}</div>
                  <button onClick={() => save(events.filter(item => item.id !== event.id))} className="w-7 h-7 rounded-full bg-[#f5efea] text-[#9b625b] grid place-items-center"><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {draftDate && (
        <div className="absolute inset-0 z-50 bg-black/25 backdrop-blur-sm flex items-end">
          <div className="w-full rounded-t-[28px] bg-[#f4f0e9] p-5 pb-7">
            <div className="flex items-center justify-between"><h3 className="font-serif font-bold text-[16px]">添加事件</h3><button onClick={() => setDraftDate(null)}><X className="w-4 h-4" /></button></div>
            <div className="mt-3 text-[9px] font-mono text-[#8b8782]">{draftDate}</div>
            <input value={draftTitle} onChange={e => setDraftTitle(e.target.value)} placeholder="事件标题" className="mt-3 w-full h-10 rounded-xl border border-[#d8d0c5] bg-white px-3 text-[11px]" />
            <textarea value={draftNote} onChange={e => setDraftNote(e.target.value)} placeholder="备注（可选）" rows={3} className="mt-2 w-full rounded-xl border border-[#d8d0c5] bg-white p-3 text-[11px] resize-none" />
            <button onClick={addEvent} className="mt-3 w-full h-10 rounded-xl bg-[#292724] text-white text-[11px]">保存事件</button>
          </div>
        </div>
      )}
    </div>
  );
}
