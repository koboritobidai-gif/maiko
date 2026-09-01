import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

/** 一時ファイルの DB を使う。lib/db.ts を読み込む前に指定する必要がある。 */
const dir = mkdtempSync(join(tmpdir(), "maiko-vis-"));
process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;

const { db } = await import("../lib/db.ts");
const { importMinutes } = await import("../lib/importer.ts");
const { listMinutes } = await import("../lib/importer.ts");
const { addMeetingType, listMeetingTypes, visibilityForMeeting } = await import("../lib/meetings.ts");
const { listTasks } = await import("../lib/tasks.ts");

const MEMBER = { role: "member" as const };
const EXECUTIVE = { role: "executive" as const };
const ADMIN = { role: "admin" as const };

before(async () => {
  const client = await db();
  await client.execute({
    sql: `INSERT INTO users (id, name, email, role, department, password_hash, active, created_at)
          VALUES ('u1','髙橋','takahashi@example.co.jp','executive','人事部','x',1,'2026-01-01T00:00:00Z')`,
    args: [],
  });
  await addMeetingType("役員会", "executive");
  await addMeetingType("全体定例MTG", "all");

  await importMinutes({
    source: "manual", externalId: "board", title: "役員会", meetingDate: "2026-09-01",
    url: "", author: "", visibility: "executive",
    body: "【ネクストアクション】\n① 役員報酬テーブルの見直し\nWHO：髙橋さん\n来期案を作成する。\n",
  });
  await importMinutes({
    source: "manual", externalId: "all-hands", title: "全体定例MTG", meetingDate: "2026-09-01",
    url: "", author: "", visibility: "all",
    body: "【ネクストアクション】\n① 説明会の日程確定\nWHO：髙橋さん\n会場を押さえる。\n",
  });
});

after(() => rmSync(dir, { recursive: true, force: true }));

test("役員限定の議事録は社員に見えない", async () => {
  const forMember = await listMinutes(MEMBER);
  const forExecutive = await listMinutes(EXECUTIVE);
  const forAdmin = await listMinutes(ADMIN);

  assert.deepEqual(forMember.map((m) => m.title), ["全体定例MTG"]);
  assert.equal(forExecutive.length, 2);
  assert.equal(forAdmin.length, 2);
});

test("役員限定の議事録から作ったタスクも社員に見えない", async () => {
  const forMember = await listTasks(MEMBER, { status: "all" });
  const forExecutive = await listTasks(EXECUTIVE, { status: "all" });

  assert.ok(!forMember.some((t) => t.title.includes("役員報酬")));
  assert.ok(forMember.some((t) => t.title.includes("説明会")));
  assert.equal(forExecutive.length, 2);
});

test("会議名ごとの既定の公開範囲を引ける", async () => {
  assert.equal(await visibilityForMeeting("役員会"), "executive");
  assert.equal(await visibilityForMeeting("全体定例MTG"), "all");
  // 未登録の会議名は全社員として扱う（誤って役員限定にしないため）。
  assert.equal(await visibilityForMeeting("知らない会議"), "all");
  assert.equal(await visibilityForMeeting(""), "all");
});

test("会議名マスタは登録順に並ぶ", async () => {
  const meetings = await listMeetingTypes();
  assert.deepEqual(meetings.map((m) => m.name), ["役員会", "全体定例MTG"]);
});
