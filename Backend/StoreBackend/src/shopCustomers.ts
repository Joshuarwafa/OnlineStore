// Which Sage customer account the shop uses for walk-in shoppers (people without an account),
// chosen in the admin portal under Maintenance → Customers. Quotations and orders from walk-in
// shoppers are created on this account, with the shopper's own details written on the document.
//
// Kept in data/shop-customers.json next to the pictures. Until it is chosen in the admin portal,
// STORE_CASH_CUSTOMER from .env is used (if set).

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { config } from "./config.js";
import { HttpError } from "./errors.js";
import { sageApi } from "./sageApi.js";

export interface CustomerRow {
  account: string;
  name: string;
}

export interface CustomerPage {
  total: number;
  page: number;
  pageSize: number;
  items: CustomerRow[];
}

export interface ShopCustomers {
  /** Sage account for walk-in shoppers, e.g. FCA-INT502. null = not chosen yet. */
  cashAccount: string | null;
  /** Its name as Sage had it when chosen, for display. */
  cashAccountName: string | null;
  /** "admin" once chosen in the admin portal; "env" while using STORE_CASH_CUSTOMER; "none" when neither. */
  source: "admin" | "env" | "none";
}

const FILE = join(dirname(config.imagesDir), "shop-customers.json");
let cached: ShopCustomers | null = null;

function fromEnv(): ShopCustomers {
  const account = process.env.STORE_CASH_CUSTOMER?.trim() || null;
  return { cashAccount: account, cashAccountName: null, source: account ? "env" : "none" };
}

export async function shopCustomers(): Promise<ShopCustomers> {
  if (cached) return cached;
  try {
    const raw = JSON.parse(await readFile(FILE, "utf8"));
    const account = typeof raw?.cashAccount === "string" && raw.cashAccount.trim() ? raw.cashAccount.trim() : null;
    cached = account
      ? { cashAccount: account, cashAccountName: typeof raw.cashAccountName === "string" ? raw.cashAccountName : null, source: "admin" }
      : fromEnv();
  } catch {
    cached = fromEnv(); // no file yet
  }
  return cached;
}

// SageAPI returns every customer in one list; it is kept here for a few minutes so searching and
// paging in the admin portal doesn't re-read Sage on every keystroke.
const LIST_MAX_AGE_MS = 5 * 60_000;
let list: { rows: CustomerRow[]; loadedAt: number } | null = null;

async function allCustomers(): Promise<CustomerRow[]> {
  if (list && Date.now() - list.loadedAt < LIST_MAX_AGE_MS) return list.rows;
  let rows: CustomerRow[];
  try {
    rows = await sageApi<CustomerRow[]>("GET", "/customers");
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) rows = []; // Sage has no customers
    else throw e;
  }
  rows = (rows ?? [])
    .map((c) => ({ account: (c.account ?? "").trim(), name: (c.name ?? "").trim() }))
    .filter((c) => c.account)
    .sort((a, b) => a.account.localeCompare(b.account));
  list = { rows, loadedAt: Date.now() };
  return rows;
}

/** One page of Sage customers (account and name), searched by account or name. */
export async function searchCustomers(search: string, page: number, pageSize: number): Promise<CustomerPage> {
  const term = search.trim().toLowerCase();
  const rows = (await allCustomers()).filter((c) => !term || c.account.toLowerCase().includes(term) || c.name.toLowerCase().includes(term));
  const start = (page - 1) * pageSize;
  return { total: rows.length, page, pageSize, items: rows.slice(start, start + pageSize) };
}

/** Save the walk-in (cash) customer. The account must exist in Sage. */
export async function saveCashAccount(input: unknown): Promise<ShopCustomers> {
  const account = typeof input === "string" ? input.trim() : "";
  if (!account) throw new HttpError(400, "Choose a customer account.");
  if (account.length > 40) throw new HttpError(400, "That account code is too long.");

  // Check it against Sage, and keep its name for display
  list = null; // re-read, so an account added in Sage a minute ago is found
  const found = (await allCustomers()).find((c) => c.account.toLowerCase() === account.toLowerCase());
  if (!found) throw new HttpError(400, `Customer '${account}' doesn't exist in Sage.`);

  await mkdir(dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`; // write then rename, so a crash never leaves a half-written file
  await writeFile(tmp, JSON.stringify({ cashAccount: found.account, cashAccountName: found.name.trim(), savedAt: new Date().toISOString() }, null, 2));
  await rename(tmp, FILE);
  cached = { cashAccount: found.account, cashAccountName: found.name.trim(), source: "admin" };
  console.log(`Cash customer for walk-in shoppers saved: ${found.account} (${found.name.trim()})`);
  return cached;
}
