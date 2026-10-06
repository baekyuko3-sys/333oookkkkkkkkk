import { useEffect, useState } from 'react';
import { ThemeMode, ScreenType } from './types';
import { PhoneSimulator } from './components/PhoneSimulator';
import { cleanupOldDemoData } from './store/blankPhoneMigration';

export default function App() {
  const release = '2026.10.06-worldbook-picker-v2';
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
            <div><b className="text-black/80">世界书 · 角色绑定</b><br/>现在可以在角色档案里自己勾选这个角色要使用的世界书。每个角色可以选择不同的世界书组合，AI 只会读取已勾选的内容。</div>
            <div><b className="text-black/80">角色卡世界书</b><br/>增强酒馆角色卡的内置世界书识别与导入，并自动记录世界书来自哪个角色。</div>
            <div><b className="text-black/80">世界书管理</b><br/>世界书页面加入管理、删除、启用/停用和可折叠的信息区，角色卡导入的世界书也更容易区分。</div>
            <div><b className="text-black/80">LINE</b><br/>好友关系新增“重新加回”：被删除、被拉黑、互删后重新加回，并修复过期聊天入口导致的白屏风险。</div>
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
