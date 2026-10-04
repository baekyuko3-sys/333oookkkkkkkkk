import { useState, useEffect } from 'react';
import { ScreenType } from '../../types';

interface SaneHomeScreenViewProps {
  onNavigate: (screen: ScreenType) => void;
  onOpenSheet: () => void;
  onToggleTheme?: () => void;
}

export function SaneHomeScreenView({ onNavigate, onOpenSheet, onToggleTheme }: SaneHomeScreenViewProps) {
  const [currentPage, setCurrentPage] = useState<1 | 2>(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPhotoFlipped, setIsPhotoFlipped] = useState(false);
  const [isPhotoFlippedP2, setIsPhotoFlippedP2] = useState(false);
  const [cityIndex, setCityIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState('21:06');
  const [currentGreeting, setCurrentGreeting] = useState('GOOD EVENING · PRIVATE DEVICE');
  const [currentDateNumber, setCurrentDateNumber] = useState('02');
  const [currentMonthString, setCurrentMonthString] = useState('OCTOBER · FRIDAY · 2026');
  const [archiveCap, setArchiveCap] = useState('ARCHIVE 02/10');

  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      const h = d.getHours();
      const timeStr = `${p(h)}:${p(d.getMinutes())}`;
      setCurrentTime(timeStr);
      setCurrentDateNumber(p(d.getDate()));
      
      const monthName = d.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();
      const weekDay = d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
      setCurrentMonthString(`${monthName} · ${weekDay} · ${d.getFullYear()}`);

      const greet = h < 12 ? 'GOOD MORNING' : h < 18 ? 'GOOD AFTERNOON' : 'GOOD EVENING';
      setCurrentGreeting(`${greet} · PRIVATE DEVICE`);
      setArchiveCap(`ARCHIVE ${p(d.getDate())}/${p(d.getMonth() + 1)}`);
    };

    updateTime();
    const timer = setInterval(updateTime, 10000);
    return () => clearInterval(timer);
  }, []);

  const cities = [
    { city: 'LOS ANGELES', temp: '22°', sky: 'CLEAR SKY', icon: '☼', note: 'FILM NOTE 08' },
    { city: 'LONDON', temp: '18°', sky: 'RAINY NIGHT', icon: '☽', note: 'FILM NOTE 09' },
  ];
  const currentCity = cities[cityIndex];

  return (
    <div className="relative w-full h-full overflow-hidden select-none" style={{ background: 'var(--screen, #fff)', color: 'var(--ink, #242323)' }}>
      
      {/* SVG Icon Definitions */}
      <svg width="0" height="0" className="absolute pointer-events-none" aria-hidden="true">
        <defs>
          <symbol id="chat" viewBox="0 0 24 24"><path d="M20.5 12a8 8 0 0 1-11.6 7.1L4 20.2l1.2-4.4A8 8 0 1 1 20.5 12z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></symbol>
          <symbol id="book" viewBox="0 0 24 24"><path d="M5 5.5A2 2 0 0 1 7 3.5h11v15H7a2 2 0 0 0-2 2z" fill="none" stroke="currentColor" strokeWidth="1.6"/><path d="M5 18.5V5.5M9 8h6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></symbol>
          <symbol id="ig" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="5" fill="none" stroke="currentColor" strokeWidth="1.6"/><circle cx="12" cy="12" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.6"/><circle cx="16.8" cy="7.2" r=".7" fill="currentColor"/></symbol>
          <symbol id="music" viewBox="0 0 24 24"><path d="M9 18V6l10-2v12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><circle cx="7" cy="18" r="2" fill="none" stroke="currentColor" strokeWidth="1.6"/><circle cx="17" cy="16" r="2" fill="none" stroke="currentColor" strokeWidth="1.6"/></symbol>
          <symbol id="card" viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6"/><circle cx="9" cy="11" r="2" fill="none" stroke="currentColor" strokeWidth="1.6"/><path d="M6.5 16c.5-1.6 1.6-2.2 2.5-2.2s2 .6 2.5 2.2M14 10h3.5M14 13.5h2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></symbol>
          <symbol id="globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.6"/><path d="M3.5 12h17M12 3.5c2.5 2.4 3.5 5.3 3.5 8.5s-1 6.1-3.5 8.5c-2.5-2.4-3.5-5.3-3.5-8.5s1-6.1 3.5-8.5z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></symbol>
          <symbol id="look" viewBox="0 0 24 24"><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.5 0 2-1 1.5-2.1-.5-1.1.2-2.4 1.5-2.4H17a3.5 3.5 0 0 0 3.5-3.5C20.5 7 16.7 3.5 12 3.5z" fill="none" stroke="currentColor" strokeWidth="1.6"/><circle cx="8" cy="11" r=".8" fill="currentColor"/><circle cx="11" cy="7.8" r=".8" fill="currentColor"/><circle cx="15" cy="8.5" r=".8" fill="currentColor"/></symbol>
          <symbol id="gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.6"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></symbol>
          <symbol id="threads" viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c2.8 0 5.4-1.1 7.2-3l-1.5-1.5C16.2 19 14.2 20 12 20c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8c0 2.2-.9 4.1-2.4 5.3-1.1.9-2.5 1.2-3.8.9-1.8-.4-2.8-1.8-2.8-3.7V11c0-1.7-1.3-3-3-3s-3 1.3-3 3 1.3 3 3 3c1 0 1.9-.5 2.4-1.2v1.7c0 2.8 1.7 4.8 4.3 5.4 1.8.4 3.7-.1 5.2-1.3C21 16.9 22 14.5 22 12c0-5.5-4.5-10-10-10zm-1 10.5c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5z" fill="currentColor"/></symbol>
          <symbol id="spy" viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6"/><circle cx="12" cy="18" r="1" fill="currentColor"/><circle cx="12" cy="9" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M9.5 9h5M12 6.5v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></symbol>
        </defs>
      </svg>

      {/* Pure White Background with subtle clean paper noise */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(circle at 75% 15%, rgba(245, 242, 236, 0.5) 0%, transparent 35%),
            linear-gradient(180deg, var(--screen, #ffffff) 0%, var(--screen, #ffffff) 100%)
          `
        }}
      >
        <div className="absolute inset-0 opacity-[0.03] bg-paper-noise" />
      </div>

      {/* Top Header Identity (Persists across pages) */}
      <div className="absolute z-10 top-[70px] left-[25px] right-[25px] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-[45px] h-[45px] rounded-full relative overflow-hidden shadow-[0_5px_18px_rgba(56,46,36,.18)] shrink-0"
            style={{ background: 'linear-gradient(145deg,#d8d3ca,#8b8379)' }}
            title="个人主页"
          >
            <div className="absolute inset-0 grid place-items-center text-[10px] font-mono tracking-[1px] text-white/90">ME</div>
          </div>
          <div>
            <div className="text-[11px] text-[#8b8782] tracking-[0.5px] mb-0.5 font-mono">
              {currentPage === 1 ? currentGreeting : 'PRIVATE ARCHIVE'}
            </div>
            <div className="text-[17px] font-[650] tracking-[0.2px] text-[var(--ink)]">
              Sane333
            </div>
          </div>
        </div>

        <button 
          onClick={onOpenSheet}
          className="w-[35px] h-[35px] rounded-full bg-[var(--icon,rgba(248,245,239,.72))] border border-[var(--edge,rgba(255,255,255,.6))] backdrop-blur-md grid place-items-center text-base hover:scale-105 active:scale-95 transition-all text-[var(--ink)] shadow-xs"
          title="自定义主页"
        >
          ⌘
        </button>
      </div>

      {/* ========================================================================= */}
      {/* PAGE 1: 经典胶片主屏幕 (LINE + IG + 音乐 + 线下剧情) */}
      {/* ========================================================================= */}
      {currentPage === 1 && (
        <div className="animate-in fade-in duration-300">
          
          {/* Date & Literary Section */}
          <div className="absolute z-10 top-[148px] left-[26px]">
            <div className="font-serif text-[55px] leading-[0.9] font-normal tracking-[-3px] text-[var(--ink)]">
              {currentDateNumber}
            </div>
            <div className="text-[11px] text-[#8b8782] tracking-[2.4px] mt-3 font-mono">
              {currentMonthString}
            </div>
            <div className="mt-5 font-serif-sc text-[13px] leading-[1.8] text-[var(--sub,#68625b)] max-w-[205px]">
              “把今天留给自己。<br />剩下的事情，明天再说。”
            </div>
          </div>

          {/* Film Photo Polaroid pinned diagonally (Click to Flip!) */}
          <div 
            onClick={() => setIsPhotoFlipped(!isPhotoFlipped)}
            className="absolute z-10 right-[17px] top-[181px] w-[84px] h-[106px] rotate-[4deg] p-[5px_5px_15px] bg-[var(--paper,#eee9df)] shadow-[0_7px_18px_rgba(45,37,30,.09)] opacity-90 cursor-pointer hover:rotate-0 hover:scale-105 transition-all group"
            title="点击翻转拍立得相纸"
          >
            {isPhotoFlipped ? (
              <div className="h-[82px] p-1.5 bg-[#fbf9f5] border border-neutral-200/80 rounded flex flex-col justify-between text-left">
                <span className="text-[6px] font-mono text-[#8b8782]">MEMO</span>
                <p className="font-handwriting text-[8.5px] leading-tight text-[#8b7560]">
                  2026.10.02<br />
                  傍晚风微凉，咖啡刚好。
                </p>
                <span className="font-handwriting text-[7px] text-[#9b625b] text-right">
                  private note.
                </span>
              </div>
            ) : (
              <div 
                className="h-[82px] relative overflow-hidden filter contrast-[0.92] saturate-[0.68]"
                style={{
                  background: `
                    radial-gradient(circle at 70% 28%, rgba(230,215,190,.7), transparent 20%),
                    linear-gradient(135deg, #655d55, #b1a08e 48%, #5e5750)
                  `
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-black/40" />
                <span className="absolute left-[6px] top-[6px] text-white/85 text-[7px] tracking-[0.9px] font-mono">
                  LOS ANGELES
                </span>
                <b className="absolute right-[6px] bottom-[5px] text-white font-serif text-[11px] font-normal">
                  {currentTime}
                </b>
              </div>
            )}
            <div className="absolute left-[5px] bottom-[3px] text-[7px] tracking-[0.8px] text-[#6f685f] whitespace-nowrap font-mono">
              {isPhotoFlipped ? 'CLICK FLIP' : archiveCap}
            </div>
          </div>

          {/* Widgets (Weather, Note & Music Player) */}
          <div className="absolute z-10 top-[306px] left-[20px] right-[20px] grid grid-cols-2 gap-[13px]">
            
            {/* Weather Card */}
            <button 
              onClick={() => setCityIndex((prev) => (prev + 1) % cities.length)}
              className="relative overflow-hidden min-h-[105px] border border-[var(--edge,rgba(255,255,255,.6))] bg-[var(--glass,rgba(248,246,242,.72))] backdrop-blur-2xl rounded-[21px] p-[15px] shadow-[0_6px_22px_rgba(40,35,30,.045)] text-left cursor-pointer active:scale-98 transition-all group"
              title="点击切换城市天气"
            >
              <div className="absolute -right-7 -top-8 w-24 h-24 border border-[rgba(67,58,49,.09)] rounded-full pointer-events-none" />
              <div className="text-[10px] text-[#8b8782] tracking-[1.6px] font-mono">
                {currentCity.city}
              </div>
              <div className="flex items-end justify-between mt-3">
                <div>
                  <div className="text-[27px] font-light tracking-[-1px] text-[var(--ink)] leading-none">
                    {currentCity.temp}
                  </div>
                  <div className="text-[9px] text-[#8b8782] tracking-[1px] mt-1 font-mono">
                    {currentCity.sky}
                  </div>
                </div>
                <div className="text-[28px] text-[#8b7560] leading-none">
                  {currentCity.icon}
                </div>
              </div>
            </button>

            {/* Private Memory Note */}
            <button 
              onClick={() => onNavigate('notes')}
              className="relative overflow-hidden min-h-[105px] border border-[var(--edge,rgba(255,255,255,.6))] bg-[var(--glass,rgba(248,246,242,.72))] backdrop-blur-2xl rounded-[21px] p-[15px] shadow-[0_6px_22px_rgba(40,35,30,.045)] text-left cursor-pointer active:scale-98 transition-all"
            >
              <div className="text-[10px] text-[#8b8782] tracking-[1.6px] font-mono">
                NOTE
              </div>
              <div className="mt-3 font-serif text-[16px] leading-[1.35] text-[var(--ink)]">
                此刻<br />正在发生
              </div>
            </button>

            {/* Music Player Bar (Full width) */}
            <div 
              className="col-span-2 min-h-[84px] border border-[var(--edge,rgba(255,255,255,.6))] bg-[var(--glass,rgba(248,246,242,.72))] backdrop-blur-2xl rounded-[21px] p-[15px] shadow-[0_6px_22px_rgba(40,35,30,.045)] flex items-center gap-3 transition-all"
            >
              <div 
                onClick={() => onNavigate('music')}
                className={`w-[54px] h-[54px] rounded-[13px] shrink-0 grid place-items-center text-white font-serif text-[21px] shadow-[0_5px_13px_rgba(40,32,26,.15)] cursor-pointer hover:scale-105 transition-transform ${
                  isPlaying ? 'animate-[spin_12s_linear_infinite]' : ''
                }`}
                style={{ background: 'linear-gradient(145deg, #9e9489, #38332f)' }}
              >
                ♪
              </div>

              <div 
                onClick={() => onNavigate('music')}
                className="flex-1 min-w-0 cursor-pointer"
              >
                <b className="text-[13px] font-semibold text-[var(--ink)] truncate block">
                  Nothing's Gonna Hurt You Baby
                </b>
                <p className="m-0 mt-1 text-[#8b8782] text-[10px] truncate font-mono">
                  Cigarettes After Sex
                </p>
              </div>

              <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-8 h-8 rounded-full bg-[#2d2b29] text-white grid place-items-center text-xs hover:scale-105 active:scale-95 transition-transform shrink-0"
                title={isPlaying ? "暂停" : "播放"}
              >
                {isPlaying ? 'Ⅱ' : '▶'}
              </button>
            </div>

          </div>

          {/* Page 1 Apps: LINE, IG, 音乐, 线下剧情 */}
          <section className="absolute z-10 left-[26px] right-[20px] top-[565px] flex gap-[24px]">
            <button 
              onClick={() => onNavigate('chat')}
              className="flex flex-col items-center gap-2 text-[10px] tracking-[0.4px] text-[var(--sub,#68625b)] active:scale-95 transition-transform group"
            >
              <div className="w-[64px] h-[64px] rounded-[21px] bg-[#36332f] text-[#eee] border-transparent shadow-[0_6px_18px_rgba(52,43,34,.055)] grid place-items-center group-hover:scale-105 transition-transform relative">
                <svg className="w-6 h-6 stroke-current fill-none stroke-[1.5] stroke-linecap-round stroke-linejoin-round">
                  <use href="#chat"/>
                </svg>
                
              </div>
              <span className="font-medium">LINE</span>
            </button>

            <button 
              onClick={() => onNavigate('moments')}
              className="flex flex-col items-center gap-2 text-[10px] tracking-[0.4px] text-[var(--sub,#68625b)] active:scale-95 transition-transform group"
            >
              <div className="w-[64px] h-[64px] rounded-[21px] bg-[#9b8068] text-white border-transparent shadow-[0_6px_18px_rgba(52,43,34,.055)] grid place-items-center group-hover:scale-105 transition-transform">
                <svg className="w-6 h-6 stroke-current fill-none stroke-[1.5] stroke-linecap-round stroke-linejoin-round">
                  <use href="#ig"/>
                </svg>
              </div>
              <span className="font-medium">IG</span>
            </button>

            <button 
              onClick={() => onNavigate('music')}
              className="flex flex-col items-center gap-2 text-[10px] tracking-[0.4px] text-[var(--sub,#68625b)] active:scale-95 transition-transform group"
            >
              <div className="w-[64px] h-[64px] rounded-[21px] bg-[var(--icon,rgba(248,245,239,.72))] text-[var(--ink)] border border-[var(--edge,rgba(255,255,255,.6))] backdrop-blur-xl shadow-[0_6px_18px_rgba(52,43,34,.055)] grid place-items-center group-hover:scale-105 transition-transform">
                <svg className="w-6 h-6 stroke-current fill-none stroke-[1.5] stroke-linecap-round stroke-linejoin-round">
                  <use href="#music"/>
                </svg>
              </div>
              <span className="font-medium">音乐</span>
            </button>

            <button 
              onClick={() => onNavigate('character-profile')}
              className="flex flex-col items-center gap-2 text-[10px] tracking-[0.4px] text-[var(--sub,#68625b)] active:scale-95 transition-transform group"
            >
              <div className="w-[64px] h-[64px] rounded-[21px] bg-[var(--icon,rgba(248,245,239,.72))] text-[var(--ink)] border border-[var(--edge,rgba(255,255,255,.6))] backdrop-blur-xl shadow-[0_6px_18px_rgba(52,43,34,.055)] grid place-items-center group-hover:scale-105 transition-transform">
                <svg className="w-6 h-6 stroke-current fill-none stroke-[1.5] stroke-linecap-round stroke-linejoin-round">
                  <use href="#book"/>
                </svg>
              </div>
              <span className="font-medium">线下剧情</span>
            </button>
          </section>

        </div>
      )}

      {/* ========================================================================= */}
      {/* PAGE 2: 深度扩展页 (Threads + 查手机) 
          与第一页风格统一，极简克制，充实而充满叙事张力！
      {/* ========================================================================= */}
      {currentPage === 2 && (
        <div className="animate-in fade-in duration-300">
          <div className="absolute z-10 inset-x-[26px] top-[148px]">
            <div className="font-serif text-[42px] leading-[0.95] font-normal tracking-[-1.5px] text-[var(--ink)]">
              空白
            </div>
            <div className="text-[10px] text-[#8b8782] tracking-[2px] mt-2.5 font-mono">
              PRIVATE DEVICE · PAGE 02
            </div>
            <div className="mt-4 font-serif-sc text-[12.5px] leading-[1.75] text-[var(--sub,#68625b)] max-w-[220px]">
              “这里还没有任何角色、对话或私人记录。<br />
              从零开始，等你亲手填入。”
            </div>
          </div>

          <div className="absolute z-10 top-[306px] left-[20px] right-[20px]">
            <div className="min-h-[190px] border border-[var(--edge,rgba(255,255,255,.6))] bg-[var(--glass,rgba(248,246,242,.72))] backdrop-blur-2xl rounded-[21px] p-[18px] shadow-[0_6px_22px_rgba(40,35,30,.045)] flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-2xl border border-[var(--edge,rgba(255,255,255,.6))] bg-[var(--icon,rgba(248,245,239,.72))] grid place-items-center text-[var(--sub,#68625b)] mb-3">
                ○
              </div>
              <div className="text-[11px] font-mono tracking-[1.4px] text-[#8b8782]">NO PRESET DATA</div>
              <p className="mt-2 font-serif-sc text-[12px] leading-relaxed text-[var(--sub,#68625b)]">
                暂无角色 · 暂无聊天 · 暂无动态
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Pagination Indicator Dots (● ○  /  ○ ●) */}
      {/* ========================================================================= */}
      <div className="absolute z-10 bottom-[128px] left-0 right-0 flex items-center justify-center gap-2">
        <button
          onClick={() => setCurrentPage(1)}
          className={`h-1.5 rounded-full transition-all ${
            currentPage === 1 ? 'w-5 bg-[var(--ink,#242323)]' : 'w-1.5 bg-[#8b8782]/40 hover:bg-[#8b8782]'
          }`}
          title="切换至第 1 页 (主桌面)"
        />
        <button
          onClick={() => setCurrentPage(2)}
          className={`h-1.5 rounded-full transition-all ${
            currentPage === 2 ? 'w-5 bg-[var(--ink,#242323)]' : 'w-1.5 bg-[#8b8782]/40 hover:bg-[#8b8782]'
          }`}
          title="切换至第 2 页 (Threads & 查手机)"
        />
      </div>

      {/* ========================================================================= */}
      {/* PERFECT FUSION DOCK (Persists across pages) */}
      {/* ========================================================================= */}
      <div 
        className="absolute z-20 left-[16px] right-[16px] bottom-[28px] h-[92px] rounded-[30px] border border-[var(--edge,rgba(255,255,255,.6))] shadow-[0_14px_38px_rgba(48,40,32,.08)] grid grid-cols-4 items-center px-2 backdrop-blur-2xl"
        style={{ background: 'var(--glass, rgba(248,246,242,.72))' }}
      >
        <button
          onClick={onOpenSheet}
          className="flex flex-col items-center gap-1.5 text-[10px] tracking-[0.4px] text-[var(--sub,#68625b)] hover:text-[var(--ink)] active:scale-95 transition-all group"
          title="个人设置"
        >
          <div className="w-[46px] h-[46px] rounded-[15px] bg-[var(--icon,rgba(248,245,239,.72))] border border-[var(--edge,rgba(255,255,255,.6))] shadow-[0_4px_12px_rgba(52,43,34,.05)] grid place-items-center group-hover:scale-105 group-hover:bg-white transition-all">
            <svg className="w-[22px] h-[22px] stroke-current fill-none stroke-[1.5] stroke-linecap-round stroke-linejoin-round">
              <use href="#card"/>
            </svg>
          </div>
          <span className="font-medium">个人</span>
        </button>

        <button
          onClick={() => onNavigate('world-book')}
          className="flex flex-col items-center gap-1.5 text-[10px] tracking-[0.4px] text-[var(--sub,#68625b)] hover:text-[var(--ink)] active:scale-95 transition-all group"
          title="世界书"
        >
          <div className="w-[46px] h-[46px] rounded-[15px] bg-[var(--icon,rgba(248,245,239,.72))] border border-[var(--edge,rgba(255,255,255,.6))] shadow-[0_4px_12px_rgba(52,43,34,.05)] grid place-items-center group-hover:scale-105 group-hover:bg-white transition-all">
            <svg className="w-[22px] h-[22px] stroke-current fill-none stroke-[1.5] stroke-linecap-round stroke-linejoin-round">
              <use href="#globe"/>
            </svg>
          </div>
          <span className="font-medium">世界书</span>
        </button>

        <button 
          onClick={onToggleTheme || onOpenSheet}
          className="flex flex-col items-center gap-1.5 text-[10px] tracking-[0.4px] text-[var(--sub,#68625b)] hover:text-[var(--ink)] active:scale-95 transition-all group"
          title="切换外观主题"
        >
          <div className="w-[46px] h-[46px] rounded-[15px] bg-[var(--icon,rgba(248,245,239,.72))] border border-[var(--edge,rgba(255,255,255,.6))] shadow-[0_4px_12px_rgba(52,43,34,.05)] grid place-items-center group-hover:scale-105 group-hover:bg-white transition-all text-[#8b7560]">
            <svg className="w-[22px] h-[22px] stroke-current fill-none stroke-[1.5] stroke-linecap-round stroke-linejoin-round">
              <use href="#look"/>
            </svg>
          </div>
          <span className="font-medium">外观</span>
        </button>

        <button 
          onClick={onOpenSheet}
          className="flex flex-col items-center gap-1.5 text-[10px] tracking-[0.4px] text-[var(--sub,#68625b)] hover:text-[var(--ink)] active:scale-95 transition-all group"
          title="系统设置与自定义"
        >
          <div className="w-[46px] h-[46px] rounded-[15px] bg-[var(--icon,rgba(248,245,239,.72))] border border-[var(--edge,rgba(255,255,255,.6))] shadow-[0_4px_12px_rgba(52,43,34,.05)] grid place-items-center group-hover:scale-105 group-hover:bg-white transition-all">
            <svg className="w-[22px] h-[22px] stroke-current fill-none stroke-[1.5] stroke-linecap-round stroke-linejoin-round">
              <use href="#gear"/>
            </svg>
          </div>
          <span className="font-medium">设置</span>
        </button>
      </div>

    </div>
  );
}
