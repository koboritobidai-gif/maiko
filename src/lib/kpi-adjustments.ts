/**
 * イベント流入の手動KPI加算。
 *
 * 経営者依頼(2026-09-10)「9/4・9/5のイベント流入 LINE登録50名・面談予約30件を反映」。
 * ただしLINE登録50名はKPI表の8/31週の値(59)に含まれているとの経営者確認により加算対象外。
 * イベント流入は連携シート(週次KPIタブ)には入力されない運用のため、ライブ取得できた週次KPI
 * レコードにこの配列を連結して加算する(data-bundle.ts のライブ取得成功パスのみ。デモデータには
 * 混ぜない)。「イベントあるときは別途依頼する」とのことなので、今後イベントがあれば下の配列に
 * レコードを追記していく運用とする。
 *
 * 加算はデータ取得の一点(data-bundle.ts)で行うため、主要指標・月次推移・マーケティングタブ・
 * 月次/週次MTG資料・「AIに聞く」など、週次KPI(weeklyKpis)を参照するすべての集計・表示に
 * 一律で(二重加算なく)効く。
 *
 * 入力担当者(owner)は実在のCA/RAと衝突しない専用の値「イベント」とし、CA/RA個人別のKPI集計
 * (metrics.ts の getMonthlyKpiEntriesByOwner)には混ざらないようにしている。
 * 面談数(面談実施)は今回の依頼対象外のため加算しない。
 */
import type { WeeklyKpiRecord } from "./types";

/** 手動加算の入力担当者名。実在のメンバー名(Member.name)と衝突しない専用の値。 */
const EVENT_OWNER = "イベント";

export const MANUAL_KPI_ADJUSTMENTS: WeeklyKpiRecord[] = [
  // 現在は空。経営者確認(2026-09-10)により:
  // - イベント流入のLINE登録50名はKPI表の8/31週LINE登録人数(59)に既に含まれている → 加算しない
  // - 面談予約は「イベント分+広告流入分の合計」をマーケ表示に使う方針になったため、週次KPI
  //   レコードとしてではなく下の MANUAL_EVENT_RESERVATIONS で管理する(KPI表の面談予約数は
  //   マーケ表示には使わない)。
];

/** イベント経由の面談予約の手動計上1件分。 */
export interface EventReservationEntry {
  /** 帰属週の月曜("YYYY-MM-DD")。月の帰属は metrics.ts の週帰属ルール(木曜日の月)に従う。 */
  weekStart: string;
  /** 面談予約数 */
  count: number;
  /** 何のイベントか(コード上の記録用) */
  note: string;
}

/**
 * イベント経由の面談予約。経営者指示(2026-09-10)「面談予約はイベントの30と昼職などの
 * 広告流入での予約の合計にして。KPI表の9は含めなくてOK」。
 * マーケティングタブ・月次/週次MTG資料の面談予約数 = 広告シートの面談予約数 + この配列の該当分。
 * 今後イベントがあればここに追記する。
 */
export const MANUAL_EVENT_RESERVATIONS: EventReservationEntry[] = [
  { weekStart: "2026-08-31", count: 30, note: "9/4・9/5開催イベントからの面談予約" },
];

/**
 * ライブ取得した週次KPIレコードに手動加算分を連結する。
 * 呼び出しは data-bundle.ts のライブ取得成功パスのみ(デモデータ・エラー時フォールバックには適用しない)。
 */
export function withManualKpiAdjustments(records: WeeklyKpiRecord[]): WeeklyKpiRecord[] {
  return [...records, ...MANUAL_KPI_ADJUSTMENTS];
}
