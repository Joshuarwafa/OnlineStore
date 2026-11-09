import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "../../../shared/PageHeader";
import { SearchInput } from "../../../shared/SearchInput";
import { SortHeader } from "../../../shared/SortHeader";
import { StatusBanner } from "../../../shared/StatusBanner";
import { formatCount, formatQty } from "../../../shared/format";
import { useSort, type SortAccessors } from "../../../shared/useSort";
import type { StockLine } from "../types";
import { NoWarehouseSelected } from "../NoWarehouseSelected";
import { useSelectedInventory } from "../useInventory";

type Column = "item" | "itemDescription" | "qtyOnHand";
type StockFilter = "all" | "inStock" | "zero" | "negative";

const accessors: SortAccessors<StockLine, Column> = {
  item: (l) => l.item,
  itemDescription: (l) => l.itemDescription,
  qtyOnHand: (l) => l.qtyOnHand,
};

const filters: { id: StockFilter; label: string; test: (qty: number) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "inStock", label: "In stock", test: (q) => q > 0 },
  { id: "zero", label: "Zero", test: (q) => q === 0 },
  { id: "negative", label: "Negative", test: (q) => q < 0 },
];

export function WarehouseStock() {
  const { code = "" } = useParams();
  const { warehouses, loadedAt, loading, error, refresh, noSelection } = useSelectedInventory();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StockFilter>("all");

  const warehouse = warehouses.find((w) => w.code === code);
  const lines = warehouse?.lines ?? [];

  const counts = useMemo(
    () => Object.fromEntries(filters.map((f) => [f.id, lines.filter((l) => f.test(l.qtyOnHand)).length])),
    [lines],
  ) as Record<StockFilter, number>;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const test = filters.find((f) => f.id === filter)!.test;
    return lines.filter(
      (l) =>
        test(l.qtyOnHand) &&
        (!q || l.item.toLowerCase().includes(q) || l.itemDescription.toLowerCase().includes(q)),
    );
  }, [lines, query, filter]);

  const { sorted, sort, toggle } = useSort<StockLine, Column>(filtered, accessors, { key: "qtyOnHand", direction: "desc" });
  const filteredUnits = filtered.reduce((sum, l) => sum + l.qtyOnHand, 0);

  return (
    <>
      <Link to=".." relative="path" className="back-link">
        <ArrowLeft size={15} aria-hidden="true" />
        All warehouses
      </Link>
      <PageHeader
        title={warehouse?.name ?? (loadedAt ? "Warehouse not found" : "Loading warehouse…")}
        subtitle={warehouse ? `Warehouse code ${warehouse.code}` : undefined}
        loadedAt={loadedAt}
        loading={loading}
        onRefresh={refresh}
      />

      {noSelection ? (
        <NoWarehouseSelected />
      ) : (
        <StatusBanner loading={loading && !loadedAt} error={error} onRetry={refresh} />
      )}

      {loadedAt && !warehouse && !error && !noSelection && (
        <div className="banner">
          Warehouse “{code}” isn't one of the store's warehouses, or has no stock.{" "}
          <Link to="..">Back to the overview</Link>
        </div>
      )}

      {warehouse && (
        <section className="panel">
          <div className="panel-toolbar">
            <div className="chips" role="group" aria-label="Filter by stock level">
              {filters.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`chip ${filter === f.id ? "active" : ""} ${f.id === "negative" && counts.negative > 0 ? "warn" : ""}`}
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label} <span className="chip-count">{formatCount(counts[f.id])}</span>
                </button>
              ))}
            </div>
            <SearchInput placeholder="Search item code or description" value={query} onChange={setQuery} />
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <SortHeader label="Item code" column="item" sort={sort} onSort={toggle} />
                  <SortHeader label="Description" column="itemDescription" sort={sort} onSort={toggle} />
                  <SortHeader label="Qty on hand" column="qtyOnHand" sort={sort} onSort={toggle} align="right" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((l) => (
                  <tr key={l.item}>
                    <td className="mono">{l.item}</td>
                    <td>{l.itemDescription}</td>
                    <td className={`num ${l.qtyOnHand < 0 ? "warn-text" : l.qtyOnHand === 0 ? "muted" : ""}`}>
                      {formatQty(l.qtyOnHand)}
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={3} className="empty">
                      No items match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
              {sorted.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={2}>{formatCount(sorted.length)} items shown</td>
                    <td className="num">{formatQty(filteredUnits)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      )}
    </>
  );
}
