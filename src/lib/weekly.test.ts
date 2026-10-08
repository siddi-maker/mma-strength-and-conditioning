import { describe, expect, it } from 'vitest';
import { adherence, checkinStreak, movingAverage, rangeStatus, weekSummary } from './weekly';
import { detectPRs, workoutVolume } from './prs';
import { SEED_EXERCISES } from './seed';
import { parseISODate, weekStart } from './dates';
import type { Activity, CheckIn, Exercise, Workout } from './types';

const ts = (date: string, hour = 18) => {
  const d = parseISODate(date);
  d.setHours(hour);
  return d.getTime();
};
const wo = (date: string, extra: Partial<Workout> = {}): Workout => ({
  templateId: 'upper_a',
  templateName: 'Upper A',
  startedAt: ts(date),
  status: 'done',
  exercises: [],
  ...extra,
});
const act = (date: string, a: Partial<Activity>): Activity => ({ date, type: 'zone2', createdAt: 0, ...a });

describe('weekStart', () => {
  it('returns Monday', () => {
    expect(weekStart('2026-10-08')).toBe('2026-10-05'); // Thursday
    expect(weekStart('2026-10-11')).toBe('2026-10-05'); // Sunday
    expect(weekStart('2026-10-05')).toBe('2026-10-05');
  });
});

describe('weekSummary', () => {
  const checkins: CheckIn[] = [
    { date: '2026-10-04', sleepHours: 9, protein: 999 }, // previous week
    { date: '2026-10-05', sleepHours: 8, protein: 190, water: 4.5 },
    { date: '2026-10-06', sleepHours: 7.5, protein: 200, water: 5 },
    { date: '2026-10-11', sleepHours: 9, protein: 180, water: 4 },
  ];
  const activities: Activity[] = [
    act('2026-10-05', { type: 'zone2', durationMin: 35 }),
    act('2026-10-07', { type: 'zone2', durationMin: 40 }),
    act('2026-10-06', { type: 'martial_arts', maType: 'BJJ' }),
    act('2026-10-07', { type: 'martial_arts', maType: 'MMA' }),
    act('2026-10-08', { type: 'sprints', sprintReps: 6 }),
    act('2026-10-08', { type: 'sprint_test', time100m: 12.8 }),
    act('2026-10-12', { type: 'martial_arts' }), // next week
  ];
  const workouts = [wo('2026-10-05'), wo('2026-10-06'), wo('2026-10-08', { status: 'active' }), wo('2026-10-12')];

  it('sums the Monday–Sunday week', () => {
    const s = weekSummary('2026-10-05', checkins, activities, workouts);
    expect(s.sleep).toBe(24.5);
    expect(s.protein).toBe(570);
    expect(s.water).toBe(13.5);
    expect(s.zone2Min).toBe(75);
    expect(s.maSessions).toBe(2);
    expect(s.sprintSessions).toBe(1); // sprints + test on the same day = 1 session
    expect(s.weightSessions).toBe(2); // active workout not counted
  });

  it('classifies values against target ranges', () => {
    expect(rangeStatus(59, { min: 60, max: 65 })).toBe('below');
    expect(rangeStatus(62, { min: 60, max: 65 })).toBe('in');
    expect(rangeStatus(70, { min: 60, max: 65 })).toBe('above');
  });
});

describe('adherence', () => {
  it('counts missed sessions in full weeks only', () => {
    const ws = [
      // week of 2026-09-21: 4 sessions
      ...['2026-09-21', '2026-09-22', '2026-09-24', '2026-09-26'].map((d) => wo(d)),
      // week of 2026-09-28: 3 sessions
      ...['2026-09-28', '2026-09-30', '2026-10-02'].map((d) => wo(d)),
      // current week 2026-10-05: 1 so far
      wo('2026-10-06'),
    ];
    const a = adherence(ws, 4, '2026-10-08');
    expect(a.weeks).toBe(2);
    expect(a.planned).toBe(8);
    expect(a.done).toBe(7);
    expect(a.missedPct).toBe(12.5);
    expect(a.weekStreak).toBe(0); // last full week missed one
  });

  it('builds a streak and caps extra sessions', () => {
    const ws = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].map((d) =>
      wo(d),
    );
    const a = adherence(ws, 4, '2026-10-08');
    expect(a.done).toBe(4); // 5 sessions capped at 4
    expect(a.missedPct).toBe(0);
    expect(a.weekStreak).toBe(2); // last week + this week already met
  });

  it('is empty without data', () => {
    expect(adherence([], 4, '2026-10-08').planned).toBe(0);
  });
});

describe('checkinStreak', () => {
  it('counts back from today or yesterday', () => {
    const cs = ['2026-10-05', '2026-10-06', '2026-10-07'].map((date) => ({ date }));
    expect(checkinStreak(cs, '2026-10-07')).toBe(3);
    expect(checkinStreak(cs, '2026-10-08')).toBe(3);
    expect(checkinStreak(cs, '2026-10-09')).toBe(0);
  });
});

describe('movingAverage', () => {
  it('averages over a 7-day calendar window', () => {
    const pts = [
      { date: '2026-10-01', value: 77 },
      { date: '2026-10-02', value: 79 },
      { date: '2026-10-08', value: 80 },
    ];
    expect(movingAverage(pts)).toEqual([77, 78, 79.5]);
  });
});

describe('PR detection', () => {
  const exercises = Object.fromEntries(SEED_EXERCISES.map((e) => [e.id, e])) as Record<string, Exercise>;
  const rx = { exerciseId: 'bench', sets: 5, repsMin: 5, repsMax: 5, restSec: 180 };
  const bench = (date: string, weight: number, reps: number[]): Workout =>
    wo(date, { exercises: [{ exerciseId: 'bench', target: rx, sets: reps.map((r) => ({ weight, reps: r, done: true })) }] });

  it('finds weight, e1RM and rep PRs', () => {
    const prior = [bench('2026-10-01', 80, [5, 5, 5, 5, 5])];
    const cur = bench('2026-10-05', 82.5, [5, 5, 5, 5, 6]);
    const prs = detectPRs(cur, [...prior, cur], exercises);
    expect(prs.map((p) => p.type).sort()).toEqual(['e1rm', 'reps', 'weight']);
    expect(prs.find((p) => p.type === 'weight')!.value).toBe(82.5);
    expect(prs.find((p) => p.type === 'reps')!.value).toBe(6);
  });

  it('reports a rep PR at a lighter load only if it beats heavier history too', () => {
    const prior = [bench('2026-10-01', 80, [5, 5, 5, 5, 5])];
    expect(detectPRs(bench('2026-10-05', 70, [5, 5, 5, 5, 5]), prior, exercises)).toEqual([]);
    const prs = detectPRs(bench('2026-10-05', 70, [8, 5, 5, 5, 5]), prior, exercises);
    expect(prs.map((p) => p.type)).toEqual(['reps']);
  });

  it('does not report PRs on the first session', () => {
    const cur = bench('2026-10-05', 82.5, [5, 5, 5, 5, 5]);
    expect(detectPRs(cur, [cur], exercises)).toEqual([]);
  });

  it('computes volume from completed sets', () => {
    const w = bench('2026-10-05', 100, [5, 5]);
    w.exercises[0].sets.push({ weight: 100, reps: 5, done: false });
    expect(workoutVolume(w)).toBe(1000);
  });
});
