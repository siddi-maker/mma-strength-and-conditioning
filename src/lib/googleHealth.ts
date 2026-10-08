/**
 * Fitbit sync via the Google Health API (health.googleapis.com/v4), which replaced the
 * legacy Fitbit Web API. Pulls sleep, weight, body fat and runs into the tracker.
 *
 * Auth is the OAuth 2.0 implicit flow with a full-page redirect: no backend, works on
 * GitHub Pages, and in an installed PWA. Tokens last ~1 hour; there is no refresh token,
 * so "Sync" re-bounces through Google when the token has expired (instant once consented).
 */
import { db, getSettings, saveSettings } from './db';
import { addDays, toISODate } from './dates';
import type { Activity, CheckIn } from './types';

export const SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
];
const API = 'https://health.googleapis.com/v4/users/me/dataTypes';
const TOKEN_KEY = 'google-token';
const STATE_KEY = 'google-oauth-state';

/** Exercise types imported as Zone 2 runs. */
export const RUN_TYPES = new Set(['RUNNING', 'TREADMILL', 'TRAIL_RUN', 'INCLINE_RUN']);

// ------------------------------------------------------------------ API shapes (subset)

interface CivilDateTime {
  date?: { year: number; month: number; day: number };
  time?: { hours?: number; minutes?: number };
}
interface SampleTime {
  physicalTime: string;
  civilTime?: CivilDateTime;
}
interface SessionInterval {
  startTime: string;
  endTime: string;
  civilStartTime?: CivilDateTime;
  civilEndTime?: CivilDateTime;
}
export interface ApiDataPoint {
  name?: string;
  weight?: { sampleTime: SampleTime; weightGrams: number };
  bodyFat?: { sampleTime: SampleTime; percentage: number };
  sleep?: {
    interval: SessionInterval;
    summary?: { minutesAsleep?: string; minutesInSleepPeriod?: string };
    metadata?: { mainSleep?: boolean; nap?: boolean };
  };
  exercise?: {
    interval: SessionInterval;
    exerciseType: string;
    activeDuration?: string;
    metricsSummary?: { distanceMillimeters?: number; averageHeartRateBeatsPerMinute?: string };
  };
}

// ------------------------------------------------------------------ pure mapping (unit tested)

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date of a civil time, falling back to the device's view of the physical time. */
export function civilDate(c: CivilDateTime | undefined, physical: string): string {
  if (c?.date) return `${c.date.year}-${pad(c.date.month)}-${pad(c.date.day)}`;
  return toISODate(new Date(physical));
}

