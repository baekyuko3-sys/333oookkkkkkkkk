import { useEffect, useState } from 'react';
import { ThemeMode, ScreenType } from '../types';
import { SaneHomeScreenView } from './screens/SaneHomeScreenView';
import { ChatScreenView } from './screens/ChatScreenView';
import { InboxScreenView } from './screens/InboxScreenView';
import { CharacterProfileView } from './screens/CharacterProfileView';
import { MomentsScreenView } from './screens/MomentsScreenView';
import { GalleryScreenView } from './screens/GalleryScreenView';
import { MusicScreenView } from './screens/MusicScreenView';
import { NotesScreenView } from './screens/NotesScreenView';
import { ThreadsScreenView } from './screens/ThreadsScreenView';
import { SpyPhoneScreenView } from './screens/SpyPhoneScreenView';
import { WorldBookScreenView } from './screens/WorldBookScreenView';
import { SettingsScreenView } from './screens/SettingsScreenView';
import { ProjectStudioScreenView } from './screens/ProjectStudioScreenView';
import { MemoryScreenView } from './screens/MemoryScreenView';
import { AppearanceScreenView } from './screens/AppearanceScreenView';
import { OfflineStoryScreenView } from './screens/OfflineStoryScreenView';
import { CalendarScreenView } from './screens/CalendarScreenView';
import { NpcScreenView } from './screens/NpcScreenView';
import { GroupPresetScreenView } from './screens/GroupPresetScreenView';
import { LineAppView } from './line/LineAppView';
import { LockScreenView } from './screens/LockScreenView';
import { HomeCustomizeSheet } from './modals/HomeCustomizeSheet';
import { playAppSound, type AppSoundKind } from '../store/soundManager';
import { runProactiveCatchup } from '../store/proactiveRuntime';

interface PhoneSimulatorProps {
  themeMode: ThemeMode;
  currentScreen: ScreenType;
  setCurrentScreen: (screen: ScreenType) => void;
  onSelectTheme: (theme: ThemeMode) => void;
}

