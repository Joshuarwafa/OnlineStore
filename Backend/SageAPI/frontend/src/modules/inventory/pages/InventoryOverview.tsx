import {
  Activity,
  ArrowRight,
  CircleCheck,
  PackageX,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "../../../shared/PageHeader";
import { SearchInput } from "../../../shared/SearchInput";
import { SortHeader } from "../../../shared/SortHeader";
import { StatusBanner } from "../../../shared/StatusBanner";
import { formatCount, formatQty } from "../../../shared/format";
import { useSort, type SortAccessors } from "../../../shared/useSort";
import { NoWarehouseSelected } from "../NoWarehouseSelected";
import { StockHealthChart } from "../charts/StockHealthChart";
import { UnitsByWarehouseChart } from "../charts/UnitsByWarehouseChart";
import { summarizeItems } from "../summary";
import type { ItemTotal, WarehouseSummary } from "../types";
import { useSelectedInventory } from "../useInventory";

type Column = "name" | "lines" | "inStock" | "zeroStock" | "negativeStock" | "totalUnits";

const accessors: SortAccessors<WarehouseSummary, Column> = {
  name: (w) => w.name,
  lines: (w) => w.lines.length,
  inStock: (w) => w.inStock,
  zeroStock: (w) => w.zeroStock,
  negativeStock: (w) => w.negativeStock,
  totalUnits: (w) => w.totalUnits,
};

const LIST_SIZE = 8;

export function InventoryOverview() {
  const { warehouses, loadedAt, loading, error, refresh, noSelection } = useSelectedInventory();
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  // ?warehouse=<code> limits the whole dashboard to one warehouse. An unknown code shows all.
  const [params, setParams] = useSearchParams();
  const current = warehouses.find((w) => w.code === params.get("warehouse"));
  const scoped = useMemo(() => (current ? [current] : warehouses), [current, warehouses]);
  const lines = useMemo(() => scoped.flatMap((w) => w.lines), [scoped]);

  const setWarehouse = (code: string) => setParams(code ? { warehouse: code } : {}, { replace: true });

  const stats = useMemo(() => {
    const items = summarizeItems(lines);
    const negativeLines = lines.filter((l) => l.qtyOnHand < 0);
    return {
      units: lines.reduce((sum, l) => sum + l.qtyOnHand, 0),
      items: items.length,
      inStockItems: items.filter((i) => i.qtyOnHand > 0).length,
      outOfStockItems: items.filter((i) => i.qtyOnHand <= 0).length,
      negativeLines: negativeLines.length,
      topItems: [...items].sort((a, b) => b.qtyOnHand - a.qtyOnHand).slice(0, LIST_SIZE),
      lowItems: items
        .filter((i) => i.qtyOnHand > 0)
        .sort((a, b) => a.qtyOnHand - b.qtyOnHand)
        .slice(0, LIST_SIZE),
      worstNegative: negativeLines.sort((a, b) => a.qtyOnHand - b.qtyOnHand).slice(0, LIST_SIZE),
    };
  }, [lines]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((w) => w.name.toLowerCase().includes(q) || w.code.toLowerCase().includes(q));
  }, [scoped, query]);

  const { sorted, sort, toggle } = useSort<WarehouseSummary, Column>(filtered, accessors, {
    key: "totalUnits",
    direction: "desc",
  });

  const topMax = Math.max(1, ...stats.topItems.map((i) => i.qtyOnHand));
  const ready = loadedAt && !noSelection;

  return (
    <>
      <PageHeader
        title="Inventory overview"
        subtitle="Stock on hand in the store's warehouses, straight from Sage."
        loadedAt={loadedAt}
        loading={loading}
        onRefresh={refresh}
      />

      {noSelection ? (
        <NoWarehouseSelected />
      ) : (
        <StatusBanner loading={loading && !loadedAt} error={error} onRetry={refresh} />
      )}

      {ready && (
        <>
          <div className="filter-bar">
            <label className="select-field">
              <Warehouse size={16} aria-hidden="true" />
              <span className="visually-hidden">Warehouse</span>
              <select value={current?.code ?? ""} onChange={(e) => setWarehouse(e.target.value)}>
                <option value="">All warehouses ({warehouses.length})</option>
                {[...warehouses]
                  .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
                  .map((w) => (
                    <option key={w.code} value={w.code}>
                      {w.name} ({w.code})
                    </option>
                  ))}
              </select>
            </label>
            {current && (
              <>
                <button type="button" className="button" onClick={() => setWarehouse("")}>
                  Show all warehouses
                </button>
                <Link to={current.slug} className="button">
                  View all items
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </>
            )}
          </div>

          <section className="dash-top" aria-label="Totals">
            <div className="hero">
              <div className="kpi-label">Units on hand</div>
              <div className="hero-value">{formatQty(stats.units)}</div>
              <div className="muted small">
                {current
                  ? `${formatCount(stats.items)} items in ${current.name}`
                  : `${formatCount(stats.items)} items across ${formatCount(scoped.length)} warehouse${scoped.length === 1 ? "" : "s"}`}
              </div>
            </div>
            <Kpi label="Items in stock" value={formatCount(stats.inStockItems)} status="good" icon={CircleCheck} />
            <Kpi label="Items out of stock" value={formatCount(stats.outOfStockItems)} status="warning" icon={PackageX} />
            <Kpi label="Negative stock lines" value={formatCount(stats.negativeLines)} status="critical" icon={TriangleAlert} />
          </section>

          <section className="dash-grid">
            {current ? (
              // Comparing warehouses means nothing for one warehouse; show what is running low instead.
              <div className="panel card">
                <CardTitle icon={TrendingDown}>Running low</CardTitle>
                <p className="muted small no-margin">In-stock items with the fewest units</p>
                <ItemList items={stats.lowItems} empty="No items in stock." />
              </div>
            ) : (
              <div className="panel card">
                <CardTitle icon={Warehouse}>Units on hand by warehouse</CardTitle>
                <UnitsByWarehouseChart warehouses={scoped} />
              </div>
            )}
            <div className="panel card">
              <CardTitle icon={Activity}>{current ? "Stock health" : "Stock health by warehouse"}</CardTitle>
              <p className="muted small no-margin">
                {current ? "Share of this warehouse's stock lines" : "Share of each warehouse's stock lines"}
              </p>
              <StockHealthChart warehouses={scoped} />
            </div>

            <div className="panel card">
              <CardTitle icon={TrendingUp}>Top items by units on hand</CardTitle>
              <ItemList items={stats.topItems} max={topMax} empty="No items in stock." />
            </div>

            <div className="panel card">
              <CardTitle icon={TriangleAlert}>Needs attention: negative stock</CardTitle>
              {stats.worstNegative.length === 0 ? (
                <p className="muted">
                  {current ? `No negative stock in ${current.name}.` : "No negative stock in the selected warehouses."}
                </p>
              ) : (
                <ol className="rank-list">
                  {stats.worstNegative.map((l) => (
                    <li key={`${l.warehouseCode}-${l.item}`}>
                      <span className="rank-main">
                        <span className="cell-title">{l.itemDescription}</span>
                        <span className="cell-sub">
                          <span className="mono">{l.item}</span> ·{" "}
                          <Link to={encodeURIComponent(l.warehouseCode)}>{l.warehouseName}</Link>
                        </span>
                      </span>
                      <span className="rank-value warn-text">{formatQty(l.qtyOnHand)}</span>
                    </li>
                  ))}
                </ol>
              )}
              {stats.negativeLines > LIST_SIZE && (
                <p className="muted small no-margin">
                  Showing the {LIST_SIZE} largest of {formatCount(stats.negativeLines)}. Open a warehouse below
                  and filter by Negative to see them all.
                </p>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-toolbar">
              <CardTitle icon={Warehouse}>Warehouses</CardTitle>
              <SearchInput placeholder="Search warehouse name or code" value={query} onChange={setQuery} />
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <SortHeader label="Warehouse" column="name" sort={sort} onSort={toggle} />
                    <SortHeader label="Stock lines" column="lines" sort={sort} onSort={toggle} align="right" />
                    <SortHeader label="In stock" column="inStock" sort={sort} onSort={toggle} align="right" />
                    <SortHeader label="Out of stock" column="zeroStock" sort={sort} onSort={toggle} align="right" />
                    <SortHeader label="Negative" column="negativeStock" sort={sort} onSort={toggle} align="right" />
                    <SortHeader label="Units on hand" column="totalUnits" sort={sort} onSort={toggle} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((w) => (
                    <tr
                      key={w.slug}
                      className="clickable"
                      tabIndex={0}
                      onClick={() => navigate(w.slug)}
                      onKeyDown={(e) => e.key === "Enter" && navigate(w.slug)}
                    >
                      <td>
                        <div className="cell-title">{w.name}</div>
                        <div className="cell-sub">Code {w.code}</div>
                      </td>
                      <td className="num">{formatCount(w.lines.length)}</td>
                      <td className="num">{formatCount(w.inStock)}</td>
                      <td className="num muted">{formatCount(w.zeroStock)}</td>
                      <td className={`num ${w.negativeStock > 0 ? "warn-text" : "muted"}`}>
                        {formatCount(w.negativeStock)}
                      </td>
                      <td className="num">
                        <strong>{formatQty(w.totalUnits)}</strong>
                      </td>
                    </tr>
                  ))}
                  {sorted.length === 0 && (
                    <tr>
                      <td colSpan={6} className="empty">
                        No warehouses match “{query}”.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}

interface KpiProps {
  label: string;
  value: string;
  status: "good" | "warning" | "critical";
  icon: LucideIcon;
}

function Kpi({ label, value, status, icon: Icon }: KpiProps) {
  return (
    <div className="kpi">
      <div className="kpi-label">
        <span className={`kpi-icon status-${status}`} aria-hidden="true">
          <Icon size={16} />
        </span>
        {label}
      </div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}

function CardTitle({ icon: Icon, children }: { icon: LucideIcon; children: string }) {
  return (
    <h2 className="card-title">
      <Icon size={17} aria-hidden="true" />
      {children}
    </h2>
  );
}

// Ranked items; with `max`, each row also gets a bar scaled to it.
function ItemList({ items, max, empty }: { items: ItemTotal[]; max?: number; empty: string }) {
  if (items.length === 0) return <p className="muted">{empty}</p>;
  return (
    <ol className="rank-list">
      {items.map((i) => (
        <li key={i.item}>
          <span className="rank-main">
            <span className="cell-title">{i.itemDescription}</span>
            <span className="cell-sub mono">{i.item}</span>
          </span>
          {max !== undefined && (
            <span className="rank-bar" aria-hidden="true">
              <span style={{ width: `${(i.qtyOnHand / max) * 100}%` }} />
            </span>
          )}
          <span className="rank-value">{formatQty(i.qtyOnHand)}</span>
        </li>
      ))}
    </ol>
  );
}
