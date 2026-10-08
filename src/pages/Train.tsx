import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, finishedWorkouts } from '../lib/db';
import { toISODate, formatDuration, formatClock, shortDate } from '../lib/dates';
import { exerciseHistory, suggest, type SessionEntry, type Suggestion } from '../lib/progression';
import { detectPRs, workoutVolume } from '../lib/prs';
import { isDeloadActive, setsFromSuggestion, startWorkout } from '../lib/workout';
import { startRest, stopRest, unlockAudio } from '../lib/timer';
import { navigate } from '../lib/route';
import { nextInPlan, useActivePlan } from '../lib/plans';
import { Button, Card, Page, Stepper, cx, fmt } from '../components/ui';
import type { Exercise, ExerciseLog, SetLog, Template, Workout } from '../lib/types';

export default function Train() {
  const active = useLiveQuery(() => db.workouts.where('status').equals('active').first(), [], null);
  const [summaryId, setSummaryId] = useState<number | null>(null);

  if (active === null) return null; // loading
  if (summaryId != null) return <Summary id={summaryId} onClose={() => setSummaryId(null)} />;
  if (active) return <Logger workout={active} onFinished={setSummaryId} />;
  return <StartScreen />;
}

// ---------------------------------------------------------------- Start

function StartScreen() {
  const active = useActivePlan();
  const done = useLiveQuery(() => db.workouts.where('status').equals('done').toArray(), []);
  const settings = useLiveQuery(() => db.settings.get('settings'));
  if (!active || !done) return null;
  const { plan, templates } = active;
  const nextId = nextInPlan(templates, done)?.id;
  const last = [...done].sort((a, b) => b.startedAt - a.startedAt)[0];
  const deload = isDeloadActive(settings?.deloadUntil);

  return (
    <Page
      title="Start workout"
      right={
        <a href="#/settings?tab=plans" className="max-w-[45%] truncate rounded-xl bg-neutral-900 px-3 py-3 text-sm font-semibold text-neutral-300 active:bg-neutral-800">
          {plan?.name ?? 'Plans'} ▾
        </a>
      }
    >
      {deload && <div className="rounded-xl bg-amber-900/40 p-3 text-sm text-amber-200">Deload week — sets are cut to ~60% volume until {settings?.deloadUntil}.</div>}
      {last && (
        <p className="text-sm text-neutral-400">
          Last: {last.templateName} on {shortDate(toISODate(last.startedAt))}
        </p>
      )}
      <div className="flex flex-col gap-3">
        {templates.map((t) => (
          <TemplateButton key={t.id} t={t} suggested={t.id === nextId} />
        ))}
        {!templates.length && (
          <Button variant="primary" className="h-14" onClick={() => navigate('/settings?tab=plans')}>
            {plan?.name ?? 'This plan'} has no workouts yet — add some
          </Button>
        )}
      </div>
    </Page>
  );
}

