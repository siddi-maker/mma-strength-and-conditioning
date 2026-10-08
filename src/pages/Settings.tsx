import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings, saveSettings } from '../lib/db';
import { addWorkout, createPlan, deletePlan, moveWorkout, setActivePlan } from '../lib/plans';
import { toISODate } from '../lib/dates';
import { useRoute } from '../lib/route';
import { clearAllData, download, exportJSON, importJSON, setsCSV, toCSV, workoutsCSV } from '../lib/backup';
import { Button, Card, NumberField, Page, SectionTitle, Toggle, cx } from '../components/ui';
import type { Exercise, Prescription, Program, Range, Settings, Template } from '../lib/types';

type Tab = 'plans' | 'exercises' | 'targets' | 'goals' | 'training' | 'data';

export default function SettingsPage() {
  const { params } = useRoute();
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'plans');
  const settings = useLiveQuery(() => db.settings.get('settings'));
  const tabs: { id: Tab; label: string }[] = [
    { id: 'plans', label: 'Plans' },
    { id: 'exercises', label: 'Exercises' },
    { id: 'targets', label: 'Targets' },
    { id: 'goals', label: 'Goals' },
    { id: 'training', label: 'Training' },
    { id: 'data', label: 'Data' },
  ];
  return (
    <Page title="Settings">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} className={cx('min-h-12 shrink-0 rounded-xl px-4 font-semibold', tab === t.id ? 'bg-red-600' : 'bg-neutral-800 text-neutral-300')}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'plans' && <Plans />}
      {tab === 'exercises' && <Exercises />}
      {settings && tab === 'targets' && <TargetsEditor s={settings} />}
      {settings && tab === 'goals' && <GoalsEditor s={settings} />}
      {settings && tab === 'training' && <TrainingEditor s={settings} />}
      {tab === 'data' && <DataTools />}
    </Page>
  );
}

// ------------------------------------------------------------ Plans

/** Settings → Plans: list of plans → plan editor → workout (template) editor. */
function Plans() {
  const data = useLiveQuery(async () => {
    const [plans, templates, exercises, settings] = await Promise.all([db.programs.toArray(), db.templates.toArray(), db.exercises.toArray(), getSettings()]);
    return { plans: plans.sort((a, b) => a.createdAt - b.createdAt), templates, exercises, activeId: settings.activeProgramId };
  }, []);
  const [planId, setPlanId] = useState<string | null>(null);
  const [workoutId, setWorkoutId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  if (!data) return null;
  const { plans, templates, exercises, activeId } = data;
  const exMap = Object.fromEntries(exercises.map((e) => [e.id, e]));
  const plan = plans.find((p) => p.id === planId);
  const workout = templates.find((t) => t.id === workoutId);

  if (plan && workout) return <TemplateEditor t={workout} planName={plan.name} exercises={exercises} exMap={exMap} onBack={() => setWorkoutId(null)} />;
  if (plan)
    return (
      <PlanEditor
        plan={plan}
        active={plan.id === activeId}
        canDelete={plans.length > 1}
        templates={templates.filter((t) => t.programId === plan.id).sort((a, b) => a.order - b.order)}
        exMap={exMap}
        onOpenWorkout={setWorkoutId}
        onBack={() => setPlanId(null)}
      />
    );
  if (creating) return <NewPlan plans={plans} activeId={activeId} onCancel={() => setCreating(false)} onCreated={(id) => (setCreating(false), setPlanId(id))} />;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-neutral-400">The active plan drives the whole app: the workouts you can start, the rotation, and your weekly session target.</p>
      {plans.map((p) => {
        const ts = templates.filter((t) => t.programId === p.id).sort((a, b) => a.order - b.order);
        const on = p.id === activeId;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => setPlanId(p.id)}
            className={cx('rounded-2xl p-4 text-left', on ? 'bg-neutral-900 ring-2 ring-red-600' : 'bg-neutral-900 active:bg-neutral-800')}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-lg font-semibold">{p.name}</span>
              {on && <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold">Active</span>}
            </div>
            <div className="text-sm text-neutral-400">
              {ts.length} workout{ts.length === 1 ? '' : 's'} · {p.sessionsPerWeek}/week{ts.length ? ` · ${ts.map((t) => t.name).join(', ')}` : ''}
            </div>
          </button>
        );
      })}
      <Button variant="primary" onClick={() => setCreating(true)}>
        + New plan
      </Button>
    </div>
  );
}

