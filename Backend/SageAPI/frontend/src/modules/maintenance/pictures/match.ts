// Matches picture files to items by file name. A "/" can't be used in a file name, so codes are
// compared on their letters and digits only: 457265U-WRI.jpg, 457265U_WRI.jpg and 457265uwri.jpg
// all match item 457265U/WRI. Extra pictures of one item end in _2, -2, " 2" or " (2)".

export interface ItemRef {
  itemCode: string;
  description: string;
}

export type FileMatch =
  | { kind: "item"; item: ItemRef; number: number }
  | { kind: "none" }
  | { kind: "ambiguous"; codes: string[] };

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function buildMatcher(items: ItemRef[]) {
  const byKey = new Map<string, ItemRef[]>();
  for (const item of items) {
    const k = key(item.itemCode);
    if (k) byKey.set(k, [...(byKey.get(k) ?? []), item]);
  }

  const lookup = (stem: string): FileMatch | null => {
    const found = byKey.get(key(stem));
    if (!found) return null;
    return found.length === 1 ? { kind: "item", item: found[0], number: 1 } : { kind: "ambiguous", codes: found.map((i) => i.itemCode) };
  };

  return (fileName: string): FileMatch => {
    const stem = fileName.replace(/\.[^.]+$/, "").trim();
    // The whole name first, so a code that ends in digits isn't mistaken for "picture 2"
    const whole = lookup(stem);
    if (whole) return whole;
    const numbered = stem.match(/^(.+?)(?:[_\s-]+\(?(\d{1,2})\)?|\s*\((\d{1,2})\))$/);
    if (numbered) {
      const base = lookup(numbered[1]);
      if (base?.kind === "item") return { ...base, number: Number(numbered[2] ?? numbered[3]) };
      if (base) return base;
    }
    return { kind: "none" };
  };
}
