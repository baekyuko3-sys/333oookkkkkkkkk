import { ArrowLeft, Heart, MessageCircle, Share2, Camera } from 'lucide-react';
import { ScreenType } from '../../types';

interface MomentsScreenViewProps {
  themeMode?: any;
  onNavigate: (screen: ScreenType) => void;
}

export function MomentsScreenView({ onNavigate }: MomentsScreenViewProps) {
  const posts: { id: string; author: string; rollTag: string; time: string; content: string; images: string[]; likes: number; note: string }[] = [];

  return (
    <div 
      className="relative w-full h-full flex flex-col justify-between select-none overflow-hidden"
      style={{ background: 'var(--paper)', color: 'var(--ink)' }}
    >
      {/* Paper Noise */}
      <div className="absolute inset-0 opacity-15 bg-paper-noise pointer-events-none" />

      {/* Top Header */}
      <div className="relative z-10 px-5 pt-12 pb-3.5 border-b border-[rgba(40,36,31,.12)] bg-[rgba(247,244,238,.85)] backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => onNavigate('home')}
            className="w-8 h-8 rounded-full bg-white/40 border border-white/60 backdrop-blur-md grid place-items-center text-xs hover:bg-white/70 active:scale-95 transition-all text-[#242323]"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="text-[8px] font-mono tracking-[2px] text-[#817a72] uppercase">
              PHOTOBOOK ARCHIVE · MOMENTS
            </div>
            <h2 className="font-serif font-bold text-base tracking-tight text-[#242323]">
              社交动态 · 胶片记录
            </h2>
          </div>
        </div>

        <div className="text-[10px] font-mono text-[#8b7560] border border-[rgba(139,117,96,.3)] px-2 py-0.5 rounded-full">
          35MM FILM
        </div>
      </div>

      {/* Moments Feed */}
      <div className="relative z-10 flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar text-xs">
        {posts.map((post) => (
          <div
            key={post.id}
            className="p-4 rounded-3xl bg-[#ebe7df] border border-[rgba(40,36,31,.14)] shadow-[0_6px_20px_rgba(45,37,30,.06)] space-y-3 relative overflow-hidden"
          >
            {/* Film sprocket top header */}
            <div className="flex items-center justify-between text-[8px] font-mono text-[#8b8782] border-b border-[rgba(40,36,31,.08)] pb-2">
              <span className="tracking-widest">▪ ▪ ▪ {post.rollTag} ▪ ▪ ▪</span>
              <span>{post.time}</span>
            </div>

            {/* Author */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div 
                  className="w-7 h-7 rounded-full shrink-0 relative overflow-hidden shadow-xs"
                  style={{ background: 'linear-gradient(145deg,#b6a38d,#695e55)' }}
                >
                  <div className="absolute w-[11px] h-[13px] rounded-full bg-[#e1d2c0] left-[8px] top-[5px]" />
                </div>
                <span className="font-serif font-bold text-xs text-[#242323]">{post.author}</span>
              </div>
              <span className="text-[8px] px-1.5 py-0.2 rounded bg-white/50 text-[#8b7560] font-mono">
                ORIGINAL
              </span>
            </div>

            {/* Prose Content */}
            <p className="font-serif-sc text-xs leading-relaxed text-[#443f3a]">
              {post.content}
            </p>

            {/* Analog Film Photos */}
            <div className={`grid gap-2 ${post.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {post.images.map((img, i) => (
                <div key={i} className="rounded-xl overflow-hidden p-1.5 bg-[#eee9df] border border-[rgba(40,36,31,.1)] shadow-xs">
                  <img
                    src={img}
                    alt="film photo"
                    referrerPolicy="no-referrer"
                    className="w-full h-36 object-cover rounded-lg filter contrast-[0.92] saturate-[0.7]"
                  />
                  <div className="mt-1 text-right text-[7px] text-[#8b8782] font-mono">
                    PHOTO FILM NOTE
                  </div>
                </div>
              ))}
            </div>

            {/* Handwritten note & Actions */}
            <div className="pt-2 border-t border-[rgba(40,36,31,.08)] flex items-center justify-between text-[11px]">
              <span className="font-handwriting text-[#8b7560] text-xs">
                {post.note}
              </span>

              <div className="flex items-center gap-3 text-[#777067]">
                <button className="flex items-center gap-1 hover:text-[#9b625b] transition-colors">
                  <Heart className="w-3.5 h-3.5 fill-[#9b625b]/20 text-[#9b625b]" />
                  <span className="font-mono text-[10px]">{post.likes}</span>
                </button>
                <button className="flex items-center gap-1 hover:text-[#242323] transition-colors">
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span className="font-mono text-[10px]">回复</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
