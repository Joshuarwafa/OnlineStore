import { config } from "../config";

const money = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: number | null | undefined, currency = "USD"): string {
  if (amount == null) return "—";
  let f = money.get(currency);
  if (!f) {
    f = new Intl.NumberFormat("en-ZW", { style: "currency", currency, currencyDisplay: "narrowSymbol" });
    money.set(currency, f);
  }
  return f.format(amount);
}

/** Splits a price into whole and cents so the cents can be set smaller. */
export function priceParts(amount: number, currency = "USD") {
  const s = formatMoney(amount, currency);
  const m = s.match(/^(.*?)([.,]\d{2})$/);
  return m ? { whole: m[1], cents: m[2] } : { whole: s, cents: "" };
}

export type StockLevel = "plenty" | "low" | "out";

export function stockLevel(qty: number): StockLevel {
  if (qty <= 0) return "out";
  if (qty <= config.lowStockThreshold) return "low";
  return "plenty";
}

export function stockLabel(qty: number): string {
  const n = Math.floor(qty);
  if (n <= 0) return "Out of stock";
  if (n <= config.lowStockThreshold) return `Only ${n} left`;
  return `${n} in stock`;
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Link to a product page. Codes may contain "/", so they are encoded as one segment. */
export function productPath(code: string) {
  return `/p/${encodeURIComponent(code)}`;
}
