import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { addDays, shortDate, toISODate } from '../lib/dates';
import { Button, Card, NumberField, Page, SectionTitle, Toggle } from '../components/ui';
import type { CheckIn } from '../lib/types';

/** Hours slept from HH:MM bedtime to HH:MM wake time, crossing midnight. */
export function sleepFrom(bed?: string, wake?: string): number | undefined {
  if (!bed || !wake) return undefined;
  const [bh, bm] = bed.split(':').map(Number);
  const [wh, wm] = wake.split(':').map(Number);
  let mins = wh * 60 + wm - (bh * 60 + bm);
  if (mins <= 0) mins += 24 * 60;
  return Math.round((mins / 60) * 4) / 4;
}

export default function CheckInPage() {
  const today = toISODate();
  const [date, setDate] = useState(today);
  const c = useLiveQuery(() => db.checkins.get(date), [date], null);
  if (c === null) return null;
  const ci: CheckIn = c ?? { date };

  const update = async (patch: Partial<CheckIn>) => {
    const cur = (await db.checkins.get(date)) ?? { date };
    const next = { ...cur, ...patch };
    if (('bedtime' in patch || 'wakeTime' in patch) && next.bedtime && next.wakeTime) next.sleepHours = sleepFrom(next.bedtime, next.wakeTime);
    await db.checkins.put(next);
  };
  const add = (k: 'water' | 'protein', n: number) => update({ [k]: Math.round(((ci[k] ?? 0) + n) * 100) / 100 });

  return (
    <Page title="Check-in">
      <div className="flex items-center gap-2">
        <Button aria-label="previous day" onClick={() => setDate(addDays(date, -1))}>
          ‹
        </Button>
        <div className="flex-1 text-center font-semibold">{date === today ? 'Today' : shortDate(date)}</div>
        <Button aria-label="next day" disabled={date >= today} onClick={() => setDate(addDays(date, 1))}>
          ›
        </Button>
      </div>

      <Card>
        <SectionTitle>Quick add</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          <Button variant="primary" onClick={() => add('water', 0.5)}>
            💧 +500 ml
          </Button>
          <Button variant="primary" onClick={() => add('protein', 25)}>
            🥩 +25 g
          </Button>
          <Button variant="primary" onClick={() => add('protein', 40)}>
            🥩 +40 g
          </Button>
        </div>
      </Card>

      <Card className="grid grid-cols-2 gap-3">
        <NumberField label="Bodyweight" unit="kg" value={ci.bodyweight} onChange={(v) => update({ bodyweight: v })} />
        <NumberField label="Water" unit="L" value={ci.water} onChange={(v) => update({ water: v })} />
        <NumberField label="Protein" unit="g" value={ci.protein} onChange={(v) => update({ protein: v })} />
        <NumberField label="Calories" unit="kcal" value={ci.calories} onChange={(v) => update({ calories: v })} />
        <NumberField label="Carbs" unit="g" value={ci.carbs} onChange={(v) => update({ carbs: v })} />
        <NumberField label="Fat" unit="g" value={ci.fat} onChange={(v) => update({ fat: v })} />
      </Card>

      <Card className="grid grid-cols-2 gap-3">
        <TimeField label="Bedtime" value={ci.bedtime} onChange={(v) => update({ bedtime: v })} />
        <TimeField label="Wake time" value={ci.wakeTime} onChange={(v) => update({ wakeTime: v })} />
        <div className="col-span-2">
          <NumberField label="Sleep (auto from times, or enter)" unit="h" value={ci.sleepHours} onChange={(v) => update({ sleepHours: v })} />
        </div>
      </Card>

      <Card className="flex flex-col gap-2">
        <Toggle label="Creatine taken" checked={!!ci.creatine} onChange={(v) => update({ creatine: v })} />
        <Toggle label="Electrolytes" checked={!!ci.electrolytes} onChange={(v) => update({ electrolytes: v })} />
        <Toggle label="Phone off 60 min before bed" checked={!!ci.phoneOff} onChange={(v) => update({ phoneOff: v })} />
        <Toggle label="Caffeine only before 2 pm" checked={!!ci.caffeineBefore2} onChange={(v) => update({ caffeineBefore2: v })} />
      </Card>

      <Card>
        <SectionTitle>Occasional</SectionTitle>
        <NumberField label="Body fat" unit="%" value={ci.bodyFat} onChange={(v) => update({ bodyFat: v })} />
      </Card>
      <p className="text-center text-xs text-neutral-500">Saved automatically.</p>
    </Page>
  );
}

function TimeField({ label, value, onChange }: { label: string; value?: string; onChange: (v: string | undefined) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-neutral-400">{label}</span>
      <input
        type="time"
        className="h-12 rounded-xl bg-neutral-800 px-3 text-lg font-semibold outline-none focus:ring-2 focus:ring-red-600"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    </label>
  );
}
