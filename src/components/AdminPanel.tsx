import { useEffect, useState } from 'react';

interface Status {
  kvEnabled: boolean;
  present: boolean;
  exp: number | null;
}

function expLabel(exp: number | null): string {
  if (!exp) return '不明';
  const d = new Date(exp * 1000);
  const now = Date.now();
  const left = Math.round((exp * 1000 - now) / 3600000); // hours
  const ds = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (left <= 0) return `${ds}（期限切れ）`;
  if (left < 24) return `${ds}（あと約${left}時間）`;
  return `${ds}（あと約${Math.round(left / 24)}日）`;
}

export default function AdminPanel() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [pass, setPass] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function loadStatus() {
    try {
      const r = await fetch('/api/admin', { cache: 'no-store' });
      setStatus(await r.json());
    } catch {
      setStatus(null);
    }
  }
  useEffect(() => {
    if (open && !status) loadStatus();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      const r = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass.trim(), token: token.trim() }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j?.message || `エラー (${r.status})`);
      } else {
        setMsg('保存しました。ページを再読み込みすると新しいトークンで表示されます。');
        setToken('');
        loadStatus();
      }
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="diag section">
      <div className="section-head">
        <h2>サーバートークンの更新（管理者用）</h2>
        <span className="hint">合言葉で全員が見るためのトークンを、ここから更新できます（Vercel操作・再デプロイ不要）。</span>
        <span style={{ flex: 1 }} />
        <button className="btn" type="button" onClick={() => setOpen((o) => !o)}>
          {open ? '閉じる' : '開く'}
        </button>
      </div>
      {open && (
        <div className="card">
          {status && (
            <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
              {status.kvEnabled ? 'データ保存: 接続済み' : 'データ保存(KV): 未接続 — Vercelでの初期設定が必要です'} ／ 現在のトークン:{' '}
              {status.present ? `あり（期限 ${expLabel(status.exp)}）` : 'なし'}
            </p>
          )}
          <form onSubmit={save}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>合言葉</label>
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              style={{ width: '100%', padding: 9, borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-primary)', marginBottom: 8 }}
            />
            <label style={{ fontSize: 12, fontWeight: 600 }}>新しいトークン（uysotの token）</label>
            <textarea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="eyJhbGciOi..."
              style={{ width: '100%', minHeight: 70, padding: 9, borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-primary)', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
            />
            <button className="btn primary" type="submit" disabled={busy} style={{ marginTop: 10 }}>
              {busy ? '保存中…' : 'トークンを保存'}
            </button>
          </form>
          {msg && <div className="badge ok" style={{ marginTop: 10, display: 'block', padding: '8px 10px' }}>{msg}</div>}
          {err && <div className="login-err" style={{ marginTop: 10 }}>{err}</div>}
          <details className="help" style={{ marginTop: 12 }}>
            <summary>トークンの取り方</summary>
            <ol>
              <li>別タブで <a href="https://app.uysot.uz" target="_blank" rel="noreferrer">app.uysot.uz</a> にログイン</li>
              <li><code className="inline">F12</code> →「アプリケーション」→「ローカルストレージ」→ <code className="inline">app.uysot.uz</code></li>
              <li>キー <code className="inline">token</code> の値をコピーして上に貼り付け → 保存</li>
            </ol>
          </details>
        </div>
      )}
    </div>
  );
}
