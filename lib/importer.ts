import { db } from "./db.ts";
import { nowIso, today } from "./date.ts";
import { extractTasks, type ExtractedTask } from "./extract.ts";
import { configuredSources, findSource, SOURCE_LABELS, type MinutesDoc, type SourceName } from "./sources/index.ts";
import { insertTask, listUsers } from "./tasks.ts";
import { canSeeExecutive, type Role, type User } from "./types.ts";

/**
 * 議事録の取り込み。
 *
 *   取得（コネクタ）→ 議事録として保存 → タスクを抽出 → 未登録のものだけ作成
 *
 * 同じ議事録を何度取り込んでも、すでに作ったタスクは増えない。
 * 議事録が更新された場合は、増えた分だけがタスクになる。
 */

/** 担当者の表記をアプリの利用者に突き合わせる。 */
export function matchOwner(hint: string | null, users: User[]): User | null {
  if (!hint) return null;
  const normalized = hint.replace(/\s|　/g, "").toLowerCase();
  if (!normalized) return null;

  const compact = (value: string) => value.replace(/\s|　/g, "").toLowerCase();

  // 氏名の完全一致 → メールアドレスのローカル部 → 姓または名だけの一致、の順で探す。
  return (
    users.find((u) => compact(u.name) === normalized) ??
    users.find((u) => u.email.split("@")[0].toLowerCase() === normalized) ??
    users.find((u) => u.name.split(/\s|　/).some((part) => compact(part) === normalized)) ??
    users.find((u) => compact(u.name).startsWith(normalized) && normalized.length >= 2) ??
    null
  );
}

export interface MinutesRecord {
  id: number;
  source: SourceName;
  externalId: string;
  title: string;
  meetingDate: string | null;
  url: string;
  author: string;
  body: string;
  visibility: "all" | "executive";
  importedAt: string;
  taskCount: number;
}

/** 議事録を保存する。すでにある場合は本文を更新して同じ ID を返す。 */
async function saveMinutes(doc: MinutesDoc, importedBy: string | null): Promise<number> {
  const client = await db();
  const existing = await client.execute({
    sql: `SELECT id FROM minutes WHERE source = ? AND external_id = ? LIMIT 1`,
    args: [doc.source, doc.externalId],
  });

  if (existing.rows.length) {
    const id = Number(existing.rows[0].id);
    await client.execute({
      sql: `UPDATE minutes SET title = ?, meeting_date = ?, url = ?, author = ?, body = ?, visibility = ? WHERE id = ?`,
      args: [doc.title, doc.meetingDate, doc.url, doc.author, doc.body, doc.visibility, id],
    });
    return id;
  }

  const inserted = await client.execute({
    sql: `INSERT INTO minutes
            (source, external_id, title, meeting_date, url, author, body, visibility, imported_at, imported_by, task_count)
          VALUES (?,?,?,?,?,?,?,?,?,?,0)`,
    args: [
      doc.source,
      doc.externalId,
      doc.title,
      doc.meetingDate,
      doc.url,
      doc.author,
      doc.body,
      doc.visibility,
      nowIso(),
      importedBy,
    ],
  });
  return Number(inserted.lastInsertRowid);
}

/** その議事録から既に作ったタスクのタイトル（重複作成を防ぐため）。 */
async function existingTitles(minutesId: number): Promise<Set<string>> {
  const client = await db();
  const result = await client.execute({
    sql: `SELECT title FROM tasks WHERE minutes_id = ?`,
    args: [minutesId],
  });
  return new Set(result.rows.map((row) => String(row.title).replace(/\s|　/g, "")));
}

export interface ImportedTask {
  code: string;
  title: string;
  ownerName: string;
  dueDate: string | null;
  confidence: ExtractedTask["confidence"];
}

export interface ImportResult {
  minutesId: number;
  minutesTitle: string;
  created: ImportedTask[];
  /** すでに登録済みで、今回は作らなかった件数 */
  skipped: number;
}

