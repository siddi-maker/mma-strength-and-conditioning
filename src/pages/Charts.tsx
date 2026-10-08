import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceArea, ResponsiveContainer, Scatter, ComposedChart, Tooltip, XAxis, YAxis } from 'recharts';
import { db } from '../lib/db';
import { addDays, shortDate, toISODate, weekStart } from '../lib/dates';
import { epley, exerciseHistory, topWeight } from '../lib/progression';
import { movingAverage } from '../lib/weekly';
import { Card, Page, SectionTitle, Segmented } from '../components/ui';
import type { Exercise, Range } from '../lib/types';

// Categorical slots 1–2 stepped for a dark surface; text stays in neutral ink.
const C1 = '#3987e5';
const C2 = '#d95926';
const GRID = '#262626';
const INK = '#a3a3a3';
const BAND = '#a3a3a3';

type Span = '28' | '90' | 'all';

const axis = { stroke: GRID, tick: { fill: INK, fontSize: 11 }, tickLine: false } as const;
const tooltip = {
  contentStyle: { background: '#171717', border: '1px solid #404040', borderRadius: 12, color: '#f5f5f5', fontSize: 13 },
  labelStyle: { color: '#d4d4d4' },
  cursor: { stroke: '#525252', fill: 'rgba(255,255,255,0.04)' },
} as const;

