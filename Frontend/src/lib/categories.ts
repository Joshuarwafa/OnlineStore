import { useEffect, useState } from "react";
import { api } from "../api/store";
import type { Category } from "../types";

// Categories change rarely, so they are fetched once per page load and shared.
let cache: Promise<Category[]> | null = null;

function load(): Promise<Category[]> {
  if (!cache) {
    cache = api.categories().catch((e) => {
      cache = null; // let the next caller retry
      throw e;
    });
  }
  return cache;
}

/** Drop the cached list (after categories are edited in the admin area). */
export function refreshCategories() {
  cache = null;
}

export function useCategories(): Category[] {
  return useCategoriesState().categories;
}

/** Categories plus whether they're still loading (so "none yet" isn't shown as a loading skeleton). */
export function useCategoriesState(): { categories: Category[]; loading: boolean } {
  const [state, setState] = useState<{ categories: Category[]; loading: boolean }>({ categories: [], loading: true });
  useEffect(() => {
    let live = true;
    load().then(
      (c) => live && setState({ categories: c, loading: false }),
      () => live && setState({ categories: [], loading: false }),
    );
    return () => {
      live = false;
    };
  }, []);
  return state;
}

export function categoryName(cats: Category[], code: string | null | undefined): string | undefined {
  return code ? cats.find((c) => c.code === code)?.name : undefined;
}
