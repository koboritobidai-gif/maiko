"use client";

import { useState, useTransition } from "react";
import { importReviewedAction } from "@/app/actions";

/**
 * 議事録を貼り付けてタスクを取り込む。
 *
 * 抽出結果はそのまま登録せず、必ず一覧で確認・修正してもらう。
 * 議事録の書き方は人によって違うので、自動抽出だけに任せると取りこぼしと誤検出が残るため。
 */

interface Member {
  id: string;
  name: string;
  department: string;
}

interface Row {
  include: boolean;
  title: string;
  ownerId: string;
  ownerHint: string | null;
  dueDate: string;
  dueHint: string | null;
  confidence: "high" | "medium";
  raw: string;
}

export function MinutesImporter({
  members,
  canSetExecutive,
  today,
}: {
  members: Member[];
  canSetExecutive: boolean;
  today: string;
}) {
  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState(today);
  const [visibility, setVisibility] = useState("all");
  const [body, setBody] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function extract() {
    setMessage(null);
    if (!body.trim()) {
      setMessage("議事録の本文を貼り付けてください。");
      return;
    }
    const response = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, meetingDate }),
    });
    if (!response.ok) {
      setMessage("抽出に失敗しました。時間をおいて試してください。");
      return;
    }
    const data = (await response.json()) as { tasks: Omit<Row, "include">[] };
    setRows(data.tasks.map((task) => ({ ...task, include: true })));
    if (data.tasks.length === 0) {
      setMessage("タスクらしい行が見つかりませんでした。「ToDo」「担当:」などの表記があると拾いやすくなります。");
    }
  }

  function update(index: number, patch: Partial<Row>) {
    setRows((current) =>
      current ? current.map((row, i) => (i === index ? { ...row, ...patch } : row)) : current,
    );
  }

  function submit() {
    const selected = (rows ?? []).filter((row) => row.include && row.title.trim());
    if (!selected.length) {
      setMessage("登録するタスクを1件以上選んでください。");
      return;
    }
    const payload = JSON.stringify({
      title,
      meetingDate,
      visibility,
      body,
      rows: selected.map((row) => ({
        title: row.title.trim(),
        ownerId: row.ownerId || null,
        dueDate: row.dueDate || null,
        raw: row.raw,
      })),
    });
    startTransition(() => {
      void importReviewedAction(payload);
    });
  }

  /** PLAUD などから書き出した議事録ファイルを読み込む。 */
  async function readFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    setBody(text);
    setRows(null);
    // 「2026-09-01-経営戦略会議.md」のようなファイル名から日付とタイトルを拾う。
    const name = file.name.replace(/\.(md|txt|markdown)$/i, "");
    const matched = name.match(/^(\d{4}-\d{2}-\d{2})[-_ ](.+)$/);
    if (matched) {
      setMeetingDate(matched[1]);
      setTitle(matched[2]);
    } else if (!title) {
      setTitle(name);
    }
    const heading = text.match(/^\s*#\s+(.+)$/m);
    if (heading) setTitle(heading[1].trim());
    setMessage(`${file.name} を読み込みました。内容を確認して「タスクを抽出する」を押してください。`);
  }

  const selectedCount = (rows ?? []).filter((row) => row.include).length;

  return (
    <div className="card card-pad">
      {message ? <div className="notice notice-info">{message}</div> : null}

      <div className="form-grid">
        <div className="field">
          <label htmlFor="mtitle">議事録のタイトル</label>
          <input
            id="mtitle"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例：全体定例MTG"
          />
        </div>
        <div className="field">
          <label htmlFor="mdate">開催日</label>
          <input id="mdate" type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
          <span className="hint">「来週金曜」などの期限は、この日を基準に日付へ直します。</span>
        </div>
        <div className="field">
          <label htmlFor="mvis">公開範囲</label>
          <select id="mvis" value={visibility} onChange={(e) => setVisibility(e.target.value)} disabled={!canSetExecutive}>
            <option value="all">全社員</option>
            {canSetExecutive ? <option value="executive">役員のみ</option> : null}
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="mfile">議事録ファイルから読み込む（任意）</label>
        <input
          id="mfile"
          type="file"
          accept=".txt,.md,.markdown,text/plain,text/markdown"
          onChange={(e) => void readFile(e.target.files?.[0])}
        />
        <span className="hint">
          PLAUD などで作った要約をテキスト／Markdown で書き出したファイルをそのまま読み込めます。
        </span>
      </div>

      <div className="field">
        <label htmlFor="mbody">議事録の本文</label>
        <textarea
          id="mbody"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          style={{ minHeight: 180, fontFamily: "inherit" }}
          placeholder={"議事録をそのまま貼り付けてください。\n\n例：\n## ToDo\n- 販促スケジュール案を作成（担当：鈴木、期限：9/10）\n- [ ] 説明会の日程確定 担当:中村 期限:来週金曜"}
        />
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" className="btn btn-primary" onClick={extract}>
          タスクを抽出する
        </button>
        {rows ? (
          <button type="button" className="btn" onClick={() => { setRows(null); setMessage(null); }}>
            やり直す
          </button>
        ) : null}
      </div>

      {rows && rows.length > 0 ? (
        <>
          <div className="section-head" style={{ marginTop: 22 }}>
            <div>
              <span className="section-title">抽出結果</span>
              <span className="section-note">　{rows.length}件見つかりました／登録対象 {selectedCount}件。担当と期限はここで直せます。</span>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 46 }}>登録</th>
                  <th>タスク名</th>
                  <th style={{ width: 150 }}>担当</th>
                  <th style={{ width: 150 }}>期限</th>
                  <th style={{ width: 90 }}>確度</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.include}
                        onChange={(e) => update(index, { include: e.target.checked })}
                        aria-label={`${row.title} を登録する`}
                        style={{ width: "auto", minWidth: 0 }}
                      />
                    </td>
                    <td>
                      <input type="text" value={row.title} onChange={(e) => update(index, { title: e.target.value })} />
                      <div className="code" style={{ marginTop: 2 }}>{row.raw}</div>
                    </td>
                    <td>
                      <select value={row.ownerId} onChange={(e) => update(index, { ownerId: e.target.value })}>
                        <option value="">未定</option>
                        {members.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                      {row.ownerHint && !row.ownerId ? (
                        <div className="code">議事録の表記: {row.ownerHint}</div>
                      ) : null}
                    </td>
                    <td>
                      <input type="date" value={row.dueDate} onChange={(e) => update(index, { dueDate: e.target.value })} />
                      {row.dueHint && !row.dueDate ? <div className="code">「{row.dueHint}」を解釈できず</div> : null}
                    </td>
                    <td>
                      <span className={`badge ${row.confidence === "high" ? "badge-done" : "badge-not_started"}`}>
                        {row.confidence === "high" ? "高" : "要確認"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 14 }}>
            <button type="button" className="btn btn-primary" onClick={submit} disabled={pending}>
              {pending ? "登録しています…" : `${selectedCount}件をタスクに登録する`}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
