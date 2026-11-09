import { Building2, Database, FolderTree, Images, Users, Warehouse, Workflow, Wrench } from "lucide-react";
import { Navigate } from "react-router-dom";
import type { AdminModule } from "../types";
import { CategoriesPage } from "./pages/CategoriesPage";
import { CompanyPage } from "./pages/CompanyPage";
import { CustomersPage } from "./pages/CustomersPage";
import { DatabaseSettings } from "./pages/DatabaseSettings";
import { PicturesPage } from "./pages/PicturesPage";
import { WarehouseMaintenance } from "./pages/WarehouseMaintenance";
import { WorkflowPage } from "./pages/WorkflowPage";

export const maintenanceModule: AdminModule = {
  id: "maintenance",
  label: "Maintenance",
  icon: Wrench,
  path: "maintenance",
  nav: [
    { label: "Database", icon: Database, path: "database" },
    { label: "Company", icon: Building2, path: "company" },
    { label: "Workflow", icon: Workflow, path: "workflow" },
    { label: "Warehouses", icon: Warehouse, path: "warehouses" },
    { label: "Customers", icon: Users, path: "customers" },
    { label: "Categories", icon: FolderTree, path: "categories" },
    { label: "Pictures", icon: Images, path: "pictures" },
  ],
  routes: [
    { index: true, element: <Navigate to="database" replace /> },
    { path: "database", element: <DatabaseSettings /> },
    { path: "company", element: <CompanyPage /> },
    { path: "workflow", element: <WorkflowPage /> },
    { path: "warehouses", element: <WarehouseMaintenance /> },
    { path: "customers", element: <CustomersPage /> },
    { path: "categories", element: <CategoriesPage /> },
    { path: "pictures", element: <PicturesPage /> },
  ],
};
