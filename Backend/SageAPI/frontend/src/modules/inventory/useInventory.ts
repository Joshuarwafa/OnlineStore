import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelectedWarehouses } from "../maintenance/warehouseSettings";
import { fetchInventory } from "./api";
import { summarizeByWarehouse } from "./summary";
import type { StockLine } from "./types";

interface Snapshot {
  lines: StockLine[];
  loadedAt: Date;
}

// Shared across inventory pages so moving between the overview and a warehouse doesn't refetch.
// Use refresh() to pull fresh numbers from Sage.
let cache: Snapshot | null = null;
let inflight: Promise<Snapshot> | null = null;

function load(force: boolean): Promise<Snapshot> {
  if (cache && !force) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetchInventory()
      .then((lines) => (cache = { lines, loadedAt: new Date() }))
      .finally(() => (inflight = null));
  }
  return inflight;
}

export function useInventory() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(cache);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback((force: boolean) => {
    let active = true;
    setLoading(true);
    setError(null);
    load(force)
      .then((result) => active && setSnapshot(result))
      .catch((err: Error) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => run(false), [run]);

  const warehouses = useMemo(() => summarizeByWarehouse(snapshot?.lines ?? []), [snapshot]);

  return {
    lines: snapshot?.lines ?? [],
    warehouses,
    loadedAt: snapshot?.loadedAt ?? null,
    loading,
    error,
    refresh: () => run(true),
  };
}

// Inventory limited to the warehouses chosen under Maintenance → Warehouses.
// noSelection is true when none are chosen yet; pages must not show stock in that case.
export function useSelectedInventory() {
  const inventory = useInventory();
  const [selected] = useSelectedWarehouses();

  const warehouses = useMemo(
    () => inventory.warehouses.filter((w) => w.code !== "" && selected.includes(w.code)),
    [inventory.warehouses, selected],
  );
  const lines = useMemo(() => warehouses.flatMap((w) => w.lines), [warehouses]);

  return { ...inventory, warehouses, lines, noSelection: selected.length === 0 };
}
