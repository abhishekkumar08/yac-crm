import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/api.js";

export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return undefined;
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    api(path).then(
      (data) => live && setState({ data, error: null, loading: false }),
      (error) => live && setState({ data: null, error, loading: false }),
    );
    return () => { live = false; };
  }, [path, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload, setData: (data) => setState((s) => ({ ...s, data })) };
}

export const SessionContext = createContext(null);
export const useSession = () => useContext(SessionContext);

const metaCache = new Map();
const listeners = new Set();

export function invalidateMeta() {
  metaCache.clear();
  for (const fn of listeners) fn();
}

export function useObjectMeta(name) {
  const [state, setState] = useState(() => ({ name, meta: metaCache.get(name) ?? null, error: null }));
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    listeners.add(bump);
    return () => listeners.delete(bump);
  }, []);
  useEffect(() => {
    if (!name) return undefined;
    let live = true;
    if (metaCache.has(name)) {
      setState({ name, meta: metaCache.get(name), error: null });
      return undefined;
    }
    setState((s) => (s.name === name ? s : { name, meta: null, error: null }));
    api(`/meta/objects/${name}`).then(
      (meta) => { metaCache.set(name, meta); if (live) setState({ name, meta, error: null }); },
      (error) => live && setState({ name, meta: null, error }),
    );
    return () => { live = false; };
  }, [name, tick]);
  return state.name === name ? state : { meta: null, error: null };
}
