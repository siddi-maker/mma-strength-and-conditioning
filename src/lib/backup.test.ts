import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { db } from './db';
import { exportJSON, importJSON, setsCSV, toCSV, validateBackup } from './backup';
import { SEED_EXERCISES, SEED_TEMPLATES } from './seed';
import { goalCurrent, goalMet, goalProgress } from './goals';
import type { Goal } from './types';

describe('database + backup', () => {
  it('seeds the four templates on first open', async () => {
    expect((await db.templates.orderBy('order').toArray()).map((t) => t.name)).toEqual(['Upper A', 'Lower A', 'Upper B', 'Lower B']);
    expect(await db.exercises.count()).toBe(SEED_EXERCISES.length);
    expect((await db.settings.get('settings'))?.targets.daily.protein).toEqual({ min: 180, max: 200 });
  });

  it('round-trips a full JSON backup without loss', async () => {
    await db.checkins.put({ date: '2026-10-08', bodyweight: 77.4, water: 2.5, creatine: true });
    await db.activities.add({ date: '2026-10-08', type: 'martial_arts', maType: 'BJJ', durationMin: 90, intensity: 4, quality: true, createdAt: 1 });
    await db.workouts.add({
      templateId: 'upper_a',
      templateName: 'Upper A',
      startedAt: 1,
      finishedAt: 2,
      status: 'done',
      exercises: [{ exerciseId: 'bench', target: SEED_TEMPLATES[0].exercises[0], sets: [{ weight: 80, reps: 5, rpe: 8, done: true }], notes: 'felt "fast", good' }],
    });
    const backup = JSON.parse(JSON.stringify(await exportJSON()));
    expect(validateBackup(backup)).toBe(true);

    await db.checkins.clear();
    await db.workouts.clear();
    await importJSON(backup);
    expect(await db.checkins.get('2026-10-08')).toEqual({ date: '2026-10-08', bodyweight: 77.4, water: 2.5, creatine: true });
    expect((await db.workouts.toArray())[0].exercises[0].sets[0]).toEqual({ weight: 80, reps: 5, rpe: 8, done: true });
    expect(await db.activities.count()).toBe(1);

    const csv = setsCSV(await db.workouts.toArray(), Object.fromEntries(SEED_EXERCISES.map((e) => [e.id, e])));
    expect(csv.split('\n')[1]).toContain('Bench Press');
    expect(csv).toContain('"felt ""fast"", good"');
  });

  it('rejects files that are not backups and leaves data untouched', async () => {
    const before = await db.workouts.count();
    await expect(importJSON({ hello: 'world' })).rejects.toThrow();
    expect(await db.workouts.count()).toBe(before);
  });

  it('builds CSV with escaping', () => {
    expect(toCSV([{ a: 1, b: 'x,y' }])).toBe('a,b\n1,"x,y"');
  });
});

describe('goals', () => {
  const up: Goal = { id: 'b', label: 'Bench', unit: 'kg', start: 75, goal: 100, direction: 'up', source: { kind: 'e1rm', exerciseId: 'bench' } };
  const range: Goal = { id: 'bw', label: 'BW', unit: 'kg', start: 77, goal: 77, goalMax: 80, direction: 'range', source: { kind: 'bodyweight' } };
  const down: Goal = { id: 's', label: '100m', unit: 's', start: 13.5, goal: 12.5, direction: 'down', source: { kind: 'sprint100' } };

  it('computes progress from start to goal', () => {
    expect(goalProgress(up, 87.5)).toBe(0.5);
    expect(goalProgress(up, 70)).toBe(0);
    expect(goalProgress(up, 110)).toBe(1);
    expect(goalProgress(down, 13)).toBeCloseTo(0.5);
    expect(goalMet(down, 12.4)).toBe(true);
  });

  it('treats range goals as met inside the range', () => {
    expect(goalMet(range, 78)).toBe(true);
    expect(goalProgress(range, 78)).toBe(1);
    expect(goalMet(range, 81)).toBe(false);
  });

  it('reads current values from logged data', () => {
    const data = {
      checkins: [{ date: '2026-10-01', bodyweight: 76 }, { date: '2026-10-05', bodyweight: 77.5 }, { date: '2026-10-06' }],
      activities: [{ date: '2026-10-01', type: 'sprint_test' as const, time100m: 12.9, createdAt: 0 }, { date: '2026-10-03', type: 'sprint_test' as const, time100m: 12.7, createdAt: 0 }],
      workouts: [],
    };
    expect(goalCurrent(range, data)).toBe(77.5);
    expect(goalCurrent(down, data)).toBe(12.7);
    expect(goalCurrent(up, data)).toBeUndefined();
  });
});
