/**
 * デモ用の初期データを投入する。
 *
 *   npm run seed
 *
 * 既にデータがある場合は上書きせず終了する（--force で作り直し）。
 * 期限は実行日を基準に前後させるので、いつ実行しても
 * 「期限超過」「今週が期限」「状況未報告」が一通り揃った状態になる。
 */

import { randomUUID } from "node:crypto";
import { db } from "../lib/db.ts";
import { hashPassword } from "../lib/password.ts";

const DOMAIN = "faith.example.co.jp";

function ymd(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function iso(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString();
}

const members = [
  { key: "nagano", name: "長野種雅", dept: "経営企画", role: "admin" },
  { key: "kobori", name: "小堀 太一", dept: "取締役", role: "executive" },
  { key: "tanaka", name: "田中 美咲", dept: "商品開発部", role: "member" },
  { key: "sato", name: "佐藤 由紀", dept: "営業部", role: "member" },
  { key: "suzuki", name: "鈴木 健一", dept: "マーケティング部", role: "member" },
  { key: "nakamura", name: "中村 彩", dept: "サロン運営部", role: "member" },
] as const;

type MemberKey = (typeof members)[number]["key"];

interface SeedTask {
  title: string;
  owner: MemberKey | null;
  due: number | null;
  status: "not_started" | "in_progress" | "blocked" | "done" | "cancelled";
  visibility: "all" | "executive";
  meeting: string;
  meetingDate: number;
  description?: string;
  /** 最終報告からの経過日数。「状況未報告」を再現するために使う。 */
  reportedDaysAgo: number;
  updates?: { by: MemberKey; body: string; daysAgo: number }[];
}

const tasks: SeedTask[] = [
  {
    title: "新美容液の販促スケジュール案を作成",
    owner: "suzuki",
    due: -4,
    status: "in_progress",
    visibility: "all",
    meeting: "販促企画MTG",
    meetingDate: -12,
    description: "10月発売の新美容液について、SNS・サロン店頭・DMの三本立てで販促案をまとめる。",
    reportedDaysAgo: 3,
    updates: [
      { by: "suzuki", body: "SNS施策の骨子まで完成。店頭POPのデザイン待ちで止まっています。", daysAgo: 3 },
    ],
  },
  {
    title: "サロン向け新商品説明会の日程確定",
    owner: "nakamura",
    due: -1,
    status: "not_started",
    visibility: "all",
    meeting: "全体定例MTG",
    meetingDate: -7,
    description: "全国4会場での説明会日程を確定し、サロンへ案内する。",
    reportedDaysAgo: 7,
  },
  {
    title: "秋冬向けスキンケアラインの処方最終確認",
    owner: "tanaka",
    due: 1,
    status: "in_progress",
    visibility: "all",
    meeting: "商品開発会議",
    meetingDate: -14,
    description: "研究所からの最終処方を確認し、安定性試験の結果とあわせて承認する。",
    reportedDaysAgo: 1,
    updates: [
      { by: "tanaka", body: "安定性試験の結果を受領。明日中に確認を終えます。", daysAgo: 1 },
      { by: "tanaka", body: "研究所へ最終処方を依頼しました。", daysAgo: 9 },
    ],
  },
  {
    title: "大阪本社ショールームの改装見積もりを3社から取得",
    owner: "sato",
    due: 3,
    status: "blocked",
    visibility: "all",
    meeting: "全体定例MTG",
    meetingDate: -7,
    description: "内装業者3社から見積もりを取り、比較表を作成する。",
    reportedDaysAgo: 2,
    updates: [
      { by: "sato", body: "2社から見積もり受領。1社が来週まで回答できないとのことで待ちです。", daysAgo: 2 },
    ],
  },
  {
    title: "既存顧客へのリピート促進DMの原稿作成",
    owner: "suzuki",
    due: 6,
    status: "not_started",
    visibility: "all",
    meeting: "販促企画MTG",
    meetingDate: -12,
    reportedDaysAgo: 12,
  },
  {
    title: "エステティシャン研修プログラムの改訂案をまとめる",
    owner: "nakamura",
    due: 20,
    status: "in_progress",
    visibility: "all",
    meeting: "全体定例MTG",
    meetingDate: -28,
    description: "新商品に対応した施術手順を研修カリキュラムに反映する。",
    reportedDaysAgo: 15,
  },
  {
    title: "OEM先の品質監査レポートを共有",
    owner: "tanaka",
    due: -9,
    status: "done",
    visibility: "all",
    meeting: "商品開発会議",
    meetingDate: -14,
    reportedDaysAgo: 8,
    updates: [{ by: "tanaka", body: "監査レポートを全部署へ共有しました。", daysAgo: 8 }],
  },
  {
    title: "ECサイトの定期購入プラン改定を検討",
    owner: null,
    due: 10,
    status: "not_started",
    visibility: "all",
    meeting: "販促企画MTG",
    meetingDate: -12,
    description: "担当をどの部署が持つかMTGで決めきれなかったため保留。",
    reportedDaysAgo: 12,
  },
  {
    title: "来期の役員報酬案の作成",
    owner: "kobori",
    due: 2,
    status: "in_progress",
    visibility: "executive",
    meeting: "役員会",
    meetingDate: -5,
    description: "来期予算案とあわせて役員会に提出する。",
    reportedDaysAgo: 2,
    updates: [{ by: "kobori", body: "顧問税理士と一次案を確認済み。", daysAgo: 2 }],
  },
  {
    title: "サロン事業の再編案を精査",
    owner: "nagano",
    due: 9,
    status: "not_started",
    visibility: "executive",
    meeting: "役員会",
    meetingDate: -5,
    description: "不採算店舗の扱いを含めた再編案。公開前の検討段階。",
    reportedDaysAgo: 5,
  },
];

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const client = await db();

  const existing = await client.execute(`SELECT COUNT(*) AS n FROM users`);
  if (Number(existing.rows[0]?.n ?? 0) > 0 && !force) {
    console.log("既にデータが登録されています。作り直す場合は npm run seed -- --force を実行してください。");
    return;
  }
  if (force) {
    for (const table of ["task_updates", "reminder_log", "sessions", "tasks", "users"]) {
      await client.execute(`DELETE FROM ${table}`);
    }
  }

  const password = process.env.SEED_ADMIN_PASSWORD || "faith-demo-2026";
  const ids = new Map<string, string>();

  for (const member of members) {
    const id = randomUUID();
    ids.set(member.key, id);
    await client.execute({
      sql: `INSERT INTO users (id, name, email, role, department, password_hash, active, created_at)
            VALUES (?,?,?,?,?,?,1,?)`,
      args: [
        id,
        member.name,
        `${member.key}@${DOMAIN}`,
        member.role,
        member.dept,
        hashPassword(password),
        iso(-60),
      ],
    });
  }

  let counter = 0;
  for (const task of tasks) {
    counter += 1;
    const code = `T-${String(counter).padStart(4, "0")}`;
    const result = await client.execute({
      sql: `INSERT INTO tasks
              (code, title, description, owner_id, due_date, status, visibility,
               meeting_title, meeting_date, created_by, created_at, updated_at, status_updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        code,
        task.title,
        task.description ?? "",
        task.owner ? ids.get(task.owner)! : null,
        task.due === null ? null : ymd(task.due),
        task.status,
        task.visibility,
        task.meeting,
        ymd(task.meetingDate),
        ids.get("nagano")!,
        iso(task.meetingDate),
        iso(-task.reportedDaysAgo),
        iso(-task.reportedDaysAgo),
      ],
    });
    const taskId = Number(result.lastInsertRowid);

    for (const update of task.updates ?? []) {
      await client.execute({
        sql: `INSERT INTO task_updates (task_id, user_id, body, status_from, status_to, created_at)
              VALUES (?,?,?,?,?,?)`,
        args: [taskId, ids.get(update.by)!, update.body, null, null, iso(-update.daysAgo)],
      });
    }
  }

  console.log("初期データを投入しました。以下のアカウントでログインできます。\n");
  for (const member of members) {
    const label = { admin: "管理者", executive: "役員", member: "社員" }[member.role];
    console.log(`  ${member.name}（${label}）  ${member.key}@${DOMAIN}  /  ${password}`);
  }
  console.log("\n※ 役員限定タスクは 山本・小堀 のアカウントでのみ表示されます。");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
