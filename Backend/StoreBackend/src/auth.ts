import { createHmac, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";
import { HttpError } from "./errors.js";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const COOKIE = "store_admin";
const COOKIE_PATH = "/api/admin";

// ---------- password ----------

/** Hash format: scrypt$<salt hex>$<hash hex> */
export async function verifyPassword(password: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = config.adminPasswordHash.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) throw new Error("ADMIN_PASSWORD_HASH is not in the expected format. Run npm run hash-password.");
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// ---------- login rate limit (per IP, in memory) ----------

const attempts = new Map<string, { count: number; until: number }>();
const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export function checkRateLimit(ip: string) {
  const a = attempts.get(ip);
  if (a && a.count >= MAX_FAILS && a.until > Date.now()) {
    const mins = Math.ceil((a.until - Date.now()) / 60000);
    throw new HttpError(429, `Too many sign-in attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`);
  }
}
export function recordFailure(ip: string) {
  const a = attempts.get(ip);
  if (!a || a.until < Date.now()) attempts.set(ip, { count: 1, until: Date.now() + WINDOW_MS });
  else a.count++;
}
export function clearFailures(ip: string) {
  attempts.delete(ip);
}

// ---------- signed session cookie ----------

interface Session {
  sub: string;
  exp: number;
}

function sign(data: string) {
  return createHmac("sha256", config.sessionSecret).update(data).digest("base64url");
}

export function issueSession(res: Response) {
  const payload: Session = { sub: "admin", exp: Date.now() + config.sessionHours * 3600_000 };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  res.cookie(COOKIE, `${data}.${sign(data)}`, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "strict",
    path: COOKIE_PATH,
    maxAge: config.sessionHours * 3600_000,
  });
}

export function clearSession(res: Response) {
  res.clearCookie(COOKIE, { httpOnly: true, secure: config.cookieSecure, sameSite: "strict", path: COOKIE_PATH });
}

function readCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export function currentSession(req: Request): Session | null {
  const raw = readCookie(req);
  if (!raw) return null;
  const [data, sig] = raw.split(".");
  if (!data || !sig) return null;
  const expected = Buffer.from(sign(data));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const s = JSON.parse(Buffer.from(data, "base64url").toString()) as Session;
    return s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (config.adminAuthOff) return next(); // admin sign-in not built yet (ADMIN_AUTH=off, development only)
  if (!currentSession(req)) return next(new HttpError(401, "Please sign in again."));
  next();
}

/** Blocks admin changes sent from other websites (on top of the SameSite=Strict cookie). */
export function sameOriginOnly(req: Request, _res: Response, next: NextFunction) {
  if (req.method === "GET" || req.method === "HEAD") return next();
  const origin = req.headers.origin;
  if (origin && !config.allowedOrigins.includes(origin)) return next(new HttpError(403, "This request came from a site that isn't allowed."));
  next();
}
