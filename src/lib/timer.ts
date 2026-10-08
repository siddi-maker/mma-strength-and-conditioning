import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * Rest timer driven by absolute timestamps so it survives screen lock, tab
 * throttling and reloads. State is mirrored to localStorage.
 */
export interface RestTimerState {
  endsAt: number;
  duration: number; // seconds
  label: string;
  alerted?: boolean;
}

const KEY = 'rest-timer';
let state: RestTimerState | null = load();
const listeners = new Set<() => void>();
let alertTimeout: ReturnType<typeof setTimeout> | undefined;
let prefs = { sound: true, vibrate: true };

function load(): RestTimerState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RestTimerState) : null;
  } catch {
    return null;
  }
}

function emit() {
  try {
    if (state) localStorage.setItem(KEY, JSON.stringify(state));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
  schedule();
}

function schedule() {
  clearTimeout(alertTimeout);
  if (!state || state.alerted) return;
  const ms = state.endsAt - Date.now();
  alertTimeout = setTimeout(checkDone, Math.max(0, ms));
}

function checkDone() {
  if (state && !state.alerted && Date.now() >= state.endsAt) {
    state = { ...state, alerted: true };
    fireAlert(state.label);
    emit();
  }
}

// --- Audio: the context must be unlocked from a user gesture (the ✓ tap). ---
let audio: AudioContext | undefined;
export function unlockAudio() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!audio && Ctx) audio = new Ctx();
    if (audio?.state === 'suspended') void audio.resume();
  } catch {
    /* ignore */
  }
}

function beep() {
  if (!audio) return;
  const now = audio.currentTime;
  [0, 0.25, 0.5].forEach((offset) => {
    const osc = audio!.createOscillator();
    const gain = audio!.createGain();
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(audio!.destination);
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.4, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
    osc.start(now + offset);
    osc.stop(now + offset + 0.2);
  });
}

function fireAlert(label: string) {
  if (prefs.vibrate) navigator.vibrate?.([300, 150, 300, 150, 300]);
  if (prefs.sound) beep();
  if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
    navigator.serviceWorker?.ready
      .then((reg) => reg.showNotification('Rest over', { body: `Next set: ${label}`, tag: 'rest-timer' }))
      .catch(() => undefined);
  }
}

export function setTimerPrefs(p: { sound: boolean; vibrate: boolean }) {
  prefs = p;
}

export function startRest(seconds: number, label: string) {
  unlockAudio();
  state = { endsAt: Date.now() + seconds * 1000, duration: seconds, label };
  emit();
}

export function adjustRest(deltaSec: number) {
  if (!state) return;
  state = { ...state, endsAt: state.endsAt + deltaSec * 1000, duration: Math.max(1, state.duration + deltaSec), alerted: false };
  emit();
}

export function stopRest() {
  state = null;
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

if (typeof document !== 'undefined') {
  // Coming back from a locked screen: alert immediately if the rest ran out.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkDone();
  });
  schedule();
}

export function useRestTimer() {
  const s = useSyncExternalStore(subscribe, () => state);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!s) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [s]);
  const remaining = s ? (s.endsAt - now) / 1000 : 0;
  return { timer: s, remaining };
}
