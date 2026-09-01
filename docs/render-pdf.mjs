/**
 * 「権限設計とアカウント一覧」の PDF を作る。
 *
 *   npm run doc:accounts -- data/initial-passwords.json
 *
 * 初期パスワードは平文なのでリポジトリには置かず、JSON から差し込む。
 * JSON を省略した場合は伏せ字（********）で出力する。
 */

import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";

const TEMPLATE = "docs/account-sheet.html";
const OUTPUT = process.env.OUTPUT ?? "フェース_権限設計とアカウント一覧.pdf";

const passwordFile = process.argv[2];
const passwords = passwordFile ? JSON.parse(readFileSync(passwordFile, "utf8")) : {};

const today = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
  day: "numeric",
}).format(new Date());

const html = readFileSync(TEMPLATE, "utf8").replace(
  /\{\{(\w+)\}\}/g,
  (_, key) => (key === "date" ? today : (passwords[key] ?? "********")),
);

// file:// で読み込ませたいので、いったん一時ファイルへ書き出す。
const temp = join(tmpdir(), `account-sheet-${process.pid}.html`);
writeFileSync(temp, html, "utf8");

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
try {
  const page = await browser.newPage();
  await page.goto(`file://${temp}`, { waitUntil: "networkidle" });
  await page.pdf({
    path: OUTPUT,
    format: "A4",
    printBackground: true,
    margin: { top: "13mm", bottom: "15mm", left: "15mm", right: "15mm" },
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate:
      '<div style="width:100%;font-size:8px;color:#9a9a9a;padding:0 15mm;text-align:right;font-family:sans-serif">' +
      '<span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  });
} finally {
  await browser.close();
  unlinkSync(temp);
}

console.log(`${OUTPUT} を出力しました。`);
