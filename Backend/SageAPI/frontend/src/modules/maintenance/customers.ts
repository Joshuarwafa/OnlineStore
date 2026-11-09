import { adminRequest } from "../../api/admin";

// Sage customers and the shop's walk-in (cash) customer. All calls go through StoreBackend,
// which adds the SageAPI key; the browser never talks to SageAPI for these.

export interface Customer {
  account: string;
  name: string;
}

export interface CustomerPage {
  total: number;
  page: number;
  pageSize: number;
  items: Customer[];
}

export interface CustomerSettings {
  /** Sage account used for walk-in shoppers. null = not chosen yet. */
  cashAccount: string | null;
  cashAccountName: string | null;
  /** "admin" = chosen here; "env" = STORE_CASH_CUSTOMER in the store backend's .env; "none" = neither. */
  source: "admin" | "env" | "none";
}

export const searchCustomers = (search: string, page: number, pageSize = 50) => {
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search.trim()) qs.set("search", search.trim());
  return adminRequest<CustomerPage>("GET", `/customers?${qs}`);
};

export const getCustomerSettings = () => adminRequest<CustomerSettings>("GET", "/settings/customers");
export const saveCashAccount = (cashAccount: string) => adminRequest<CustomerSettings>("PUT", "/settings/customers", { cashAccount });
