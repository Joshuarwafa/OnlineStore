import { config, isLive } from "../config";
import type {
  CatalogueItem,
  Company,
  CataloguePage,
  CatalogueQuery,
  Category,
  Location,
  OrderStatus,
  PlaceOrderRequest,
  PlaceOrderResponse,
  ProductDetail,
  Quote,
} from "../types";
import { qs, request } from "./client";
import * as mock from "./mock";

// Every call the frontend makes. The README documents this contract for the store backend.

export interface StoreApi {
  catalogue(q: CatalogueQuery): Promise<CataloguePage>;
  categories(): Promise<Category[]>;
  /** The warehouses the shop sells from */
  locations(): Promise<Location[]>;
  product(code: string): Promise<ProductDetail>;
  quote(lines: { code: string; qty: number }[], branch?: string | null): Promise<Quote>;
  placeOrder(req: PlaceOrderRequest, idempotencyKey: string): Promise<PlaceOrderResponse>;
  /** contact = the phone number or email given at checkout */
  order(storeOrderNo: string, contact: string): Promise<OrderStatus>;
  suggest(search: string): Promise<CatalogueItem[]>;
  /** The company's details for printed quotations */
  company(): Promise<Company>;
}

const http: StoreApi = {
  catalogue: (q) =>
    request(
      `/catalogue${qs({
        search: q.search?.trim(),
        category: q.category,
        page: q.page,
        pageSize: q.pageSize ?? config.pageSize,
        inStock: q.inStock,
        withPhoto: q.withPhoto,
        branch: q.branch,
        sort: q.sort,
      })}`,
    ),
  categories: async () => (await request<{ categories: Category[] }>(`/categories`)).categories,
  locations: async () => (await request<{ locations: Location[] }>(`/locations`)).locations,
  // encodeURIComponent turns "/" into %2F so codes like 47195/ORB stay one path segment
  product: (code) => request(`/products/${encodeURIComponent(code)}`),
  quote: (lines, branch) => request(`/checkout/quote`, { method: "POST", body: JSON.stringify({ lines, branch: branch ?? undefined }) }),
  placeOrder: (req, idempotencyKey) =>
    request(`/orders`, {
      method: "POST",
      body: JSON.stringify(req),
      headers: { "Idempotency-Key": idempotencyKey },
    }),
  order: (no, contact) => request(`/orders/${encodeURIComponent(no)}${qs({ contact })}`),
  company: () => request(`/company`),
  suggest: async (search) =>
    (await http.catalogue({ search, pageSize: 6, page: 1 })).items,
};

// With VITE_LIVE_FEATURES=catalogue the shop reads live Sage data through the store backend
export const api: StoreApi = isLive("catalogue") ? http : mock.api;
