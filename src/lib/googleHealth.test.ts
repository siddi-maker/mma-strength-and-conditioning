import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import { durationMinutes, mapBodyFat, mapRuns, mapSleep, mapWeights, mergeCheckIn, syncFitbit, syncStartDate, type ApiDataPoint } from './googleHealth';

const civil = (y: number, mo: number, d: number, h = 0, mi = 0) => ({ date: { year: y, month: mo, day: d }, time: { hours: h, minutes: mi } });

const sleep = (end: [number, number, number, number, number], start: [number, number, number, number, number], minutesAsleep: number, meta: { mainSleep?: boolean; nap?: boolean } = {}): ApiDataPoint => ({
  sleep: {
    interval: {
      startTime: '2026-10-06T22:00:00Z',
      endTime: '2026-10-07T06:00:00Z',
      civilStartTime: civil(...start),
      civilEndTime: civil(...end),
    },
    summary: { minutesAsleep: String(minutesAsleep) },
    metadata: meta,
  },
});

describe('mapping Google Health data', () => {
  it('maps the main sleep to the wake-up date and ignores naps', () => {
    const nights = mapSleep([
      sleep([2026, 10, 7, 6, 30], [2026, 10, 6, 22, 45], 440, { mainSleep: true }),
      sleep([2026, 10, 7, 15, 30], [2026, 10, 7, 14, 50], 35, { nap: true }),
      sleep([2026, 10, 7, 3, 0], [2026, 10, 7, 1, 0], 100),
    ]);
    expect(nights).toEqual([{ date: '2026-10-07', sleepHours: 7.3, bedtime: '22:45', wakeTime: '06:30' }]);
  });

  it('keeps the longest sleep when none is flagged main', () => {
    const nights = mapSleep([sleep([2026, 10, 8, 7, 0], [2026, 10, 7, 23, 0], 420), sleep([2026, 10, 8, 2, 0], [2026, 10, 8, 0, 30], 80)]);
    expect(nights[0].sleepHours).toBe(7);
  });

  it('takes the first weigh-in of the day in kg', () => {
    const w = (t: string, d: number, g: number): ApiDataPoint => ({ weight: { sampleTime: { physicalTime: t, civilTime: civil(2026, 10, d) }, weightGrams: g } });
    expect(mapWeights([w('2026-10-07T18:00:00Z', 7, 78400), w('2026-10-07T06:30:00Z', 7, 77650), w('2026-10-08T06:30:00Z', 8, 77300)]).sort((a, b) => a.date.localeCompare(b.date))).toEqual([
      { date: '2026-10-07', bodyweight: 77.7 },
      { date: '2026-10-08', bodyweight: 77.3 },
    ]);
  });

  it('maps body fat readings', () => {
    expect(mapBodyFat([{ bodyFat: { sampleTime: { physicalTime: '2026-10-07T06:30:00Z', civilTime: civil(2026, 10, 7) }, percentage: 14.64 } }])).toEqual([{ date: '2026-10-07', bodyFat: 14.6 }]);
  });

  it('imports runs only, with duration, distance and heart rate', () => {
    const ex = (type: string, name: string): ApiDataPoint => ({
      name,
      exercise: {
        exerciseType: type,
        activeDuration: '2112s',
        interval: { startTime: '2026-10-07T07:00:00Z', endTime: '2026-10-07T07:40:00Z', civilStartTime: civil(2026, 10, 7, 8, 0) },
        metricsSummary: { distanceMillimeters: 5_240_000, averageHeartRateBeatsPerMinute: '141' },
      },
    });
    const runs = mapRuns([ex('RUNNING', 'users/x/dataTypes/exercise/dataPoints/1'), ex('WEIGHTLIFTING', 'b'), ex('TREADMILL', 'c')]);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({ date: '2026-10-07', type: 'zone2', durationMin: 35, distanceM: 5240, avgHr: 141, source: 'fitbit', externalId: 'users/x/dataTypes/exercise/dataPoints/1' });
  });

  it('parses protobuf durations', () => {
    expect(durationMinutes('1800s')).toBe(30);
    expect(durationMinutes('1834.5s')).toBe(31);
    expect(durationMinutes(undefined)).toBeUndefined();
  });

  it('chooses the sync window', () => {
    expect(syncStartDate(undefined, '2026-10-08')).toBe('2026-09-08');
    expect(syncStartDate(new Date(2026, 9, 8, 12).getTime())).toBe('2026-10-05');
  });
});

