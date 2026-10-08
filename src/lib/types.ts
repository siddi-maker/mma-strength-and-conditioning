// Core data model. All weights in kg, distances in metres, water in litres.

/** How a set is measured. */
export type Measure =
  | 'weight_reps' // barbell / dumbbell / cable: weight × reps
  | 'bodyweight' // reps, with optional added weight (pull-ups, dips)
  | 'distance' // weight × metres (farmer carries)
  | 'reps'; // reps only (box jumps, ab wheel)

/** Which progression rule applies. */
export type ProgressionRule =
  | 'main' // 5×5 / 4×5 / 3×5 strength lifts
  | 'power' // 5×3 cleans / push press, optional +2.5
  | 'accessory' // rep range or fixed reps; add the smallest increment when top of range is hit
  | 'pullup' // bodyweight pull-ups toward 15+ reps
  | 'weighted_pullup' // +2.5 kg after clean sets at target
  | 'none';

export type Region = 'upper' | 'lower';

export interface Exercise {
  id: string;
  name: string;
  measure: Measure;
  rule: ProgressionRule;
  region: Region;
  /** Smallest weight jump for this exercise (kg). */
  increment: number;
  /** Reps are counted per leg / per side. */
  perSide?: boolean;
  /** Weight to prefill the very first time (kg). */
  startWeight?: number;
}

export interface Prescription {
  exerciseId: string;
  sets: number;
  /** Bottom of rep range (or the fixed rep target). Ignored when amrap. */
  repsMin: number;
  /** Top of rep range; equal to repsMin for fixed reps. */
  repsMax: number;
  /** Max reps / AMRAP sets. */
  amrap?: boolean;
  /** Target distance in metres (distance measure). */
  distance?: number;
  /** Rest in seconds (lower bound / default). */
  restSec: number;
  /** Upper bound for rest, if a range was prescribed. */
  restMaxSec?: number;
}

export type CardioKind = 'zone2' | 'intervals' | 'sprints';

/** A training plan (regime): a rotation of workout templates. Exactly one is active. */
export interface Program {
  id: string;
  name: string;
  /** Weekly weight-session target used by the dashboard and adherence. */
  sessionsPerWeek: number;
  createdAt: number;
}

export interface Template {
  id: string;
  /** The plan this workout belongs to. */
  programId: string;
  name: string;
  order: number;
  exercises: Prescription[];
  /** The conditioning piece paired with this session. */
  conditioning?: { kind: CardioKind; label: string };
}

export interface SetLog {
  weight?: number; // kg (added weight for bodyweight)
  reps?: number;
  distance?: number; // m
  rpe?: number;
  done: boolean;
  at?: number; // timestamp when confirmed
}

export interface ExerciseLog {
  exerciseId: string;
  /** Exercise originally prescribed, if this one was swapped in. */
  swappedFrom?: string;
  skipped?: boolean;
  /** Snapshot of the prescription used for this session. */
  target: Prescription;
  sets: SetLog[];
  notes?: string;
}

export interface Workout {
  id?: number;
  templateId: string;
  templateName: string;
  startedAt: number;
  finishedAt?: number;
  status: 'active' | 'done';
  deload?: boolean;
  exercises: ExerciseLog[];
}

export interface CheckIn {
  date: string; // YYYY-MM-DD
  bodyweight?: number;
  bodyFat?: number;
  sleepHours?: number;
  bedtime?: string; // HH:MM
  wakeTime?: string;
  protein?: number;
  calories?: number;
  carbs?: number;
  fat?: number;
  water?: number; // L
  creatine?: boolean;
  electrolytes?: boolean;
  phoneOff?: boolean;
  caffeineBefore2?: boolean;
}

export type ActivityType =
  | 'zone2'
  | 'intervals'
  | 'sprints'
  | 'sprint_test'
  | 'martial_arts'
  | 'beep_test';

export type MartialArtsType = 'MMA' | 'BJJ' | 'Striking' | 'Wrestling' | 'Sparring';

export interface Activity {
  id?: number;
  date: string; // YYYY-MM-DD
  type: ActivityType;
  durationMin?: number;
  distanceM?: number;
  avgHr?: number;
  rounds?: number;
  machine?: 'bike' | 'rower';
  sprintReps?: number;
  sprintTimes?: number[]; // seconds
  time100m?: number; // seconds, for sprint_test
  maType?: MartialArtsType;
  intensity?: number; // 1–5
  quality?: boolean;
  beepLevel?: number;
  notes?: string;
  createdAt: number;
}

export interface Range {
  min: number;
  max: number;
}

export interface Targets {
  daily: {
    protein: Range;
    calories: Range;
    water: Range;
    carbs: Range;
    fat: Range;
  };
  weekly: {
    sleep: Range;
    protein: Range;
    water: Range;
    zone2Min: Range;
    sprintSessions: number;
    maSessions: Range;
    /** @deprecated Superseded by Program.sessionsPerWeek; kept so old backups import cleanly. */
    weightSessions?: number;
  };
}

export type GoalSource =
  | { kind: 'bodyweight' }
  | { kind: 'bodyfat' }
  | { kind: 'maxReps'; exerciseId: string }
  | { kind: 'e1rm'; exerciseId: string }
  | { kind: 'sprint100' };

export interface Goal {
  id: string;
  label: string;
  unit: string;
  start: number;
  /** Shown as text, e.g. "25 kg × 5". */
  startLabel?: string;
  goal: number;
  /** For range goals (bodyweight 77–80). */
  goalMax?: number;
  goalLabel?: string;
  direction: 'up' | 'down' | 'range';
  source: GoalSource;
}

export interface Settings {
  id: 'settings';
  /** The plan the whole app is currently showing. */
  activeProgramId?: string;
  targets: Targets;
  goals: Goal[];
  deloadEveryWeeks: number;
  /** Date (YYYY-MM-DD) the current training block started (last deload ended). */
  blockStart?: string;
  /** Last day (inclusive) of an active deload week. */
  deloadUntil?: string;
  sound: boolean;
  vibrate: boolean;
}
