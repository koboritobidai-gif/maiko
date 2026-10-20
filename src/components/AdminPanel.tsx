import { useEffect, useState } from 'react';

interface Status {
  kvEnabled: boolean;
  present: boolean;
  exp: number | null;
  refreshPresent?: boolean;
  refresh?: { tried: boolean; ok: boolean; status: number; exp: number | null; detail: string };
}

function expLabel(exp: number | null): string {
  if (!exp) return '不明';
  const d = new Date(exp * 1000);
  const left = Math.round((exp * 1000 - Date.now()) / 3600000);
  const ds = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (left <= 0) return `${ds}（期限切れ）`;
  if (left < 24) return `${ds}（あと約${left}時間）`;
  return `${ds}（あと約${Math.round(left / 24)}日）`;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: 9,
  borderRadius: 8,
  border: '1px solid var(--border-strong)',
  background: 'var(--surface-2)',
  color: 'var(--text-primary)',
};

export default function AdminPanel() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [pass, setPass] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
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
              {status.kvEnabled ? 'データ保存: 接続済み' : 'データ保存(KV): 未接続'}
              {' ／ '}
              自動更新(refreshToken): {status.refreshPresent ? '設定済み' : '未設定'}
              <br />
              {status.refresh && (
                <span style={{ color: status.refresh.ok ? 'var(--good)' : 'var(--danger)' }}>
                  更新テスト: {status.refresh.ok ? `成功 ✓（期限 ${expLabel(status.refresh.exp ?? null)}）` : `失敗（${status.refresh.status}）: ${status.refresh.detail}`}
                </span>
              )}
            </p>
          )}

          <label style={{ fontSize: 12, fontWeight: 600 }}>合言葉</label>
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }} />

          {/* Recommended: refreshToken cookie -> auto-renew */}
          <div style={{ border: '1px solid var(--brand)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <strong style={{ fontSize: 13 }}>① refreshToken を保存（推奨・以後ほぼ更新不要）</strong>
            <textarea
              value={refreshToken}
              onChange={(e) => setRefreshToken(e.target.value)}
              placeholder="refreshToken クッキーの値を貼り付け"
              style={{ ...inputStyle, minHeight: 60, marginTop: 8, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
            />
            <button className="btn primary" type="button" disabled={busy || !refreshToken.trim()} onClick={() => post({ refreshToken: refreshToken.trim() }, '保存しました。以後サーバーが自動でトークンを更新します。')} style={{ marginTop: 8 }}>
              {busy ? '保存中…' : 'refreshToken を保存'}
            </button>
            <details className="help" style={{ marginTop: 8 }}>
              <summary>refreshToken の取り方</summary>
              <ol>
                <li>別タブで <a href="https://app.uysot.uz" target="_blank" rel="noreferrer">app.uysot.uz</a> にログイン</li>
                <li><code className="inline">F12</code> →「アプリケーション」→「Cookie」→ <code className="inline">https://service.app.uysot.uz</code></li>
                <li>名前が <code className="inline">refreshToken</code> の行の「値」をコピーして上に貼り付け → 保存</li>
              </ol>
            </details>
          </div>

          {/* Fallback: plain access token */}
          <details className="help">
            <summary>② 予備：アクセストークンを直接保存（約2日で切れます）</summary>
            <textarea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="token（eyJ...）"
              style={{ ...inputStyle, minHeight: 60, marginTop: 8, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
            />
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
