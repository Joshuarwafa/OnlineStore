import { config } from "./config.js";
import { HttpError } from "./errors.js";

/**
 * Calls SageAPI with the API key. SageAPI replies { code, message, data };
 * this returns `data`, or throws an HttpError with a message staff can act on.
 */
export async function sageApi<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.sageApiUrl}/api/Pastel${path}`, {
      method,
      headers: {
        Accept: "application/json",
        "X-Api-Key": config.sageApiKey,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    throw new HttpError(502, timedOut ? "SageAPI took too long to answer." : `SageAPI isn't reachable at ${config.sageApiUrl}. Check that it is running.`);
  }

  const text = await res.text();
  let parsed: { code?: number; message?: string; error?: string; errors?: string[]; data?: T } | undefined;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = undefined;
  }

  if (res.status === 401 || res.status === 503) {
    // Our key was refused or SageAPI has none: a configuration problem, not the user's fault
    console.error(`SageAPI ${res.status}: ${parsed?.message ?? text}`);
    throw new HttpError(502, "The store couldn't authenticate with SageAPI. Check SAGEAPI_KEY matches SageAPI's Security:ApiKey.");
  }
  if (!res.ok) {
    // Sage's own reason (e.g. "Item not found in warehouse") is for staff: log it, don't show shoppers
    const detail = parsed?.error ?? parsed?.errors?.join("; ");
    if (res.status >= 500 || detail) console.error(`SageAPI ${method} ${path} → ${res.status}: ${parsed?.message ?? text.slice(0, 300)}${detail ? ` | ${detail}` : ""}`);
    throw new HttpError(res.status >= 500 ? 502 : res.status, parsed?.message ?? `SageAPI returned ${res.status}.`);
  }
  return parsed?.data as T;
}
