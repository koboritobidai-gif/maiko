/**
 * Apps Script のロジックを Node 上で検証するテストハーネス。
 *
 *   TZ=Asia/Tokyo node test/run_tests.js
 *
 * GAS 固有API（Utilities / Logger / ScriptApp など）をスタブし、
 * src/ の純ロジック（週計算・日付パース・集計・列マッピング）を検証します。
 * 実際のKPI表から書き出した週列マップ（test/fixtures/weekmap.json）と
 * 突き合わせ、週開始日→列の対応が崩れていないことも確認します。
 */

process.env.TZ = process.env.TZ || 'Asia/Tokyo';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ── GAS API のスタブ ────────────────────────────────────────
function pad(n, len) {
  return String(n).padStart(len, '0');
}

const Utilities = {
  formatDate(date, tz, fmt) {
    const map = {
      yyyy: pad(date.getFullYear(), 4),
      MM: pad(date.getMonth() + 1, 2),
      dd: pad(date.getDate(), 2),
      HH: pad(date.getHours(), 2),
      mm: pad(date.getMinutes(), 2),
      ss: pad(date.getSeconds(), 2)
    };
    return fmt.replace(/yyyy|MM|dd|HH|mm|ss/g, (m) => map[m]);
  },
  sleep() {},
  // Utilities.parseCsv 相当（引用符・改行入りフィールドに対応）
  parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
        } else field += ch;
        continue;
      }
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (ch !== '\r') field += ch;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }
};

const Logger = { log: () => {} };

const ScriptApp = {
  WeekDay: { MONDAY: 'MONDAY' },
  getProjectTriggers: () => [],
  newTrigger: () => { throw new Error('not used in tests'); }
};

const sandbox = {
  Utilities,
  Logger,
  ScriptApp,
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'dummy-token' }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => null },
  UrlFetchApp: {},
  LockService: {},
  console,
  Object,
  Array,
  Date,
  Number,
  String,
  Math,
  JSON,
  isNaN,
  RegExp
};
vm.createContext(sandbox);

const SRC = path.join(__dirname, '..', 'src');
['00_Config.gs', '20_Aggregator.gs', '60_CsvImport.gs'].forEach((f) => {
  vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), sandbox, { filename: f });
});

// buildWeekColumnMap_ はシートAPIに依存するので、同じ規則をここで再現して検証する
function buildWeekColumnMapFromRow(row1Values) {
  const map = {};
  row1Values.forEach((v, i) => {
    if (Object.prototype.toString.call(v) !== '[object Date]') return;
    if (isNaN(v.getTime())) return;
    map[Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd')] = i + 1;
  });
  return map;
}

// ── ミニテストランナー ──────────────────────────────────────
let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failures.push(`${name}\n    期待: ${e}\n    実際: ${a}`);
  }
}

// ── 1. 週の境界（月曜始まり・日曜終わり） ──────────────────
const weekStartOf_ = sandbox.weekStartOf_;
const weekKey_ = sandbox.weekKey_;
const listWeekKeys_ = sandbox.listWeekKeys_;

check('月曜はその週の開始', weekKey_(new Date(2026, 7, 3)), '2026-08-03');
check('木曜は同じ週の月曜へ', weekKey_(new Date(2026, 7, 6)), '2026-08-03');
check('日曜は同じ週の月曜へ（週跨ぎ誤りが起きやすい箇所）', weekKey_(new Date(2026, 7, 9)), '2026-08-03');
check('次の月曜は次週', weekKey_(new Date(2026, 7, 10)), '2026-08-10');
check('年跨ぎ 2026-01-01(木)', weekKey_(new Date(2026, 0, 1)), '2025-12-29');
check('深夜の時刻付きでも同じ週', weekKey_(new Date(2026, 7, 9, 23, 59, 59)), '2026-08-03');

check('週キー列挙', listWeekKeys_(new Date(2026, 6, 8), new Date(2026, 7, 5)),
  ['2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27', '2026-08-03']);
check('同一週なら1件', listWeekKeys_(new Date(2026, 7, 4), new Date(2026, 7, 7)), ['2026-08-03']);

