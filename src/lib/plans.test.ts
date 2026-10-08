import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getSettings, TrackerDB } from './db';
import { addWorkout, createPlan, deletePlan, getActivePlan, moveWorkout, nextInPlan, planTemplates, setActivePlan } from './plans';
import { importJSON } from './backup';
import { DEFAULT_SETTINGS, SEED_EXERCISES, SEED_TEMPLATES } from './seed';
import type { Template } from './types';

beforeEach(async () => {
  await db.delete();
  await db.open(); // re-runs populate: default plan + 4 seeded workouts
});

describe('plans', () => {
  it('starts with the seeded plan active', async () => {
    const plan = await getActivePlan();
    expect(plan?.name).toBe('MMA S&C (4-day)');
    expect((await planTemplates(plan!.id)).map((t) => t.name)).toEqual(['Upper A', 'Lower A', 'Upper B', 'Lower B']);
  });

  it('creating a blank plan switches the app to it', async () => {
    const id = await createPlan('Fight camp');
    expect((await getActivePlan())?.id).toBe(id);
    expect(await planTemplates(id)).toEqual([]);
  });

  it('copies are independent of the original', async () => {
    const id = await createPlan('Copy', 'default');
    const copy = await planTemplates(id);
    expect(copy.map((t) => t.name)).toEqual(['Upper A', 'Lower A', 'Upper B', 'Lower B']);
    expect(copy.every((t) => t.programId === id && !t.id.startsWith('upper_') && !t.id.startsWith('lower_'))).toBe(true);
    await db.templates.update(copy[0].id, { name: 'Changed', exercises: [] });
    const original = await planTemplates('default');
    expect(original[0].name).toBe('Upper A');
    expect(original[0].exercises.length).toBe(11);
    expect((await db.programs.get(id))?.sessionsPerWeek).toBe(4);
  });

  it('switches between plans', async () => {
    const id = await createPlan('Other');
    await setActivePlan('default');
    expect((await getActivePlan())?.id).toBe('default');
    await setActivePlan(id);
    expect((await getActivePlan())?.id).toBe(id);
  });

  it('deleting the active plan falls back to another and keeps logged workouts', async () => {
    const id = await createPlan('Temp', 'default');
    const [t] = await planTemplates(id);
    await db.workouts.add({ templateId: t.id, templateName: t.name, startedAt: 1, status: 'done', exercises: [] });
    await deletePlan(id);
    expect(await db.programs.get(id)).toBeUndefined();
    expect(await planTemplates(id)).toEqual([]);
    expect((await getActivePlan())?.id).toBe('default');
    expect(await db.workouts.count()).toBe(1);
  });

  it("won't delete the only plan", async () => {
    await expect(deletePlan('default')).rejects.toThrow(/only plan/);
    expect(await planTemplates('default')).toHaveLength(4);
  });

  it('adds and reorders workouts', async () => {
    const id = await createPlan('Three day');
    const a = await addWorkout(id, 'A');
    const b = await addWorkout(id, 'B');
    const c = await addWorkout(id, 'C');
    await moveWorkout(id, c, -1);
    expect((await planTemplates(id)).map((t) => t.id)).toEqual([a, c, b]);
    await moveWorkout(id, a, -1); // already first: no-op
    expect((await planTemplates(id)).map((t) => t.id)).toEqual([a, c, b]);
  });
});

describe('nextInPlan', () => {
  const ts = ['a', 'b', 'c'].map((id, order) => ({ id, programId: 'p', name: id, order, exercises: [] })) as Template[];
  const w = (templateId: string, startedAt: number, status = 'done') => ({ templateId, startedAt, status });
  it('rotates within the plan and ignores workouts from other plans', () => {
    expect(nextInPlan(ts, [])?.id).toBe('a');
    expect(nextInPlan(ts, [w('a', 1), w('b', 2)])?.id).toBe('c');
    expect(nextInPlan(ts, [w('c', 1)])?.id).toBe('a');
    expect(nextInPlan(ts, [w('b', 1), w('other-plan', 5)])?.id).toBe('c');
    expect(nextInPlan(ts, [w('a', 1), w('b', 9, 'active')])?.id).toBe('b');
    expect(nextInPlan([], [w('a', 1)])).toBeUndefined();
  });
});

describe('upgrading an existing install (v1 database, before plans)', () => {
  it('moves existing workouts into the default plan without losing data', async () => {
    const name = 'upgrade-test';
    await Dexie.delete(name);
    const v1 = new Dexie(name);
    v1.version(1).stores({ exercises: 'id, name', templates: 'id, order', workouts: '++id, startedAt, status, templateId', checkins: 'date', activities: '++id, date, type', settings: 'id' });
    await v1.open();
    const oldTemplates = SEED_TEMPLATES.map(({ programId: _, ...t }) => ({ ...t, name: t.id === 'upper_a' ? 'My edited Upper A' : t.name }));
    await v1.table('templates').bulkAdd(oldTemplates);
    await v1.table('exercises').bulkAdd(SEED_EXERCISES);
    const { activeProgramId: _a, ...oldSettings } = DEFAULT_SETTINGS;
    await v1.table('settings').add({ ...oldSettings, targets: { ...oldSettings.targets, weekly: { ...oldSettings.targets.weekly, weightSessions: 5 } }, google: { clientId: 'x' } });
    await v1.table('workouts').add({ templateId: 'upper_a', templateName: 'Upper A', startedAt: 1, status: 'done', exercises: [] });
    await v1.table('checkins').add({ date: '2026-10-07', bodyweight: 77.4 });
    v1.close();

    const upgraded = new TrackerDB(name);
    await upgraded.open();
    const plans = await upgraded.programs.toArray();
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ id: 'default', sessionsPerWeek: 5 });
    const ts = await upgraded.templates.toArray();
    expect(ts).toHaveLength(4);
    expect(ts.every((t) => t.programId === 'default')).toBe(true);
    expect(ts.find((t) => t.id === 'upper_a')?.name).toBe('My edited Upper A');
    const s = await upgraded.settings.get('settings');
    expect(s?.activeProgramId).toBe('default');
    expect(s && 'google' in s).toBe(false);
    expect(await upgraded.workouts.count()).toBe(1);
    expect((await upgraded.checkins.get('2026-10-07'))?.bodyweight).toBe(77.4);
    upgraded.close();
  });
});

describe('restoring an old (pre-plans) backup', () => {
  it('assigns every workout to the default plan', async () => {
    await createPlan('Will be replaced');
    const old = {
      app: 'mma-tracker',
      version: 1,
      exportedAt: '',
      exercises: SEED_EXERCISES,
      templates: SEED_TEMPLATES.map(({ programId: _, ...t }) => t),
      workouts: [],
      checkins: [],
      activities: [],
      settings: [{ ...DEFAULT_SETTINGS, activeProgramId: undefined }],
    };
    await importJSON(old);
    expect((await db.programs.toArray()).map((p) => p.id)).toEqual(['default']);
    expect((await getSettings()).activeProgramId).toBe('default');
    expect(await planTemplates('default')).toHaveLength(4);
  });
});
