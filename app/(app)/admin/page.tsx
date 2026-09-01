import {
  addMeetingTypeAction,
  createUserAction,
  sendRemindersAction,
  setUserRoleAction,
  updateMeetingTypeAction,
} from "@/app/actions";
import { SectionCard } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatShort, today } from "@/lib/date";
import { isDryRun } from "@/lib/mail";
import {
  KIND_LABELS,
  dueSoonDays,
  planReminders,
  recentReminderLog,
  staleDays,
} from "@/lib/reminders";
import { listMeetingTypes } from "@/lib/meetings";
import { listUsers } from "@/lib/tasks";
import { ROLE_LABELS, VISIBILITY_LABELS, type Role } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["member", "executive", "admin"];

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; sent?: string; skipped?: string; dry?: string }>;
}) {
  await requireAdmin();
  const query = await searchParams;
  const base = today();

  const members = await listUsers(true);
  const plans = await planReminders(base);
  const log = await recentReminderLog();
  const meetingTypes = await listMeetingTypes(true);

  return (
    <>
      <h1 className="page-title">社員・通知設定</h1>
      {query.err ? <div className="notice notice-error">{query.err}</div> : null}
      {query.sent !== undefined ? (
        <div className="notice notice-ok">
          {query.dry === "1"
            ? `テスト送信（DRY RUN）を実行しました。${query.sent}通ぶんの内容をサーバーログに出力しています。`
            : `リマインドメールを ${query.sent} 通送信しました。`}
          {Number(query.skipped) > 0 ? `（送信間隔が空いていない ${query.skipped} 件はスキップ）` : ""}
        </div>
      ) : null}

      <SectionCard
        title="期限リマインドメール"
        note={`期限${dueSoonDays()}日前から通知 / ${staleDays()}日以上更新が無いタスクは状況確認`}
        action={
          <form action={sendRemindersAction}>
            <button type="submit" className="btn btn-primary btn-sm">
              いま送信する
            </button>
          </form>
        }
      >
        <div className="card-pad">
          {isDryRun() ? (
            <div className="notice notice-info">
              SMTP が未設定（または MAIL_DRY_RUN=1）のため、実際の送信は行われません。
              送信内容はサーバーのログに出力されます。.env に SMTP_HOST などを設定すると実送信に切り替わります。
            </div>
          ) : null}

          {plans.length === 0 ? (
            <div className="empty">いま通知が必要なタスクはありません。</div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>宛先</th>
                    <th>件数</th>
                    <th>内訳</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => (
                    <tr key={plan.owner.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{plan.owner.name}</div>
                        <div className="code">{plan.owner.email}</div>
                      </td>
                      <td className="num">{plan.items.length}件</td>
                      <td style={{ fontSize: 12 }}>
                        {plan.items.map((item) => (
                          <div key={item.task.code}>
                            <span className="badge badge-soon">{KIND_LABELS[item.kind]}</span>{" "}
                            #{item.task.code} {item.task.title}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="送信履歴" note="直近40件">
        {log.length === 0 ? (
          <div className="empty">まだ送信履歴がありません。</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 100 }}>送信日</th>
                  <th style={{ width: 110 }}>種別</th>
                  <th>タスク</th>
                  <th style={{ width: 220 }}>宛先</th>
                </tr>
              </thead>
              <tbody>
                {log.map((entry, index) => (
                  <tr key={index}>
                    <td className="code">{formatShort(entry.sentOn)}</td>
                    <td>
                      <span className="badge badge-soon">{KIND_LABELS[entry.kind]}</span>
                    </td>
                    <td>
                      #{entry.taskCode} {entry.taskTitle}
                    </td>
                    <td className="code">{entry.toEmail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="会議名"
        note="議事録の取り込みやタスク登録では、ここに登録した会議名から選びます"
      >
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>会議名</th>
                <th style={{ width: 150 }}>公開範囲</th>
                <th style={{ width: 110 }}>表示</th>
                <th style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {meetingTypes.map((meeting) => (
                <tr key={meeting.id}>
                  <td style={{ fontWeight: 600 }}>{meeting.name}</td>
                  <td colSpan={3}>
                    <form action={updateMeetingTypeAction} style={{ display: "flex", gap: 6 }}>
                      <input type="hidden" name="id" value={meeting.id} />
                      <select name="visibility" defaultValue={meeting.visibility}>
                        <option value="all">{VISIBILITY_LABELS.all}</option>
                        <option value="executive">{VISIBILITY_LABELS.executive}</option>
                      </select>
                      <select name="active" defaultValue={meeting.active ? "1" : "0"}>
                        <option value="1">選択肢に表示</option>
                        <option value="0">非表示</option>
                      </select>
                      <button type="submit" className="btn btn-sm">
                        変更
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card-pad" style={{ borderTop: "1px solid var(--line)" }}>
          <form action={addMeetingTypeAction} className="toolbar" style={{ margin: 0 }}>
            <div className="field grow">
              <label htmlFor="meeting-name">会議名を追加</label>
              <input id="meeting-name" name="name" type="text" required placeholder="例：商品戦略会議" />
            </div>
            <div className="field">
              <label htmlFor="meeting-visibility">公開範囲</label>
              <select id="meeting-visibility" name="visibility" defaultValue="all">
                <option value="all">{VISIBILITY_LABELS.all}</option>
                <option value="executive">{VISIBILITY_LABELS.executive}</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary">
              追加する
            </button>
          </form>
        </div>
      </SectionCard>

      <SectionCard title="社員アカウント" note="役員に設定した社員だけが役員限定の議事録・タスクを閲覧できます">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>氏名</th>
                <th>メールアドレス</th>
                <th>部署</th>
                <th style={{ width: 190 }}>役割</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td style={{ fontWeight: 600 }}>{member.name}</td>
                  <td className="code">{member.email}</td>
                  <td style={{ color: "var(--ink-soft)" }}>{member.department || "—"}</td>
                  <td>
                    <form action={setUserRoleAction} style={{ display: "flex", gap: 6 }}>
                      <input type="hidden" name="userId" value={member.id} />
                      <select name="role" defaultValue={member.role}>
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="btn btn-sm">
                        変更
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <section className="section">
        <details className="card card-pad">
          <summary style={{ cursor: "pointer", fontWeight: 700, color: "var(--brand-deep)" }}>
            ＋ 社員アカウントを追加する
          </summary>
          <form action={createUserAction} style={{ marginTop: 14 }}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="name">氏名</label>
                <input id="name" name="name" type="text" required />
              </div>
              <div className="field">
                <label htmlFor="user-email">メールアドレス</label>
                <input id="user-email" name="email" type="email" required />
              </div>
              <div className="field">
                <label htmlFor="department">部署</label>
                <input id="department" name="department" type="text" />
              </div>
              <div className="field">
                <label htmlFor="user-role">役割</label>
                <select id="user-role" name="role" defaultValue="member">
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="user-password">初期パスワード（8文字以上）</label>
                <input id="user-password" name="password" type="text" required minLength={8} />
              </div>
            </div>
            <button type="submit" className="btn btn-primary">
              追加する
            </button>
          </form>
        </details>
      </section>
    </>
  );
}
