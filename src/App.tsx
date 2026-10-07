import { useEffect, useState } from 'react';
import { ThemeMode, ScreenType } from './types';
import { PhoneSimulator } from './components/PhoneSimulator';
import { cleanupOldDemoData } from './store/blankPhoneMigration';

export default function App() {
  const release = '2026.10.07-chat-settings-v1';
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
        <div className="w-full max-w-[360px] max-h-[min(88vh,680px)] overflow-hidden rounded-[30px] bg-[#f8f6f1] p-6 shadow-2xl border border-black/5 flex flex-col">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[9px] font-mono tracking-[2px] text-black/35">SANE333 · UPDATE</div>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#292724]">这次更新了什么？</h2>
            </div>
            <button onClick={() => { window.localStorage.setItem('sane333:last-seen-release', release); setShowUpdate(false); }} className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center"><span className="text-lg">×</span></button>
          </div>
          <div className="mt-5 max-h-[min(52vh,390px)] overflow-y-auto pr-1 space-y-3 text-[11px] leading-5 text-black/65">
            <div><b className="text-black/80">聊天设定 · 主动行为</b><br/>把角色主动发消息、主动发 VROOM、主动发起线下邀约统一放进当前聊天的设定里。</div>
            <div><b className="text-black/80">聊天设定 · 独立权限</b><br/>这三个行为按“角色 × 当前聊天”分别保存，不再作为全局开关。</div>
            <div><b className="text-black/80">聊天设定 · 主动行为日程</b><br/>主动消息、VROOM、线下邀约的日程统一从聊天设定进入，加号菜单不再重复放入口。</div>
            <div><b className="text-black/80">聊天设定 · 折叠</b><br/>API、主动行为、日程、聊天偏好、显示工具、CoT、Author's Note 等设置都可以单独展开或收起。</div>
          </div>
          <div className="mt-5 flex items-center justify-between text-[10px] text-black/35">
            <span>release {release}</span>
            <button onClick={() => { window.localStorage.setItem('sane333:last-seen-release', release); setShowUpdate(false); }} className="rounded-full bg-[#292724] px-5 py-2.5 text-white tracking-[1px]">知道了 · ENTER</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
