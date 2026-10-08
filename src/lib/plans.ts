import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings, saveSettings } from './db';
import { SEED_PROGRAM } from './seed';
import type { Program, Template } from './types';

/** Unique, readable id (timestamp alone collides on quick successive taps). */
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** The active plan, falling back to the first one if the setting points nowhere. */
export async function getActivePlan(): Promise<Program | undefined> {
  const [settings, plans] = await Promise.all([getSettings(), db.programs.toArray()]);
  return plans.find((p) => p.id === settings.activeProgramId) ?? plans.sort((a, b) => a.createdAt - b.createdAt)[0];
}

export async function planTemplates(programId: string): Promise<Template[]> {
  return (await db.templates.where('programId').equals(programId).toArray()).sort((a, b) => a.order - b.order);
}

/** Live view of the active plan and its workouts, for any screen. */
export function useActivePlan(): { plan?: Program; templates: Template[] } | undefined {
  return useLiveQuery(async () => {
    const plan = await getActivePlan();
    return { plan, templates: plan ? await planTemplates(plan.id) : [] };
  }, []);
}

export async function setActivePlan(id: string): Promise<void> {
  await saveSettings({ activeProgramId: id });
}

/**
 * Create a plan — blank, or a copy of another plan's workouts — and switch the app to it.
 * Copies get fresh template ids, so editing one plan never changes another.
 */
export async function createPlan(name: string, copyFrom?: string): Promise<string> {
  const id = newId('plan');
  await db.transaction('rw', db.programs, db.templates, db.settings, async () => {
    const source = copyFrom ? await db.programs.get(copyFrom) : undefined;
    await db.programs.add({ id, name: name.trim() || 'New plan', sessionsPerWeek: source?.sessionsPerWeek ?? 4, createdAt: Date.now() });
    if (source) {
      const ts = await planTemplates(source.id);
      await db.templates.bulkAdd(ts.map((t, i) => ({ ...t, id: `${id}_${i}`, programId: id, exercises: t.exercises.map((e) => ({ ...e })) })));
    }
    await saveSettings({ activeProgramId: id });
  });
  return id;
}

/** Delete a plan and its workout templates. Logged workouts are kept. The last plan can't be deleted. */
export async function deletePlan(id: string): Promise<void> {
  await db.transaction('rw', db.programs, db.templates, db.settings, async () => {
    const plans = await db.programs.toArray();
    if (plans.length <= 1) throw new Error("You can't delete your only plan");
    await db.templates.where('programId').equals(id).delete();
    await db.programs.delete(id);
    const settings = await getSettings();
    if (settings.activeProgramId === id) {
      const next = plans.filter((p) => p.id !== id).sort((a, b) => b.createdAt - a.createdAt)[0];
      await saveSettings({ activeProgramId: next.id });
    }
  });
}

export async function addWorkout(programId: string, name = 'New workout'): Promise<string> {
  const ts = await planTemplates(programId);
  const id = newId('tpl');
  await db.templates.add({ id, programId, name, order: ts.length ? Math.max(...ts.map((t) => t.order)) + 1 : 0, exercises: [] });
  return id;
}

/** Move a workout up or down in its plan's rotation. */
export async function moveWorkout(programId: string, templateId: string, delta: number): Promise<void> {
  const ts = await planTemplates(programId);
  const i = ts.findIndex((t) => t.id === templateId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ts.length) return;
  [ts[i], ts[j]] = [ts[j], ts[i]];
  await db.templates.bulkPut(ts.map((t, k) => ({ ...t, order: k })));
}

/** Next workout in the plan's rotation, based on the last finished workout from this plan. */
export function nextInPlan(templates: Template[], workouts: { status: string; startedAt: number; templateId: string }[]): Template | undefined {
  const ids = new Set(templates.map((t) => t.id));
  const last = workouts.filter((w) => w.status === 'done' && ids.has(w.templateId)).sort((a, b) => b.startedAt - a.startedAt)[0];
  if (!templates.length) return undefined;
  const i = last ? templates.findIndex((t) => t.id === last.templateId) : -1;
  return templates[(i + 1) % templates.length];
}

export const DEFAULT_PLAN_ID = SEED_PROGRAM.id;
