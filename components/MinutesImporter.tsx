"use client";

import { useState, useTransition, type DragEvent } from "react";
import { importReviewedAction } from "@/app/actions";

/**
 * 議事録を取り込む画面。
 *
 * 議事録は内容を確認してから社内共有する運用のため、自動で取り込まず
 * 「ファイルをドラッグ＆ドロップ」か「本文を貼り付け」で読み込む。
 * 抽出結果もそのまま登録せず、担当・期限を確認・修正してから登録する。
 */

interface Member {
  id: string;
  name: string;
  department: string;
}

interface MeetingType {
  name: string;
  visibility: "all" | "executive";
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
  meetings,
  canSetExecutive,
  today,
}: {
  members: Member[];
  meetings: MeetingType[];
  canSetExecutive: boolean;
  today: string;
}) {
  const [meeting, setMeeting] = useState("");
  const [meetingDate, setMeetingDate] = useState(today);
  const [visibility, setVisibility] = useState<"all" | "executive">("all");
  const [body, setBody] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** 会議を選ぶと、その会議の既定の公開範囲に合わせる（役員会なら役員限定）。 */
  function chooseMeeting(name: string) {
    setMeeting(name);
    const selected = meetings.find((m) => m.name === name);
    if (selected) setVisibility(selected.visibility);
  }

  async function readFile(file: File | undefined | null) {
    if (!file) return;
    if (file.size > 2_000_000) {
      setMessage("ファイルが大きすぎます。2MB以内のテキスト／Markdown を選んでください。");
      return;
    }
    const text = await file.text();
    setBody(text);
    setRows(null);
    setFileName(file.name);

    // 「2026-09-01-経営戦略会議.md」のようなファイル名から日付と会議名を拾う。
    const name = file.name.replace(/\.(md|txt|markdown)$/i, "");
    const matched = name.match(/^(\d{4}-\d{2}-\d{2})[-_ ](.+)$/);
    if (matched) {
      setMeetingDate(matched[1]);
      const hit = meetings.find((m) => matched[2].includes(m.name));
      if (hit) chooseMeeting(hit.name);
    }
    if (!matched) {
      const hit = meetings.find((m) => name.includes(m.name) || text.includes(m.name));
      if (hit) chooseMeeting(hit.name);
    }
    setMessage(`${file.name} を読み込みました。内容を確認して「タスクを抽出する」を押してください。`);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void readFile(event.dataTransfer.files?.[0]);
  }

  async function extract() {
    setMessage(null);
    if (!body.trim()) {
      setMessage("議事録の本文を貼り付けるか、ファイルをドラッグ＆ドロップしてください。");
      return;
    }
    if (!meeting) {
      setMessage("会議名を選んでください。");
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
      setMessage("タスクらしい行が見つかりませんでした。「ネクストアクション」「WHO：」「担当:」などの表記があると拾いやすくなります。");
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
      title: meeting,
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

  const selectedCount = (rows ?? []).filter((row) => row.include).length;

  return (
    <div className="card card-pad">
      {message ? <div className="notice notice-info">{message}</div> : null}

      <div className="form-grid">
        <div className="field">
          <label htmlFor="mmeeting">会議名</label>
          <select id="mmeeting" value={meeting} onChange={(e) => chooseMeeting(e.target.value)}>
            <option value="">選択してください</option>
            {meetings.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
                {item.visibility === "executive" ? "（役員限定）" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="mdate">開催日</label>
          <input id="mdate" type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
          <span className="hint">「来週金曜」などの期限は、この日を基準に日付へ直します。</span>
        </div>
        {canSetExecutive ? (
          <div className="field">
            <label htmlFor="mvis">公開範囲</label>
            <select
              id="mvis"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as "all" | "executive")}
            >
              <option value="all">全社員</option>
              <option value="executive">役員のみ</option>
            </select>
            <span className="hint">会議名を選ぶと自動で切り替わります。</span>
          </div>
        ) : null}
      </div>

      {/* 議事録は内容を確認してから共有するため、読み込みは手動（D&D か貼り付け）にしている。 */}
      <div
        className={`dropzone${dragging ? " is-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div className="dropzone-main">議事録ファイルをここにドラッグ＆ドロップ</div>
        <div className="dropzone-sub">
          テキスト／Markdown（.txt / .md）に対応。PLAUD などで作った要約を書き出したファイルをそのまま置けます。
        </div>
        <label className="btn btn-sm" style={{ marginTop: 8 }}>
          ファイルを選ぶ
          <input
            type="file"
            accept=".txt,.md,.markdown,text/plain,text/markdown"
            onChange={(e) => void readFile(e.target.files?.[0])}
            style={{ display: "none" }}
          />
        </label>
        {fileName ? <div className="dropzone-file">読み込み済み：{fileName}</div> : null}
      </div>

      <div className="field">
        <label htmlFor="mbody">議事録の本文（メールの文章を貼り付けても構いません）</label>
        <textarea
          id="mbody"
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setFileName(null);
          }}
          style={{ minHeight: 180 }}
          placeholder={"議事録をそのまま貼り付けてください。\n\n例：\n【ネクストアクション】\n① 九州支社移転\n* WHO：文字さん＋友井さん\n* WHAT：正式見積を取得し、最終判断する。"}
        />
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" className="btn btn-primary" onClick={extract}>
          タスクを抽出する
        </button>
        {rows ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setRows(null);
              setMessage(null);
            }}
          >
            やり直す
          </button>
        ) : null}
      </div>

      {rows && rows.length > 0 ? (
        <>
          <div className="section-head" style={{ marginTop: 22 }}>
            <div>
              <span className="section-title">抽出結果</span>
              <span className="section-note">
                　{rows.length}件見つかりました／登録対象 {selectedCount}件。担当と期限はここで直せます。
              </span>
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
                      <input
                        type="text"
                        value={row.title}
                        onChange={(e) => update(index, { title: e.target.value })}
                      />
                      <div className="code" style={{ marginTop: 2 }}>
                        {row.raw.split("\n")[0]}
                      </div>
                    </td>
                    <td>
                      <select
                        value={row.ownerId}
                        onChange={(e) => update(index, { ownerId: e.target.value })}
                      >
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
                      <input
                        type="date"
                        value={row.dueDate}
                        onChange={(e) => update(index, { dueDate: e.target.value })}
                      />
                      {row.dueHint && !row.dueDate ? (
                        <div className="code">「{row.dueHint}」を解釈できず</div>
                      ) : null}
                    </td>
                    <td>
                      <span
                        className={`badge ${row.confidence === "high" ? "badge-done" : "badge-not_started"}`}
                      >
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
