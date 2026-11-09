import { formatQty } from "../../../shared/format";
import { useChartTooltip } from "../../../shared/useChartTooltip";
import type { WarehouseSummary } from "../types";

// Horizontal bars: units on hand per warehouse, largest first. One series, so no legend.
export function UnitsByWarehouseChart({ warehouses }: { warehouses: WarehouseSummary[] }) {
  const { ref, show, hide, tooltip } = useChartTooltip();
  const rows = [...warehouses].sort((a, b) => b.totalUnits - a.totalUnits);
  const max = Math.max(1, ...rows.map((w) => w.totalUnits));
  const total = rows.reduce((sum, w) => sum + Math.max(0, w.totalUnits), 0);

  return (
    <div className="chart" ref={ref}>
      {rows.map((w) => {
        const share = total > 0 ? Math.max(0, w.totalUnits) / total : 0;
        return (
          <div
            key={w.code}
            className="bar-row"
            onMouseMove={(e) =>
              show(
                e,
                <>
                  <strong>{w.name}</strong>
                  <div>{formatQty(w.totalUnits)} units</div>
                  <div className="muted">{Math.round(share * 100)}% of all units</div>
                </>,
              )
            }
            onMouseLeave={hide}
          >
            <span className="bar-label" title={w.name}>
              {w.name}
            </span>
            <span className="bar-track">
              <span className="bar-fill" style={{ width: `${(Math.max(0, w.totalUnits) / max) * 100}%` }} />
              <span className="bar-value">{formatQty(w.totalUnits)}</span>
            </span>
          </div>
        );
      })}
      {tooltip}
    </div>
  );
}
