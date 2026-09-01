import { NextResponse } from "next/server";
import { sendReminders } from "@/lib/reminders";

/**
 * 期限リマインドの定期実行エンドポイント。
 *
 * Vercel Cron や社内のジョブから毎朝叩く想定。
 * CRON_SECRET を設定した場合は Authorization: Bearer <secret> が必要。
 */
export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = request.headers.get("authorization") ?? "";
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const result = await sendReminders();
  return NextResponse.json({
    ok: true,
    sent: result.sent,
    skipped: result.skipped,
    dryRun: result.dryRun,
    recipients: result.recipients,
  });
}
