import { db } from './db';
import { toISODate } from './dates';
import { SEED_PROGRAM } from './seed';
import type { Activity, CheckIn, Exercise, Program, Settings, Template, Workout } from './types';

export interface Backup {
  app: 'mma-tracker';
  version: 1 | 2;
  exportedAt: string;
  /** Added in version 2. Version 1 backups predate plans. */
  programs?: Program[];
  exercises: Exercise[];
  templates: Template[];
  workouts: Workout[];
  checkins: CheckIn[];
  activities: Activity[];
  settings: Settings[];
}

export async function exportJSON(): Promise<Backup> {
  const [programs, exercises, templates, workouts, checkins, activities, settings] = await Promise.all([
    db.programs.toArray(),
    db.exercises.toArray(),
    db.templates.toArray(),
    db.workouts.toArray(),
    db.checkins.toArray(),
    db.activities.toArray(),
    db.settings.toArray(),
  ]);
  return { app: 'mma-tracker', version: 2, exportedAt: new Date().toISOString(), programs, exercises, templates, workouts, checkins, activities, settings };
}

export function validateBackup(data: unknown): data is Backup {
  if (!data || typeof data !== 'object') return false;
  const b = data as Partial<Backup>;
  return (
    b.app === 'mma-tracker' &&
    Array.isArray(b.exercises) &&
    Array.isArray(b.templates) &&
    Array.isArray(b.workouts) &&
    Array.isArray(b.checkins) &&
    Array.isArray(b.activities) &&
    Array.isArray(b.settings)
  );
}

/** Replace everything with the backup contents (atomic). */
export async function importJSON(data: unknown): Promise<void> {
  if (!validateBackup(data)) throw new Error('Not a valid tracker backup file');
  // Version 1 backups have no plans: put every workout into the default plan and make it active.
  const programs = data.programs?.length ? data.programs : [SEED_PROGRAM];
  const fallback = programs[0].id;
  const templates = data.templates.map((t) => ({ ...t, programId: t.programId ?? fallback }));
  const settings = data.settings.map((s) => ({ ...s, activeProgramId: programs.some((p) => p.id === s.activeProgramId) ? s.activeProgramId : fallback }));
  await db.transaction('rw', [db.programs, db.exercises, db.templates, db.workouts, db.checkins, db.activities, db.settings], async () => {
    await Promise.all([db.programs.clear(), db.exercises.clear(), db.templates.clear(), db.workouts.clear(), db.checkins.clear(), db.activities.clear(), db.settings.clear()]);
    await db.programs.bulkPut(programs);
    await db.exercises.bulkPut(data.exercises);
    await db.templates.bulkPut(templates);
    await db.workouts.bulkPut(data.workouts);
    await db.checkins.bulkPut(data.checkins);
    await db.activities.bulkPut(data.activities);
    await db.settings.bulkPut(settings);
  });
}

function csvCell(v: unknown): string {
  if (v === undefined || v === null) return '';
  const s = Array.isArray(v) ? v.join(' ') : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  return [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n');
}

/** One row per logged set — the most useful flat view of workouts. */
export function setsCSV(workouts: Workout[], exercises: Record<string, Exercise>): string {
  const rows: Record<string, unknown>[] = [];
  for (const w of workouts) {
    for (const e of w.exercises) {
      e.sets.forEach((s, i) =>
        rows.push({
          workout_id: w.id,
          date: toISODate(w.startedAt),
          template: w.templateName,
          exercise: exercises[e.exerciseId]?.name ?? e.exerciseId,
          swapped_from: e.swappedFrom ? (exercises[e.swappedFrom]?.name ?? e.swappedFrom) : '',
          skipped: e.skipped ? 'yes' : '',
          set: i + 1,
          weight_kg: s.weight,
          reps: s.reps,
          distance_m: s.distance,
          rpe: s.rpe,
          done: s.done ? 'yes' : 'no',
          notes: i === 0 ? e.notes : '',
        }),
      );
    }
  }
  return toCSV(rows, ['workout_id', 'date', 'template', 'exercise', 'swapped_from', 'skipped', 'set', 'weight_kg', 'reps', 'distance_m', 'rpe', 'done', 'notes']);
}

export function workoutsCSV(workouts: Workout[]): string {
  return toCSV(
    workouts.map((w) => ({
      id: w.id,
      date: toISODate(w.startedAt),
      template: w.templateName,
      status: w.status,
      deload: w.deload ? 'yes' : '',
      started_at: new Date(w.startedAt).toISOString(),
      finished_at: w.finishedAt ? new Date(w.finishedAt).toISOString() : '',
    })),
  );
}

export function download(filename: string, content: string, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function clearAllData(): Promise<void> {
  await db.delete();
  localStorage.clear();
}
