import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db.ts";
import { hashPassword, verifyPassword } from "./password.ts";
import { nowIso } from "./date.ts";
import type { Role, User } from "./types.ts";

/**
 * 認証まわり。外部の認証ライブラリは使わず、
 * scrypt によるパスワードハッシュ + DB に保存したセッショントークンで構成する。
 */

const COOKIE_NAME = "maiko_session";
const SESSION_DAYS = 14;

export { hashPassword, verifyPassword };

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  active: number;
};

function toUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as Role,
    department: row.department,
    active: Boolean(row.active),
  };
}

/** メールアドレスとパスワードを照合し、成功したらセッションを作る。 */
export async function login(
  email: string,
  password: string,
): Promise<User | null> {
  const client = await db();
  const result = await client.execute({
    sql: `SELECT id, name, email, role, department, active, password_hash
          FROM users WHERE lower(email) = lower(?) LIMIT 1`,
    args: [email.trim()],
  });
  const row = result.rows[0] as unknown as (UserRow & { password_hash: string }) | undefined;
  if (!row || !row.active) return null;
  if (!verifyPassword(password, row.password_hash)) return null;

  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await client.execute({
    sql: `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
    args: [token, row.id, nowIso(), expires.toISOString()],
  });

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
  return toUser(row);
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) {
    const client = await db();
    await client.execute({ sql: `DELETE FROM sessions WHERE token = ?`, args: [token] });
  }
  jar.delete(COOKIE_NAME);
}

/** ログイン中のユーザー。未ログインなら null。 */
export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const client = await db();
  const result = await client.execute({
    sql: `SELECT u.id, u.name, u.email, u.role, u.department, u.active, s.expires_at
          FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token = ? LIMIT 1`,
    args: [token],
  });
  const row = result.rows[0] as unknown as (UserRow & { expires_at: string }) | undefined;
  if (!row || !row.active) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await client.execute({ sql: `DELETE FROM sessions WHERE token = ?`, args: [token] });
    return null;
  }
  return toUser(row);
}

/** ページ側で使う。未ログインならログイン画面へ飛ばす。 */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** 管理者専用ページ・操作。権限が無ければダッシュボードへ戻す。 */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}
