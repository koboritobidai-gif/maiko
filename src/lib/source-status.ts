/**
 * SourceStatus(live/demo/live-error)からダッシュボードのソースバッジ表示文言を組み立てる。
 * サーバー専用処理(node:crypto 等)を一切含まないため、クライアントコンポーネントから
 * 安全に import できる(adapters/data-bundle 側は import しないこと)。
 */
import type { SourceStatus } from "./types";

const LABELS: Record<
  "sheets" | "slack" | "marketing" | "invoices" | "revenue" | "sales",
  Record<SourceStatus, string>
> = {
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
  marketing: {
    live: "集客データ(連携中)",
    demo: "集客データ(デモ)",
    "live-error": "集客データ(接続エラー・デモ表示)",
  },
  invoices: {
    live: "請求書チェック(連携中)",
    demo: "請求書チェック(デモ)",
    "live-error": "請求書チェック(接続エラー・デモ表示)",
  },
  revenue: {
    live: "送客売上(連携中)",
    demo: "送客売上(デモ)",
    "live-error": "送客売上(接続エラー・デモ表示)",
  },
  sales: {
    live: "営業実績(連携中)",
    demo: "営業実績(デモ)",
    "live-error": "営業実績(接続エラー・デモ表示)",
  },
};

/** ダッシュボードのソースバッジに出す文言を返す。 */
export function sourceBadgeLabel(
  kind: "sheets" | "slack" | "marketing" | "invoices" | "revenue" | "sales",
  status: SourceStatus,
): string {
  return LABELS[kind][status];
}
