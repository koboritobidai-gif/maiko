/**
 * 同期の実行本体
 */

/**
 * 指定した週キーの配列を同期する
 * @param {Array<string>} weekKeys 'yyyy-MM-dd'（月曜）の配列
 * @param {boolean} dryRun trueならシートに書き込まず結果だけ返す
 */
function syncWeeks_(weekKeys, dryRun) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) {
    throw new Error('別の同期処理が実行中です。しばらく待ってから再実行してください。');
  }

  try {
    var friends = fetchAllFriends_();
    var weekly = aggregateByWeek_(friends);

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
      var detail = [];
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

    return { friendCount: friends.length, reports: reports };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 前週分を同期する（定期実行のエントリポイント）
 * 既存運用の「毎週月曜日に前週の数字を入力」に合わせています。
 */
function syncLastWeek() {
  var key = Utilities.formatDate(lastWeekStart_(), TZ, 'yyyy-MM-dd');
  return syncWeeks_([key], false);
}

/** 今週分を同期する（速報用。週の途中の値が入ります） */
function syncThisWeek() {
  var key = Utilities.formatDate(weekStartOf_(new Date()), TZ, 'yyyy-MM-dd');
  return syncWeeks_([key], false);
}

/**
 * 期間を指定して過去分をまとめて反映する
 * @param {string} fromStr 'yyyy-MM-dd'
 * @param {string} toStr   'yyyy-MM-dd'
 */
function backfill(fromStr, toStr) {
  var from = new Date(fromStr + 'T00:00:00');
  var to = new Date(toStr + 'T00:00:00');
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    throw new Error('日付は yyyy-MM-dd 形式で指定してください。');
  }
  if (from.getTime() > to.getTime()) {
    throw new Error('開始日が終了日より後になっています。');
  }
  return syncWeeks_(listWeekKeys_(from, to), false);
}

/**
 * 書き込まずに結果だけ確認する（初期検証用）
 * 直近8週分をログに出力します。
 */
function dryRunRecentWeeks() {
  var to = lastWeekStart_();
  var from = new Date(to.getTime());
  from.setDate(from.getDate() - 7 * 7);
  return syncWeeks_(listWeekKeys_(from, to), true);
}
