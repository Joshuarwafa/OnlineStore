import { Package } from "lucide-react";
import type { AdminModule } from "../types";
import { InventoryOverview } from "./pages/InventoryOverview";
import { WarehouseStock } from "./pages/WarehouseStock";

export const inventoryModule: AdminModule = {
  id: "inventory",
  label: "Inventory",
  icon: Package,
  path: "inventory",
  routes: [
    { index: true, element: <InventoryOverview /> },
    { path: ":code", element: <WarehouseStock /> },
  ],
};
