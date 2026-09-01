"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { hashPassword, login, logout, requireAdmin, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { nowIso } from "@/lib/date";
import { sendReminders } from "@/lib/reminders";
import {
  addProgressUpdate,
  createTask,
  deleteTask,
  updateTask,
} from "@/lib/tasks";
import type { Role, Status, Visibility } from "@/lib/types";

/** フォームから受け取った値を文字列に。空文字は undefined 扱いにしたい場合は or で。 */
function str(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** エラーをクエリに載せて元のページへ戻す。 */
function backWithError(path: string, message: string): never {
  redirect(`${path}?err=${encodeURIComponent(message)}`);
}

export async function loginAction(formData: FormData): Promise<void> {
  const email = str(formData, "email");
  const password = str(formData, "password");
  if (!email || !password) {
    backWithError("/login", "メールアドレスとパスワードを入力してください。");
  }
  const user = await login(email, password);
  if (!user) {
    backWithError("/login", "メールアドレスまたはパスワードが違います。");
  }
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/login");
}

export async function createTaskAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  try {
    const task = await createTask(user, {
      title: str(formData, "title"),
      description: str(formData, "description"),
      ownerId: str(formData, "ownerId") || null,
      dueDate: str(formData, "dueDate") || null,
      status: (str(formData, "status") || "not_started") as Status,
      visibility: (str(formData, "visibility") || "all") as Visibility,
      meetingTitle: str(formData, "meetingTitle"),
      meetingDate: str(formData, "meetingDate") || null,
    });
    revalidatePath("/");
    revalidatePath("/tasks");
    redirect(`/tasks/${task.code}`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    backWithError("/tasks", message(error));
  }
}

export async function updateTaskAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const code = str(formData, "code");
  try {
    await updateTask(user, code, {
      title: str(formData, "title"),
      description: str(formData, "description"),
      ownerId: str(formData, "ownerId") || null,
      dueDate: str(formData, "dueDate") || null,
      status: str(formData, "status") as Status,
      visibility: str(formData, "visibility") as Visibility,
      meetingTitle: str(formData, "meetingTitle"),
      meetingDate: str(formData, "meetingDate") || null,
    });
  } catch (error) {
    if (isRedirect(error)) throw error;
    backWithError(`/tasks/${code}`, message(error));
  }
  revalidatePath("/");
  revalidatePath("/tasks");
  redirect(`/tasks/${code}`);
}

/** 一覧からステータスだけを素早く変えるためのアクション。 */
export async function quickStatusAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const code = str(formData, "code");
  const status = str(formData, "status") as Status;
  try {
    await updateTask(user, code, { status });
  } catch (error) {
    if (isRedirect(error)) throw error;
    backWithError("/tasks", message(error));
  }
  revalidatePath("/");
  revalidatePath("/tasks");
}

export async function addUpdateAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const code = str(formData, "code");
  const rawStatus = str(formData, "status");
  try {
    await addProgressUpdate(
      user,
      code,
      str(formData, "body"),
      rawStatus ? (rawStatus as Status) : undefined,
    );
  } catch (error) {
    if (isRedirect(error)) throw error;
    backWithError(`/tasks/${code}`, message(error));
  }
  revalidatePath("/");
  revalidatePath(`/tasks/${code}`);
  redirect(`/tasks/${code}`);
}

export async function deleteTaskAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const code = str(formData, "code");
  try {
    await deleteTask(user, code);
  } catch (error) {
    if (isRedirect(error)) throw error;
    backWithError(`/tasks/${code}`, message(error));
  }
  revalidatePath("/");
  redirect("/tasks");
}

export async function createUserAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const name = str(formData, "name");
  const email = str(formData, "email");
  const password = str(formData, "password");
  if (!name || !email || password.length < 8) {
    backWithError("/admin", "氏名・メールアドレスと、8文字以上のパスワードを入力してください。");
  }
  const client = await db();
  try {
    await client.execute({
      sql: `INSERT INTO users (id, name, email, role, department, password_hash, active, created_at)
            VALUES (?,?,?,?,?,?,1,?)`,
      args: [
        crypto.randomUUID(),
        name,
        email,
        (str(formData, "role") || "member") as Role,
        str(formData, "department"),
        hashPassword(password),
        nowIso(),
      ],
    });
  } catch {
    backWithError("/admin", "このメールアドレスは既に登録されています。");
  }
  revalidatePath("/admin");
  redirect("/admin");
}

export async function setUserRoleAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const client = await db();
  await client.execute({
    sql: `UPDATE users SET role = ? WHERE id = ?`,
    args: [str(formData, "role") as Role, str(formData, "userId")],
  });
  revalidatePath("/admin");
}

/** 管理画面からリマインドメールを手動送信する。 */
export async function sendRemindersAction(): Promise<void> {
  await requireAdmin();
  const result = await sendReminders();
  revalidatePath("/admin");
  redirect(
    `/admin?sent=${result.sent}&skipped=${result.skipped}&dry=${result.dryRun ? 1 : 0}`,
  );
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "処理に失敗しました。";
}

/** redirect() が投げる制御用の例外を握りつぶさないための判定。 */
function isRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}
