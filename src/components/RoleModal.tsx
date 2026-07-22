"use client";

import type { Role } from "@/store/session";

interface RoleModalProps {
  /** true の場合はロール未選択(初回起動)。キャンセル不可で選択必須にする。 */
  mandatory: boolean;
  onSelect: (role: Role) => void;
  onClose?: () => void;
}

const ROLE_OPTIONS: {
  role: Role;
  title: string;
  description: string;
}[] = [
  {
    role: "exec",
    title: "小堀社長(経営ビュー)",
    description: "全社の数字・全拠点・全プロジェクトを俯瞰するビュー",
  },
  {
    role: "ca",
    title: "高梨CA(現場ビュー)",
    description: "自分の担当求職者・所属拠点を中心に見るビュー",
  },
];

export default function RoleModal({
  mandatory,
  onSelect,
  onClose,
}: RoleModalProps) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center"
      style={{ background: "rgba(15,20,34,0.55)" }}
      role="dialog"
      aria-modal="true"
      onClick={() => {
        if (!mandatory) onClose?.();
      }}
    >
      <div
        className="card w-full max-w-[420px] rounded-b-none p-6 sm:rounded-b-2xl sm:mb-0"
        style={{ marginBottom: mandatory ? 0 : undefined }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold" style={{ color: "var(--color-navy)" }}>
          {mandatory ? "ログインするロールを選んでください" : "ロールを切り替える"}
        </h2>
        <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
          Tobidai Cockpit はデモ環境です。閲覧したい視点を選んでください。
        </p>

        <div className="mt-4 flex flex-col gap-3">
          {ROLE_OPTIONS.map((opt) => (
            <button
              key={opt.role}
              type="button"
              onClick={() => onSelect(opt.role)}
              className="rounded-xl border p-4 text-left transition-colors"
              style={{
                borderColor: "var(--color-border)",
                background: "var(--color-cream)",
              }}
            >
              <p className="text-sm font-semibold" style={{ color: "var(--color-navy)" }}>
                {opt.title}
              </p>
              <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                {opt.description}
              </p>
            </button>
          ))}
        </div>

        {!mandatory && (
          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full rounded-xl py-2.5 text-center text-[13px] font-medium"
            style={{ color: "var(--color-text-muted)" }}
          >
            キャンセル
          </button>
        )}
      </div>
    </div>
  );
}
