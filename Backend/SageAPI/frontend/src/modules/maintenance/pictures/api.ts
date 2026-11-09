import { adminRequest } from "../../../api/admin";

// Product pictures are kept by StoreBackend in its pictures folder, per Sage item code.
export const MAX_PICTURES = 8;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export interface Picture {
  id: string;
  /** Up to 1600 px, for the product page. */
  url: string;
  /** Up to 600 px, for lists. */
  thumbUrl: string;
  width: number;
  height: number;
}

const enc = encodeURIComponent;

/** Every item that has pictures: item code → pictures, main picture first. */
export const getAllPictures = () => adminRequest<Record<string, Picture[]>>("GET", "/images");
export const uploadPicture = (code: string, file: File) => adminRequest<Picture>("POST", `/products/${enc(code)}/images`, file);
export const deletePicture = (code: string, id: string) => adminRequest<void>("DELETE", `/products/${enc(code)}/images/${enc(id)}`);
/** The first id becomes the main picture. */
export const orderPictures = (code: string, ids: string[]) => adminRequest<Picture[]>("PUT", `/products/${enc(code)}/images/order`, { ids });

/** A reason the file can't be uploaded, checked before sending; null when it looks fine. */
export function fileProblem(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return "Use a JPG, PNG or WebP picture.";
  if (file.size > MAX_FILE_BYTES) return "The file is larger than 15 MB.";
  return null;
}
