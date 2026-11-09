// Live catalogue from Sage, via SageAPI.
// The full list is cached in memory and refreshed every few minutes (Sage can be slow and holds
// thousands of items); a single product and checkout prices/stock are always read live.

import { config } from "./config.js";
import { HttpError } from "./errors.js";
import { mainThumbUrl, picturesOf } from "./images.js";
import { sageApi } from "./sageApi.js";
import { OTHER, storeLayout } from "./storeLayout.js";
import { onShopWarehousesChange, shopWarehouseCodes, shopWarehouses } from "./shopWarehouses.js";

/** Stock of one item in one of the shop's warehouses. */
export interface LocationStock {
  /** Sage warehouse code */
  warehouse: string;
  qty: number;
}

export interface CatalogueItem {
  code: string;
  description: string;
  priceIncl: number | null;
  priceExcl: number | null;
  /** Total across the shop's warehouses. */
  qtyOnHand: number;
  /** Per warehouse, in the order the shop's warehouses were chosen. */
  stock: LocationStock[];
  category: string | null;
  imageUrl: string | null;
}

interface InventoryRow {
  item: string;
  itemDescription: string;
  warehouseCode: string;
  warehouseName: string;
  qtyOnHand: number;
  /** Held for open sales orders; the shop sells only what is on hand and not reserved. */
  qtyReserved?: number;
}

/** Stock the shop can sell: on hand, less what open sales orders have reserved. */
const free = (r: InventoryRow) => Math.max(0, (r.qtyOnHand ?? 0) - (r.qtyReserved ?? 0));

interface PriceRow {
  itemCode: string;
  priceListName: string;
  exclPrice: number | null;
  inclPrice: number | null;
}

interface ItemPrices {
  itemCode: string;
  itemDescription: string;
  prices: { priceListName: string; exclPrice: number | null; inclPrice: number | null }[];
}

let cache: { items: CatalogueItem[]; refreshedAt: string } | null = null;
let loading: Promise<void> | null = null;
/** Sage names of warehouses seen in stock, e.g. "2" → "Bulawayo Store". */
const sageWarehouseNames = new Map<string, string>();

// A new warehouse choice in the admin portal means re-reading stock straight away
onShopWarehousesChange(() => {
  cache = null;
});

const qs = (params: Record<string, string>) => {
  const sp = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== ""));
  const s = sp.toString();
  return s ? `?${s}` : "";
};

async function load(): Promise<void> {
  const codes = await shopWarehouseCodes();
  const [inventory, prices] = await Promise.all([
    // One warehouse: ask Sage for just that one. Several: read all rows and keep the shop's.
    sageApi<InventoryRow[]>("GET", `/WarehouseQTY${qs({ warehouse: codes.length === 1 ? codes[0] : "" })}`),
    sageApi<PriceRow[]>("GET", `/inventory/pricelist${qs({ priceList: config.priceList })}`),
  ]);
  const wanted = new Set(codes);
  const order = (w: string) => codes.indexOf(w);

  const priceByCode = new Map<string, PriceRow>();
  for (const p of prices ?? []) if (p.priceListName === config.priceList && !priceByCode.has(p.itemCode)) priceByCode.set(p.itemCode, p);

  // One entry per item, with its stock in each of the shop's warehouses and the total
  const byCode = new Map<string, CatalogueItem>();
  for (const r of inventory ?? []) {
    if (!r.item) continue;
    if (wanted.size && !wanted.has(r.warehouseCode)) continue; // vans, returns, expired goods...
    if (r.warehouseCode && r.warehouseName) sageWarehouseNames.set(r.warehouseCode, r.warehouseName.trim());
    const here = { warehouse: r.warehouseCode, qty: free(r) };
    const existing = byCode.get(r.item);
    if (existing) {
      existing.qtyOnHand += here.qty;
      existing.stock.push(here);
      existing.stock.sort((a, b) => order(a.warehouse) - order(b.warehouse));
      continue;
    }
    const price = priceByCode.get(r.item);
    byCode.set(r.item, {
      code: r.item,
      description: (r.itemDescription || r.item).trim(),
      priceIncl: price?.inclPrice ?? null,
      priceExcl: price?.exclPrice ?? null,
      qtyOnHand: here.qty,
      stock: [here],
      category: null, // filled in per request from the store layout
      imageUrl: null, // filled in per request, so a new picture shows without waiting for the refresh
    });
  }

  cache = { items: [...byCode.values()], refreshedAt: new Date().toISOString() };
  console.log(`Catalogue refreshed: ${cache.items.length} items, warehouses ${codes.join(", ") || "(all)"}, price list ${config.priceList}`);
}

/**
 * The shop's warehouses as shoppers see them: the name set in the admin portal (or Sage's name)
 * and the address, in the chosen order.
 */
export async function shopLocations() {
  const { warehouses } = await shopWarehouses();
  if (warehouses.some((w) => !w.label && !sageWarehouseNames.has(w.code))) await catalogue().catch(() => undefined);
  return warehouses.map((w) => ({
    code: w.code,
    name: w.label || sageWarehouseNames.get(w.code) || `Warehouse ${w.code}`,
    address: w.address || null,
    town: w.town || null,
  }));
}

/** Cached catalogue; loads on first use and refreshes in the background when stale. */
export async function catalogue() {
  const stale = !cache || Date.now() - Date.parse(cache.refreshedAt) > config.catalogueRefreshMinutes * 60_000;
  if (stale && !loading) {
    loading = load().finally(() => {
      loading = null;
    });
  }
  if (!cache) await loading; // first request waits; later ones get the previous copy while refreshing
  if (!cache) throw new HttpError(502, "The catalogue couldn't be loaded from Sage.");
  return cache;
}

