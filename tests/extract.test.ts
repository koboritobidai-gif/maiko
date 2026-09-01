import assert from "node:assert/strict";
import { test } from "node:test";
import { extractTasks, resolveDate } from "../lib/extract.ts";

/** 2026-09-01(火) を議事録の開催日として固定する。 */
const BASE = "2026-09-01";
const run = (text: string) => extractTasks(text, { meetingDate: BASE });

test("ToDo見出しの下の箇条書きを拾う", () => {
  const tasks = run(`
# 全体定例MTG 議事録
参加者：長野、田中、鈴木

## 共有事項
- 9月の売上は前月比+8%
- 大阪ショールームの来場者が増加

## ToDo
- 新美容液の販促スケジュール案を作成（担当：鈴木、期限：9/10）
- サロン向け説明会の日程確定 担当:中村 期限:9月8日
- [ ] OEM先の品質監査レポートを共有 @田中 期限 9/5
`);
  assert.equal(tasks.length, 3);
  assert.equal(tasks[0].title, "新美容液の販促スケジュール案を作成");
  assert.equal(tasks[0].ownerHint, "鈴木");
  assert.equal(tasks[0].dueDate, "2026-09-10");
  assert.equal(tasks[1].ownerHint, "中村");
  assert.equal(tasks[1].dueDate, "2026-09-08");
  assert.equal(tasks[2].ownerHint, "田中");
  assert.equal(tasks[2].dueDate, "2026-09-05");
  assert.ok(tasks.every((t) => t.confidence === "high"));
});

test("共有事項の箇条書きはタスクにしない", () => {
  const tasks = run(`
## 共有事項
- 9月の売上は前月比+8%
`);
  assert.equal(tasks.length, 0);
});

test("見出しが無くても担当が書かれた行は拾う", () => {
  const tasks = run("会議中に決定。ECサイトの定期購入プラン改定を検討 担当：佐藤");
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].ownerHint, "佐藤");
  assert.equal(tasks[0].title, "会議中に決定。ECサイトの定期購入プラン改定を検討");
});

test("チェック済みの項目は取り込まない", () => {
  const tasks = run(`
【アクションアイテム】
- [x] 先週分の請求書送付
- [ ] 今月分の請求書送付 担当:佐藤
`);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, "今月分の請求書送付");
});

test("相対的な期限表現を開催日から解決する", () => {
  const tasks = run(`
アクションアイテム:
・研修プログラムの改訂案をまとめる 担当:中村 期限:来週金曜
・見積もりを3社から取得 担当:佐藤 期限:今週中
・役員報酬案の作成 担当:小堀 期限:月末
`);
  assert.equal(tasks[0].dueDate, "2026-09-11"); // 来週の金曜
  assert.equal(tasks[1].dueDate, "2026-09-04"); // 今週の金曜
  assert.equal(tasks[2].dueDate, "2026-09-30"); // 月末
});

test("期限が読み取れない行も担当があれば取り込む", () => {
  const tasks = run("- 秋冬ラインの処方最終確認 担当:田中");
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].dueDate, null);
  assert.equal(tasks[0].dueHint, null);
});

test("ToDo見出しだけで担当も期限も無い行は medium にする", () => {
  const tasks = run(`
## やること
- 展示会の出展可否を検討
`);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].confidence, "medium");
  assert.equal(tasks[0].ownerHint, null);
});

test("同じ内容の行は1件にまとめる", () => {
  const tasks = run(`
## ToDo
- 請求書の送付 担当:佐藤
- 請求書の送付 担当:佐藤
`);
  assert.equal(tasks.length, 1);
});

test("メール本文の引用や署名で誤検出しない", () => {
  const tasks = run(`
お疲れさまです。本日の議事録を送ります。

■ 決定事項
売上目標は据え置き。

■ ToDo
・販促案の作成 担当:鈴木 期限:9/10

--
株式会社フェース 経営企画部
`);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, "販促案の作成");
});

test("年をまたぐ期限は翌年として解決する", () => {
  assert.equal(resolveDate("1/15", "2026-12-20"), "2027-01-15");
  assert.equal(resolveDate("2026-09-10", BASE), "2026-09-10");
  assert.equal(resolveDate("2月30日", BASE), null);
});
