// In-browser stand-in for the store backend, used while VITE_USE_MOCKS=true.
// It behaves like the real flow in the scope: live prices and stock at checkout,
// duplicate protection by idempotency key, and orders moving Pending -> Processing -> Posted.
// Tip: a name or email containing "fail" makes the order land in Failed, to preview that state.

import type {
  CataloguePage,
  OrderStatus,
  OrderStatusCode,
  PlaceOrderResponse,
  ProductDetail,
  Quote,
  QuoteLine,
} from "../types";
import type { StoreApi } from "./store";
import { ApiError } from "./client";
import { CURRENCY, PRICE_LIST, VAT, catalogue, find, hash, refreshedAt, round, wait } from "./mockData";
import { config } from "../config";
import { categoryBySlug, inCategory, productImages, publicCategories, toPublic } from "./mockStore";

// ---- orders, kept in localStorage so the status page survives a reload ----

interface StoredOrder extends OrderStatus {
  email: string;
  /** Digits only, for matching the phone number on lookup. */
  phone?: string;
  key: string;
  failOnPost: boolean;
}
const ORDERS_KEY = "mock.orders.v1";

const digits = (s: string) => s.replace(/\D/g, "");

/** The phone number (any spacing, with or without +263 / leading 0) or the email from checkout. */
function contactMatches(o: StoredOrder, contact: string): boolean {
  const c = contact.trim().toLowerCase();
  if (c.includes("@")) return !!o.email && o.email === c;
  const d = digits(c);
  if (!o.phone || d.length < 7) return false;
  // Compare the last 9 digits so 0771234567 and +263 77 123 4567 match
  return o.phone.slice(-9) === d.slice(-9);
}

