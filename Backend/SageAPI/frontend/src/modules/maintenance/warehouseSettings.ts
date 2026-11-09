import { useEffect, useMemo, useSyncExternalStore } from "react";
import { adminRequest } from "../../api/admin";

// The warehouses the store works with, chosen under Maintenance → Warehouses.
// Saved by StoreBackend (not just this browser), because the online shop sells stock from exactly
// these warehouses and shows shoppers where each product is. The Inventory module only shows them.

export interface ShopWarehouse {
  /** Sage warehouse code */
  code: string;
  /** Name shoppers see. Empty = the Sage name. */
  label: string;
  /** Address or directions shown on product pages. Optional. */
  address: string;
  /** Town or city; groups branches in the shop's branch picker. Optional. */
  town: string;
}

interface State {
  warehouses: ShopWarehouse[];
  /** "env" until a choice is saved here (StoreBackend then uses STORE_WAREHOUSE from its .env). */
  source: "admin" | "env" | null;
  loaded: boolean;
  error: string | null;
}

interface Saved {
  warehouses: ShopWarehouse[];
  source: "admin" | "env";
}

// Before this was saved on the server, the ticks lived only in this browser
const LEGACY_KEY = "storeAdmin.inventory.warehouses";
const PATH = "/settings/shop-warehouses";

function legacyCodes(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((c): c is string => typeof c === "string" && c !== "") : [];
  } catch {
    return [];
  }
}

function rememberLocally(codes: string[]) {
  try {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(codes));
  } catch {
    /* storage blocked: the server copy is what counts */
  }
}

// Start from this browser's copy so Inventory doesn't flash empty while the server answers
let state: State = {
  warehouses: legacyCodes().map((code) => ({ code, label: "", address: "", town: "" })),
  source: null,
  loaded: false,
  error: null,
};
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((notify) => notify());
}

function apply(saved: Saved) {
  rememberLocally(saved.warehouses.map((w) => w.code));
  set({ warehouses: saved.warehouses, source: saved.source, loaded: true, error: null });
}

function load(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      try {
        let saved = await adminRequest<Saved>("GET", PATH);
        // One-time move: ticks saved in this browser before the server kept them
        const local = legacyCodes();
        if (saved.source === "env" && local.length > 0) {
          saved = await adminRequest<Saved>("PUT", PATH, {
            warehouses: local.map((code) => ({ code, label: "", address: "", town: "" })),
          });
        }
        apply(saved);
      } catch (e) {
        set({ loaded: true, error: e instanceof Error ? e.message : String(e) });
        loading = null; // allow a retry
      }
    })();
  }
  return loading;
}

/** Save the shop's warehouses (in this order), with their shopper-facing names and addresses. */
export async function saveShopWarehouses(warehouses: ShopWarehouse[]): Promise<void> {
  apply(await adminRequest<Saved>("PUT", PATH, { warehouses }));
}

const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => listeners.delete(notify);
};

/** Everything about the shop's warehouses, for the Warehouses page. */
export function useShopWarehouses() {
  const snapshot = useSyncExternalStore(subscribe, () => state);
  useEffect(() => {
    void load();
  }, []);
  return {
    ...snapshot,
    save: saveShopWarehouses,
    retry: () => {
      loading = null;
      void load();
    },
  };
}

/** Just the chosen codes, as [codes, save]. Used by the Inventory module. */
export function useSelectedWarehouses(): [string[], (codes: string[]) => Promise<void>] {
  const { warehouses } = useShopWarehouses();
  const codes = useMemo(() => warehouses.map((w) => w.code), [warehouses]);
  const save = (next: string[]) =>
    saveShopWarehouses(next.map((code) => warehouses.find((w) => w.code === code) ?? { code, label: "", address: "", town: "" }));
  return [codes, save];
}

export const WAREHOUSE_MAINTENANCE_PATH = "/maintenance/warehouses";
