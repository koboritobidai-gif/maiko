import Link from "next/link";
import { duePhrase, formatShort, today } from "@/lib/date";
import { STATUS_LABELS, VISIBILITY_LABELS, type Status, type Task } from "@/lib/types";

/** ステータスの色付きバッジ。 */
export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABELS[status]}</span>;
}

/** 役員限定タスクであることの表示。全画面で同じ見た目にする。 */
export function VisibilityBadge({ visibility }: { visibility: Task["visibility"] }) {
  if (visibility !== "executive") return null;
  return <span className="badge badge-exec">🔒 {VISIBILITY_LABELS.executive}</span>;
}

/** 期限と、超過／残日数をまとめて表示する。 */
export function DueCell({ task, base = today() }: { task: Task; base?: string }) {
  if (!task.dueDate) return <span style={{ color: "var(--ink-faint)" }}>期限なし</span>;
  const phrase = duePhrase(task.dueDate, base);
  const overdue = task.dueDate < base && task.status !== "done" && task.status !== "cancelled";
  const soon = !overdue && task.dueDate <= addDaysLocal(base, 3);
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      {formatShort(task.dueDate)}{" "}
      {overdue ? (
        <span className="badge badge-overdue">{phrase}</span>
      ) : soon && task.status !== "done" && task.status !== "cancelled" ? (
        <span className="badge badge-soon">{phrase}</span>
      ) : (
        <span style={{ color: "var(--ink-faint)", fontSize: 11.5 }}>{phrase}</span>
      )}
    </span>
  );
}

function addDaysLocal(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function MetricCard({
  label,
  value,
  unit = "件",
  note,
  tone,
}: {
  label: string;
  value: number | string;
  unit?: string;
  note?: string;
  tone?: "alert" | "warn";
}) {
  return (
    <div className={`metric${tone ? ` ${tone}` : ""}`}>
      <div className="label">{label}</div>
      <div className="value">
        {value}
        <span className="unit">{unit}</span>
      </div>
      {note ? <div className="note">{note}</div> : null}
    </div>
  );
}

export function SectionCard({
  title,
  note,
  action,
  children,
}: {
  title: string;
  note?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <span className="section-title">{title}</span>
          {note ? <span className="section-note">　{note}</span> : null}
        </div>
        {action}
      </div>
      <div className="card">{children}</div>
    </section>
  );
}

/** タスク一覧のテーブル。ダッシュボードと一覧ページで共有する。 */
export function TaskTable({
  tasks,
  base = today(),
  emptyText = "該当するタスクはありません。",
  showOwner = true,
  showMeeting = false,
}: {
  tasks: Task[];
  base?: string;
  emptyText?: string;
  showOwner?: boolean;
  showMeeting?: boolean;
}) {
  if (!tasks.length) return <div className="empty">{emptyText}</div>;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th className="col-id" style={{ width: 70 }}>ID</th>
            <th>タスク</th>
            {showOwner ? <th className="col-owner" style={{ width: 110 }}>担当</th> : null}
            <th style={{ width: 160 }}>期限</th>
            <th style={{ width: 84 }}>状況</th>
            {showMeeting ? <th className="col-sub" style={{ width: 170 }}>決定したMTG</th> : null}
            <th className="col-sub" style={{ width: 96 }}>最終更新</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.code}>
              <td className="col-id code">{task.code}</td>
              <td>
                <Link href={`/tasks/${task.code}`} className="task-link">
                  {task.title}
                </Link>{" "}
                <VisibilityBadge visibility={task.visibility} />
              </td>
              {showOwner ? <td className="col-owner">{task.ownerName || "—"}</td> : null}
              <td>
                <DueCell task={task} base={base} />
              </td>
              <td>
                <StatusBadge status={task.status} />
              </td>
              {showMeeting ? (
                <td className="col-sub" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  {task.meetingTitle || "—"}
                </td>
              ) : null}
              <td className="col-sub code">{formatShort(task.statusUpdatedAt.slice(0, 10))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
