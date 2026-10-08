import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { syncNow, useFitbitSync } from '../lib/fitbitSync';
import type { Settings } from '../lib/types';
import { Button, Card, cx } from './ui';

export function ago(ts: number): string {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export function FitbitStatus({ s }: { s: Settings }) {
  const sync = useFitbitSync();
  return (
    <div className="flex flex-col gap-1 text-sm">
      {sync.status !== 'idle' && <p className={cx(sync.status === 'error' ? 'text-red-400' : sync.status === 'done' ? 'text-emerald-400' : 'text-neutral-300')}>{sync.message}</p>}
      {sync.warnings?.map((w) => (
        <p key={w} className="text-amber-300">
          ⚠ {w}
        </p>
      ))}
      {sync.status === 'idle' && s.google?.lastResult && <p className="text-neutral-400">{s.google.lastResult}</p>}
      {s.google?.lastSync && <p className="text-xs text-neutral-500">Last synced {ago(s.google.lastSync)}</p>}
    </div>
  );
}

/** Dashboard card: shows only once a client ID is set up. */
export function FitbitCard() {
  const s = useLiveQuery(() => db.settings.get('settings'));
  const sync = useFitbitSync();
  if (!s?.google?.clientId) return null;
  return (
    <Card className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="font-semibold">Fitbit</div>
        <FitbitStatus s={s} />
      </div>
      <Button variant="secondary" disabled={sync.status === 'syncing'} onClick={() => syncNow('#/')}>
        {sync.status === 'syncing' ? 'Syncing…' : 'Sync'}
      </Button>
    </Card>
  );
}
