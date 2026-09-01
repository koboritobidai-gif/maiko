/** 議事録の取得元（コネクタ）の共通インターフェース。 */

export type SourceName = "mail" | "slack" | "drive" | "manual";

export const SOURCE_LABELS: Record<SourceName, string> = {
  mail: "メール",
  slack: "Slack",
  drive: "Google ドライブ",
  manual: "手動貼り付け",
};

/** 取得してきた議事録 1 件。 */
export interface MinutesDoc {
  source: SourceName;
  /** 取得元での識別子。再取り込みで重複しないように使う */
  externalId: string;
  title: string;
  /** 開催日（YYYY-MM-DD）。相対的な期限表現の基準にもなる */
  meetingDate: string | null;
  url: string;
  author: string;
  body: string;
  /** この議事録から作るタスクの公開範囲。役員会のチャンネル・フォルダは executive にする */
  visibility: "all" | "executive";
}

export interface MinutesSource {
  name: SourceName;
  label: string;
  /** 必要な環境変数が揃っているか。未設定のソースは画面に理由を出す */
  configured(): boolean;
  /** 設定が足りないときに画面へ出す説明 */
  requirement: string;
  /** 直近 days 日ぶんの議事録を取得する */
  fetchRecent(days: number): Promise<MinutesDoc[]>;
}

/** 議事録らしいタイトルかどうか。既定のキーワードは環境変数で変えられる。 */
export function looksLikeMinutes(text: string): boolean {
  const keywords = (process.env.MINUTES_KEYWORDS ?? "議事録,議事メモ,MTGメモ,ミーティングメモ,打ち合わせメモ,minutes")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const target = (text ?? "").toLowerCase();
  return keywords.some((k) => target.includes(k.toLowerCase()));
}

/** 「2026年9月1日」「2026/09/01」などをタイトルや本文から拾う。 */
export function findMeetingDate(text: string, fallback: string | null = null): string | null {
  const m = (text ?? "").match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?/);
  if (!m) return fallback;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day, 12));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return fallback;
  return d.toISOString().slice(0, 10);
}
