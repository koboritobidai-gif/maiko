/**
 * 送信完了などを知らせる簡易トースト。画面下部に一時表示する。
 * Phase 2-B 専用コンポーネント。
 */
interface ToastProps {
  message: string;
}

export default function Toast({ message }: ToastProps) {
  return (
    <div
      className="pointer-events-none fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2.5 text-[12px] font-medium shadow-lg"
      style={{ background: "var(--color-navy)", color: "#f2efe6" }}
      role="status"
    >
      {message}
    </div>
  );
}