export function PhoneSimulator({
  themeMode,
  currentScreen,
  setCurrentScreen,
  onSelectTheme,
}: PhoneSimulatorProps) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const isDark = themeMode === 'dark-luxury';

  const handleToggleTheme = () => {
    onSelectTheme(isDark ? 'nordic-light' : 'dark-luxury');
  };

  useEffect(() => {
    // The phone itself owns the world clock: proactive messages can arrive
    // while the user is on Home, Music, Notes, etc. — not only inside LINE.
    void runProactiveCatchup();
    const interval = window.setInterval(() => {
      void runProactiveCatchup();
    }, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleSound = (event: Event) => {
      const custom = event as CustomEvent<{ kind?: AppSoundKind }>;
      const kind = custom.detail?.kind;
      if (kind) void playAppSound(kind);
    };
    const handleProactive = () => { void playAppSound('message'); };
    const handleIncomingCall = () => { void playAppSound('call'); };
    window.addEventListener('sane333:play-sound', handleSound as EventListener);
    window.addEventListener('sane333:proactive-message', handleProactive);
    window.addEventListener('sane333:incoming-call', handleIncomingCall);
    return () => {
      window.removeEventListener('sane333:play-sound', handleSound as EventListener);
      window.removeEventListener('sane333:proactive-message', handleProactive);
      window.removeEventListener('sane333:incoming-call', handleIncomingCall);
    };
  }, []);

  return (
    <div className="relative mx-auto flex flex-col items-center">
      
      {/* Authentic Physical Phone Chassis (Exact CSS from user template) */}
      <div 
        data-theme={isDark ? 'dark' : 'light'}
        className={`relative w-[360px] sm:w-[390px] h-[780px] sm:h-[844px] overflow-hidden rounded-[43px] border-[7px] border-[var(--frame,#1e1d1b)] shadow-[0_30px_100px_rgba(20,18,15,.28)] flex flex-col select-none ${
          isDark ? 'dark-theme-mode' : ''
        }`}
        style={{ background: 'var(--screen, #ffffff)', color: 'var(--ink, #242323)' }}
      >
        
        {/* Statusbar (Exact from user template) */}
        <div className="absolute z-20 top-0 left-0 right-0 h-[42px] flex items-center justify-between px-6 text-[12px] font-[650] tracking-[0.2px] text-[var(--ink)]">
          <span>9:41</span>
          
          {/* Dynamic Island pill */}
          <div 
            onClick={() => setCurrentScreen(currentScreen === 'music' ? 'home' : 'music')}
            className="absolute top-2 left-1/2 -translate-x-1/2 w-[104px] h-[29px] rounded-[18px] bg-[#181817] shadow-[0_3px_12px_rgba(0,0,0,.18)] flex items-center justify-center cursor-pointer hover:scale-105 transition-transform"
            title="点击灵动岛"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse mr-1" />
            <span className="text-[9px] font-sans text-white/90">PRIVATE</span>
          </div>

          <div className="flex items-center gap-[7px]">
            <span className="text-[11px]">⌁</span>
            <span className="text-[11px] font-normal">Wi‑Fi</span>
            {/* Battery icon with inner fill */}
            <div className="w-[21px] h-[10px] border-[1.4px] border-current rounded-[3px] relative">
              <div className="absolute -right-[3px] top-[2.5px] w-[2px] h-[4px] bg-current rounded-[1px]" />
              <div className="w-[72%] h-full bg-current rounded-[1px]" />
            </div>
          </div>
        </div>

        {/* Screen Content Viewport */}
        <div className="flex-1 relative overflow-hidden">
          {currentScreen === 'home' && (
            <SaneHomeScreenView
              onNavigate={setCurrentScreen}
              onOpenSheet={() => setIsSheetOpen(true)}
              onToggleTheme={handleToggleTheme}
            />
          )}

          {(currentScreen === 'chat' || currentScreen === 'inbox') && (
            <LineAppView
              onNavigateHome={() => setCurrentScreen('home')}
              onNavigateScreen={setCurrentScreen}
            />
          )}

          {currentScreen === 'character-profile' && (
            <CharacterProfileView
              themeMode={themeMode}
              onNavigate={setCurrentScreen}
            />
          )}

          {currentScreen === 'moments' && (
            <MomentsScreenView
              themeMode={themeMode}
              onNavigate={setCurrentScreen}
            />
          )}

          {currentScreen === 'gallery' && (
            <GalleryScreenView
              themeMode={themeMode}
              onNavigate={setCurrentScreen}
            />
          )}

          {currentScreen === 'music' && (
            <MusicScreenView
              themeMode={themeMode}
              onNavigate={setCurrentScreen}
            />
          )}

          {currentScreen === 'threads' && (
            <ThreadsScreenView
              onNavigate={setCurrentScreen}
            />
          )}

          {currentScreen === 'spy-phone' && (
            <SpyPhoneScreenView
              onNavigate={setCurrentScreen}
            />
          )}

          {currentScreen === 'notes' && (
            <NotesScreenView
              themeMode={themeMode}
              onNavigate={setCurrentScreen}
            />
          )}

          {currentScreen === 'world-book' && (
            <WorldBookScreenView onNavigate={setCurrentScreen} />
          )}

          {currentScreen === 'settings' && (
            <SettingsScreenView onNavigate={setCurrentScreen} />
          )}

          {currentScreen === 'project-studio' && (
            <ProjectStudioScreenView onNavigate={setCurrentScreen} />
          )}

          {currentScreen === 'memory' && (
            <MemoryScreenView onNavigate={setCurrentScreen} />
          )}

          {currentScreen === 'appearance' && (
            <AppearanceScreenView
              currentTheme={themeMode}
              onNavigate={setCurrentScreen}
              onSelectTheme={onSelectTheme}
            />
          )}

          {currentScreen === 'offline-story' && (
            <OfflineStoryScreenView onNavigate={setCurrentScreen} />
          )}

          {currentScreen === 'calendar' && (
            <CalendarScreenView onNavigate={setCurrentScreen} />
          )}

          {currentScreen === 'npc' && (
            <NpcScreenView onNavigate={setCurrentScreen} />
          )}

          {currentScreen === 'group-presets' && (
            <GroupPresetScreenView onNavigate={setCurrentScreen} />
          )}

          {currentScreen === 'lock' && (
            <LockScreenView
              themeMode={themeMode}
              onUnlock={() => setCurrentScreen('home')}
            />
          )}
        </div>


        {/* Home Indicator Bar (Exact from user template) */}
        <div 
          onClick={() => setCurrentScreen('home')}
          className="absolute z-20 bottom-[7px] left-1/2 -translate-x-1/2 w-[118px] h-[4px] rounded-[5px] bg-[#242321] cursor-pointer hover:w-[130px] transition-all"
          title="点击返回主屏幕"
        />

        {/* Customization Sheet Modal */}
        <HomeCustomizeSheet
          isOpen={isSheetOpen}
          onClose={() => setIsSheetOpen(false)}
          currentTheme={themeMode}
          onSelectTheme={onSelectTheme}
        />

      </div>



    </div>
  );
}
