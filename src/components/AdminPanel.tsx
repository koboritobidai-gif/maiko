import { useEffect, useState } from 'react';

interface Status {
  kvEnabled: boolean;
  present: boolean;
  exp: number | null;
  refreshPresent?: boolean;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: 9,
  borderRadius: 8,
  border: '1px solid var(--border-strong)',
  background: 'var(--surface-2)',
  color: 'var(--text-primary)',
};
const mono: React.CSSProperties = { ...inputStyle, minHeight: 54, marginTop: 6, fontFamily: 'ui-monospace, monospace', fontSize: 12 };

export default function AdminPanel() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [pass, setPass] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [sessionKey, setSessionKey] = useState('');
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

  async function post(payload: Record<string, string>, okMsg: string) {
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      const r = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass.trim(), ...payload }),
      });
      const j = await r.json();
      if (!r.ok) setErr(j?.message || `エラー (${r.status})`);
      else {
        setMsg(okMsg);
        setRefreshToken('');
        setSessionKey('');
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
        <h2>サーバー接続の設定（管理者用）</h2>
        <span className="hint">合言葉で全員が見るための接続を、ここから設定・更新できます（Vercel操作・再デプロイ不要）。</span>
        <span style={{ flex: 1 }} />
        <button className="btn" type="button" onClick={() => setOpen((o) => !o)}>
          {open ? '閉じる' : '開く'}
        </button>
      </div>
      {open && (
        <div className="card">
          {status && (
            <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
              データ保存(KV): {status.kvEnabled ? '接続済み ✓' : '未接続 — 先にVercelのStorageでKVを接続してください'}
              {' ／ '}
              自動更新(refreshToken): {status.refreshPresent ? '設定済み' : '未設定'}
            </p>
          )}

          <label style={{ fontSize: 12, fontWeight: 600 }}>合言葉</label>
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }} />

          <div style={{ border: '1px solid var(--brand)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <strong style={{ fontSize: 13 }}>① 自動更新を設定（refreshToken と X-Session-Key）</strong>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginTop: 8 }}>refreshToken（Cookieの値）</label>
            <textarea value={refreshToken} onChange={(e) => setRefreshToken(e.target.value)} placeholder="refreshToken の値" style={mono} />
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginTop: 8 }}>X-Session-Key（Cookieの値）</label>
            <textarea value={sessionKey} onChange={(e) => setSessionKey(e.target.value)} placeholder="X-Session-Key の値" style={mono} />
            <button
              className="btn primary"
              type="button"
              disabled={busy || !refreshToken.trim()}
              onClick={() => post({ refreshToken: refreshToken.trim(), sessionKey: sessionKey.trim() }, '保存しました。少し待ってから、合言葉タブで表示をお試しください。')}
              style={{ marginTop: 10 }}
            >
              {busy ? '保存中…' : '自動更新を保存'}
            </button>
            <details className="help" style={{ marginTop: 8 }}>
              <summary>値の取り方（2つとも）</summary>
              <ol>
                <li>別タブで <a href="https://app.uysot.uz" target="_blank" rel="noreferrer">app.uysot.uz</a> にログイン</li>
                <li><code className="inline">F12</code> →「アプリケーション」→「Cookie」→ <code className="inline">service.app.uysot.uz</code></li>
                <li><code className="inline">refreshToken</code> と <code className="inline">X-Session-Key</code> の値をそれぞれコピーして貼り付け → 保存</li>
              </ol>
            </details>
          </div>

          <details className="help">
            <summary>② 予備：アクセストークンを直接保存（約2日で切れます）</summary>
            <textarea value={token} onChange={(e) => setToken(e.target.value)} placeholder="token（eyJ...）" style={mono} />
            <button className="btn" type="button" disabled={busy || !token.trim()} onClick={() => post({ token: token.trim() }, '保存しました。ページを再読み込みすると反映されます。')} style={{ marginTop: 8 }}>
              トークンを保存
            </button>
          </details>

          {msg && <div className="badge ok" style={{ marginTop: 12, display: 'block', padding: '8px 10px' }}>{msg}</div>}
          {err && <div className="login-err" style={{ marginTop: 12 }}>{err}</div>}
        </div>
      )}
    </div>
  );
}
