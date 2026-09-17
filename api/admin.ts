// Owner-only endpoint to refresh the shared uysot token from inside the
// dashboard (no Vercel visit / redeploy needed). GET returns status; POST
// with the correct passphrase stores a new token in KV.
const PASSWORD = (process.env.DASH_PASSWORD || '').trim();

// --- inlined KV helpers (self-contained so the function always bundles) ---
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const KV_ENABLED = !!(KV_URL && KV_TOKEN);
async function kvCmd(args: string[]): Promise<any> {
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`kv ${r.status}`);
  return r.json();
}
async function kvGet(key: string): Promise<string | null> {
  if (!KV_ENABLED) return null;
  const j = await kvCmd(['GET', key]);
  return j && typeof j.result === 'string' ? j.result : null;
}
async function kvSet(key: string, value: string): Promise<void> {
  if (!KV_ENABLED) throw new Error('KV not configured');
  await kvCmd(['SET', key, value]);
}
function cleanToken(v: string): string {
  let t = (v || '').trim().replace(/^bearer\s+/i, '');
  while (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    t = t.slice(1, -1).trim();
  }
  return t.replace(/\s+/g, '');
}
function jwtExp(token: string): number | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const exp = JSON.parse(json)?.exp;
    return typeof exp === 'number' ? exp : null;
  } catch {
    return null;
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const method = (req.method || 'GET').toUpperCase();

    if (method === 'GET') {
      let present = false;
      let exp: number | null = null;
      try {
        const t = await kvGet('uysot_token');
        present = !!t;
        if (t) exp = jwtExp(t);
      } catch {
        /* ignore */
      }
      res.status(200).json({ kvEnabled: KV_ENABLED, present, exp });
      return;
    }

    if (method !== 'POST') {
      res.status(405).json({ message: 'method not allowed', accept: false });
      return;
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    if (!PASSWORD || String(body.password || '') !== PASSWORD) {
      res.status(403).json({ message: '合言葉が違います', accept: false });
      return;
    }
    if (!KV_ENABLED) {
      res.status(503).json({
        message: 'データ保存(KV)が未設定です。VercelでKVストアを接続してください。',
        accept: false,
      });
      return;
    }
    const token = cleanToken(String(body.token || ''));
    if (!token || token.split('.').length < 3) {
      res.status(400).json({ message: '正しいトークンを貼り付けてください', accept: false });
      return;
    }
    await kvSet('uysot_token', token);
    res.status(200).json({ ok: true, exp: jwtExp(token) });
  } catch (e: any) {
    res.status(500).json({ message: String(e?.message || e), accept: false });
  }
}
