import { NextResponse } from "next/server";
import { syncAllSources } from "@/lib/importer";

/**
 * 議事録の定期取り込み。
 * メール・Slack・Google ドライブを巡回し、新しい議事録からタスクを作る。
 */
export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = request.headers.get("authorization") ?? "";
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const results = await syncAllSources();
  return NextResponse.json({
    ok: results.every((r) => r.error === null),
    results,
  });
}
