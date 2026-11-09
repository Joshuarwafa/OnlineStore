// The company's own details printed at the top of every quotation (Maintenance → Company in the
// admin portal). These are the seller's details and stay the same on every document; the customer's
// details come from the quotation itself.
//
// Kept in data/shop-company.json next to the pictures.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { config } from "./config.js";
import { HttpError } from "./errors.js";

export interface ShopCompany {
  name: string;
  /** Up to four address lines, e.g. "4 Empress Street", "Belmont", "Bulawayo". */
  address: string[];
  taxNumber: string;
  telephone: string;
  fax: string;
  email: string;
  /** Optional text at the bottom of the quotation, e.g. bank details or "Valid for 7 days". */
  footer: string;
}

const EMPTY: ShopCompany = { name: "", address: ["", "", "", ""], taxNumber: "", telephone: "", fax: "", email: "", footer: "" };
const FILE = join(dirname(config.imagesDir), "shop-company.json");
let cached: ShopCompany | null = null;

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

function clean(raw: any): ShopCompany {
  const lines = Array.isArray(raw?.address) ? raw.address : [];
  return {
    name: text(raw?.name, 100),
    address: [0, 1, 2, 3].map((i) => text(lines[i], 60)),
    taxNumber: text(raw?.taxNumber, 40),
    telephone: text(raw?.telephone, 40),
    fax: text(raw?.fax, 40),
    email: text(raw?.email, 100),
    // keep line breaks in the footer (bank details are usually several lines)
    footer: typeof raw?.footer === "string" ? raw.footer.replace(/\r/g, "").trim().slice(0, 600) : "",
  };
}

export async function shopCompany(): Promise<ShopCompany> {
  if (cached) return cached;
  try {
    cached = clean(JSON.parse(await readFile(FILE, "utf8")));
  } catch {
    cached = { ...EMPTY, address: [...EMPTY.address] }; // not filled in yet
  }
  return cached;
}

export async function saveShopCompany(input: unknown): Promise<ShopCompany> {
  const company = clean(input);
  if (!company.name) throw new HttpError(400, "Enter the company name.");
  if (company.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(company.email)) throw new HttpError(400, "That email doesn't look right.");

  await mkdir(dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`; // write then rename, so a crash never leaves a half-written file
  await writeFile(tmp, JSON.stringify({ ...company, savedAt: new Date().toISOString() }, null, 2));
  await rename(tmp, FILE);
  cached = company;
  console.log(`Company details for quotations saved: ${company.name}`);
  return company;
}
