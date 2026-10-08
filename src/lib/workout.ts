import { db, finishedWorkouts, getSettings, saveSettings } from './db';
import { addDays, toISODate } from './dates';
import { deloadSets, exerciseHistory, suggest, type Suggestion } from './progression';
import type { Exercise, ExerciseLog, Prescription, SetLog, Template, Workout } from './types';

export function setsFromSuggestion(rx: Prescription, s: Suggestion, setCount = rx.sets): SetLog[] {
  return Array.from({ length: setCount }, (_, i) => ({
    weight: s.weight,
    reps: s.reps[i] ?? s.reps[s.reps.length - 1] ?? rx.repsMin,
    distance: s.distance ?? rx.distance,
    done: false,
  }));
}

export function buildExerciseLog(ex: Exercise, rx: Prescription, all: Workout[], deload: boolean): ExerciseLog {
  const target: Prescription = { ...rx, exerciseId: ex.id, sets: deload ? deloadSets(rx.sets) : rx.sets };
  const s = suggest(ex, target, exerciseHistory(all, ex.id));
  return { exerciseId: ex.id, target, sets: setsFromSuggestion(target, s) };
}

export function isDeloadActive(deloadUntil: string | undefined, today = toISODate()): boolean {
  return !!deloadUntil && today <= deloadUntil;
}

export async function startWorkout(template: Template): Promise<number> {
  const settings = await getSettings();
  const today = toISODate();
  if (!settings.blockStart) await saveSettings({ blockStart: today });
  const deload = isDeloadActive(settings.deloadUntil, today);
  const all = await finishedWorkouts();
  const exercises = await db.exercises.bulkGet(template.exercises.map((p) => p.exerciseId));
  const logs = template.exercises.flatMap((rx, i) => {
    const ex = exercises[i];
    return ex ? [buildExerciseLog(ex, rx, all, deload)] : [];
  });
  return db.workouts.add({
    templateId: template.id,
    templateName: template.name,
    startedAt: Date.now(),
    status: 'active',
    deload,
    exercises: logs,
  });
}

export async function startDeloadWeek(): Promise<void> {
  const today = toISODate();
  await saveSettings({ deloadUntil: addDays(today, 6), blockStart: addDays(today, 7) });
}
