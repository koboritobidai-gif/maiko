import { useState } from 'react';

export interface DiagEntry {
  label: string;
  path: string;
  ok: boolean;
  status: number;
  data: unknown;
}

export default function Diagnostics({ entries }: { entries: DiagEntry[] }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  if (!entries.length) return null;
  return (
    <div className="diag section">
      <div className="section-head">
        <h2>接続診断</h2>
        <span className="hint">
          各 API の応答状況。数値が合わない場合は、該当項目の生データ（JSON）を確認してマッピングを調整できます。
        </span>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn" type="button" onClick={() => setOpen((o) => !o)}>
          {open ? '閉じる' : '開く'}
        </button>
      </div>
      {open && (
        <div className="card">
          {entries.map((e, i) => (
            <div key={i} className="diag-row">
              <span className={`badge ${e.ok ? 'ok' : 'ng'}`}>{e.ok ? 'OK' : `NG ${e.status || ''}`}</span>
              <span>{e.label}</span>
              <span className="path">{e.path}</span>
              <span style={{ flex: 1 }} />
              <button className="btn" type="button" onClick={() => setSel(sel === i ? null : i)}>
                {sel === i ? '隠す' : '生データ'}
              </button>
            </div>
          ))}
          {sel != null && entries[sel] && (
            <pre>{JSON.stringify(entries[sel].data, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  );
}
