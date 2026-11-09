// Online orders and the documents they become in Sage Evolution.
//
// The admin sets the shop's workflow (Maintenance → Workflow): an order becomes a sales order
// (which can hold the stock) or an invoice straight away. Quotations are optional: when allowed, the
// shopper can ask for one instead of ordering, and staff convert it to a sales order in Sage
// Evolution. Every document is a row in the store database (dbo.StoreDocument +
// StoreDocumentLine, through SageAPI), keyed by the order's store number (WEB-…).
//
// Walk-in shoppers don't have a Sage account, so every document goes on the cash account chosen in
// Maintenance → Customers. The shopper's name, phone, email and delivery address are written on the
// document itself (Deliver To and the message lines), and each line is taken from the shopper's
// branch (its Sage warehouse).
//
// Each step is saved first as Pending, then made in Sage, then marked Posted with Sage's number or
// Failed with Sage's reason. So nothing reaches Sage without a record, the shopper can open their
// order again with its number and phone, and pressing a button twice never makes two documents.

import { randomBytes } from "node:crypto";
import { liveProduct, shopLocations } from "./catalogue.js";
import { config } from "./config.js";
import { HttpError } from "./errors.js";
import { SageApiError, sageApi } from "./sageApi.js";
import { shopCustomers } from "./shopCustomers.js";
import { type DocumentType, DOCUMENT_ORDER, firstStep, shopWorkflow } from "./shopWorkflow.js";

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

// ---------- documents ----------

type Fulfilment = "delivery" | "collection";
type Payment = "on_collection" | "on_delivery" | "online";
type DocStatus = "Pending" | "Posted" | "Failed" | "Cancelled";
export type { DocumentType };

/**
 * One step of an online order: its quotation, sales order or invoice. All the steps of one order
 * share its store number (WEB-…), and each later step points to the one it was made from.
 */
export interface StoredOrder {
  documentType: DocumentType;
  /** The record's id in dbo.StoreDocument (absent until saved). */
  documentId?: number;
  sourceDocumentId?: number | null;
  storeOrderNo: string;
  /** Checkout's key; only the first step has one. */
  idempotencyKey: string | null;
  /** Sage's number, e.g. SOQ0012, SO0034 or INV0101. Empty while Pending. */
  sageDocumentNo: string;
  sageCustomer: string;
  /** The account's name in Sage, for the "To:" block of the printed document. */
  sageCustomerName?: string | null;
  /** Pending = saved, Sage not confirmed yet; Posted = in Sage; Failed = Sage refused it. */
  status: DocStatus;
  failReason?: string | null;
  placedAt: string;
  shopper: { name: string; phone: string; email: string };
  fulfilment: Fulfilment;
  address: string | null;
  payment: Payment;
  branch: { code: string; name: string } | null;
  lines: { code: string; description: string; qty: number; unitPriceIncl: number; unitPriceExcl?: number; warehouse: string | null }[];
  totalIncl: number;
  totalExcl?: number;
  /** The three message lines written on the document in Sage. */
  messages?: string[];
  currency: string;
}

const LABEL: Record<DocumentType, string> = { Quotation: "quotation", SalesOrder: "order", Invoice: "invoice" };
const PAYMENTS: Payment[] = ["on_collection", "on_delivery", "online"];
const STATUSES: DocStatus[] = ["Pending", "Posted", "Failed", "Cancelled"];
const rank = (t: DocumentType) => DOCUMENT_ORDER.indexOf(t);

// ---------- the record in the store database (dbo.StoreDocument + StoreDocumentLine, via SageAPI) ----------

interface StoreDocument {
  documentId: number;
  documentType: string;
  documentNo: string;
  sageDocumentNo: string | null;
  status: string;
  sourceDocumentId: number | null;
  idempotencyKey: string | null;
  documentDate: string;
  sageAccount: string | null;
  sageAccountName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  fulfilment: string | null;
  deliveryAddress: string | null;
  payment: string | null;
  branchCode: string | null;
  branchName: string | null;
  messages: string[];
  currency: string;
  totalExcl: number;
  totalIncl: number;
  failReason: string | null;
  postedAt: string | null;
  createdAt: string;
  lines: { itemCode: string; description: string | null; warehouse: string | null; quantity: number; unitPriceExcl: number; unitPriceIncl: number }[];
}

