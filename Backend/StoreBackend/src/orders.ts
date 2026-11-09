// Checkout: the cart becomes a quotation in Sage Evolution.
//
// Walk-in shoppers don't have a Sage account, so every quotation goes on the cash account chosen in
// the admin portal (Maintenance → Customers). The shopper's name, phone, email and delivery address
// are written on the quotation itself (Deliver To and the message lines), and each line is taken
// from the shopper's branch (its Sage warehouse).
//
// A copy of each quotation is kept in data/orders/<number>.json, so the shopper can open it again
// with their number and phone, and so pressing the button twice never makes two quotations.

import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { liveProduct, shopLocations } from "./catalogue.js";
import { config } from "./config.js";
import { HttpError } from "./errors.js";
import { sageApi } from "./sageApi.js";
import { shopCustomers } from "./shopCustomers.js";

// ---------- pricing a cart ----------

export interface DocketLine {
  code: string;
  qty: number;
}

export interface PricedLine {
  code: string;
  description: string;
  qty: number;
  available: number;
  unitPriceIncl: number;
  unitPriceExcl: number;
  lineTotalIncl: number;
  status: "ok" | "short" | "unavailable";
  /** Sage warehouse the stock comes from: the shopper's branch, else the branch with the most. */
  warehouse: string | null;
}

export function cleanLines(lines: unknown): DocketLine[] {
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 100) throw new HttpError(400, "The cart is empty or too large.");
  const merged = new Map<string, DocketLine>();
  for (const l of lines) {
    const code = typeof l?.code === "string" ? l.code.trim() : "";
    const qty = Number(l?.qty);
    if (!code || code.length > 40 || !Number.isFinite(qty) || qty <= 0 || qty > 100000) throw new HttpError(400, "A line in the cart isn't valid.");
    const prev = merged.get(code);
    merged.set(code, { code, qty: (prev?.qty ?? 0) + Math.floor(qty) });
  }
  return [...merged.values()];
}

/** The shop's branch with this warehouse code, or null when not given / not one of the shop's branches. */
async function branchOf(code: unknown) {
  if (typeof code !== "string" || !code.trim()) return null;
  return (await shopLocations()).find((l) => l.code === code.trim()) ?? null;
}

/**
 * Live Sage prices and stock for each line. With a branch, stock is counted at that branch only;
 * without one, across all the shop's branches.
 */
export async function priceDocket(lines: DocketLine[], branchCode?: unknown) {
  const branch = await branchOf(branchCode);
  const priced: PricedLine[] = await Promise.all(
    lines.map(async ({ code, qty }) => {
      try {
        const p = await liveProduct(code);
        let available: number;
        let warehouse: string | null;
        if (branch) {
          available = p.stock.find((s) => s.warehouse === branch.code)?.qty ?? 0;
          warehouse = branch.code;
        } else {
          available = p.qtyOnHand;
          const best = [...p.stock].sort((a, b) => b.qty - a.qty)[0];
          warehouse = best?.warehouse ?? p.warehouseCode ?? null;
        }
        // Sage can hold part-units (e.g. 0.4 of a case); only whole units can be sold
        const whole = Math.max(0, Math.floor(available));
        const status: PricedLine["status"] = p.priceIncl == null || whole < 1 ? "unavailable" : qty > whole ? "short" : "ok";
        return {
          code: p.code,
          description: p.description,
          qty,
          available: whole,
          unitPriceIncl: p.priceIncl ?? 0,
          unitPriceExcl: p.priceExcl ?? 0,
          lineTotalIncl: round2((p.priceIncl ?? 0) * qty),
          status,
          warehouse,
        };
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) {
          return { code, description: code, qty, available: 0, unitPriceIncl: 0, unitPriceExcl: 0, lineTotalIncl: 0, status: "unavailable" as const, warehouse: null };
        }
        throw e;
      }
    }),
  );

  const counted = priced.filter((l) => l.status !== "unavailable");
  const totalIncl = round2(counted.reduce((s, l) => s + l.lineTotalIncl, 0));
  const totalExcl = round2(counted.reduce((s, l) => s + l.unitPriceExcl * l.qty, 0));
  return {
    branch,
    priced,
    quote: {
      lines: priced.map(({ unitPriceExcl: _x, warehouse: _w, ...l }) => l),
      totalIncl,
      totalExcl,
      vat: round2(totalIncl - totalExcl),
      currency: config.currency,
      clean: priced.every((l) => l.status === "ok"),
    },
  };
}

// ---------- quotations ----------

type Fulfilment = "delivery" | "collection";
type Payment = "on_collection" | "on_delivery" | "online";

