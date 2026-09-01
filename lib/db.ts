import { createClient, type Client } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * データベース接続とスキーマ初期化。
 *
 * 既定ではリポジトリ内の SQLite ファイルを使うのでセットアップ不要。
 * 本番（Vercel など）では DATABASE_URL に Turso(libSQL) の URL を設定する。
 */

let client: Client | null = null;
let ready: Promise<void> | null = null;

function createDbClient(): Client {
  const url = process.env.DATABASE_URL ?? "file:./data/maiko.db";
  if (url.startsWith("file:")) {
    // ファイル DB の置き場が無いと接続に失敗するので先に作る。
    const path = url.slice("file:".length);
    mkdirSync(dirname(path), { recursive: true });
  }
  return createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     email TEXT NOT NULL UNIQUE,
     role TEXT NOT NULL DEFAULT 'member',
     department TEXT NOT NULL DEFAULT '',
     password_hash TEXT NOT NULL,
     active INTEGER NOT NULL DEFAULT 1,
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS tasks (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     code TEXT NOT NULL UNIQUE,
     title TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     owner_id TEXT REFERENCES users(id),
     due_date TEXT,
     status TEXT NOT NULL DEFAULT 'not_started',
     visibility TEXT NOT NULL DEFAULT 'all',
     meeting_title TEXT NOT NULL DEFAULT '',
     meeting_date TEXT,
     created_by TEXT REFERENCES users(id),
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     status_updated_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS task_updates (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
     user_id TEXT REFERENCES users(id),
     body TEXT NOT NULL DEFAULT '',
     status_from TEXT,
     status_to TEXT,
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS reminder_log (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     task_id INTEGER NOT NULL,
     kind TEXT NOT NULL,
     sent_on TEXT NOT NULL,
     to_email TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS sessions (
     token TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at TEXT NOT NULL,
     expires_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks(owner_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date)`,
  `CREATE INDEX IF NOT EXISTS idx_updates_task ON task_updates(task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_reminder_task ON reminder_log(task_id, kind)`,
];

/** スキーマを用意した接続を返す。初期化は 1 回だけ走る。 */
export async function db(): Promise<Client> {
  if (!client) client = createDbClient();
  if (!ready) {
    const c = client;
    ready = (async () => {
      for (const statement of SCHEMA) {
        await c.execute(statement);
      }
    })();
  }
  await ready;
  return client;
}

/** テストや seed スクリプトから接続を作り直したいとき用。 */
export function resetDbForTesting(): void {
  client = null;
  ready = null;
}
