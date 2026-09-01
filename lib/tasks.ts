import type { InValue } from "@libsql/client";
import { db } from "./db";
import { nowIso, today } from "./date";
import {
  canSeeExecutive,
  isOpen,
  type Role,
  type Status,
  type Task,
  type TaskUpdate,
  type User,
  type Visibility,
} from "./types";

/**
 * タスクの読み書き。
 *
 * 公開範囲の判定は必ずこのモジュールの SQL で行う。画面側でフィルタすると
 * 「役員のみのタスク」が API やキャッシュ経由で漏れる余地が残るため。
 */

const TASK_COLUMNS = `
  t.id, t.code, t.title, t.description, t.owner_id, t.due_date, t.status,
  t.visibility, t.meeting_title, t.meeting_date, t.created_by,
  t.created_at, t.updated_at, t.status_updated_at,
  COALESCE(u.name, '') AS owner_name,
  COALESCE(u.email, '') AS owner_email
`;

/** 役員限定タスクを含めるかどうかの WHERE 断片。 */
function visibilityClause(role: Role): string {
  return canSeeExecutive(role) ? "1=1" : "t.visibility = 'all'";
}

type TaskRow = Record<string, unknown>;

function toTask(row: TaskRow): Task {
  return {
    id: Number(row.id),
    code: String(row.code),
    title: String(row.title),
    description: String(row.description ?? ""),
    ownerId: (row.owner_id as string | null) ?? null,
    ownerName: String(row.owner_name ?? ""),
    ownerEmail: String(row.owner_email ?? ""),
    dueDate: (row.due_date as string | null) ?? null,
    status: row.status as Status,
    visibility: row.visibility as Visibility,
    meetingTitle: String(row.meeting_title ?? ""),
    meetingDate: (row.meeting_date as string | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    statusUpdatedAt: String(row.status_updated_at),
  };
}

export interface TaskFilters {
  ownerId?: string;
  status?: Status | "open" | "all";
  meeting?: string;
  keyword?: string;
  visibility?: Visibility;
}

export async function listTasks(
  viewer: Pick<User, "role">,
  filters: TaskFilters = {},
): Promise<Task[]> {
  const conditions = [visibilityClause(viewer.role)];
  const args: InValue[] = [];

  if (filters.ownerId) {
    conditions.push("t.owner_id = ?");
    args.push(filters.ownerId);
  }
  if (filters.status && filters.status !== "all") {
    if (filters.status === "open") {
      conditions.push("t.status IN ('not_started','in_progress','blocked')");
    } else {
      conditions.push("t.status = ?");
      args.push(filters.status);
    }
  }
  if (filters.meeting) {
    conditions.push("t.meeting_title = ?");
    args.push(filters.meeting);
  }
  if (filters.visibility) {
    conditions.push("t.visibility = ?");
    args.push(filters.visibility);
  }
  if (filters.keyword) {
    conditions.push("(t.title LIKE ? OR t.description LIKE ? OR t.meeting_title LIKE ?)");
    const like = `%${filters.keyword}%`;
    args.push(like, like, like);
  }

  const client = await db();
  const result = await client.execute({
    sql: `SELECT ${TASK_COLUMNS}
          FROM tasks t LEFT JOIN users u ON u.id = t.owner_id
          WHERE ${conditions.join(" AND ")}
          ORDER BY (t.due_date IS NULL), t.due_date, t.id`,
    args,
  });
  return result.rows.map((row) => toTask(row as TaskRow));
}

export async function getTask(
  viewer: Pick<User, "role">,
  code: string,
): Promise<Task | null> {
  const client = await db();
  const result = await client.execute({
    sql: `SELECT ${TASK_COLUMNS}
          FROM tasks t LEFT JOIN users u ON u.id = t.owner_id
          WHERE t.code = ? AND ${visibilityClause(viewer.role)} LIMIT 1`,
    args: [code],
  });
  const row = result.rows[0];
  return row ? toTask(row as TaskRow) : null;
}

export async function listTaskUpdates(taskId: number): Promise<TaskUpdate[]> {
  const client = await db();
  const result = await client.execute({
    sql: `SELECT tu.id, tu.task_id, tu.user_id, tu.body, tu.status_from,
                 tu.status_to, tu.created_at, COALESCE(u.name,'') AS user_name
          FROM task_updates tu LEFT JOIN users u ON u.id = tu.user_id
          WHERE tu.task_id = ? ORDER BY tu.created_at DESC, tu.id DESC`,
    args: [taskId],
  });
  return result.rows.map((row) => ({
    id: Number(row.id),
    taskId: Number(row.task_id),
    userId: (row.user_id as string | null) ?? null,
    userName: String(row.user_name ?? ""),
    body: String(row.body ?? ""),
    statusFrom: (row.status_from as Status | null) ?? null,
    statusTo: (row.status_to as Status | null) ?? null,
    createdAt: String(row.created_at),
  }));
}

export interface TaskInput {
  title: string;
  description?: string;
  ownerId?: string | null;
  dueDate?: string | null;
  status?: Status;
  visibility?: Visibility;
  meetingTitle?: string;
  meetingDate?: string | null;
}

/** T-0001 形式の連番を採番する。 */
async function nextCode(): Promise<string> {
  const client = await db();
  const result = await client.execute(
    `SELECT COALESCE(MAX(CAST(substr(code, 3) AS INTEGER)), 0) AS n FROM tasks`,
  );
  const n = Number(result.rows[0]?.n ?? 0);
  return `T-${String(n + 1).padStart(4, "0")}`;
}

export async function createTask(author: User, input: TaskInput): Promise<Task> {
  const title = input.title.trim();
  if (!title) throw new Error("タスク名を入力してください。");

  const visibility: Visibility = input.visibility ?? "all";
  if (visibility === "executive" && !canSeeExecutive(author.role)) {
    throw new Error("役員限定タスクを作成できるのは役員・管理者のみです。");
  }

  const stamp = nowIso();
  const code = await nextCode();
  const client = await db();
  await client.execute({
    sql: `INSERT INTO tasks
            (code, title, description, owner_id, due_date, status, visibility,
             meeting_title, meeting_date, created_by, created_at, updated_at, status_updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      code,
      title,
      input.description?.trim() ?? "",
      input.ownerId || null,
      input.dueDate || null,
      input.status ?? "not_started",
      visibility,
      input.meetingTitle?.trim() ?? "",
      input.meetingDate || null,
      author.id,
      stamp,
      stamp,
      stamp,
    ],
  });

  const created = await getTask(author, code);
  if (!created) throw new Error("タスクの作成に失敗しました。");
  return created;
}

/** 閲覧できないタスクへの書き込みを防ぐ。 */
async function assertEditable(viewer: User, code: string): Promise<Task> {
  const task = await getTask(viewer, code);
  if (!task) throw new Error("タスクが見つからないか、閲覧権限がありません。");
  return task;
}

export async function updateTask(
  viewer: User,
  code: string,
  patch: Partial<TaskInput>,
): Promise<void> {
  const task = await assertEditable(viewer, code);

  if (patch.visibility === "executive" && !canSeeExecutive(viewer.role)) {
    throw new Error("役員限定への変更は役員・管理者のみ行えます。");
  }

  const sets: string[] = [];
  const args: InValue[] = [];
  const assign = (column: string, value: InValue) => {
    sets.push(`${column} = ?`);
    args.push(value);
  };

  if (patch.title !== undefined) assign("title", patch.title.trim());
  if (patch.description !== undefined) assign("description", patch.description.trim());
  if (patch.ownerId !== undefined) assign("owner_id", patch.ownerId || null);
  if (patch.dueDate !== undefined) assign("due_date", patch.dueDate || null);
  if (patch.visibility !== undefined) assign("visibility", patch.visibility);
  if (patch.meetingTitle !== undefined) assign("meeting_title", patch.meetingTitle.trim());
  if (patch.meetingDate !== undefined) assign("meeting_date", patch.meetingDate || null);

  const stamp = nowIso();
  if (patch.status !== undefined && patch.status !== task.status) {
    assign("status", patch.status);
    // 状況が動いた日を別に持ち、「報告が止まっているタスク」を検出できるようにする。
    assign("status_updated_at", stamp);
  }
  if (sets.length === 0) return;

  assign("updated_at", stamp);
  args.push(task.id);

  const client = await db();
  await client.execute({
    sql: `UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`,
    args,
  });

  if (patch.status !== undefined && patch.status !== task.status) {
    await client.execute({
      sql: `INSERT INTO task_updates (task_id, user_id, body, status_from, status_to, created_at)
            VALUES (?,?,?,?,?,?)`,
      args: [task.id, viewer.id, "", task.status, patch.status, stamp],
    });
  }
}

/** 進捗コメント（＋任意のステータス変更）を追加する。 */
export async function addProgressUpdate(
  viewer: User,
  code: string,
  body: string,
  statusTo?: Status,
): Promise<void> {
  const task = await assertEditable(viewer, code);
  const text = body.trim();
  const statusChanged = Boolean(statusTo && statusTo !== task.status);
  if (!text && !statusChanged) {
    throw new Error("進捗コメントかステータスのどちらかを入力してください。");
  }

  const stamp = nowIso();
  const client = await db();
  await client.execute({
    sql: `INSERT INTO task_updates (task_id, user_id, body, status_from, status_to, created_at)
          VALUES (?,?,?,?,?,?)`,
    args: [
      task.id,
      viewer.id,
      text,
      statusChanged ? task.status : null,
      statusChanged ? statusTo! : null,
      stamp,
    ],
  });

  // 進捗が報告された時点で「状況は最新」とみなす。
  await client.execute({
    sql: `UPDATE tasks SET status = ?, status_updated_at = ?, updated_at = ? WHERE id = ?`,
    args: [statusChanged ? statusTo! : task.status, stamp, stamp, task.id],
  });
}

export async function deleteTask(viewer: User, code: string): Promise<void> {
  if (viewer.role !== "admin") {
    throw new Error("タスクの削除は管理者のみ行えます。");
  }
  const task = await assertEditable(viewer, code);
  const client = await db();
  await client.execute({ sql: `DELETE FROM task_updates WHERE task_id = ?`, args: [task.id] });
  await client.execute({ sql: `DELETE FROM tasks WHERE id = ?`, args: [task.id] });
}

export async function listUsers(includeInactive = false): Promise<User[]> {
  const client = await db();
  const result = await client.execute(
    `SELECT id, name, email, role, department, active FROM users
     ${includeInactive ? "" : "WHERE active = 1"}
     ORDER BY department, name`,
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    role: row.role as Role,
    department: String(row.department ?? ""),
    active: Boolean(row.active),
  }));
}

/** 会議名の一覧（重複なし・新しい順）。 */
export async function listMeetings(viewer: Pick<User, "role">): Promise<
  { title: string; date: string | null; total: number; open: number }[]
> {
  const tasks = await listTasks(viewer);
  const map = new Map<string, { title: string; date: string | null; total: number; open: number }>();
  for (const task of tasks) {
    if (!task.meetingTitle) continue;
    const key = `${task.meetingTitle}__${task.meetingDate ?? ""}`;
    const entry = map.get(key) ?? {
      title: task.meetingTitle,
      date: task.meetingDate,
      total: 0,
      open: 0,
    };
    entry.total += 1;
    if (isOpen(task.status)) entry.open += 1;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

/** ダッシュボード上部の指標。 */
export interface Metrics {
  open: number;
  overdue: number;
  dueThisWeek: number;
  stale: number;
  doneThisMonth: number;
  total: number;
}

export function computeMetrics(tasks: Task[], staleDays: number, base = today()): Metrics {
  const openTasks = tasks.filter((t) => isOpen(t.status));
  const weekEnd = new Date(`${base}T12:00:00Z`);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const weekEndYmd = weekEnd.toISOString().slice(0, 10);
  const monthPrefix = base.slice(0, 7);

  return {
    open: openTasks.length,
    overdue: openTasks.filter((t) => t.dueDate !== null && t.dueDate < base).length,
    dueThisWeek: openTasks.filter(
      (t) => t.dueDate !== null && t.dueDate >= base && t.dueDate <= weekEndYmd,
    ).length,
    stale: openTasks.filter((t) => {
      const reported = t.statusUpdatedAt.slice(0, 10);
      const diff = Math.round(
        (new Date(`${base}T12:00:00Z`).getTime() - new Date(`${reported}T12:00:00Z`).getTime()) /
          86_400_000,
      );
      return diff >= staleDays;
    }).length,
    doneThisMonth: tasks.filter(
      (t) => t.status === "done" && t.statusUpdatedAt.slice(0, 7) === monthPrefix,
    ).length,
    total: tasks.length,
  };
}