function TemplateButton({ t, suggested }: { t: Template; suggested: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        unlockAudio();
        await startWorkout(t);
        window.scrollTo(0, 0);
      }}
      className={cx('rounded-2xl p-4 text-left', suggested ? 'bg-red-600 text-white' : 'bg-neutral-900 active:bg-neutral-800')}
    >
      <div className="flex items-center justify-between">
        <span className="text-xl font-bold">{t.name}</span>
        {suggested && <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">Next up</span>}
      </div>
      <div className={cx('mt-1 text-sm', suggested ? 'text-red-100' : 'text-neutral-400')}>
        {t.exercises.length} exercises{t.conditioning ? ` · ${t.conditioning.label}` : ''}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------- Logger

function useExerciseMap() {
  return useLiveQuery(async () => Object.fromEntries((await db.exercises.toArray()).map((e) => [e.id, e])) as Record<string, Exercise>, []);
}

function Logger({ workout, onFinished }: { workout: Workout; onFinished: (id: number) => void }) {
  const exMap = useExerciseMap();
  const history = useLiveQuery(() => finishedWorkouts(), []);
  const template = useLiveQuery(() => db.templates.get(workout.templateId), [workout.templateId]);
  const firstOpen = workout.exercises.findIndex((e) => !e.skipped && e.sets.some((s) => !s.done));
  const [open, setOpen] = useState<number | null>(firstOpen === -1 ? null : firstOpen);
  const [swapFor, setSwapFor] = useState<number | null>(null);

  if (!exMap || !history) return null;

  // Read-modify-write inside a transaction so rapid taps never overwrite each other with stale state.
  const mutate = (fn: (w: Workout) => Workout) =>
    db.transaction('rw', db.workouts, async () => {
      const cur = await db.workouts.get(workout.id!);
      if (!cur) return undefined;
      const next = fn(cur);
      await db.workouts.put(next);
      return next;
    });
  const updateExercise = (i: number, fn: (e: ExerciseLog) => ExerciseLog) =>
    mutate((w) => ({ ...w, exercises: w.exercises.map((e, j) => (j === i ? fn(e) : e)) }));

  const completeSet = async (i: number, si: number) => {
    let wasDone = false;
    const w = await updateExercise(i, (x) => {
      wasDone = x.sets[si].done;
      return { ...x, sets: x.sets.map((s, k) => (k === si ? { ...s, done: !wasDone, at: wasDone ? undefined : Date.now() } : s)) };
    });
    if (wasDone || !w) return;
    const e = w.exercises[i];
    const nextSet = e.sets.findIndex((s) => !s.done);
    if (nextSet !== -1) {
      startRest(e.target.restSec, `${exMap[e.exerciseId]?.name} set ${nextSet + 1}`);
      return;
    }
    // Exercise complete: auto-advance to the next unfinished one.
    const nextIdx = w.exercises.findIndex((x, j) => j > i && !x.skipped && x.sets.some((s) => !s.done));
    if (nextIdx !== -1) {
      setOpen(nextIdx);
      startRest(e.target.restSec, exMap[w.exercises[nextIdx].exerciseId]?.name ?? 'next exercise');
    } else {
      stopRest();
    }
  };

  const finish = async () => {
    const remaining = workout.exercises.reduce((n, e) => n + (e.skipped ? 0 : e.sets.filter((s) => !s.done).length), 0);
    if (remaining && !confirm(`${remaining} set(s) not ticked. Finish anyway? Unticked sets are not counted.`)) return;
    stopRest();
    await mutate((w) => ({ ...w, status: 'done', finishedAt: Date.now() }));
    onFinished(workout.id!);
  };

  const discard = async () => {
    if (!confirm('Discard this workout? Nothing from it will be saved.')) return;
    stopRest();
    await db.workouts.delete(workout.id!);
  };

  const doneSets = workout.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  const totalSets = workout.exercises.reduce((n, e) => n + (e.skipped ? 0 : e.sets.length), 0);

  return (
    <Page
      title={workout.templateName}
      right={
        <span className="text-sm text-neutral-400 tabular-nums">
          <Elapsed since={workout.startedAt} /> · {doneSets}/{totalSets} sets
        </span>
      }
    >
      {workout.deload && <div className="rounded-xl bg-amber-900/40 p-3 text-sm text-amber-200">Deload session — reduced sets.</div>}
      {workout.exercises.map((e, i) => (
        <ExerciseCard
          key={i}
          log={e}
          ex={exMap[e.exerciseId]}
          swappedFrom={e.swappedFrom ? exMap[e.swappedFrom]?.name : undefined}
          history={exerciseHistory(history, e.exerciseId, workout.startedAt)}
          open={open === i}
          onToggle={() => setOpen(open === i ? null : i)}
          onChange={(fn) => updateExercise(i, fn)}
          onComplete={(si) => completeSet(i, si)}
          onSwap={() => setSwapFor(i)}
        />
      ))}

      {template?.conditioning && (
        <Card className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-neutral-400 uppercase">Conditioning</div>
            <div className="font-semibold">{template.conditioning.label}</div>
          </div>
          <Button onClick={() => navigate(`/log?type=${template.conditioning!.kind}`)}>Log</Button>
        </Card>
      )}

      <Button variant="success" className="h-14 text-lg" onClick={finish}>
        Finish workout
      </Button>
      <Button variant="ghost" onClick={discard}>
        Discard workout
      </Button>

      {swapFor != null && (
        <SwapSheet
          exercises={Object.values(exMap)}
          current={workout.exercises[swapFor]}
          onClose={() => setSwapFor(null)}
          onPick={async (ex) => {
            const log = workout.exercises[swapFor];
            const original = log.swappedFrom ?? log.exerciseId;
            const target = { ...log.target, exerciseId: ex.id };
            const s = suggest(ex, target, exerciseHistory(history, ex.id));
            await updateExercise(swapFor, () => ({
              exerciseId: ex.id,
              swappedFrom: ex.id === original ? undefined : original,
              target,
              notes: log.notes,
              sets: setsFromSuggestion(target, s),
            }));
            setSwapFor(null);
          }}
        />
      )}
    </Page>
  );
}

function Elapsed({ since }: { since: number }) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((x) => x + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  return <>{formatDuration(Date.now() - since)}</>;
}

function restLabel(sec: number, max?: number) {
  return max ? `${formatClock(sec)}–${formatClock(max)}` : formatClock(sec);
}

function targetLabel(log: ExerciseLog, ex: Exercise) {
  const t = log.target;
  const reps = t.amrap ? 'max' : t.distance ? `${t.distance} m` : t.repsMax > t.repsMin ? `${t.repsMin}–${t.repsMax}` : `${t.repsMin}`;
  return `${t.sets} × ${reps}${ex.perSide ? ' /side' : ''}`;
}

function setText(s: SetLog | undefined, ex: Exercise): string {
  if (!s) return '—';
  if (ex.measure === 'distance') return `${fmt(s.weight)}×${fmt(s.distance)}m`;
  if (ex.measure === 'reps') return `${s.reps ?? 0}`;
  if (ex.measure === 'bodyweight') return s.weight ? `+${fmt(s.weight)}×${s.reps}` : `${s.reps}`;
  return `${fmt(s.weight)}×${s.reps}`;
}

function ExerciseCard({
  log,
  ex,
  swappedFrom,
  history,
  open,
  onToggle,
  onChange,
  onComplete,
  onSwap,
}: {
  log: ExerciseLog;
  ex: Exercise | undefined;
  swappedFrom?: string;
  history: SessionEntry[];
  open: boolean;
  onToggle: () => void;
  onChange: (fn: (e: ExerciseLog) => ExerciseLog) => void;
  onComplete: (setIndex: number) => void;
  onSwap: () => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const suggestion: Suggestion | undefined = useMemo(() => (ex ? suggest(ex, log.target, history) : undefined), [ex, log.target, history]);
  if (!ex) return null;
  const prev = history[0];
  const done = log.sets.filter((s) => s.done).length;
  const complete = done === log.sets.length;

  const editSet = (si: number, patch: Partial<SetLog>) =>
    onChange((e) => {
      const old = e.sets[si];
      return {
        ...e,
        sets: e.sets.map((s, k) => {
          if (k === si) return { ...s, ...patch };
          // Carry a weight change forward to later unticked sets that had the same weight.
          if (k > si && !s.done && patch.weight !== undefined && s.weight === old.weight) return { ...s, weight: patch.weight };
          return s;
        }),
      };
    });

  const applyWeightAll = (w: number) => onChange((e) => ({ ...e, sets: e.sets.map((s) => (s.done ? s : { ...s, weight: w })) }));

  return (
    <Card className={cx('p-0', log.skipped && 'opacity-50')}>
      <button type="button" className="flex min-h-14 w-full items-center gap-3 p-4 text-left" onClick={onToggle}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cx('truncate text-lg font-semibold', log.skipped && 'line-through')}>{ex.name}</span>
            {complete && <span className="text-emerald-400">✓</span>}
          </div>
          <div className="text-sm text-neutral-400">
            {targetLabel(log, ex)} · rest {restLabel(log.target.restSec, log.target.restMaxSec)}
            {swappedFrom && <span className="text-amber-400"> · swapped for {swappedFrom}</span>}
          </div>
        </div>
        <span className="text-sm text-neutral-400 tabular-nums">
          {done}/{log.sets.length}
        </span>
      </button>

      {open && !log.skipped && (
        <div className="flex flex-col gap-2 px-3 pb-4">
          {suggestion?.note && (
            <div className={cx('rounded-lg px-3 py-2 text-sm', suggestion.kind === 'increase' ? 'bg-emerald-950 text-emerald-300' : suggestion.kind === 'decrease' ? 'bg-amber-950 text-amber-300' : 'bg-neutral-800 text-neutral-300')}>
              {suggestion.note}
            </div>
          )}
          {suggestion?.optional && (
            <button type="button" className="min-h-12 rounded-lg border border-dashed border-emerald-700 px-3 text-left text-sm text-emerald-300" onClick={() => applyWeightAll(suggestion.optional!.weight)}>
              {suggestion.optional.note} — tap to use {suggestion.optional.weight} kg
            </button>
          )}

          <div className="grid grid-cols-[1.5rem_1fr_3.75rem_3.5rem] items-center gap-2 px-1 text-xs text-neutral-500">
            <span>Set</span>
            <span>Today (tap to edit)</span>
            <span className="text-right">Last</span>
            <span />
          </div>
          {log.sets.map((s, si) => (
            <div key={si}>
              <div className="grid grid-cols-[1.5rem_1fr_3.75rem_3.5rem] items-center gap-2">
                <span className="text-center font-semibold text-neutral-400">{si + 1}</span>
                <button
                  type="button"
                  onClick={() => setEditing(editing === si ? null : si)}
                  className={cx('h-14 min-w-0 truncate rounded-xl px-3 text-left text-base font-semibold whitespace-nowrap tabular-nums', s.done ? 'bg-emerald-950 text-emerald-200' : 'bg-neutral-800', editing === si && 'ring-2 ring-red-600')}
                >
                  {setLine(s, ex)}
                  {s.rpe ? <span className="ml-2 text-xs font-normal text-neutral-400">RPE {s.rpe}</span> : null}
                </button>
                <span className="text-right text-sm text-neutral-500 tabular-nums">{setText(prev?.sets[si], ex)}</span>
                <button
                  type="button"
                  aria-label={`complete set ${si + 1}`}
                  onClick={() => {
                    setEditing(null);
                    onComplete(si);
                  }}
                  className={cx('h-14 w-14 rounded-xl text-2xl font-bold', s.done ? 'bg-emerald-600 text-white' : 'border-2 border-neutral-700 text-neutral-500 active:bg-neutral-800')}
                >
                  ✓
                </button>
              </div>
              {editing === si && <SetEditor s={s} ex={ex} onChange={(patch) => editSet(si, patch)} />}
            </div>
          ))}

          <div className="mt-1 flex gap-2">
            <Button className="flex-1 text-sm" onClick={() => onChange((e) => ({ ...e, sets: [...e.sets, { ...e.sets[e.sets.length - 1], done: false, at: undefined, rpe: undefined }] }))}>
              + Set
            </Button>
            <Button className="flex-1 text-sm" disabled={log.sets.length <= 1 || log.sets[log.sets.length - 1].done} onClick={() => onChange((e) => ({ ...e, sets: e.sets.slice(0, -1) }))}>
              − Set
            </Button>
            <Button className="flex-1 text-sm" onClick={onSwap}>
              Swap
            </Button>
            <Button className="flex-1 text-sm" onClick={() => onChange((e) => ({ ...e, skipped: true }))}>
              Skip
            </Button>
          </div>
          <textarea
            placeholder="Notes"
            className="min-h-12 rounded-xl bg-neutral-800 p-3 text-sm outline-none focus:ring-2 focus:ring-red-600"
            rows={2}
            defaultValue={log.notes}
            onBlur={(ev) => ev.target.value !== (log.notes ?? '') && onChange((e) => ({ ...e, notes: ev.target.value }))}
          />
        </div>
      )}
      {open && log.skipped && (
        <div className="px-3 pb-4">
          <Button className="w-full" onClick={() => onChange((e) => ({ ...e, skipped: false }))}>
            Un-skip
          </Button>
        </div>
      )}
    </Card>
  );
}

function setLine(s: SetLog, ex: Exercise) {
  const reps = `${s.reps ?? 0} reps`;
  switch (ex.measure) {
    case 'reps':
      return reps;
    case 'bodyweight':
      return s.weight ? `BW+${fmt(s.weight)} kg × ${s.reps ?? 0}` : `BW × ${s.reps ?? 0}`;
    case 'distance':
      return `${fmt(s.weight)} kg × ${fmt(s.distance)} m`;
    default:
      return `${fmt(s.weight)} kg × ${s.reps ?? 0}`;
  }
}

function SetEditor({ s, ex, onChange }: { s: SetLog; ex: Exercise; onChange: (p: Partial<SetLog>) => void }) {
  return (
    <div className="mt-2 flex flex-col gap-3 rounded-xl bg-neutral-950 p-3">
      <div className="flex flex-wrap gap-3">
        {ex.measure !== 'reps' && (
          <Stepper label={ex.measure === 'bodyweight' ? 'Added kg' : 'kg'} value={s.weight} step={ex.increment || 2.5} onChange={(weight) => onChange({ weight })} />
        )}
        {ex.measure === 'distance' ? (
          <Stepper label="metres" value={s.distance} step={5} onChange={(distance) => onChange({ distance })} />
        ) : (
          <Stepper label={ex.perSide ? 'reps / side' : 'reps'} value={s.reps} step={1} onChange={(reps) => onChange({ reps })} />
        )}
      </div>
      <div>
        <div className="mb-1 text-xs text-neutral-400">RPE (optional)</div>
        <div className="grid grid-cols-5 gap-1">
          {[6, 7, 8, 9, 10].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onChange({ rpe: s.rpe === r ? undefined : r })}
              className={cx('h-12 rounded-lg font-semibold', s.rpe === r ? 'bg-red-600' : 'bg-neutral-800')}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SwapSheet({ exercises, current, onPick, onClose }: { exercises: Exercise[]; current: ExerciseLog; onPick: (e: Exercise) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const list = exercises.filter((e) => e.id !== current.exerciseId && e.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70" onClick={onClose}>
      <div className="mt-auto max-h-[80dvh] overflow-y-auto rounded-t-3xl bg-neutral-900 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold">Swap exercise</h3>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        <input autoFocus placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3 h-12 w-full rounded-xl bg-neutral-800 px-3 outline-none" />
        <div className="flex flex-col gap-1">
          {list.map((e) => (
            <button key={e.id} type="button" className="min-h-12 rounded-xl px-3 text-left active:bg-neutral-800" onClick={() => onPick(e)}>
              {e.name}
            </button>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <input placeholder="New exercise name" value={name} onChange={(e) => setName(e.target.value)} className="h-12 min-w-0 flex-1 rounded-xl bg-neutral-800 px-3 outline-none" />
          <Button
            variant="primary"
            disabled={!name.trim()}
            onClick={async () => {
              const ex: Exercise = { id: `custom_${Date.now()}`, name: name.trim(), measure: 'weight_reps', rule: 'accessory', region: 'upper', increment: 2.5 };
              await db.exercises.add(ex);
              onPick(ex);
            }}
          >
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Summary

function Summary({ id, onClose }: { id: number; onClose: () => void }) {
  const data = useLiveQuery(async () => {
    const [w, all, exs] = await Promise.all([db.workouts.get(id), finishedWorkouts(), db.exercises.toArray()]);
    const exMap = Object.fromEntries(exs.map((e) => [e.id, e])) as Record<string, Exercise>;
    return w ? { w, prs: detectPRs(w, all, exMap), exMap } : undefined;
  }, [id]);
  if (!data) return null;
  const { w, prs } = data;
  const sets = w.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  return (
    <Page title="Workout done 💪">
      <Card>
        <div className="text-lg font-semibold">{w.templateName}</div>
        <div className="mt-3 grid grid-cols-3 gap-3 text-center">
          <Stat label="Duration" value={formatDuration((w.finishedAt ?? Date.now()) - w.startedAt)} />
          <Stat label="Volume" value={`${workoutVolume(w).toLocaleString()} kg`} />
          <Stat label="Sets" value={String(sets)} />
        </div>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">New PRs</h2>
        {prs.length ? (
          <ul className="flex flex-col gap-2">
            {prs.map((p, i) => (
              <li key={i} className="flex items-center justify-between rounded-lg bg-neutral-800 px-3 py-2">
                <span>🏆 {p.detail}</span>
                <span className="text-xs text-neutral-400 uppercase">{p.type === 'e1rm' ? 'e1RM' : p.type}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-neutral-400">No PRs this time — consistency wins.</p>
        )}
      </Card>
      <Button variant="primary" onClick={onClose}>
        Done
      </Button>
      <Button onClick={() => navigate('/')}>Dashboard</Button>
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-neutral-800 p-3">
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs text-neutral-400">{label}</div>
    </div>
  );
}
