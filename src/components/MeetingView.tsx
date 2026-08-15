"use client";

import { useState } from "react";
import CopyButton from "@/components/CopyButton";
import SourceBadge from "@/components/SourceBadge";
import { IconMic } from "@/components/icons";
import { demoTranscripts, type MeetingKind } from "@/lib/demo-transcripts";
import type { MeetingResult } from "@/lib/ai/meeting-gen";

const KIND_LABEL: Record<MeetingKind, string> = {
  candidate: "求職者面談",
  corporate: "企業商談",
};

type SectionKey = "minutes" | "insight" | "actions" | "sheet" | "email";

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "minutes", label: "議事録" },
  { key: "insight", label: "インサイト" },
  { key: "actions", label: "ネクストアクション" },
  { key: "sheet", label: "シート更新" },
  { key: "email", label: "フォローメール" },
];

function buildEmailText(result: MeetingResult): string {
  return `件名: ${result.followUpEmail.subject}\n\n${result.followUpEmail.body}`;
}

export default function MeetingView() {
  const [kind, setKind] = useState<MeetingKind>("candidate");
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MeetingResult | null>(null);
  const [activeSection, setActiveSection] = useState<SectionKey>("minutes");

  const canSubmit = transcript.trim().length >= 10 && !loading;

  function selectSample(id: string) {
    const sample = demoTranscripts.find((t) => t.id === id);
    if (!sample) return;
    setSelectedSampleId(id);
    setKind(sample.kind);
    setTranscript(sample.text);
    setResult(null);
    setError(null);
  }

  function handleTranscriptChange(value: string) {
    setTranscript(value);
    setSelectedSampleId(null);
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, kind }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "生成に失敗しました。");
        return;
      }
      setResult(data as MeetingResult);
      setActiveSection("minutes");
    } catch {
      setError("通信に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-8 pt-4">
      {/* 説明ヘッダー */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
            style={{
              background: "color-mix(in srgb, var(--color-navy) 8%, transparent)",
              color: "var(--color-navy)",
            }}
          >
            <IconMic width={24} height={24} />
          </div>
          <div>
            <h1 className="text-base font-bold" style={{ color: "var(--color-navy)" }}>
              面談AI(面談コパイロット)
            </h1>
          </div>
        </div>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
          面談メモ(文字起こしテキスト)を貼るだけ。AIが議事録・インサイト・ネクストアクション・シート更新内容・フォローメールを一括作成します。
        </p>
      </section>

      {/* サンプル選択 */}
      <section className="flex flex-col gap-2">
        <h2 className="text-[12px] font-bold" style={{ color: "var(--color-navy)" }}>
          サンプル文字起こしから選ぶ
        </h2>
        <div className="flex flex-col gap-2">
          {demoTranscripts.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => selectSample(t.id)}
              className="card flex flex-col gap-0.5 p-3 text-left transition-colors"
              style={{
                borderColor:
                  selectedSampleId === t.id ? "var(--color-gold)" : "var(--color-border)",
                background:
                  selectedSampleId === t.id
                    ? "color-mix(in srgb, var(--color-gold) 8%, transparent)"
                    : "var(--color-card)",
              }}
            >
              <span className="text-[13px] font-semibold" style={{ color: "var(--color-navy)" }}>
                {t.label}
              </span>
              <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                {t.summary}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* 種別トグル + テキストエリア */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[12px] font-bold" style={{ color: "var(--color-navy)" }}>
            面談メモを貼り付け
          </h2>
          <div className="flex overflow-hidden rounded-full border" style={{ borderColor: "var(--color-border)" }}>
            {(Object.keys(KIND_LABEL) as MeetingKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className="px-2.5 py-1 text-[11px] font-medium transition-colors"
                style={{
                  background: kind === k ? "var(--color-navy)" : "transparent",
                  color: kind === k ? "#f2efe6" : "var(--color-text-muted)",
                }}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        <textarea
          value={transcript}
          onChange={(e) => handleTranscriptChange(e.target.value)}
          placeholder="面談・商談の文字起こしテキストをここに貼り付けてください(サンプル選択も可)"
          rows={9}
          className="card w-full resize-y p-3 text-[13px] leading-relaxed outline-none"
          style={{ color: "var(--color-text)" }}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded-xl py-3 text-center text-[13px] font-bold transition-opacity"
          style={{
            background: "var(--color-navy)",
            color: "#f2efe6",
            opacity: canSubmit ? 1 : 0.5,
          }}
        >
          {loading ? "生成中…" : "AIで一括生成する"}
        </button>
        {error && (
          <p className="text-[12px]" style={{ color: "var(--color-bad)" }}>
            {error}
          </p>
        )}
      </section>

      {/* 結果表示 */}
      {result && (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
              生成結果({KIND_LABEL[result.kind]})
            </h2>
            <SourceBadge label={result.source === "claude" ? "Claude API" : "デモ生成"} />
          </div>

          <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setActiveSection(s.key)}
                className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors"
                style={{
                  background:
                    activeSection === s.key
                      ? "var(--color-navy)"
                      : "color-mix(in srgb, var(--color-navy) 8%, transparent)",
                  color: activeSection === s.key ? "#f2efe6" : "var(--color-navy)",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="card p-3.5">
            {activeSection === "minutes" && (
              <ul className="flex flex-col gap-2">
                {result.minutes.map((line, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-relaxed">
                    <span aria-hidden style={{ color: "var(--color-gold)" }}>
                      ・
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            )}

            {activeSection === "insight" && (
              <p
                className="rounded-lg p-3 text-[13px] leading-relaxed"
                style={{ background: "var(--color-cream)", color: "var(--color-text)" }}
              >
                {result.insight}
              </p>
            )}

            {activeSection === "actions" && (
              <ul className="flex flex-col divide-y" style={{ borderColor: "var(--color-border)" }}>
                {result.actions.map((a, i) => (
                  <li key={i} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[13px] font-medium" style={{ color: "var(--color-navy)" }}>
                        {a.action}
                      </span>
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          background: "color-mix(in srgb, var(--color-gold) 16%, transparent)",
                          color: "var(--color-gold)",
                        }}
                      >
                        {a.dueDate}
                      </span>
                    </div>
                    <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                      担当: {a.owner}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {activeSection === "sheet" && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-[12px]">
                  <thead>
                    <tr style={{ color: "var(--color-text-muted)" }}>
                      <th className="pb-2 pr-2 font-medium">対象</th>
                      <th className="pb-2 pr-2 font-medium">項目</th>
                      <th className="pb-2 pr-2 font-medium">変更前</th>
                      <th className="pb-2 font-medium">変更後</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: "var(--color-border)" }}>
                    {result.sheetUpdates.map((row, i) => (
                      <tr key={i}>
                        <td className="py-2 pr-2 font-medium" style={{ color: "var(--color-navy)" }}>
                          {row.target}
                        </td>
                        <td className="py-2 pr-2">{row.field}</td>
                        <td className="py-2 pr-2" style={{ color: "var(--color-text-muted)" }}>
                          {row.before}
                        </td>
                        <td className="py-2" style={{ color: "var(--color-good)" }}>
                          {row.after}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeSection === "email" && (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold" style={{ color: "var(--color-navy)" }}>
                    件名: {result.followUpEmail.subject}
                  </span>
                  <CopyButton getText={() => buildEmailText(result)} />
                </div>
                <p
                  className="whitespace-pre-wrap rounded-lg p-3 text-[13px] leading-relaxed"
                  style={{ background: "var(--color-cream)", color: "var(--color-text)" }}
                >
                  {result.followUpEmail.body}
                </p>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
