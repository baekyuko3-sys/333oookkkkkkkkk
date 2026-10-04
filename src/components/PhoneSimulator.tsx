import { useState } from 'react';
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
import { WorldBookScreenView } from './screens/WorldBookScreenView';
import { SettingsScreenView } from './screens/SettingsScreenView';
import { CalendarScreenView } from './screens/CalendarScreenView';
import { SpyPhoneScreenView } from './screens/SpyPhoneScreenView';
import { LineAppView } from './line/LineAppView';
import { HomeCustomizeSheet } from './modals/HomeCustomizeSheet';

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

  return (
    <div className="phone-shell-wrap-local">
      {/* Physical device shell. The UI inside stays the existing UI unchanged. */}
      <div
        data-theme={isDark ? 'dark' : 'light'}
        className={`phone-case-local ${isDark ? 'dark-theme-mode' : ''}`}
      >
        <span className="phone-button-local phone-button-silent" aria-hidden="true" />
        <span className="phone-button-local phone-button-volume-up" aria-hidden="true" />
        <span className="phone-button-local phone-button-volume-down" aria-hidden="true" />
        <span className="phone-button-local phone-button-power" aria-hidden="true" />

        <div className="phone-frame-local">
          <div
            className="phone-screen-local"
            style={{ background: 'var(--screen, #ffffff)', color: 'var(--ink, #242323)' }}
          >
            {/* Realistic status bar / Dynamic Island */}
            <div className="phone-status-local text-[var(--ink)]">
              <span className="phone-time-local">9:41</span>

              <button
                type="button"
                onClick={() => setCurrentScreen(currentScreen === 'music' ? 'home' : 'music')}
                className="phone-island-local"
                aria-label="灵动岛"
              />

              <div className="phone-status-right-local">
                <span className="phone-signal-local" aria-hidden="true">▂▅▇</span>
                <span className="phone-wifi-local" aria-hidden="true">⌁</span>
                <span className="phone-battery-local" aria-hidden="true">
                  <span />
                </span>
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
            <SettingsScreenView
              onNavigate={setCurrentScreen}
              themeMode={themeMode}
              onSelectTheme={onSelectTheme}
            />
          )}

          {currentScreen === 'calendar' && (
            <CalendarScreenView onNavigate={setCurrentScreen} />
          )}

          {currentScreen === 'lock' && (
            <SaneHomeScreenView
              onNavigate={setCurrentScreen}
              onOpenSheet={() => setIsSheetOpen(true)}
            />
          )}
        </div>

            {/* Home Indicator */}
            <div
              onClick={() => setCurrentScreen('home')}
              className="phone-home-indicator-local"
              title="点击返回主屏幕"
            />

            {/* Existing customization UI remains inside the phone. */}
            <HomeCustomizeSheet
              isOpen={isSheetOpen}
              onClose={() => setIsSheetOpen(false)}
              currentTheme={themeMode}
              onSelectTheme={onSelectTheme}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
