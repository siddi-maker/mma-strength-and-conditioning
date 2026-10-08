import { Suspense, lazy, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRoute } from './lib/route';
import { db } from './lib/db';
import { setTimerPrefs } from './lib/timer';
import { RestTimerBar } from './components/RestTimerBar';
import { cx } from './components/ui';
import Dashboard from './pages/Dashboard';
import Train from './pages/Train';
import CheckInPage from './pages/CheckIn';
import LogPage from './pages/Log';
import SettingsPage from './pages/Settings';

// Recharts is the heaviest dependency; load it only when the Charts tab opens.
const Charts = lazy(() => import('./pages/Charts'));

const tabs = [
  { path: '/', label: 'Today', icon: 'M3 12l9-8 9 8M5 10v10h14V10' },
  { path: '/train', label: 'Train', icon: 'M2 12h2m16 0h2M6 8v8m12-8v8M4 10v4m16-4v4M6 12h12' },
  { path: '/checkin', label: 'Check-in', icon: 'M5 13l4 4L19 7' },
  { path: '/log', label: 'Cardio/MA', icon: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z' },
  { path: '/charts', label: 'Charts', icon: 'M4 20V10m6 10V4m6 16v-7m4 7H2' },
];

export default function App() {
  const { path } = useRoute();
  const settings = useLiveQuery(() => db.settings.get('settings'));
  const active = useLiveQuery(() => db.workouts.where('status').equals('active').count());

  useEffect(() => {
    if (settings) setTimerPrefs({ sound: settings.sound, vibrate: settings.vibrate });
  }, [settings]);

  let page;
  switch (path) {
    case '/train':
      page = <Train />;
      break;
    case '/checkin':
      page = <CheckInPage />;
      break;
    case '/log':
      page = <LogPage />;
      break;
    case '/charts':
      page = <Charts />;
      break;
    case '/settings':
      page = <SettingsPage />;
      break;
    default:
      page = <Dashboard />;
  }

  return (
    <div className="min-h-dvh">
      <main>
        <Suspense fallback={null}>{page}</Suspense>
      </main>
      <RestTimerBar />
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-800 bg-neutral-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-xl">
          {tabs.map((t) => {
            const on = path === t.path || (t.path === '/' && path === '');
            return (
              <a key={t.path} href={`#${t.path}`} className={cx('relative flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium', on ? 'text-red-500' : 'text-neutral-400')}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={t.icon} />
                </svg>
                {t.label}
                {t.path === '/train' && !!active && <span className="absolute top-2 right-[30%] h-2 w-2 rounded-full bg-red-500" />}
              </a>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
