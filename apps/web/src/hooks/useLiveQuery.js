import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToData } from '../lib/liveData.js';

// Keep the current view during background updates. Older/aborted requests may
// finish, but cannot overwrite newer filters, product selections or live data.
export function useLiveQuery(loader, deps, tables, delay = 0) {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const refreshRef = useRef(() => {});
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const refresh = useCallback(() => refreshRef.current(), []);
  const tableKey = tables.join(',');
  useEffect(() => {
    let active = true;
    let version = 0;
    let controller;
    let timer;
    const run = async () => {
      clearTimeout(timer);
      controller?.abort();
      controller = new AbortController();
      const current = ++version;
      try {
        const data = await loaderRef.current(controller.signal);
        if (active && current === version) setState({ data, error: '', loading: false });
      } catch (error) {
        if (active && current === version && error.name !== 'AbortError') {
          setState(old => ({ ...old, error: error.message, loading: false }));
        }
      }
    };
    const schedule = () => {
      // Invalidate a request immediately, before the debounced replacement runs.
      ++version;
      controller?.abort();
      clearTimeout(timer);
      timer = setTimeout(run, 120);
    };
    refreshRef.current = run;
    setState({ data: null, error: '', loading: true });
    if (delay) timer = setTimeout(run, delay);
    else run();
    const unsubscribe = subscribeToData(tableKey.split(','), schedule);
    return () => {
      active = false;
      ++version;
      clearTimeout(timer);
      controller?.abort();
      unsubscribe();
    };
  }, [...deps, tableKey, delay]);
  return { ...state, refresh };
}
