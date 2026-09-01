import { createTaskAction } from "@/app/actions";
import { SectionCard, TaskTable } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { today } from "@/lib/date";
import { listMeetings, listTasks, listUsers, type TaskFilters } from "@/lib/tasks";
import {
  STATUS_LABELS,
  STATUS_ORDER,
  VISIBILITY_LABELS,
  canSeeExecutive,
  type Status,
  type Visibility,
} from "@/lib/types";

export const dynamic = "force-dynamic";

interface Query {
  owner?: string;
  status?: string;
  meeting?: string;
  q?: string;
  visibility?: string;
  err?: string;
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  const base = today();

  const members = await listUsers();
  const meetings = await listMeetings(user);

  // owner=me は自分の ID に読み替える。URL を短く保つため。
  const ownerId = query.owner === "me" ? user.id : query.owner || undefined;
  const filters: TaskFilters = {
    ownerId,
    status: (query.status as TaskFilters["status"]) || "open",
    meeting: query.meeting || undefined,
    keyword: query.q || undefined,
    visibility: (query.visibility as Visibility) || undefined,
  };
  const tasks = await listTasks(user, filters);

  return (
    <>
      <h1 className="page-title">タスク一覧</h1>
      {query.err ? <div className="notice notice-error">{query.err}</div> : null}

      <form className="toolbar" method="get" action="/tasks">
        <div className="field grow">
          <label htmlFor="q">キーワード</label>
          <input id="q" name="q" type="search" defaultValue={query.q ?? ""} placeholder="タスク名・MTG名で検索" />
        </div>
        <div className="field">
          <label htmlFor="owner">担当者</label>
          <select id="owner" name="owner" defaultValue={query.owner ?? ""}>
            <option value="">全員</option>
            <option value="me">自分</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="status">状況</label>
          <select id="status" name="status" defaultValue={query.status ?? "open"}>
            <option value="open">未完了のみ</option>
            <option value="all">すべて</option>
            {STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="meeting">MTG</label>
          <select id="meeting" name="meeting" defaultValue={query.meeting ?? ""}>
            <option value="">すべて</option>
            {meetings.map((meeting) => (
              <option key={meeting.title} value={meeting.title}>
                {meeting.title}
              </option>
            ))}
          </select>
        </div>
        {canSeeExecutive(user.role) ? (
          <div className="field">
            <label htmlFor="visibility">公開範囲</label>
            <select id="visibility" name="visibility" defaultValue={query.visibility ?? ""}>
              <option value="">すべて</option>
              <option value="all">{VISIBILITY_LABELS.all}</option>
              <option value="executive">{VISIBILITY_LABELS.executive}</option>
            </select>
          </div>
        ) : null}
        <button type="submit" className="btn">
          絞り込む
        </button>
      </form>

      <SectionCard title="検索結果" note={`${tasks.length}件`}>
        <TaskTable tasks={tasks} base={base} showMeeting emptyText="条件に合うタスクはありません。" />
      </SectionCard>

      <section className="section">
        <details className="card card-pad">
          <summary style={{ cursor: "pointer", fontWeight: 700, color: "var(--brand-deep)" }}>
            ＋ MTGで決まったタスクを登録する
          </summary>
          <form action={createTaskAction} style={{ marginTop: 16 }}>
            <div className="field">
              <label htmlFor="title">タスク名（必須）</label>
              <input id="title" name="title" type="text" required placeholder="例：新商品の販促スケジュール案を作成" />
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="ownerId">担当者</label>
                <select id="ownerId" name="ownerId" defaultValue="">
                  <option value="">未定</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}（{member.department}）
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="dueDate">期限</label>
                <input id="dueDate" name="dueDate" type="date" />
              </div>
              <div className="field">
                <label htmlFor="new-status">初期の状況</label>
                <select id="new-status" name="status" defaultValue="not_started">
                  {STATUS_ORDER.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="new-visibility">公開範囲</label>
                <select
                  id="new-visibility"
                  name="visibility"
                  defaultValue="all"
                  disabled={!canSeeExecutive(user.role)}
                >
                  <option value="all">{VISIBILITY_LABELS.all}</option>
                  {canSeeExecutive(user.role) ? (
                    <option value="executive">{VISIBILITY_LABELS.executive}</option>
                  ) : null}
                </select>
                <span className="hint">
                  {canSeeExecutive(user.role)
                    ? "「役員のみ」にすると役員・管理者だけが閲覧できます。"
                    : "役員限定タスクの作成は役員・管理者のみです。"}
                </span>
              </div>
              <div className="field">
                <label htmlFor="meetingTitle">決定したMTG</label>
                <input id="meetingTitle" name="meetingTitle" type="text" placeholder="例：全体定例MTG" list="meeting-list" />
                <datalist id="meeting-list">
                  {meetings.map((meeting) => (
                    <option key={meeting.title} value={meeting.title} />
                  ))}
                </datalist>
              </div>
              <div className="field">
                <label htmlFor="meetingDate">MTG開催日</label>
                <input id="meetingDate" name="meetingDate" type="date" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="description">詳細・決定事項</label>
              <textarea id="description" name="description" placeholder="MTGでの決定内容や補足を記入します。" />
            </div>
            <button type="submit" className="btn btn-primary">
              登録する
            </button>
          </form>
        </details>
      </section>
    </>
  );
}
