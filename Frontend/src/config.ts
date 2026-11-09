import type { Fulfilment, PaymentMethod } from "./types";

const env = import.meta.env;

function list<T extends string>(raw: string | undefined, allowed: readonly T[], fallback: T[]): T[] {
  const picked = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is T => (allowed as readonly string[]).includes(s));
  return picked.length ? picked : fallback;
}

export const config = {
  storeName: env.VITE_STORE_NAME || "Stockroom",
  useMocks: (env.VITE_USE_MOCKS ?? "true") !== "false",
  /**
   * Parts switched to the real backend while the rest stays on demo data (moving to live step by step).
   * "catalogue" = shop products, prices, stock and checkout prices.
   * Ignored when VITE_USE_MOCKS=false (then everything is live).
   */
  live: new Set((env.VITE_LIVE_FEATURES ?? "").split(",").map((s: string) => s.trim()).filter(Boolean)),
  // Scope D8: delivery, collection or both
  fulfilment: list<Fulfilment>(env.VITE_FULFILMENT, ["delivery", "collection"], ["delivery", "collection"]),
  // Scope D5: how shoppers pay
  paymentMethods: list<PaymentMethod>(
    env.VITE_PAYMENT_METHODS,
    ["on_collection", "on_delivery", "online"],
    ["on_collection", "on_delivery"],
  ),
  collectionPoint: env.VITE_COLLECTION_POINT || "Our Bulawayo store",
  /** Short store/branch label for the top bar (one warehouse in the first release). */
  storeLabel: env.VITE_STORE_LABEL || "Bulawayo",
  contactPhone: env.VITE_CONTACT_PHONE || "",
  contactEmail: env.VITE_CONTACT_EMAIL || "",
  address: env.VITE_STORE_ADDRESS || "",
  hours: env.VITE_STORE_HOURS || "",
  pageSize: 24,
  lowStockThreshold: 5,
  /** How often the order page re-checks an order that is still on its way into Sage. */
  statusPollMs: 4000,
};

/** True when this part of the app talks to the real backend. */
export function isLive(feature: "catalogue"): boolean {
  return !config.useMocks || config.live.has(feature);
}

export const paymentLabels: Record<PaymentMethod, { title: string; note: string }> = {
  on_collection: { title: "Pay on collection", note: "Cash or card when you collect." },
  on_delivery: { title: "Pay on delivery", note: "Settle with the driver when your order arrives." },
  online: { title: "Pay online now", note: "You'll be sent to our secure payment page." },
};
