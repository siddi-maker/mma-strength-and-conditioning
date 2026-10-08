import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { shortDate, toISODate } from '../lib/dates';
import { useRoute } from '../lib/route';
import { Button, Card, NumberField, Page, SectionTitle, Segmented, Toggle, cx } from '../components/ui';
import type { Activity, ActivityType, MartialArtsType } from '../lib/types';

const TYPES: { value: ActivityType; label: string }[] = [
  { value: 'martial_arts', label: 'Martial arts' },
  { value: 'zone2', label: 'Zone 2' },
  { value: 'intervals', label: 'Intervals' },
  { value: 'sprints', label: 'Sprints' },
  { value: 'sprint_test', label: '100 m test' },
  { value: 'beep_test', label: 'Beep test' },
];
const MA: MartialArtsType[] = ['MMA', 'BJJ', 'Striking', 'Wrestling', 'Sparring'];

const blank = (type: ActivityType): Partial<Activity> => {
  switch (type) {
    case 'zone2':
      return { durationMin: 35 };
    case 'intervals':
      return { rounds: 10, machine: 'bike', durationMin: 20 };
    case 'sprints':
      return { sprintReps: 6, sprintTimes: [] };
    case 'martial_arts':
      return { maType: 'MMA', durationMin: 60, intensity: 3, quality: false };
    default:
      return {};
  }
};

export default function LogPage() {
  const { params } = useRoute();
  const initial = (params.get('type') as ActivityType) || 'martial_arts';
  const [type, setType] = useState<ActivityType>(TYPES.some((t) => t.value === initial) ? initial : 'martial_arts');
  const [form, setForm] = useState<Partial<Activity>>(blank(type));
  const [date, setDate] = useState(toISODate());
  const [saved, setSaved] = useState(false);
  // Follow ?type= when arriving from the workout's conditioning card while already on this tab.
  useEffect(() => {
    const t = params.get('type') as ActivityType | null;
    if (t && TYPES.some((x) => x.value === t)) {
      setType(t);
      setForm(blank(t));
    }
  }, [params]);
  const recent = useLiveQuery(() => db.activities.orderBy('date').reverse().limit(30).toArray(), []);

  const pick = (t: ActivityType) => {
    setType(t);
    setForm(blank(t));
  };
  const f = <K extends keyof Activity>(k: K) => (v: Activity[K]) => setForm((x) => ({ ...x, [k]: v }));

  const save = async () => {
    const a: Activity = { ...form, type, date, createdAt: Date.now() };
    if (a.sprintTimes) a.sprintTimes = a.sprintTimes.filter((t) => t > 0);
    await db.activities.add(a);
    setForm(blank(type));
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <Page title="Cardio & martial arts">
      <Segmented value={type} options={TYPES} onChange={pick} />
      <Card className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-400">Date</span>
          <input type="date" max={toISODate()} value={date} onChange={(e) => setDate(e.target.value || toISODate())} className="h-12 rounded-xl bg-neutral-800 px-3 outline-none" />
        </label>

        {type === 'martial_arts' && (
          <>
            <Segmented value={form.maType ?? 'MMA'} options={MA.map((m) => ({ value: m, label: m }))} onChange={f('maType')} />
            <NumberField label="Duration" unit="min" value={form.durationMin} onChange={f('durationMin')} />
            <div>
              <div className="mb-1 text-xs text-neutral-400">Intensity</div>
              <div className="grid grid-cols-5 gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => f('intensity')(n)} className={cx('h-12 rounded-lg font-semibold', form.intensity === n ? 'bg-red-600' : 'bg-neutral-800')}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <Toggle label="Quality session" checked={!!form.quality} onChange={f('quality')} />
          </>
        )}

        {type === 'zone2' && (
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Duration" unit="min" value={form.durationMin} onChange={f('durationMin')} />
            <NumberField label="Distance" unit="m" value={form.distanceM} onChange={f('distanceM')} />
            <NumberField label="Avg HR (optional)" unit="bpm" value={form.avgHr} onChange={f('avgHr')} />
          </div>
        )}

        {type === 'intervals' && (
          <>
            <Segmented
              value={form.machine ?? 'bike'}
              options={[
                { value: 'bike', label: 'Bike' },
                { value: 'rower', label: 'Rower' },
              ]}
              onChange={f('machine')}
            />
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Rounds completed" value={form.rounds} onChange={f('rounds')} />
              <NumberField label="Duration" unit="min" value={form.durationMin} onChange={f('durationMin')} />
            </div>
          </>
        )}

        {type === 'sprints' && (
          <>
            <NumberField label="Reps × 100 m" value={form.sprintReps} onChange={f('sprintReps')} />
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: form.sprintReps ?? 0 }, (_, i) => (
                <NumberField
                  key={i}
                  label={`#${i + 1} time`}
                  unit="s"
                  value={form.sprintTimes?.[i]}
                  onChange={(v) =>
                    setForm((x) => {
                      const times = [...(x.sprintTimes ?? [])];
                      times[i] = v ?? 0;
                      return { ...x, sprintTimes: times };
                    })
                  }
                />
              ))}
            </div>
          </>
        )}

        {type === 'sprint_test' && <NumberField label="100 m time" unit="s" value={form.time100m} onChange={f('time100m')} />}
        {type === 'beep_test' && <NumberField label="Beep test level (e.g. 11.5)" value={form.beepLevel} onChange={f('beepLevel')} />}

        <textarea
          placeholder="Notes"
          rows={2}
          value={form.notes ?? ''}
          onChange={(e) => f('notes')(e.target.value || undefined)}
          className="rounded-xl bg-neutral-800 p-3 text-sm outline-none focus:ring-2 focus:ring-red-600"
        />
        <Button variant={saved ? 'success' : 'primary'} className="h-14 text-lg" onClick={save}>
          {saved ? 'Saved ✓' : 'Save'}
        </Button>
      </Card>

      <Card>
        <SectionTitle>Recent</SectionTitle>
        {!recent?.length && <p className="text-sm text-neutral-400">Nothing logged yet.</p>}
        <ul className="flex flex-col divide-y divide-neutral-800">
          {recent?.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2">
              <span className="w-14 text-xs text-neutral-400">{shortDate(a.date)}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{describe(a)}</span>
              <button
                type="button"
                aria-label="delete entry"
                className="h-12 w-12 rounded-lg text-neutral-500 active:bg-neutral-800"
                onClick={() => confirm('Delete this entry?') && db.activities.delete(a.id!)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </Page>
  );
}

export function describe(a: Activity): string {
  switch (a.type) {
    case 'martial_arts':
      return `${a.maType ?? 'Martial arts'} · ${a.durationMin ?? '?'} min · intensity ${a.intensity ?? '?'}${a.quality ? ' · ★ quality' : ''}`;
    case 'zone2':
      return `Zone 2 · ${a.durationMin ?? '?'} min${a.distanceM ? ` · ${(a.distanceM / 1000).toFixed(1)} km` : ''}${a.avgHr ? ` · ${a.avgHr} bpm` : ''}`;
    case 'intervals':
      return `Intervals (${a.machine}) · ${a.rounds ?? '?'} rounds`;
    case 'sprints': {
      const best = a.sprintTimes?.length ? ` · best ${Math.min(...a.sprintTimes)} s` : '';
      return `Sprints · ${a.sprintReps ?? '?'} × 100 m${best}`;
    }
    case 'sprint_test':
      return `100 m test · ${a.time100m ?? '?'} s`;
    case 'beep_test':
      return `Beep test · level ${a.beepLevel ?? '?'}`;
  }
}
