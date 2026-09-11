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

const API_BASE = 'https://api.service.app.uysot.uz';
const SPOOF_ORIGIN = 'https://app.uysot.uz';

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
    const auth = req.headers['authorization'];
    if (auth) headers['Authorization'] = Array.isArray(auth) ? auth[0] : auth;
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
