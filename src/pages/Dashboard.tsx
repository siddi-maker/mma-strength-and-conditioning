import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { addDays, toISODate, weekStart } from '../lib/dates';
import { deloadDue } from '../lib/progression';
import { getActivePlan, nextInPlan, planTemplates } from '../lib/plans';
import { adherence, checkinStreak, rangeStatus, weekSummary } from '../lib/weekly';
import { goalCurrent, goalMet, goalProgress } from '../lib/goals';
import { isDeloadActive, startDeloadWeek } from '../lib/workout';
import { navigate } from '../lib/route';
import { Bar, Button, Card, Page, Ring, SectionTitle, cx, fmt } from '../components/ui';
import type { Range } from '../lib/types';

export default function Dashboard() {
  const data = useLiveQuery(async () => {
    const plan = await getActivePlan();
    const [settings, templates, workouts, checkins, activities] = await Promise.all([
      db.settings.get('settings'),
      plan ? planTemplates(plan.id) : [],
      db.workouts.toArray(),
      db.checkins.toArray(),
      db.activities.toArray(),
    ]);
    return { plan, settings, templates, workouts, checkins, activities };
  }, []);
  if (!data?.settings) return null;
  const { plan, settings, templates, workouts, checkins, activities } = data;
  const today = toISODate();
  const active = workouts.find((w) => w.status === 'active');
  const next = nextInPlan(templates, workouts);
  const perWeek = plan?.sessionsPerWeek ?? 4;
  const ci = checkins.find((c) => c.date === today);
  const T = settings.targets;
  const week = weekSummary(weekStart(today), checkins, activities, workouts);
  const adh = adherence(workouts, perWeek, today);
  const deload = deloadDue(settings.blockStart, today, settings.deloadEveryWeeks);
  const inDeload = isDeloadActive(settings.deloadUntil, today);

  return (
    <Page
      title="Today"
      right={
        <a href="#/settings" aria-label="Settings" className="flex h-12 w-12 items-center justify-center rounded-xl text-neutral-400 active:bg-neutral-800">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </a>
      }
    >
      {deload.due && !inDeload && (
        <Card className="border border-amber-800 bg-amber-950/50">
          <div className="font-semibold text-amber-200">Deload due — week {deload.weeks + 1} of this block</div>
          <p className="mt-1 text-sm text-amber-200/80">One easy week at ~60% volume keeps you fresh for the next block.</p>
          <Button className="mt-3 w-full" onClick={() => startDeloadWeek()}>
            Start deload week
          </Button>
        </Card>
      )}

      <Card>
        <SectionTitle
          right={
            <a href="#/settings?tab=plans" className="text-sm font-semibold text-red-400">
              {plan?.name ?? 'Plans'} →
            </a>
          }
        >
          Next workout
        </SectionTitle>
        {active ? (
          <Button variant="primary" className="h-14 w-full text-lg" onClick={() => navigate('/train')}>
            Resume {active.templateName}
          </Button>
        ) : (
          !next ? (
            <Button className="w-full" onClick={() => navigate('/settings?tab=plans')}>
              Add workouts to {plan?.name ?? 'your plan'}
            </Button>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xl font-bold">{next.name}</div>
                <div className="text-sm text-neutral-400">{next.conditioning?.label}</div>
                {inDeload && <div className="text-sm text-amber-300">Deload week</div>}
              </div>
              <Button variant="primary" onClick={() => navigate('/train')}>
                Start
              </Button>
            </div>
          )
        )}
      </Card>

      <Card>
        <SectionTitle right={<a href="#/checkin" className="text-sm font-semibold text-red-400">Check in →</a>}>Today's fuel</SectionTitle>
        <div className="grid grid-cols-3 gap-y-4">
          <Ring label="Protein" unit="g" value={ci?.protein ?? 0} {...T.daily.protein} />
          <Ring label="Calories" unit="" value={ci?.calories ?? 0} {...T.daily.calories} />
          <Ring label="Water" unit="L" value={ci?.water ?? 0} {...T.daily.water} />
          <Ring label="Carbs" unit="g" value={ci?.carbs ?? 0} {...T.daily.carbs} />
          <Ring label="Fat" unit="g" value={ci?.fat ?? 0} {...T.daily.fat} />
        </div>
      </Card>

      <Card>
        <SectionTitle>This week</SectionTitle>
        <div className="flex flex-col gap-3">
          <WeekRow label="Sleep" unit="h" value={week.sleep} range={T.weekly.sleep} />
          <WeekRow label="Protein" unit="g" value={week.protein} range={T.weekly.protein} />
          <WeekRow label="Water" unit="L" value={week.water} range={T.weekly.water} />
          <WeekRow label="Zone 2" unit="min" value={week.zone2Min} range={T.weekly.zone2Min} />
          <WeekRow label="Sprint sessions" value={week.sprintSessions} range={{ min: T.weekly.sprintSessions, max: Infinity }} />
          <WeekRow label="Martial arts" value={week.maSessions} range={T.weekly.maSessions} />
          <WeekRow label="Weight sessions" value={week.weightSessions} range={{ min: perWeek, max: Infinity }} />
        </div>
      </Card>

      <Card>
        <SectionTitle>Goals</SectionTitle>
        <div className="flex flex-col gap-4">
          {settings.goals.map((g) => {
            const cur = goalCurrent(g, { checkins, activities, workouts });
            const met = goalMet(g, cur);
            return (
              <div key={g.id}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="font-medium">{g.label}</span>
                  <span className={cx('text-sm tabular-nums', met ? 'text-emerald-400' : 'text-neutral-300')}>
                    {cur === undefined ? '—' : `${fmt(cur)} ${g.unit}`} {met && '✓'}
                  </span>
                </div>
                <Bar value={goalProgress(g, cur)} max={1} ok={met} />
                <div className="mt-1 flex justify-between text-xs text-neutral-500">
                  <span>Start {g.startLabel ?? `${fmt(g.start)} ${g.unit}`}</span>
                  <span>Goal {g.goalLabel ?? (g.goalMax ? `${g.goal}–${g.goalMax} ${g.unit}` : `${g.goal} ${g.unit}`)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <SectionTitle>Consistency</SectionTitle>
        <div className="mb-4 grid grid-cols-3 gap-2 text-center">
          <Stat value={adh.planned ? `${fmt(100 - adh.missedPct)}%` : '—'} label="Adherence" ok={adh.planned > 0 && adh.missedPct < 10} />
          <Stat value={`${adh.weekStreak}`} label="Week streak" />
          <Stat value={`${checkinStreak(checkins, today)}`} label="Check-in streak" />
        </div>
        {adh.planned > 0 && (
          <p className="mb-3 text-xs text-neutral-400">
            {adh.done}/{adh.planned} sessions over the last {adh.weeks} full weeks · missed {fmt(adh.missedPct)}% (goal under 10%)
          </p>
        )}
        <Heatmap today={today} days={dayCounts(workouts, activities)} />
      </Card>
    </Page>
  );
}

function WeekRow({ label, value, range, unit = '' }: { label: string; value: number; range: Range; unit?: string }) {
  const status = rangeStatus(value, range);
  const target = range.max === Infinity ? `${range.min}+` : `${fmt(range.min)}–${fmt(range.max)}`;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className={cx('tabular-nums', status === 'below' ? 'text-neutral-300' : 'text-emerald-400')}>
          {fmt(value)} / {target} {unit}
        </span>
      </div>
      <Bar value={value} max={range.min} ok={status !== 'below'} />
    </div>
  );
}

function Stat({ value, label, ok }: { value: string; label: string; ok?: boolean }) {
  return (
    <div className="rounded-xl bg-neutral-800 p-3">
      <div className={cx('text-xl font-bold', ok && 'text-emerald-400')}>{value}</div>
      <div className="text-xs text-neutral-400">{label}</div>
    </div>
  );
}

function dayCounts(workouts: { status: string; startedAt: number }[], activities: { date: string }[]) {
  const m = new Map<string, number>();
  for (const w of workouts) if (w.status === 'done') m.set(toISODate(w.startedAt), (m.get(toISODate(w.startedAt)) ?? 0) + 1);
  for (const a of activities) m.set(a.date, (m.get(a.date) ?? 0) + 1);
  return m;
}

/** 16 weeks × 7 days, columns are weeks (Mon at top). */
function Heatmap({ today, days }: { today: string; days: Map<string, number> }) {
  const weeks = 16;
  const start = addDays(weekStart(today), -(weeks - 1) * 7);
  const cols = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  const shade = (n: number) => (n === 0 ? 'bg-neutral-800' : n === 1 ? 'bg-red-900' : n === 2 ? 'bg-red-700' : 'bg-red-500');
  return (
    <div>
      <div className="flex gap-[3px]" role="img" aria-label="Training days over the last 16 weeks">
        {cols.map((col, i) => (
          <div key={i} className="flex flex-1 flex-col gap-[3px]">
            {col.map((d) => (
              <div key={d} title={`${d}: ${days.get(d) ?? 0}`} className={cx('aspect-square rounded-[3px]', d > today ? 'bg-transparent' : shade(days.get(d) ?? 0), d === today && 'ring-1 ring-neutral-300')} />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-neutral-500">
        Less <span className="h-3 w-3 rounded-sm bg-neutral-800" />
        <span className="h-3 w-3 rounded-sm bg-red-900" />
        <span className="h-3 w-3 rounded-sm bg-red-700" />
        <span className="h-3 w-3 rounded-sm bg-red-500" /> More
      </div>
    </div>
  );
}
