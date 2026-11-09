import { useEffect, useState } from "react";
import { api } from "../api/store";
import type { CatalogueItem, Location } from "../types";

// The shop's warehouses (ticked in the admin portal). They change rarely, so they're
// fetched once per page load and shared.
let cache: Promise<Location[]> | null = null;

function load(): Promise<Location[]> {
  if (!cache) {
    cache = api.locations().catch((e) => {
      cache = null; // let the next caller retry
      throw e;
    });
  }
  return cache;
}

export function useLocations(): Location[] {
  const [locations, setLocations] = useState<Location[]>([]);
  useEffect(() => {
    let live = true;
    load().then(
      (l) => live && setLocations(l),
      () => live && setLocations([]),
    );
    return () => {
      live = false;
    };
  }, []);
  return locations;
}

export interface StockAt {
  location: Location;
  /** Whole units only: Sage part-quantities like 0.4 aren't sold. */
  qty: number;
}

/** The item's stock per location, in the shop's order. Falls back to the total for a single location. */
export function stockAt(item: Pick<CatalogueItem, "qtyOnHand" | "stock">, locations: Location[]): StockAt[] {
  if (!locations.length) return [];
  if (!item.stock) return locations.length === 1 ? [{ location: locations[0], qty: Math.floor(item.qtyOnHand) }] : [];
  return locations.map((location) => ({
    location,
    qty: Math.max(0, Math.floor(item.stock!.find((s) => s.warehouse === location.code)?.qty ?? 0)),
  }));
}

/** The branch picker appears once there is a real choice. */
export const PICKER_FROM = 2;
/** From this many branches, cards show one short line instead of a row per branch. */
export const COMPACT_FROM = 4;

/** The shopper's chosen branch, if it is still one of the shop's branches. */
export function myBranchOf(locations: Location[], code: string | null): Location | null {
  return (code && locations.find((l) => l.code === code)) || null;
}

/** Short name for tight spaces: the town if set, else the name without a trailing "Branch". */
export function shortName(l: Location): string {
  return l.town || l.name.replace(/\s+branch$/i, "");
}

/** Branches grouped by town (alphabetical), with branches that have no town last under "Other". */
export function byTown(locations: Location[]): { town: string; branches: Location[] }[] {
  const groups = new Map<string, Location[]>();
  for (const l of locations) {
    const t = l.town?.trim() || "";
    groups.set(t, [...(groups.get(t) ?? []), l]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)))
    .map(([town, branches]) => ({ town: town || "Other", branches: branches.sort((a, b) => a.name.localeCompare(b.name)) }));
}

/**
 * How many of an item the shopper can get: at their chosen branch when the shop has several
 * branches and one is chosen, otherwise the total. `branchy` is true when there are several branches.
 */
export function availableFor(item: Pick<CatalogueItem, "qtyOnHand" | "stock">, locations: Location[], code: string | null) {
  const branchy = locations.length >= PICKER_FROM;
  const mine = branchy ? myBranchOf(locations, code) : null;
  if (!mine) return { mine, branchy, qty: Math.floor(item.qtyOnHand) };
  const at = stockAt(item, locations).find((r) => r.location.code === mine.code);
  return { mine, branchy, qty: at?.qty ?? 0 };
}
