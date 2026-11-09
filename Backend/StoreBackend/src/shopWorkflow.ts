// The shop's workflow (admin portal → Maintenance → Workflow): what an online order becomes in Sage.
// Each installation sets its own:
//
//   An order becomes either
//     • a sales order — saved in Sage, optionally holding the stock; staff invoice it in Sage, or
//     • an invoice straight away — stock goes out and the sale is posted at checkout.
//
//   Quotations are optional: when allowed, a shopper can ask for a quotation instead of ordering.
//   Staff convert it to a sales order in Sage Evolution when the customer goes ahead.
//
// Kept in data/shop-workflow.json next to the pictures.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { config } from "./config.js";
import { HttpError } from "./errors.js";

export type DocumentType = "Quotation" | "SalesOrder" | "Invoice";

export interface WorkflowStep {
  /** What checkout makes for an order: a sales order or an invoice. */
  document: "SalesOrder" | "Invoice";
  trigger: "checkout";
  /** Sales order only: hold each line's quantity in its warehouse until invoiced or cancelled. */
  reserveStock?: boolean;
}

export interface ShopWorkflow {
  /** One step, made at checkout. A list so later steps can be added without changing the file. */
  steps: [WorkflowStep];
  /** Shoppers may ask for a quotation instead of ordering. */
  allowQuotation: boolean;
}

/** The order documents run in. */
export const DOCUMENT_ORDER: DocumentType[] = ["Quotation", "SalesOrder", "Invoice"];

const DEFAULT: ShopWorkflow = {
  steps: [{ document: "SalesOrder", trigger: "checkout", reserveStock: true }],
  allowQuotation: true,
};
const FILE = join(dirname(config.imagesDir), "shop-workflow.json");
let cached: ShopWorkflow | null = null;

/** Checks and tidies a workflow; throws a message the admin can act on. */
function validate(raw: any): ShopWorkflow {
  const start = Array.isArray(raw?.steps) ? raw.steps[0] : null;
  if (start?.document === "Invoice") return { steps: [{ document: "Invoice", trigger: "checkout" }], allowQuotation: raw?.allowQuotation === true };
  if (start?.document === "SalesOrder") {
    return {
      steps: [{ document: "SalesOrder", trigger: "checkout", reserveStock: start.reserveStock !== false }],
      allowQuotation: raw?.allowQuotation === true,
    };
  }
  throw new HttpError(400, "Choose what an order becomes: a sales order or an invoice.");
}

/** Reads the saved file, including the earlier forms (checkoutDocument, or steps starting with a quotation). */
function fromFile(raw: any): ShopWorkflow {
  if (!Array.isArray(raw?.steps) && raw?.checkoutDocument) {
    raw = { steps: [{ document: "SalesOrder", reserveStock: raw.reserveStock !== false }], allowQuotation: raw.checkoutDocument === "Quotation" };
  } else if (raw?.steps?.[0]?.document === "Quotation") {
    const rest = raw.steps.slice(1);
    raw = { steps: rest.length ? rest : [{ document: "SalesOrder", reserveStock: true }], allowQuotation: true };
  }
  try {
    return validate(raw);
  } catch {
    return structuredClone(DEFAULT);
  }
}

export async function shopWorkflow(): Promise<ShopWorkflow> {
  if (cached) return cached;
  try {
    cached = fromFile(JSON.parse(await readFile(FILE, "utf8")));
  } catch {
    cached = structuredClone(DEFAULT); // not set yet
  }
  return cached;
}

export async function saveShopWorkflow(input: unknown): Promise<ShopWorkflow> {
  const workflow = validate(input);
  await mkdir(dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`; // write then rename, so a crash never leaves a half-written file
  await writeFile(tmp, JSON.stringify({ ...workflow, savedAt: new Date().toISOString() }, null, 2));
  await rename(tmp, FILE);
  cached = workflow;
  console.log(`Workflow saved: ${describeWorkflow(workflow)}`);
  return workflow;
}

/** "sales order (reserve); quotations allowed" */
export function describeWorkflow(w: ShopWorkflow): string {
  const s = w.steps[0];
  const order = s.document === "SalesOrder" ? `sales order (${s.reserveStock ? "reserve" : "no reserve"})` : "invoice";
  return `${order}; quotations ${w.allowQuotation ? "allowed" : "off"}`;
}

/** What checkout makes for an order. */
export const firstStep = (w: ShopWorkflow) => w.steps[0];
