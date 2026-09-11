import { useState } from 'react';
import { setPass, setToken } from '../api/client';

interface Props {
  onAuthenticated: () => void;
}

type Tab = 'pass' | 'token';

export default function Login({ onAuthenticated }: Props) {
  const [tab, setTab] = useState<Tab>('pass');
  const [passInput, setPassInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [err, setErr] = useState('');

  function usePassValue(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const p = passInput.trim();
    if (!p) {
      setErr('合言葉を入力してください');
      return;
    }
    setToken('');
    setPass(p);
    onAuthenticated();
  }

  function useTokenValue(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const t = tokenInput.trim();
    if (!t) {
      setErr('トークンを貼り付けてください');
      return;
    }
    setPass('');
    setToken(t);
    onAuthenticated();
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>ジャパンプラザ ダッシュボード</h1>
        <p className="lead">ウズベキスタン・ジャパンプラザ 販売進捗の日本語ダッシュボード</p>

        <div className="tab-row">
          <button className={tab === 'pass' ? 'active' : ''} onClick={() => setTab('pass')} type="button">
            合言葉
          </button>
          <button className={tab === 'token' ? 'active' : ''} onClick={() => setTab('token')} type="button">
            トークン
          </button>
        </div>

        {tab === 'pass' ? (
          <form onSubmit={usePassValue}>
            <label>合言葉</label>
            <input
              type="password"
              value={passInput}
              onChange={(e) => setPassInput(e.target.value)}
              placeholder="合言葉を入力"
              autoFocus
            />
            <button className="btn primary" type="submit">
              表示する
            </button>
            <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
              社内で共有された合言葉を入力してください。
            </p>
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
            <details className="help">
              <summary>トークンの取得方法</summary>
              <ol>
                <li>
                  別タブで <a href="https://app.uysot.uz" target="_blank" rel="noreferrer">app.uysot.uz</a> にログイン
                </li>
                <li>キーボードで <code className="inline">F12</code>（開発者ツール）を開く</li>
                <li>
                  上のタブの <code className="inline">≫</code> →「アプリケーション」→「ローカル ストレージ」→ <code className="inline">app.uysot.uz</code>
                </li>
                <li>
                  キーが <code className="inline">token</code> の行をクリックし、値をコピーして上に貼り付け
                </li>
              </ol>
            </details>
          </form>
        )}

        {err && <div className="login-err">{err}</div>}
      </div>
    </div>
  );
}
