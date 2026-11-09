// The warehouses the online shop sells from, ticked in the admin portal (Maintenance → Warehouses).
// Kept in data/shop-warehouses.json next to the product pictures, so it survives restarts and
// deployments. Each one can have a friendlier name and an address for shoppers.
//
// Until someone saves a choice in the admin portal, STORE_WAREHOUSE from .env is used.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { config } from "./config.js";
import { HttpError } from "./errors.js";

export interface ShopWarehouseSetting {
  /** Sage warehouse code, e.g. "2" */
  code: string;
  /** Name shoppers see, e.g. "Bulawayo Branch". Empty = the Sage name. */
  label: string;
  /** Address or directions shown on product pages. Optional. */
  address: string;
  /** Town or city, e.g. "Harare". Groups branches in the shop's branch picker. Optional. */
  town: string;
}

export interface ShopWarehouses {
  warehouses: ShopWarehouseSetting[];
  /** "admin" once saved in the admin portal; "env" while falling back to STORE_WAREHOUSE. */
  source: "admin" | "env";
}

const FILE = join(dirname(config.imagesDir), "shop-warehouses.json");
let cached: ShopWarehouses | null = null;
const listeners = new Set<() => void>();

/** Called whenever the choice changes (the catalogue drops its cache). */
export function onShopWarehousesChange(fn: () => void) {
  listeners.add(fn);
}

function fromEnv(): ShopWarehouses {
  return { warehouses: config.warehouse ? [{ code: config.warehouse, label: "", address: "", town: "" }] : [], source: "env" };
}

export async function shopWarehouses(): Promise<ShopWarehouses> {
  if (cached) return cached;
  try {
    const raw = JSON.parse(await readFile(FILE, "utf8"));
    const list = clean(raw?.warehouses);
    cached = list.length ? { warehouses: list, source: "admin" } : fromEnv();
  } catch {
    cached = fromEnv(); // no file yet
  }
  return cached;
}

/** Just the codes, in the saved order. */
export async function shopWarehouseCodes(): Promise<string[]> {
  return (await shopWarehouses()).warehouses.map((w) => w.code);
}

function clean(input: unknown): ShopWarehouseSetting[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: ShopWarehouseSetting[] = [];
  for (const w of input) {
    const code = typeof w?.code === "string" ? w.code.trim() : "";
    if (!code || code.length > 20 || seen.has(code)) continue;
    seen.add(code);
    out.push({
      code,
      label: typeof w?.label === "string" ? w.label.trim().slice(0, 60) : "",
      address: typeof w?.address === "string" ? w.address.trim().slice(0, 160) : "",
      town: typeof w?.town === "string" ? w.town.trim().slice(0, 40) : "",
    });
  }
  return out;
}

export async function saveShopWarehouses(input: unknown): Promise<ShopWarehouses> {
  const list = clean(input);
  if (list.length > 200) throw new HttpError(400, "That's too many warehouses for the shop.");
  await mkdir(dirname(FILE), { recursive: true });
  // Write to a temporary file first, so a crash never leaves a half-written file
  const tmp = `${FILE}.tmp`;
  await writeFile(tmp, JSON.stringify({ warehouses: list, savedAt: new Date().toISOString() }, null, 2));
  await rename(tmp, FILE);
  cached = list.length ? { warehouses: list, source: "admin" } : fromEnv();
  listeners.forEach((fn) => fn());
  console.log(`Shop warehouses saved: ${list.map((w) => w.code).join(", ") || "(none, using STORE_WAREHOUSE)"}`);
  return cached;
}
