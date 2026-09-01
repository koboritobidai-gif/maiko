/**
 * 初期データを投入する。
 *
 *   npm run seed          # 社員アカウントを作成し、minutes/ の議事録を取り込む
 *   npm run seed -- --force   # いったん消してから作り直す
 *
 * メールアドレスと役割は仮置きです。実運用の前に「社員・通知設定」画面で
 * 実際のアドレスへ変更してください（リマインドメールの宛先になります）。
 */

import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "../lib/db.ts";
import { importMinutes } from "../lib/importer.ts";
import { hashPassword } from "../lib/password.ts";
import { listUsers } from "../lib/tasks.ts";

const DOMAIN = "faith.example.co.jp";
const MINUTES_DIR = "minutes";

/**
 * 議事録に名前が出てくるメンバー。
 * 氏名は議事録の表記（姓）に合わせてある。担当者の突き合わせにこの表記を使うため、
 * フルネームに変える場合も姓はそのまま残してください。
 */
const members = [
  { key: "nagano", name: "長野種雅", dept: "経営", role: "admin" },
  { key: "takahashi", name: "髙橋", dept: "人事部", role: "executive" },
  { key: "kamiyama", name: "神山", dept: "営業", role: "member" },
  { key: "morimoto", name: "森本", dept: "営業", role: "member" },
  { key: "chikayasu", name: "近安", dept: "営業", role: "member" },
  { key: "kawamura", name: "川村", dept: "システム", role: "member" },
  { key: "tomoi", name: "友井", dept: "業務・物流", role: "member" },
  { key: "monji", name: "文字", dept: "九州支社", role: "member" },
  { key: "sugai", name: "菅井", dept: "販促", role: "member" },
] as const;

/** ファイル名「2026-09-01-経営戦略会議.md」から開催日とタイトルを読む。 */
function fromFilename(fileName: string): { date: string | null; title: string } {
  const name = fileName.replace(/\.(md|txt|markdown)$/i, "");
  const m = name.match(/^(\d{4}-\d{2}-\d{2})[-_ ](.+)$/);
  return m ? { date: m[1], title: m[2] } : { date: null, title: name };
}

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const client = await db();

  const existing = await client.execute(`SELECT COUNT(*) AS n FROM users`);
  if (Number(existing.rows[0]?.n ?? 0) > 0 && !force) {
    console.log("既にデータが登録されています。作り直す場合は npm run seed -- --force を実行してください。");
    return;
  }
  if (force) {
    for (const table of ["task_updates", "reminder_log", "sessions", "tasks", "minutes", "users"]) {
      await client.execute(`DELETE FROM ${table}`);
    }
  }

  const password = process.env.SEED_ADMIN_PASSWORD || "faith-demo-2026";
  for (const member of members) {
    await client.execute({
      sql: `INSERT INTO users (id, name, email, role, department, password_hash, active, created_at)
            VALUES (?,?,?,?,?,?,1,?)`,
      args: [
        randomUUID(),
        member.name,
        `${member.key}@${DOMAIN}`,
        member.role,
        member.dept,
        hashPassword(password),
        new Date().toISOString(),
      ],
    });
  }

  console.log("社員アカウントを作成しました。\n");
  for (const member of members) {
    const label = { admin: "管理者", executive: "役員", member: "社員" }[member.role];
    console.log(`  ${member.name}（${label}／${member.dept}）  ${member.key}@${DOMAIN}  /  ${password}`);
  }

  // minutes/ に置いた議事録を取り込む。
  const users = await listUsers();
  let files: string[] = [];
  try {
    files = readdirSync(MINUTES_DIR).filter((f) => /\.(md|txt|markdown)$/i.test(f)).sort();
  } catch {
    files = [];
  }

  for (const file of files) {
    const path = join(MINUTES_DIR, file);
    const body = readFileSync(path, "utf8");
    const guessed = fromFilename(file);
    const heading = body.match(/^\s*#\s+(.+)$/m);

    const result = await importMinutes(
      {
        source: "manual",
        externalId: `file:${file}`,
        title: heading?.[1].trim() ?? guessed.title,
        meetingDate: guessed.date,
        url: "",
        author: "",
        body,
        visibility: "all",
      },
      { users },
    );

    console.log(`\n■ ${result.minutesTitle}（${path}）  タスク ${result.created.length}件`);
    for (const task of result.created) {
      console.log(`  ${task.code}  ${task.title}`);
      console.log(`        担当: ${task.ownerName} / 期限: ${task.dueDate ?? "未設定"}`);
    }
  }

  if (!files.length) {
    console.log(`\n${MINUTES_DIR}/ に議事録ファイルが見つかりませんでした。`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