const docType = (t: string): DocumentType => DOCUMENT_ORDER.find((d) => d === t) ?? "Quotation";

function toRecord(o: StoredOrder) {
  return {
    documentType: o.documentType,
    documentNo: o.storeOrderNo,
    sageDocumentNo: o.sageDocumentNo || null,
    status: o.status,
    sourceDocumentId: o.sourceDocumentId ?? null,
    idempotencyKey: o.idempotencyKey,
    documentDate: o.placedAt,
    sageAccount: o.sageCustomer,
    sageAccountName: o.sageCustomerName ?? null,
    customerName: o.shopper.name,
    customerPhone: o.shopper.phone,
    customerEmail: o.shopper.email || null,
    fulfilment: o.fulfilment,
    deliveryAddress: o.address,
    payment: o.payment,
    branchCode: o.branch?.code ?? null,
    branchName: o.branch?.name ?? null,
    messages: o.messages ?? [],
    currency: o.currency,
    lines: o.lines.map((l) => ({
      itemCode: l.code,
      description: l.description,
      warehouse: l.warehouse,
      quantity: l.qty,
      unitPriceExcl: l.unitPriceExcl ?? l.unitPriceIncl,
      unitPriceIncl: l.unitPriceIncl,
    })),
  };
}

function fromRecord(d: StoreDocument): StoredOrder {
  return {
    documentType: docType(d.documentType),
    documentId: d.documentId,
    sourceDocumentId: d.sourceDocumentId,
    storeOrderNo: d.documentNo,
    idempotencyKey: d.idempotencyKey,
    sageDocumentNo: d.sageDocumentNo ?? "",
    sageCustomer: d.sageAccount ?? "",
    sageCustomerName: d.sageAccountName,
    status: STATUSES.find((s) => s === d.status) ?? "Pending",
    failReason: d.failReason,
    placedAt: d.documentDate,
    shopper: { name: d.customerName ?? "", phone: d.customerPhone ?? "", email: d.customerEmail ?? "" },
    fulfilment: d.fulfilment === "delivery" ? "delivery" : "collection",
    address: d.deliveryAddress,
    payment: PAYMENTS.find((p) => p === d.payment) ?? "on_collection",
    branch: d.branchCode ? { code: d.branchCode, name: d.branchName ?? d.branchCode } : null,
    lines: (d.lines ?? []).map((l) => ({
      code: l.itemCode,
      description: l.description ?? l.itemCode,
      qty: l.quantity,
      unitPriceIncl: l.unitPriceIncl,
      unitPriceExcl: l.unitPriceExcl,
      warehouse: l.warehouse,
    })),
    totalIncl: d.totalIncl,
    totalExcl: d.totalExcl,
    messages: d.messages,
    currency: d.currency,
  };
}

const enc = encodeURIComponent;

const setStatus = (o: StoredOrder, status: "Pending" | "Posted" | "Failed", sageDocumentNo?: string, failReason?: string) =>
  sageApi<StoreDocument>("PUT", `/store/documents/${o.documentType}/${enc(o.storeOrderNo)}/status`, { status, sageDocumentNo, failReason });

/** One step of an order, with its lines. */
async function readStage(type: DocumentType, no: string): Promise<StoredOrder | null> {
  try {
    return fromRecord(await sageApi<StoreDocument>("GET", `/store/documents/${type}/${enc(no)}`));
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return null;
    throw e;
  }
}

/** The headers of every step of one order, first step first. */
async function stagesOf(no: string): Promise<StoreDocument[]> {
  const rows = await sageApi<StoreDocument[]>("GET", `/store/documents?search=${enc(no)}&take=20`);
  return (rows ?? []).filter((d) => d.documentNo === no).sort((a, b) => rank(docType(a.documentType)) - rank(docType(b.documentType)));
}

/** The step to show: the furthest one that didn't fail (or the furthest, if they all did). */
const furthest = (stages: StoreDocument[]) => [...stages].reverse().find((d) => d.status !== "Failed") ?? stages[stages.length - 1];

async function readOrder(no: string): Promise<StoredOrder | null> {
  if (!/^[A-Z0-9-]{4,30}$/.test(no)) return null;
  const stages = await stagesOf(no);
  if (stages.length === 0) return null;
  return readStage(docType(furthest(stages).documentType), no);
}

