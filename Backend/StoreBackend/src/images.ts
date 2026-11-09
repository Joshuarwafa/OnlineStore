// Product pictures, kept in a folder next to the store backend (no cloud storage).
// Every upload is re-encoded with sharp: that checks it really is a picture, turns phone photos the
// right way up, drops camera data (GPS etc.) and makes two WebP files:
//   <id>.webp        up to 1600 px, product page
//   <id>-thumb.webp  up to 600 px, lists and cards
// index.json records which pictures belong to which item (first = main picture).

import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { config } from "./config.js";
import { HttpError } from "./errors.js";

export const MAX_PICTURES = 8;
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MIN_EDGE = 300;
const FULL_EDGE = 1600;
const THUMB_EDGE = 600;

interface StoredPicture {
  id: string;
  width: number;
  height: number;
}

export interface ProductImage extends StoredPicture {
  url: string;
  thumbUrl: string;
}

export const filesDir = join(config.imagesDir, "files");
const indexFile = join(config.imagesDir, "index.json");
mkdirSync(filesDir, { recursive: true });

// item code → its pictures, main picture first
let index: Record<string, StoredPicture[]> = (() => {
  try {
    return JSON.parse(readFileSync(indexFile, "utf8")).items ?? {};
  } catch {
    return {};
  }
})();

// Changes run one at a time so two uploads can't overwrite each other's index entry
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.catch(() => undefined);
  return run;
}

async function saveIndex() {
  const tmp = `${indexFile}.tmp`;
  await writeFile(tmp, JSON.stringify({ items: index }, null, 1));
  await rename(tmp, indexFile);
}

const publicUrl = (file: string) => `${config.publicImageBaseUrl}/api/images/${file}`;
const withUrls = (p: StoredPicture): ProductImage => ({ ...p, url: publicUrl(`${p.id}.webp`), thumbUrl: publicUrl(`${p.id}-thumb.webp`) });

function cleanCode(code: string) {
  const c = code.trim();
  if (!c || c.length > 50 || /[\u0000-\u001f]/.test(c)) throw new HttpError(400, "That item code isn't valid.");
  return c;
}

/** Pictures of one item, main picture first. */
export const picturesOf = (code: string): ProductImage[] => (index[code] ?? []).map(withUrls);

/** Main picture (thumbnail size) for lists and cards, or null. */
export const mainThumbUrl = (code: string): string | null => {
  const first = index[code]?.[0];
  return first ? publicUrl(`${first.id}-thumb.webp`) : null;
};

/** Every item that has pictures. */
export const allPictures = (): Record<string, ProductImage[]> =>
  Object.fromEntries(Object.entries(index).map(([code, pics]) => [code, pics.map(withUrls)]));

export function addPicture(rawCode: string, data: Buffer): Promise<ProductImage> {
  const code = cleanCode(rawCode);
  return exclusive(async () => {
    if ((index[code]?.length ?? 0) >= MAX_PICTURES) throw new HttpError(422, `An item can have at most ${MAX_PICTURES} pictures. Delete one first.`);

    let meta: sharp.Metadata;
    try {
      meta = await sharp(data).metadata();
    } catch {
      throw new HttpError(422, "This file isn't a picture that can be read. Use JPG, PNG or WebP.");
    }
    if (!["jpeg", "png", "webp"].includes(meta.format ?? "")) throw new HttpError(422, "Use a JPG, PNG or WebP picture.");
    // Phone photos can be stored sideways with a rotation flag; orientations 5–8 swap width and height
    const [w, h] = (meta.orientation ?? 1) >= 5 ? [meta.height ?? 0, meta.width ?? 0] : [meta.width ?? 0, meta.height ?? 0];
    if (w < MIN_EDGE || h < MIN_EDGE) throw new HttpError(422, `The picture is too small (${w} × ${h}). It needs to be at least ${MIN_EDGE} × ${MIN_EDGE} pixels.`);

    const id = randomBytes(9).toString("base64url");
    const resize = (edge: number) => sharp(data).rotate().resize(edge, edge, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 });
    const full = await resize(FULL_EDGE).toFile(join(filesDir, `${id}.webp`));
    await resize(THUMB_EDGE).toFile(join(filesDir, `${id}-thumb.webp`));

    const picture = { id, width: full.width, height: full.height };
    index[code] = [...(index[code] ?? []), picture];
    await saveIndex();
    return withUrls(picture);
  });
}

export function deletePicture(rawCode: string, id: string): Promise<void> {
  const code = cleanCode(rawCode);
  return exclusive(async () => {
    const pics = index[code] ?? [];
    if (!pics.some((p) => p.id === id)) throw new HttpError(404, "That picture doesn't exist any more.");
    const rest = pics.filter((p) => p.id !== id);
    if (rest.length) index[code] = rest;
    else delete index[code];
    await saveIndex();
    await Promise.all([rm(join(filesDir, `${id}.webp`), { force: true }), rm(join(filesDir, `${id}-thumb.webp`), { force: true })]);
  });
}

/** Puts an item's pictures in this order; the first becomes the main picture. */
export function orderPictures(rawCode: string, ids: unknown): Promise<ProductImage[]> {
  const code = cleanCode(rawCode);
  return exclusive(async () => {
    const pics = index[code] ?? [];
    if (!Array.isArray(ids) || ids.length !== pics.length || !pics.every((p) => ids.includes(p.id)))
      throw new HttpError(422, "The pictures changed in the meantime. Refresh and try again.");
    index[code] = ids.map((id) => pics.find((p) => p.id === id)!);
    await saveIndex();
    return index[code].map(withUrls);
  });
}
