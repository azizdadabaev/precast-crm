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
    throw new Error(msg);
  }
  return (payload?.data ?? payload) as T;
}