// ---------- Sage ----------

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

/** A new quotation or sales order as SageAPI wants it. Deliver To holds the shopper (the account is the shared cash account). */
function sageRequest(o: StoredOrder) {
  const addr = o.fulfilment === "delivery" ? o.address ?? "" : `Collect${o.branch ? ` at ${o.branch.name}` : ""}`;
  const messages = o.messages ?? [];
  return {
    customer: o.sageCustomer,
    externalOrderNo: o.storeOrderNo,
    description: fit(`Online shop ${LABEL[o.documentType]} ${o.storeOrderNo}`, 100),
    pricesIncludeTax: true,
    deliverTo: {
      line1: fit(o.shopper.name, 40),
      line2: fit(`Tel ${o.shopper.phone}`, 40),
      line3: fit(o.shopper.email, 40),
      line4: fit(addr, 40),
      line5: fit(addr.slice(40), 40),
      postalCode: "",
    },
    messageLine1: messages[0] ?? "",
    messageLine2: messages[1] ?? "",
    messageLine3: messages[2] ?? "",
    lines: o.lines.map((l) => ({ itemCode: l.code, quantity: l.qty, price: l.unitPriceIncl, warehouse: l.warehouse ?? "" })),
  };
}

/** Makes the document in Sage, through SageAPI's quotation, sales order and invoice endpoints. */
async function sendToSage(o: StoredOrder): Promise<string> {
  switch (o.documentType) {
    case "Quotation":
      return (await sageApi<{ quotationNo: string }>("POST", "/salesorder/quotation", sageRequest(o)))?.quotationNo?.trim() ?? "";
    case "SalesOrder": {
      const { reserveStock } = firstStep(await shopWorkflow());
      return (await sageApi<{ orderNo: string }>("POST", "/salesorder", { ...sageRequest(o), reserveStock: reserveStock !== false }))?.orderNo?.trim() ?? "";
    }
    case "Invoice": {
      const { lines, ...header } = sageRequest(o);
      const invoice = { ...header, lines: lines.map((l) => ({ itemCode: l.itemCode, quantity: l.quantity, price: l.price, warehouse: l.warehouse })) };
      return (await sageApi<{ invoiceNo: string }>("POST", "/salesorder/invoice", invoice))?.invoiceNo?.trim() ?? "";
    }
  }
}

/** Sage's number for this step, found by the store number (External Order No), or null. */
async function findInSage(o: StoredOrder): Promise<string | null> {
  try {
    const r = await sageApi<{ documentNo: string }>("GET", `/salesorder/by-external/${enc(o.storeOrderNo)}?type=${o.documentType}`);
    return r?.documentNo?.trim() || null;
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return null;
    throw e;
  }
}

const errText = (e: unknown) => (e instanceof SageApiError ? [e.message, e.detail].filter(Boolean).join(": ") : e instanceof Error ? e.message : String(e));

/**
 * Makes a Pending step in Sage and marks the record Posted, or Failed with Sage's reason.
 * With no answer from SageAPI it stays Pending: we can't know whether Sage made it, so the next
 * try (or the check every minute) looks in Sage before doing anything again.
 */
async function post(o: StoredOrder): Promise<StoredOrder> {
  let sageNo: string;
  try {
    sageNo = await sendToSage(o);
    if (!sageNo) throw new SageApiError(502, "Sage didn't return a document number.", true);
  } catch (e) {
    if (e instanceof SageApiError && !e.answered) {
      console.error(`${o.documentType} ${o.storeOrderNo}: no answer from SageAPI (${e.message}). Left Pending; checked in Sage before any retry.`);
      throw new HttpError(502, `We couldn't confirm your ${LABEL[o.documentType]} yet. Please wait a minute and try again. You won't get two.`);
    }
    const reason = errText(e);
    console.error(`${o.documentType} ${o.storeOrderNo} refused by Sage: ${reason}`);
    await setStatus(o, "Failed", undefined, reason).catch((err) => console.error(`Couldn't mark ${o.storeOrderNo} Failed: ${errText(err)}`));
    throw new StepFailed(o.documentType, reason);
  }

  const posted: StoredOrder = { ...o, sageDocumentNo: sageNo, status: "Posted", failReason: null };
  await setStatus(o, "Posted", sageNo).catch((err) =>
    // Sage has it; the record catches up on the next check, which finds it by its store number
    console.error(`${o.storeOrderNo} is ${sageNo} in Sage but still Pending in the store database: ${errText(err)}`),
  );
  console.log(`${o.documentType} ${sageNo} created in Sage on ${o.sageCustomer} for online order ${o.storeOrderNo} (${o.lines.length} lines, ${o.totalIncl} ${o.currency})`);
  return posted;
}

