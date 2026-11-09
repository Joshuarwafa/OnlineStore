import { adminRequest } from "../../../api/admin";

/** Categories are one flat list; each item is in at most one. */
export interface StoreCategory {
  categoryId: number;
  name: string;
  isVisible: boolean;
  itemCount: number;
}

/** An active Sage item. categoryId null = shown under "Other". */
export interface StoreItem {
  stockLink: number;
  itemCode: string;
  description: string;
  sageGroup: string | null;
  categoryId: number | null;
  isVisible: boolean;
}

export interface ImportRow {
  row: number;
  itemCode?: string;
  category?: string;
  show?: string;
}

export interface ImportResult {
  applied: boolean;
  rowsRead: number;
  itemsMatched: number;
  categoryChanges: number;
  visibilityChanges: number;
  unchanged: number;
  newCategories: string[];
  errors: { row: number; message: string }[];
}

/** setCategory false leaves categories as they are; isVisible undefined leaves visibility. */
export interface ItemChange {
  setCategory: boolean;
  categoryId?: number | null;
  isVisible?: boolean;
}

export const getCategories = () => adminRequest<StoreCategory[]>("GET", "/store/categories");
export const createCategory = (name: string) => adminRequest<StoreCategory>("POST", "/store/categories", { name });
export const updateCategory = (id: number, update: { name: string; isVisible: boolean }) =>
  adminRequest<StoreCategory>("PUT", `/store/categories/${id}`, update);
export const deleteCategory = (id: number) => adminRequest<void>("DELETE", `/store/categories/${id}`);

export const getItems = () => adminRequest<StoreItem[]>("GET", "/store/items");
export const updateItems = (stockLinks: number[], change: ItemChange) =>
  adminRequest<{ updated: number }>("PUT", "/store/items", { stockLinks, ...change });

export const previewImport = (rows: ImportRow[]) => adminRequest<ImportResult>("POST", "/store/categories/import/preview", { rows });
export const applyImport = (rows: ImportRow[]) => adminRequest<ImportResult>("POST", "/store/categories/import/apply", { rows });
