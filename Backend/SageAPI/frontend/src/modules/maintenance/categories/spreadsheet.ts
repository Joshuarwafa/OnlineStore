import { readSheet } from "read-excel-file/browser";
import writeXlsxFile from "write-excel-file/browser";
import type { ImportRow, StoreCategory, StoreItem } from "./api";

// The template's columns. Uploads are matched by header name, so column order doesn't matter.
export const COLUMNS = ["Item code", "Description", "Sage group", "Category", "Show in store"] as const;

const HEADER_ALIASES: Record<keyof Omit<ImportRow, "row">, string[]> = {
  itemCode: ["item code", "itemcode", "code", "item"],
  category: ["category", "store category"],
  show: ["show in store", "show", "visible", "show on store"],
};

/** One row per active Sage item, with its current category filled in. */
function templateRows(items: StoreItem[], categories: StoreCategory[]): string[][] {
  return [...items]
    .sort((a, b) => (a.sageGroup ?? "").localeCompare(b.sageGroup ?? "") || a.description.localeCompare(b.description))
    .map((item) => [
      item.itemCode,
      item.description,
      item.sageGroup ?? "",
      categories.find((c) => c.categoryId === item.categoryId)?.name ?? "",
      item.isVisible ? "Yes" : "No",
    ]);
}

export async function downloadTemplateXlsx(items: StoreItem[], categories: StoreCategory[]) {
  const header = COLUMNS.map((value) => ({ value, fontWeight: "bold" as const, backgroundColor: "#E6EFFD" }));
  await writeXlsxFile([header, ...templateRows(items, categories)], {
    sheet: "Categories",
    stickyRowsCount: 1,
    columns: [{ width: 18 }, { width: 44 }, { width: 28 }, { width: 26 }, { width: 14 }],
  }).toFile("store-categories.xlsx");
}

export function downloadTemplateCsv(items: StoreItem[], categories: StoreCategory[]) {
  const escape = (v: string) => (/[",\n\r;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [[...COLUMNS], ...templateRows(items, categories)].map((r) => r.map(escape).join(","));
  // The BOM makes Excel open the file as UTF-8
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: "store-categories.csv" });
  a.click();
  URL.revokeObjectURL(url);
}

/** Reads an .xlsx or .csv file into upload rows. Throws an Error with a message for the user. */
export async function readUpload(file: File): Promise<ImportRow[]> {
  const name = file.name.toLowerCase();
  let table: string[][];
  if (name.endsWith(".csv")) {
    table = parseCsv(await file.text());
  } else if (name.endsWith(".xlsx")) {
    const data = await readSheet(file);
    table = data.map((row) => row.map((cell) => (cell == null ? "" : cell instanceof Date ? cell.toISOString() : String(cell))));
  } else {
    throw new Error("Choose an Excel (.xlsx) or CSV (.csv) file.");
  }

  const headerIndex = table.findIndex((r) => r.some((c) => c.trim() !== ""));
  if (headerIndex < 0) throw new Error("The file is empty.");
  const header = table[headerIndex].map((h) => h.trim().toLowerCase());

  const columnOf = (key: keyof typeof HEADER_ALIASES) => header.findIndex((h) => HEADER_ALIASES[key].includes(h));
  const cols = {
    itemCode: columnOf("itemCode"),
    category: columnOf("category"),
    show: columnOf("show"),
  };
  if (cols.itemCode < 0) throw new Error('The file needs an "Item code" column. Download the template to see the expected layout.');
  if (cols.category < 0 && cols.show < 0) throw new Error('The file needs a "Category" column (and optionally "Show in store").');

  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() || undefined : undefined);
  return table.slice(headerIndex + 1).map((r, i) => ({
    row: headerIndex + i + 2, // spreadsheet row numbers start at 1, plus the header
    itemCode: cell(r, cols.itemCode),
    category: cell(r, cols.category),
    show: cell(r, cols.show),
  }));
}

/** CSV with quoted fields; accepts comma or semicolon (Excel uses ";" in some regions). */
export function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, "");
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
