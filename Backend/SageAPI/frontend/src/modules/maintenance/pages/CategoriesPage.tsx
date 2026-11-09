import { FileSpreadsheet, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { StatusBanner } from "../../../shared/StatusBanner";
import { getCategories, getItems, updateItems, type ItemChange, type StoreCategory, type StoreItem } from "../categories/api";
import { CategoryList, type CategoryFilter } from "../categories/CategoryList";
import { ImportPanel } from "../categories/ImportPanel";
import { ItemTable } from "../categories/ItemTable";

export function CategoriesPage() {
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [items, setItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [importing, setImporting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, i] = await Promise.all([getCategories(), getItems()]);
      setCategories(c);
      setItems(i);
      setLoaded(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Saves a change to some items, then updates them here without re-reading everything from Sage
  const changeItems = async (stockLinks: number[], change: ItemChange) => {
    await updateItems(stockLinks, change);
    const ids = new Set(stockLinks);
    setItems((all) =>
      all.map((i) =>
        ids.has(i.stockLink)
          ? { ...i, categoryId: change.setCategory ? (change.categoryId ?? null) : i.categoryId, isVisible: change.isVisible ?? i.isVisible }
          : i,
      ),
    );
  };

  // A deleted category's items go back to Other
  const onCategoryDeleted = (id: number) => {
    setItems((all) => all.map((i) => (i.categoryId === id ? { ...i, categoryId: null } : i)));
    if (filter === id) setFilter("all");
  };

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Categories</h1>
          <p className="subtitle">Make your categories on the left, then pick a category for each item. Items without one show under "Other".</p>
        </div>
        <div className="page-actions">
          <button type="button" className={`button ${importing ? "primary" : ""}`} onClick={() => setImporting((v) => !v)} disabled={!loaded}>
            <FileSpreadsheet size={15} aria-hidden="true" />
            Import from Excel / CSV
          </button>
          <button type="button" className="button" onClick={() => void reload()} disabled={loading}>
            <RefreshCw size={15} aria-hidden="true" className={loading ? "spin" : undefined} />
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      <StatusBanner loading={loading && !loaded} error={error} onRetry={() => void reload()} loadingText="Loading categories and items…" />

      {loaded && importing && <ImportPanel categories={categories} items={items} onClose={() => setImporting(false)} onSaved={reload} />}

      {loaded && (
        <div className="category-layout">
          <CategoryList
            categories={categories}
            setCategories={setCategories}
            items={items}
            filter={filter}
            onFilter={setFilter}
            onDeleted={onCategoryDeleted}
          />
          <ItemTable categories={categories} items={items} filter={filter} onChange={changeItems} />
        </div>
      )}
    </>
  );
}
