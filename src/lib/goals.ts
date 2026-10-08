import type { Activity, CheckIn, Goal, Workout } from './types';
import { epley, exerciseHistory } from './progression';

/** Current value for a goal from logged data, or undefined if nothing logged yet. */
export function goalCurrent(goal: Goal, data: { checkins: CheckIn[]; activities: Activity[]; workouts: Workout[] }): number | undefined {
  const src = goal.source;
  switch (src.kind) {
    case 'bodyweight':
      return latest(data.checkins, (c) => c.bodyweight);
    case 'bodyfat':
      return latest(data.checkins, (c) => c.bodyFat);
    case 'maxReps': {
      // Best set over the last 30 days, so the bar reflects current ability.
      const recent = exerciseHistory(data.workouts, src.exerciseId).filter((h) => h.startedAt >= Date.now() - 30 * 86_400_000);
      const reps = recent.flatMap((h) => h.sets.map((s) => s.reps ?? 0));
      return reps.length ? Math.max(...reps) : undefined;
    }
    case 'e1rm': {
      const sets = exerciseHistory(data.workouts, src.exerciseId).flatMap((h) => h.sets);
      const best = Math.max(0, ...sets.map((s) => epley(s.weight ?? 0, s.reps ?? 0)));
      return best ? Math.round(best * 10) / 10 : undefined;
    }
    case 'sprint100': {
      const times = data.activities.flatMap((a) => (a.type === 'sprint_test' && a.time100m ? [a.time100m] : []));
      return times.length ? Math.min(...times) : undefined;
    }
  }
}

function latest(checkins: CheckIn[], f: (c: CheckIn) => number | undefined): number | undefined {
  const sorted = [...checkins].sort((a, b) => b.date.localeCompare(a.date));
  for (const c of sorted) {
    const v = f(c);
    if (v !== undefined) return v;
  }
  return undefined;
}

/** 0..1 progress from start to goal; for range goals, 1 when inside the range. */
export function goalProgress(goal: Goal, current: number | undefined): number {
  if (current === undefined) return 0;
  if (goal.direction === 'range') {
    const hi = goal.goalMax ?? goal.goal;
    if (current >= goal.goal && current <= hi) return 1;
    const dist = current < goal.goal ? goal.goal - current : current - hi;
    return Math.max(0, 1 - dist / Math.max(1, Math.abs(goal.goal - goal.start) || 5));
  }
  const span = goal.goal - goal.start;
  if (span === 0) {
    const met = goal.direction === 'down' ? current <= goal.goal : current >= goal.goal;
    return met ? 1 : 0;
  }
  return Math.max(0, Math.min(1, (current - goal.start) / span));
}

export function goalMet(goal: Goal, current: number | undefined): boolean {
  if (current === undefined) return false;
  if (goal.direction === 'range') return current >= goal.goal && current <= (goal.goalMax ?? goal.goal);
  return goal.direction === 'down' ? current <= goal.goal : current >= goal.goal;
}
