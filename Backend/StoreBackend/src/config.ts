import { fileURLToPath } from "node:url";

// All settings come from environment variables (.env in development).
// The process refuses to start if a required secret is missing or weak.

function required(name: string, minLength = 1): string {
  const v = process.env[name]?.trim();
  if (!v || v.length < minLength) {
    throw new Error(`Missing or too short environment variable ${name}${minLength > 1 ? ` (at least ${minLength} characters)` : ""}. See .env.example.`);
  }
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  /** Base URL of SageAPI, e.g. http://localhost:5071 */
  sageApiUrl: required("SAGEAPI_URL").replace(/\/+$/, ""),
  /** Shared secret sent to SageAPI as X-Api-Key. Must match SageAPI's Security:ApiKey. */
  sageApiKey: required("SAGEAPI_KEY", 32),
  /** Admin password hash, made with `npm run hash-password`. Never the password itself. */
  adminPasswordHash: required("ADMIN_PASSWORD_HASH"),
  /** Signs the admin session cookie. */
  sessionSecret: required("SESSION_SECRET", 32),
  sessionHours: Number(process.env.SESSION_HOURS ?? 8),
  /** ADMIN_AUTH=off skips the admin sign-in while the admin app is being built. Refused in production. */
  adminAuthOff: process.env.ADMIN_AUTH?.trim().toLowerCase() === "off",
  /** true in production (HTTPS). false only for local http development. */
  cookieSecure: (process.env.COOKIE_SECURE ?? "true") !== "false",
  // ----- catalogue (per client; scope decisions D3 and the single-warehouse rule) -----
  /** Sage price list the store sells at, e.g. USD-RETAIL */
  priceList: process.env.STORE_PRICE_LIST?.trim() || "USD-RETAIL",
  /** Sage warehouse code whose stock the store sells, e.g. 2. Empty = every warehouse row (not recommended). */
  warehouse: process.env.STORE_WAREHOUSE?.trim() ?? "",
  currency: process.env.STORE_CURRENCY?.trim() || "USD",
  /** How often the cached catalogue is re-read from Sage. Product pages and checkout always read live. */
  catalogueRefreshMinutes: Number(process.env.CATALOGUE_REFRESH_MINUTES ?? 5),
  // ----- product pictures -----
  /** Folder that holds the pictures. Default: data/images inside the store backend folder. */
  imagesDir: process.env.IMAGES_DIR?.trim() || fileURLToPath(new URL("../data/images", import.meta.url)),
  /** Put in front of picture links, e.g. https://api.yourstore.com when the website is hosted elsewhere. Empty = same site. */
  publicImageBaseUrl: (process.env.PUBLIC_IMAGE_BASE_URL?.trim() ?? "").replace(/\/+$/, ""),
  /** Origins allowed to make admin changes, e.g. https://shop.example.co.zw */
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

if (config.adminAuthOff && process.env.NODE_ENV === "production") {
  throw new Error("ADMIN_AUTH=off is for development only. Remove it before running in production.");
}