function loadOrders(): StoredOrder[] {
  try {
    return JSON.parse(localStorage.getItem(ORDERS_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function saveOrders(orders: StoredOrder[]) {
  try {
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  } catch {
    /* storage unavailable: orders live only for this page load */
  }
}

/** Advance an order through staging based on its age, as SageAPI's posting would. */
function progress(o: StoredOrder): StoredOrder {
  const age = Date.now() - Date.parse(o.placedAt);
  let status: OrderStatusCode = o.status;
  if (o.status === "Pending" && age > 2500) status = "Processing";
  if ((o.status === "Pending" || o.status === "Processing") && age > 7000) status = o.failOnPost ? "Failed" : "Posted";
  if (status === o.status) return o;
  return {
    ...o,
    status,
    updatedAt: new Date().toISOString(),
    sageDocumentNo: status === "Posted" ? `SO${String(40000 + (hash(o.storeOrderNo) % 9999)).padStart(6, "0")}` : null,
  };
}


function buildQuote(lines: { code: string; qty: number }[]): Quote {
  const out: QuoteLine[] = lines.map(({ code, qty }) => {
    const item = find(code);
    if (!item || item.priceIncl == null) {
      return { code, description: item?.description ?? code, qty, available: 0, unitPriceIncl: 0, lineTotalIncl: 0, status: "unavailable" };
    }
    const status = item.qtyOnHand <= 0 ? "unavailable" : qty > item.qtyOnHand ? "short" : "ok";
    return {
      code: item.code,
      description: item.description,
      qty,
      available: item.qtyOnHand,
      unitPriceIncl: item.priceIncl,
      lineTotalIncl: round(item.priceIncl * qty),
      status,
    };
  });
  const totalIncl = round(out.reduce((s, l) => s + (l.status === "unavailable" ? 0 : l.lineTotalIncl), 0));
  const totalExcl = round(totalIncl / (1 + VAT));
  return { lines: out, totalIncl, totalExcl, vat: round(totalIncl - totalExcl), currency: CURRENCY, clean: out.every((l) => l.status === "ok") };
}

export const api: StoreApi = {
  async checkoutSettings() {
    return { checkoutDocument: "SalesOrder" as const, allowQuotation: true };
  },
  async company() {
    return { name: "Demo Store (Pvt) Ltd", address: ["00 Example Street", "Bulawayo", "", ""], taxNumber: "000000000", telephone: "+263 29 000 0000", fax: "", email: "", footer: "" };
  },
  async catalogue({ search = "", category, page = 1, pageSize = 24, inStock, sort = "description" }) {
    const q = search.trim().toLowerCase();
    const cat = category ? categoryBySlug(category) : undefined;
    let rows = catalogue.filter(
      (i) =>
        (!q || i.code.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)) &&
        (!category || (cat !== undefined && cat.visible && inCategory(i, cat))) &&
        (!inStock || i.qtyOnHand > 0),
    );
    rows = [...rows].sort((a, b) => {
      switch (sort) {
        case "price_asc":
          return (a.priceIncl ?? Infinity) - (b.priceIncl ?? Infinity);
        case "price_desc":
          return (b.priceIncl ?? -Infinity) - (a.priceIncl ?? -Infinity);
        case "stock":
          return b.qtyOnHand - a.qtyOnHand;
        default:
          return a.description.localeCompare(b.description);
      }
    });
    const start = (page - 1) * pageSize;
    const result: CataloguePage = {
      items: await Promise.all(rows.slice(start, start + pageSize).map(toPublic)),
      page,
      pageSize,
      total: rows.length,
      priceList: PRICE_LIST,
      currency: CURRENCY,
      refreshedAt,
    };
    return wait(result);
  },

  async locations() {
    // The demo store has one location
    return wait([{ code: "main", name: config.collectionPoint, address: config.address || null, town: config.storeLabel || null }]);
  },

  async categories() {
    return wait(await publicCategories(), 150);
  },

  async product(code) {
    const item = find(code);
    if (!item) throw new ApiError(`Item '${code}' does not exist`, 404);
    const detail: ProductDetail = {
      ...(await toPublic(item)),
      images: await productImages(item.code),
      warehouseCode: "BYO",
      warehouseName: "Bulawayo",
      checkedAt: new Date().toISOString(),
      currency: CURRENCY,
    };
    return wait(detail, 400 + Math.random() * 500);
  },

  async quote(lines) {
    return wait(buildQuote(lines), 600);
  },

  async placeOrder(req, key) {
    const orders = loadOrders();
    const existing = orders.find((o) => o.key === key);
    if (existing) {
      const res: PlaceOrderResponse = { storeOrderNo: existing.storeOrderNo, status: existing.status, duplicate: true };
      return wait(res);
    }
    const quote = buildQuote(req.lines);
    const bad = quote.lines.find((l) => l.status === "short" || l.status === "unavailable");
    if (bad) {
      throw new ApiError(
        bad.status === "short"
          ? `Only ${bad.available} of ${bad.description} left. Please lower the quantity.`
          : `${bad.description} is no longer available.`,
        409,
        quote,
      );
    }
    for (const l of quote.lines) {
      const item = find(l.code);
      if (item) item.qtyOnHand -= l.qty;
    }
    const now = new Date();
    const storeOrderNo = `WEB-${now.getFullYear().toString().slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}-${String(hash(key) % 100000).padStart(5, "0")}`;
    const order: StoredOrder = {
      storeOrderNo,
      status: "Pending",
      placedAt: now.toISOString(),
      updatedAt: now.toISOString(),
      sageDocumentNo: null,
      shopperName: req.shopper.name,
      fulfilment: req.fulfilment,
      payment: req.payment,
      lines: quote.lines.map(({ code, description, qty, unitPriceIncl }) => ({ code, description, qty, unitPriceIncl })),
      totalIncl: quote.totalIncl,
      currency: CURRENCY,
      email: req.shopper.email.trim().toLowerCase(),
      phone: digits(req.shopper.phone),
      key,
      failOnPost: /fail/i.test(req.shopper.email) || /fail/i.test(req.shopper.name),
    };
    saveOrders([...orders, order]);
    const res: PlaceOrderResponse = { storeOrderNo, status: "Pending", duplicate: false };
    return wait(res, 900);
  },

  async order(no, contact) {
    const orders = loadOrders();
    const idx = orders.findIndex((o) => o.storeOrderNo.toLowerCase() === no.trim().toLowerCase());
    if (idx < 0 || (contact && !contactMatches(orders[idx], contact))) {
      throw new ApiError("We couldn't find an order with that number and phone number.", 404);
    }
    orders[idx] = progress(orders[idx]);
    saveOrders(orders);
    const { email: _e, phone: _p, key: _k, failOnPost: _f, ...status } = orders[idx];
    return wait(status as OrderStatus);
  },

  async suggest(search) {
    return (await api.catalogue({ search, pageSize: 6 })).items;
  },
};
