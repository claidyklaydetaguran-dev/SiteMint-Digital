const API_BASE = "/api";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const err = Object.assign(new Error(`API ${res.status}`), { status: res.status });
    throw err;
  }
  return res.json() as Promise<T>;
}
