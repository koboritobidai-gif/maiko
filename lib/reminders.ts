import { db } from "./db.ts";
import { daysBetween, formatLong, isoToYmd, today } from "./date.ts";
import { sendMail, isDryRun } from "./mail.ts";
import { listTasks, listUsers } from "./tasks.ts";
import { STATUS_LABELS, isOpen, canSeeExecutive, type Task, type User } from "./types.ts";

/**
 * 期限が近づいたタスクのメール通知。
 *
 * どのタスクに何を送るかの判定（plan）と、実際の送信（sendReminders）を分けてある。
 * 判定だけを画面でプレビューできるようにするため。
 */

export type ReminderKind = "overdue" | "due_today" | "due_soon" | "stale";

export const KIND_LABELS: Record<ReminderKind, string> = {
  overdue: "期限超過",
  due_today: "本日が期限",
  due_soon: "期限が近い",
  stale: "状況が未報告",
};

const KIND_ORDER: ReminderKind[] = ["overdue", "due_today", "due_soon", "stale"];

/** 同じ種類の通知を再送するまでの最短間隔（日）。 */
const RESEND_INTERVAL: Record<ReminderKind, number> = {
  overdue: 1,
  due_today: 1,
  due_soon: 2,
  stale: 7,
};

export function dueSoonDays(): number {
  return Number(process.env.REMIND_DUE_SOON_DAYS ?? 3);
}

export function staleDays(): number {
  return Number(process.env.REMIND_STALE_DAYS ?? 7);
}

/** 1 タスクに必要な通知の種類。不要なら null。優先度が高いもの 1 つだけ返す。 */
export function classify(task: Task, base = today()): ReminderKind | null {
  if (!isOpen(task.status)) return null;

  if (task.dueDate) {
    const left = daysBetween(base, task.dueDate);
    if (left < 0) return "overdue";
    if (left === 0) return "due_today";
    if (left <= dueSoonDays()) return "due_soon";
  }
  // 期限に余裕があっても、長く報告が無いタスクは状況を聞く。
  // 「MTGで決めたが、その後どうなっているかわからない」を拾うための判定。
  const idle = daysBetween(isoToYmd(task.statusUpdatedAt), base);
  if (idle >= staleDays()) return "stale";
  return null;
}

export interface ReminderItem {
  task: Task;
  kind: ReminderKind;
}

export interface OwnerReminder {
  owner: User;
  items: ReminderItem[];
}

/** 通知対象を担当者ごとにまとめる。1人1通にして通数を抑える。 */
export async function planReminders(base = today()): Promise<OwnerReminder[]> {
  // 通知の判定は全タスクを対象に行う必要があるため、役員相当の視点で読み出す。
  // 送信先は各タスクの担当者本人に限定するので、これで公開範囲は破れない。
  const tasks = await listTasks({ role: "admin" });
  const users = await listUsers();
  const byId = new Map(users.map((u) => [u.id, u]));

  const grouped = new Map<string, OwnerReminder>();
  for (const task of tasks) {
    const kind = classify(task, base);
    if (!kind || !task.ownerId) continue;
    const owner = byId.get(task.ownerId);
    if (!owner || !owner.email) continue;
    // 役員限定タスクが役員以外の担当になっている場合、本文に載せない。
    if (task.visibility === "executive" && !canSeeExecutive(owner.role)) continue;

    const entry = grouped.get(owner.id) ?? { owner, items: [] };
    entry.items.push({ task, kind });
    grouped.set(owner.id, entry);
  }

  for (const entry of grouped.values()) {
    entry.items.sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        (a.task.dueDate ?? "9999").localeCompare(b.task.dueDate ?? "9999"),
    );
  }
  return [...grouped.values()].sort((a, b) => a.owner.name.localeCompare(b.owner.name));
}

/** 直近に同じ通知を送っていないか。 */
async function shouldSend(taskId: number, kind: ReminderKind, base: string): Promise<boolean> {
  const client = await db();
  const result = await client.execute({
    sql: `SELECT MAX(sent_on) AS last FROM reminder_log WHERE task_id = ? AND kind = ?`,
    args: [taskId, kind],
  });
  const last = result.rows[0]?.last as string | null;
  if (!last) return true;
  return daysBetween(last, base) >= RESEND_INTERVAL[kind];
}

