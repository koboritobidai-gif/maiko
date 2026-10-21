// Vercel serverless proxy for the uysot CRM API.
//
// The browser calls this function on our own origin as
//   /api/uysot?p=/v1/statistics/customer-flow/v2
// (same-origin, so no CORS), and the function forwards the request
// server-to-server to the uysot API with Origin/Referer set to
// https://app.uysot.uz — making it look like the native uysot app, which
// sidesteps origin-based rejection ("Access denied") from other domains.
//
// The client's `Authorization: Bearer <token>` header (the user's own uysot
// access token) is passed straight through.

// The uysot web app's main REST API host (NOT the api.* open-api host).
const API_BASE = 'https://service.app.uysot.uz';
const SPOOF_ORIGIN = 'https://app.uysot.uz';

// --- inlined helpers (kept self-contained so the function always bundles) ---
function clean(v: string): string {
  let t = (v || '').trim().replace(/^bearer\s+/i, '');
  while (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    t = t.slice(1, -1).trim();
  }
  return t.replace(/\s+/g, '');
}
// Resolve KV connection from env regardless of the integration's prefix
// (e.g. STORAGE_KV_REST_API_URL). Match by suffix.
function kvEnv(kind: 'url' | 'token'): string {
  const re = kind === 'url' ? /(REST_API_URL|REDIS_REST_URL)$/ : /(REST_API_TOKEN|REDIS_REST_TOKEN)$/;
  for (const k of Object.keys(process.env)) {
    if (re.test(k) && process.env[k]) return process.env[k] as string;
  }
  return '';
}
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || kvEnv('url');
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || kvEnv('token');
const KV_ENABLED = !!(KV_URL && KV_TOKEN);
async function kvCmd(args: string[]): Promise<any> {
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) return null;
  return r.json();
}
async function kvGet(key: string): Promise<string | null> {
  if (!KV_ENABLED) return null;
  const j: any = await kvCmd(['GET', key]);
  return j && typeof j.result === 'string' ? j.result : null;
}
async function kvSet(key: string, value: string): Promise<void> {
  if (!KV_ENABLED) return;
  await kvCmd(['SET', key, value]);
}
function jwtExpMs(token: string): number {
  try {
    const p = token.split('.')[1];
    const json = Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const exp = JSON.parse(json)?.exp;
    return typeof exp === 'number' ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

// Shared "passphrase" mode: a viewer sends the passphrase and the proxy uses
// a server-stored uysot token so they never need a token themselves. The
// passphrase comes from an env var; the access token is derived automatically
// from a stored `refreshToken` cookie (uysot's refresh endpoint, no reCAPTCHA)
// so it self-renews, with a stored static token / env var as fallbacks.
const SHARED_PASSWORD = (process.env.DASH_PASSWORD || '').trim();
const ENV_TOKEN = clean(process.env.UYSOT_TOKEN || '');
const SHARED_ENABLED = SHARED_PASSWORD.length > 0;

// Exchange the current refreshToken cookie for a fresh access token.
// uysot rotates the refreshToken (single-use), so the new one (and the new
// X-Session-Key carried in the access token header) are persisted to KV for
// the next call. KV is required for this to keep working; the env vars only
// seed the very first refresh.
const ENV_REFRESH = clean(process.env.UYSOT_REFRESH_TOKEN || '');
const ENV_SESSION_KEY = clean(process.env.UYSOT_SESSION_KEY || '');
async function refreshAccessToken(): Promise<string> {
  const rt = clean((await kvGet('refresh_token')) || '') || ENV_REFRESH;
  if (!rt) return '';
  const sk = clean((await kvGet('session_key')) || '') || ENV_SESSION_KEY;
  let cookie = `refreshToken=${rt}`;
  if (sk) cookie += `; X-Session-Key=${sk}`;
  const r = await fetch(`${API_BASE}/v1/auth/refresh`, {
    method: 'GET',
    headers: { Origin: SPOOF_ORIGIN, Referer: `${SPOOF_ORIGIN}/`, Accept: 'application/json', Cookie: cookie },
  });
  if (!r.ok) return '';
  const j: any = await r.json();
  const tok = findJwt(j);
  if (!tok) return '';
  // Persist the rotated secrets for the next refresh.
  if (KV_ENABLED) {
    const newRt = findByKey(j, 'refreshToken');
    if (newRt) await kvSet('refresh_token', clean(newRt));
    const newSk = jwtHeaderField(tok, 'X-Session-Key');
    if (newSk) await kvSet('session_key', clean(newSk));
  }
  return clean(tok);
}
// Recursively find a JWT (the access token) anywhere in the response.
function findJwt(v: any): string {
  if (typeof v === 'string') {
    return /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v) ? v : '';
  }
  if (v && typeof v === 'object') {
    for (const k of Object.keys(v)) {
      const found = findJwt(v[k]);
      if (found) return found;
    }
  }
  return '';
}
// Recursively find the first string value stored under a given key.
function findByKey(v: any, key: string): string {
  if (v && typeof v === 'object') {
    for (const k of Object.keys(v)) {
      if (k === key && typeof v[k] === 'string') return v[k];
      const f = findByKey(v[k], key);
      if (f) return f;
    }
  }
  return '';
}
// Read a field from a JWT's header (first segment).
function jwtHeaderField(tok: string, field: string): string {
  try {
    const h = tok.split('.')[0];
    const json = Buffer.from(h.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const v = JSON.parse(json)?.[field];
    return typeof v === 'string' ? v : '';
  } catch {
    return '';
  }
}

// Cache the derived access token until shortly before it expires.
let cachedToken = '';
let cachedExpMs = 0;
async function sharedToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedExpMs - now > 60000) return cachedToken;
  let t = '';
  try {
    t = await refreshAccessToken();
  } catch {
    /* ignore */
  }
  if (!t) {
    try {
      t = clean((await kvGet('uysot_token')) || '') || ENV_TOKEN;
    } catch {
      t = ENV_TOKEN;
    }
  }
  cachedToken = t;
  const exp = jwtExpMs(t);
  cachedExpMs = exp > now ? exp : now + 60000;
  return t;
}