export interface StoredOrder {
  storeOrderNo: string;
  idempotencyKey: string;
  /** Sage quotation number, e.g. QUO0012 */
  sageDocumentNo: string;
  sageCustomer: string;
  /** The account's name in Sage, for the "To:" block of the printed quotation. */
  sageCustomerName?: string | null;
  status: "Posted";
  placedAt: string;
  shopper: { name: string; phone: string; email: string };
  fulfilment: Fulfilment;
  address: string | null;
  payment: Payment;
  branch: { code: string; name: string } | null;
  lines: { code: string; description: string; qty: number; unitPriceIncl: number; unitPriceExcl?: number; warehouse: string | null }[];
  totalIncl: number;
  totalExcl?: number;
  /** The three message lines written on the quotation in Sage. */
  messages?: string[];
  currency: string;
}

const DIR = join(dirname(config.imagesDir), "orders");
let byKey: Map<string, string> | null = null; // idempotency key → order number
const inFlight = new Map<string, Promise<StoredOrder>>();

async function keys(): Promise<Map<string, string>> {
  if (byKey) return byKey;
  const map = new Map<string, string>();
  try {
    for (const f of await readdir(DIR)) {
      if (!f.endsWith(".json")) continue;
      try {
        const o = JSON.parse(await readFile(join(DIR, f), "utf8")) as StoredOrder;
        if (o.idempotencyKey) map.set(o.idempotencyKey, o.storeOrderNo);
      } catch {
        /* skip a damaged file */
      }
    }
  } catch {
    /* no orders yet */
  }
  byKey = map;
  return map;
}

async function readOrder(no: string): Promise<StoredOrder | null> {
  if (!/^[A-Z0-9-]{4,30}$/.test(no)) return null;
  try {
    return JSON.parse(await readFile(join(DIR, `${no}.json`), "utf8")) as StoredOrder;
  } catch {
    return null;
  }
}

/** e.g. WEB-261106-K7QX: date it was placed and four letters, easy to read out on the phone. */
function newOrderNo(now: Date): string {
  const d = now.toISOString().slice(2, 10).replace(/-/g, "");
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I/L to confuse
  const tail = [...randomBytes(4)].map((b) => abc[b % abc.length]).join("");
  return `WEB-${d}-${tail}`;
}

const digits = (s: string) => s.replace(/\D/g, "");
const round2 = (n: number) => Math.round(n * 100) / 100;
/** Sage address and message fields are short: cut, never fail. */
const fit = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

const PAYMENT_TEXT: Record<Payment, string> = {
  on_collection: "Pays on collection",
  on_delivery: "Pays on delivery",
  online: "Paid online",
};

