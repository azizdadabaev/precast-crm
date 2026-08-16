/**
 * Error thrown by `api()` for any non-OK response. `message` is
 * unchanged from before (callers that only read `.message` keep
 * working); `status` + `payload` let a caller branch on a
 * machine-readable code — e.g. the 409 the order-edit route returns
 * when a client phone change needs an explicit confirmation.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;
  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export async function api<T = unknown>(
  url: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const opts: RequestInit = {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include",
  };
  if (init?.json !== undefined) {
    opts.body = JSON.stringify(init.json);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  const payload = text ? JSON.parse(text) : {};
  if (!res.ok || payload?.ok === false) {
    const msg = payload?.error || `HTTP ${res.status}`;
    throw new ApiError(msg, res.status, payload);
  }
  return (payload?.data ?? payload) as T;
}
