/**
 * LINE公式アカウント 統計情報API ルート（費用ゼロ・完全自動）
 *
 * LINE公式アカウントの Messaging API には友だち数の統計を返すエンドポイントがあり、
 * 追加料金なしで使えます（Lステップのオプション契約は不要）。
 *
 *   GET https://api.line.me/v2/bot/insight/followers?date=yyyyMMdd
 *   → { status, followers, targetedReaches, blocks }
 *
 * ただし返るのは「その日時点の友だち数」であって「その日の新規登録数」ではありません。
 * そのため LINE登録人数 は次の近似で求めます。
 *
 *   週の新規登録数 ≒ (followers + blocks) の週末値 − 週初前日値
 *
 * followers はブロック中を除いた友だち数、blocks はブロック数なので、
 * その合計は「これまでに追加された延べ人数」に近い値になります。
 * 友だちが自分で削除した分は追えないため、実数よりわずかに小さく出ることがあります。
 * 正確な実数が必要な場合はLステップのAPI連携（有料）かCSVを使ってください。
 *
 * ★注意: 統計の反映には最大3日かかります。前週日曜のデータが揃うのは水曜頃なので、
 *   自動実行は木曜（定例MTG前）に設定するのが安全です。
 */

var LINE_INSIGHT_ENDPOINT = 'https://api.line.me/v2/bot/insight/followers';

/**
 * 指定日の統計を取得する
 * @return {Object|null} { followers, blocks } 未集計なら null
 */
function fetchLineFollowers_(date) {
  var token = getProp_('LINE_CHANNEL_ACCESS_TOKEN', true);
  var ymd = Utilities.formatDate(date, TZ, 'yyyyMMdd');

  var res = UrlFetchApp.fetch(LINE_INSIGHT_ENDPOINT + '?date=' + ymd, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var text = res.getContentText();

  if (code === 401 || code === 403) {
    throw new Error(
      'LINE Messaging APIの認証に失敗しました（HTTP ' + code + '）。' +
      'スクリプトプロパティ LINE_CHANNEL_ACCESS_TOKEN を確認してください。' +
      'トークンは LINE Developers コンソールの対象チャネル > Messaging API設定 で発行します。応答: ' + text.slice(0, 200)
    );
  }
  if (code !== 200) {
    throw new Error('LINE統計APIエラー HTTP ' + code + ': ' + text.slice(0, 200));
  }

  var json = JSON.parse(text);
  // status: ready / unready（集計中） / out_of_service（対象日にアカウントが無い）
  if (json.status !== 'ready') {
    Logger.log('%s の統計はまだ利用できません（status=%s）', ymd, json.status);
    return null;
  }
  return { followers: Number(json.followers || 0), blocks: Number(json.blocks || 0) };
}

/** 延べ追加人数の近似値（followers + blocks） */
function cumulativeAdds_(date) {
  var v = fetchLineFollowers_(date);
  return v ? v.followers + v.blocks : null;
}

/**
 * 指定週のLINE登録人数（近似）を求める
 * @param {string} weekKeyStr 'yyyy-MM-dd'（月曜）
 * @return {number|null} 取得できなければ null
 */
function estimateWeeklyRegistrations_(weekKeyStr) {
  var start = new Date(weekKeyStr + 'T00:00:00');

  var baseline = new Date(start.getTime());
  baseline.setDate(baseline.getDate() - 1); // 週初の前日（前週日曜）

  var end = new Date(start.getTime());
  end.setDate(end.getDate() + 6);           // 週末（日曜）

  var before = cumulativeAdds_(baseline);
  var after = cumulativeAdds_(end);

  if (before === null || after === null) {
    Logger.log('%s 週は統計が未確定のため算出できません（反映に最大3日かかります）。', weekKeyStr);
    return null;
  }
  return Math.max(0, after - before);
}

/**
 * LINE統計から指定週のLINE登録人数をKPI表に反映する
 */
function syncWeeksFromLineInsight_(weekKeys, dryRun) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) {
    throw new Error('別の同期処理が実行中です。しばらく待ってから再実行してください。');
  }

  try {
    var sheet = getKpiSheet_();
    var colMap = buildWeekColumnMap_(sheet);

    var reports = [];
    var rawSubset = {};

    weekKeys.forEach(function (key) {
      var counts = {
        registrations: estimateWeeklyRegistrations_(key),
        reserved: null,
        held: null
      };
      rawSubset[key] = counts;
      reports.push(writeWeek_(sheet, colMap, key, counts, dryRun));
    });

    appendRawRows_(rawSubset, dryRun);

    var logLines = reports.map(function (r) {
      var detail = ['LINE統計API（近似）'];
      if (r.column) detail.push('列' + r.column);
      if (r.written.length) detail.push('書込: ' + r.written.join(' / '));
      if (r.skipped.length) detail.push('スキップ: ' + r.skipped.join(' / '));
      if (r.error) detail.push('エラー: ' + r.error);
      return { week: r.week, status: r.error ? 'NG' : (dryRun ? 'DRY-RUN' : 'OK'), detail: detail.join(' | ') };
    });

    if (!dryRun) appendLog_(logLines);
    logLines.forEach(function (l) { Logger.log('[%s] %s %s', l.status, l.week, l.detail); });

    return { friendCount: 0, source: 'LINE統計API', reports: reports };
  } finally {
    lock.releaseLock();
  }
}

/** LINE統計から前週分を反映（定期実行のエントリポイント） */
function syncLastWeekFromLineInsight() {
  var key = Utilities.formatDate(lastWeekStart_(), TZ, 'yyyy-MM-dd');
  return syncWeeksFromLineInsight_([key], false);
}

/** LINE統計から期間を指定して反映 */
function backfillFromLineInsight(fromStr, toStr) {
  var from = new Date(fromStr + 'T00:00:00');
  var to = new Date(toStr + 'T00:00:00');
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    throw new Error('日付は yyyy-MM-dd 形式で指定してください。');
  }
  return syncWeeksFromLineInsight_(listWeekKeys_(from, to), false);
}

/**
 * KPI表の手入力値と、LINE統計からの近似値を突き合わせる。
 * 書き込みは行いません。近似の精度がどの程度かを確認してから運用に乗せてください。
 */
function validateLineInsightAgainstSheet(fromStr, toStr) {
  var keys = listWeekKeys_(new Date(fromStr + 'T00:00:00'), new Date(toStr + 'T00:00:00'));
  var sheet = getKpiSheet_();
  var colMap = buildWeekColumnMap_(sheet);
  var lines = [];

  keys.forEach(function (key) {
    var col = colMap[key];
    if (!col) {
      lines.push(key + ' : 対応する列がありません');
      return;
    }
    var estimated = estimateWeeklyRegistrations_(key);
    var actual = sheet.getRange(CONFIG.SHEET.rows.lineRegistrations, col).getValue();

    if (estimated === null) {
      lines.push(key + '  統計未確定');
    } else if (actual === '' || actual === null) {
      lines.push(key + '  API近似=' + estimated + ' / 表は未入力');
    } else {
      lines.push(key + '  API近似=' + estimated + ' / 表=' + actual + ' → 差 ' + (estimated - Number(actual)));
    }
  });

  lines.forEach(function (l) { Logger.log(l); });
  return lines.join('\n');
}
