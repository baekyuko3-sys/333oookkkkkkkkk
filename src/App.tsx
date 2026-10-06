import { useEffect, useState } from 'react';
import { ThemeMode, ScreenType } from './types';
import { PhoneSimulator } from './components/PhoneSimulator';
import { cleanupOldDemoData } from './store/blankPhoneMigration';

export default function App() {
  const release = '2026.10.06-line-v3';
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
            <button onClick={() => { window.localStorage.setItem('sane333:last-seen-release', release); setShowUpdate(false); }} className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center"><span className="text-lg">×</span></button>
          </div>
          <div className="mt-5 space-y-3 text-[11px] leading-5 text-black/65">
            <div><b className="text-black/80">LINE · 聊天发送逻辑</b><br/>Enter / 手机键盘回车只发送你的消息；点击纸飞机才会触发角色回复。修复等待回复时出现空白白气泡的问题，并保留左滑消息操作。</div>
            <div><b className="text-black/80">LINE · 气泡与输入状态</b><br/>短句会分开成独立气泡，连续长文本保持完整；补回头像显示，并把“texting....”换成真正的三点动态输入状态。</div>
            <div><b className="text-black/80">LINE · 工具与设置</b><br/>搜索聊天记录、记忆、我的头像显示开关移到聊天设置；“让角色继续说”放进 ＋ 菜单；通话入口保留但未开发时会明确提示。</div>
            <div><b className="text-black/80">角色卡 · 导入确认</b><br/>导入 PNG / JSON / YAML / YML 后，现在会出现完整确认卡：角色、来源、版本、FIRST MESSAGE、alternate greetings、世界书数量都会直接显示。</div>
            <div><b className="text-black/80">角色卡 · 开场白</b><br/>保留 first message 与所有 alternate greetings。创建 LINE 聊天时可选择“不读取”或指定某个开场白作为前情提要；不会自动把它冒充成角色消息。</div>
            <div><b className="text-black/80">LINE · ABOUT</b><br/>好友资料里的 ABOUT 现在统一展示角色简介、性格、当前场景与私人备注，不再拆成重复的角色设定页面。</div>
            <div><b className="text-black/80">角色头像</b><br/>角色头像只使用你上传的本地图片或你提供的图片链接，不再偷偷替换成预设人物图。</div>
            <div><b className="text-black/80">世界书 · 条目可见性</b><br/>修复世界书条目区域被布局挤掉的问题，现在可以直接看到条目列表和当前选中的 ENTRY。</div>
            <div><b className="text-black/80">线下剧情 · Story Openings</b><br/>每次线下剧情都可以从角色卡的任意开场白开始，也可以选择完全不使用。</div>
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
