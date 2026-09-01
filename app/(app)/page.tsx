import Link from "next/link";
import { MetricCard, SectionCard, TaskTable } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { addDays, formatShort, today } from "@/lib/date";
import { db } from "@/lib/db";
import { staleDays } from "@/lib/reminders";
import { computeMetrics, listTasks, listUsers } from "@/lib/tasks";
import { STATUS_LABELS, isOpen, type Status, type Task } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const base = today();
  const stale = staleDays();
  const tasks = await listTasks(user);
  const metrics = computeMetrics(tasks, stale, base);

  const openTasks = tasks.filter((t) => isOpen(t.status));
  const weekEnd = addDays(base, 7);

  const attention = openTasks
    .filter((t) => t.dueDate !== null && t.dueDate <= weekEnd)
    .slice(0, 12);

  const unreported = openTasks
    .filter((t) => {
      const reported = t.statusUpdatedAt.slice(0, 10);
      return reported <= addDays(base, -stale) && (t.dueDate === null || t.dueDate > weekEnd);
    })
    .slice(0, 8);

  const mine = openTasks.filter((t) => t.ownerId === user.id);

  return (
    <>
      <section className="section">
        <div className="section-head">
          <span className="section-title">全社の状況（{formatShort(base)}時点）</span>
          <Link href="/tasks" className="btn btn-sm">
            タスク一覧を見る
          </Link>
        </div>
        <div className="metrics">
          <MetricCard label="未完了" value={metrics.open} note={`全${metrics.total}件中`} />
          <MetricCard
            label="期限超過"
            value={metrics.overdue}
            note={metrics.overdue ? "至急フォローが必要" : "超過なし"}
            tone={metrics.overdue ? "alert" : undefined}
          />
          <MetricCard
            label="今週が期限"
            value={metrics.dueThisWeek}
            note={`〜${formatShort(weekEnd)}`}
            tone={metrics.dueThisWeek ? "warn" : undefined}
          />
          <MetricCard
            label="状況が未報告"
            value={metrics.stale}
            note={`${stale}日以上更新なし`}
          />
          <MetricCard label="今月の完了" value={metrics.doneThisMonth} note="進捗の実績" />
        </div>
      </section>

      <SectionCard
        title="自分のタスク"
        note={`未完了 ${mine.length}件`}
        action={
          <Link href="/tasks?owner=me" className="btn btn-sm">
            すべて見る
          </Link>
        }
      >
        <TaskTable tasks={mine.slice(0, 8)} base={base} showOwner={false} showMeeting
          emptyText="担当している未完了タスクはありません。" />
      </SectionCard>

      <SectionCard
        title="期限超過・今週が期限のタスク"
        note="ここが空になっている状態が理想です"
      >
        <TaskTable tasks={attention} base={base} emptyText="期限が迫っているタスクはありません。" />
      </SectionCard>

      <SectionCard
        title={`${stale}日以上 状況が更新されていないタスク`}
        note="「決めたのに、その後どうなったかわからない」を防ぐための一覧"
      >
        <TaskTable tasks={unreported} base={base} emptyText="全タスクの状況が更新されています。" />
      </SectionCard>

      <div className="detail-grid">
        <OwnerProgress tasks={tasks} />
        <RecentUpdates viewerRole={user.role} />
      </div>
    </>
  );
}

/** 担当者ごとの進捗を積み上げバーで見せる。誰が詰まっているかを一目で分かるようにする。 */
async function OwnerProgress({ tasks }: { tasks: Task[] }) {
  const users = await listUsers();
  const rows = users
    .map((member) => {
      const owned = tasks.filter((t) => t.ownerId === member.id);
      const counts: Record<Status, number> = {
        not_started: 0,
        in_progress: 0,
        blocked: 0,
        done: 0,
        cancelled: 0,
      };
      for (const task of owned) counts[task.status] += 1;
      const tracked = owned.filter((t) => t.status !== "cancelled").length;
      const overdue = owned.filter(
        (t) => isOpen(t.status) && t.dueDate !== null && t.dueDate < today(),
      ).length;
      return { member, counts, tracked, overdue };
    })
    .filter((row) => row.tracked > 0)
    .sort((a, b) => b.overdue - a.overdue || b.tracked - a.tracked);

  return (
    <SectionCard title="担当者別の進捗" note="完了／進行中／停滞／未着手">
      <div className="card-pad">
        {rows.length === 0 ? (
          <div className="empty">タスクが登録されていません。</div>
        ) : (
          rows.map(({ member, counts, tracked, overdue }) => (
            <div className="bar-row" key={member.id}>
              <div className="bar-name">
                {member.name}
                {overdue ? (
                  <span className="badge badge-overdue" style={{ marginLeft: 6 }}>
                    超過{overdue}
                  </span>
                ) : null}
              </div>
              <div className="bar-track" title={`全${tracked}件`}>
                {(["done", "in_progress", "blocked", "not_started"] as Status[]).map((status) =>
                  counts[status] ? (
                    <span
                      key={status}
                      className={`bar-fill ${status}`}
                      style={{ width: `${(counts[status] / tracked) * 100}%` }}
                      title={`${STATUS_LABELS[status]} ${counts[status]}件`}
                    />
                  ) : null,
                )}
              </div>
              <div className="bar-value">
                完了 {counts.done}/{tracked}
              </div>
            </div>
          ))
        )}
      </div>
    </SectionCard>
  );
}

/** 直近の進捗報告。誰かが動いていることが見えるようにする。 */
async function RecentUpdates({ viewerRole }: { viewerRole: string }) {
  const client = await db();
  const visibility = viewerRole === "member" ? "AND t.visibility = 'all'" : "";
  const result = await client.execute({
    sql: `SELECT tu.body, tu.status_from, tu.status_to, tu.created_at,
                 COALESCE(u.name,'') AS user_name, t.code, t.title
          FROM task_updates tu
          JOIN tasks t ON t.id = tu.task_id
          LEFT JOIN users u ON u.id = tu.user_id
          WHERE 1=1 ${visibility}
          ORDER BY tu.created_at DESC, tu.id DESC LIMIT 8`,
    args: [],
  });

  return (
    <SectionCard title="最近の進捗報告">
      <div className="card-pad">
        {result.rows.length === 0 ? (
          <div className="empty">まだ進捗報告がありません。</div>
        ) : (
          <div className="timeline">
            {result.rows.map((row, index) => {
              const from = row.status_from as Status | null;
              const to = row.status_to as Status | null;
              return (
                <div className="timeline-item" key={index}>
                  <div className="timeline-meta">
                    {formatShort(String(row.created_at).slice(0, 10))}　{String(row.user_name)}　
                    <Link href={`/tasks/${row.code}`} className="task-link">
                      #{String(row.code)} {String(row.title)}
                    </Link>
                  </div>
                  <div className="timeline-body">
                    {from && to ? `${STATUS_LABELS[from]} → ${STATUS_LABELS[to]}　` : ""}
                    {String(row.body ?? "")}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
