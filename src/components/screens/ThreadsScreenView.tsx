import { useState } from 'react';
import { ArrowLeft, Heart, MessageCircle, Repeat2, Send, Share } from 'lucide-react';
import { ScreenType } from '../../types';

interface ThreadsScreenViewProps {
  onNavigate: (screen: ScreenType) => void;
}

export function ThreadsScreenView({ onNavigate }: ThreadsScreenViewProps) {
  const [threads, setThreads] = useState<any[]>([]);

  const [inputPost, setInputPost] = useState('');

  const toggleLike = (id: string) => {
    setThreads(prev => prev.map(t => {
      if (t.id === id) {
        return {
          ...t,
          isLiked: !t.isLiked,
          likes: t.isLiked ? t.likes - 1 : t.likes + 1,
        };
      }
      return t;
    }));
  };

  const handlePost = () => {
    if (!inputPost.trim()) return;
    const newThread = {
      id: `t-${Date.now()}`,
      author: 'Sane333',
      handle: '@sane_private',
      time: '刚刚',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      content: inputPost.trim(),
      likes: 0,
      replies: 0,
      isLiked: false,
    };
    setThreads([newThread, ...threads]);
    setInputPost('');
  };

  return (
    <div 
      className="relative w-full h-full flex flex-col justify-between select-none overflow-hidden"
      style={{ background: 'var(--screen, #ffffff)', color: 'var(--ink, #242323)' }}
    >
      {/* Background paper texture */}
      <div className="absolute inset-0 opacity-[0.03] bg-paper-noise pointer-events-none" />

      {/* Top Header */}
      <div className="relative z-10 px-5 pt-12 pb-3.5 border-b border-neutral-200/80 bg-white/90 backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => onNavigate('home')}
            className="w-8 h-8 rounded-full bg-neutral-100 border border-neutral-200 backdrop-blur-md grid place-items-center text-xs hover:bg-neutral-200 active:scale-95 transition-all text-[#1a1a1a]"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-sm font-bold tracking-tight text-[#1a1a1a]">
                Threads
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-100 text-[#8e8b86] font-mono border border-neutral-200">
                ENCRYPTED FEED
              </span>
            </div>
            <div className="text-[9px] text-[#8e8b86] font-mono tracking-wider mt-0.5">
              VOL.08 · PRIVATE THREADS
            </div>
          </div>
        </div>

        <div className="w-7 h-7 rounded-full bg-[#1a1a1a] text-white grid place-items-center text-xs font-mono font-bold">
          @
        </div>
      </div>

      {/* Threads Feed Scroll Area */}
      <div className="relative z-10 flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar text-xs">
        
        {/* Post creation box */}
        <div className="p-3.5 rounded-2xl bg-neutral-50/80 border border-neutral-200/80 space-y-2">
          <div className="flex gap-2.5 items-start">
            <div className="w-7 h-7 rounded-full bg-neutral-800 text-white grid place-items-center text-[10px] font-mono shrink-0">
              S
            </div>
            <textarea
              value={inputPost}
              onChange={(e) => setInputPost(e.target.value)}
              placeholder="分享一句只留给风听的随笔..."
              rows={2}
              className="flex-1 bg-transparent border-0 outline-none text-xs text-[#1a1a1a] placeholder-[#8e8b86] font-serif-sc resize-none"
            />
          </div>
          {inputPost.trim() && (
            <div className="flex justify-end pt-1">
              <button
                onClick={handlePost}
                className="px-3 py-1 rounded-full bg-[#1a1a1a] text-white text-[11px] font-medium hover:bg-neutral-800 transition-colors"
              >
                发布 Thread
              </button>
            </div>
          )}
        </div>

        {/* Feed List */}
        {threads.map((item) => (
          <div
            key={item.id}
            className="p-4 rounded-2xl bg-white border border-neutral-200/80 shadow-[0_4px_16px_rgba(0,0,0,.03)] space-y-2.5"
          >
            {/* Author */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full overflow-hidden border border-neutral-200 shrink-0">
                  <img
                    src={item.avatar}
                    alt={item.author}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-serif font-bold text-xs text-[#1a1a1a]">{item.author}</span>
                    <span className="text-[10px] text-[#8e8b86] font-mono">{item.handle}</span>
                  </div>
                  <div className="text-[9px] text-[#8e8b86] font-mono">{item.time}</div>
                </div>
              </div>

              <span className="text-[8px] font-mono text-[#8b7560] bg-[#fbf9f5] px-2 py-0.5 rounded border border-[#8b7560]/20">
                INNER CIRCLE
              </span>
            </div>

            {/* Prose Content */}
            <p className="font-serif-sc text-xs leading-relaxed text-[#3a3734] pt-0.5">
              {item.content}
            </p>

            {/* Actions */}
            <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-[11px] text-[#8e8b86]">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => toggleLike(item.id)}
                  className={`flex items-center gap-1.5 transition-colors ${
                    item.isLiked ? 'text-[#9b625b]' : 'hover:text-[#1a1a1a]'
                  }`}
                >
                  <Heart className={`w-3.5 h-3.5 ${item.isLiked ? 'fill-current' : ''}`} />
                  <span className="font-mono text-[10px]">{item.likes}</span>
                </button>
                <button className="flex items-center gap-1.5 hover:text-[#1a1a1a] transition-colors">
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span className="font-mono text-[10px]">{item.replies}</span>
                </button>
                <button className="flex items-center gap-1.5 hover:text-[#1a1a1a] transition-colors">
                  <Repeat2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <button className="hover:text-[#1a1a1a] transition-colors">
                <Share className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}

      </div>

      {/* Footer */}
      <div className="p-3 text-center text-[9px] text-[#8e8b86] font-mono border-t border-neutral-200/80">
        ENCRYPTED THREAD PROTOCOL · SANE333 EDITION
      </div>
    </div>
  );
}
