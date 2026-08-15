/**
 * Next.js が「このページは動的に描画すべき」と判断するために投げる内部エラーの判定。
 * data-bundle.ts / candidate-threads.ts の両方で、live 取得失敗時にデモへフォールバックする
 * catch 節から共通で使う(これを catch して握りつぶすと静的化されたページにデモデータが
 * 焼き込まれてしまうため、フォールバックせずに再スローする)。
 */
export function isNextDynamicUsageError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    (error as { digest?: unknown }).digest === "DYNAMIC_SERVER_USAGE"
  );
}
