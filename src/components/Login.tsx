import { useState } from 'react';
import { apiFetch, setToken, unwrap } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { getRecaptchaToken } from '../auth/recaptcha';

interface Props {
  onAuthenticated: (token: string) => void;
}

type Tab = 'login' | 'token';

export default function Login({ onAuthenticated }: Props) {
  const [tab, setTab] = useState<Tab>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      let recaptchaToken = '';
      try {
        recaptchaToken = await getRecaptchaToken('login');
      } catch {
        /* proceed without — backend may still accept, otherwise it errors */
      }
      const resp = await apiFetch(ENDPOINTS.auth.signIn, {
        method: 'POST',
        body: { username: username.trim(), password, recaptchaToken },
        token: '',
      });
      const data = unwrap<{ accessToken?: string }>(resp);
      const accessToken = data?.accessToken;
      if (!accessToken) throw new Error('アクセストークンを取得できませんでした');
      setToken(accessToken);
      onAuthenticated(accessToken);
    } catch (e2) {
      const m = (e2 as Error).message || 'ログインに失敗しました';
      setErr(
        `${m}。\nこのドメインが reCAPTCHA に登録されていない場合、直接ログインはできません。右上の「トークン」タブをご利用ください。`,
      );
    } finally {
      setBusy(false);
    }
  }

  function useTokenValue(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const t = tokenInput.trim();
    if (!t) {
      setErr('トークンを貼り付けてください');
      return;
    }
    setToken(t);
    onAuthenticated(t);
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>ジャパンプラザ ダッシュボード</h1>
        <p className="lead">ウズベキスタン・ジャパンプラザ 販売進捗の日本語ダッシュボード</p>

        <div className="tab-row">
          <button className={tab === 'login' ? 'active' : ''} onClick={() => setTab('login')} type="button">
            ログイン
          </button>
          <button className={tab === 'token' ? 'active' : ''} onClick={() => setTab('token')} type="button">
            トークン
          </button>
        </div>

        {tab === 'login' ? (
          <form onSubmit={doLogin}>
            <label>ユーザー名</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="Okano1469"
            />
            <label>パスワード</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button className="btn primary" disabled={busy} type="submit">
              {busy ? '認証中…' : 'ログイン'}
            </button>
          </form>
        ) : (
          <form onSubmit={useTokenValue}>
            <label>アクセストークン</label>
            <textarea
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="eyJhbGciOi..."
            />
            <button className="btn primary" type="submit">
              このトークンで表示
            </button>
            <details className="help" open>
              <summary>トークンの取得方法</summary>
              <ol>
                <li>
                  別タブで <a href="https://app.uysot.uz" target="_blank" rel="noreferrer">app.uysot.uz</a> にログイン
                </li>
                <li>キーボードで <code className="inline">F12</code>（開発者ツール）を開く</li>
                <li>
                  「Console（コンソール）」に <code className="inline">localStorage.getItem('token')</code> と入力して Enter
                </li>
                <li>表示された文字列（引用符の中身）をコピーし、上に貼り付け</li>
              </ol>
            </details>
          </form>
        )}

        {err && <div className="login-err" style={{ whiteSpace: 'pre-line' }}>{err}</div>}
      </div>
    </div>
  );
}
