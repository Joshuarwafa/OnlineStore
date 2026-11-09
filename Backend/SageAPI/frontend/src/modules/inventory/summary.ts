import type { ItemTotal, StockLine, WarehouseSummary } from "./types";

// Totals per item across the given stock lines (an item appears once per warehouse in Sage).
export function summarizeItems(lines: StockLine[]): ItemTotal[] {
  const byItem = new Map<string, ItemTotal>();
  for (const line of lines) {
    const total = byItem.get(line.item);
    if (total) {
      total.qtyOnHand += line.qtyOnHand;
      total.warehouses++;
    } else {
      byItem.set(line.item, {
        item: line.item,
        itemDescription: line.itemDescription,
        qtyOnHand: line.qtyOnHand,
        warehouses: 1,
      });
    }
  }
  return [...byItem.values()];
}

export function summarizeByWarehouse(lines: StockLine[]): WarehouseSummary[] {
  const byCode = new Map<string, WarehouseSummary>();

  for (const line of lines) {
    let summary = byCode.get(line.warehouseCode);
    if (!summary) {
      summary = {
        code: line.warehouseCode,
        name: line.warehouseName || "No warehouse",
        slug: encodeURIComponent(line.warehouseCode),
        lines: [],
        inStock: 0,
        zeroStock: 0,
        negativeStock: 0,
        totalUnits: 0,
      };
      byCode.set(line.warehouseCode, summary);
    }

    summary.lines.push(line);
    summary.totalUnits += line.qtyOnHand;
    if (line.qtyOnHand > 0) summary.inStock++;
    else if (line.qtyOnHand < 0) summary.negativeStock++;
    else summary.zeroStock++;
  }

  return [...byCode.values()];
}
