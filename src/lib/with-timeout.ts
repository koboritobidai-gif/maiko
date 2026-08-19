/**
 * ダッシュボード「/」・企業ページ「/companies」の信頼性用ユーティリティ。
 * コールドスタート+Slack/Googleのレート制限が重なると、6つのローダーの合計が
 * Vercelの関数実行時間上限(60秒)を超え、ページ自体が開けなくなる(504)障害があった。
 * `withTimeout` は各ローダーに個別の時間上限を設け、上限を過ぎたら(ライブ失敗時と同じ形の)
 * フォールバック値で先にページを返す。
 *
 * 時間切れでも元の Promise(`promise`)は破棄せず走り続けさせる。ローダー内部のモジュール
 * キャッシュ・Next.jsデータキャッシュは裏で貯まり続けるため、次回以降のアクセスは速くなる
 * (Vercelの関数インスタンスが同じ場合。/api/warm の定期実行と合わせてキャッシュを温める)。
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback()), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * withTimeout がタイムアウトでフォールバック値を返したときの共通エラーメッセージ。
 * 各ローダーの `xxxTimeoutFallback()` はこれを errorMessage に設定する
 * (画面のソースバッジ・自己診断表示は live-error と同じ枠組みで出し分けられる)。
 */
export const TIMEOUT_FALLBACK_MESSAGE =
  "読み込みに時間がかかったため、一時的に表示できませんでした。数十秒おいて再読み込みしてください(裏で読み込みは継続しています)。";
