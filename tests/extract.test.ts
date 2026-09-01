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

/* ── PLAUD などの要約でよく使われる、番号付き＋WHO/WHAT 形式 ── */

test("ネクストアクション形式（① / WHO / WHAT）を1タスクとして拾う", () => {
  const tasks = run(`
【決定事項】

1. 九州支社は現オフィスを解約し、アークビルへ移転する前提で進める。

【ネクストアクション】
① 九州支社移転

* WHO：文字さん＋友井さん
* WHAT：引越費用・原状回復費の正式見積を取得し、年間固定費削減額と合わせて最終判断する。

② 楽楽精算の全社電子化

* WHO：川村さん
* WHAT：10月1日の全体導入に向け、9月中に差戻し・申請不備を分析し、運用ルールとマニュアルを完成させる。
`);
  assert.equal(tasks.length, 2);

  assert.equal(tasks[0].title, "九州支社移転");
  assert.equal(tasks[0].ownerHint, "文字");
  assert.deepEqual(tasks[0].participants, ["友井"]);
  assert.match(tasks[0].detail, /正式見積を取得/);

  assert.equal(tasks[1].ownerHint, "川村");
  // 「10月1日の全体導入に向け」は開始時期なので期限にせず、「9月中に」を期限にする。
  assert.equal(tasks[1].dueDate, "2026-09-30");
});

test("WHATの見出しが無く、WHOの下に本文が続く形式にも対応する", () => {
  const tasks = run(`
【ネクストアクション】
① 評価制度の新フォーマット作成・共有
WHO：髙橋さん
新しい成果評価表について、評価項目・点数基準を含めた原案を作成し、各部門へ共有する。
`);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, "評価制度の新フォーマット作成・共有");
  assert.equal(tasks[0].ownerHint, "髙橋");
  assert.match(tasks[0].detail, /原案を作成/);
});

test("決定事項の番号付き箇条書きはタスクにしない", () => {
  const tasks = run(`
【決定事項】

1. 九州支社は現オフィスを解約し、アークビルへ移転する前提で進める。
2. 梱包・同梱物の過剰品質を見直す。
`);
  assert.equal(tasks.length, 0);
});

test("「10月以降の運用を目指す」は期限として扱わない", () => {
  const tasks = run(`
【ネクストアクション】
① 新規取引基準の策定
* WHO：近安さん
* WHAT：新規取引基準を策定し、10月以降の運用を目指す。
`);
  assert.equal(tasks[0].dueDate, null);
});

test("9月末で解約、のような表現を期限として読む", () => {
  const tasks = run(`
【ネクストアクション】
① 外部相談窓口の解約
* WHO：髙橋さん
* WHAT：利用件数と費用対効果を踏まえ、9月末で解約手続きを行う。
`);
  assert.equal(tasks[0].dueDate, "2026-09-30");
});

test("決定事項に日付が含まれていてもタスクにしない", () => {
  const tasks = run(`
【決定事項】

* 外部相談窓口「アンリ」は利用実績が少ないため、9月末で解約する方向とする。
* 新評価制度の開始時期は10月に固執せず、現場への影響を確認したうえで最終決定する。

【ネクストアクション】
① 外部相談窓口「アンリ」の解約
WHO：髙橋さん
9月末で解約手続きを行う。
`);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, "外部相談窓口「アンリ」の解約");
  assert.equal(tasks[0].dueDate, "2026-09-30");
});