/** Sage refused a step. The shopper sees a polite message; staff see `reason` in Documents. */
export class StepFailed extends HttpError {
  constructor(
    public readonly document: DocumentType,
    public readonly reason: string,
  ) {
    super(502, `We couldn't create your ${LABEL[document]} right now. Please call us and we'll help.`);
  }
}

/** A Pending step: if Sage has it after all, mark it Posted; otherwise (when asked) send it again. */
async function settle(o: StoredOrder, resend: boolean): Promise<StoredOrder> {
  if (o.status !== "Pending") return o;
  // Queued in SageAPI behind any Sage request still running, so a slow first attempt is seen here
  const found = await findInSage(o);
  if (found) {
    await setStatus(o, "Posted", found);
    console.log(`${o.documentType} ${o.storeOrderNo} was made in Sage as ${found}; record marked Posted.`);
    return { ...o, sageDocumentNo: found, status: "Posted" };
  }
  return resend ? post(o) : o;
}

// Every minute: Pending steps older than a minute are checked in Sage. Found → Posted. Still not
// there after 10 minutes → Failed, so checkout's key is freed (the shopper can try again) and staff
// can see it in Documents.
const inFlight = new Map<string, Promise<StoredOrder>>();
const stepping = new Map<string, Promise<unknown>>(); // store number → a staff step running now
let checking = false;
async function checkPending() {
  if (checking) return;
  checking = true;
  try {
    const pending = await sageApi<StoreDocument[]>("GET", "/store/documents?status=Pending&take=50");
    for (const d of pending ?? []) {
      if ((d.idempotencyKey && inFlight.has(d.idempotencyKey)) || stepping.has(d.documentNo)) continue; // being made right now
      const age = Date.now() - new Date(d.createdAt).getTime();
      if (age < 60_000) continue;
      const o = fromRecord(d);
      const settled = await settle(o, false);
      if (settled.status === "Pending" && age > 10 * 60_000) {
        await setStatus(o, "Failed", undefined, "Never reached Sage (no answer from SageAPI).");
        console.error(`${o.documentType} ${o.storeOrderNo} never reached Sage; marked Failed.`);
      }
    }
  } catch (e) {
    console.error(`Checking Pending documents failed: ${errText(e)}`);
  } finally {
    checking = false;
  }
}
setTimeout(() => void checkPending(), 10_000).unref();
setInterval(() => void checkPending(), 60_000).unref();

// ---------- checkout ----------

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

  const payment: Payment = PAYMENTS.includes(body?.payment) ? body.payment : "on_collection";
  // The shopper asked for a quotation instead of ordering (only when the workflow allows it)
  const quotation = body?.quotation === true;
  return { shopper: { name, phone, email }, fulfilment, address, payment, quotation, lines: cleanLines(body?.lines), branch: body?.branch };
}

/**
 * Turns the cart into the workflow's document (Maintenance → Workflow): a sales order or an invoice,
 * or a quotation when the shopper asked for one and the workflow allows it. Same idempotency key →
 * the same order comes back. Throws 409 with the fresh quote when prices or stock changed.
 */
