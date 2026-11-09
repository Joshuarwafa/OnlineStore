import { useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";

export interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

// Pass a module-level constant so the sorted rows are only recomputed when rows or sort change.
export type SortAccessors<T, K extends string> = Record<K, (row: T) => string | number>;

// Sorts rows by the active column. Clicking the active column flips the direction; clicking a new
// column starts numbers high-to-low and text A-to-Z.
export function useSort<T, K extends string>(rows: T[], accessors: SortAccessors<T, K>, initial: SortState<K>) {
  const [sort, setSort] = useState(initial);

  const sorted = useMemo(() => {
    const get = accessors[sort.key];
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      const result =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), undefined, { numeric: true });
      return result * factor;
    });
  }, [rows, sort, accessors]);

  const toggle = (key: K) =>
    setSort((current) => {
      if (current.key === key) return { key, direction: current.direction === "asc" ? "desc" : "asc" };
      const numeric = rows.length > 0 && typeof accessors[key](rows[0]) === "number";
      return { key, direction: numeric ? "desc" : "asc" };
    });

  return { sorted, sort, toggle };
}
