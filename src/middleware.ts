import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next.js 16 では middleware は非推奨で `proxy` へ改名されているが、`proxy` は
// Node.js ランタイム固定で Edge ランタイムを選択できない。本ミドルウェアは Edge
// ランタイムでの動作が要件のため、Edge ランタイムが選択可能な旧来の `middleware`
// 規約(v16でも動作は維持されている)を意図的に使用している。
// middleware は既定で Edge ランタイム上で実行されるため `runtime` の明示指定は不要
// (`export const runtime` を指定すると通常ページ向けのランタイム検証に引っかかりビルドエラーになる)。

const UNAUTHORIZED_RESPONSE = () =>
  new Response("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Tobidai Cockpit", charset="UTF-8"',
    },
  });

export function middleware(request: NextRequest) {
  const appPassword = process.env.APP_PASSWORD;

  // 未設定ならローカル開発と同じくノーパスワードで通す。
  if (!appPassword) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get("authorization");

  if (authHeader?.startsWith("Basic ")) {
    const base64Credentials = authHeader.slice("Basic ".length).trim();

    try {
      // atob は Edge Runtime で利用可能な Web 標準API(Node専用の Buffer は不使用)。
      const decoded = atob(base64Credentials);
      const separatorIndex = decoded.indexOf(":");
      const password =
        separatorIndex === -1 ? "" : decoded.slice(separatorIndex + 1);

      if (password === appPassword) {
        return NextResponse.next();
      }
    } catch {
      // Base64 のデコードに失敗した場合は未認証として扱う。
    }
  }

  return UNAUTHORIZED_RESPONSE();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
