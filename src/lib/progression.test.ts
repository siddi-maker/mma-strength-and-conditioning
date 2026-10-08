import { describe, expect, it } from 'vitest';
import { deloadDue, deloadSets, epley, exerciseHistory, nextTemplateId, roundTo, suggest, type SessionEntry } from './progression';
import { SEED_EXERCISES, SEED_TEMPLATES } from './seed';
import type { Exercise, Prescription, SetLog, Workout } from './types';

const exById = Object.fromEntries(SEED_EXERCISES.map((e) => [e.id, e])) as Record<string, Exercise>;
const rxOf = (id: string): Prescription => SEED_TEMPLATES.flatMap((t) => t.exercises).find((p) => p.exerciseId === id)!;

const sets = (weight: number, reps: number[], extra: Partial<SetLog> = {}): SetLog[] =>
  reps.map((r) => ({ weight, reps: r, done: true, ...extra }));

let t = 0;
const session = (rx: Prescription, s: SetLog[]): SessionEntry => ({ date: '2026-01-01', startedAt: ++t, target: rx, sets: s });

describe('epley', () => {
  it('returns weight for a single', () => expect(epley(100, 1)).toBe(100));
  it('estimates 5 reps', () => expect(epley(100, 5)).toBeCloseTo(116.67, 2));
  it('estimates 8 reps', () => expect(epley(35, 8)).toBeCloseTo(44.33, 2));
  it('is 0 for no reps or no weight', () => {
    expect(epley(100, 0)).toBe(0);
    expect(epley(0, 10)).toBe(0);
  });
});

describe('roundTo', () => {
  it('rounds to plate steps', () => {
    expect(roundTo(67.5 * 0.9, 2.5)).toBe(60);
    expect(roundTo(81, 2.5)).toBe(80);
    expect(roundTo(83, 5)).toBe(85);
  });
});

describe('main lifts', () => {
  const bench = exById.bench;
  const squat = exById.squat;
  const benchRx = rxOf('bench');
  const squatRx = rxOf('squat');

  it('uses the start weight the first time', () => {
    const s = suggest(bench, benchRx, []);
    expect(s.kind).toBe('first');
    expect(s.weight).toBe(75);
    expect(s.reps).toEqual([5, 5, 5, 5, 5]);
  });

  it('adds 2.5 kg to upper body after a clean 5x5', () => {
    const s = suggest(bench, benchRx, [session(benchRx, sets(80, [5, 5, 5, 5, 5]))]);
    expect(s.kind).toBe('increase');
    expect(s.weight).toBe(82.5);
  });

  it('adds 5 kg to lower body after a clean 5x5', () => {
    const s = suggest(squat, squatRx, [session(squatRx, sets(100, [5, 5, 5, 5, 5]))]);
    expect(s.weight).toBe(105);
  });

  it('holds after one missed session', () => {
    const s = suggest(bench, benchRx, [session(benchRx, sets(80, [5, 5, 5, 4, 3]))]);
    expect(s.kind).toBe('hold');
    expect(s.weight).toBe(80);
  });

  it('holds when not all sets were logged', () => {
    const s = suggest(bench, benchRx, [session(benchRx, sets(80, [5, 5, 5, 5]))]);
    expect(s.kind).toBe('hold');
  });

  it('drops 10% after two missed sessions at the same weight', () => {
    const h = [session(benchRx, sets(80, [5, 5, 4, 4, 3])), session(benchRx, sets(80, [5, 5, 5, 4, 4]))].reverse();
    const s = suggest(bench, benchRx, h);
    expect(s.kind).toBe('decrease');
    expect(s.weight).toBe(72.5); // 72 rounded to 2.5
  });

  it('does not deload again right after a deload', () => {
    // most recent first: missed at 72.5, missed at 80
    const h = [session(benchRx, sets(72.5, [5, 5, 5, 5, 4])), session(benchRx, sets(80, [5, 4, 4, 4, 3]))];
    expect(suggest(bench, benchRx, h).kind).toBe('hold');
  });
});

describe('power lifts', () => {
  const clean = exById.clean;
  const rx = rxOf('clean');
  it('keeps the weight but offers an optional +2.5 kg', () => {
    const s = suggest(clean, rx, [session(rx, sets(70, [3, 3, 3, 3, 3]))]);
    expect(s.weight).toBe(70);
    expect(s.optional?.weight).toBe(72.5);
  });
  it('offers nothing optional after a miss', () => {
    const s = suggest(clean, rx, [session(rx, sets(70, [3, 3, 3, 2, 2]))]);
    expect(s.optional).toBeUndefined();
  });
});

