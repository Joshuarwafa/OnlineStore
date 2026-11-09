import { FolderInput, LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { SearchInput } from "../../../shared/SearchInput";
import { formatCount } from "../../../shared/format";
import type { ItemChange, StoreCategory, StoreItem } from "./api";
import type { CategoryFilter } from "./CategoryList";

const OTHER = "other";
const MAX_ROWS = 1000;

interface Props {
  categories: StoreCategory[];
  items: StoreItem[];
  filter: CategoryFilter;
  onChange: (stockLinks: number[], change: ItemChange) => Promise<void>;
}

export function ItemTable({ categories, items, filter, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        (filter === "all" || (filter === "other" ? i.categoryId == null : i.categoryId === filter)) &&
        (!q || i.itemCode.toLowerCase().includes(q) || i.description.toLowerCase().includes(q) || (i.sageGroup ?? "").toLowerCase().includes(q)),
    );
  }, [items, query, filter]);

  const shown = filtered.slice(0, MAX_ROWS);
  const allShownSelected = shown.length > 0 && shown.every((i) => selected.has(i.stockLink));
  const title = filter === "all" ? "All items" : filter === "other" ? "Other (no category)" : (categories.find((c) => c.categoryId === filter)?.name ?? "");

  const toggle = (stockLink: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(stockLink)) next.delete(stockLink);
      else next.add(stockLink);
      return next;
    });

  const toggleAll = () => setSelected(allShownSelected ? new Set() : new Set(shown.map((i) => i.stockLink)));

  const save = async (stockLinks: number[], change: ItemChange, done?: string) => {
    setSaving((s) => new Set([...s, ...stockLinks]));
    setError(null);
    setNotice(null);
    try {
      await onChange(stockLinks, change);
      if (done) setNotice(done);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving((s) => new Set([...s].filter((id) => !stockLinks.includes(id))));
    }
  };

  const moveSelected = async () => {
    const stockLinks = [...selected];
    const name = target === OTHER ? "Other" : categories.find((c) => c.categoryId === Number(target))?.name;
    await save(stockLinks, { setCategory: true, categoryId: target === OTHER ? null : Number(target) }, `${formatCount(stockLinks.length)} item${stockLinks.length === 1 ? "" : "s"} moved to ${name}.`);
    setSelected(new Set());
    setTarget("");
  };

  return (
    <section className="panel">
      <div className="panel-toolbar">
        <h2 className="card-title no-margin">{title}</h2>
        <SearchInput placeholder="Search code, description or Sage group" value={query} onChange={setQuery} />
      </div>

      {selected.size > 0 && (
        <div className="bulk-bar">
          <strong>{formatCount(selected.size)} ticked</strong>
          <select className="plain-select" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Move ticked items to">
            <option value="">Move to category…</option>
            {categories.map((c) => (
              <option key={c.categoryId} value={c.categoryId}>
                {c.name}
              </option>
            ))}
            <option value={OTHER}>Other (no category)</option>
          </select>
          <button type="button" className="button primary" disabled={saving.size > 0 || target === ""} onClick={() => void moveSelected()}>
            {saving.size > 0 ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <FolderInput size={15} aria-hidden="true" />}
            Move
          </button>
          <button type="button" className="button link-button" onClick={() => setSelected(new Set())}>
            Untick all
          </button>
        </div>
      )}

      {(error || notice) && (
        <div className={`banner inset ${error ? "error" : ""}`} role={error ? "alert" : "status"}>
          <span className="banner-text">{error ?? notice}</span>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="check-col">
                <input type="checkbox" checked={allShownSelected} onChange={toggleAll} aria-label="Tick all items shown" />
              </th>
              <th>Item code</th>
              <th>Description</th>
              <th>Sage group</th>
              <th>Category</th>
              <th>In store</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((i) => {
              const busy = saving.has(i.stockLink);
              return (
                <tr key={i.stockLink} className={selected.has(i.stockLink) ? "selected-row" : undefined}>
                  <td className="check-col">
                    <input type="checkbox" checked={selected.has(i.stockLink)} onChange={() => toggle(i.stockLink)} aria-label={`Tick ${i.itemCode}`} />
                  </td>
                  <td className="mono">{i.itemCode}</td>
                  <td>{i.description}</td>
                  <td className="muted small">{i.sageGroup ?? "—"}</td>
                  <td>
                    <select
                      className="plain-select row-select"
                      value={i.categoryId ?? OTHER}
                      disabled={busy}
                      onChange={(e) => void save([i.stockLink], { setCategory: true, categoryId: e.target.value === OTHER ? null : Number(e.target.value) })}
                      aria-label={`Category for ${i.itemCode}`}
                    >
                      <option value={OTHER}>Other</option>
                      {categories.map((c) => (
                        <option key={c.categoryId} value={c.categoryId}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <label className="inline-check">
                      <input
                        type="checkbox"
                        checked={i.isVisible}
                        disabled={busy}
                        onChange={(e) => void save([i.stockLink], { setCategory: false, isVisible: e.target.checked })}
                        aria-label={`Show ${i.itemCode} in the store`}
                      />
                      <span className={`small ${i.isVisible ? "" : "muted"}`}>{i.isVisible ? "Shown" : "Hidden"}</span>
                    </label>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  {query ? "No items match your search." : "No items here yet. Pick this category for items in the Category column."}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6}>
                {filtered.length > MAX_ROWS
                  ? `Showing the first ${formatCount(MAX_ROWS)} of ${formatCount(filtered.length)} items. Search to narrow it down.`
                  : `${formatCount(filtered.length)} item${filtered.length === 1 ? "" : "s"}`}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
