import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Copy, Palette, Plus, Sparkles, Trash2, Type, Wand2 } from 'lucide-react';
import type { ScreenType, ThemeMode } from '../../types';
import {
  applyAppearanceScheme,
  deleteAppearanceScheme,
  getAppearanceSchemes,
  readAppearance,
  saveAppearance,
  saveAppearanceScheme,
  type AppearanceScheme,
} from '../../store/appearance';

interface AppearanceScreenViewProps {
  currentTheme: ThemeMode;
  onNavigate: (screen: ScreenType) => void;
  onSelectTheme: (theme: ThemeMode) => void;
}

type Section = 'theme' | 'home' | 'widgets' | 'icons' | 'schemes';

const themeOptions: Array<{ id: ThemeMode; title: string; note: string }> = [
  { id: 'nordic-light', title: '胶片原色', note: '米白 / 纸张 / 安静' },
  { id: 'dark-luxury', title: '暗夜胶片', note: '黑 / 炭灰 / 夜间' },
  { id: 'ocean-breeze', title: '海蓝胶片', note: '灰蓝 / 清冷 / 空气感' },
];

export function AppearanceScreenView({ currentTheme, onNavigate, onSelectTheme }: AppearanceScreenViewProps) {
  const [section, setSection] = useState<Section>('theme');
  const [appearance, setAppearance] = useState<AppearanceScheme>(() => readAppearance());
  const [schemes, setSchemes] = useState<AppearanceScheme[]>(() => getAppearanceSchemes());
  const [schemeName, setSchemeName] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const sync = () => {
      setAppearance(readAppearance());
      setSchemes(getAppearanceSchemes());
    };
    window.addEventListener('sane333:appearance-changed', sync);
    return () => window.removeEventListener('sane333:appearance-changed', sync);
  }, []);

  const notify = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(''), 1800);
  };

  const update = <K extends keyof AppearanceScheme>(key: K, value: AppearanceScheme[K]) => {
    const next = saveAppearance({ [key]: value });
    setAppearance(next);
  };

  const updateWidget = (key: keyof AppearanceScheme['widget'], value: string | number) => {
    const next = saveAppearance({ widget: { ...appearance.widget, [key]: value } });
    setAppearance(next);
  };

  const updateIcon = (key: string, value: string) => {
    const next = saveAppearance({
      appIcons: { ...appearance.appIcons, [key]: value },
    });
    setAppearance(next);
  };

  const iconItems = [
    ['line', 'LINE'],
    ['moments', 'IG / Moments'],
    ['music', '音乐'],
    ['offline-story', '线下剧情'],
    ['character-profile', '角色档案'],
    ['world-book', '世界书'],
    ['appearance', '外观'],
    ['settings', '设置'],
    ['threads', 'Threads'],
    ['npc', 'NPC'],
    ['group-presets', '预设'],
    ['spy-phone', '查手机'],
    ['memory', 'Memory'],
  ] as const;

  const chooseTheme = (theme: ThemeMode) => {
    onSelectTheme(theme);
    update('themeMode', theme);
  };

  const saveScheme = () => {
    const saved = saveAppearanceScheme(schemeName);
    setSchemes(getAppearanceSchemes());
    setSchemeName('');
    notify('外观方案已保存');
  };

  const applyScheme = (id: string) => {
    const next = applyAppearanceScheme(id);
    setAppearance(next);
    onSelectTheme(next.themeMode);
    setSchemes(getAppearanceSchemes());
    notify('方案已应用');
  };

  const removeScheme = (id: string) => {
    if (!window.confirm('删除这套外观方案？')) return;
    deleteAppearanceScheme(id);
    setSchemes(getAppearanceSchemes());
    notify('方案已删除');
  };

  const navItems = useMemo(() => [
    ['theme', '主题', Palette],
    ['home', '文字', Type],
    ['widgets', '小组件', Wand2],
    ['icons', '图标', Sparkles],
    ['schemes', '方案', Copy],
  ] as const, []);

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
      <header className="pt-11 px-5 pb-3 border-b border-black/10 bg-[#f7f4ee]/95">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('home')} className="w-8 h-8 rounded-full bg-white/70 grid place-items-center">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <div className="text-[8px] font-mono tracking-[2px] text-[#8b8782]">PERSONAL DEVICE · APPEARANCE</div>
            <h1 className="m-0 text-[18px] font-semibold tracking-tight">Appearance</h1>
          </div>
          <div className="text-[8px] font-mono text-[#8b8782]">CUSTOM</div>
        </div>
        <div className="grid grid-cols-4 gap-1 mt-3">
          {navItems.map(([id, label, Icon]) => (
            <button key={id} onClick={() => setSection(id)} className={section === id ? 'py-2 rounded-xl bg-[#292724] text-white text-[8px]' : 'py-2 rounded-xl text-[#777069] text-[8px] bg-white/40'}>
              <Icon className="w-3.5 h-3.5 mx-auto mb-0.5" />
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="h-[calc(100%-105px)] overflow-y-auto no-scrollbar p-3.5 pb-8 space-y-2.5">
        {section === 'theme' && (
          <>
            <div className="p-3.5 rounded-2xl bg-[#ebe6de] border border-black/5">
              <div className="text-[9px] font-mono tracking-[1.5px] text-[#8b8782]">THEME PRESETS</div>
              <div className="mt-1 text-[12px] font-semibold">不改变首页布局，只改变它的外观系统。</div>
              <div className="mt-1 text-[9px] text-[#777069]">颜色、纸张感和整体氛围都可以换；已经确认的 LINE UI 不受影响。</div>
            </div>
            <div className="grid gap-2">
              {themeOptions.map(option => (
                <button key={option.id} onClick={() => chooseTheme(option.id)} className={currentTheme === option.id ? 'p-3 rounded-2xl bg-[#292724] text-white text-left' : 'p-3 rounded-2xl bg-white/65 border border-black/5 text-left'}>
                  <div className="flex items-center justify-between">
                    <b className="text-[11px]">{option.title}</b>
                    {currentTheme === option.id && <Check className="w-3.5 h-3.5" />}
                  </div>
                  <div className={currentTheme === option.id ? 'mt-1 text-[8px] text-white/65' : 'mt-1 text-[8px] text-[#8b8782]'}>{option.note}</div>
                </button>
              ))}
            </div>
            <div className="p-3 rounded-2xl bg-white/65 border border-black/5">
              <label className="text-[9px] block">壁纸 / 背景图片 URL
                <input value={appearance.wallpaper} onChange={event => update('wallpaper', event.target.value)} placeholder="留空使用当前纸张背景" className="mt-1 w-full p-2.5 rounded-xl bg-white/80 text-[9px] outline-none" />
              </label>
              <div className="mt-2 text-[8px] text-[#8b8782]">后续可以扩展为图片资源库；现在先保留轻量 URL 配置。</div>
            </div>
          </>
        )}

        {section === 'home' && (
          <>
            <div className="p-3 rounded-2xl bg-white/65 border border-black/5 space-y-2.5">
              <label className="text-[9px] block">手机名称
                <input value={appearance.appTitle} onChange={event => update('appTitle', event.target.value)} placeholder="Sane333" className="mt-1 w-full p-2.5 rounded-xl bg-white/80 text-[10px] outline-none" />
              </label>
              <label className="text-[9px] block">首页问候
                <input value={appearance.greeting} onChange={event => update('greeting', event.target.value)} placeholder="GOOD EVENING · PRIVATE DEVICE" className="mt-1 w-full p-2.5 rounded-xl bg-white/80 text-[9px] outline-none" />
              </label>
              <label className="text-[9px] block">副标题 / 私人设备文案
                <textarea value={appearance.subtitle} onChange={event => update('subtitle', event.target.value)} className="mt-1 w-full h-20 p-2.5 rounded-xl bg-white/80 text-[9px] outline-none resize-none" />
              </label>
            </div>
          </>
        )}

        {section === 'widgets' && (
          <div className="p-3 rounded-2xl bg-white/65 border border-black/5 space-y-2">
            {([
              ['weatherCity', '天气城市', 'text'],
              ['weatherTemp', '温度', 'text'],
              ['weatherCondition', '天气状态', 'text'],
              ['weatherHighLow', '高低温', 'text'],
              ['quoteContent', '便签 / Quote', 'text'],
              ['quoteAuthor', 'Quote 作者', 'text'],
              ['musicTitle', '音乐标题', 'text'],
              ['musicArtist', '音乐副标题', 'text'],
              ['anniversaryDays', '纪念日天数', 'number'],
              ['anniversaryText', '纪念日标题', 'text'],
            ] as const).map(([key, label, type]) => (
              <label key={key} className="text-[9px] block">
                {label}
                <input type={type} value={appearance.widget[key]} onChange={event => updateWidget(key, type === 'number' ? Number(event.target.value) || 0 : event.target.value)} className="mt-1 w-full p-2.5 rounded-xl bg-white/80 text-[9px] outline-none" />
              </label>
            ))}
          </div>
        )}

        {section === 'icons' && (
          <>
            <div className="p-3 rounded-2xl bg-[#ebe6de] border border-black/5">
              <div className="text-[9px] font-mono tracking-[1.5px] text-[#8b8782]">APP ICONS</div>
              <div className="mt-1 text-[11px] font-semibold">自定义应用图标</div>
              <div className="mt-1 text-[8px] leading-relaxed text-[#777069]">
                填图片 URL 即可替换对应图标；留空恢复原来的内置线稿。默认图标和已经确认好的首页布局不会改变。
              </div>
            </div>
            <div className="space-y-1.5">
              {iconItems.map(([key, label]) => (
                <div key={key} className="p-2.5 rounded-2xl bg-white/65 border border-black/5 flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-[#ebe7df] border border-black/5 overflow-hidden shrink-0 grid place-items-center">
                    {appearance.appIcons[key] ? (
                      <img src={appearance.appIcons[key]} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[8px] font-mono text-[#8b8782]">DEFAULT</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-semibold">{label}</div>
                    <input
                      value={appearance.appIcons[key] || ''}
                      onChange={event => updateIcon(key, event.target.value)}
                      placeholder="图片链接"
                      className="mt-1 w-full p-2 rounded-xl bg-white/80 text-[8px] outline-none"
                    />
                  </div>
                  <button
                    onClick={() => updateIcon(key, '')}
                    className="px-2 py-1.5 rounded-lg bg-[#ebe7df] text-[8px] text-[#777069]"
                  >
                    重置
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {section === 'schemes' && (
          <>
            <div className="p-3 rounded-2xl bg-[#ebe6de] border border-black/5">
              <div className="text-[9px] font-mono tracking-[1.5px] text-[#8b8782]">APPEARANCE SCHEMES</div>
              <div className="mt-1 text-[9px] text-[#777069]">把当前整套外观保存下来，之后可以一键切换。</div>
            </div>
            <div className="flex gap-1.5">
              <input value={schemeName} onChange={event => setSchemeName(event.target.value)} placeholder="例如：London Film" className="flex-1 p-2.5 rounded-xl bg-white text-[9px] outline-none" />
              <button onClick={saveScheme} className="px-3 rounded-xl bg-[#292724] text-white text-[9px]"><Plus className="w-3 h-3 inline mr-1" />保存</button>
            </div>
            <div className="space-y-1.5">
              {schemes.map(scheme => (
                <div key={scheme.id} className="p-3 rounded-2xl bg-white/65 border border-black/5 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <b className="text-[10px] block truncate">{scheme.name}</b>
                    <span className="text-[8px] text-[#8b8782]">{scheme.themeMode} · {scheme.appTitle}</span>
                  </div>
                  <button onClick={() => applyScheme(scheme.id)} className="px-2.5 py-1.5 rounded-lg bg-[#292724] text-white text-[8px]">应用</button>
                  {scheme.id !== 'default' && <button onClick={() => removeScheme(scheme.id)} className="w-7 h-7 rounded-lg bg-[#f5e8e4] text-[#8d4e4e] grid place-items-center"><Trash2 className="w-3 h-3" /></button>}
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {notice && <div className="absolute bottom-5 left-4 right-4 z-30 p-2.5 rounded-xl bg-[#292724] text-white text-[9px] text-center">{notice}</div>}
    </div>
  );
}
