"use client";

import { useState } from "react";
import DeliverMemberCard from "@/components/DeliverMemberCard";
import SourceBadge from "@/components/SourceBadge";
import Toast from "@/components/Toast";
import { IconDeliver } from "@/components/icons";
import type { DeliverCategory, DeliverSuggestion } from "@/lib/ai/deliver-router";
import { DELIVER_CATEGORIES } from "@/lib/ai/deliver-router";
import { sourceBadgeLabel } from "@/lib/source-status";
import type { SourceStatus } from "@/lib/types";
import { getRoleProfile, useSession } from "@/store/session";

const PLACEHOLDER_TEXT =
  "例: 本日、IT企業様にてWebエンジニア職の内定承諾をいただきました。理論年収800万円、今月3件目の成約です。";

export default function DeliverPage() {
  const { role } = useSession();
  const [text, setText] = useState("");
  const [category, setCategory] = useState<DeliverCategory>("成果報告");
  const [suggestion, setSuggestion] = useState<DeliverSuggestion | null>(null);
  const [source, setSource] = useState<"claude" | "rule" | null>(null);
  const [dataSourceStatus, setDataSourceStatus] = useState<SourceStatus>("demo");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function requestSuggestion() {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setError(null);
    setSuggestion(null);
    setLoading(true);
    try {
      const res = await fetch("/api/deliver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, category, role }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data: {
        suggestion: DeliverSuggestion;
        source: "claude" | "rule";
        sourceStatus?: SourceStatus;
      } = await res.json();
      setSuggestion(data.suggestion);
      setSource(data.source);
      setDataSourceStatus(data.sourceStatus ?? "demo");
    } catch {
      setError("宛先の提案に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  async function sendToSlack() {
    if (!suggestion || sending) return;
    setSending(true);
    setError(null);
    try {
      const author = role ? getRoleProfile(role).name : "Tobidai Cockpit";
      const channel = suggestion.channels[0] ?? "#全社";
      const res = await fetch("/api/deliver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          channel,
          author,
          body: suggestion.message.formatted,
        }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setToast(`${channel} に送信しました(デモ)`);
      window.setTimeout(() => setToast(null), 2800);
    } catch {
      setError("送信に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pb-10 pt-4">
      <div className="flex items-center gap-2">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-xl"
          style={{
            background: "color-mix(in srgb, var(--color-navy) 8%, transparent)",
            color: "var(--color-navy)",
          }}
        >
          <IconDeliver width={18} height={18} />
        </div>
        <h1 className="text-[15px] font-bold" style={{ color: "var(--color-navy)" }}>
          届ける
        </h1>
      </div>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
          カテゴリ
        </h2>
        <div className="flex gap-2">
          {DELIVER_CATEGORIES.map((c) => {
            const active = c === category;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className="rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors"
                style={
                  active
                    ? { background: "var(--color-navy)", color: "#f2efe6" }
                    : {
                        background: "var(--color-card)",
                        color: "var(--color-text-muted)",
                        border: "1px solid var(--color-border)",
                      }
                }
              >
                {c}
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
          配信したい情報
        </h2>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER_TEXT}
          rows={5}
          className="card w-full resize-none p-3.5 text-[13px] leading-relaxed outline-none"
          style={{ color: "var(--color-text)" }}
        />
        <button
          type="button"
          onClick={requestSuggestion}
          disabled={!text.trim() || loading}
          className="rounded-full px-4 py-2.5 text-[13px] font-semibold transition-opacity disabled:opacity-50"
          style={{ background: "var(--color-gold)", color: "#20180a" }}
        >
          {loading ? "AIが宛先を考え中…" : "AIに宛先を考えてもらう"}
        </button>
        {error && (
          <p className="text-[12px]" style={{ color: "var(--color-bad)" }}>
            {error}
          </p>
        )}
      </section>

      {suggestion && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-bold" style={{ color: "var(--color-navy)" }}>
              AIからの提案
            </h2>
            <SourceBadge label={source === "claude" ? "Claude" : sourceBadgeLabel("sheets", dataSourceStatus)} />
          </div>

          <div className="flex flex-col gap-2">
            {suggestion.members.map((m) => (
              <DeliverMemberCard key={m.id} member={m} />
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {suggestion.channels.map((c) => (
              <span
                key={c}
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{
                  background: "color-mix(in srgb, var(--color-gold) 16%, transparent)",
                  color: "var(--color-gold)",
                }}
              >
                {c}
              </span>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold" style={{ color: "var(--color-navy)" }}>
              メッセージプレビュー
            </span>
            <pre
              className="card whitespace-pre-wrap p-3.5 text-[12px] leading-relaxed"
              style={{ color: "var(--color-text)", fontFamily: "inherit" }}
            >
              {suggestion.message.formatted}
            </pre>
          </div>

          <button
            type="button"
            onClick={sendToSlack}
            disabled={sending}
            className="rounded-full px-4 py-2.5 text-[13px] font-semibold transition-opacity disabled:opacity-50"
            style={{ background: "var(--color-navy)", color: "#f2efe6" }}
          >
            {sending ? "送信中…" : "Slackに送信(デモ)"}
          </button>
        </section>
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}
