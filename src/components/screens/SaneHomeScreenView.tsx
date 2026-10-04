import { useState, useEffect } from 'react';
import { ScreenType } from '../../types';
import { getWorldUnreadCount } from '../../store/worldRuntime';
import { readAppearance, type AppearanceScheme } from '../../store/appearance';

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
  const [appearance, setAppearance] = useState<AppearanceScheme>(() => readAppearance());
  const [currentGreeting, setCurrentGreeting] = useState(() => readAppearance().greeting);
  const [currentDateNumber, setCurrentDateNumber] = useState('02');
  const [currentMonthString, setCurrentMonthString] = useState('OCTOBER · FRIDAY · 2026');
  const [archiveCap, setArchiveCap] = useState('PRIVATE ARCHIVE');
  const [worldUnread, setWorldUnread] = useState(0);

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

      const customGreeting = readAppearance().greeting.trim();
      const greet = h < 12 ? 'GOOD MORNING' : h < 18 ? 'GOOD AFTERNOON' : 'GOOD EVENING';
      setCurrentGreeting(customGreeting || `${greet} · PRIVATE DEVICE`);
      setArchiveCap(`ARCHIVE ${p(d.getDate())}/${p(d.getMonth() + 1)}`);
    };

    updateTime();
    const timer = setInterval(updateTime, 10000);
    const refreshWorld = () => setWorldUnread(getWorldUnreadCount());
    refreshWorld();
    window.addEventListener('sane333:world-state-changed', refreshWorld);
    window.addEventListener('sane333:world-event', refreshWorld);
    return () => {
      clearInterval(timer);
      window.removeEventListener('sane333:world-state-changed', refreshWorld);
      window.removeEventListener('sane333:world-event', refreshWorld);
    };
  }, []);

  useEffect(() => {
    const syncAppearance = () => {
      const next = readAppearance();
      setAppearance(next);
      setCurrentGreeting(next.greeting);
    };
    window.addEventListener('sane333:appearance-changed', syncAppearance);
    return () => window.removeEventListener('sane333:appearance-changed', syncAppearance);
  }, []);

  const cities = [
    {
      city: appearance.widget.weatherCity,
      temp: appearance.widget.weatherTemp,
      sky: appearance.widget.weatherCondition,
      icon: '○',
      note: appearance.widget.weatherHighLow,
    },
  ];
  const currentCity = cities[cityIndex];

  const renderAppIcon = (key: string, symbol: string, className = 'w-6 h-6') => {
    const custom = appearance.appIcons[key];
    if (custom) {
      return <img src={custom} alt="" className={className + ' object-cover rounded-[18px]'} />;
    }
    return (
      <svg className={className}>
        <use href={'#' + symbol} />
      </svg>
    );
  };

  return (
    <div className="relative w-full h-full overflow-hidden select-none" style={{ background: 'var(--screen, #fff)', color: 'var(--ink, #242323)', backgroundImage: appearance.wallpaper ? `url(${appearance.wallpaper})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }}>
      
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
          background: appearance.wallpaper
          ? 'linear-gradient(180deg, rgba(255,255,255,.64) 0%, rgba(255,255,255,.78) 100%)'
          : `
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
            onClick={() => onNavigate('character-profile')}
            className="w-[45px] h-[45px] rounded-full cursor-pointer relative overflow-hidden shadow-[0_5px_18px_rgba(56,46,36,.18)] shrink-0"
            style={{ background: 'linear-gradient(145deg,#b6a38d,#695e55)' }}
            title="查看角色中心"
          >
            <div className="absolute w-[18px] h-[22px] rounded-full bg-[#e1d2c0] left-[13px] top-[8px]" />
            <div className="absolute w-[35px] h-[22px] rounded-[50%_50%_42%_42%] bg-[#51473f] left-[5px] top-[1px]" />
          </div>
          <div>
            <div className="text-[11px] text-[#8b8782] tracking-[0.5px] mb-0.5 font-mono">
              {currentPage === 1 ? currentGreeting : 'VAULT ARCHIVES · PAGE 02'}
            </div>
            <div className="text-[17px] font-[650] tracking-[0.2px] text-[var(--ink)]">
              {currentPage === 1 ? appearance.appTitle : 'Inner Vault'}
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
              {appearance.subtitle.split('\n').map((line, index) => <span key={index} className="block">{line}</span>}
            </div>
          </div>

          {worldUnread > 0 && (
            <button onClick={() => onNavigate('chat')} className="absolute z-20 left-[26px] right-[26px] top-[266px] flex items-center justify-between px-3 py-2 rounded-full bg-white/75 border border-[rgba(40,36,31,.09)] shadow-[0_5px_18px_rgba(45,37,30,.05)] backdrop-blur-md text-[8px] font-mono text-[#6f685f]">
              <span>WORLD · 有新的世界动态</span>
              <span className="text-[#9b625b]">{worldUnread} NEW</span>
            </button>
          )}

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
                  NO PRIVATE NOTE<br />
                  这里还没有私人便签。
                </p>
                <span className="font-handwriting text-[7px] text-[#9b625b] text-right">
                  EMPTY FRAME.
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
                  EMPTY FRAME
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
                  {appearance.widget.musicTitle}
                </b>
                <p className="m-0 mt-1 text-[#8b8782] text-[10px] truncate font-mono">
                  {appearance.widget.musicArtist}
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
          <section className="absolute z-10 left-[20px] right-[20px] top-[565px] flex gap-[12px]">
            <button 
              onClick={() => onNavigate('chat')}
              className="flex flex-col items-center gap-2 text-[10px] tracking-[0.4px] text-[var(--sub,#68625b)] active:scale-95 transition-transform group"
            >
              <div className="w-[64px] h-[64px] rounded-[21px] bg-[#36332f] text-[#eee] border-transparent shadow-[0_6px_18px_rgba(52,43,34,.055)] grid place-items-center group-hover:scale-105 transition-transform relative">
                {renderAppIcon('line', 'chat')}
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#9b625b] text-white text-[9px] font-bold flex items-center justify-center">
                  {worldUnread > 99 ? '99+' : worldUnread}
                </span>
              </div>
              <span className="font-medium">LINE</span>
            </button>

            <button 
              onClick={() => onNavigate('moments')}
              className="flex flex-col items-center gap-2 text-[10px] tracking-[0.4px] text-[var(--sub,#68625b)] active:scale-95 transition-transform group"
            >
              <div className="w-[64px] h-[64px] rounded-[21px] bg-[#9b8068] text-white border-transparent shadow-[0_6px_18px_rgba(52,43,34,.055)] grid place-items-center group-hover:scale-105 transition-transform">
                {renderAppIcon('moments', 'ig')}
              </div>
              <span className="font-medium">IG</span>
            </button>

            <button 
              onClick={() => onNavigate('music')}
              className="flex flex-col items-center gap-2 text-[10px] tracking-[0.4px] text-[var(--sub,#68625b)] active:scale-95 transition-transform group"
            >
              <div className="w-[64px] h-[64px] rounded-[21px] bg-[var(--icon,rgba(248,245,239,.72))] text-[var(--ink)] border border-[var(--edge,rgba(255,255,255,.6))] backdrop-blur-xl shadow-[0_6px_18px_rgba(52,43,34,.055)] grid place-items-center group-hover:scale-105 transition-transform">
                {renderAppIcon('music', 'music')}
              </div>
              <span className="font-medium">音乐</span>
            </button>

            <button 
              onClick={() => onNavigate('offline-story')}
              className="flex flex-col items-center gap-2 text-[10px] tracking-[0.4px] text-[var(--sub,#68625b)] active:scale-95 transition-transform group"
            >
              <div className="w-[64px] h-[64px] rounded-[21px] bg-[var(--icon,rgba(248,245,239,.72))] text-[var(--ink)] border border-[var(--edge,rgba(255,255,255,.6))] backdrop-blur-xl shadow-[0_6px_18px_rgba(52,43,34,.055)] grid place-items-center group-hover:scale-105 transition-transform">
                {renderAppIcon('offline-story', 'book')}
              </div>
              <span className="font-medium">线下剧情</span>
            </button>
          </section>

        </div>
      )}

      {/* ========================================================================= */}
      {/* PAGE 2: 深度扩展页 (Threads + 查手机)
          与第一页风格统一，极简克制，充实而充满叙事张力！
      */}
      {currentPage === 2 && (
        <div className="animate-in fade-in duration-300">
          
          {/* Page 2 Literary Mood Section */}
          <div className="absolute z-10 top-[148px] left-[26px]">
            <div className="font-serif text-[42px] leading-[0.95] font-normal tracking-[-1.5px] text-[var(--ink)]">
              深夜
            </div>
            <div className="text-[10px] text-[#8b8782] tracking-[2px] mt-2.5 font-mono">
              PRIVATE LOG
            </div>
            <div className="mt-4 font-serif-sc text-[12.5px] leading-[1.75] text-[var(--sub,#68625b)] max-w-[205px]">
              “那些不曾发给任何人的草稿，<br />和只对你开放的抽屉。”
            </div>
          </div>

          {/* Page 2 Polaroid: London Night Rain */}
          <div 
            onClick={() => setIsPhotoFlippedP2(!isPhotoFlippedP2)}
            className="absolute z-10 right-[17px] top-[181px] w-[84px] h-[106px] -rotate-[3deg] p-[5px_5px_15px] bg-[var(--paper,#eee9df)] shadow-[0_7px_18px_rgba(45,37,30,.09)] opacity-90 cursor-pointer hover:rotate-0 hover:scale-105 transition-all group"
            title="点击翻转伦敦雨夜拍立得"
          >
            {isPhotoFlippedP2 ? (
              <div className="h-[82px] p-1.5 bg-[#fbf9f5] border border-neutral-200/80 rounded flex flex-col justify-between text-left">
                <span className="text-[6px] font-mono text-[#8b8782]">DRAFT</span>
                <p className="font-handwriting text-[8px] leading-tight text-[#8b7560]">
                  PRIVATE LOG.<br />
                  暂无私人草稿。
                </p>
                <span className="font-handwriting text-[7px] text-[#9b625b] text-right">
                  private.
                </span>
              </div>
            ) : (
              <div 
                className="h-[82px] relative overflow-hidden filter contrast-[0.92] saturate-[0.68]"
                style={{
                  background: `
                    radial-gradient(circle at 70% 28%, rgba(200,185,160,.6), transparent 25%),
                    linear-gradient(135deg, #3d3732, #6e645a 50%, #2f2a26)
                  `
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-black/40" />
                <span className="absolute left-[6px] top-[6px] text-white/85 text-[7px] tracking-[0.9px] font-mono">
                  PRIVATE ARCHIVE
                </span>
                <b className="absolute right-[6px] bottom-[5px] text-white font-serif text-[11px] font-normal">
                  23:45
                </b>
              </div>
            )}
            <div className="absolute left-[5px] bottom-[3px] text-[7px] tracking-[0.8px] text-[#6f685f] whitespace-nowrap font-mono">
              {isPhotoFlippedP2 ? 'CLICK FLIP' : 'NO PHOTO YET'}
            </div>
          </div>

          {/* Page 2 Middle Feature Preview Cards */}
          <div className="absolute z-10 top-[306px] left-[20px] right-[20px] space-y-[11px]">
            
            {/* Widget 1: Threads Live Draft Preview */}
            <div 
              onClick={() => onNavigate('threads')}
              className="border border-[var(--edge,rgba(255,255,255,.6))] bg-[var(--glass,rgba(248,246,242,.72))] backdrop-blur-2xl rounded-[21px] p-[14px_16px] shadow-[0_6px_22px_rgba(40,35,30,.045)] cursor-pointer active:scale-98 transition-all hover:bg-white/90 group"
            >
              <div className="flex items-center justify-between text-[9px] font-mono text-[#8b8782] mb-1.5">
                <span className="flex items-center gap-1.5 text-[#1a1a1a] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1a1a1a]" />
                  THREADS · PRIVATE
                </span>
                <span>14分钟前发布</span>
              </div>
              <p className="font-serif-sc text-[12px] leading-relaxed text-[var(--ink)] line-clamp-2">
                暂无动态。导入角色后，Threads 会在这里显示内容。
              </p>
              <div className="mt-2 pt-1.5 border-t border-[rgba(0,0,0,0.05)] flex items-center justify-between text-[9px] font-mono text-[#8b7560]">
                <span>点击进入 Threads 查阅互动</span>
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </div>

            {/* Widget 2: Spy Phone Monitor Status Card */}
            <div 
              onClick={() => onNavigate('spy-phone')}
              className="border border-[var(--edge,rgba(255,255,255,.6))] bg-[var(--glass,rgba(248,246,242,.72))] backdrop-blur-2xl rounded-[21px] p-[14px_16px] shadow-[0_6px_22px_rgba(40,35,30,.045)] cursor-pointer active:scale-98 transition-all hover:bg-white/90 group"
            >
              <div className="flex items-center justify-between text-[9px] font-mono text-[#8b8782] mb-1.5">
                <span className="flex items-center gap-1.5 text-[#9b625b] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#9b625b] animate-ping" />
                  查手机 · 窥探监控已就绪
                </span>
                <span>暂无设备数据</span>
              </div>
              <div className="text-[11.5px] font-sans text-[#333] space-y-0.5">
                <p className="truncate text-[var(--ink)]">
                  暂无可查看的聊天记录
                </p>
                <p className="truncate text-[#8b7560] font-medium">
                  暂无角色聊天数据
                </p>
              </div>
              <div className="mt-2 pt-1.5 border-t border-[rgba(0,0,0,0.05)] flex items-center justify-between text-[9px] font-mono text-[#9b625b]">
                <span>等待角色与聊天数据</span>
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </div>

          </div>

          {/* Page 2 Apps: The Requested 2 Apps (Threads + 查手机) */}
          <section className="absolute z-10 left-[18px] right-[16px] top-[565px] flex gap-[4px]">
            
            {/* App 1: Threads */}
            <button 
              onClick={() => onNavigate('threads')}
              className="flex flex-col items-center gap-2 text-[10px] tracking-[0.4px] text-[var(--sub,#68625b)] active:scale-95 transition-transform group"
            >
              <div className="w-[54px] h-[54px] rounded-[21px] bg-[#1a1a1a] text-white border-transparent shadow-[0_6px_18px_rgba(52,43,34,.07)] grid place-items-center group-hover:scale-105 transition-transform relative">
                {renderAppIcon('threads', 'threads')}
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#9b625b] text-white text-[9px] font-bold flex items-center justify-center">
                  3
                </span>
              </div>
              <span className="font-semibold tracking-tight text-[var(--ink)]">Threads</span>
            </button>

            {/* App 2: NPC 人物池 */}
            <button
              onClick={() => onNavigate('npc')}
              className="flex flex-col items-center gap-2 text-[10px] tracking-[0.4px] text-[var(--sub,#68625b)] active:scale-95 transition-transform group"
            >
              <div className="w-[54px] h-[54px] rounded-[21px] bg-[#ebe2dc] text-[#5f554f] border border-[rgba(40,36,31,.08)] shadow-[0_6px_18px_rgba(52,43,34,.07)] grid place-items-center group-hover:scale-105 transition-transform relative">
                {appearance.appIcons.npc ? renderAppIcon('npc', 'card') : <span className="text-[19px] font-serif">人</span>}
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#caa9ad] border border-white" />
              </div>
              <span className="font-semibold tracking-tight text-[var(--ink)]">NPC</span>
            </button>

            {/* App 3: 预设 */}
            <button
              onClick={() => onNavigate('group-presets')}
              className="flex flex-col items-center gap-2 text-[10px] tracking-[0.4px] text-[var(--sub,#68625b)] active:scale-95 transition-transform group"
            >
              <div className="w-[54px] h-[54px] rounded-[21px] bg-[#f0ebe5] text-[#63584f] border border-[rgba(40,36,31,.08)] shadow-[0_6px_18px_rgba(52,43,34,.07)] grid place-items-center group-hover:scale-105 transition-transform relative">
                {appearance.appIcons['group-presets'] ? renderAppIcon('group-presets', 'card') : <span className="text-[18px] font-serif">预</span>}
              </div>
              <span className="font-semibold tracking-tight text-[var(--ink)]">预设</span>
            </button>

            {/* App 4: 查手机 */}
            <button 
              onClick={() => onNavigate('spy-phone')}
              className="flex flex-col items-center gap-2 text-[10px] tracking-[0.4px] text-[var(--sub,#68625b)] active:scale-95 transition-transform group"
            >
              <div className="w-[54px] h-[54px] rounded-[21px] bg-[#9b625b] text-white border-transparent shadow-[0_6px_18px_rgba(52,43,34,.07)] grid place-items-center group-hover:scale-105 transition-transform relative">
                {renderAppIcon('spy-phone', 'spy')}
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-white" />
              </div>
              <span className="font-semibold tracking-tight text-[var(--ink)]">查手机</span>
            </button>


            <button onClick={() => onNavigate('memory')} className="flex flex-col items-center gap-2 text-[10px] tracking-[0.4px] text-[var(--sub,#68625b)] active:scale-95 transition-transform group">
              <div className="w-[54px] h-[54px] rounded-[18px] bg-[#292724] text-white grid place-items-center group-hover:scale-105 transition-transform">{appearance.appIcons.memory ? renderAppIcon('memory', 'card') : <span className="font-serif text-[20px]">M</span>}</div>
              <span className="font-semibold tracking-tight text-[var(--ink)]">Memory</span>
            </button>
          </section>

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
          title="切换至第 2 页 (Threads · NPC · 预设 · 查手机)"
        />
      </div>

      {/* ========================================================================= */}
      {/* PERFECT FUSION DOCK (Persists across pages) */}
      <div 
        className="absolute z-20 left-[16px] right-[16px] bottom-[28px] h-[92px] rounded-[30px] border border-[var(--edge,rgba(255,255,255,.6))] shadow-[0_14px_38px_rgba(48,40,32,.08)] grid grid-cols-4 items-center px-2 backdrop-blur-2xl"
        style={{ background: 'var(--glass, rgba(248,246,242,.72))' }}
      >
        <button onClick={() => onNavigate('character-profile')} className="flex flex-col items-center gap-1.5 text-[10px] tracking-[0.4px] text-[var(--sub,#68625b)] hover:text-[var(--ink)] active:scale-95 transition-all group">
          <div className="w-[46px] h-[46px] rounded-[15px] bg-[var(--icon,rgba(248,245,239,.72))] border border-[var(--edge,rgba(255,255,255,.6))] shadow-[0_4px_12px_rgba(52,43,34,.05)] grid place-items-center group-hover:scale-105 group-hover:bg-white transition-all">
            {renderAppIcon('character-profile', 'card', 'w-[22px] h-[22px]')}
          </div>
          <span className="font-medium">角色档案</span>
        </button>

        <button onClick={() => onNavigate('world-book')} className="flex flex-col items-center gap-1.5 text-[10px] tracking-[0.4px] text-[var(--sub,#68625b)] hover:text-[var(--ink)] active:scale-95 transition-all group">
          <div className="w-[46px] h-[46px] rounded-[15px] bg-[var(--icon,rgba(248,245,239,.72))] border border-[var(--edge,rgba(255,255,255,.6))] shadow-[0_4px_12px_rgba(52,43,34,.05)] grid place-items-center group-hover:scale-105 group-hover:bg-white transition-all">
            {renderAppIcon('world-book', 'book', 'w-[22px] h-[22px]')}
          </div>
          <span className="font-medium">世界书</span>
        </button>

        <button onClick={() => onNavigate('appearance')} className="flex flex-col items-center gap-1.5 text-[10px] tracking-[0.4px] text-[var(--sub,#68625b)] hover:text-[var(--ink)] active:scale-95 transition-all group" title="打开外观设置">
          <div className="w-[46px] h-[46px] rounded-[15px] bg-[var(--icon,rgba(248,245,239,.72))] border border-[var(--edge,rgba(255,255,255,.6))] shadow-[0_4px_12px_rgba(52,43,34,.05)] grid place-items-center group-hover:scale-105 group-hover:bg-white transition-all text-[#8b7560]">
            {renderAppIcon('appearance', 'look', 'w-[22px] h-[22px]')}
          </div>
          <span className="font-medium">外观</span>
        </button>

        <button onClick={() => onNavigate('settings')} className="flex flex-col items-center gap-1.5 text-[10px] tracking-[0.4px] text-[var(--sub,#68625b)] hover:text-[var(--ink)] active:scale-95 transition-all group" title="系统设置与自定义">
          <div className="w-[46px] h-[46px] rounded-[15px] bg-[var(--icon,rgba(248,245,239,.72))] border border-[var(--edge,rgba(255,255,255,.6))] shadow-[0_4px_12px_rgba(52,43,34,.05)] grid place-items-center group-hover:scale-105 group-hover:bg-white transition-all">
            {renderAppIcon('settings', 'gear', 'w-[22px] h-[22px]')}
          </div>
          <span className="font-medium">设置</span>
        </button>
      </div>

    </div>
  );
}
