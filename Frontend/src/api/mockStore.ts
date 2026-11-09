// Mock "store database": categories created in the admin area and the photos attached to
// each product. Sage knows nothing about either; both belong to the store backend.

import type { CatalogueItem, Category, ProductImage, StoreCategory } from "../types";
import { GROUPS, catalogue, type MockItem } from "./mockData";
import { mediaUrl } from "./mockMedia";

interface StoredPhoto {
  id: string;
  width: number;
  height: number;
}

export interface StoredCategory extends Omit<StoreCategory, "imageUrl" | "count"> {
  imageId: string | null;
}

interface State {
  categories: StoredCategory[];
  photos: Record<string, StoredPhoto[]>;
}

const KEY = "mock.store.v1";

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// First run: one category per Sage item group, so the shop isn't empty
function seed(): State {
  return {
    categories: Object.entries(GROUPS).map(([code, name], i) => ({
      id: `cat-${code.toLowerCase()}`,
      slug: slugify(name),
      name,
      description: "",
      imageId: null,
      sortOrder: i,
      visible: true,
      itemGroups: [code],
      itemCodes: [],
    })),
    photos: {},
  };
}

let state: State = load();

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch {
    /* fall through to seed */
  }
  return seed();
}

export function getState(): State {
  return state;
}

export function save(next: State) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: changes last for this page load */
  }
}

export { slugify };

export function inCategory(item: MockItem, c: StoredCategory): boolean {
  return (item.group !== null && c.itemGroups.includes(item.group)) || c.itemCodes.some((x) => x.toLowerCase() === item.code.toLowerCase());
}

export function sortedCategories(): StoredCategory[] {
  return [...state.categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** The visible category an item is shown under (first by sort order). */
export function primaryCategory(item: MockItem): StoredCategory | undefined {
  return sortedCategories().find((c) => c.visible && inCategory(item, c));
}

export function countIn(c: StoredCategory): number {
  return catalogue.filter((i) => inCategory(i, c)).length;
}

export function photosOf(code: string): StoredPhoto[] {
  return state.photos[code] ?? [];
}

export async function productImages(code: string): Promise<ProductImage[]> {
  const out: ProductImage[] = [];
  for (const p of photosOf(code)) {
    const url = await mediaUrl(p.id);
    if (url) out.push({ id: p.id, url, width: p.width, height: p.height });
  }
  return out;
}

export async function mainImageUrl(code: string): Promise<string | null> {
  const first = photosOf(code)[0];
  return first ? mediaUrl(first.id) : null;
}

export async function toPublic(item: MockItem): Promise<CatalogueItem> {
  const { group: _g, ...rest } = item;
  return { ...rest, category: primaryCategory(item)?.slug ?? null, imageUrl: await mainImageUrl(item.code) };
}

export async function publicCategories(): Promise<Category[]> {
  const out: Category[] = [];
  for (const c of sortedCategories()) {
    if (!c.visible) continue;
    out.push({ code: c.slug, name: c.name, count: countIn(c), imageUrl: c.imageId ? await mediaUrl(c.imageId) : null });
  }
  return out;
}

export function categoryBySlug(slug: string): StoredCategory | undefined {
  return state.categories.find((c) => c.slug === slug);
}
