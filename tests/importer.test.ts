import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

/** 一時ファイルの DB を使う。lib/db.ts を読み込む前に指定する必要がある。 */
const dir = mkdtempSync(join(tmpdir(), "maiko-test-"));
process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;

const { db } = await import("../lib/db.ts");
const { importMinutes, matchOwner } = await import("../lib/importer.ts");
const { listTasks, listUsers } = await import("../lib/tasks.ts");

const MINUTES = {
  source: "manual" as const,
  externalId: "test-1",
  title: "商品開発会議",
  meetingDate: "2026-09-01",
  url: "",
  author: "テスト",
  body: `## 共有事項
- 秋冬ラインの試作が完了

## ToDo
- 容器デザイン案を3案作成（担当：田中、期限：9/12）
- [ ] 販促用サンプルの数量を確定 担当:鈴木 期限:来週金曜
- 展示会の出展可否を検討
`,
  visibility: "all" as const,
};

before(async () => {
  const client = await db();
  await client.execute({
    sql: `INSERT INTO users (id, name, email, role, department, password_hash, active, created_at)
          VALUES ('u1','田中 美咲','tanaka@example.co.jp','member','商品開発部','x',1,'2026-01-01T00:00:00Z'),
                 ('u2','鈴木 健一','suzuki@example.co.jp','member','マーケ','x',1,'2026-01-01T00:00:00Z')`,
    args: [],
  });
});

after(() => rmSync(dir, { recursive: true, force: true }));

test("議事録からタスクを作り、担当と期限を埋める", async () => {
  const result = await importMinutes(MINUTES);
  assert.equal(result.created.length, 3);

  const byTitle = new Map(result.created.map((t) => [t.title, t]));
  assert.equal(byTitle.get("容器デザイン案を3案作成")?.ownerName, "田中 美咲");
  assert.equal(byTitle.get("容器デザイン案を3案作成")?.dueDate, "2026-09-12");
  assert.equal(byTitle.get("販促用サンプルの数量を確定")?.ownerName, "鈴木 健一");
  assert.equal(byTitle.get("販促用サンプルの数量を確定")?.dueDate, "2026-09-11");
  // 担当が書かれていない行は未定のまま取り込み、画面で割り当てられるようにする。
  assert.equal(byTitle.get("展示会の出展可否を検討")?.ownerName, "未定");
});

test("同じ議事録を取り込み直してもタスクは増えない", async () => {
  const again = await importMinutes(MINUTES);
  assert.equal(again.created.length, 0);
  assert.equal(again.skipped, 3);

  const tasks = await listTasks({ role: "admin" }, { status: "all" });
  assert.equal(tasks.length, 3);
});

test("議事録に追記された分だけが新しいタスクになる", async () => {
  const updated = { ...MINUTES, body: `${MINUTES.body}- 追加の宿題を整理 担当:田中 期限:9/20\n` };
  const result = await importMinutes(updated);
  assert.equal(result.created.length, 1);
  assert.equal(result.created[0].title, "追加の宿題を整理");

  const tasks = await listTasks({ role: "admin" }, { status: "all" });
  assert.equal(tasks.length, 4);
});

test("取り込んだタスクには出典と元の行が残る", async () => {
  const tasks = await listTasks({ role: "admin" }, { status: "all" });
  const task = tasks.find((t) => t.title === "容器デザイン案を3案作成");
  assert.ok(task);
  assert.equal(task.meetingTitle, "商品開発会議");
  assert.equal(task.meetingDate, "2026-09-01");
  assert.match(task.description, /議事録の記載: .*容器デザイン案/);
  assert.match(task.description, /出典: 手動貼り付け/);
});

test("役員限定の議事録から作るタスクは役員限定になる", async () => {
  await importMinutes({
    ...MINUTES,
    externalId: "test-exec",
    title: "役員会",
    visibility: "executive",
    body: "## ToDo\n- 再編案を精査 担当:田中 期限:9/30\n",
  });
  const forMember = await listTasks({ role: "member" }, { status: "all" });
  const forExec = await listTasks({ role: "executive" }, { status: "all" });
  assert.ok(!forMember.some((t) => t.title === "再編案を精査"));
  assert.ok(forExec.some((t) => t.title === "再編案を精査"));
});

test("担当者名の突き合わせ", async () => {
  const users = await listUsers();
  assert.equal(matchOwner("田中", users)?.name, "田中 美咲");
  assert.equal(matchOwner("田中 美咲", users)?.name, "田中 美咲");
  assert.equal(matchOwner("tanaka", users)?.name, "田中 美咲");
  assert.equal(matchOwner("外部の山田", users), null);
  assert.equal(matchOwner(null, users), null);
});
