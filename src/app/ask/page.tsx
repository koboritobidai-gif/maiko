"use client";

import { useEffect, useRef, useState } from "react";
import ChatBubble, { ChatTypingIndicator } from "@/components/ChatBubble";
import SuggestionChip from "@/components/SuggestionChip";
import { IconChat } from "@/components/icons";
import { sourceBadgeLabel } from "@/lib/source-status";
import type { SourceStatus } from "@/lib/types";
import { useSession } from "@/store/session";

interface ChatMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  sourceLabel?: string;
}

const SUGGESTIONS = [
  "今日の成約は?",
  "今月の面談数は?",
  "LINE登録率は?",
  "今月の契約金額は?",
  "遅れているプロジェクトは?",
  "選考中の求職者は?",
];

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "ai",
  text: "こんにちは。数字や進捗について気になることを聞いてください。下のサジェストからも選べます。",
};

let messageSeq = 0;
function nextId(): string {
  messageSeq += 1;
  return `msg-${Date.now()}-${messageSeq}`;
}

export default function AskPage() {
  const { role } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function sendQuestion(question: string) {
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    setError(null);
    setMessages((prev) => [...prev, { id: nextId(), role: "user", text: trimmed }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, role }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data: { answer: string; source: "claude" | "rule"; sourceStatus?: SourceStatus } =
        await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "ai",
          text: data.answer,
          sourceLabel: sourceBadgeLabel("sheets", data.sourceStatus ?? "demo"),
        },
      ]);
    } catch {
      setError("回答の取得に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-2 border-b px-4 pb-3 pt-1" style={{ borderColor: "var(--color-border)" }}>
        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-xl"
            style={{
              background: "color-mix(in srgb, var(--color-navy) 8%, transparent)",
              color: "var(--color-navy)",
            }}
          >
            <IconChat width={18} height={18} />
          </div>
          <h1 className="text-[15px] font-bold" style={{ color: "var(--color-navy)" }}>
            AIに聞く
          </h1>
        </div>
        <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
          {SUGGESTIONS.map((s) => (
            <SuggestionChip key={s} label={s} disabled={loading} onClick={() => sendQuestion(s)} />
          ))}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-3">
          {messages.map((m) => (
            <ChatBubble key={m.id} role={m.role} sourceLabel={m.sourceLabel}>
              {m.text}
            </ChatBubble>
          ))}
          {loading && <ChatTypingIndicator />}
          {error && (
            <p className="text-center text-[12px]" style={{ color: "var(--color-bad)" }}>
              {error}
            </p>
          )}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendQuestion(input);
        }}
        className="flex items-center gap-2 border-t px-4 py-3"
        style={{ borderColor: "var(--color-border)", background: "var(--color-cream)" }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="質問を入力…(例: 今日の成約は?)"
          disabled={loading}
          className="flex-1 rounded-full px-4 py-2.5 text-[13px] outline-none disabled:opacity-60"
          style={{
            background: "var(--color-card)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text)",
          }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="shrink-0 rounded-full px-4 py-2.5 text-[13px] font-semibold transition-opacity disabled:opacity-50"
          style={{ background: "var(--color-navy)", color: "#f2efe6" }}
        >
          送信
        </button>
      </form>
    </div>
  );
}
