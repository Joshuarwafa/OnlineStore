import { formatCount } from "../../../shared/format";
import { useChartTooltip } from "../../../shared/useChartTooltip";
import type { WarehouseSummary } from "../types";

const segments = [
  { key: "inStock", label: "In stock", className: "seg-good" },
  { key: "zeroStock", label: "Out of stock", className: "seg-warning" },
  { key: "negativeStock", label: "Negative", className: "seg-critical" },
] as const;

// 100% stacked bars: the share of each warehouse's stock lines that are in stock, out of stock
// or negative. Status colours, always with the legend and tooltip naming them.
export function StockHealthChart({ warehouses }: { warehouses: WarehouseSummary[] }) {
  const { ref, show, hide, tooltip } = useChartTooltip();
  const rows = [...warehouses].sort((a, b) => b.inStock / b.lines.length - a.inStock / a.lines.length);

  return (
    <div className="chart" ref={ref}>
      <ul className="legend" aria-label="Legend">
        {segments.map((s) => (
          <li key={s.key}>
            <span className={`swatch ${s.className}`} aria-hidden="true" />
            {s.label}
          </li>
        ))}
      </ul>

      {rows.map((w) => {
        const lines = w.lines.length;
        const inStockPct = Math.round((w.inStock / lines) * 100);
        return (
          <div key={w.code} className="bar-row">
            <span className="bar-label" title={w.name}>
              {w.name}
            </span>
            <span className="bar-track">
              <span className="stack">
                {segments.map((s) => {
                  const count = w[s.key];
                  if (count === 0) return null;
                  return (
                    <span
                      key={s.key}
                      className={`stack-seg ${s.className}`}
                      style={{ flexGrow: count }}
                      onMouseMove={(e) =>
                        show(
                          e,
                          <>
                            <strong>{w.name}</strong>
                            <div>
                              {s.label}: {formatCount(count)} of {formatCount(lines)} lines
                            </div>
                            <div className="muted">{Math.round((count / lines) * 100)}%</div>
                          </>,
                        )
                      }
                      onMouseLeave={hide}
                    />
                  );
                })}
              </span>
              <span className="bar-value fixed">{inStockPct}% in stock</span>
            </span>
          </div>
        );
      })}
      {tooltip}
    </div>
  );
}
