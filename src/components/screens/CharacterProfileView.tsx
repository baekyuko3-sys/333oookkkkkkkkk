import { ArrowLeft, UserRound } from 'lucide-react';
import { ScreenType } from '../../types';

interface CharacterProfileViewProps {
  themeMode?: any;
  onNavigate: (screen: ScreenType) => void;
}

export function CharacterProfileView({ onNavigate }: CharacterProfileViewProps) {
  return (
    <div
      className="relative w-full h-full flex flex-col justify-between select-none overflow-hidden"
      style={{ background: 'var(--paper)', color: 'var(--ink)' }}
    >
      <div className="absolute inset-0 opacity-15 bg-paper-noise pointer-events-none" />

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
              CHARACTER ARCHIVE
            </div>
            <h2 className="font-serif font-bold text-base tracking-tight text-[#242323]">
              人物档案
            </h2>
          </div>
        </div>

        <div className="text-[8px] px-2 py-0.5 rounded bg-[#8b7560] text-white font-mono tracking-widest uppercase">
          EMPTY
        </div>
      </div>

      <div className="relative z-10 flex-1 p-5 flex items-center justify-center">
        <div className="w-full p-5 rounded-3xl bg-[#ebe7df] border border-[rgba(40,36,31,.12)] shadow-[0_8px_25px_rgba(45,37,30,.08)] text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-white/60 border border-[rgba(40,36,31,.1)] grid place-items-center text-[#8b7560]">
            <UserRound className="w-7 h-7 stroke-[1.4]" />
          </div>
          <div className="mt-4 font-serif font-bold text-base text-[#242323]">
            暂无角色
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-[#8b8782] font-serif-sc">
            现在是一个全新的空白手机。<br />
            这里不会预置任何人物。
          </p>
          <div className="mt-4 text-[9px] font-mono tracking-[1.5px] text-[#8b7560]">
            ADD YOUR FIRST CHARACTER LATER
          </div>
        </div>
      </div>
    </div>
  );
}
