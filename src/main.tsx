import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { startBackgroundRuntime } from './store/backgroundRuntime';
import { cleanupOldDemoData } from './store/blankPhoneMigration';
import { bindLineRuntimeEvents } from './store/lineRuntime';

if (typeof window !== 'undefined') {
  cleanupOldDemoData();
  startBackgroundRuntime();
  bindLineRuntimeEvents();

  // The app no longer uses a service worker. Clean up legacy registrations
  // immediately so an older cached shell cannot keep serving stale builds.
  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker.getRegistrations().then((registrations) =>
      Promise.all(registrations.map((registration) => registration.unregister()))
    );
  }
  if ('caches' in window) {
    void caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
  }
}

createRoot(document.getElementById('root')!).render(<App />);
