import { FileStack, Receipt } from "lucide-react";
import { Navigate } from "react-router-dom";
import type { AdminModule } from "../types";
import { DocumentsPage } from "./pages/DocumentsPage";

export const salesModule: AdminModule = {
  id: "sales",
  label: "Sales",
  icon: Receipt,
  path: "sales",
  nav: [{ label: "Documents", icon: FileStack, path: "documents" }],
  routes: [
    { index: true, element: <Navigate to="documents" replace /> },
    { path: "documents", element: <DocumentsPage /> },
  ],
};