export async function placeOrder(body: unknown, idempotencyKey: string): Promise<{ order: StoredOrder; duplicate: boolean }> {
  const key = idempotencyKey.trim();
  if (key.length < 8 || key.length > 100) throw new HttpError(400, "Missing Idempotency-Key header.");

  const running = inFlight.get(key);
  if (running) return { order: await running, duplicate: true };

  const work = (async () => {
    // Already saved with this key? Never guess: if the database can't be asked, stop here
    let hits: StoreDocument[];
    try {
      hits = await sageApi<StoreDocument[]>("GET", `/store/documents?key=${enc(key)}&take=1`);
    } catch (e) {
      console.error(`Checkout refused: the store database can't be reached (${errText(e)}).`);
      throw new HttpError(503, "We can't take orders online right now. Please try again in a minute.");
    }
    const hit = hits?.[0];
    const existing = hit ? await readStage(docType(hit.documentType), hit.documentNo) : null;
    if (existing) return { order: await settle(existing, true), duplicate: true };
    return { order: await createDocument(readRequest(body), key), duplicate: false };
  })();

  // A second press waits on this copy. Its failure is answered by `await work` below, so the copy
  // must not count as unhandled (Node stops the whole server on an unhandled rejection).
  const shared = work.then((r) => r.order);
  shared.catch(() => {});
  inFlight.set(key, shared);
  try {
    return await work;
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

async function createDocument(req: ReturnType<typeof readRequest>, key: string): Promise<StoredOrder> {
  const [{ cashAccount, cashAccountName }, workflow] = await Promise.all([shopCustomers(), shopWorkflow()]);
  if (!cashAccount) {
    console.error("Checkout refused: no cash account. Choose one in the admin portal under Maintenance → Customers.");
    throw new HttpError(503, "We can't take orders online right now. Please call us and we'll help.");
  }

  if (req.quotation && !workflow.allowQuotation) throw new HttpError(400, "Quotations aren't offered online. Please place your order.");

  const { branch, priced, quote } = await priceDocket(req.lines, req.branch);
  if (!quote.clean) throw new QuoteChanged(quote);

  const now = new Date();
  const storeOrderNo = newOrderNo(now);
  const where = req.fulfilment === "delivery" ? `Deliver: ${req.address}` : `Collect${branch ? ` at ${branch.name}` : ""}`;

  const order: StoredOrder = {
    documentType: req.quotation ? "Quotation" : firstStep(workflow).document,
    storeOrderNo,
    idempotencyKey: key,
    sageDocumentNo: "",
    sageCustomer: cashAccount,
    sageCustomerName: cashAccountName,
    status: "Pending",
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
    messages: [
      fit(`Online shop ${storeOrderNo} · ${req.shopper.name} · ${req.shopper.phone}`, 100),
      fit(`${where} · ${PAYMENT_TEXT[req.payment]}`, 100),
      fit(req.shopper.email ? `Email ${req.shopper.email}` : "", 100),
    ],
    currency: config.currency,
  };

  // 1. Saved first, so nothing reaches Sage without a record of it
  let saved: StoredOrder;
  try {
    saved = fromRecord(await sageApi<StoreDocument>("POST", "/store/documents", toRecord(order)));
  } catch (e) {
    console.error(`Checkout refused: couldn't save ${storeOrderNo} in the store database (${errText(e)}).`);
    throw new HttpError(503, "We can't take orders online right now. Please try again in a minute.");
  }
  // Another request with the same key saved first: that one is the order
  if (saved.storeOrderNo !== storeOrderNo) return settle(saved, true);

  // 2. Then made in Sage and marked Posted (or Failed)
  return post({ ...order, documentId: saved.documentId });
}

/** What the shopper sees: the furthest step. Found only with the number and the phone (or email) given at checkout. */
export async function findOrder(no: string, contact: string) {
  let o = await readOrder(no.trim().toUpperCase());
  const c = contact.trim().toLowerCase();
  const matches =
    o && c && ((digits(c).length >= 7 && digits(c).slice(-9) === digits(o.shopper.phone).slice(-9)) || (o.shopper.email && c === o.shopper.email.toLowerCase()));
  if (!o || !matches) throw new HttpError(404, "We couldn't find a quotation or order with that number and phone number.");
  if (o.status === "Pending") o = await settle(o, false).catch(() => o!);
  return {
    documentType: o.documentType,
    storeOrderNo: o.storeOrderNo,
    status: o.status,
    placedAt: o.placedAt,
    updatedAt: o.placedAt,
    sageDocumentNo: o.sageDocumentNo || null,
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
    // For the printed document: the Sage account it is on, and the message lines on it
    account: o.sageCustomer,
    accountName: o.sageCustomerName ?? null,
    messages: o.messages ?? [],
  };
}

// ---------- admin → Documents ----------

export interface AdminOrderStage {
  documentType: DocumentType;
  sageDocumentNo: string | null;
  status: DocStatus;
  failReason: string | null;
  date: string;
}

/** What staff can do with an order: try a document Sage refused again, or check one Sage hasn't confirmed. */
export type NextAction = { kind: "retry"; document: DocumentType } | { kind: "check"; document: DocumentType } | null;

export interface AdminOrder {
  storeOrderNo: string;
  placedAt: string;
  customerName: string;
  customerPhone: string;
  branchName: string | null;
  fulfilment: string;
  payment: string;
  totalIncl: number;
  currency: string;
  stages: AdminOrderStage[];
  next: NextAction;
}

function nextAction(stages: StoreDocument[]): NextAction {
  const last = stages[stages.length - 1];
  const type = docType(last.documentType);
  if (last.status === "Failed") return { kind: "retry", document: type };
  if (last.status === "Pending") return { kind: "check", document: type };
  return null;
}

/** Online orders, newest first, each with its documents and anything staff need to do. */
export async function listOrders(q: { search?: string; status?: string; take?: number }): Promise<AdminOrder[]> {
  const params = new URLSearchParams({ take: String(Math.min(Math.max(q.take ?? 300, 1), 500)) });
  if (q.search?.trim()) params.set("search", q.search.trim().slice(0, 100));
  const rows = (await sageApi<StoreDocument[]>("GET", `/store/documents?${params}`)) ?? [];

  const byNo = new Map<string, StoreDocument[]>();
  for (const d of rows) byNo.set(d.documentNo, [...(byNo.get(d.documentNo) ?? []), d]);

  const orders = [...byNo.values()].map((all): AdminOrder => {
    const stages = all.sort((a, b) => rank(docType(a.documentType)) - rank(docType(b.documentType)));
    const head = stages[0];
    return {
      storeOrderNo: head.documentNo,
      placedAt: head.documentDate,
      customerName: head.customerName ?? "",
      customerPhone: head.customerPhone ?? "",
      branchName: head.branchName,
      fulfilment: head.fulfilment ?? "collection",
      payment: head.payment ?? "on_collection",
      totalIncl: head.totalIncl,
      currency: head.currency,
      stages: stages.map((d) => ({
        documentType: docType(d.documentType),
        sageDocumentNo: d.sageDocumentNo,
        status: STATUSES.find((s) => s === d.status) ?? "Pending",
        failReason: d.failReason,
        date: d.postedAt ?? d.createdAt,
      })),
      next: nextAction(stages),
    };
  });

  const wanted = q.status === "problem" ? (o: AdminOrder) => o.next !== null : () => true;
  return orders.filter(wanted).sort((a, b) => b.placedAt.localeCompare(a.placedAt));
}

/**
 * Staff press the button on an order: try a document Sage refused again, or check a Pending one in
 * Sage (made it after all → Posted; not there → sent again). Returns the order as it is now.
 */
export async function runNextStep(no: string): Promise<AdminOrder> {
  const storeNo = no.trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,30}$/.test(storeNo)) throw new HttpError(400, "That isn't a store order number.");
  if (stepping.has(storeNo)) throw new HttpError(409, "That order is being processed right now. Refresh in a moment.");

  const work = (async () => {
    const stages = await stagesOf(storeNo);
    if (stages.length === 0) throw new HttpError(404, `There is no order ${storeNo}.`);
    const last = stages[stages.length - 1];
    const current = await readStage(docType(last.documentType), storeNo);
    if (!current) throw new HttpError(404, `There is no order ${storeNo}.`);

    try {
      if (current.status === "Failed") {
        await setStatus(current, "Pending");
        await settle({ ...current, status: "Pending" }, true);
      } else if (current.status === "Pending") {
        await settle(current, true);
      } else {
        throw new HttpError(409, `This ${LABEL[current.documentType]} is already ${current.status.toLowerCase()} in Sage.`);
      }
    } catch (e) {
      // Sage's own reason, for staff
      if (e instanceof StepFailed) throw new HttpError(502, `Sage refused the ${LABEL[e.document]}: ${e.reason}`);
      throw e;
    }
    const [now] = await listOrders({ search: storeNo, take: 20 });
    return now;
  })();

  stepping.set(storeNo, work);
  try {
    return await work;
  } finally {
    stepping.delete(storeNo);
  }
}
