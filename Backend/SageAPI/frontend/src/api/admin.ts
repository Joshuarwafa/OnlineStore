import { ApiError } from "./client";

// Admin calls go to StoreBackend (/api/admin), which checks the signed-in session and adds the
// SageAPI key itself, so no secret ever reaches the browser. Errors come back as { message }.
// A File/Blob body (a picture) is sent as it is, with its own content type; anything else as JSON.
export async function adminRequest<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  const isFile = body instanceof Blob;
  let response: Response;
  try {
    response = await fetch(`/api/admin${path}`, {
      method,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(isFile ? { "Content-Type": body.type } : body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: isFile ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Could not reach the store backend. Is it running?", 0);
  }

  if (response.status === 204) return undefined as T;

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    // Non-JSON (e.g. a proxy error page when the backend is down)
  }

  if (!response.ok) {
    const message =
      (parsed as { message?: string } | undefined)?.message ??
      (response.status >= 500 ? "The store backend isn't answering. Is it running?" : response.statusText);
    throw new ApiError(message, response.status);
  }
  return parsed as T;
}
