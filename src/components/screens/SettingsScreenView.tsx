import { useEffect, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Database, KeyRound, Palette, SlidersHorizontal, UserCircle } from 'lucide-react';
import { ScreenType, ThemeMode } from '../../types';
import { DEFAULT_PHONE_SETTINGS, loadPhoneSettings, savePhoneSettings, PhoneSettings, resetPhoneSettings } from '../../store/settings';

interface SettingsScreenViewProps {
  onNavigate: (screen: ScreenType) => void;
  themeMode: ThemeMode;
  onSelectTheme: (theme: ThemeMode) => void;
}

type Page = 'main' | 'api' | 'identity' | 'appearance' | 'data' | 'system';

export function SettingsScreenView({ onNavigate, themeMode, onSelectTheme }: SettingsScreenViewProps) {
  const [page, setPage] = useState<Page>('main');
  const [settings, setSettings] = useState<PhoneSettings>(DEFAULT_PHONE_SETTINGS);

  useEffect(() => {
    setSettings(loadPhoneSettings());
  }, []);

  const update = <K extends keyof PhoneSettings>(key: K, value: PhoneSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      savePhoneSettings(next);
      return next;
    });
  };

  const Row = ({ icon: Icon, title, desc, onClick }: { icon: any; title: string; desc: string; onClick: () => void }) => (
    <button onClick={onClick} className="w-full flex items-center gap-3 p-3.5 rounded-[18px] bg-white/75 border border-[#e1dbd3] text-left active:scale-[.99]">
      <div className="w-9 h-9 rounded-[12px] bg-[#f0ece5] grid place-items-center text-[#806b58]">
        <Icon className="w-4 h-4 stroke-[1.5]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold">{title}</div>
        <div className="mt-0.5 text-[9px] text-[#8b8782] truncate">{desc}</div>
      </div>
      <ChevronRight className="w-4 h-4 text-[#a39d96]" />
    </button>
  );

  const Header = ({ title }: { title: string }) => (
    <div className="relative z-10 px-5 pt-12 pb-3 border-b border-[#ddd6cd] bg-[rgba(247,244,238,.92)] backdrop-blur-xl flex items-center gap-3">
      <button onClick={() => page === 'main' ? onNavigate('home') : setPage('main')} className="w-8 h-8 rounded-full bg-white/60 border border-white/70 grid place-items-center active:scale-95">
        <ArrowLeft className="w-4 h-4" />
      </button>
      <div>
        <div className="text-[8px] font-mono tracking-[2px] text-[#817a72]">PHONE SETTINGS</div>
        <h2 className="font-serif font-bold text-[16px]">{title}</h2>
      </div>
    </div>
  );

  if (page === 'main') {
    return (
      <div className="relative w-full h-full overflow-hidden" style={{ background: 'var(--screen, #fff)', color: 'var(--ink)' }}>
        <Header title="设置" />
        <div className="relative z-10 flex-1 overflow-y-auto p-4 pb-8 space-y-2.5 no-scrollbar">
          <div className="px-1 pb-1">
            <div className="text-[9px] font-mono tracking-[1.7px] text-[#8b8782]">SYSTEM</div>
            <div className="mt-1 text-[11px] text-[#6f6a63]">这里管理整个小手机的基础配置。当前没有预设 API、身份或世界观。</div>
          </div>

          <Row icon={KeyRound} title="API 设置" desc={settings.apiProvider || '尚未配置接口'} onClick={() => setPage('api')} />
          <Row icon={UserCircle} title="个人设定" desc={settings.userName || '尚未填写个人资料'} onClick={() => setPage('identity')} />
          <Row icon={Palette} title="外观" desc={themeMode === 'dark-luxury' ? '暗夜胶片' : themeMode === 'ocean-breeze' ? '海蓝胶片' : '胶片原色'} onClick={() => setPage('appearance')} />
          <Row icon={SlidersHorizontal} title="系统选项" desc={settings.timeAware ? '真实时间感知 · 开启' : '真实时间感知 · 关闭'} onClick={() => setPage('system')} />
          <Row icon={Database} title="数据管理" desc="查看、导出或清空本地资料" onClick={() => setPage('data')} />

          <div className="mt-5 rounded-[18px] border border-dashed border-[#d4cbbf] bg-[#f7f3ec] p-4">
            <div className="text-[8px] font-mono tracking-[1.6px] text-[#9a938a]">EMPTY BY DESIGN</div>
            <div className="mt-1 font-serif font-semibold text-[13px]">设置可以是空的，但不能没有结构。</div>
            <div className="mt-1 text-[9px] leading-relaxed text-[#8b8782]">所有字段都等你自己填写。保存后会留在这台设备的本地存储里。</div>
          </div>
        </div>
      </div>
    );
  }

  if (page === 'api') {
    return (
      <div className="relative w-full h-full overflow-hidden" style={{ background: 'var(--screen)', color: 'var(--ink)' }}>
        <Header title="API 设置" />
        <div className="relative z-10 flex-1 overflow-y-auto p-4 pb-8 no-scrollbar">
          <div className="text-[9px] font-mono tracking-[1.6px] text-[#8b8782]">CONNECTION</div>
          <p className="mt-1 text-[10px] text-[#8b8782]">只保存配置，不会自动填入任何平台或密钥。</p>
          <label className="block mt-4 text-[9px] font-mono text-[#8b8782]">提供方 / Provider</label>
          <input value={settings.apiProvider} onChange={e => update('apiProvider', e.target.value)} placeholder="例如 OpenAI / Gemini / 自建中转" className="mt-1 w-full h-10 rounded-xl border border-[#d8d0c5] bg-white px-3 text-[11px] outline-none" />
          <label className="block mt-3 text-[9px] font-mono text-[#8b8782]">Base URL</label>
          <input value={settings.apiBaseUrl} onChange={e => update('apiBaseUrl', e.target.value)} placeholder="https://..." className="mt-1 w-full h-10 rounded-xl border border-[#d8d0c5] bg-white px-3 text-[11px] outline-none" />
          <label className="block mt-3 text-[9px] font-mono text-[#8b8782]">API Key</label>
          <input type="password" value={settings.apiKey} onChange={e => update('apiKey', e.target.value)} placeholder="留空" className="mt-1 w-full h-10 rounded-xl border border-[#d8d0c5] bg-white px-3 text-[11px] outline-none" />
          <label className="block mt-3 text-[9px] font-mono text-[#8b8782]">Model</label>
          <input value={settings.model} onChange={e => update('model', e.target.value)} placeholder="留空，之后再填" className="mt-1 w-full h-10 rounded-xl border border-[#d8d0c5] bg-white px-3 text-[11px] outline-none" />
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#f7f3ec] p-3 text-[9px] text-[#8b8782]">
            <Check className="w-3.5 h-3.5 text-[#8b7560]" /> 修改后会自动保存到本机。
          </div>
        </div>
      </div>
    );
  }

  if (page === 'identity') {
    return (
      <div className="relative w-full h-full overflow-hidden" style={{ background: 'var(--screen)', color: 'var(--ink)' }}>
        <Header title="个人设定" />
        <div className="relative z-10 flex-1 overflow-y-auto p-4 pb-8 no-scrollbar">
          <div className="text-[9px] font-mono tracking-[1.6px] text-[#8b8782]">MY PROFILE</div>
          <label className="block mt-4 text-[9px] font-mono text-[#8b8782]">显示名称</label>
          <input value={settings.userName} onChange={e => update('userName', e.target.value)} placeholder="你的名字 / 昵称" className="mt-1 w-full h-10 rounded-xl border border-[#d8d0c5] bg-white px-3 text-[11px] outline-none" />
          <label className="block mt-3 text-[9px] font-mono text-[#8b8782]">个人简介</label>
          <textarea value={settings.userBio} onChange={e => update('userBio', e.target.value)} rows={6} placeholder="可选。这里是你的个人身份说明，不是角色设定。" className="mt-1 w-full rounded-xl border border-[#d8d0c5] bg-white p-3 text-[11px] outline-none resize-none" />
          <div className="mt-4 rounded-xl bg-[#f7f3ec] p-3 text-[9px] text-[#8b8782]">个人资料与角色资料分开管理。</div>
        </div>
      </div>
    );
  }

  if (page === 'appearance') {
    const themes: { id: ThemeMode; label: string; desc: string }[] = [
      { id: 'nordic-light', label: '胶片原色', desc: '米白、纸张、暖灰' },
      { id: 'dark-luxury', label: '暗夜胶片', desc: '深黑、低饱和、夜间阅读' },
      { id: 'ocean-breeze', label: '海蓝胶片', desc: '清透蓝、冷白、轻量感' },
    ];
    return (
      <div className="relative w-full h-full overflow-hidden" style={{ background: 'var(--screen)', color: 'var(--ink)' }}>
        <Header title="外观" />
        <div className="relative z-10 flex-1 overflow-y-auto p-4 pb-8 space-y-2.5 no-scrollbar">
          {themes.map(item => (
            <button key={item.id} onClick={() => onSelectTheme(item.id)} className={`w-full p-4 rounded-[18px] border text-left ${themeMode === item.id ? 'bg-[#292724] text-white border-[#292724]' : 'bg-white/75 border-[#ded7cd]'}`}>
              <div className="flex items-center justify-between">
                <div className="text-[12px] font-semibold">{item.label}</div>
                {themeMode === item.id && <Check className="w-4 h-4" />}
              </div>
              <div className={`mt-1 text-[9px] ${themeMode === item.id ? 'text-white/60' : 'text-[#8b8782]'}`}>{item.desc}</div>
            </button>
          ))}
          <button onClick={() => onNavigate('home')} className="mt-3 w-full h-10 rounded-xl border border-[#d8d0c5] bg-white text-[11px]">返回主屏幕</button>
        </div>
      </div>
    );
  }

  if (page === 'system') {
    return (
      <div className="relative w-full h-full overflow-hidden" style={{ background: 'var(--screen)', color: 'var(--ink)' }}>
        <Header title="系统选项" />
        <div className="relative z-10 flex-1 overflow-y-auto p-4 pb-8 no-scrollbar space-y-2.5">
          <button onClick={() => update('timeAware', !settings.timeAware)} className="w-full p-4 rounded-[18px] bg-white/75 border border-[#ded7cd] flex items-center justify-between">
            <div className="text-left"><div className="text-[12px] font-semibold">真实时间感知</div><div className="mt-1 text-[9px] text-[#8b8782]">让剧情功能读取设备当前时间。</div></div>
            <span className={`w-10 h-6 rounded-full p-0.5 ${settings.timeAware ? 'bg-[#292724]' : 'bg-[#d1cbc3]'}`}><span className={`block w-5 h-5 rounded-full bg-white transition-transform ${settings.timeAware ? 'translate-x-4' : ''}`}/></span>
          </button>
          <button onClick={() => update('soundEnabled', !settings.soundEnabled)} className="w-full p-4 rounded-[18px] bg-white/75 border border-[#ded7cd] flex items-center justify-between">
            <div className="text-left"><div className="text-[12px] font-semibold">音效</div><div className="mt-1 text-[9px] text-[#8b8782]">控制手机交互音效的总开关。</div></div>
            <span className={`w-10 h-6 rounded-full p-0.5 ${settings.soundEnabled ? 'bg-[#292724]' : 'bg-[#d1cbc3]'}`}><span className={`block w-5 h-5 rounded-full bg-white transition-transform ${settings.soundEnabled ? 'translate-x-4' : ''}`}/></span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: 'var(--screen)', color: 'var(--ink)' }}>
      <Header title="数据管理" />
      <div className="relative z-10 flex-1 overflow-y-auto p-4 pb-8 no-scrollbar">
        <div className="rounded-[18px] border border-[#ded7cd] bg-white/75 p-4">
          <div className="text-[12px] font-semibold">本地数据</div>
          <div className="mt-1 text-[9px] text-[#8b8782]">角色、世界书、设置等资料保存在浏览器本地。</div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button onClick={() => {
              const payload = {
                npcs: localStorage.getItem('phone:npcs'),
                worldbooks: localStorage.getItem('phone:worldbooks'),
                settings: localStorage.getItem('phone:settings'),
              };
              const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'virtual-phone-data.json';
              a.click();
              URL.revokeObjectURL(url);
            }} className="h-10 rounded-xl bg-[#292724] text-white text-[10px]">导出数据</button>
            <button onClick={() => {
              if (!window.confirm('确定清空角色、世界书与设置？此操作不可撤销。')) return;
              localStorage.removeItem('phone:npcs');
              localStorage.removeItem('phone:worldbooks');
              resetPhoneSettings();
              window.location.reload();
            }} className="h-10 rounded-xl bg-[#f0e6e2] text-[#9b625b] text-[10px]">清空资料</button>
          </div>
        </div>
      </div>
    </div>
  );
}
