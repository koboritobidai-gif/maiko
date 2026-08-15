/**
 * CSV取り込みルート
 *
 * Lステップ管理画面「友だち管理 > CSV操作 > エクスポート」で出力したCSVを
 * Google ドライブの指定フォルダに置くだけで、集計と転記を自動で行います。
 * CSVエクスポートは全プランで使えるため、API連携オプションが無くても運用できます。
 *
 * 集計と書き込みは API ルートと同じ処理（aggregateByWeek_ / writeWeek_）を
 * そのまま使うので、後からAPIに切り替えても結果は変わりません。
 */

/** 指定フォルダから最新のCSVを1件取得する */
function findLatestCsvFile_() {
  if (!CONFIG.CSV.folderId) {
    throw new Error(
      'CONFIG.CSV.folderId が未設定です。CSVを置くドライブフォルダのIDを設定してください。' +
      '（フォルダを開いたときのURL .../folders/★ここ★ の部分）'
    );
  }

  var folder;
  try {
    folder = DriveApp.getFolderById(CONFIG.CSV.folderId);
  } catch (e) {
    throw new Error('CONFIG.CSV.folderId のフォルダを開けません。IDと共有設定を確認してください。');
  }

  var files = folder.getFiles();
  var latest = null;

  while (files.hasNext()) {
    var f = files.next();
    var name = f.getName();
    if (!/\.csv$/i.test(name)) continue;
    if (CONFIG.CSV.fileNameContains && name.indexOf(CONFIG.CSV.fileNameContains) === -1) continue;
    if (!latest || f.getLastUpdated().getTime() > latest.getLastUpdated().getTime()) {
      latest = f;
    }
  }

  if (!latest) {
    throw new Error(
      'フォルダ内に対象のCSVが見つかりません。' +
      'Lステップからエクスポートしたファイルを置いたか確認してください。'
    );
  }
  return latest;
}

/** 文字化けしていそうかを判定する（U+FFFD の出現で見る） */
function looksGarbled_(text) {
  if (!text) return true;
  var head = text.slice(0, 2000);
  var bad = (head.match(/�/g) || []).length;
  return bad > 3;
}

/** Blobを文字コードを推定しながら文字列化する */
function readCsvText_(file) {
  var blob = file.getBlob();
  var encodings = CONFIG.CSV.encodings;
  var text = null;

  for (var i = 0; i < encodings.length; i++) {
    try {
      var candidate = blob.getDataAsString(encodings[i]);
    } catch (e) {
      continue;
    }
    if (!looksGarbled_(candidate)) {
      text = candidate;
      break;
    }
    if (text === null) text = candidate; // 最後の手段として保持
  }

  if (text === null) throw new Error('CSVを読み取れませんでした: ' + file.getName());
  return text.replace(/^﻿/, ''); // BOM除去
}

/**
 * CSVテキストを、APIレスポンスと同じ形のレコード配列に変換する。
 * ヘッダー名をそのままキーにするので、aggregateByWeek_ の
 * pickField_ / readFriendInfo_（形式C）がそのまま機能します。
 */
function csvToRecords_(text) {
  var rows = Utilities.parseCsv(text);
  var headerIndex = CONFIG.CSV.headerRow - 1;

  if (!rows || rows.length <= headerIndex + 1) {
    throw new Error('CSVにデータ行がありません。');
  }

  var headers = rows[headerIndex].map(function (h) {
    return String(h).replace(/^﻿/, '').trim();
  });

  var records = [];
  for (var r = headerIndex + 1; r < rows.length; r++) {
    var row = rows[r];
    if (!row || row.join('') === '') continue; // 空行は飛ばす

    var rec = {};
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      rec[headers[c]] = row[c] === undefined ? '' : row[c];
    }
    records.push(rec);
  }
  return records;
}

/**
 * CSVから指定週を同期する
 * @param {Array<string>} weekKeys 'yyyy-MM-dd'（月曜）の配列
 * @param {boolean} dryRun
 */
