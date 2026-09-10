/**
 * イベント流入の手動KPI加算。
 *
 * 経営者依頼(2026-09-10)「9/4・9/5のイベント流入 LINE登録50名・面談予約30件を反映」。
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
  // 9/4・9/5開催イベントからの流入(両日とも8/31週=月曜8/31〜日曜9/6に含まれるため、
  // その週に計上する。cd6fd2d の帰属月ルールにより8/31週は9月に計上される)。
  { weekStart: "2026-08-31", category: "求職者", key: "LINE登録人数", value: 50, owner: EVENT_OWNER },
  { weekStart: "2026-08-31", category: "求職者", key: "面談予約数", value: 30, owner: EVENT_OWNER },
];

/**
 * ライブ取得した週次KPIレコードに手動加算分を連結する。
 * 呼び出しは data-bundle.ts のライブ取得成功パスのみ(デモデータ・エラー時フォールバックには適用しない)。
 */
export function withManualKpiAdjustments(records: WeeklyKpiRecord[]): WeeklyKpiRecord[] {
  return [...records, ...MANUAL_KPI_ADJUSTMENTS];
}
