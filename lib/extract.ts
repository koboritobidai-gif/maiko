/**
 * 議事録のテキストから「MTGで決まったタスク」を取り出す。
 *
 * 社内の議事録は書式がばらばらなので、次の 2 通りで拾う。
 *   1. 「ToDo」「アクションアイテム」などの見出しの下にある箇条書き
 *   2. 見出しに関係なく、担当（担当:／@）やチェックボックスが付いた行
 * 誤検出は避けきれないため、取り込み前に必ず画面で確認・修正できるようにしている。
 */

export interface ExtractedTask {
  /** タスク名（担当・期限の記述を取り除いたもの） */
  title: string;
  /** 議事録に書かれていた担当者の表記。ユーザーとの突き合わせは呼び出し側で行う */
  ownerHint: string | null;
  /** 解決できた期限（YYYY-MM-DD）。解決できなければ null */
  dueDate: string | null;
  /** 期限として読み取った元の文字列（「来週金曜」など） */
  dueHint: string | null;
  /** high = 担当か期限かチェックボックスがある / medium = 見出しから拾っただけ */
  confidence: "high" | "medium";
  /** 元の行。取り込み後に元表現をたどれるようにする */
  raw: string;
}

/** 「ここから下はタスク」と判断する見出し。 */
const TODO_HEADING =
  /(to\s?do|ｔｏｄｏ|アクション\s?アイテム|アクションプラン|action\s*items?|next\s*steps?|やること|宿題|持ち帰り|タスク|課題と対応)/i;

/** 見出しらしい行（Markdown 見出し・■●【】・末尾コロン）。 */
const HEADING_LINE = /^\s*(?:#{1,6}\s*|[■●◆▼○◎]\s*|【[^】]{1,20}】|\d+[.．]\s*)?(.{1,30}?)\s*[:：]?\s*$/;

const BULLET = /^\s*(?:[-*+・･◦▪▸‣>＞]|\d+[.)．、]|[（(]\d+[）)])\s*/;
const CHECKBOX = /^\s*(?:[-*+]\s*)?\[( |x|X|✓)\]\s*/;

/** 担当者の書き方。 */
const OWNER_PATTERNS: RegExp[] = [
  /[（(]\s*担当者?\s*[:：]?\s*([^）)、,]{1,14}?)\s*[）)]/,
  /担当者?\s*[:：]\s*([^\s、,。／\/（）()【】]{1,14})/,
  /担当者?\s*[はが]?\s*([^\s、,。／\/（）()【】]{1,10})\s*さん/,
  /(?:^|[\s（(【])@([A-Za-z0-9._-]{2,30})/,
  /(?:^|[\s（(【])@([^\s、,。）)】]{1,10})/,
];

/** 期限の書き方。1 つ目に当たったものを採用する。 */
const DUE_PATTERNS: RegExp[] = [
  /[（(]\s*(?:期限|〆切|締切|締め切り|納期)\s*[:：]?\s*([^）)]{1,16}?)\s*[）)]/,
  // 日付そのものを先に見る。"9/10" の "/" を区切りと誤解して "9" だけ拾うのを防ぐ。
  /(?:期限|〆切|締切|締め切り|納期|提出日|due)\s*[:：]?\s*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?|\d{1,2}[-/月]\d{1,2}日?|\d{1,2}日)/,
  /(?:期限|〆切|締切|締め切り|納期|提出日|due)\s*[:：]?\s*([^\s、,。／\/（）()【】]{1,16})/,
  /([0-9]{4}[-/年][0-9]{1,2}[-/月][0-9]{1,2}日?|[0-9]{1,2}[/月][0-9]{1,2}日?)\s*(?:まで|迄)/,
  /(今日|本日|明日|明後日|今週中|今週末|今週[月火水木金土日]曜?日?|来週[月火水木金土日]曜?日?|来週中|来週|再来週|週明け|月末|今月末|来月末|月内)\s*(?:まで|迄)?/,
];

/** 議事録の本文からタスク候補を取り出す。 */
export function extractTasks(
  text: string,
  options: { meetingDate?: string | null } = {},
): ExtractedTask[] {
  const base = options.meetingDate || todayYmd();
  const lines = (text ?? "").replace(/\r\n?/g, "\n").split("\n");

  const results: ExtractedTask[] = [];
  const seen = new Set<string>();
  let inTodoSection = false;

  for (const line of lines) {
    if (!line.trim()) continue;

    const heading = headingText(line);
    if (heading !== null) {
      // 見出し行そのものはタスクにしない。ToDo 見出しなら以降を拾う。
      inTodoSection = TODO_HEADING.test(heading);
      continue;
    }

    const hasCheckbox = CHECKBOX.test(line);
    if (hasCheckbox && /\[(x|X|✓)\]/.test(line)) continue; // 済みのチェックは取り込まない

    const owner = matchFirst(line, OWNER_PATTERNS);
    const due = matchFirst(line, DUE_PATTERNS);
    const bullet = BULLET.test(line) || hasCheckbox;

    // 見出しの下の箇条書き、または担当・期限・チェックボックスが付いた行を候補にする。
    const isCandidate = (inTodoSection && bullet) || hasCheckbox || Boolean(owner) ||
      (bullet && Boolean(due));
    if (!isCandidate) continue;

    const title = cleanTitle(line, [owner?.matched, due?.matched]);
    if (title.length < 3) continue;

    const key = title.replace(/\s+/g, "");
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      title,
      ownerHint: owner ? normalizeOwner(owner.value) : null,
      dueDate: due ? resolveDate(due.value, base) : null,
      dueHint: due ? due.value : null,
      confidence: hasCheckbox || owner || due ? "high" : "medium",
      raw: line.trim(),
    });
  }
  return results;
}

