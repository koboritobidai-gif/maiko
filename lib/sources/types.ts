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

/**
 * 取り込み対象のメールを見分ける件名の目印。
 *
 * 議事録は内容を確認してから社内共有する運用なので、確認済みのものだけに
 * この目印を付けて送ってもらい、アプリはその件名のメールだけを取り込む。
 */
export function subjectMarker(): string {
  return process.env.MINUTES_SUBJECT_MARKER ?? "【議事録送付】";
}

export function isMinutesSubject(subject: string): boolean {
  return (subject ?? "").includes(subjectMarker());
}

/**
 * 議事録を送る人のアドレス。ここに挙げたアドレスから届いたものだけを取り込む。
 * 空にすると差出人では絞り込まない。
 */
export function allowedSenders(): string[] {
  return (process.env.MINUTES_MAIL_FROM ?? "")
    .split(",")
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedSender(address: string | undefined | null): boolean {
  const allowed = allowedSenders();
  if (!allowed.length) return true;
  const from = (address ?? "").toLowerCase();
  return allowed.some((entry) => from === entry);
}

export interface SubjectInfo {
  /** 目印と Re:/Fwd: を取り除いた件名 */
  title: string;
  /** 件名に含まれていた登録済みの会議名 */
  meeting: string | null;
  /** 件名に含まれていた開催日 */
  date: string | null;
}

/**
 * 件名から会議名と開催日を読み取る。
 * 例：「Re: 【議事録送付】経営戦略会議 2026/09/01」→ 経営戦略会議 / 2026-09-01
 */
export function parseMinutesSubject(subject: string, meetings: string[]): SubjectInfo {
  const cleaned = (subject ?? "")
    .replace(/^\s*(?:re|fwd|fw)\s*:\s*/gi, "")
    .replace(subjectMarker(), " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  // 会議名は長いものから順に照合する（「経営協議会」と「協議会」のような重なりを避ける）。
  const meeting =
    [...meetings].sort((a, b) => b.length - a.length).find((name) => cleaned.includes(name)) ?? null;

  return { title: cleaned || subjectMarker(), meeting, date: findMeetingDate(cleaned) };
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