function readRequest(body: any) {
  const name = typeof body?.shopper?.name === "string" ? body.shopper.name.trim() : "";
  const phone = typeof body?.shopper?.phone === "string" ? body.shopper.phone.trim() : "";
  const email = typeof body?.shopper?.email === "string" ? body.shopper.email.trim() : "";
  if (name.length < 2 || name.length > 80) throw new HttpError(400, "Please enter your name.");
  if (digits(phone).length < 7 || phone.length > 30) throw new HttpError(400, "Please enter a phone number we can call.");
  if (email && (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new HttpError(400, "That email doesn't look right.");

  const fulfilment: Fulfilment = body?.fulfilment === "delivery" ? "delivery" : "collection";
  const a = body?.address;
  const address =
    fulfilment === "delivery"
      ? [a?.line1, a?.line2, a?.suburb, a?.city].filter((x) => typeof x === "string" && x.trim()).join(", ").slice(0, 300)
      : null;
  if (fulfilment === "delivery" && (!address || address.length < 5)) throw new HttpError(400, "Where should we deliver to?");

  const payment: Payment = ["on_collection", "on_delivery", "online"].includes(body?.payment) ? body.payment : "on_collection";
  return { shopper: { name, phone, email }, fulfilment, address, payment, lines: cleanLines(body?.lines), branch: body?.branch };
}

/**
 * Turns the cart into a Sage quotation. Same idempotency key → the same quotation comes back.
 * Throws 409 with the fresh quote when prices or stock changed, so the shopper can check them first.
 */
export async function placeOrder(body: unknown, idempotencyKey: string): Promise<{ order: StoredOrder; duplicate: boolean }> {
  const key = idempotencyKey.trim();
  if (key.length < 8 || key.length > 100) throw new HttpError(400, "Missing Idempotency-Key header.");

  const existing = (await keys()).get(key);
  if (existing) {
    const o = await readOrder(existing);
    if (o) return { order: o, duplicate: true };
  }
  const running = inFlight.get(key);
  if (running) return { order: await running, duplicate: true };

  const work = createQuotation(readRequest(body), key);
  inFlight.set(key, work);
  try {
    return { order: await work, duplicate: false };
  } finally {
    inFlight.delete(key);
  }
}

/** Thrown with the fresh quote when stock or prices moved since the shopper last looked. */
export class QuoteChanged extends HttpError {
  constructor(public quote: unknown) {
    super(409, "Prices or stock changed. Check your cart and try again.");
  }
}

async function createQuotation(req: ReturnType<typeof readRequest>, key: string): Promise<StoredOrder> {
  const { cashAccount, cashAccountName } = await shopCustomers();
  if (!cashAccount) {
    console.error("Quotation refused: no cash account. Choose one in the admin portal under Maintenance → Customers.");
    throw new HttpError(503, "We can't take quotations online right now. Please call us and we'll help.");
  }

  const { branch, priced, quote } = await priceDocket(req.lines, req.branch);
  if (!quote.clean) throw new QuoteChanged(quote);

  const now = new Date();
  const storeOrderNo = newOrderNo(now);
  const where = req.fulfilment === "delivery" ? `Deliver: ${req.address}` : `Collect${branch ? ` at ${branch.name}` : ""}`;

  // Deliver To holds the shopper, because the account itself is the shared cash account
  const addr = req.fulfilment === "delivery" ? req.address ?? "" : `Collect${branch ? ` at ${branch.name}` : ""}`;
  const messages = [
    fit(`Online shop ${storeOrderNo} · ${req.shopper.name} · ${req.shopper.phone}`, 100),
    fit(`${where} · ${PAYMENT_TEXT[req.payment]}`, 100),
    fit(req.shopper.email ? `Email ${req.shopper.email}` : "", 100),
  ];
  const result = await sageApi<{ quotationNo: string }>("POST", "/salesorder/quotation", {
    customer: cashAccount,
    externalOrderNo: storeOrderNo,
    description: fit(`Online shop quotation ${storeOrderNo}`, 100),
    pricesIncludeTax: true,
    deliverTo: {
      line1: fit(req.shopper.name, 40),
      line2: fit(`Tel ${req.shopper.phone}`, 40),
      line3: fit(req.shopper.email, 40),
      line4: fit(addr, 40),
      line5: fit(addr.slice(40), 40),
      postalCode: "",
    },
    messageLine1: messages[0],
    messageLine2: messages[1],
    messageLine3: messages[2],
    lines: priced.map((l) => ({ itemCode: l.code, quantity: l.qty, price: l.unitPriceIncl, warehouse: l.warehouse ?? "" })),
  });
  const quotationNo = result?.quotationNo?.trim();
  if (!quotationNo) throw new HttpError(502, "Sage didn't return a quotation number.");

  const order: StoredOrder = {
    storeOrderNo,
    idempotencyKey: key,
    sageDocumentNo: quotationNo,
    sageCustomer: cashAccount,
    sageCustomerName: cashAccountName,
    status: "Posted",
    placedAt: now.toISOString(),
    shopper: req.shopper,
    fulfilment: req.fulfilment,
    address: req.address,
    payment: req.payment,
    branch: branch ? { code: branch.code, name: branch.name } : null,
    lines: priced.map((l) => ({
      code: l.code,
      description: l.description,
      qty: l.qty,
      unitPriceIncl: l.unitPriceIncl,
      unitPriceExcl: l.unitPriceExcl,
      warehouse: l.warehouse,
    })),
    totalIncl: quote.totalIncl,
    totalExcl: quote.totalExcl,
    messages,
    currency: config.currency,
  };

  await mkdir(DIR, { recursive: true });
  const file = join(DIR, `${storeOrderNo}.json`);
  await writeFile(`${file}.tmp`, JSON.stringify(order, null, 2));
  await rename(`${file}.tmp`, file); // never a half-written file
  (await keys()).set(key, storeOrderNo);
  console.log(`Quotation ${quotationNo} created in Sage on ${cashAccount} for online order ${storeOrderNo} (${order.lines.length} lines, ${order.totalIncl} ${order.currency})`);
  return order;
}

/** What the shopper sees. Found only with the number and the phone (or email) given at checkout. */
export async function findOrder(no: string, contact: string) {
  const o = await readOrder(no.trim().toUpperCase());
  const c = contact.trim().toLowerCase();
  const matches =
    o && c && ((digits(c).length >= 7 && digits(c).slice(-9) === digits(o.shopper.phone).slice(-9)) || (o.shopper.email && c === o.shopper.email.toLowerCase()));
  if (!o || !matches) throw new HttpError(404, "We couldn't find a quotation with that number and phone number.");
  return {
    storeOrderNo: o.storeOrderNo,
    status: o.status,
    placedAt: o.placedAt,
    updatedAt: o.placedAt,
    sageDocumentNo: o.sageDocumentNo,
    shopperName: o.shopper.name,
    fulfilment: o.fulfilment,
    payment: o.payment,
    branchName: o.branch?.name ?? null,
    lines: o.lines.map(({ code, description, qty, unitPriceIncl, unitPriceExcl }) => ({
      code,
      description,
      qty,
      unitPriceIncl,
      // older records without it print as VAT-free rather than guessing a rate
      unitPriceExcl: unitPriceExcl ?? unitPriceIncl,
    })),
    totalIncl: o.totalIncl,
    totalExcl: o.totalExcl ?? round2(o.lines.reduce((s, l) => s + (l.unitPriceExcl ?? l.unitPriceIncl) * l.qty, 0)),
    currency: o.currency,
    // For the printed quotation: the Sage account it is on, and the message lines on it
    account: o.sageCustomer,
    accountName: o.sageCustomerName ?? null,
    messages: o.messages ?? [],
  };
}
