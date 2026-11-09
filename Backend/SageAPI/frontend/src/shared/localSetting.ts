import { useSyncExternalStore } from "react";

// A small setting kept in this browser's localStorage. Every component using the same key
// re-renders when it changes, in this tab or another one.
export function createLocalSetting<T>(key: string, fallback: T) {
  const listeners = new Set<() => void>();
  let cachedRaw: string | null | undefined;
  let cachedValue = fallback;

  const read = (): T => {
    let raw: string | null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      // Storage blocked (e.g. private mode) — keep the in-memory value.
      return cachedValue;
    }
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      try {
        cachedValue = raw === null ? fallback : (JSON.parse(raw) as T);
      } catch {
        cachedValue = fallback;
      }
    }
    return cachedValue;
  };

  const write = (value: T) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage blocked; the value lasts until the page is reloaded.
      cachedValue = value;
    }
    listeners.forEach((notify) => notify());
  };

  const subscribe = (notify: () => void) => {
    listeners.add(notify);
    const onStorage = (e: StorageEvent) => e.key === key && notify();
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(notify);
      window.removeEventListener("storage", onStorage);
    };
  };

  const use = () => [useSyncExternalStore(subscribe, read), write] as const;

  return { read, write, use };
}
