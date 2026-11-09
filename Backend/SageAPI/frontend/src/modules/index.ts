import { inventoryModule } from "./inventory/module";
import { maintenanceModule } from "./maintenance/module";
import { salesModule } from "./sales/module";
import type { AdminModule } from "./types";

// Register new modules here; the sidebar and routes are built from this list.
export const modules: AdminModule[] = [salesModule, inventoryModule, maintenanceModule];
