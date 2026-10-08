import type { Activity, CheckIn, Range, Workout } from './types';
import { addDays, toISODate, weekStart } from './dates';

export interface WeekSummary {
  weekStart: string;
  sleep: number;
  protein: number;
  water: number;
  zone2Min: number;
  sprintSessions: number;
  maSessions: number;
  weightSessions: number;
}

const inWeek = (date: string, start: string) => date >= start && date <= addDays(start, 6);

export function weekSummary(
  start: string,
  checkins: CheckIn[],
  activities: Activity[],
  workouts: Workout[],
): WeekSummary {
  const cs = checkins.filter((c) => inWeek(c.date, start));
  const as = activities.filter((a) => inWeek(a.date, start));
  const sum = (f: (c: CheckIn) => number | undefined) => cs.reduce((t, c) => t + (f(c) ?? 0), 0);
  const sprintDays = new Set(as.filter((a) => a.type === 'sprints' || a.type === 'sprint_test').map((a) => a.date));
  return {
    weekStart: start,
    sleep: round1(sum((c) => c.sleepHours)),
    protein: Math.round(sum((c) => c.protein)),
    water: round1(sum((c) => c.water)),
    zone2Min: as.filter((a) => a.type === 'zone2').reduce((t, a) => t + (a.durationMin ?? 0), 0),
    sprintSessions: sprintDays.size,
    maSessions: as.filter((a) => a.type === 'martial_arts').length,
    weightSessions: workouts.filter((w) => w.status === 'done' && inWeek(toISODate(w.startedAt), start)).length,
  };
}

export type RangeStatus = 'below' | 'in' | 'above';

export function rangeStatus(value: number, r: Range): RangeStatus {
  if (value < r.min) return 'below';
  if (value > r.max) return 'above';
  return 'in';
}

/** Progress toward the bottom of a range, 0..1 (capped). */
export function rangeProgress(value: number, r: Range): number {
  if (r.min <= 0) return 1;
  return Math.max(0, Math.min(1, value / r.min));
}

export interface Adherence {
  planned: number;
  done: number;
  missedPct: number;
  /** Consecutive weeks meeting the weekly session target (current week counts once met). */
  weekStreak: number;
  weeks: number;
}

/**
 * Session adherence over full weeks since training started (max `maxWeeks`).
 * The current week only counts toward "done", never as missed, until it ends.
 */
export function adherence(
  workouts: Workout[],
  perWeek: number,
  today: string = toISODate(),
  maxWeeks = 12,
): Adherence {
  const done = workouts.filter((w) => w.status === 'done');
  if (!done.length || perWeek <= 0) return { planned: 0, done: 0, missedPct: 0, weekStreak: 0, weeks: 0 };
  const thisWeek = weekStart(today);
  const first = weekStart(toISODate(Math.min(...done.map((w) => w.startedAt))));
  const counts = new Map<string, number>();
  for (const w of done) {
    const k = weekStart(toISODate(w.startedAt));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const weeks: string[] = [];
  for (let s = addDays(thisWeek, -7); s >= first && weeks.length < maxWeeks; s = addDays(s, -7)) weeks.push(s);

  let planned = 0;
  let got = 0;
  for (const s of weeks) {
    planned += perWeek;
    got += Math.min(perWeek, counts.get(s) ?? 0);
  }
  const missedPct = planned ? Math.round(((planned - got) / planned) * 1000) / 10 : 0;

  let streak = 0;
  for (const s of weeks) {
    if ((counts.get(s) ?? 0) >= perWeek) streak++;
    else break;
  }
  if ((counts.get(thisWeek) ?? 0) >= perWeek) streak++;

  return { planned, done: got, missedPct, weekStreak: streak, weeks: weeks.length };
}

/** Consecutive days (ending today or yesterday) with a check-in. */
export function checkinStreak(checkins: CheckIn[], today: string = toISODate()): number {
  const dates = new Set(checkins.map((c) => c.date));
  let d = dates.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (dates.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** Trailing moving average over a calendar window (default 7 days), skipping missing days. */
export function movingAverage(points: { date: string; value: number }[], days = 7): number[] {
  return points.map((p) => {
    const from = addDays(p.date, -(days - 1));
    const win = points.filter((q) => q.date >= from && q.date <= p.date);
    return round1(win.reduce((a, b) => a + b.value, 0) / win.length);
  });
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
