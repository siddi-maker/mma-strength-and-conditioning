import { useSyncExternalStore } from 'react';

/** Minimal hash router: works on any static host (GitHub Pages) with no server rewrites. */
export type Route = { path: string; params: URLSearchParams };

let raw = '';
let current: Route = { path: '/', params: new URLSearchParams() };

// Read lazily from the current hash on each render.
function snapshot(): Route {
  const h = window.location.hash;
  if (h !== raw) {
    raw = h;
    const [path, query = ''] = (h.replace(/^#/, '') || '/').split('?');
    current = { path, params: new URLSearchParams(query) };
  }
  return current;
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, snapshot);
}

export function navigate(to: string) {
  window.location.hash = to;
  window.scrollTo(0, 0);
}
