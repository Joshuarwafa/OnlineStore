// One row from GET /api/Pastel/WarehouseQTY: an item's quantity in one warehouse.
export interface StockLine {
  item: string;
  itemDescription: string;
  warehouseCode: string;
  warehouseName: string;
  qtyOnHand: number;
}

// An item's stock added up across warehouses.
export interface ItemTotal {
  item: string;
  itemDescription: string;
  qtyOnHand: number;
  warehouses: number;
}

export interface WarehouseSummary {
  code: string;
  name: string;
  /** Route segment for this warehouse. */
  slug: string;
  lines: StockLine[];
  inStock: number;
  zeroStock: number;
  negativeStock: number;
  totalUnits: number;
}
