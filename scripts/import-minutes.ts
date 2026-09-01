/**
 * 議事録のファイルを取り込む。
 *
 *   npm run import -- minutes/2026-09-01-経営戦略会議.md
 *   npm run import -- minutes/*.md --date 2026-09-01
 *
 * PLAUD などで作った要約をテキスト／Markdown で書き出したものをそのまま渡せる。
 * 1 行目が「# タイトル」ならそれを議事録名にする（--title で上書き可）。
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { importMinutes } from "../lib/importer.ts";
import { listUsers } from "../lib/tasks.ts";

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? (process.argv[index + 1] ?? null) : null;
}

/** ファイル名「2026-09-01-経営戦略会議.md」から日付とタイトルを読む。 */
function fromFilename(path: string): { date: string | null; title: string } {
  const name = basename(path).replace(/\.(md|txt|markdown)$/i, "");
  const m = name.match(/^(\d{4}-\d{2}-\d{2})[-_ ](.+)$/);
  return m ? { date: m[1], title: m[2] } : { date: null, title: name };
}

async function main(): Promise<void> {
  const files = process.argv.slice(2).filter((arg) => !arg.startsWith("--") && !arg.match(/^\d{4}-\d{2}-\d{2}$/));
  if (!files.length) {
    console.error("使い方: npm run import -- <議事録ファイル> [--date YYYY-MM-DD] [--title タイトル] [--exec]");
    process.exitCode = 1;
    return;
  }

  const users = await listUsers();
  for (const file of files) {
    const body = readFileSync(file, "utf8");
    const guessed = fromFilename(file);
    const heading = body.match(/^\s*#\s+(.+)$/m);

    const result = await importMinutes(
      {
        source: "manual",
        externalId: `file:${basename(file)}`,
        title: flag("title") ?? heading?.[1].trim() ?? guessed.title,
        meetingDate: flag("date") ?? guessed.date,
        url: "",
        author: "",
        body,
        visibility: process.argv.includes("--exec") ? "executive" : "all",
      },
      { users },
    );

    console.log(`\n■ ${result.minutesTitle}（${file}）`);
    console.log(`  作成 ${result.created.length}件 / 登録済みのため見送り ${result.skipped}件`);
    for (const task of result.created) {
      console.log(
        `  ${task.code}  ${task.title}\n        担当: ${task.ownerName} / 期限: ${task.dueDate ?? "未設定"}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
