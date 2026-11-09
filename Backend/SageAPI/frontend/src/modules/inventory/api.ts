import { ApiError, apiGet } from "../../api/client";
import type { StockLine } from "./types";

// Fetches stock for every warehouse in one call. The API queues Sage requests one at a time,
// so one large call is faster than one call per warehouse.
export async function fetchInventory(signal?: AbortSignal): Promise<StockLine[]> {
  try {
    return await apiGet<StockLine[]>("/api/Pastel/WarehouseQTY", signal);
  } catch (err) {
    // The API answers 404 when there is simply no stock to report.
    if (err instanceof ApiError && err.status === 404) return [];
    throw err;
  }
}
