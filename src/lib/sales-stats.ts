/**
 * Slack「#21_ra」「#22_アポイント報告」から読み取った営業実績(`SalesDailyReport[]` /
 * `AppointmentReport[]`)を、法人営業(清本・望月)ごと×月ごとに集計する純関数(docs/DESIGN.md 4.1参照)。
 * `slack-ca-stats.ts`(CA別実績)と同じ設計方針: 対象者は実在名簿の固定リストで判定し、
 * 求職者台帳(`Member[]`)は使わない。
 */
import type { AppointmentReport, SalesDailyReport } from "./types";

/** 実在の法人営業名簿(経営者申告、固定)。 */
export const SALES_NAMES = ["清本", "望月"];

/** 営業実績が「その他」(SALES_NAMESのいずれにも一致しない投稿者)に分類された場合のラベル。 */
const OTHER_LABEL = "その他";

/** 営業×月別の実績1行。 */
export interface SalesMonthlyRow {
  /** SALES_NAMES のいずれか、またはどれにも一致しない場合「その他」 */
  member: string;
  /** 架電数(#21_ra) */
  calls: number;
  /** アポ獲得数(#22_アポイント報告、1投稿=1件) */
  appointments: number;
  /** 獲得経路の内訳(件数降順) */
  appointmentRoutes: { route: string; count: number }[];
  /** 商談数(#21_ra) */
  meetings: number;
  /** 契約数(#21_ra) */
  contracts: number;
}

/** ある月の営業実績まとめ。 */
export interface SalesMonthlyStats {
  /** 対象月(YYYY-MM) */
  monthKey: string;
  /** 全項目0の行は含めない。行順は SALES_NAMES 順→その他 */
  rows: SalesMonthlyRow[];
}

function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 投稿者の表示名に営業名(SALES_NAMES)が含まれるか(部分一致・大文字小文字無視)で対応する名前を探す。 */
function findSalesNameByAuthor(author: string): string | undefined {
  const lower = author.toLowerCase();
  return SALES_NAMES.find((name) => lower.includes(name.toLowerCase()));
}

interface RowAccumulator {
  member: string;
  order: number;
  calls: number;
  meetings: number;
  contracts: number;
  routeCounts: Map<string, number>;
}

/**
 * 営業実績(直近nヶ月分、今月が先頭)を、Slack「#21_ra」「#22_アポイント報告」から集計する(純関数)。
 * 対象は `SALES_NAMES`(固定リスト、経営者申告)。投稿者表示名との部分一致で担当を判定し、
 * 一致しない投稿者は「その他」に集約する。
 */
export function getSalesMonthlyStats(
  reports: SalesDailyReport[],
  appointments: AppointmentReport[],
  now: Date = new Date(),
  months = 6,
): SalesMonthlyStats[] {
  const snapshots: SalesMonthlyStats[] = [];

  for (let i = 0; i < months; i++) {
    const ref = new Date(now.getFullYear(), now.getMonth() - i, 15);
    const monthKey = monthKeyOf(ref);

    const rowsMap = new Map<string, RowAccumulator>();
    const ensureRow = (label: string, order: number): RowAccumulator => {
      let row = rowsMap.get(label);
      if (!row) {
        row = { member: label, order, calls: 0, meetings: 0, contracts: 0, routeCounts: new Map() };
        rowsMap.set(label, row);
      }
      return row;
    };

    for (const r of reports) {
      if (monthKeyOf(r.date) !== monthKey) continue;
      const name = findSalesNameByAuthor(r.authorName);
      const row = ensureRow(name ?? OTHER_LABEL, name ? SALES_NAMES.indexOf(name) : SALES_NAMES.length);
      row.calls += r.calls ?? 0;
      row.meetings += r.meetings ?? 0;
      row.contracts += r.contracts ?? 0;
    }

    for (const a of appointments) {
      if (monthKeyOf(a.date) !== monthKey) continue;
      const name = findSalesNameByAuthor(a.authorName);
      const row = ensureRow(name ?? OTHER_LABEL, name ? SALES_NAMES.indexOf(name) : SALES_NAMES.length);
      row.routeCounts.set(a.route, (row.routeCounts.get(a.route) ?? 0) + 1);
    }

    const rows: SalesMonthlyRow[] = [...rowsMap.values()]
      .map((row) => {
        const appointmentRoutes = [...row.routeCounts.entries()]
          .map(([route, count]) => ({ route, count }))
          .sort((a, b) => b.count - a.count);
        const appointmentsTotal = appointmentRoutes.reduce((sum, r) => sum + r.count, 0);
        return {
          order: row.order,
          row: {
            member: row.member,
            calls: row.calls,
            appointments: appointmentsTotal,
            appointmentRoutes,
            meetings: row.meetings,
            contracts: row.contracts,
          },
        };
      })
      // 全項目0の行は含めない。
      .filter(
        (w) => w.row.calls > 0 || w.row.appointments > 0 || w.row.meetings > 0 || w.row.contracts > 0,
      )
      .sort((a, b) => a.order - b.order)
      .map((w) => w.row);

    snapshots.push({ monthKey, rows });
  }

  return snapshots;
}