export default async function handler(req: any, res: any) {
  try {
    const q = req.query || {};
    let path = q.p;
    if (Array.isArray(path)) path = path[0];
    if (typeof path !== 'string' || !path.startsWith('/')) {
      res.status(400).json({ message: 'missing or invalid path', accept: false });
      return;
    }

    const target = `${API_BASE}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Origin: SPOOF_ORIGIN,
      Referer: `${SPOOF_ORIGIN}/`,
    };
    // Auth resolution: shared passphrase (-> server token) first, else the
    // viewer's own Bearer token passed from the client.
    const passHeader = req.headers['x-dash-pass'];
    const pass = Array.isArray(passHeader) ? passHeader[0] : passHeader;
    const auth = req.headers['authorization'];
    if (SHARED_ENABLED && pass && pass === SHARED_PASSWORD) {
      const tk = await sharedToken();
      if (!tk) {
        res.status(503).json({
          message: 'サーバーにトークンが未設定です。管理者がダッシュボードでトークンを更新してください。',
          accept: false,
        });
        return;
      }
      headers['Authorization'] = `Bearer ${tk}`;
    } else if (auth) {
      headers['Authorization'] = Array.isArray(auth) ? auth[0] : auth;
    } else if (pass && !SHARED_ENABLED) {
      res.status(503).json({
        message: '合言葉モードは未設定です（Vercelの環境変数 DASH_PASSWORD を設定してください）',
        accept: false,
      });
      return;
    }
    const fb = req.headers['firebasetoken'];
    if (fb) headers['firebaseToken'] = Array.isArray(fb) ? fb[0] : fb;

    const method = (req.method || 'GET').toUpperCase();
    const init: Record<string, unknown> = { method, headers };
    if (method !== 'GET' && method !== 'HEAD') {
      let body = req.body;
      if (body !== undefined && body !== null && typeof body !== 'string') {
        body = JSON.stringify(body);
      }
      init.body = body ?? '{}';
    }

    const upstream = await fetch(target, init as any);
    const text = await upstream.text();

    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.send(text);
  } catch (e: any) {
    res.status(502);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({ message: 'Proxy error', detail: String(e?.message || e), accept: false }));
  }
}