describe('mergeCheckIn', () => {
  it('fills empty fields and records them as synced', () => {
    expect(mergeCheckIn(undefined, '2026-10-07', { bodyweight: 77.5 })).toEqual({ date: '2026-10-07', bodyweight: 77.5, synced: ['bodyweight'] });
  });
  it('never overwrites a manual entry', () => {
    expect(mergeCheckIn({ date: '2026-10-07', bodyweight: 78 }, '2026-10-07', { bodyweight: 77.5 })).toBeNull();
  });
  it('refreshes a value from an earlier sync, keeps manual fields', () => {
    const next = mergeCheckIn({ date: 'd', sleepHours: 6, protein: 150, synced: ['sleepHours'] }, 'd', { sleepHours: 7.2 });
    expect(next).toEqual({ date: 'd', sleepHours: 7.2, protein: 150, synced: ['sleepHours'] });
  });
  it('reports no change when values are identical', () => {
    expect(mergeCheckIn({ date: 'd', sleepHours: 7, synced: ['sleepHours'] }, 'd', { sleepHours: 7 })).toBeNull();
  });
});

describe('syncFitbit (mocked API)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const today = new Date();
  const c = (offsetDays: number, h = 7) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offsetDays, h);
    return { physical: d.toISOString(), civil: civil(d.getFullYear(), d.getMonth() + 1, d.getDate(), h, 0) };
  };

  it('writes check-ins and runs, skips duplicates, and keeps manual values', async () => {
    const y = c(1);
    const responses: Record<string, unknown> = {
      sleep: { dataPoints: [{ sleep: { interval: { startTime: y.physical, endTime: y.physical, civilStartTime: civil(2026, 1, 1, 23, 10), civilEndTime: y.civil }, summary: { minutesAsleep: '432' }, metadata: { mainSleep: true } } }] },
      weight: { dataPoints: [{ weight: { sampleTime: { physicalTime: y.physical, civilTime: y.civil }, weightGrams: 77800 } }] },
      'body-fat': { dataPoints: [] },
      exercise: {
        dataPoints: [{ name: 'run-1', exercise: { exerciseType: 'RUNNING', activeDuration: '2400s', interval: { startTime: y.physical, endTime: y.physical, civilStartTime: y.civil }, metricsSummary: { distanceMillimeters: 6_000_000 } } }],
      },
    };
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push(url);
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
        const type = url.split('/dataTypes/')[1].split('/')[0];
        return new Response(JSON.stringify(responses[type]), { status: 200 });
      }),
    );

    const date = y.civil.date ? `${y.civil.date.year}-${String(y.civil.date.month).padStart(2, '0')}-${String(y.civil.date.day).padStart(2, '0')}` : '';
    await db.checkins.put({ date, bodyweight: 79 }); // manual entry

    const r1 = await syncFitbit('tok');
    expect(r1).toMatchObject({ nights: 1, weights: 0, runs: 1, warnings: [] });
    const ci = await db.checkins.get(date);
    expect(ci).toMatchObject({ bodyweight: 79, sleepHours: 7.2, bedtime: '23:10', wakeTime: '07:00' });
    expect(calls.some((u) => (new URL(u).searchParams.get('filter') ?? '').startsWith('sleep.interval.civil_end_time >= "'))).toBe(true);

    const r2 = await syncFitbit('tok');
    expect(r2.runs).toBe(0);
    expect(await db.activities.where('type').equals('zone2').count()).toBe(1);
    expect((await db.settings.get('settings'))?.google?.lastSync).toBeGreaterThan(0);
  });

  it('surfaces API errors without advancing the sync window', async () => {
    const before = (await db.settings.get('settings'))?.google?.lastSync;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/weight/') ? new Response(JSON.stringify({ error: { message: 'Google Health API has not been used in project 123' } }), { status: 403 }) : new Response('{}', { status: 200 }),
      ),
    );
    const r = await syncFitbit('tok');
    expect(r.warnings[0]).toMatch(/Weight: .*not been used/);
    expect((await db.settings.get('settings'))?.google?.lastSync).toBe(before);
  });

  it('throws an auth error on 401', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    await expect(syncFitbit('tok')).rejects.toThrow(/expired/);
  });
});