function taskBlock(task: Task, base: string): string {
  const lines = [`  #${task.code} ${task.title}`];
  const due = task.dueDate
    ? (() => {
        const left = daysBetween(base, task.dueDate!);
        const suffix = left < 0 ? `${Math.abs(left)}日超過` : left === 0 ? "本日" : `あと${left}日`;
        return `期限: ${formatLong(task.dueDate)}（${suffix}）`;
      })()
    : "期限: 未設定";
  const reported = isoToYmd(task.statusUpdatedAt);
  lines.push(
    `    ${due} / 状況: ${STATUS_LABELS[task.status]} / 最終更新: ${formatLong(reported)}（${daysBetween(reported, base)}日前）`,
  );
  if (task.meetingTitle) {
    const when = task.meetingDate ? `（${formatLong(task.meetingDate)}）` : "";
    lines.push(`    決定したMTG: ${task.meetingTitle}${when}`);
  }
  return lines.join("\n");
}

export function renderOwnerMail(
  entry: OwnerReminder,
  base = today(),
): { subject: string; text: string } {
  const counts = KIND_ORDER.map((kind) => {
    const n = entry.items.filter((i) => i.kind === kind).length;
    return n ? `${KIND_LABELS[kind]}${n}件` : "";
  }).filter(Boolean);

  const subject = `【タスク確認】${entry.owner.name} さん / ${counts.join("・")}`;
  const appUrl = process.env.APP_URL ?? "";

  const body: string[] = [
    `${entry.owner.name} さん`,
    "",
    "お疲れさまです。MTGで決まったタスクのうち、対応・状況共有をお願いしたいものです。",
    "",
  ];
  for (const kind of KIND_ORDER) {
    const items = entry.items.filter((i) => i.kind === kind);
    if (!items.length) continue;
    body.push(`■ ${KIND_LABELS[kind]}（${items.length}件）`);
    for (const item of items) body.push(taskBlock(item.task, base), "");
  }
  if (appUrl) {
    body.push("進捗の更新はこちらから:", `${appUrl}/tasks`, "");
  }
  body.push("※このメールはタスク管理アプリから自動送信しています。");
  return { subject, text: body.join("\n").trimEnd() + "\n" };
}

export interface SendResult {
  sent: number;
  skipped: number;
  dryRun: boolean;
  recipients: string[];
}

/** 通知を送り、送信履歴を記録する。 */
export async function sendReminders(base = today()): Promise<SendResult> {
  const plans = await planReminders(base);
  const client = await db();
  const result: SendResult = { sent: 0, skipped: 0, dryRun: isDryRun(), recipients: [] };

  for (const entry of plans) {
    const fresh: ReminderItem[] = [];
    for (const item of entry.items) {
      if (await shouldSend(item.task.id, item.kind, base)) fresh.push(item);
      else result.skipped += 1;
    }
    if (!fresh.length) continue;

    const mail = renderOwnerMail({ owner: entry.owner, items: fresh }, base);
    await sendMail({ to: entry.owner.email, subject: mail.subject, text: mail.text });

    for (const item of fresh) {
      await client.execute({
        sql: `INSERT INTO reminder_log (task_id, kind, sent_on, to_email) VALUES (?,?,?,?)`,
        args: [item.task.id, item.kind, base, entry.owner.email],
      });
    }
    result.sent += 1;
    result.recipients.push(entry.owner.email);
  }
  return result;
}

export interface ReminderLogEntry {
  taskCode: string;
  taskTitle: string;
  kind: ReminderKind;
  sentOn: string;
  toEmail: string;
}

/** 管理画面に出す送信履歴。 */
export async function recentReminderLog(limit = 40): Promise<ReminderLogEntry[]> {
  const client = await db();
  const result = await client.execute({
    sql: `SELECT r.kind, r.sent_on, r.to_email, t.code, t.title
          FROM reminder_log r JOIN tasks t ON t.id = r.task_id
          ORDER BY r.sent_on DESC, r.id DESC LIMIT ?`,
    args: [limit],
  });
  return result.rows.map((row) => ({
    taskCode: String(row.code),
    taskTitle: String(row.title),
    kind: row.kind as ReminderKind,
    sentOn: String(row.sent_on),
    toEmail: String(row.to_email),
  }));
}
