import { useEffect, useState } from 'react';
import { ArrowLeft, FileText, Image as ImageIcon, Lock, MessageSquare, UserRound } from 'lucide-react';
import { ScreenType } from '../../types';
import { getNpcs, SaneNpc } from '../../store/npcs';

export function SpyPhoneScreenView({ onNavigate }: { onNavigate: (screen: ScreenType) => void }) {
  const [npcs, setNpcs] = useState<SaneNpc[]>([]);

  useEffect(() => {
    const refresh = () => setNpcs(getNpcs());
    refresh();
    window.addEventListener('phone-npcs-updated', refresh);
    return () => window.removeEventListener('phone-npcs-updated', refresh);
  }, []);

  const active = npcs.filter(npc => npc.active);

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden" style={{ background: 'var(--screen, #fff)', color: 'var(--ink, #242323)' }}>
      <div className="px-5 pt-12 pb-3.5 border-b border-[#ddd6cd] bg-white/90 backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('home')} className="w-8 h-8 rounded-full bg-neutral-100 border border-neutral-200 grid place-items-center"><ArrowLeft className="w-4 h-4" /></button>
          <div><div className="text-[8px] font-mono tracking-[2px] text-[#817a72]">DEVICE INSPECTOR</div><h2 className="font-serif font-bold text-[16px]">查手机</h2></div>
        </div>
        <div className="text-[8px] font-mono px-2 py-1 rounded bg-[#f2ece4] text-[#8b7560]">{active.length ? 'READY' : 'NO TARGET'}</div>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto p-4 no-scrollbar">
        {active.length === 0 ? (
          <div className="h-full min-h-[520px] flex items-center justify-center">
            <div className="w-full rounded-[24px] border border-dashed border-[#d4cbbf] bg-[#f7f3ec]/70 p-6 text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-white border border-[#e2ddd5] grid place-items-center text-[#8b7560]"><Lock className="w-6 h-6 stroke-[1.4]" /></div>
              <div className="mt-4 font-serif font-bold text-[17px]">暂无可查看设备</div>
              <div className="mt-2 text-[10px] leading-relaxed text-[#8b8782]">查手机不会预置任何角色或聊天。<br />建立角色后，这里再接入对应的手机内容。</div>
              <button onClick={() => onNavigate('character-profile')} className="mt-5 h-10 px-5 rounded-full bg-[#292724] text-white text-[11px] inline-flex items-center gap-2"><UserRound className="w-3.5 h-3.5" /> 去角色中心</button>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {active.map(npc => (
              <div key={npc.id} className="rounded-[20px] border border-[#ded7cd] bg-white/80 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-[14px] bg-[#eee9e1] grid place-items-center text-[#8b7560]">{npc.avatar ? <img src={npc.avatar} alt="" className="w-full h-full object-cover rounded-[14px]" /> : <UserRound className="w-5 h-5" />}</div>
                  <div><div className="text-[12px] font-semibold">{npc.name}</div><div className="text-[9px] text-[#8b8782] mt-0.5">{npc.relationship || '未设置关系'}</div></div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4">
                  {[
                    [MessageSquare, '聊天'],
                    [ImageIcon, '相册'],
                    [FileText, '草稿']
                  ].map(([Icon, label]) => (
                    <button key={label as string} className="p-3 rounded-xl bg-[#f7f3ec] border border-[#e2ddd5] text-[9px] text-[#8b8782]">
                      <Icon className="w-4 h-4 mx-auto mb-1.5" />
                      {label as string}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
