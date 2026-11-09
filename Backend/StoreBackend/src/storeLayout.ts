// How the shop is arranged: the store categories and which items are in them or hidden,
// as set in the admin portal (kept by SageAPI in the store database).
// Cached for a minute so admin changes show in the shop quickly without reloading Sage stock.

import { sageApi } from "./sageApi.js";

interface CategoryRow {
  categoryId: number;
  name: string;
  isVisible: boolean;
}

interface ItemRow {
  itemCode: string;
  categoryId: number | null;
  isVisible: boolean;
}

export interface ShopCategory {
  /** URL slug, e.g. "cold-drinks". */
  code: string;
  name: string;
}

/** Slug for items that have no category. */
export const OTHER = "other";

interface Layout {
  /** Visible categories, in name order. */
  categories: ShopCategory[];
  /** Lower-cased item code → category slug, for items in a visible category. */
  categoryOf: Map<string, string>;
  /** Lower-cased codes of items hidden from the shop (unticked, or in a hidden category). */
  hidden: Set<string>;
  loadedAt: number;
}

const MAX_AGE_MS = 60_000;
let layout: Layout | null = null;
let loading: Promise<void> | null = null;

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "category"
  );
}

async function load(): Promise<void> {
  const [categories, items] = await Promise.all([
    sageApi<CategoryRow[]>("GET", "/store/categories"),
    sageApi<ItemRow[]>("GET", "/store/items"),
  ]);

  // Slugs come from names; "Other" and clashes get the id added so every slug is unique
  const slugById = new Map<number, string>();
  const used = new Set([OTHER]);
  const visible: ShopCategory[] = [];
  for (const c of [...(categories ?? [])].sort((a, b) => a.name.localeCompare(b.name))) {
    let slug = slugify(c.name);
    if (used.has(slug)) slug = `${slug}-${c.categoryId}`;
    used.add(slug);
    if (!c.isVisible) continue;
    slugById.set(c.categoryId, slug);
    visible.push({ code: slug, name: c.name });
  }
  const hiddenCategories = new Set((categories ?? []).filter((c) => !c.isVisible).map((c) => c.categoryId));

  const categoryOf = new Map<string, string>();
  const hidden = new Set<string>();
  for (const i of items ?? []) {
    const code = i.itemCode.toLowerCase();
    if (!i.isVisible || (i.categoryId != null && hiddenCategories.has(i.categoryId))) hidden.add(code);
    else if (i.categoryId != null && slugById.has(i.categoryId)) categoryOf.set(code, slugById.get(i.categoryId)!);
  }

  layout = { categories: visible, categoryOf, hidden, loadedAt: Date.now() };
}

/**
 * The current layout. Refreshes in the background when older than a minute. If the store
 * database can't be read, the shop keeps the last layout it had, or shows everything uncategorised.
 */
export async function storeLayout(): Promise<Layout> {
  if ((!layout || Date.now() - layout.loadedAt > MAX_AGE_MS) && !loading) {
    loading = load()
      .catch((e) => console.error(`Store categories couldn't be loaded: ${e instanceof Error ? e.message : e}`))
      .finally(() => {
        loading = null;
      });
  }
  if (!layout) await loading;
  return layout ?? { categories: [], categoryOf: new Map(), hidden: new Set(), loadedAt: 0 };
}
