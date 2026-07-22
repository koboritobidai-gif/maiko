/**
 * 「届ける」の宛先メンバー提案カード。氏名・役割・選定理由を表示する。
 * Phase 2-B 専用コンポーネント。
 */
import type { DeliverMemberSuggestion } from "@/lib/ai/deliver-router";

export default function DeliverMemberCard({ member }: { member: DeliverMemberSuggestion }) {
  return (
    <div className="card flex flex-col gap-1 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold" style={{ color: "var(--color-navy)" }}>
          {member.name}
        </span>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{
            background: "color-mix(in srgb, var(--color-navy) 8%, transparent)",
            color: "var(--color-navy)",
          }}
        >
          {member.roleLabel}
        </span>
      </div>
      <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
        {member.specialty}
      </p>
      <p className="text-[12px] leading-relaxed" style={{ color: "var(--color-text)" }}>
        {member.reason}
      </p>
    </div>
  );
}
