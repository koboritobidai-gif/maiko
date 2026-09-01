import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions";
import { currentUser } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  if (await currentUser()) redirect("/");
  const { err } = await searchParams;

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div className="login-brand">
          <span className="logo">FAITH</span>
          <div className="brand-sub">株式会社フェース｜タスク管理</div>
        </div>

        {err ? <div className="notice notice-error">{err}</div> : null}

        <form action={loginAction}>
          <div className="field">
            <label htmlFor="email">メールアドレス</label>
            <input id="email" name="email" type="email" autoComplete="username" required />
          </div>
          <div className="field">
            <label htmlFor="password">パスワード</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center" }}
          >
            ログイン
          </button>
        </form>

        <p className="demo-users">
          初期データを投入した直後は <code>npm run seed</code> の出力に表示された
          アカウントでログインできます。
        </p>
      </div>
    </div>
  );
}
