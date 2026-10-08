import { useSyncExternalStore } from 'react';

/** Minimal hash router: works on any static host (GitHub Pages) with no server rewrites. */
export type Route = { path: string; params: URLSearchParams };

function read(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  return { path, params: new URLSearchParams(query) };
}

let current = read();
const subscribe = (cb: () => void) => {
  const h = () => {
    current = read();
    cb();
  };
  window.addEventListener('hashchange', h);
  return () => window.removeEventListener('hashchange', h);
};

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => current);
}

export function navigate(to: string) {
  window.location.hash = to;
  window.scrollTo(0, 0);
}