export function civilClock(c: CivilDateTime | undefined, physical: string): string {
  if (c?.time) return `${pad(c.time.hours ?? 0)}:${pad(c.time.minutes ?? 0)}`;
  const d = new Date(physical);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Protobuf JSON duration ("1834.5s") to minutes. */
export function durationMinutes(d: string | undefined): number | undefined {
  if (!d) return undefined;
  const s = parseFloat(d.replace(/s$/, ''));
  return Number.isNaN(s) ? undefined : Math.round(s / 60);
}

export interface SleepNight {
  date: string; // wake-up date
  sleepHours: number;
  bedtime: string;
  wakeTime: string;
}

/** One main sleep per wake-up date (the longest if Fitbit flags none as main). Naps ignored. */
export function mapSleep(points: ApiDataPoint[]): SleepNight[] {
  const byDate = new Map<string, { night: SleepNight; main: boolean; mins: number }>();
  for (const p of points) {
    const s = p.sleep;
    if (!s?.interval || s.metadata?.nap) continue;
    const mins = Number(s.summary?.minutesAsleep ?? NaN);
    const asleep = Number.isNaN(mins) ? (Date.parse(s.interval.endTime) - Date.parse(s.interval.startTime)) / 60000 : mins;
    if (!(asleep > 0)) continue;
    const date = civilDate(s.interval.civilEndTime, s.interval.endTime);
    const night: SleepNight = {
      date,
      sleepHours: Math.round((asleep / 60) * 10) / 10,
      bedtime: civilClock(s.interval.civilStartTime, s.interval.startTime),
      wakeTime: civilClock(s.interval.civilEndTime, s.interval.endTime),
    };
    const main = !!s.metadata?.mainSleep;
    const cur = byDate.get(date);
    if (!cur || (main && !cur.main) || (main === cur.main && asleep > cur.mins)) byDate.set(date, { night, main, mins: asleep });
  }
  return [...byDate.values()].map((v) => v.night);
}

/** First (morning) reading of each day, in kg to 0.1. */
export function mapWeights(points: ApiDataPoint[]): { date: string; bodyweight: number }[] {
  const byDate = new Map<string, { t: number; kg: number }>();
  for (const p of points) {
    const w = p.weight;
    if (!w?.weightGrams) continue;
    const date = civilDate(w.sampleTime.civilTime, w.sampleTime.physicalTime);
    const t = Date.parse(w.sampleTime.physicalTime);
    const cur = byDate.get(date);
    if (!cur || t < cur.t) byDate.set(date, { t, kg: Math.round(w.weightGrams / 100) / 10 });
  }
  return [...byDate.entries()].map(([date, v]) => ({ date, bodyweight: v.kg }));
}

export function mapBodyFat(points: ApiDataPoint[]): { date: string; bodyFat: number }[] {
  const byDate = new Map<string, { t: number; pct: number }>();
  for (const p of points) {
    const b = p.bodyFat;
    if (!b?.percentage) continue;
    const date = civilDate(b.sampleTime.civilTime, b.sampleTime.physicalTime);
    const t = Date.parse(b.sampleTime.physicalTime);
    const cur = byDate.get(date);
    if (!cur || t < cur.t) byDate.set(date, { t, pct: Math.round(b.percentage * 10) / 10 });
  }
  return [...byDate.entries()].map(([date, v]) => ({ date, bodyFat: v.pct }));
}

export function mapRuns(points: ApiDataPoint[]): Activity[] {
  const out: Activity[] = [];
  for (const p of points) {
    const e = p.exercise;
    if (!e?.interval || !RUN_TYPES.has(e.exerciseType)) continue;
    const mins = durationMinutes(e.activeDuration) ?? Math.round((Date.parse(e.interval.endTime) - Date.parse(e.interval.startTime)) / 60000);
    const mm = e.metricsSummary?.distanceMillimeters;
    const hr = Number(e.metricsSummary?.averageHeartRateBeatsPerMinute ?? NaN);
    out.push({
      date: civilDate(e.interval.civilStartTime, e.interval.startTime),
      type: 'zone2',
      durationMin: mins,
      distanceM: mm ? Math.round(mm / 1000) : undefined,
      avgHr: Number.isNaN(hr) ? undefined : Math.round(hr),
      notes: e.exerciseType === 'RUNNING' ? 'From Fitbit' : `From Fitbit (${e.exerciseType.toLowerCase().replace('_', ' ')})`,
      createdAt: Date.now(),
      source: 'fitbit',
      externalId: p.name || `exercise:${e.interval.startTime}`,
    });
  }
  return out;
}

/**
 * Merge synced values into a check-in. Never overwrites a value the user typed;
 * values that came from an earlier sync may be refreshed.
 */
export function mergeCheckIn(cur: CheckIn | undefined, date: string, patch: Partial<CheckIn>): CheckIn | null {
  const base: CheckIn = cur ?? { date };
  const synced = new Set(base.synced ?? []);
  const next: CheckIn = { ...base };
  let changed = false;
  for (const [k, v] of Object.entries(patch) as [keyof CheckIn, never][]) {
    if (v === undefined) continue;
    const manual = base[k] !== undefined && !synced.has(k);
    if (manual || base[k] === v) continue;
    next[k] = v;
    synced.add(k);
    changed = true;
  }
  if (!changed) return null;
  next.synced = [...synced];
  return next;
}

// ------------------------------------------------------------------ OAuth

interface StoredToken {
  token: string;
  expiresAt: number;
}

export function redirectUri(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString();
}

export function getToken(): string | null {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null') as StoredToken | null;
    return t && t.expiresAt > Date.now() + 60_000 ? t.token : null;
  } catch {
    return null;
  }
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/** Leave the app for Google's consent page; we come back to `returnHash` with a token. */
export function beginAuth(clientId: string, returnHash = '#/settings') {
  const state = crypto.randomUUID();
  sessionStorage.setItem(STATE_KEY, JSON.stringify({ state, returnHash }));
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPES.join(' '),
    include_granted_scopes: 'true',
    state,
  });
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

/**
 * Call before the app renders. If the URL fragment carries an OAuth response, store the
 * token, restore the app route, and report whether a sync should run.
 */
export function consumeAuthRedirect(): { justAuthed: boolean; error?: string } {
  const hash = window.location.hash.replace(/^#/, '');
  if (!/(^|&)(access_token|error)=/.test(hash)) return { justAuthed: false };
  const p = new URLSearchParams(hash);
  let saved: { state: string; returnHash: string } | null = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(STATE_KEY) ?? 'null');
  } catch {
    /* ignore */
  }
  sessionStorage.removeItem(STATE_KEY);
  history.replaceState(null, '', `${window.location.pathname}${saved?.returnHash ?? '#/settings'}`);
  if (p.get('error')) return { justAuthed: false, error: `Google sign-in failed: ${p.get('error')}` };
  if (!saved || saved.state !== p.get('state')) return { justAuthed: false, error: 'Google sign-in could not be verified — try again.' };
  const token = p.get('access_token')!;
  const expiresIn = Number(p.get('expires_in') ?? 3600);
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, expiresAt: Date.now() + expiresIn * 1000 } satisfies StoredToken));
  return { justAuthed: true };
}

