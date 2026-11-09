// Every SageAPI endpoint answers with the same envelope: code 1 = success, code 0 = failure.
export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data?: T;
  error?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Relative by default so the Vite dev proxy handles it; set VITE_API_BASE_URL for a deployed build.
const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError("Could not reach SageAPI. Is it running?", 0);
  }

  let body: ApiEnvelope<T> | undefined;
  try {
    body = (await response.json()) as ApiEnvelope<T>;
  } catch {
    // Non-JSON response (e.g. a proxy error page) — handled below.
  }

  if (!response.ok || !body || body.code !== 1) {
    const detail = body?.error ? ` (${body.error})` : "";
    throw new ApiError(`${body?.message ?? response.statusText}${detail}`, response.status);
  }

  return body.data as T;
}
