import { logoutAction } from "@/app/actions";
import { Nav, type NavItem } from "@/components/Nav";
import { requireUser } from "@/lib/auth";
import { formatLong, today } from "@/lib/date";
import { listTasks } from "@/lib/tasks";
import { ROLE_LABELS, canSeeExecutive, isOpen } from "@/lib/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const tasks = await listTasks(user);
  const base = today();

  const mine = tasks.filter((t) => t.ownerId === user.id && isOpen(t.status)).length;
  const overdue = tasks.filter(
    (t) => isOpen(t.status) && t.dueDate !== null && t.dueDate < base,
  ).length;

  const groups: { label?: string; items: NavItem[] }[] = [
    {
      items: [
        { href: "/", label: "ダッシュボード", icon: "›" },
        { href: "/tasks", label: "タスク一覧", icon: "›", count: tasks.filter((t) => isOpen(t.status)).length },
        { href: "/tasks?owner=me", label: "自分のタスク", icon: "›", count: mine },
      ],
    },
    {
      label: "取り込む",
      items: [{ href: "/import", label: "議事録の取り込み", icon: "›" }],
    },
    {
      label: "把握する",
      items: [
        { href: "/members", label: "担当者別の進捗", icon: "›" },
        { href: "/meetings", label: "MTG別", icon: "›" },
      ],
    },
  ];

  if (canSeeExecutive(user.role)) {
    groups.push({
      label: "役員",
      items: [{ href: "/tasks?visibility=executive", label: "役員限定タスク", icon: "›" }],
    });
  }
  if (user.role === "admin") {
    groups.push({
      label: "管理",
      items: [{ href: "/admin", label: "社員・通知設定", icon: "›" }],
    });
  }

  return (
    <>
      <header className="topband">
        <span className="logo">FAITH</span>
        <span className="topband-title">株式会社フェース｜タスク管理</span>
        <span className="spacer" />
        <div className="userpill">
          <span>
            {user.name}（{ROLE_LABELS[user.role]}）としてログイン中
          </span>
          <form action={logoutAction}>
            <button type="submit">ログアウト</button>
          </form>
        </div>
      </header>

      <div className="shell">
        <aside className="sidebar">
          <Nav groups={groups} />
        </aside>

        <main className="main">
          <div className="topbar">
            <div>
              <div className="greeting">こんにちは、{user.name} さん</div>
              <div className="today">
                {formatLong(base)}
                {overdue > 0 ? `　･　期限を過ぎたタスクが ${overdue} 件あります` : ""}
              </div>
            </div>
          </div>
          {children}
        </main>
      </div>
    </>
  );
}