// ------------------------------------------------------------------ fetching + sync

export class AuthExpiredError extends Error {}

async function listAll(dataType: string, token: string, filter?: string, pageSize?: number): Promise<ApiDataPoint[]> {
  const out: ApiDataPoint[] = [];
  let pageToken = '';
  for (let page = 0; page < 40; page++) {
    const q = new URLSearchParams();
    if (filter) q.set('filter', filter);
    if (pageSize) q.set('pageSize', String(pageSize));
    if (pageToken) q.set('pageToken', pageToken);
    const res = await fetch(`${API}/${dataType}/dataPoints?${q}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) throw new AuthExpiredError('Google sign-in expired');
    if (!res.ok) {
      let msg = `${res.status}`;
      try {
        msg = ((await res.json()) as { error?: { message?: string } }).error?.message ?? msg;
      } catch {
        /* ignore */
      }
      throw new Error(`${dataType}: ${msg}`);
    }
    const body = (await res.json()) as { dataPoints?: ApiDataPoint[]; nextPageToken?: string };
    out.push(...(body.dataPoints ?? []));
    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }
  return out;
}

export interface SyncResult {
  nights: number;
  weights: number;
  bodyFat: number;
  runs: number;
  warnings: string[];
}

export function describeResult(r: SyncResult): string {
  const parts = [`${r.nights} night${r.nights === 1 ? '' : 's'} of sleep`, `${r.weights} weigh-in${r.weights === 1 ? '' : 's'}`, `${r.runs} run${r.runs === 1 ? '' : 's'}`];
  if (r.bodyFat) parts.push(`${r.bodyFat} body-fat reading${r.bodyFat === 1 ? '' : 's'}`);
  return `Updated ${parts.join(', ')}.`;
}

/** First sync looks back 30 days; later syncs re-check 3 days before the last one for late uploads. */
export function syncStartDate(lastSync: number | undefined, today = toISODate()): string {
  return lastSync ? addDays(toISODate(lastSync), -3) : addDays(today, -30);
}

export async function syncFitbit(token: string): Promise<SyncResult> {
  const settings = await getSettings();
  const from = syncStartDate(settings.google?.lastSync);
  const warnings: string[] = [];
  const safe = async (label: string, f: () => Promise<ApiDataPoint[]>) => {
    try {
      return await f();
    } catch (e) {
      if (e instanceof AuthExpiredError) throw e;
      warnings.push(`${label}: ${(e as Error).message}`);
      return [];
    }
  };

  const [sleepPts, weightPts, fatPts, exPts] = await Promise.all([
    safe('Sleep', () => listAll('sleep', token, `sleep.interval.civil_end_time >= "${from}"`, 25)),
    safe('Weight', () => listAll('weight', token, `weight.sample_time.civil_time >= "${from}"`)),
    // Body fat: fetch the latest page and filter locally (filter field naming for hyphenated types is undocumented).
    safe('Body fat', () => listAll('body-fat', token, undefined, 200)),
    safe('Runs', () => listAll('exercise', token, `exercise.interval.civil_start_time >= "${from}"`, 25)),
  ]);

  const nights = mapSleep(sleepPts).filter((n) => n.date >= from);
  const weights = mapWeights(weightPts).filter((w) => w.date >= from);
  const fats = mapBodyFat(fatPts).filter((b) => b.date >= from);
  const runs = mapRuns(exPts).filter((r) => r.date >= from);

  const result: SyncResult = { nights: 0, weights: 0, bodyFat: 0, runs: 0, warnings };
  await db.transaction('rw', db.checkins, db.activities, async () => {
    const apply = async (date: string, patch: Partial<CheckIn>, key: keyof Omit<SyncResult, 'warnings'>) => {
      const next = mergeCheckIn(await db.checkins.get(date), date, patch);
      if (next) {
        await db.checkins.put(next);
        result[key]++;
      }
    };
    for (const n of nights) await apply(n.date, { sleepHours: n.sleepHours, bedtime: n.bedtime, wakeTime: n.wakeTime }, 'nights');
    for (const w of weights) await apply(w.date, { bodyweight: w.bodyweight }, 'weights');
    for (const b of fats) await apply(b.date, { bodyFat: b.bodyFat }, 'bodyFat');

    const existing = new Set((await db.activities.where('type').equals('zone2').toArray()).map((a) => a.externalId).filter(Boolean));
    for (const r of runs) {
      if (existing.has(r.externalId)) continue;
      await db.activities.add(r);
      result.runs++;
    }
  });

  if (warnings.length === 4) throw new Error(warnings.join('\n'));
  // Only move the sync window forward when everything came through, so failures get retried.
  const lastSync = warnings.length ? settings.google?.lastSync : Date.now();
  await saveSettings({ google: { ...settings.google, lastSync, lastResult: describeResult(result) } });
  return result;
}