function syncWeeksFromCsv_(weekKeys, dryRun) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) {
    throw new Error('別の同期処理が実行中です。しばらく待ってから再実行してください。');
  }

  try {
    var file = findLatestCsvFile_();
    var records = csvToRecords_(readCsvText_(file));
    Logger.log('CSV「%s」から %s 件を読み込みました。', file.getName(), records.length);

    var weekly = aggregateByWeek_(records);
    var sheet = getKpiSheet_();
    var colMap = buildWeekColumnMap_(sheet);

    var reports = [];
    var rawSubset = {};

    weekKeys.forEach(function (key) {
      var counts = weekly[key] || { registrations: 0, reserved: 0, held: 0 };
      rawSubset[key] = counts;
      reports.push(writeWeek_(sheet, colMap, key, counts, dryRun));
    });

    appendRawRows_(rawSubset, dryRun);

    var logLines = reports.map(function (r) {
      var detail = ['CSV: ' + file.getName()];
      if (r.column) detail.push('列' + r.column);
      if (r.written.length) detail.push('書込: ' + r.written.join(' / '));
      if (r.skipped.length) detail.push('スキップ: ' + r.skipped.join(' / '));
      if (r.error) detail.push('エラー: ' + r.error);
      return {
        week: r.week,
        status: r.error ? 'NG' : (dryRun ? 'DRY-RUN' : 'OK'),
        detail: detail.join(' | ')
      };
    });

    if (!dryRun) appendLog_(logLines);
    logLines.forEach(function (l) { Logger.log('[%s] %s %s', l.status, l.week, l.detail); });

    return { friendCount: records.length, source: file.getName(), reports: reports };
  } finally {
    lock.releaseLock();
  }
}

/** CSVから前週分を反映（定期実行のエントリポイント） */
function syncLastWeekFromCsv() {
  var key = Utilities.formatDate(lastWeekStart_(), TZ, 'yyyy-MM-dd');
  return syncWeeksFromCsv_([key], false);
}

/** CSVから期間を指定して反映 */
function backfillFromCsv(fromStr, toStr) {
  var from = new Date(fromStr + 'T00:00:00');
  var to = new Date(toStr + 'T00:00:00');
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    throw new Error('日付は yyyy-MM-dd 形式で指定してください。');
  }
  return syncWeeksFromCsv_(listWeekKeys_(from, to), false);
}

/**
 * CSVの列名を確認する。
 * 最新CSVのヘッダーと1行目の中身、自動マッピング結果をログに出します。
 */
function diagnoseCsv() {
  var file = findLatestCsvFile_();
  var records = csvToRecords_(readCsvText_(file));

  Logger.log('--- 対象ファイル: %s（%s 行） ---', file.getName(), records.length);
  if (!records.length) return;

  Logger.log('--- 列名 ---');
  Logger.log(Object.keys(records[0]).join(', '));

  Logger.log('--- 自動マッピング結果（1行目） ---');
  var rec = records[0];
  Logger.log('登録日時 -> %s', pickField_(rec, CONFIG.FIELDS.createdAt));
  Logger.log('ステータス -> %s', pickField_(rec, CONFIG.FIELDS.status));
  Logger.log('「%s」 -> %s', CONFIG.MEETING.reservedDateFieldName,
    readFriendInfo_(rec, CONFIG.MEETING.reservedDateFieldName));
  Logger.log('「%s」 -> %s', CONFIG.MEETING.heldDateFieldName,
    readFriendInfo_(rec, CONFIG.MEETING.heldDateFieldName));

  var weekly = aggregateByWeek_(records);
  var keys = Object.keys(weekly).sort().slice(-8);
  Logger.log('--- 直近の週次集計 ---');
  keys.forEach(function (k) {
    var c = weekly[k];
    Logger.log('%s  登録=%s 予約=%s 面談=%s', k, c.registrations, c.reserved, c.held);
  });
}
