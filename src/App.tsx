import { useEffect, useState } from 'react';
import { ThemeMode, ScreenType } from './types';
import { PhoneSimulator } from './components/PhoneSimulator';
import { cleanupOldDemoData } from './store/blankPhoneMigration';

export default function App() {
  const release = '2026.10.06-line-openings-v1';
  const [themeMode, setThemeMode] = useState<ThemeMode>('nordic-light');
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('home');
  const [showUpdate, setShowUpdate] = useState(false);

  useEffect(() => {
    cleanupOldDemoData();
    const seen = window.localStorage.getItem('sane333:last-seen-release');
    if (seen !== release) setShowUpdate(true);
    const marker = 'sane333:blank-foundation-v1';
    if (!window.localStorage.getItem(marker)) {
      for (const key of [
        'line:masks',
        'line:current-user',
        'line:chat-items',
        'line:friends-list',
        'line:global-favorites',
        'line:moments-posts',
        'line:moments-screen-posts',
        'phone:threads',
        'phone:notes',
        'phone:gallery',
        'phone:world-runtime-v1',
      ]) {
        window.localStorage.removeItem(key);
      }
      window.localStorage.setItem(marker, 'done');
    }
  }, []);

  return (
    <>
    <main className="min-h-screen w-full bg-[#eeeae4] flex items-center justify-center overflow-hidden">
      <PhoneSimulator
        themeMode={themeMode}
        currentScreen={currentScreen}
        setCurrentScreen={setCurrentScreen}
        onSelectTheme={setThemeMode}
      />
    </main>
    {showUpdate && (
      <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/25 px-6 backdrop-blur-sm">
        <div className="w-full max-w-[360px] rounded-[30px] bg-[#f8f6f1] p-6 shadow-2xl border border-black/5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[9px] font-mono tracking-[2px] text-black/35">SANE333 · UPDATE</div>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#292724]">这次更新了什么？</h2>
            </div>
            <button onClick={() => setShowUpdate(false)} className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center"><span className="text-lg">×</span></button>
          </div>
          <div className="mt-5 space-y-3 text-[11px] leading-5 text-black/65">
            <div><b className="text-black/80">LINE · 聊天修复</b><br/>修复添加角色后进入聊天时可能打不开的问题，并继续保护过期聊天入口。</div>
            <div><b className="text-black/80">ABOUT · 角色设定</b><br/>ABOUT 与角色设定合并成一个可折叠区域，页面更干净。</div>
            <div><b className="text-black/80">角色卡 · 开场白</b><br/>导入酒馆角色卡时保留 first message 与所有 alternate greetings。</div>
            <div><b className="text-black/80">LINE · 开场背景</b><br/>添加聊天时可以选择“不读取”或把某个开场白作为前情提要，不会自动冒充角色发消息。</div>
            <div><b className="text-black/80">线下剧情 · Story Openings</b><br/>每次线下剧情都可以从角色卡任意一个开场白开始，也可以完全不使用。</div>
          </div>
          <div className="mt-5 flex items-center justify-between text-[8px] font-mono text-black/30">
            <span>release {release}</span>
            <button onClick={() => { window.localStorage.setItem('sane333:last-seen-release', release); setShowUpdate(false); }} className="rounded-full bg-[#292724] px-5 py-2.5 text-white tracking-[1px]">知道了 · ENTER</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
