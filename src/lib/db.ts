import Dexie, { type Table } from 'dexie';
import type { Activity, CheckIn, Exercise, Settings, Template, Workout } from './types';
import { DEFAULT_SETTINGS, SEED_EXERCISES, SEED_TEMPLATES } from './seed';

export class TrackerDB extends Dexie {
  exercises!: Table<Exercise, string>;
  templates!: Table<Template, string>;
  workouts!: Table<Workout, number>;
  checkins!: Table<CheckIn, string>;
  activities!: Table<Activity, number>;
  settings!: Table<Settings, string>;

  constructor(name = 'mma-tracker') {
    super(name);
    this.version(1).stores({
      exercises: 'id, name',
      templates: 'id, order',
      workouts: '++id, startedAt, status, templateId',
      checkins: 'date',
      activities: '++id, date, type',
      settings: 'id',
    });
    this.on('populate', (tx) => {
      tx.table('exercises').bulkAdd(SEED_EXERCISES);
      tx.table('templates').bulkAdd(SEED_TEMPLATES);
      tx.table('settings').add(DEFAULT_SETTINGS);
    });
  }
}

export const db = new TrackerDB();

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch {
    /* ignore */
  }
  return false;
}

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('settings')) ?? DEFAULT_SETTINGS;
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const cur = await getSettings();
  await db.settings.put({ ...cur, ...patch, id: 'settings' });
}

/** Finished workouts, oldest first. */
export async function finishedWorkouts(): Promise<Workout[]> {
  return db.workouts.where('status').equals('done').sortBy('startedAt');
}