function NewPlan({ plans, activeId, onCancel, onCreated }: { plans: Program[]; activeId?: string; onCancel: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [from, setFrom] = useState<string>('');
  return (
    <Card className="flex flex-col gap-3">
      <SectionTitle>New plan</SectionTitle>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">Name</span>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fight camp, 3-day maintenance" className="h-12 rounded-xl bg-neutral-800 px-3 outline-none focus:ring-2 focus:ring-red-600" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">Start from</span>
        <select value={from} onChange={(e) => setFrom(e.target.value)} className="h-12 rounded-xl bg-neutral-800 px-3">
          <option value="">Blank — I'll add workouts</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              Copy of {p.name}
              {p.id === activeId ? ' (current)' : ''}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm text-neutral-400">The new plan becomes active straight away. Your logged workouts and progress stay as they are.</p>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" className="flex-1" disabled={!name.trim()} onClick={async () => onCreated(await createPlan(name, from || undefined))}>
          Create &amp; use
        </Button>
      </div>
    </Card>
  );
}

function PlanEditor({
  plan,
  active,
  canDelete,
  templates,
  exMap,
  onOpenWorkout,
  onBack,
}: {
  plan: Program;
  active: boolean;
  canDelete: boolean;
  templates: Template[];
  exMap: Record<string, Exercise>;
  onOpenWorkout: (id: string) => void;
  onBack: () => void;
}) {
  const save = (patch: Partial<Program>) => db.programs.put({ ...plan, ...patch });
  return (
    <div className="flex flex-col gap-3">
      <Button variant="ghost" className="self-start" onClick={onBack}>
        ‹ All plans
      </Button>
      {active ? (
        <div className="rounded-xl bg-red-950/60 px-4 py-3 text-sm font-semibold text-red-200">Active plan — this is what the app is showing</div>
      ) : (
        <Button variant="primary" className="h-14 text-lg" onClick={() => setActivePlan(plan.id)}>
          Use this plan
        </Button>
      )}
      <Card className="flex flex-col gap-3">
        <TextField key={plan.id} label="Plan name" value={plan.name} onChange={(name) => name.trim() && save({ name: name.trim() })} />
        <NumberField label="Weight sessions per week (target)" value={plan.sessionsPerWeek} onChange={(v) => v && save({ sessionsPerWeek: Math.round(v) })} />
      </Card>
      <SectionTitle>Workouts (in rotation order)</SectionTitle>
      {templates.map((t, i) => (
        <Card key={t.id} className="flex items-center gap-2 p-2 pl-4">
          <button type="button" className="min-h-12 min-w-0 flex-1 text-left" onClick={() => onOpenWorkout(t.id)}>
            <div className="font-semibold">
              {i + 1}. {t.name}
            </div>
            <div className="truncate text-sm text-neutral-400">{t.exercises.length ? t.exercises.map((p) => exMap[p.exerciseId]?.name).join(' · ') : 'No exercises yet'}</div>
          </button>
          <Button aria-label={`move ${t.name} up`} className="w-12 px-0" disabled={i === 0} onClick={() => moveWorkout(plan.id, t.id, -1)}>
            ↑
          </Button>
          <Button aria-label={`move ${t.name} down`} className="w-12 px-0" disabled={i === templates.length - 1} onClick={() => moveWorkout(plan.id, t.id, 1)}>
            ↓
          </Button>
        </Card>
      ))}
      <Button onClick={async () => onOpenWorkout(await addWorkout(plan.id))}>+ Add workout</Button>
      <Button
        variant="danger"
        disabled={!canDelete}
        onClick={async () => {
          if (!confirm(`Delete plan "${plan.name}" and its ${templates.length} workout(s)? Your logged history is kept.`)) return;
          await deletePlan(plan.id);
          onBack();
        }}
      >
        {canDelete ? 'Delete plan' : "Can't delete your only plan"}
      </Button>
    </div>
  );
}

function TemplateEditor({ t, planName, exercises, exMap, onBack }: { t: Template; planName: string; exercises: Exercise[]; exMap: Record<string, Exercise>; onBack: () => void }) {
  const [adding, setAdding] = useState('');
  const save = (patch: Partial<Template>) => db.templates.put({ ...t, ...patch });
  const setRx = (i: number, patch: Partial<Prescription>) => save({ exercises: t.exercises.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const move = (i: number, d: number) => {
    const xs = [...t.exercises];
    const j = i + d;
    if (j < 0 || j >= xs.length) return;
    [xs[i], xs[j]] = [xs[j], xs[i]];
    save({ exercises: xs });
  };
  return (
    <div className="flex flex-col gap-3">
      <Button variant="ghost" className="self-start" onClick={onBack}>
        ‹ {planName}
      </Button>
      <Card className="flex flex-col gap-3">
        <TextField key={t.id} label="Workout name" value={t.name} onChange={(name) => save({ name })} />
        <TextField label="Conditioning (shown at end of workout)" value={t.conditioning?.label ?? ''} onChange={(label) => save({ conditioning: label ? { kind: t.conditioning?.kind ?? 'zone2', label } : undefined })} />
        {t.conditioning && (
          <select value={t.conditioning.kind} onChange={(e) => save({ conditioning: { ...t.conditioning!, kind: e.target.value as 'zone2' } })} className="h-12 rounded-xl bg-neutral-800 px-3">
            <option value="zone2">Zone 2 run</option>
            <option value="intervals">Intervals</option>
            <option value="sprints">Sprints</option>
          </select>
        )}
      </Card>
      {t.exercises.map((p, i) => (
        <Card key={`${p.exerciseId}-${i}`} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="flex-1 font-semibold">{exMap[p.exerciseId]?.name ?? p.exerciseId}</span>
            <Button aria-label="move up" className="w-12 px-0" onClick={() => move(i, -1)}>
              ↑
            </Button>
            <Button aria-label="move down" className="w-12 px-0" onClick={() => move(i, 1)}>
              ↓
            </Button>
            <Button aria-label="remove" variant="danger" className="w-12 px-0" onClick={() => confirm('Remove from template? History is kept.') && save({ exercises: t.exercises.filter((_, j) => j !== i) })}>
              ✕
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <NumberField label="Sets" value={p.sets} onChange={(v) => v && setRx(i, { sets: Math.round(v) })} />
            <NumberField label="Reps min" value={p.repsMin} onChange={(v) => setRx(i, { repsMin: v ?? 0, repsMax: Math.max(v ?? 0, p.repsMax) })} />
            <NumberField label="Reps max" value={p.repsMax} onChange={(v) => setRx(i, { repsMax: v ?? 0 })} />
            <NumberField label="Rest (s)" value={p.restSec} onChange={(v) => setRx(i, { restSec: v ?? 60 })} />
            <NumberField label="Rest max (s)" value={p.restMaxSec} onChange={(v) => setRx(i, { restMaxSec: v })} />
            <NumberField label="Distance (m)" value={p.distance} onChange={(v) => setRx(i, { distance: v })} />
          </div>
          <Toggle label="Max reps / AMRAP" checked={!!p.amrap} onChange={(amrap) => setRx(i, { amrap })} />
        </Card>
      ))}
      <Card className="flex gap-2">
        <select value={adding} onChange={(e) => setAdding(e.target.value)} className="h-12 min-w-0 flex-1 rounded-xl bg-neutral-800 px-3">
          <option value="">Add exercise…</option>
          {[...exercises]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
        </select>
        <Button
          variant="primary"
          disabled={!adding}
          onClick={() => {
            save({ exercises: [...t.exercises, { exerciseId: adding, sets: 3, repsMin: 10, repsMax: 12, restSec: 90 }] });
            setAdding('');
          }}
        >
          Add
        </Button>
      </Card>
      <Button
        variant="danger"
        onClick={async () => {
          if (!confirm(`Delete workout "${t.name}" from this plan? Logged workouts are kept.`)) return;
          await db.templates.delete(t.id);
          onBack();
        }}
      >
        Delete workout
      </Button>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-neutral-400">{label}</span>
      <input defaultValue={value} onBlur={(e) => e.target.value !== value && onChange(e.target.value)} className="h-12 rounded-xl bg-neutral-800 px-3 outline-none focus:ring-2 focus:ring-red-600" />
    </label>
  );
}

// ------------------------------------------------------------ Exercises

function Exercises() {
  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray(), []);
  const [open, setOpen] = useState<string | null>(null);
  if (!exercises) return null;
  const save = (e: Exercise, patch: Partial<Exercise>) => db.exercises.put({ ...e, ...patch });
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-neutral-400">Increment = the smallest jump the progression engine suggests (e.g. 2 kg dumbbells, 2.5 kg plates).</p>
      {exercises.map((e) => (
        <Card key={e.id} className="p-0">
          <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} className="flex min-h-12 w-full items-center justify-between p-4 text-left">
            <span className="font-semibold">{e.name}</span>
            <span className="text-sm text-neutral-400">
              +{e.increment} kg · {e.rule}
            </span>
          </button>
          {open === e.id && (
            <div className="flex flex-col gap-3 px-4 pb-4">
              <TextField label="Name" value={e.name} onChange={(name) => save(e, { name })} />
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Increment (kg)" value={e.increment} onChange={(v) => save(e, { increment: v ?? 0 })} />
                <NumberField label="Starting weight (kg)" value={e.startWeight} onChange={(v) => save(e, { startWeight: v })} />
              </div>
              <Select
                label="Measurement"
                value={e.measure}
                onChange={(measure) => save(e, { measure })}
                options={[
                  ['weight_reps', 'Weight × reps'],
                  ['bodyweight', 'Bodyweight reps (+ optional weight)'],
                  ['distance', 'Weight × distance'],
                  ['reps', 'Reps only'],
                ]}
              />
              <Select
                label="Progression rule"
                value={e.rule}
                onChange={(rule) => save(e, { rule })}
                options={[
                  ['main', 'Main lift (5×5 style)'],
                  ['power', 'Power lift (optional +)'],
                  ['accessory', 'Accessory (rep range)'],
                  ['pullup', 'Pull-ups (reps to 15+)'],
                  ['weighted_pullup', 'Weighted pull-ups'],
                  ['none', 'None'],
                ]}
              />
              <Select
                label="Region"
                value={e.region}
                onChange={(region) => save(e, { region })}
                options={[
                  ['upper', 'Upper'],
                  ['lower', 'Lower'],
                ]}
              />
              <Toggle label="Reps per leg / side" checked={!!e.perSide} onChange={(perSide) => save(e, { perSide })} />
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function Select<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-neutral-400">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className="h-12 rounded-xl bg-neutral-800 px-3">
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

// ------------------------------------------------------------ Targets & goals

function RangeField({ label, unit, r, onChange }: { label: string; unit?: string; r: Range; onChange: (r: Range) => void }) {
  return (
    <div>
      <div className="mb-1 text-sm">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Min" unit={unit} value={r.min} onChange={(v) => onChange({ ...r, min: v ?? 0 })} />
        <NumberField label="Max" unit={unit} value={r.max} onChange={(v) => onChange({ ...r, max: v ?? 0 })} />
      </div>
    </div>
  );
}

function TargetsEditor({ s }: { s: Settings }) {
  const T = s.targets;
  const d = (k: keyof Settings['targets']['daily']) => (r: Range) => saveSettings({ targets: { ...T, daily: { ...T.daily, [k]: r } } });
  const w = <K extends keyof Settings['targets']['weekly']>(k: K) => (v: Settings['targets']['weekly'][K]) => saveSettings({ targets: { ...T, weekly: { ...T.weekly, [k]: v } } });
  return (
    <>
      <Card className="flex flex-col gap-4">
        <SectionTitle>Daily</SectionTitle>
        <RangeField label="Protein" unit="g" r={T.daily.protein} onChange={d('protein')} />
        <RangeField label="Calories" unit="kcal" r={T.daily.calories} onChange={d('calories')} />
        <RangeField label="Water" unit="L" r={T.daily.water} onChange={d('water')} />
        <RangeField label="Carbs" unit="g" r={T.daily.carbs} onChange={d('carbs')} />
        <RangeField label="Fat" unit="g" r={T.daily.fat} onChange={d('fat')} />
      </Card>
      <Card className="flex flex-col gap-4">
        <SectionTitle>Weekly</SectionTitle>
        <RangeField label="Sleep" unit="h" r={T.weekly.sleep} onChange={w('sleep')} />
        <RangeField label="Protein" unit="g" r={T.weekly.protein} onChange={w('protein')} />
        <RangeField label="Water" unit="L" r={T.weekly.water} onChange={w('water')} />
        <RangeField label="Zone 2" unit="min" r={T.weekly.zone2Min} onChange={w('zone2Min')} />
        <RangeField label="Martial arts sessions" r={T.weekly.maSessions} onChange={w('maSessions')} />
        <NumberField label="Sprint sessions" value={T.weekly.sprintSessions} onChange={(v) => w('sprintSessions')(v ?? 0)} />
        <p className="text-xs text-neutral-500">The weekly weight-session target is set per plan, under Plans.</p>
      </Card>
    </>
  );
}

function GoalsEditor({ s }: { s: Settings }) {
  const set = (i: number, patch: Partial<Settings['goals'][number]>) => saveSettings({ goals: s.goals.map((g, j) => (j === i ? { ...g, ...patch } : g)) });
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-neutral-400">Lift goals track your best estimated 1RM (Epley). Labels are display text; numbers drive the progress bars.</p>
      {s.goals.map((g, i) => (
        <Card key={g.id} className="flex flex-col gap-2">
          <div className="font-semibold">{g.label}</div>
          <div className="grid grid-cols-3 gap-2">
            <NumberField label="Start" unit={g.unit} value={g.start} onChange={(v) => set(i, { start: v ?? 0 })} />
            <NumberField label={g.direction === 'range' ? 'Goal min' : 'Goal'} unit={g.unit} value={g.goal} onChange={(v) => set(i, { goal: v ?? 0 })} />
            {g.direction === 'range' && <NumberField label="Goal max" unit={g.unit} value={g.goalMax} onChange={(v) => set(i, { goalMax: v })} />}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <TextField label="Start label" value={g.startLabel ?? ''} onChange={(v) => set(i, { startLabel: v || undefined })} />
            <TextField label="Goal label" value={g.goalLabel ?? ''} onChange={(v) => set(i, { goalLabel: v || undefined })} />
          </div>
        </Card>
      ))}
    </div>
  );
}

function TrainingEditor({ s }: { s: Settings }) {
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  return (
    <Card className="flex flex-col gap-3">
      <NumberField label="Deload every (weeks)" value={s.deloadEveryWeeks} onChange={(v) => v && saveSettings({ deloadEveryWeeks: Math.round(v) })} />
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">Current training block started</span>
        <input type="date" value={s.blockStart ?? ''} onChange={(e) => saveSettings({ blockStart: e.target.value || undefined })} className="h-12 rounded-xl bg-neutral-800 px-3" />
      </label>
      {s.deloadUntil && s.deloadUntil >= toISODate() && (
        <Button onClick={() => saveSettings({ deloadUntil: undefined })}>End deload week early (until {s.deloadUntil})</Button>
      )}
      <Toggle label="Rest timer sound" checked={s.sound} onChange={(sound) => saveSettings({ sound })} />
      <Toggle label="Rest timer vibration" checked={s.vibrate} onChange={(vibrate) => saveSettings({ vibrate })} />
      {typeof Notification !== 'undefined' && perm !== 'granted' && (
        <Button onClick={async () => setPerm(await Notification.requestPermission())}>Allow rest-over notifications</Button>
      )}
      <p className="text-xs text-neutral-500">Units: kg, metres, litres.</p>
    </Card>
  );
}

// ------------------------------------------------------------ Data

function DataTools() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const stamp = toISODate();

  const csv = async (table: 'sets' | 'workouts' | 'checkins' | 'activities') => {
    if (table === 'checkins') return download(`checkins-${stamp}.csv`, toCSV((await db.checkins.orderBy('date').toArray()) as unknown as Record<string, unknown>[]), 'text/csv');
    if (table === 'activities') return download(`activities-${stamp}.csv`, toCSV((await db.activities.orderBy('date').toArray()) as unknown as Record<string, unknown>[]), 'text/csv');
    const ws = await db.workouts.orderBy('startedAt').toArray();
    if (table === 'workouts') return download(`workouts-${stamp}.csv`, workoutsCSV(ws), 'text/csv');
    const exMap = Object.fromEntries((await db.exercises.toArray()).map((e) => [e.id, e]));
    download(`sets-${stamp}.csv`, setsCSV(ws, exMap), 'text/csv');
  };

  return (
    <>
      <Card className="flex flex-col gap-2">
        <SectionTitle>Backup</SectionTitle>
        <Button variant="primary" onClick={async () => download(`training-backup-${stamp}.json`, JSON.stringify(await exportJSON(), null, 1), 'application/json')}>
          Export full backup (JSON)
        </Button>
        <Button onClick={() => fileRef.current?.click()}>Import backup (JSON)</Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            if (!confirm('Importing replaces ALL current data with the backup. Continue?')) return;
            try {
              await importJSON(JSON.parse(await f.text()));
              setMsg('Backup restored ✓');
            } catch (err) {
              setMsg(`Import failed: ${(err as Error).message}`);
            }
          }}
        />
        {msg && <p className="text-sm text-neutral-300">{msg}</p>}
      </Card>
      <Card className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <SectionTitle>CSV export</SectionTitle>
        </div>
        <Button onClick={() => csv('sets')}>Sets</Button>
        <Button onClick={() => csv('workouts')}>Workouts</Button>
        <Button onClick={() => csv('checkins')}>Check-ins</Button>
        <Button onClick={() => csv('activities')}>Cardio / MA</Button>
      </Card>
      <Card className="flex flex-col gap-2">
        <SectionTitle>Danger zone</SectionTitle>
        <Button
          variant="danger"
          onClick={async () => {
            if (!confirm('Delete ALL data? Export a backup first — this cannot be undone.')) return;
            if (prompt('Type DELETE to confirm') !== 'DELETE') return;
            await clearAllData();
            location.reload();
          }}
        >
          Clear all data
        </Button>
      </Card>
      <p className="text-center text-xs text-neutral-500">
        App version: {new Date(__BUILD_TIME__).toLocaleString()} · updates install automatically
      </p>
    </>
  );
}
