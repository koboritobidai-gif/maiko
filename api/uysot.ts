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
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
async function kvGet(key: string): Promise<string | null> {
  if (!KV_URL || !KV_TOKEN) return null;
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['GET', key]),
  });
  if (!r.ok) return null;
  const j: any = await r.json();
  return j && typeof j.result === 'string' ? j.result : null;
}

// Shared "passphrase" mode: a viewer sends the passphrase and the proxy uses
// a server-stored uysot token so they never need a token themselves. The
// passphrase comes from an env var; the token is read from KV (owner can
// refresh it from inside the dashboard) with the env var as a fallback.
const SHARED_PASSWORD = (process.env.DASH_PASSWORD || '').trim();
const ENV_TOKEN = clean(process.env.UYSOT_TOKEN || '');
const SHARED_ENABLED = SHARED_PASSWORD.length > 0;

// Cache the shared token briefly to avoid a KV read on every request.
let cachedToken = '';
let cachedAt = 0;
async function sharedToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now - cachedAt < 30000) return cachedToken;
  let t = '';
  try {
    t = (await kvGet('uysot_token')) || '';
  } catch {
    /* ignore */
  }
  t = clean(t) || ENV_TOKEN;
  cachedToken = t;
  cachedAt = now;
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
