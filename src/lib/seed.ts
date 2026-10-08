import type { Exercise, Goal, Prescription, Settings, Template } from './types';

const ex = (
  id: string,
  name: string,
  measure: Exercise['measure'],
  rule: Exercise['rule'],
  region: Exercise['region'],
  increment: number,
  extra: Partial<Exercise> = {},
): Exercise => ({ id, name, measure, rule, region, increment, ...extra });

export const SEED_EXERCISES: Exercise[] = [
  // Upper A
  ex('bench', 'Bench Press', 'weight_reps', 'main', 'upper', 2.5, { startWeight: 75 }),
  ex('wpullup', 'Weighted Pull-Ups', 'bodyweight', 'weighted_pullup', 'upper', 2.5, { startWeight: 0 }),
  ex('incline_db', 'Incline DB Press', 'weight_reps', 'accessory', 'upper', 2, { startWeight: 22 }),
  ex('bb_row', 'Barbell Row', 'weight_reps', 'accessory', 'upper', 2.5, { startWeight: 60 }),
  ex('lat_raise', 'Lateral Raises', 'weight_reps', 'accessory', 'upper', 1, { startWeight: 8 }),
  ex('hammer', 'Hammer Curls', 'weight_reps', 'accessory', 'upper', 2, { startWeight: 14 }),
  ex('pushdown', 'Rope Pushdowns', 'weight_reps', 'accessory', 'upper', 2.5, { startWeight: 25 }),
  ex('neck_flex', 'Neck Flexion', 'weight_reps', 'accessory', 'upper', 1.25, { startWeight: 5 }),
  ex('neck_ext', 'Neck Extension', 'weight_reps', 'accessory', 'upper', 1.25, { startWeight: 5 }),
  ex('cable_curl', 'Cable Curls', 'weight_reps', 'accessory', 'upper', 2.5, { startWeight: 20 }),
  ex('oh_tri', 'Overhead Tricep Extensions', 'weight_reps', 'accessory', 'upper', 2.5, { startWeight: 20 }),
  // Lower A
  ex('squat', 'Back Squat', 'weight_reps', 'main', 'lower', 5, { startWeight: 75 }),
  ex('rdl', 'Romanian Deadlift', 'weight_reps', 'accessory', 'lower', 5, { startWeight: 80 }),
  ex('bss', 'Bulgarian Split Squat', 'weight_reps', 'accessory', 'lower', 2, { perSide: true, startWeight: 16 }),
  ex('calf', 'Standing Calf Raises', 'weight_reps', 'accessory', 'lower', 2.5, { startWeight: 40 }),
  ex('hlr', 'Hanging Leg Raises', 'reps', 'none', 'lower', 0),
  ex('pallof', 'Pallof Press', 'weight_reps', 'accessory', 'lower', 2.5, { perSide: true, startWeight: 10 }),
  // Upper B
  ex('push_press', 'Push Press', 'weight_reps', 'power', 'upper', 2.5, { startWeight: 50 }),
  ex('pullup', 'Pull-Ups', 'bodyweight', 'pullup', 'upper', 2.5, { startWeight: 0 }),
  ex('db_bench', 'DB Bench Press', 'weight_reps', 'accessory', 'upper', 2, { startWeight: 25 }),
  ex('cs_row', 'Chest-Supported Row', 'weight_reps', 'accessory', 'upper', 2, { startWeight: 22 }),
  ex('dips', 'Dips', 'bodyweight', 'none', 'upper', 2.5, { startWeight: 0 }),
  ex('face_pull', 'Face Pulls', 'weight_reps', 'accessory', 'upper', 2.5, { startWeight: 20 }),
  ex('ez_curl', 'EZ Bar Curls', 'weight_reps', 'accessory', 'upper', 2.5, { startWeight: 30 }),
  ex('farmer', 'Farmer Carries', 'distance', 'accessory', 'upper', 2, { startWeight: 32 }),
  // Lower B
  ex('clean', 'Power Cleans', 'weight_reps', 'power', 'lower', 2.5, { startWeight: 60 }),
  ex('front_squat', 'Front Squat', 'weight_reps', 'main', 'lower', 5, { startWeight: 60 }),
  ex('deadlift', 'Deadlift', 'weight_reps', 'main', 'lower', 5, { startWeight: 140 }),
  ex('box_jump', 'Box Jumps', 'reps', 'none', 'lower', 0),
  ex('lunge', 'Walking Lunges', 'weight_reps', 'accessory', 'lower', 2, { perSide: false, startWeight: 16 }),
  ex('ab_wheel', 'Ab Wheel', 'reps', 'none', 'lower', 0),
];

const p = (
  exerciseId: string,
  sets: number,
  repsMin: number,
  repsMax: number,
  restSec: number,
  restMaxSec?: number,
  extra: Partial<Prescription> = {},
): Prescription => ({ exerciseId, sets, repsMin, repsMax, restSec, restMaxSec, ...extra });