/** 議事録 1 件を取り込み、抽出したタスクのうち未登録のものを作成する。 */
export async function importMinutes(
  doc: MinutesDoc,
  options: { importedBy?: string | null; users?: User[] } = {},
): Promise<ImportResult> {
  const users = options.users ?? (await listUsers());
  const minutesId = await saveMinutes(doc, options.importedBy ?? null);
  const already = await existingTitles(minutesId);

  const extracted = extractTasks(doc.body, { meetingDate: doc.meetingDate });
  const created: ImportedTask[] = [];
  let skipped = 0;

  for (const item of extracted) {
    if (already.has(item.title.replace(/\s|　/g, ""))) {
      skipped += 1;
      continue;
    }
    const owner = matchOwner(item.ownerHint, users);
    const code = await insertTask(
      {
        title: item.title,
        description: describe(item, doc),
        ownerId: owner?.id ?? null,
        dueDate: item.dueDate,
        status: "not_started",
        visibility: doc.visibility,
        meetingTitle: doc.title,
        meetingDate: doc.meetingDate,
      },
      { minutesId, sourceLine: item.raw, createdBy: options.importedBy ?? null },
    );
    created.push({
      code,
      title: item.title,
      ownerName: owner?.name ?? (item.ownerHint ? `${item.ownerHint}（未登録）` : "未定"),
      dueDate: item.dueDate,
      confidence: item.confidence,
    });
    already.add(item.title.replace(/\s|　/g, ""));
  }

  const client = await db();
  await client.execute({
    sql: `UPDATE minutes SET task_count = (SELECT COUNT(*) FROM tasks WHERE minutes_id = ?) WHERE id = ?`,
    args: [minutesId, minutesId],
  });

  return { minutesId, minutesTitle: doc.title, created, skipped };
}

/** タスクの説明欄に、根拠となった議事録の行と出典を残す。 */
function describe(item: ExtractedTask, doc: MinutesDoc): string {
  const lines: string[] = [];
  if (item.detail) lines.push(item.detail, "");
  if (item.participants.length) lines.push(`関係者: ${item.participants.join("、")}`);
  if (item.ownerHint) lines.push(`議事録の担当表記: ${item.ownerHint}`);
  if (item.dueHint && item.dueHint !== item.dueDate) lines.push(`議事録の期限表記: ${item.dueHint}`);
  lines.push(`出典: ${SOURCE_LABELS[doc.source]}「${doc.title}」${doc.url ? ` ${doc.url}` : ""}`);
  if (!item.detail) lines.push(`議事録の記載: ${item.raw.split("\n")[0]}`);
  return lines.join("\n");
}

export interface SyncResult {
  source: SourceName;
  label: string;
  documents: number;
  createdTasks: number;
  skipped: number;
  error: string | null;
}

/** コネクタ 1 つぶんを取り込む。 */
export async function syncSource(
  name: SourceName,
  options: { days?: number; importedBy?: string | null } = {},
): Promise<SyncResult> {
  const source = findSource(name);
  const label = SOURCE_LABELS[name];
  if (!source) return { source: name, label, documents: 0, createdTasks: 0, skipped: 0, error: "不明な取得元です。" };
  if (!source.configured()) {
    return {
      source: name,
      label,
      documents: 0,
      createdTasks: 0,
      skipped: 0,
      error: `設定が不足しています（${source.requirement}）。`,
    };
  }

  const days = options.days ?? Number(process.env.MINUTES_LOOKBACK_DAYS ?? 14);
  try {
    const docs = await source.fetchRecent(days);
    const users = await listUsers();
    let createdTasks = 0;
    let skipped = 0;
    for (const doc of docs) {
      const result = await importMinutes(doc, { importedBy: options.importedBy ?? null, users });
      createdTasks += result.created.length;
      skipped += result.skipped;
    }
    return { source: name, label, documents: docs.length, createdTasks, skipped, error: null };
  } catch (error) {
    // 1 つのコネクタが落ちても、他の取得元の取り込みは続けたい。
    return {
      source: name,
      label,
      documents: 0,
      createdTasks: 0,
      skipped: 0,
      error: error instanceof Error ? error.message : "取り込みに失敗しました。",
    };
  }
}

/** 設定済みのコネクタをすべて巡回する（定期実行から呼ぶ）。 */
export async function syncAllSources(options: { days?: number } = {}): Promise<SyncResult[]> {
  const sources = configuredSources();
  const results: SyncResult[] = [];
  for (const source of sources) {
    results.push(await syncSource(source.name, options));
  }
  return results;
}

