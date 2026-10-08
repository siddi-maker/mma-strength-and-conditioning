import { adjustRest, stopRest, useRestTimer } from '../lib/timer';
import { formatClock } from '../lib/dates';
import { cx } from './ui';

export function RestTimerBar() {
  const { timer, remaining } = useRestTimer();
  if (!timer) return null;
  const done = remaining <= 0;
  const pct = Math.max(0, Math.min(1, remaining / timer.duration));
  return (
    <div className={cx('fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 px-3 pb-2')}>
      <div className={cx('mx-auto max-w-xl overflow-hidden rounded-2xl shadow-lg shadow-black/60', done ? 'bg-emerald-700' : 'bg-neutral-800')}>
        <div className="h-1 bg-red-500 transition-[width] duration-300" style={{ width: `${pct * 100}%` }} />
        <div className="flex items-center gap-2 p-2">
          <div className="min-w-0 flex-1 pl-2">
            <div className="text-2xl font-bold tabular-nums">{done ? 'Go!' : formatClock(remaining)}</div>
            <div className="truncate text-xs text-neutral-300">{done ? `Next: ${timer.label}` : `Rest · ${timer.label}`}</div>
          </div>
          <button type="button" className="h-12 w-14 rounded-xl bg-neutral-900/60 font-semibold" onClick={() => adjustRest(-15)}>
            −15
          </button>
          <button type="button" className="h-12 w-14 rounded-xl bg-neutral-900/60 font-semibold" onClick={() => adjustRest(15)}>
            +15
          </button>
          <button type="button" className="h-12 w-16 rounded-xl bg-neutral-900/60 font-semibold" onClick={stopRest}>
            {done ? 'OK' : 'Skip'}
          </button>
        </div>
      </div>
    </div>
  );
}
