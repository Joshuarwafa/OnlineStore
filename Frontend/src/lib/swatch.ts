// Sage holds no product images, so an item without an uploaded photo gets a generated tile:
// a soft colour gradient with the item's initials. Same item, same colour, every time.

export function initialsOf(description: string): string {
  const words = description
    .replace(/[^A-Za-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "··";
}

// A curated set of hues (OKLCH degrees) that sit well together and with the evergreen brand.
const HUES = [155, 185, 215, 250, 290, 340, 25, 60, 95, 130];

/** Picks a palette hue from the first word, so related products (same brand) share a colour. */
export function hueOf(text: string): number {
  const key = (text.trim().split(/[\s:]+/)[0] || text).toLowerCase();
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return HUES[(h >>> 0) % HUES.length];
}
