import { useSyncExternalStore } from 'react';
import { getSettings } from './db';
import { AuthExpiredError, beginAuth, clearToken, describeResult, getToken, syncFitbit } from './googleHealth';

/** App-wide Fitbit sync status, shared by the dashboard card and the settings tab. */
export interface SyncState {
  status: 'idle' | 'syncing' | 'done' | 'error';
  message?: string;
  warnings?: string[];
}

let state: SyncState = { status: 'idle' };
const listeners = new Set<() => void>();
const set = (s: SyncState) => {
  state = s;
  listeners.forEach((l) => l());
};

export function useFitbitSync(): SyncState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export function setSyncError(message: string) {
  set({ status: 'error', message });
}

/** Sync now if we hold a valid token; otherwise bounce through Google sign-in first. */
export async function syncNow(returnHash = window.location.hash || '#/'): Promise<void> {
  if (state.status === 'syncing') return;
  const settings = await getSettings();
  const clientId = settings.google?.clientId;
  if (!clientId) return set({ status: 'error', message: 'Add your Google OAuth client ID in Settings → Fitbit first.' });
  if (!navigator.onLine) return set({ status: 'error', message: "You're offline — sync when you have signal." });
  const token = getToken();
  if (!token) return beginAuth(clientId, returnHash);
  set({ status: 'syncing', message: 'Syncing Fitbit…' });
  try {
    const r = await syncFitbit(token);
    set({ status: 'done', message: describeResult(r), warnings: r.warnings });
  } catch (e) {
    if (e instanceof AuthExpiredError) {
      clearToken();
      return beginAuth(clientId, returnHash);
    }
    set({ status: 'error', message: `Sync failed: ${(e as Error).message}` });
  }
}

/** On app open: sync silently if a token is still valid and the last sync is stale. */
export async function autoSync(): Promise<void> {
  const s = await getSettings();
  if (!s.google?.clientId || !getToken() || !navigator.onLine) return;
  if (s.google.lastSync && Date.now() - s.google.lastSync < 30 * 60_000) return;
  await syncNow();
}
