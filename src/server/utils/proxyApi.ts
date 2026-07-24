/**
 * Server-to-server fetch to the vv-llm-proxy admin config API (`/admin/*`).
 *
 * Uses the SEPARATE admin Bearer from the environment (`VV_LLM_PROXY_ADMIN_KEY`) — distinct from the
 * chat key and never sent to the browser — targeting only the configured proxy host
 * (`VV_LLM_PROXY_BASE_URL`). No user-controlled URLs (docs/SECURITY.md §10). This module is server-only
 * (excluded from the client bundle like `utils/api`), so the admin key never reaches client code.
 */
export async function proxyFetch(path: string, init?: RequestInit): Promise<Response> {
  const baseUrl = process.env.VV_LLM_PROXY_BASE_URL;
  const adminKey = process.env.VV_LLM_PROXY_ADMIN_KEY;
  if (!baseUrl || !adminKey) {
    throw new Error(
      'Varde Rute config is unavailable (VV_LLM_PROXY_BASE_URL / VV_LLM_PROXY_ADMIN_KEY not set)',
    );
  }
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
      Authorization: `Bearer ${adminKey}`,
    },
  });
}

/** Extract the proxy's `{ error: { message } }` shape and throw; falls back to the status code. */
export async function extractProxyError(response: Response, fallback: string): Promise<never> {
  const body = await response.json().catch(() => ({}));
  const message =
    (body as { error?: { message?: string } }).error?.message ?? `${fallback}: ${response.status}`;
  throw new Error(message);
}
