import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { requestPersistentStorage } from './lib/db';
import './index.css';

// Auto-update: the new service worker activates and the page reloads itself. Browsers only
// look for a new version on a fresh launch, so also check whenever the app comes back to the
// foreground and hourly while open. All data lives in IndexedDB, so the reload loses nothing.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    const check = () => {
      if (navigator.onLine) reg.update().catch(() => undefined);
    };
    setInterval(check, 60 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
  },
});
void requestPersistentStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