/** 見出し行ならその文言を、そうでなければ null を返す。 */
function headingText(line: string): string | null {
  if (BULLET.test(line) || CHECKBOX.test(line)) return null;
  if (/^\s*#{1,6}\s+/.test(line)) return line.replace(/^\s*#{1,6}\s+/, "").trim();
  if (/^\s*[■●◆▼○◎]/.test(line)) return line.replace(/^\s*[■●◆▼○◎]\s*/, "").trim();
  const bracket = line.match(/^\s*[【\[]([^】\]]{1,20})[】\]]\s*$/);
  if (bracket) return bracket[1].trim();
  // 「ToDo:」のように、短くコロンで終わる行も見出しとして扱う。
  const colon = line.match(/^\s*(.{1,20}?)\s*[:：]\s*$/);
  if (colon) return colon[1].trim();
  const bare = line.match(HEADING_LINE);
  if (bare && TODO_HEADING.test(bare[1]) && bare[1].length <= 14) return bare[1].trim();
  return null;
}

function matchFirst(
  line: string,
  patterns: RegExp[],
): { value: string; matched: string } | null {
  for (const pattern of patterns) {
    const m = line.match(pattern);
    if (m && m[1] && m[1].trim()) {
      return { value: m[1].trim(), matched: m[0] };
    }
  }
  return null;
}

function normalizeOwner(value: string): string {
  return value.replace(/さん$|様$|氏$/, "").trim();
}

/** 行から箇条書き記号・担当・期限の記述を取り除いてタスク名にする。 */
function cleanTitle(line: string, fragments: (string | undefined)[]): string {
  let title = line;
  for (const fragment of fragments) {
    if (fragment) title = title.replace(fragment, " ");
  }
  return title
    .replace(CHECKBOX, "")
    .replace(BULLET, "")
    .replace(/^\s*(?:to\s?do|task|タスク)\s*[:：]\s*/i, "")
    // 担当・期限を抜いた後に残る空の括弧（「（ 、 ）」など）を落とす。
    .replace(/[（(][\s、,・:：\-–—]*[）)]/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s、,。・:：\-–—]+|[\s、,。・:：\-–—]+$/g, "")
    .trim();
}

/* ── 日付の解決 ───────────────────────────────────────── */

const WEEKDAY_INDEX: Record<string, number> = {
  日: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6,
};

function todayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const asDate = (ymd: string) => new Date(`${ymd}T12:00:00Z`);
const asYmd = (d: Date) => d.toISOString().slice(0, 10);

function addDays(ymd: string, days: number): string {
  const d = asDate(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return asYmd(d);
}

function endOfMonth(ymd: string, monthOffset = 0): string {
  const d = asDate(ymd);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + monthOffset + 1);
  d.setUTCDate(0);
  return asYmd(d);
}

/** 次に来る指定曜日。weeksAhead=1 なら「来週の◯曜」。 */
function nextWeekday(ymd: string, weekday: number, weeksAhead: number): string {
  const d = asDate(ymd);
  const delta = (weekday - d.getUTCDay() + 7) % 7 || 7;
  return addDays(ymd, delta + (weeksAhead > 0 ? (weeksAhead - 1) * 7 : 0));
}

/**
 * 「9/10」「9月10日」「来週金曜」「月末」などを YYYY-MM-DD に直す。
 * base は議事録の開催日。年の省略時は base から見て直近の未来日とする。
 */
export function resolveDate(value: string, base: string): string | null {
  const text = value.trim();
  if (!text) return null;

  const full = text.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?$/);
  if (full) return build(Number(full[1]), Number(full[2]), Number(full[3]));

  const md = text.match(/^(\d{1,2})[-/月](\d{1,2})日?$/);
  if (md) {
    const year = asDate(base).getUTCFullYear();
    const candidate = build(year, Number(md[1]), Number(md[2]));
    if (!candidate) return null;
    // 年をまたぐ期限（12月のMTGで1月の期限を切る等）に対応する。
    return candidate < base ? build(year + 1, Number(md[1]), Number(md[2])) : candidate;
  }

  const dayOnly = text.match(/^(\d{1,2})日$/);
  if (dayOnly) {
    const d = asDate(base);
    const candidate = build(d.getUTCFullYear(), d.getUTCMonth() + 1, Number(dayOnly[1]));
    if (!candidate) return null;
    return candidate < base
      ? build(d.getUTCFullYear(), d.getUTCMonth() + 2, Number(dayOnly[1]))
      : candidate;
  }

  if (/^(今日|本日)$/.test(text)) return base;
  if (text === "明日") return addDays(base, 1);
  if (text === "明後日") return addDays(base, 2);
  if (/^(週明け)$/.test(text)) return nextWeekday(base, 1, 1);
  if (/^(今週中|今週末)$/.test(text)) return nextWeekday(base, 5, 1);
  if (/^(月末|今月末|月内)$/.test(text)) return endOfMonth(base);
  if (text === "来月末") return endOfMonth(base, 1);
  if (/^(来週中|来週)$/.test(text)) return nextWeekday(base, 5, 2);
  if (text === "再来週") return addDays(base, 14);

  const weekday = text.match(/^(今週|来週)([日月火水木金土])曜?日?$/);
  if (weekday) {
    return nextWeekday(base, WEEKDAY_INDEX[weekday[2]], weekday[1] === "来週" ? 2 : 1);
  }
  return null;

  function build(year: number, month: number, day: number): string | null {
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(Date.UTC(year, month - 1, day, 12));
    if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
    return asYmd(d);
  }
}
