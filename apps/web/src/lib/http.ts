/**
 * Helpers shared by the typed API clients (vendor portal, admin, super admin):
 * read a JSON response or throw the API's error envelope as an `ApiError`.
 */

/** An API error with the server's message and (for 422) per-field details. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

export async function read<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as { error?: { message?: string; details?: unknown } }).error ?? {};
    const fields: Record<string, string> = {};
    if (Array.isArray(err.details)) {
      for (const d of err.details as { loc?: (string | number)[]; msg?: string }[]) {
        const key = (d.loc ?? []).filter((p) => p !== "body").join(".");
        if (key && d.msg) fields[key] = d.msg.replace(/^Value error, /, "");
      }
    }
    throw new ApiError(res.status, err.message ?? "Request failed", fields);
  }
  return data as T;
}

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** First field error, else the message — for a toast after a failed save. */
export function errorText(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof ApiError) return Object.values(err.fields)[0] ?? err.message;
  return err instanceof Error ? err.message : fallback;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}