describe('accessories', () => {
  const incline = exById.incline_db; // 3x8-10, 2 kg increment
  const rx = rxOf('incline_db');

  it('adds the smallest increment when top of range is hit on all sets', () => {
    const s = suggest(incline, rx, [session(rx, sets(24, [10, 10, 10]))]);
    expect(s.kind).toBe('increase');
    expect(s.weight).toBe(26);
    expect(s.reps).toEqual([8, 8, 8]);
  });

  it('holds and prefills last reps within range otherwise', () => {
    const s = suggest(incline, rx, [session(rx, sets(24, [10, 9, 8]))]);
    expect(s.kind).toBe('hold');
    expect(s.weight).toBe(24);
    expect(s.reps).toEqual([10, 9, 8]);
  });

  it('respects a per-exercise increment', () => {
    const custom = { ...incline, increment: 2.5 };
    expect(suggest(custom, rx, [session(rx, sets(25, [10, 10, 10]))]).weight).toBe(27.5);
  });

  it('progresses farmer carries on distance', () => {
    const farmer = exById.farmer;
    const frx = rxOf('farmer');
    const ok = suggest(farmer, frx, [session(frx, sets(32, [0, 0, 0, 0], { distance: 40 }))]);
    expect(ok.weight).toBe(34);
    expect(ok.distance).toBe(40);
    const short = suggest(farmer, frx, [session(frx, [...sets(32, [0, 0, 0], { distance: 40 }), { weight: 32, distance: 30, done: true }])]);
    expect(short.kind).toBe('hold');
  });
});

describe('pull-ups', () => {
  it('tracks reps toward 15+', () => {
    const rx = rxOf('pullup');
    const s = suggest(exById.pullup, rx, [session(rx, sets(0, [10, 9, 8, 7]))]);
    expect(s.reps).toEqual([10, 9, 8, 7]);
    expect(s.note).toMatch(/15\+/);
  });

  it('adds 2.5 kg to weighted pull-ups after a clean 4x6', () => {
    const rx = rxOf('wpullup');
    expect(suggest(exById.wpullup, rx, [session(rx, sets(10, [6, 6, 6, 6]))]).weight).toBe(12.5);
    expect(suggest(exById.wpullup, rx, [session(rx, sets(10, [6, 6, 6, 5]))]).weight).toBe(10);
  });
});

describe('exerciseHistory', () => {
  it('ignores active workouts, skipped entries and undone sets; most recent first', () => {
    const rx = rxOf('bench');
    const w = (id: number, startedAt: number, status: Workout['status'], skipped = false): Workout => ({
      id,
      templateId: 'upper_a',
      templateName: 'Upper A',
      startedAt,
      status,
      exercises: [{ exerciseId: 'bench', target: rx, skipped, sets: [{ weight: 80, reps: 5, done: true }, { weight: 80, reps: 5, done: false }] }],
    });
    const h = exerciseHistory([w(1, 100, 'done'), w(2, 300, 'done'), w(3, 200, 'done', true), w(4, 400, 'active')], 'bench');
    expect(h.map((x) => x.workoutId)).toEqual([2, 1]);
    expect(h[0].sets).toHaveLength(1);
  });
});

describe('rotation and deload', () => {
  const ids = ['upper_a', 'lower_a', 'upper_b', 'lower_b'];
  it('suggests the next template in rotation', () => {
    expect(nextTemplateId(ids)).toBe('upper_a');
    expect(nextTemplateId(ids, 'upper_a')).toBe('lower_a');
    expect(nextTemplateId(ids, 'lower_b')).toBe('upper_a');
  });
  it('flags a deload after the configured weeks', () => {
    expect(deloadDue('2026-01-05', '2026-02-15', 7).due).toBe(false); // 41 days
    expect(deloadDue('2026-01-05', '2026-02-23', 7).due).toBe(true); // 49 days
    expect(deloadDue(undefined, '2026-02-23', 7).due).toBe(false);
  });
  it('cuts volume to about 60%', () => {
    expect(deloadSets(5)).toBe(3);
    expect(deloadSets(4)).toBe(2);
    expect(deloadSets(3)).toBe(2);
    expect(deloadSets(1)).toBe(1);
  });
});
