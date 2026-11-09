// Sample Sage data for the mock store: stock items, prices, quantities and item groups.

export const VAT = 0.15;
export const CURRENCY = "USD";
export const PRICE_LIST = "USD-RETAIL";

const seed: [code: string, description: string, priceIncl: number | null, qty: number][] = [
  ["47195/ORB", "Orbital sander 240W with dust bag", 64.5, 7],
  ["10021", "Claw hammer 450g fibreglass handle", 12.9, 42],
  ["10022", "Club hammer 1.25kg", 15.75, 18],
  ["10310", "Tape measure 8m x 25mm", 9.4, 61],
  ["10311", "Spirit level 600mm aluminium", 18.2, 3],
  ["11800/BLK", "Cable ties 300mm black pack of 100", 4.95, 120],
  ["11801/WHT", "Cable ties 200mm white pack of 100", 3.6, 0],
  ["12050", "Wheelbarrow 65L heavy duty", 79.0, 9],
  ["12210", "Garden hose 30m with fittings", 34.99, 14],
  ["12211", "Hose spray gun 7 pattern", 8.5, 26],
  ["13400", "PVC pipe 40mm x 6m", 11.3, 88],
  ["13401", "PVC elbow 40mm 90 degree", 0.85, 340],
  ["13402", "PVC solvent cement 250ml", 6.1, 2],
  ["14500/20", "Cement 50kg bag PC 42.5", 13.5, 210],
  ["14510", "River sand per 50kg bag", 3.2, 0],
  ["15000", "Padlock 50mm brass laminated", 14.6, 31],
  ["15001", "Padlock 40mm keyed alike set of 3", 22.0, 5],
  ["16020", "LED bulb 9W E27 warm white", 2.75, 240],
  ["16021", "LED bulb 12W B22 daylight", 3.4, 4],
  ["16300", "Extension reel 25m 4 socket", 41.9, 6],
  ["16301", "Plug adaptor 3 way", 3.95, 77],
  ["17000", "Roof paint red oxide 5L", 38.0, 12],
  ["17001", "PVA interior white 20L", 54.0, 8],
  ["17002", "Paint roller 230mm with tray", 7.8, 45],
  ["17003", "Paint brush set 5 piece", 6.95, 0],
  ["18110", "Drill bit set HSS 13 piece", 16.4, 22],
  ["18111", "Masonry bit 8mm", 2.1, 95],
  ["18400/18V", "Cordless drill 18V with 2 batteries", 129.0, 4],
  ["18401", "Angle grinder 115mm 750W", 48.5, 11],
  ["18402", "Cutting disc 115mm steel pack of 10", 9.9, 150],
  ["19000", "Safety goggles clear", 3.3, 64],
  ["19001", "Work gloves leather pair", 5.2, 38],
  ["19002", "Dust masks FFP2 pack of 10", 11.5, 0],
  ["20100", "Wood screws 4x40 box of 200", 5.6, 73],
  ["20101", "Wall plugs 6mm pack of 100", 2.4, 130],
  ["20102", "Coach bolts M10x100 pack of 10", 7.25, 19],
  ["21000", "Step ladder 6 step aluminium", 69.0, 2],
  ["21500", "Silicone sealant clear 280ml", 4.8, 57],
  ["21501", "Caulking gun", 5.5, 23],
  ["22000/ZN", "Corrugated roof sheet 3m zinc", 17.9, 140],
  ["22001", "Roofing nails 1kg", 4.1, 66],
  ["23000", "Water tank 2500L", 189.0, 1],
  ["23001", "Tank tap 20mm brass", 6.75, 29],
  ["24000", "Wheel spanner set metric", 23.4, 0],
  ["24500", "Socket set 1/2in drive 24 piece", 44.0, 7],
  ["25000", "Chain 6mm galvanised per metre", 3.9, 300],
  ["25500", "Gate hinge heavy duty pair", 12.0, 15],
  // No price on the store price list yet: shown but not orderable
  ["26000", "Pruning shears bypass", null, 9],
];

// Stand-ins for Sage item groups (StkItem.ItemGroup)
export const GROUPS: Record<string, string> = {
  HAND: "Hand tools",
  POWER: "Power tools",
  ELEC: "Electrical & lighting",
  PLUMB: "Plumbing & water",
  BUILD: "Building materials",
  ROOF: "Roofing",
  PAINT: "Paint & decor",
  GARDEN: "Garden",
  FIX: "Fixings & hardware",
  SAFE: "Safety & security",
};
const GROUP_BY_PREFIX: Record<string, string> = {
  "10": "HAND", "11": "ELEC", "12": "GARDEN", "13": "PLUMB", "14": "BUILD", "15": "SAFE", "16": "ELEC",
  "17": "PAINT", "18": "POWER", "19": "SAFE", "20": "FIX", "21": "FIX", "22": "ROOF", "23": "PLUMB",
  "24": "HAND", "25": "FIX", "26": "GARDEN", "47": "POWER",
};

/** A stock item as Sage holds it: no store category or photos. */
export interface MockItem {
  code: string;
  description: string;
  priceIncl: number | null;
  priceExcl: number | null;
  qtyOnHand: number;
  /** Sage item group code */
  group: string | null;
}

export const catalogue: MockItem[] = seed.map(([code, description, priceIncl, qty]) => ({
  code,
  description,
  priceIncl,
  priceExcl: priceIncl == null ? null : round(priceIncl / (1 + VAT)),
  qtyOnHand: qty,
  group: GROUP_BY_PREFIX[code.slice(0, 2)] ?? null,
}));

// Two prices change 90s after load, so the checkout's "price changed since you added it" path can be seen.
const liveDrift = new Map<string, number>([["17001", 56.5], ["10311", 17.5]]);
setTimeout(() => {
  for (const [code, price] of liveDrift) {
    const item = catalogue.find((i) => i.code === code);
    if (item) {
      item.priceIncl = price;
      item.priceExcl = round(price / (1 + VAT));
    }
  }
}, 90_000);

export const refreshedAt = new Date().toISOString();

export function round(n: number) {
  return Math.round(n * 100) / 100;
}
export function wait<T>(value: T, ms = 250 + Math.random() * 350): Promise<T> {
  return new Promise((r) => setTimeout(() => r(structuredClone(value)), ms));
}
export function find(code: string) {
  return catalogue.find((i) => i.code.toLowerCase() === code.toLowerCase());
}


export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
