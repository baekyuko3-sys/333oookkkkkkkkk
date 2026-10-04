import { useState } from 'react';
import { ArrowLeft, Pause, Play, SkipBack, SkipForward, Music2 } from 'lucide-react';
import { ScreenType } from '../../types';

export function MusicScreenView({ onNavigate }: { themeMode?: any; onNavigate: (screen: ScreenType) => void }) {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <div className="relative w-full h-full flex flex-col justify-between p-6 select-none overflow-hidden" style={{ background: 'var(--paper, #f7f4ee)', color: 'var(--ink, #242323)' }}>
      <div className="absolute inset-0 opacity-15 bg-paper-noise pointer-events-none" />

      <div className="relative z-10 pt-8 flex items-center justify-between">
        <button onClick={() => onNavigate('home')} className="w-8 h-8 rounded-full bg-white/40 border border-white/60 grid place-items-center active:scale-95"><ArrowLeft className="w-4 h-4" /></button>
        <span className="text-[9px] font-mono tracking-widest text-[#8b8782] uppercase">MUSIC LIBRARY</span>
        <span className="text-[8px] font-mono text-[#a39b91]">0 TRACKS</span>
      </div>

      <div className="relative z-10 my-auto text-center">
        <div className="relative w-52 h-52 mx-auto flex items-center justify-center">
          <div className="w-full h-full rounded-full bg-[#242323]/[.06] border border-[#bcb4aa] grid place-items-center">
            <div className="w-20 h-20 rounded-full border border-[#b6a38d]/60 grid place-items-center text-[#8b7560]">
              <Music2 className="w-7 h-7 stroke-[1.2]" />
            </div>
          </div>
        </div>
        <div className="mt-5">
          <div className="text-[8px] font-mono text-[#8b8782] tracking-[2px] uppercase">NOW PLAYING</div>
          <h3 className="font-serif font-bold text-base mt-1">暂无播放</h3>
          <p className="text-[10px] text-[#8b8782] font-mono mt-1">先添加自己的音乐。</p>
        </div>
      </div>

      <div className="relative z-10 space-y-4 pb-4">
        <div className="w-full h-1 bg-[#d5cec3] rounded-full" />
        <div className="flex items-center justify-around">
          <button className="text-[#b0a9a1]"><SkipBack className="w-5 h-5" /></button>
          <button onClick={() => setIsPlaying(!isPlaying)} className="w-12 h-12 rounded-full bg-[#292724] text-white grid place-items-center shadow-md active:scale-95" disabled><Play className="w-5 h-5" /></button>
          <button className="text-[#b0a9a1]"><SkipForward className="w-5 h-5" /></button>
        </div>
        <div className="text-center text-[8px] font-mono text-[#a39b91]">{isPlaying ? 'PLAYING' : 'EMPTY QUEUE'}</div>
      </div>
    </div>
  );
}
