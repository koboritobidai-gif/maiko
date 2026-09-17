// Owner-only endpoint to refresh the shared uysot token from inside the
// dashboard (no Vercel visit / redeploy needed). GET returns status; POST
// with the correct passphrase stores a new token in KV.
import { KV_ENABLED, kvGet, kvSet, cleanToken, jwtExp } from '../lib/kv';

const PASSWORD = (process.env.DASH_PASSWORD || '').trim();

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
