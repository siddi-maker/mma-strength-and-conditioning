import type { Exercise, Prescription, SetLog, Workout } from './types';
import { daysBetween, toISODate } from './dates';

/** Epley estimated one-rep max. */
export function epley(weight: number, reps: number): number {
  if (!weight || !reps || reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export function roundTo(x: number, step: number): number {
  if (!step) return Math.round(x * 100) / 100;
  return Math.round(Math.round(x / step) * step * 100) / 100;
}

export interface SessionEntry {
  workoutId?: number;
  date: string;
  startedAt: number;
  target: Prescription;
  sets: SetLog[]; // completed sets only
}

/** Every finished session of an exercise, most recent first. Skipped entries are ignored. */
export function exerciseHistory(workouts: Workout[], exerciseId: string, beforeTs = Infinity): SessionEntry[] {
  const out: SessionEntry[] = [];
  for (const w of workouts) {
    if (w.status !== 'done' || w.startedAt >= beforeTs) continue;
    for (const e of w.exercises) {
      if (e.exerciseId !== exerciseId || e.skipped) continue;
      const sets = e.sets.filter((s) => s.done);
      if (!sets.length) continue;
      out.push({ workoutId: w.id, date: toISODate(w.startedAt), startedAt: w.startedAt, target: e.target, sets });
    }
  }
  return out.sort((a, b) => b.startedAt - a.startedAt);
}

export function topWeight(sets: SetLog[]): number {
  return sets.reduce((m, s) => Math.max(m, s.weight ?? 0), 0);
}

/** Did the session complete every prescribed set at (at least) the given rep / distance target? */
export function metTarget(session: SessionEntry, reps: number, distance?: number): boolean {
  const t = session.target;
  if (session.sets.length < t.sets) return false;
  return session.sets.every((s) => {
    if (distance) return (s.distance ?? 0) >= distance;
    return (s.reps ?? 0) >= reps;
  });
}

export type SuggestionKind = 'first' | 'increase' | 'hold' | 'decrease';

export interface Suggestion {
  kind: SuggestionKind;
  /** Prefilled weight (kg, or added kg for bodyweight). */
  weight: number;
  /** Prefilled reps per set. */
  reps: number[];
  distance?: number;
  /** Human-readable reason. */
  note: string;
  /** An optional jump the user can accept with one tap (power lifts). */
  optional?: { weight: number; note: string };
}

function fill(n: number, v: number): number[] {
  return Array.from({ length: n }, () => v);
}

/** Last session's reps per set, padded/clamped. */
function lastReps(prev: SessionEntry, n: number, min: number, max: number): number[] {
  return Array.from({ length: n }, (_, i) => {
    const r = prev.sets[i]?.reps ?? prev.sets[prev.sets.length - 1]?.reps ?? min;
    return Math.min(Math.max(r, min), max || r);
  });
}

/**
 * The progression engine. Given the exercise, today's prescription and the history
 * (most recent first), decide what to prefill.
 */
export function suggest(ex: Exercise, rx: Prescription, history: SessionEntry[]): Suggestion {
  const n = rx.sets;
  const baseReps = rx.amrap ? 0 : rx.repsMin;
  const prev = history[0];

  if (!prev) {
    return {
      kind: 'first',
      weight: ex.startWeight ?? 0,
      reps: fill(n, rx.amrap ? (ex.rule === 'pullup' ? 9 : 10) : baseReps),
      distance: rx.distance,
      note: 'First session — set your starting numbers.',
    };
  }

  const last = topWeight(prev.sets);
  const inc = ex.increment;

  switch (ex.rule) {
    case 'main': {
      if (metTarget(prev, rx.repsMin)) {
        return {
          kind: 'increase',
          weight: roundTo(last + inc, inc),
          reps: fill(n, rx.repsMin),
          note: `All sets done last time → +${inc} kg`,
        };
      }
      const prev2 = history[1];
      if (prev2 && !metTarget(prev2, rx.repsMin) && topWeight(prev2.sets) === last) {
        return {
          kind: 'decrease',
          weight: roundTo(last * 0.9, inc || 2.5),
          reps: fill(n, rx.repsMin),
          note: 'Missed target two sessions in a row → −10%',
        };
      }
      return { kind: 'hold', weight: last, reps: fill(n, rx.repsMin), note: 'Missed a rep last time — repeat the weight' };
    }

    case 'power': {
      const s: Suggestion = { kind: 'hold', weight: last, reps: fill(n, rx.repsMin), note: 'Stay crisp and fast' };
      if (metTarget(prev, rx.repsMin)) {
        s.optional = { weight: roundTo(last + inc, inc), note: `Optional: +${inc} kg if bar speed was good` };
      }
      return s;
    }

    case 'weighted_pullup': {
      if (metTarget(prev, rx.repsMin)) {
        return { kind: 'increase', weight: roundTo(last + inc, inc), reps: fill(n, rx.repsMin), note: `Clean ${n}×${rx.repsMin} → +${inc} kg` };
      }
      return { kind: 'hold', weight: last, reps: fill(n, rx.repsMin), note: `Hit clean ${n}×${rx.repsMin} before adding weight` };
    }

    case 'pullup': {
      const best = Math.max(...prev.sets.map((s) => s.reps ?? 0));
      const reps = prev.sets.length ? lastReps(prev, n, 0, 0) : fill(n, 9);
      return {
        kind: 'hold',
        weight: last,
        reps,
        note: best >= 15 ? `Best set ${best} — 15+ reached!` : `Best set ${best} → goal 15+. Beat one set by a rep.`,
      };
    }

    case 'accessory': {
      if (rx.distance) {
        if (metTarget(prev, 0, rx.distance)) {
          return {
            kind: 'increase',
            weight: roundTo(last + inc, inc),
            reps: fill(n, 0),
            distance: rx.distance,
            note: `All carries completed → +${inc} kg`,
          };
        }
        return { kind: 'hold', weight: last, reps: fill(n, 0), distance: rx.distance, note: 'Complete every carry before adding weight' };
      }
      const top = rx.repsMax || rx.repsMin;
      if (metTarget(prev, top)) {
        return {
          kind: 'increase',
          weight: roundTo(last + inc, inc),
          reps: fill(n, rx.repsMin),
          note: `Top of range (${top}) on all sets → +${inc} kg`,
        };
      }
      return {
        kind: 'hold',
        weight: last,
        reps: lastReps(prev, n, rx.repsMin, top),
        note: rx.repsMax > rx.repsMin ? `Add reps until ${top} on every set` : `Hit ${top} on every set to progress`,
      };
    }

    default: {
      const reps = rx.amrap ? lastReps(prev, n, 0, 0) : fill(n, rx.repsMin);
      return { kind: 'hold', weight: last, reps, distance: rx.distance, note: rx.amrap ? 'Max reps — beat last time' : '' };
    }
  }
}

/** Deload week: ~60% of the volume (sets), same intensity. */
export function deloadSets(sets: number): number {
  return Math.max(1, Math.round(sets * 0.6));
}

/** Rotation: the template after the most recently finished one. */
export function nextTemplateId(templateIdsInOrder: string[], lastTemplateId?: string): string | undefined {
  if (!templateIdsInOrder.length) return undefined;
  const i = lastTemplateId ? templateIdsInOrder.indexOf(lastTemplateId) : -1;
  return templateIdsInOrder[(i + 1) % templateIdsInOrder.length];
}

/** Is a deload due? Returns weeks since block start. */
export function deloadDue(blockStart: string | undefined, today: string, everyWeeks: number): { due: boolean; weeks: number } {
  if (!blockStart) return { due: false, weeks: 0 };
  const weeks = Math.floor(daysBetween(blockStart, today) / 7);
  return { due: weeks >= everyWeeks, weeks };
}

export interface LiftOptions {
  /** Exercises with finished sessions, most recently trained first. */
  logged: { exercise: Exercise; sessions: number; last: number }[];
  /** In the active plan but not logged yet. */
  inPlan: Exercise[];
  /** Everything else in the exercise library. */
  other: Exercise[];
}

/** Every exercise, grouped for the Charts picker. */
export function liftOptions(exercises: Exercise[], workouts: Workout[], planExerciseIds: Set<string>): LiftOptions {
  const stats = new Map<string, { sessions: number; last: number }>();
  for (const w of workouts) {
    if (w.status !== 'done') continue;
    for (const e of w.exercises) {
      if (e.skipped || !e.sets.some((s) => s.done)) continue;
      const s = stats.get(e.exerciseId) ?? { sessions: 0, last: 0 };
      stats.set(e.exerciseId, { sessions: s.sessions + 1, last: Math.max(s.last, w.startedAt) });
    }
  }
  const byName = (a: Exercise, b: Exercise) => a.name.localeCompare(b.name);
  return {
    logged: exercises
      .filter((e) => stats.has(e.id))
      .map((exercise) => ({ exercise, ...stats.get(exercise.id)! }))
      .sort((a, b) => b.last - a.last),
    inPlan: exercises.filter((e) => !stats.has(e.id) && planExerciseIds.has(e.id)).sort(byName),
    other: exercises.filter((e) => !stats.has(e.id) && !planExerciseIds.has(e.id)).sort(byName),
  };
}
