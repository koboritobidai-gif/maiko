/**
 * POST /api/companies — 企業・求人ページの書き込みエンドポイント。
 * action: "updateStatus"(送客可能企業リストの状態変更) | "append"(新規企業の追加)。
 * 求人マトリックスは読み取り専用のため、このエンドポイントからは書き込まない。
 */
import { NextResponse } from "next/server";
import { appendCompany, updateCompanyStatus } from "@/lib/adapters/company-directory";
import { clearCompanyDataCache } from "@/lib/company-data";

const VALID_STATUSES = ["募集中", "募集停止"];

interface UpdateStatusBody {
  action: "updateStatus";
  rowNumber?: unknown;
  expectedCompanyName?: unknown;
  status?: unknown;
}

interface AppendBody {
  action: "append";
  companyName?: unknown;
  status?: unknown;
  ra?: unknown;
  region?: unknown;
  industry?: unknown;
  jobType?: unknown;
  memo?: unknown;
}

function optionalString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

async function handleUpdateStatus(body: UpdateStatusBody) {
  const rowNumber = typeof body.rowNumber === "number" ? body.rowNumber : Number(body.rowNumber);
  const expectedCompanyName = typeof body.expectedCompanyName === "string" ? body.expectedCompanyName.trim() : "";
  const status = typeof body.status === "string" ? body.status.trim() : "";

  if (!Number.isFinite(rowNumber) || rowNumber < 2) {
    return NextResponse.json({ error: "rowNumber が不正です。" }, { status: 400 });
  }
  if (!expectedCompanyName) {
    return NextResponse.json({ error: "expectedCompanyName は必須です。" }, { status: 400 });
  }
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status は ${VALID_STATUSES.join("/")} のいずれかで指定してください。` },
      { status: 400 },
    );
  }

  try {
    await updateCompanyStatus({ rowNumber, expectedCompanyName, status });
    clearCompanyDataCache();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/companies] 状態更新に失敗しました:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "状態の更新に失敗しました。" },
      { status: 502 },
    );
  }
}

async function handleAppend(body: AppendBody) {
  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
  if (!companyName) {
    return NextResponse.json({ error: "企業名は必須です。" }, { status: 400 });
  }
  const status = optionalString(body.status) ?? "募集中";
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status は ${VALID_STATUSES.join("/")} のいずれかで指定してください。` },
      { status: 400 },
    );
  }

  try {
    await appendCompany({
      companyName,
      status,
      ra: optionalString(body.ra),
      region: optionalString(body.region),
      industry: optionalString(body.industry),
      jobType: optionalString(body.jobType),
      memo: optionalString(body.memo),
    });
    clearCompanyDataCache();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/companies] 企業追加に失敗しました:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "企業の追加に失敗しました。" },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  let body: UpdateStatusBody | AppendBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエストボディが不正です。" }, { status: 400 });
  }

  if (body.action === "updateStatus") return handleUpdateStatus(body);
  if (body.action === "append") return handleAppend(body);
  return NextResponse.json({ error: "action は updateStatus または append を指定してください。" }, { status: 400 });
}
