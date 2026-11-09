import { useSyncExternalStore } from "react";

// The shopper's own branch, picked once from the header and remembered on this device.
// Also whether the branch picker is open, so any page can open it ("Change branch").

const KEY = "branch.v1";

interface State {
  code: string | null;
  pickerOpen: boolean;
}

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

let state: State = { code: read(), pickerOpen: false };
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

// Keep other tabs in step
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) set({ code: read() });
  });
}

export function chooseBranch(code: string | null) {
  try {
    if (code) localStorage.setItem(KEY, code);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the choice lasts for this visit */
  }
  set({ code, pickerOpen: false });
}

export const openBranchPicker = () => set({ pickerOpen: true });
export const closeBranchPicker = () => set({ pickerOpen: false });

export function useBranchState(): State {
  return useSyncExternalStore(subscribe, () => state);
}