// ── 2. 日付パース ───────────────────────────────────────────
const parseDate_ = sandbox.parseDate_;
const d = (v) => (v ? Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd') : null);

check('ISO8601', d(parseDate_('2026-08-05T13:04:00+09:00')), '2026-08-05');
check('スペース区切り', d(parseDate_('2026-08-05 13:04:00')), '2026-08-05');
check('スラッシュ区切り', d(parseDate_('2026/08/05')), '2026-08-05');
check('日付のみ', d(parseDate_('2026-08-05')), '2026-08-05');
check('和暦表記でない日本語形式', d(parseDate_('2026年8月5日')), '2026-08-05');
check('Dateオブジェクト', d(parseDate_(new Date(2026, 7, 5))), '2026-08-05');
check('空文字はnull', parseDate_(''), null);
check('nullはnull', parseDate_(null), null);
check('解釈不能な文字列はnull', parseDate_('未定'), null);

// ── 3. 集計 ─────────────────────────────────────────────────
const aggregateByWeek_ = sandbox.aggregateByWeek_;
sandbox.CONFIG.MEETING.mode = 'dateField';

const friends = [
  // 8/3週に登録、同じ週に予約と面談
  { 作成日時: '2026-08-03 10:00:00', 表示ステータス: 'normal', 友だち情報: { 面談予約日: '2026-08-04', 面談実施日: '2026-08-06' } },
  // 8/3週に登録、予約のみ（面談は未実施）
  { 作成日時: '2026-08-09 23:30:00', 表示ステータス: 'normal', 友だち情報: { 面談予約日: '2026-08-09' } },
  // 8/3週に登録したがブロック済み → 登録人数には含める
  { 作成日時: '2026-08-05', 表示ステータス: 'block', 友だち情報: {} },
  // 7/27週に登録し、面談は 8/3週に実施 → 週をまたぐケース
  { 作成日時: '2026-07-28', 表示ステータス: 'normal', 友だち情報: { 面談予約日: '2026-07-30', 面談実施日: '2026-08-05' } },
  // 友だち情報が配列形式のレスポンスにも対応できること
  {
    作成日時: '2026-08-06',
    表示ステータス: 'normal',
    友だち情報: [{ name: '面談予約日', value: '2026-08-07' }, { name: '面談実施日', value: '' }]
  }
];

const agg = aggregateByWeek_(friends);
check('8/3週 LINE登録人数', agg['2026-08-03'].registrations, 4);
check('8/3週 面談予約数', agg['2026-08-03'].reserved, 3);
check('8/3週 面談数（前週登録者の面談も実施週で計上）', agg['2026-08-03'].held, 2);
check('7/27週 LINE登録人数', agg['2026-07-27'].registrations, 1);
check('7/27週 面談予約数', agg['2026-07-27'].reserved, 1);
check('7/27週 面談数', agg['2026-07-27'].held, 0);

// 除外ステータスの設定が効くこと
const defaultStatuses = sandbox.CONFIG.COUNT_STATUSES;
sandbox.CONFIG.COUNT_STATUSES = ['normal'];
const aggNormalOnly = aggregateByWeek_(friends);
check('ブロックを除外した場合の登録人数', aggNormalOnly['2026-08-03'].registrations, 3);
sandbox.CONFIG.COUNT_STATUSES = defaultStatuses;
check('既定のステータスにCSVの日本語表記が含まれる',
  ['normal', '有効', 'ブロック'].every((s) => defaultStatuses.indexOf(s) !== -1), true);

// タグモード
sandbox.CONFIG.MEETING.mode = 'tag';
const tagFriends = [
  { 作成日時: '2026-08-03', タグ: ['面談予約済み', '面談実施済み'] },
  { 作成日時: '2026-08-04', タグ: [{ name: '面談予約済み' }] },
  { 作成日時: '2026-08-05', タグ: [] }
];
const aggTag = aggregateByWeek_(tagFriends);
check('タグモード 登録人数', aggTag['2026-08-03'].registrations, 3);
check('タグモード 予約数', aggTag['2026-08-03'].reserved, 2);
check('タグモード 面談数', aggTag['2026-08-03'].held, 1);
sandbox.CONFIG.MEETING.mode = 'dateField';

// ── 4. CSV取り込み ──────────────────────────────────────────
const csvToRecords_ = sandbox.csvToRecords_;
const looksGarbled_ = sandbox.looksGarbled_;

const csv = [
  '友だち登録日時,表示名,ステータス,面談予約日,面談実施日',
  '2026-08-03 10:00:00,山田 太郎,有効,2026-08-04,2026-08-06',
  '2026-08-09 23:30:00,"佐藤, 花子",有効,2026-08-09,',
  '2026-08-05 09:00:00,鈴木 一郎,ブロック,,',
  '2026-07-28 12:00:00,高橋 次郎,有効,2026-07-30,2026-08-05',
  '',
  '2026-08-06 08:00:00,田中 三郎,有効,2026-08-07,'
].join('\n');

const csvRecords = csvToRecords_(csv);
check('CSV行数（空行を除く）', csvRecords.length, 5);
check('引用符内のカンマを保持', csvRecords[1]['表示名'], '佐藤, 花子');
check('CSVヘッダーがキーになる', csvRecords[0]['友だち登録日時'], '2026-08-03 10:00:00');

const csvAgg = aggregateByWeek_(csvRecords);
check('CSV 8/3週 LINE登録人数', csvAgg['2026-08-03'].registrations, 4);
check('CSV 8/3週 面談予約数', csvAgg['2026-08-03'].reserved, 3);
check('CSV 8/3週 面談数', csvAgg['2026-08-03'].held, 2);
check('CSV 7/27週 LINE登録人数', csvAgg['2026-07-27'].registrations, 1);
check('CSV 7/27週 面談数は0（実施は8/3週）', csvAgg['2026-07-27'].held, 0);
check('APIルートとCSVルートで結果が一致', csvAgg['2026-08-03'], agg['2026-08-03']);

// BOM付きヘッダーでも列名が壊れないこと
const bomRecords = csvToRecords_('﻿友だち登録日時,ステータス\n2026-08-03,有効');
check('BOM付きCSVのヘッダー', Object.keys(bomRecords[0])[0], '友だち登録日時');

check('文字化け検出（正常）', looksGarbled_('友だち登録日時,表示名'), false);
check('文字化け検出（化けている）', looksGarbled_('�����,����'), true);

// ── 5. 実KPI表の週列マップとの突き合わせ ────────────────────
const fixturePath = path.join(__dirname, 'fixtures', 'weekmap.json');
if (fs.existsSync(fixturePath)) {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const row1 = [];
  Object.keys(fixture).forEach((key) => {
    const info = fixture[key];
    row1[info.col - 1] = new Date(key + 'T00:00:00');
  });
  const map = buildWeekColumnMapFromRow(row1);

  check('週列マップの件数', Object.keys(map).length, Object.keys(fixture).length);

  let mismatched = [];
  let notMonday = [];
  let badEnd = [];
  Object.keys(fixture).forEach((key) => {
    if (map[key] !== fixture[key].col) mismatched.push(key);
    if (new Date(key + 'T00:00:00').getDay() !== 1) notMonday.push(key);
    const end = new Date(fixture[key].end + 'T00:00:00');
    const start = new Date(key + 'T00:00:00');
    if ((end - start) / 86400000 !== 6) badEnd.push(key);
  });
  check('全週で列が一致', mismatched, []);
  check('全週の開始日が月曜', notMonday, []);
  check('全週の終了日が開始+6日', badEnd, []);

  // 実運用の入り口: 前週キーが必ず表内の列に解決できること
  const sample = new Date(2026, 7, 12); // 2026-08-12(水) に実行した想定
  const lastWeek = weekStartOf_(sample);
  lastWeek.setDate(lastWeek.getDate() - 7);
  const lastWeekKey = Utilities.formatDate(lastWeek, 'Asia/Tokyo', 'yyyy-MM-dd');
  check('前週キーが列に解決できる', !!map[lastWeekKey], true);
  check('前週キーの列がKPI表と一致', map[lastWeekKey], fixture[lastWeekKey].col);
} else {
  failures.push('fixtures/weekmap.json が見つかりません（実表との突き合わせをスキップ）');
}

// ── 結果 ────────────────────────────────────────────────────
console.log(`\n合格: ${passed} 件`);
if (failures.length) {
  console.log(`不合格: ${failures.length} 件\n`);
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('すべてのテストに合格しました。\n');
