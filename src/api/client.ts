// All API calls go through our own same-origin serverless proxy
// (/api/uysot/*), which forwards to the uysot API with an app.uysot.uz
// Origin/Referer. This avoids browser CORS and origin-based rejection.
const PROXY_PREFIX = '/api/uysot';

const TOKEN_STORAGE_KEY = 'jp-plaza-token';

// Copy/paste often brings along surrounding quotes, "Bearer " prefixes,
// or stray whitespace/newlines — any of which make the API reject the token.
// Normalise defensively so a slightly messy paste still works.
export function sanitizeToken(raw: string): string {
  let t = (raw || '').trim();
  // strip a leading "Bearer " if the user copied the whole header
  t = t.replace(/^bearer\s+/i, '');
  // strip surrounding single or double quotes (possibly repeated)
  while (
    t.length >= 2 &&
    ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))
  ) {
    t = t.slice(1, -1).trim();
  }
  // remove any internal whitespace/newlines (JWTs contain none)
  t = t.replace(/\s+/g, '');
  return t;
}

export function getToken(): string {
  try {
    return sanitizeToken(localStorage.getItem(TOKEN_STORAGE_KEY) || '');
  } catch {
    return '';
  }
}

export function setToken(token: string): void {
  try {
    const t = sanitizeToken(token);
    if (t) localStorage.setItem(TOKEN_STORAGE_KEY, t);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

type Options = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
  body?: unknown;
  token?: string;
  signal?: AbortSignal;
};

// Thin fetch wrapper. Sends Authorization: Bearer <token> — the scheme the
// uysot API uses — and credentials so the origin's whitelisted CORS applies.
export async function apiFetch<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const token = opts.token ?? getToken();
  const url = path.startsWith('http') ? path : `${PROXY_PREFIX}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (e) {
    throw new ApiError(0, `ネットワークエラー: ${(e as Error).message}`, null);
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }

  if (!res.ok) {
    const msg =
      (json && typeof json === 'object' && 'message' in json
        ? String((json as Record<string, unknown>).message)
        : '') || `HTTP ${res.status}`;
    throw new ApiError(res.status, msg, json);
  }
  return json as T;
}

// The uysot API wraps successful payloads as { accept, message, data }.
// This unwraps to `data` while tolerating raw payloads.
export function unwrap<T = unknown>(resp: unknown): T {
  if (resp && typeof resp === 'object' && 'data' in resp) {
    return (resp as { data: T }).data;
  }
  return resp as T;
}
