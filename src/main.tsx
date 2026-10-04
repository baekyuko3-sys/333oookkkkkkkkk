import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { startBackgroundRuntime } from './store/backgroundRuntime';
import { cleanupOldDemoData } from './store/blankPhoneMigration';

if (typeof window !== 'undefined') {
  cleanupOldDemoData();
  startBackgroundRuntime();

  // The project does not currently ship a service worker. Remove any
  // service worker left behind by an older deployment so stale cached
  // assets cannot take over a fresh Netlify build.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          void registration.unregister();
        }
      });
      if ('caches' in window) {
        void caches.keys().then((keys) => {
          for (const key of keys) void caches.delete(key);
        });
      }
    });
  }
}

createRoot(document.getElementById('root')!).render(<App />);
