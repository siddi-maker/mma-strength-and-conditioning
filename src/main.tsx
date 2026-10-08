import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { requestPersistentStorage } from './lib/db';
import { consumeAuthRedirect } from './lib/googleHealth';
import { autoSync, setSyncError, syncNow } from './lib/fitbitSync';
import './index.css';

// Must run before the hash router reads the URL: Google returns the token in the fragment.
const auth = consumeAuthRedirect();

registerSW({ immediate: true });
void requestPersistentStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (auth.error) setSyncError(auth.error);
else if (auth.justAuthed) void syncNow();
else void autoSync();
