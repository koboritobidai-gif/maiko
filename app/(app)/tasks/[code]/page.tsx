import Link from "next/link";
import { notFound } from "next/navigation";
import { addUpdateAction, deleteTaskAction, updateTaskAction } from "@/app/actions";
import { SectionCard, StatusBadge, VisibilityBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { duePhrase, formatLong, formatShort, today } from "@/lib/date";
import { getTask, listTaskUpdates, listUsers } from "@/lib/tasks";
import {
  ROLE_LABELS,
  STATUS_LABELS,
  STATUS_ORDER,
  VISIBILITY_LABELS,
  canSeeExecutive,
  type Status,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const user = await requireUser();
  const { code } = await params;
  const { err } = await searchParams;

  const task = await getTask(user, code);
  // 閲覧権限が無い場合も「存在しない」と同じ扱いにし、役員限定タスクの
  // 存在自体を推測されないようにする。
  if (!task) notFound();

  const updates = await listTaskUpdates(task.id);
  const members = await listUsers();
  const base = today();

  return (
    <>
      <Link href="/tasks" className="backlink">
        ← タスク一覧へ戻る
      </Link>
      <h1 className="page-title">
        {task.title} <VisibilityBadge visibility={task.visibility} />
      </h1>

      {err ? <div className="notice notice-error">{err}</div> : null}

      <div className="detail-grid">
        <div>
          <SectionCard title="進捗を報告する" note="ここを更新すると全社の画面に反映されます">
            <form action={addUpdateAction} className="card-pad">
              <input type="hidden" name="code" value={task.code} />
              <div className="field">
                <label htmlFor="body">状況コメント</label>
                <textarea
                  id="body"
                  name="body"
                  placeholder="例：先方の確認待ち。9/5に回答予定。"
                />
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="status">状況を変更する</label>
                  <select id="status" name="status" defaultValue={task.status}>
                    {STATUS_ORDER.map((status) => (
                      <option key={status} value={status}>
                        {STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button type="submit" className="btn btn-primary">
                報告する
              </button>
            </form>
          </SectionCard>

          <SectionCard title="進捗の履歴" note={`${updates.length}件`}>
            <div className="card-pad">
              {updates.length === 0 ? (
                <div className="empty">まだ進捗報告がありません。</div>
              ) : (
                <div className="timeline">
                  {updates.map((update) => (
                    <div className="timeline-item" key={update.id}>
                      <div className="timeline-meta">
                        {formatLong(update.createdAt.slice(0, 10))}　{update.userName}
                      </div>
                      <div className="timeline-body">
                        {update.statusFrom && update.statusTo
                          ? `${STATUS_LABELS[update.statusFrom]} → ${STATUS_LABELS[update.statusTo]}　`
                          : ""}
                        {update.body}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SectionCard>
        </div>

        <div>
          <SectionCard title="タスク情報">
            <div className="card-pad">
              <dl className="kv">
                <dt>ID</dt>
                <dd className="code">{task.code}</dd>
                <dt>担当者</dt>
                <dd>
                  {task.ownerName || "未定"}
                  {task.ownerEmail ? (
                    <div style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>{task.ownerEmail}</div>
                  ) : null}
                </dd>
                <dt>期限</dt>
                <dd>
                  {formatLong(task.dueDate)}
                  <span style={{ color: "var(--ink-faint)", fontSize: 12 }}>
                    　{duePhrase(task.dueDate, base)}
                  </span>
                </dd>
                <dt>状況</dt>
                <dd>
                  <StatusBadge status={task.status} />
                </dd>
                <dt>公開範囲</dt>
                <dd>{VISIBILITY_LABELS[task.visibility]}</dd>
                <dt>決定したMTG</dt>
                <dd>
                  {task.meetingTitle || "—"}
                  {task.meetingDate ? `（${formatShort(task.meetingDate)}）` : ""}
                </dd>
                <dt>最終更新</dt>
                <dd>{formatLong(task.statusUpdatedAt.slice(0, 10))}</dd>
              </dl>
              {task.description ? (
                <>
                  <div style={{ marginTop: 14, fontSize: 12, color: "var(--ink-faint)" }}>
                    詳細・決定事項
                  </div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{task.description}</div>
                </>
              ) : null}
            </div>
          </SectionCard>

          <section className="section">
            <details className="card card-pad">
              <summary style={{ cursor: "pointer", fontWeight: 700, color: "var(--brand-deep)" }}>
                タスクを編集する
              </summary>
              <form action={updateTaskAction} style={{ marginTop: 14 }}>
                <input type="hidden" name="code" value={task.code} />
                <div className="field">
                  <label htmlFor="edit-title">タスク名</label>
                  <input id="edit-title" name="title" type="text" defaultValue={task.title} required />
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="edit-owner">担当者</label>
                    <select id="edit-owner" name="ownerId" defaultValue={task.ownerId ?? ""}>
                      <option value="">未定</option>
                      {members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}（{ROLE_LABELS[member.role]}）
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="edit-due">期限</label>
                    <input id="edit-due" name="dueDate" type="date" defaultValue={task.dueDate ?? ""} />
                  </div>
                  <div className="field">
                    <label htmlFor="edit-status">状況</label>
                    <select id="edit-status" name="status" defaultValue={task.status}>
                      {STATUS_ORDER.map((status: Status) => (
                        <option key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="edit-visibility">公開範囲</label>
                    <select
                      id="edit-visibility"
                      name="visibility"
                      defaultValue={task.visibility}
                      disabled={!canSeeExecutive(user.role)}
                    >
                      <option value="all">{VISIBILITY_LABELS.all}</option>
                      <option value="executive">{VISIBILITY_LABELS.executive}</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="edit-meeting">決定したMTG</label>
                    <input
                      id="edit-meeting"
                      name="meetingTitle"
                      type="text"
                      defaultValue={task.meetingTitle}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="edit-meeting-date">MTG開催日</label>
                    <input
                      id="edit-meeting-date"
                      name="meetingDate"
                      type="date"
                      defaultValue={task.meetingDate ?? ""}
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="edit-description">詳細・決定事項</label>
                  <textarea id="edit-description" name="description" defaultValue={task.description} />
                </div>
                <button type="submit" className="btn btn-primary">
                  保存する
                </button>
              </form>

              {user.role === "admin" ? (
                <form action={deleteTaskAction} style={{ marginTop: 14 }}>
                  <input type="hidden" name="code" value={task.code} />
                  <button type="submit" className="btn btn-sm btn-danger">
                    このタスクを削除する
                  </button>
                </form>
              ) : null}
            </details>
          </section>
        </div>
      </div>
    </>
  );
}
