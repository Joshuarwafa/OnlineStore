import { TriangleAlert, Warehouse } from "lucide-react";
import { Link } from "react-router-dom";
import { WAREHOUSE_MAINTENANCE_PATH } from "../maintenance/warehouseSettings";

// Shown instead of stock when no warehouse has been chosen under Maintenance → Warehouses.
export function NoWarehouseSelected() {
  return (
    <div className="banner error" role="alert">
      <span className="banner-text">
        <TriangleAlert size={18} aria-hidden="true" />
        <strong>No warehouse selected.</strong> Choose the warehouses the store uses before viewing inventory.
      </span>
      <Link to={WAREHOUSE_MAINTENANCE_PATH} className="button">
        <Warehouse size={15} aria-hidden="true" />
        Select warehouses
      </Link>
    </div>
  );
}