export default function Charts() {
  const [span, setSpan] = useState<Span>('90');
  const data = useLiveQuery(async () => {
    const [workouts, checkins, activities, exercises, settings] = await Promise.all([
      db.workouts.where('status').equals('done').sortBy('startedAt'),
      db.checkins.orderBy('date').toArray(),
      db.activities.toArray(),
      db.exercises.toArray(),
      db.settings.get('settings'),
    ]);
    return { workouts, checkins, activities, exercises, settings };
  }, []);
  const [exId, setExId] = useState('bench');

  const from = span === 'all' ? '0000-00-00' : addDays(toISODate(), -Number(span));

  const derived = useMemo(() => {
    if (!data) return null;
    const { workouts, checkins, activities, exercises } = data;
    const logged = new Set(workouts.flatMap((w) => w.exercises.filter((e) => !e.skipped && e.sets.some((s) => s.done)).map((e) => e.exerciseId)));
    const exList = exercises.filter((e) => logged.has(e.id)).sort((a, b) => a.name.localeCompare(b.name));

    const lift = exerciseHistory(workouts, exId)
      .reverse()
      .filter((h) => h.date >= from)
      .map((h) => ({
        date: shortDate(h.date),
        top: topWeight(h.sets),
        e1rm: Math.round(Math.max(...h.sets.map((s) => epley(s.weight ?? 0, s.reps ?? 0))) * 10) / 10,
        volume: Math.round(h.sets.reduce((t, s) => t + (s.weight ?? 0) * (s.reps ?? 0), 0)),
        reps: Math.max(...h.sets.map((s) => s.reps ?? 0)),
      }));

    const bwPts = checkins.filter((c) => c.bodyweight !== undefined).map((c) => ({ date: c.date, value: c.bodyweight! }));
    const ma = movingAverage(bwPts);
    const bw = bwPts.map((p, i) => ({ date: shortDate(p.date), raw: p.date, weight: p.value, avg: ma[i] })).filter((p) => p.raw >= from);
    const bf = checkins.filter((c) => c.bodyFat !== undefined && c.date >= from).map((c) => ({ date: shortDate(c.date), bf: c.bodyFat }));
    const daily = checkins.filter((c) => c.date >= from).map((c) => ({ date: shortDate(c.date), sleep: c.sleepHours, protein: c.protein }));

    const weeks = new Map<string, { ma: number; z2: number }>();
    const thisWeek = weekStart(toISODate());
    const nWeeks = span === '28' ? 4 : span === '90' ? 13 : Math.max(4, Math.ceil((Date.now() - Math.min(Date.now(), ...activities.map((a) => new Date(a.date).getTime()))) / (7 * 86_400_000)) + 1);
    for (let i = nWeeks - 1; i >= 0; i--) weeks.set(addDays(thisWeek, -7 * i), { ma: 0, z2: 0 });
    for (const a of activities) {
      const w = weeks.get(weekStart(a.date));
      if (!w) continue;
      if (a.type === 'martial_arts') w.ma++;
      if (a.type === 'zone2') w.z2 += a.durationMin ?? 0;
    }
    const weekly = [...weeks.entries()].map(([k, v]) => ({ week: shortDate(k), ...v }));
    return { exList, lift, bw, bf, daily, weekly };
  }, [data, exId, from, span]);

  if (!data || !derived) return null;
  const ex: Exercise | undefined = data.exercises.find((e) => e.id === exId);
  const T = data.settings?.targets;

  return (
    <Page title="Charts">
      <Segmented
        value={span}
        options={[
          { value: '28', label: '4 weeks' },
          { value: '90', label: '3 months' },
          { value: 'all', label: 'All' },
        ]}
        onChange={setSpan}
      />

      <Card>
        <SectionTitle>Lifts</SectionTitle>
        <select value={exId} onChange={(e) => setExId(e.target.value)} className="mb-3 h-12 w-full rounded-xl bg-neutral-800 px-3 outline-none">
          {!derived.exList.some((e) => e.id === exId) && <option value={exId}>{ex?.name ?? exId}</option>}
          {derived.exList.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        {derived.lift.length ? (
          <>
            {ex?.measure === 'bodyweight' || ex?.measure === 'reps' ? (
              <Chart title="Best set (reps)">
                <LineChart data={derived.lift}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="date" {...axis} />
                  <YAxis {...axis} width={32} allowDecimals={false} />
                  <Tooltip {...tooltip} />
                  <Line isAnimationActive={false} dataKey="reps" name="Reps" stroke={C1} strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </Chart>
            ) : (
              <Chart title="Top set & estimated 1RM (kg)">
                <LineChart data={derived.lift}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="date" {...axis} />
                  <YAxis {...axis} width={36} domain={['auto', 'auto']} />
                  <Tooltip {...tooltip} />
                  <Legend wrapperStyle={{ fontSize: 12, color: INK }} />
                  <Line isAnimationActive={false} dataKey="top" name="Top set" stroke={C1} strokeWidth={2} dot={{ r: 4 }} />
                  <Line isAnimationActive={false} dataKey="e1rm" name="e1RM" stroke={C2} strokeWidth={2} dot={{ r: 4 }} strokeDasharray="5 3" />
                </LineChart>
              </Chart>
            )}
            {ex?.measure !== 'reps' && (
              <Chart title="Volume per session (kg)">
                <BarChart data={derived.lift}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="date" {...axis} />
                  <YAxis {...axis} width={44} />
                  <Tooltip {...tooltip} />
                  <Bar isAnimationActive={false} dataKey="volume" name="Volume" fill={C1} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </Chart>
            )}
          </>
        ) : (
          <Empty>Log a session of this exercise to see trends.</Empty>
        )}
      </Card>

      <Card>
        <SectionTitle>Bodyweight</SectionTitle>
        {derived.bw.length ? (
          <Chart title="Daily weight & 7-day average (kg)">
            <ComposedChart data={derived.bw}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="date" {...axis} />
              <YAxis {...axis} width={36} domain={['dataMin - 1', 'dataMax + 1']} />
              <Tooltip {...tooltip} />
              <Legend wrapperStyle={{ fontSize: 12, color: INK }} />
              <Scatter isAnimationActive={false} dataKey="weight" name="Daily" fill={C1} />
              <Line isAnimationActive={false} dataKey="avg" name="7-day avg" stroke={C2} strokeWidth={2} dot={false} />
            </ComposedChart>
          </Chart>
        ) : (
          <Empty>Add bodyweight in your daily check-in.</Empty>
        )}
        {derived.bf.length > 0 && (
          <Chart title="Body fat (%)">
            <LineChart data={derived.bf}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="date" {...axis} />
              <YAxis {...axis} width={32} domain={['dataMin - 1', 'dataMax + 1']} />
              <Tooltip {...tooltip} />
              <Line isAnimationActive={false} dataKey="bf" name="Body fat %" stroke={C1} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </Chart>
        )}
      </Card>

      <Card>
        <SectionTitle>Recovery & nutrition</SectionTitle>
        {derived.daily.length ? (
          <>
            <BandChart title="Sleep per night (h)" data={derived.daily} dataKey="sleep" name="Sleep" band={T ? { min: T.weekly.sleep.min / 7, max: T.weekly.sleep.max / 7 } : undefined} />
            <BandChart title="Protein per day (g)" data={derived.daily} dataKey="protein" name="Protein" band={T?.daily.protein} />
          </>
        ) : (
          <Empty>Do a daily check-in to see sleep and protein.</Empty>
        )}
      </Card>

      <Card>
        <SectionTitle>Weekly training</SectionTitle>
        <Chart title="Martial arts sessions per week">
          <BarChart data={derived.weekly}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="week" {...axis} />
            <YAxis {...axis} width={28} allowDecimals={false} />
            <Tooltip {...tooltip} />
            {T && <ReferenceArea ifOverflow="extendDomain" y1={T.weekly.maSessions.min} y2={T.weekly.maSessions.max} fill={BAND} fillOpacity={0.08} />}
            <Bar isAnimationActive={false} dataKey="ma" name="Sessions" fill={C1} radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </Chart>
        <Chart title="Zone 2 minutes per week">
          <BarChart data={derived.weekly}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="week" {...axis} />
            <YAxis {...axis} width={32} />
            <Tooltip {...tooltip} />
            {T && <ReferenceArea ifOverflow="extendDomain" y1={T.weekly.zone2Min.min} y2={T.weekly.zone2Min.max} fill={BAND} fillOpacity={0.08} />}
            <Bar isAnimationActive={false} dataKey="z2" name="Minutes" fill={C1} radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </Chart>
        <p className="text-xs text-neutral-500">Shaded band = weekly target.</p>
      </Card>
    </Page>
  );
}

function Chart({ title, children }: { title: string; children: ReactNode }) {
  return (
    <figure className="mb-4">
      <figcaption className="mb-2 text-sm text-neutral-300">{title}</figcaption>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {children as ReactElement}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function BandChart({ title, data, dataKey, name, band }: { title: string; data: object[]; dataKey: string; name: string; band?: Range }) {
  return (
    <Chart title={title}>
      <BarChart data={data}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" {...axis} />
        <YAxis {...axis} width={36} />
        <Tooltip {...tooltip} />
        {band && <ReferenceArea ifOverflow="extendDomain" y1={band.min} y2={band.max} fill={BAND} fillOpacity={0.12} label={{ value: 'target', fill: INK, fontSize: 10, position: 'insideTopRight' }} />}
        <Bar isAnimationActive={false} dataKey={dataKey} name={name} fill={C1} radius={[4, 4, 0, 0]} maxBarSize={20} />
      </BarChart>
    </Chart>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-neutral-500">{children}</p>;
}
