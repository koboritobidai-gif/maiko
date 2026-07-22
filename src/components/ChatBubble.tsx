/**
 * 「AIに聞く」チャットUI用の吹き出し。ユーザーは右寄せ(紺)、AIは左寄せ(白)。
 * Phase 2-B 専用コンポーネント。
 */
import type { ReactNode } from "react";
import SourceBadge from "./SourceBadge";

interface ChatBubbleProps {
  role: "user" | "ai";
  children: ReactNode;
  sourceLabel?: string;
}

export default function ChatBubble({ role, children, sourceLabel }: ChatBubbleProps) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`flex max-w-[85%] flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}>
        <div
          className="whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed"
          style={
            isUser
              ? {
                  background: "var(--color-navy)",
                  color: "#f2efe6",
                  borderBottomRightRadius: 4,
                }
              : {
                  background: "var(--color-card)",
                  color: "var(--color-text)",
                  border: "1px solid var(--color-border)",
                  borderBottomLeftRadius: 4,
                }
          }
        >
          {children}
        </div>
        {!isUser && sourceLabel && <SourceBadge label={sourceLabel} />}
      </div>
    </div>
  );
}

/** AI が回答を生成中であることを示すタイピングインジケータ。 */
export function ChatTypingIndicator() {
  return (
    <div className="flex justify-start">
      {/* globals.css を編集せずアニメーションを持たせるためコンポーネント内で定義する */}
      <style>{`
        @keyframes tobidai-chat-typing-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-3px); opacity: 1; }
        }
      `}</style>
      <div
        className="flex items-center gap-1 rounded-2xl px-4 py-3"
        style={{
          background: "var(--color-card)",
          border: "1px solid var(--color-border)",
          borderBottomLeftRadius: 4,
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{
              background: "var(--color-text-muted)",
              animation: "tobidai-chat-typing-bounce 1.1s ease-in-out infinite",
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
