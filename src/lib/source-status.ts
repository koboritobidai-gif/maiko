/**
 * SourceStatus(live/demo/live-error)からダッシュボードのソースバッジ表示文言を組み立てる。
 * サーバー専用処理(node:crypto 等)を一切含まないため、クライアントコンポーネントから
 * 安全に import できる(adapters/data-bundle 側は import しないこと)。
 */
import type { SourceStatus } from "./types";

const LABELS: Record<"sheets" | "slack", Record<SourceStatus, string>> = {
  sheets: {
    live: "Sheets(連携中)",
    demo: "Sheets(デモ)",
    "live-error": "Sheets(接続エラー・デモ表示)",
  },
  slack: {
    live: "Slack(連携中)",
    demo: "Slack(デモ)",
    "live-error": "Slack(接続エラー・デモ表示)",
  },
};

/** ダッシュボードのソースバッジに出す文言を返す。 */
export function sourceBadgeLabel(kind: "sheets" | "slack", status: SourceStatus): string {
  return LABELS[kind][status];
}
