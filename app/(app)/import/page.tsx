import Link from "next/link";
import { syncSourceAction } from "@/app/actions";
import { MinutesImporter } from "@/components/MinutesImporter";
import { SectionCard } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatShort, today } from "@/lib/date";
import { listMinutes } from "@/lib/importer";
import { listMeetingTypes } from "@/lib/meetings";
import { SOURCES, SOURCE_LABELS, subjectMarker } from "@/lib/sources";
import { listUsers } from "@/lib/tasks";
import { canSeeExecutive } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Query {
  err?: string;
  created?: string;
  skipped?: string;
  synced?: string;
  docs?: string;
}

export default async function ImportPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requireUser();
  const query = await searchParams;
  const members = await listUsers();
  const minutes = await listMinutes(user);
  const meetingTypes = await listMeetingTypes();
  const isAdmin = user.role === "admin";

  return (
    <>
      <h1 className="page-title">議事録の取り込み</h1>

      {query.err ? <div className="notice notice-error">{query.err}</div> : null}
      {query.synced ? (
        <div className="notice notice-ok">
          {query.synced} から議事録 {query.docs} 件を取り込み、タスクを {query.created} 件作成しました。
          {Number(query.skipped) > 0 ? `（登録済みの ${query.skipped} 件はそのまま）` : ""}
        </div>
      ) : query.created ? (
        <div className="notice notice-ok">
          タスクを {query.created} 件登録しました。
          {Number(query.skipped) > 0 ? `（登録済みの ${query.skipped} 件はそのまま）` : ""}{" "}
          <Link href="/tasks" style={{ textDecoration: "underline" }}>
            タスク一覧を見る
          </Link>
        </div>
      ) : null}

      <div className="notice notice-info">
        <strong>取り込みの流れ</strong>
        <div style={{ marginTop: 4 }}>
          議事録の内容を確認 → 件名に <strong>{subjectMarker()}</strong> を付けて社内へメール送信 →
          アプリが毎朝そのメールだけを取り込みます。件名に会議名を入れておくと、会議名と公開範囲も自動で決まります。
        </div>
        <div style={{ marginTop: 4 }}>
          その場で取り込みたいときは、下からファイルをドラッグ＆ドロップするか、本文を貼り付けてください。
        </div>
      </div>

      <SectionCard
        title="議事録を読み込む"
        note="いま手元にある議事録を取り込みます"
      >
        <div style={{ padding: 0 }}>
          <MinutesImporter
            members={members.map((m) => ({ id: m.id, name: m.name, department: m.department }))}
            meetings={meetingTypes.map((m) => ({ name: m.name, visibility: m.visibility }))}
            canSetExecutive={canSeeExecutive(user.role)}
            today={today()}
          />
        </div>
      </SectionCard>

      {isAdmin ? (
      <SectionCard
        title="メール等からの取り込み"
        note={`件名に ${subjectMarker()} が付いたメールだけを対象にします`}
      >
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 200 }}>取得元</th>
                <th style={{ width: 110 }}>状態</th>
                <th>必要な設定</th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((source) => {
                const ready = source.configured();
                return (
                  <tr key={source.name}>
                    <td style={{ fontWeight: 600 }}>{source.label}</td>
                    <td>
                      <span className={`badge ${ready ? "badge-done" : "badge-not_started"}`}>
                        {ready ? "連携済み" : "未設定"}
                      </span>
                    </td>
                    <td className="code" style={{ whiteSpace: "normal" }}>
                      {source.requirement}
                    </td>
                    <td>
                      <form action={syncSourceAction}>
                        <input type="hidden" name="source" value={source.name} />
                        <button type="submit" className="btn btn-sm" disabled={!ready}>
                          いま取り込む
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
      ) : null}

      <SectionCard title="取り込み済みの議事録" note={`直近${minutes.length}件`}>
        {minutes.length === 0 ? (
          <div className="empty">まだ議事録を取り込んでいません。</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 112 }}>取得元</th>
                  <th>議事録</th>
                  <th style={{ width: 96 }}>開催日</th>
                  <th style={{ width: 96 }} className="num">
                    作成タスク
                  </th>
                  <th style={{ width: 96 }}>取り込み日</th>
                </tr>
              </thead>
              <tbody>
                {minutes.map((record) => (
                  <tr key={record.id}>
                    <td className="code">{SOURCE_LABELS[record.source]}</td>
                    <td>
                      {record.url ? (
                        <a href={record.url} target="_blank" rel="noreferrer" className="task-link">
                          {record.title}
                        </a>
                      ) : (
                        <span style={{ fontWeight: 600 }}>{record.title}</span>
                      )}
                      {record.visibility === "executive" ? (
                        <span className="badge badge-exec" style={{ marginLeft: 6 }}>
                          🔒 役員のみ
                        </span>
                      ) : null}
                    </td>
                    <td className="code">{formatShort(record.meetingDate)}</td>
                    <td className="num">
                      <Link href={`/tasks?q=${encodeURIComponent(record.title)}`}>{record.taskCount}件</Link>
                    </td>
                    <td className="code">{formatShort(record.importedAt.slice(0, 10))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}
