const API_BASE = "/api";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    // A 403 is a team-role refusal; its sentence ("Only an owner of this
    // business can do that.") is the useful message, so it is carried.
    const body = res.status === 403 ? ((await res.json().catch(() => ({}))) as { error?: unknown; code?: unknown }) : {};
    const message = typeof body.error === "string" && body.error.trim() !== "" ? body.error : `API ${res.status}`;
    const err = Object.assign(new Error(message), {
      status: res.status,
      code: typeof body.code === "string" ? body.code : undefined,
    });
    throw err;
  }
  return res.json() as Promise<T>;
}
