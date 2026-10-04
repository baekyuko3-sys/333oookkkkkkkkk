import { useState } from 'react';
import { PhoneSimulator } from './components/PhoneSimulator';
import { ThemeMode, ScreenType } from './types';

export default function App() {
  // The public site is the phone itself. Start with a clean, empty home screen.
  const [themeMode, setThemeMode] = useState<ThemeMode>('nordic-light');
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('home');

  return (
    <main className="min-h-screen overflow-auto bg-[#e8e4dc] flex items-start sm:items-center justify-center px-3 py-6 sm:py-8">
      <PhoneSimulator
        themeMode={themeMode}
        currentScreen={currentScreen}
        setCurrentScreen={setCurrentScreen}
        onSelectTheme={setThemeMode}
      />
    </main>
  );
}
