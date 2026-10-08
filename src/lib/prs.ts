import type { Exercise, Workout } from './types';
import { epley, exerciseHistory } from './progression';

export type PRType = 'weight' | 'reps' | 'e1rm';

export interface PR {
  exerciseId: string;
  type: PRType;
  value: number;
  previous: number;
  detail: string;
}

/**
 * Compare a workout against everything logged before it.
 * - weight PR: heaviest load ever lifted
 * - rep PR: more reps than ever done at this load or heavier
 * - e1RM PR: best Epley estimate
 * The first time an exercise is logged sets a baseline, not a PR.
 */
export function detectPRs(workout: Workout, allWorkouts: Workout[], exercises: Record<string, Exercise>): PR[] {
  const prs: PR[] = [];
  for (const e of workout.exercises) {
    if (e.skipped) continue;
    const ex = exercises[e.exerciseId];
    const sets = e.sets.filter((s) => s.done && (s.reps ?? 0) > 0);
    if (!sets.length || !ex) continue;
    const history = exerciseHistory(allWorkouts, e.exerciseId, workout.startedAt);
    if (!history.length) continue;
    const prevSets = history.flatMap((h) => h.sets);
    const name = ex.name;
    const usesLoad = ex.measure === 'weight_reps' || ex.measure === 'bodyweight';

    if (usesLoad) {
      const prevMaxW = Math.max(0, ...prevSets.map((s) => s.weight ?? 0));
      const curMaxW = Math.max(0, ...sets.map((s) => s.weight ?? 0));
      if (curMaxW > prevMaxW && curMaxW > 0) {
        prs.push({ exerciseId: e.exerciseId, type: 'weight', value: curMaxW, previous: prevMaxW, detail: `${name}: ${curMaxW} kg` });
      }

      const prevE = Math.max(0, ...prevSets.map((s) => epley(s.weight ?? 0, s.reps ?? 0)));
      const curE = Math.max(0, ...sets.map((s) => epley(s.weight ?? 0, s.reps ?? 0)));
      if (curE > prevE + 0.01 && curE > 0) {
        prs.push({ exerciseId: e.exerciseId, type: 'e1rm', value: round1(curE), previous: round1(prevE), detail: `${name}: e1RM ${round1(curE)} kg` });
      }
    }

    // Rep PR: the best set whose reps beat everything previously done at >= that load.
    let best: PR | undefined;
    for (const s of sets) {
      const w = s.weight ?? 0;
      const prevAtLoad = Math.max(0, ...prevSets.filter((p) => (p.weight ?? 0) >= w).map((p) => p.reps ?? 0));
      const reps = s.reps ?? 0;
      if (reps > prevAtLoad && (!best || reps - prevAtLoad > best.value - best.previous)) {
        const load = usesLoad && w > 0 ? ` @ ${w} kg` : '';
        best = { exerciseId: e.exerciseId, type: 'reps', value: reps, previous: prevAtLoad, detail: `${name}: ${reps} reps${load}` };
      }
    }
    if (best) prs.push(best);
  }
  return prs;
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

export function workoutVolume(w: Workout): number {
  let v = 0;
  for (const e of w.exercises) {
    if (e.skipped) continue;
    for (const s of e.sets) if (s.done) v += (s.weight ?? 0) * (s.reps ?? 0);
  }
  return Math.round(v);
}
