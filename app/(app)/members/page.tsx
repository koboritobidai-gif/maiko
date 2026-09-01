import Link from "next/link";
import { SectionCard, TaskTable } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { today } from "@/lib/date";
import { staleDays } from "@/lib/reminders";
import { listTasks, listUsers } from "@/lib/tasks";
import { ROLE_LABELS, isOpen } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const user = await requireUser();
  const base = today();
  const stale = staleDays();
  const tasks = await listTasks(user);
  const members = await listUsers();

  const rows = members.map((member) => {
    const owned = tasks.filter((t) => t.ownerId === member.id);
    const open = owned.filter((t) => isOpen(t.status));
    return {
      member,
      open: open.length,
      overdue: open.filter((t) => t.dueDate !== null && t.dueDate < base).length,
      stale: open.filter((t) => t.statusUpdatedAt.slice(0, 10) <= shift(base, -stale)).length,
      done: owned.filter((t) => t.status === "done").length,
    };
  });

  const unassigned = tasks.filter((t) => isOpen(t.status) && !t.ownerId);

  return (
    <>
      <h1 className="page-title">担当者別の進捗</h1>

      <SectionCard title="誰が・何件抱えているか" note="期限超過が多い順">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>担当者</th>
                <th>部署</th>
                <th>役割</th>
                <th className="num">未完了</th>
                <th className="num">期限超過</th>
                <th className="num">{stale}日以上未報告</th>
                <th className="num">完了</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {[...rows]
                .sort((a, b) => b.overdue - a.overdue || b.open - a.open)
                .map(({ member, open, overdue, stale: staleCount, done }) => (
                  <tr key={member.id}>
                    <td style={{ fontWeight: 600 }}>{member.name}</td>
                    <td style={{ color: "var(--ink-soft)" }}>{member.department || "—"}</td>
                    <td style={{ color: "var(--ink-soft)" }}>{ROLE_LABELS[member.role]}</td>
                    <td className="num">{open}</td>
                    <td className="num">
                      {overdue ? <span className="badge badge-overdue">{overdue}</span> : "0"}
                    </td>
                    <td className="num">
                      {staleCount ? <span className="badge badge-soon">{staleCount}</span> : "0"}
                    </td>
                    <td className="num" style={{ color: "var(--ink-faint)" }}>
                      {done}
                    </td>
                    <td>
                      <Link href={`/tasks?owner=${member.id}`} className="btn btn-sm">
                        一覧
                      </Link>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="担当者が決まっていないタスク" note="MTGで決めたが担当が空のもの">
        <TaskTable tasks={unassigned} base={base} emptyText="担当者未定のタスクはありません。" showMeeting />
      </SectionCard>
    </>
  );
}

function shift(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
