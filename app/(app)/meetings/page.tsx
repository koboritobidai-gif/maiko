import Link from "next/link";
import { SectionCard, TaskTable } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatLong, today } from "@/lib/date";
import { listMeetings, listTasks } from "@/lib/tasks";
import { isOpen } from "@/lib/types";

export const dynamic = "force-dynamic";

/** MTG単位で「決めたことが片付いているか」を見るページ。 */
export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ meeting?: string }>;
}) {
  const user = await requireUser();
  const { meeting } = await searchParams;
  const base = today();

  const meetings = await listMeetings(user);
  const selected = meeting ?? meetings[0]?.title ?? "";
  const tasks = selected ? await listTasks(user, { meeting: selected, status: "all" }) : [];
  const openCount = tasks.filter((t) => isOpen(t.status)).length;

  return (
    <>
      <h1 className="page-title">MTG別のタスク</h1>

      {meetings.length === 0 ? (
        <div className="card empty">MTG名が設定されたタスクがまだありません。</div>
      ) : (
        <>
          <div className="chips" style={{ marginBottom: 16 }}>
            {meetings.map((item) => (
              <Link
                key={`${item.title}-${item.date}`}
                href={`/meetings?meeting=${encodeURIComponent(item.title)}`}
                className={`chip${item.title === selected ? " active" : ""}`}
              >
                {item.title}
                {item.open > 0 ? `（未完了${item.open}）` : "（完了）"}
              </Link>
            ))}
          </div>

          <SectionCard
            title={selected}
            note={`全${tasks.length}件 / 未完了${openCount}件${
              tasks[0]?.meetingDate ? `　開催日 ${formatLong(tasks[0].meetingDate)}` : ""
            }`}
          >
            <TaskTable tasks={tasks} base={base} emptyText="このMTGのタスクはありません。" />
          </SectionCard>
        </>
      )}
    </>
  );
}
