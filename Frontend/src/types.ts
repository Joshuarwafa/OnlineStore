// Shapes the store backend returns to the browser.
// The backend builds these from SageAPI; the browser never talks to SageAPI.

export interface CatalogueItem {
  /** Sage stock code. May contain "/" (e.g. 47195/ORB). */
  code: string;
  description: string;
  /** Price from the store's Sage price list, VAT inclusive. */
  priceIncl: number | null;
  priceExcl: number | null;
  /** Total across the shop's warehouses. */
  qtyOnHand: number;
  /** Stock in each of the shop's warehouses (omitted by the demo data). */
  stock?: LocationStock[];
  /** Slug of the store category the item is shown under, if any. */
  category: string | null;
  /** Main product photo uploaded in the admin area, or null (a generated plate is shown). */
  imageUrl: string | null;
}

/** Stock of an item in one of the shop's warehouses. */
export interface LocationStock {
  /** Sage warehouse code */
  warehouse: string;
  qty: number;
}

/** A warehouse the shop sells from, as shoppers see it (name and address set in the admin portal). */
export interface Location {
  code: string;
  name: string;
  address: string | null;
  /** Town or city, used to group branches in the picker */
  town: string | null;
}

/** A store category as shoppers see it. */
export interface Category {
  /** URL slug, e.g. "power-tools". */
  code: string;
  name: string;
  /** Number of items in the category. */
  count: number;
  imageUrl: string | null;
}

export interface ProductImage {
  id: string;
  url: string;
  width: number;
  height: number;
}

export type CatalogueSort = "description" | "price_asc" | "price_desc" | "stock";

export interface CatalogueQuery {
  search?: string;
  category?: string;
  page?: number;
  pageSize?: number;
  inStock?: boolean;
  /** Only items with an uploaded photo */
  withPhoto?: boolean;
  /** Only items in stock at this branch (warehouse code) */
  branch?: string;
  sort?: CatalogueSort;
}

export interface CataloguePage {
  items: CatalogueItem[];
  page: number;
  pageSize: number;
  total: number;
  priceList: string;
  currency: string;
  /** When the backend last refreshed its catalogue cache from Sage (ISO). */
  refreshedAt: string;
}

export interface ProductDetail extends CatalogueItem {
  /** All photos, main photo first. Empty when none have been uploaded. */
  images: ProductImage[];
  warehouseCode: string | null;
  warehouseName: string | null;
  /** When stock was read live from Sage (ISO). */
  checkedAt: string;
  currency: string;
}

export interface CartLine {
  code: string;
  description: string;
  qty: number;
  /** Price shown when the item was added. Re-checked at checkout. */
  unitPriceIncl: number;
}

export type QuoteLineStatus = "ok" | "short" | "unavailable";

export interface QuoteLine {
  code: string;
  description: string;
  qty: number;
  available: number;
  /** Current Sage price. The frontend compares it with the cart price to flag changes. */
  unitPriceIncl: number;
  lineTotalIncl: number;
  status: QuoteLineStatus;
}

export interface Quote {
  lines: QuoteLine[];
  totalExcl: number;
  vat: number;
  totalIncl: number;
  currency: string;
  /** True when every line has enough stock to be ordered as-is. */
  clean: boolean;
}

export type Fulfilment = "delivery" | "collection";
export type PaymentMethod = "on_collection" | "on_delivery" | "online";

export interface Shopper {
  name: string;
  phone: string;
  email: string;
}

export interface DeliveryAddress {
  line1: string;
  line2: string;
  suburb: string;
  city: string;
  postalCode: string;
  notes: string;
}

export interface PlaceOrderRequest {
  shopper: Shopper;
  fulfilment: Fulfilment;
  address: DeliveryAddress | null;
  payment: PaymentMethod;
  /** Sage warehouse code of the shopper's branch. Stock is checked and taken there. */
  branch?: string | null;
  lines: { code: string; qty: number }[];
}

/** Mirrors SageStaging statuses. */
export type OrderStatusCode = "Pending" | "Processing" | "Posted" | "Failed" | "Cancelled";

export interface OrderStatus {
  storeOrderNo: string;
  status: OrderStatusCode;
  placedAt: string;
  updatedAt: string;
  /** Sage document number once Posted. */
  sageDocumentNo: string | null;
  shopperName: string;
  fulfilment: Fulfilment;
  payment: PaymentMethod;
  /** Branch the quotation is for, when the shopper chose one. */
  branchName?: string | null;
  lines: { code: string; description: string; qty: number; unitPriceIncl: number; unitPriceExcl?: number }[];
  totalIncl: number;
  totalExcl?: number;
  currency: string;
  /** For the printed quotation: the Sage account it is on, its name, and the message lines. */
  account?: string | null;
  accountName?: string | null;
  messages?: string[];
}

/** The company's own details at the top of a printed quotation (admin → Maintenance → Company). */
export interface Company {
  name: string;
  address: string[];
  taxNumber: string;
  telephone: string;
  fax: string;
  email: string;
  footer: string;
}

export interface PlaceOrderResponse {
  storeOrderNo: string;
  status: OrderStatusCode;
  /** Sage quotation number. */
  sageDocumentNo?: string | null;
  /** True when this Idempotency-Key had already been used: the existing order came back. */
  duplicate: boolean;
}

// ---------- demo data (VITE_USE_MOCKS) ----------

/** A category in the built-in demo store. */
export interface StoreCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  imageUrl: string | null;
  sortOrder: number;
  visible: boolean;
  /** Sage item groups whose items are all included automatically. */
  itemGroups: string[];
  /** Extra individual stock codes included by hand. */
  itemCodes: string[];
  /** Computed by the server: items currently in the category. */
  count: number;
}

/** A Sage item group in the demo data. */
export interface ItemGroup {
  code: string;
  name: string;
  count: number;
}