/** 手動で貼り付けた議事録を取り込む。 */
export async function importPastedMinutes(
  user: User,
  input: { title: string; body: string; meetingDate?: string | null; visibility?: "all" | "executive" },
): Promise<ImportResult> {
  const title = input.title.trim() || "貼り付けた議事録";
  const visibility = input.visibility === "executive" && canSeeExecutive(user.role) ? "executive" : "all";
  return importMinutes(
    {
      source: "manual",
      // 同じ内容を二度貼っても議事録が重複しないよう、内容から識別子を作る。
      externalId: `manual:${hash(`${title}\n${input.body}`)}`,
      title,
      meetingDate: input.meetingDate || today(),
      url: "",
      author: user.name,
      body: input.body,
      visibility,
    },
    { importedBy: user.id },
  );
}

function hash(text: string): string {
  let value = 0;
  for (let i = 0; i < text.length; i += 1) {
    value = (value * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(value).toString(36);
}

export interface ReviewedRow {
  title: string;
  ownerId: string | null;
  dueDate: string | null;
  raw: string;
}

/**
 * 画面で確認・修正したうえで取り込む。
 * 抽出の精度には限界があるので、貼り付け取り込みでは必ずこの経路を通す。
 */
export async function importReviewedMinutes(
  user: User,
  input: { title: string; body: string; meetingDate?: string | null; visibility?: "all" | "executive" },
  rows: ReviewedRow[],
): Promise<ImportResult> {
  const title = input.title.trim() || "貼り付けた議事録";
  const visibility = input.visibility === "executive" && canSeeExecutive(user.role) ? "executive" : "all";
  const meetingDate = input.meetingDate || today();

  const doc: MinutesDoc = {
    source: "manual",
    externalId: `manual:${hash(`${title}\n${input.body}`)}`,
    title,
    meetingDate,
    url: "",
    author: user.name,
    body: input.body,
    visibility,
  };

  const minutesId = await saveMinutes(doc, user.id);
  const already = await existingTitles(minutesId);
  const users = await listUsers();
  const created: ImportedTask[] = [];
  let skipped = 0;

  for (const row of rows) {
    const rowTitle = row.title.trim();
    if (!rowTitle) continue;
    if (already.has(rowTitle.replace(/\s|　/g, ""))) {
      skipped += 1;
      continue;
    }
    const owner = users.find((u) => u.id === row.ownerId) ?? null;
    const code = await insertTask(
      {
        title: rowTitle,
        description: `議事録より作成: ${row.raw}\n出典: ${SOURCE_LABELS.manual}「${title}」`,
        ownerId: owner?.id ?? null,
        dueDate: row.dueDate,
        status: "not_started",
        visibility,
        meetingTitle: title,
        meetingDate,
      },
      { minutesId, sourceLine: row.raw, createdBy: user.id },
    );
    created.push({ code, title: rowTitle, ownerName: owner?.name ?? "未定", dueDate: row.dueDate, confidence: "high" });
    already.add(rowTitle.replace(/\s|　/g, ""));
  }

  const client = await db();
  await client.execute({
    sql: `UPDATE minutes SET task_count = (SELECT COUNT(*) FROM tasks WHERE minutes_id = ?) WHERE id = ?`,
    args: [minutesId, minutesId],
  });

  return { minutesId, minutesTitle: title, created, skipped };
}

/** 取り込み済みの議事録一覧。役員限定の議事録は役員・管理者だけに返す。 */
export async function listMinutes(viewer: { role: Role }, limit = 30): Promise<MinutesRecord[]> {
  const client = await db();
  const result = await client.execute({
    sql: `SELECT id, source, external_id, title, meeting_date, url, author, body, visibility, imported_at, task_count
          FROM minutes
          WHERE ${canSeeExecutive(viewer.role) ? "1=1" : "visibility = 'all'"}
          ORDER BY imported_at DESC LIMIT ?`,
    args: [limit],
  });
  return result.rows.map((row) => ({
    id: Number(row.id),
    source: row.source as SourceName,
    externalId: String(row.external_id),
    title: String(row.title),
    meetingDate: (row.meeting_date as string | null) ?? null,
    url: String(row.url ?? ""),
    author: String(row.author ?? ""),
    body: String(row.body ?? ""),
    visibility: row.visibility as "all" | "executive",
    importedAt: String(row.imported_at),
    taskCount: Number(row.task_count ?? 0),
  }));
}