export interface CatalogueQuery {
  search?: string;
  /** Category slug, or "other" for items with no category. */
  category?: string;
  page: number;
  pageSize: number;
  inStock: boolean;
  /** Only items with an uploaded photo (used by the shop's Featured banner). */
  withPhoto?: boolean;
  /** Only items with at least one whole unit at this branch (warehouse code). */
  branch?: string;
  sort: string;
}

export async function queryCatalogue(q: CatalogueQuery) {
  const [{ items, refreshedAt }, layout] = await Promise.all([catalogue(), storeLayout()]);
  const term = q.search?.trim().toLowerCase();
  let rows = shopItems(items, layout).filter(
    (i) =>
      (!term || i.code.toLowerCase().includes(term) || i.description.toLowerCase().includes(term)) &&
      (!q.inStock || Math.floor(i.qtyOnHand) >= 1) &&
      (!q.withPhoto || mainThumbUrl(i.code) !== null) &&
      (!q.branch || i.stock.some((s) => s.warehouse === q.branch && Math.floor(s.qty) >= 1)) &&
      (!q.category || (q.category === OTHER ? i.category === null : i.category === q.category)),
  );
  rows = [...rows].sort((a, b) => {
    switch (q.sort) {
      case "price_asc":
        return (a.priceIncl ?? Infinity) - (b.priceIncl ?? Infinity);
      case "price_desc":
        return (b.priceIncl ?? -Infinity) - (a.priceIncl ?? -Infinity);
      case "stock":
        return b.qtyOnHand - a.qtyOnHand;
      default:
        return a.description.localeCompare(b.description);
    }
  });
  const start = (q.page - 1) * q.pageSize;
  return {
    items: rows.slice(start, start + q.pageSize).map((i) => ({ ...i, imageUrl: mainThumbUrl(i.code) })),
    page: q.page,
    pageSize: q.pageSize,
    total: rows.length,
    priceList: config.priceList,
    currency: config.currency,
    refreshedAt,
  };
}

/** Items the shop shows, each with its category slug (hidden items left out). */
function shopItems(items: CatalogueItem[], layout: Awaited<ReturnType<typeof storeLayout>>): CatalogueItem[] {
  const out: CatalogueItem[] = [];
  for (const i of items) {
    const code = i.code.toLowerCase();
    if (!layout.hidden.has(code)) out.push({ ...i, category: layout.categoryOf.get(code) ?? null });
  }
  return out;
}

/** Visible categories with how many items each holds; "Other" last when some items have no category. */
export async function shopCategories() {
  const [{ items }, layout] = await Promise.all([catalogue(), storeLayout()]);
  const counts = new Map<string | null, number>();
  for (const i of shopItems(items, layout)) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
  const categories = layout.categories
    .map((c) => ({ code: c.code, name: c.name, count: counts.get(c.code) ?? 0, imageUrl: null }))
    .filter((c) => c.count > 0);
  if (categories.length > 0 && counts.get(null)) categories.push({ code: OTHER, name: "Other", count: counts.get(null)!, imageUrl: null });
  return categories;
}

/** One item, read live from Sage: stock in each of the shop's warehouses, price from the store's price list. */
export async function liveProduct(code: string) {
  const enc = encodeURIComponent(code);
  const codes = await shopWarehouseCodes();
  // Sage answers one warehouse per call, so ask once per shop warehouse (404 there = none in that one)
  const perWarehouse = (codes.length ? codes : [""]).map((w) =>
    sageApi<InventoryRow>("GET", `/WarehouseQTY/${enc}${qs({ warehouse: w })}`).catch((e) => {
      if (e instanceof HttpError && e.status === 404) return null;
      throw e;
    }),
  );
  const [rows, prices] = await Promise.all([
    Promise.all(perWarehouse),
    sageApi<ItemPrices>("GET", `/inventory/pricelist/${enc}`).catch((e) => {
      if (e instanceof HttpError && e.status === 404) return undefined; // item has no prices
      throw e;
    }),
  ]);
  const found = rows.filter((r): r is InventoryRow => r !== null);
  if (found.length === 0) throw new HttpError(404, `Item '${code}' isn't sold in the online store.`);
  const stock = found[0];
  for (const r of found) if (r.warehouseCode && r.warehouseName) sageWarehouseNames.set(r.warehouseCode, r.warehouseName.trim());
  const byWarehouse: LocationStock[] = codes.length
    ? codes.map((w, n) => ({ warehouse: w, qty: rows[n] ? free(rows[n]) : 0 }))
    : found.map((r) => ({ warehouse: r.warehouseCode, qty: free(r) }));
  const layout = await storeLayout();
  if (layout.hidden.has(stock.item.toLowerCase())) throw new HttpError(404, `Item '${code}' isn't sold in the online store.`);
  const price = prices?.prices.find((p) => p.priceListName === config.priceList);
  return {
    code: stock.item,
    description: (stock.itemDescription || stock.item).trim(),
    priceIncl: price?.inclPrice ?? null,
    priceExcl: price?.exclPrice ?? null,
    qtyOnHand: byWarehouse.reduce((sum, s) => sum + s.qty, 0),
    stock: byWarehouse,
    category: layout.categoryOf.get(stock.item.toLowerCase()) ?? null,
    imageUrl: mainThumbUrl(stock.item),
    images: picturesOf(stock.item).map(({ id, url, width, height }) => ({ id, url, width, height })),
    warehouseCode: stock.warehouseCode || null,
    warehouseName: stock.warehouseName || null,
    checkedAt: new Date().toISOString(),
    currency: config.currency,
  };
}
