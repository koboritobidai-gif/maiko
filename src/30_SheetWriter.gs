/**
 * KPI表への書き込み
 *
 * シート「（新）20244～」の構造:
 *   1行目 … 週開始日（月曜）  ← この行を鍵に列を特定する
 *   2行目 … 週終了日（日曜）
 *   4行目 … 「1週」〜「5週」「計」
 *   5行目 … PV数            （Lステップ外のデータ。触らない）
 *   6行目 … LINE登録人数     ← 書き込む
 *   7行目 … LINE登録率        （数式 =6行/5行。触らない）
 *   8行目 … 面談予約数        ← 書き込む
 *   9行目 … 面談数            ← 書き込む
 *  10行目 … 面談実行率        （数式 =9行/8行。触らない）
 *  11行目 … LINE登録からの面談移行率（数式 =9行/6行。触らない）
 *
 * 「計」列と年間累計列は SUM 数式なので、週列に値を入れれば自動で更新されます。
 */

/**
 * 週開始日 → 列番号 のマップを作る。
 * 1行目に日付が入っている列だけが対象（「計」「入力担当者」列は自然に除外される）。
 */
function buildWeekColumnMap_(sheet) {
  var lastCol = Math.min(sheet.getMaxColumns(), CONFIG.SHEET.maxScanColumn);
  var values = sheet.getRange(CONFIG.SHEET.weekStartRow, 1, 1, lastCol).getValues()[0];

  var map = {};
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    if (Object.prototype.toString.call(v) !== '[object Date]') continue;
    if (isNaN(v.getTime())) continue;
    map[Utilities.formatDate(v, TZ, 'yyyy-MM-dd')] = i + 1; // 1-based
  }
  return map;
}

/**
 * 1週分を書き込む
 * @return {Object} 書き込み結果のレポート
 */
function writeWeek_(sheet, colMap, weekKeyStr, counts, dryRun) {
  var col = colMap[weekKeyStr];
  var report = {
    week: weekKeyStr,
    column: col ? sheet.getRange(1, col).getA1Notation().replace(/\d+$/, '') : null,
    written: [],
    skipped: [],
    error: null
  };

  if (!col) {
    report.error = 'KPI表の1行目に ' + weekKeyStr + ' の列が見つかりません（対象期間外の可能性があります）。';
    return report;
  }

  var targets = [
    { row: CONFIG.SHEET.rows.lineRegistrations, label: 'LINE登録人数', value: counts.registrations },
    { row: CONFIG.SHEET.rows.meetingReserved, label: '面談予約数', value: counts.reserved },
    { row: CONFIG.SHEET.rows.meetingHeld, label: '面談数', value: counts.held }
  ];

  targets.forEach(function (t) {
    // 値を持たない指標は担当外（例: カレンダー由来のデータにLINE登録人数は無い）
    if (t.value === null || t.value === undefined) return;

    var cell = sheet.getRange(t.row, col);
    var current = cell.getValue();
    var isEmpty = (current === '' || current === null);

    if (!isEmpty && !CONFIG.SHEET.overwriteExisting) {
      // 手入力を尊重してスキップ。値が違う場合だけ差分を記録する。
      if (Number(current) !== Number(t.value)) {
        report.skipped.push(t.label + ': シート=' + current + ' / Lステップ=' + t.value + '（既存値を優先）');
      }
      return;
    }

    if (!dryRun) cell.setValue(t.value);
    report.written.push(t.label + '=' + t.value);
  });

  return report;
}

/** 生データ控えシートに週次の集計値を残す */
function appendRawRows_(weekly, dryRun) {
  if (dryRun) return;
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(CONFIG.RAW_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.RAW_SHEET_NAME);
    sh.appendRow(['週開始日(月)', '週終了日(日)', 'LINE登録人数', '面談予約数', '面談数', '取得日時']);
    sh.setFrozenRows(1);
  }

  // 既存行を週開始日で引けるようにしておき、同じ週は上書きする
  var lastRow = sh.getLastRow();
  var index = {};
  if (lastRow > 1) {
    var keys = sh.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i][0];
      if (Object.prototype.toString.call(k) === '[object Date]') {
        k = Utilities.formatDate(k, TZ, 'yyyy-MM-dd');
      }
      index[String(k)] = i + 2;
    }
  }

  var now = new Date();
  Object.keys(weekly).sort().forEach(function (key) {
    var c = weekly[key];
    var start = new Date(key + 'T00:00:00');
    var end = new Date(start.getTime());
    end.setDate(end.getDate() + 6);
    var row = [start, end, c.registrations, c.reserved, c.held, now];

    if (index[key]) {
      // 担当外の指標（null）は、他のルートが書いた既存値を消さないよう温存する
      var existing = sh.getRange(index[key], 1, 1, row.length).getValues()[0];
      for (var col = 2; col <= 4; col++) {
        if (row[col] === null || row[col] === undefined) row[col] = existing[col];
      }
      sh.getRange(index[key], 1, 1, row.length).setValues([row]);
    } else {
      sh.appendRow(row.map(function (v) { return (v === null || v === undefined) ? '' : v; }));
    }
  });
}

/** 実行ログを残す */
function appendLog_(lines) {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(CONFIG.LOG_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.LOG_SHEET_NAME);
    sh.appendRow(['実行日時', '対象週', '結果', '詳細']);
    sh.setFrozenRows(1);
  }
  var now = new Date();
  lines.forEach(function (l) {
    sh.appendRow([now, l.week, l.status, l.detail]);
  });
}