export const SEED_TEMPLATES: Template[] = [
  {
    id: 'upper_a',
    name: 'Upper A',
    order: 0,
    conditioning: { kind: 'zone2', label: 'Zone 2 run 30–40 min' },
    exercises: [
      p('bench', 5, 5, 5, 180),
      p('wpullup', 4, 6, 6, 120, 180),
      p('incline_db', 3, 8, 10, 90),
      p('bb_row', 4, 8, 8, 120),
      p('lat_raise', 3, 15, 15, 45, 60),
      p('hammer', 3, 12, 12, 60),
      p('pushdown', 3, 12, 12, 60),
      p('neck_flex', 3, 20, 20, 30),
      p('neck_ext', 3, 20, 20, 30),
      p('cable_curl', 3, 15, 15, 60),
      p('oh_tri', 3, 15, 15, 60),
    ],
  },
  {
    id: 'lower_a',
    name: 'Lower A',
    order: 1,
    conditioning: { kind: 'intervals', label: 'Bike/rower: 10 × 20 s hard / 100 s easy' },
    exercises: [
      p('squat', 5, 5, 5, 180, 240),
      p('rdl', 4, 8, 8, 120),
      p('bss', 3, 8, 8, 90),
      p('calf', 4, 15, 15, 60),
      p('hlr', 4, 15, 15, 45),
      p('pallof', 3, 12, 12, 30, 45),
    ],
  },
  {
    id: 'upper_b',
    name: 'Upper B',
    order: 2,
    conditioning: { kind: 'zone2', label: 'Zone 2 run 30–40 min' },
    exercises: [
      p('push_press', 5, 3, 3, 120, 180),
      p('pullup', 4, 0, 0, 120, undefined, { amrap: true }),
      p('db_bench', 4, 8, 8, 90),
      p('cs_row', 4, 10, 10, 90),
      p('dips', 3, 0, 0, 120, undefined, { amrap: true }),
      p('face_pull', 3, 15, 15, 60),
      p('ez_curl', 3, 12, 12, 60),
      p('farmer', 4, 0, 0, 90, 120, { distance: 40 }),
      p('cable_curl', 3, 15, 15, 60),
      p('oh_tri', 3, 15, 15, 60),
    ],
  },
  {
    id: 'lower_b',
    name: 'Lower B',
    order: 3,
    conditioning: { kind: 'sprints', label: 'Sprints 6 × 100 m, 90–120 s rest' },
    exercises: [
      p('clean', 5, 3, 3, 120, 180),
      p('front_squat', 4, 5, 5, 180),
      p('deadlift', 3, 5, 5, 180, 240),
      p('box_jump', 5, 3, 3, 90),
      p('lunge', 3, 20, 20, 90),
      p('ab_wheel', 4, 10, 10, 45, 60),
    ],
  },
];

export const SEED_GOALS: Goal[] = [
  { id: 'bw', label: 'Bodyweight', unit: 'kg', start: 77, goal: 77, goalMax: 80, direction: 'range', source: { kind: 'bodyweight' } },
  { id: 'bf', label: 'Body fat', unit: '%', start: 15, goal: 14, goalLabel: '12–14%', direction: 'down', source: { kind: 'bodyfat' } },
  { id: 'pullups', label: 'Pull-ups', unit: 'reps', start: 9, goal: 15, goalLabel: '15+', direction: 'up', source: { kind: 'maxReps', exerciseId: 'pullup' } },
  {
    id: 'db_bench',
    label: 'DB bench (e1RM)',
    unit: 'kg',
    start: 29.2,
    startLabel: '25 kg × 5',
    goal: 44.3,
    goalLabel: '35 kg × 8',
    direction: 'up',
    source: { kind: 'e1rm', exerciseId: 'db_bench' },
  },
  { id: 'bench', label: 'Bench press (e1RM)', unit: 'kg', start: 75, goal: 100, goalLabel: '100 kg+', direction: 'up', source: { kind: 'e1rm', exerciseId: 'bench' } },
  { id: 'squat', label: 'Back squat (e1RM)', unit: 'kg', start: 75, goal: 150, goalLabel: '150 kg+', direction: 'up', source: { kind: 'e1rm', exerciseId: 'squat' } },
  { id: 'deadlift', label: 'Deadlift (e1RM)', unit: 'kg', start: 140, goal: 190, goalLabel: '190 kg+', direction: 'up', source: { kind: 'e1rm', exerciseId: 'deadlift' } },
  { id: 'sprint', label: '100 m sprint', unit: 's', start: 12.5, goal: 12.5, goalLabel: '≤ 12.5 s', direction: 'down', source: { kind: 'sprint100' } },
];

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  targets: {
    daily: {
      protein: { min: 180, max: 200 },
      calories: { min: 3200, max: 3600 },
      water: { min: 4, max: 5 },
      carbs: { min: 350, max: 450 },
      fat: { min: 70, max: 90 },
    },
    weekly: {
      sleep: { min: 60, max: 65 },
      protein: { min: 1260, max: 1400 },
      water: { min: 28, max: 35 },
      zone2Min: { min: 60, max: 80 },
      sprintSessions: 1,
      maSessions: { min: 4, max: 6 },
      weightSessions: 4,
    },
  },
  goals: SEED_GOALS,
  deloadEveryWeeks: 7,
  sound: true,
  vibrate: true,
};
