// Tiny helper over Upstash/Vercel KV REST API, used by the serverless
// functions to store & read the shared uysot token so the owner can refresh
// it from inside the dashboard (no redeploy). If no KV store is connected,
// KV_ENABLED is false and callers fall back to the env var.

const KV_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const KV_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

export const KV_ENABLED = !!(KV_URL && KV_TOKEN);

async function cmd(args: string[]): Promise<any> {
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`kv ${r.status}`);
  return r.json();
}

export async function kvGet(key: string): Promise<string | null> {
  if (!KV_ENABLED) return null;
  const j = await cmd(['GET', key]);
  return j && typeof j.result === 'string' ? j.result : null;
}

export async function kvSet(key: string, value: string): Promise<void> {
  if (!KV_ENABLED) throw new Error('KV not configured');
  await cmd(['SET', key, value]);
}

// Strip quotes / "Bearer " / whitespace from a pasted token.
export function cleanToken(v: string): string {
  let t = (v || '').trim().replace(/^bearer\s+/i, '');
  while (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    t = t.slice(1, -1).trim();
  }
  return t.replace(/\s+/g, '');
}

// Decode a JWT's `exp` (unix seconds) without verifying the signature.
export function jwtExp(token: string): number | null {
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
