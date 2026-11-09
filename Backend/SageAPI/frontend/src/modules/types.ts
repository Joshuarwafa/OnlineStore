import type { LucideIcon } from "lucide-react";
import type { RouteObject } from "react-router-dom";

// An admin module (Inventory, Maintenance, Orders...). Each one owns a folder under src/modules,
// its own routes under /<path>, and an entry in the sidebar.
export interface AdminModule {
  id: string;
  label: string;
  icon: LucideIcon;
  path: string;
  routes: RouteObject[];
  /** Sub-pages listed under the module in the sidebar while it is open; paths are relative to the module. */
  nav?: { label: string; icon: LucideIcon; path: string }[];
}
