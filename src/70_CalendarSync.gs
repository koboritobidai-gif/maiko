/**
 * Googleカレンダー ルート（費用ゼロ・完全自動）
 *
 * 面談予約はすでにLステップからGoogleカレンダーへ自動連携されています
 * （イベント本文に「[Lステップから連携]」が入っているものがそれです）。
 * そのため、カレンダーを読むだけで 面談予約数 と 面談数 が取れます。
 * Lステップにログインする必要も、CSVを出す必要もありません。
 *
 * 実データでの検証結果（KPI表の手入力値との突き合わせ）:
 *   2026-07-20週  面談数 カレンダー 7 = 表 7   ✅
 *   2026-07-27週  面談数 カレンダー 4 = 表 4   ✅
 *
 * 判定は「イベント名」で行います。運用ルールはすでに定着しているものをそのまま使います。
 *   ・求職者面談かどうか … 「キャリア相談予約」「担当A」「Lリーチ経由」等を含む
 *   ・実施したか       … 先頭に「面談済」が付く
 *   ・予約数から除く   … 「面談見送り」「サービス利用不可」「中止」
 */

/** 対象カレンダーを取得 */
function getTargetCalendar_() {
  var id = CONFIG.CALENDAR.calendarId;
  var cal = id ? CalendarApp.getCalendarById(id) : CalendarApp.getDefaultCalendar();
  if (!cal) {
    throw new Error(
      'カレンダー「' + id + '」を開けません。IDが正しいか、' +
      'このスクリプトを実行するアカウントに閲覧権限があるか確認してください。'
    );
  }
  return cal;
}

/** イベント名から種別を判定する */
function classifyEvent_(title) {
  var c = CONFIG.CALENDAR;
  if (!new RegExp(c.meetingPattern).test(title)) return null;      // 求職者面談ではない
  if (new RegExp(c.excludePattern).test(title)) return 'excluded'; // 予約としても数えない
  if (new RegExp(c.heldPattern).test(title)) return 'held';        // 実施済み
  return 'reserved';                                               // 予約のみ（キャンセル・リスケ含む）
}

/**
 * カレンダーから週次集計する
 * @param {Date} from 集計開始日
 * @param {Date} to   集計終了日
 * @return {Object} { 'yyyy-MM-dd': {registrations:null, reserved, held}, ... }
 */
function aggregateCalendarByWeek_(from, to) {
  var events = getTargetCalendar_().getEvents(from, to);
  return tallyCalendarEvents_(events.map(function (ev) {
    return { title: ev.getTitle() || '', start: ev.getStartTime() };
  }));
}

/**
 * イベント（{title, start} の配列）を週次に数える純粋関数。
 * カレンダーAPIから切り離してあるのでテストできます。
 */
function tallyCalendarEvents_(items) {
  var weekly = {};
  var seenPerWeek = {}; // 同一人物のリスケ重複を1件にまとめるため

  function bucket(key) {
    if (!weekly[key]) weekly[key] = { registrations: null, reserved: 0, held: 0 };
    if (!seenPerWeek[key]) seenPerWeek[key] = {};
    return weekly[key];
  }

  items.forEach(function (item) {
    var title = item.title || '';
    var kind = classifyEvent_(title);
    if (!kind || kind === 'excluded') return;

    var key = weekKey_(item.start);
    var b = bucket(key);

    // 「7/23にリスケ）高瀬 真奈さん…」と「連絡有キャンセル）高瀬 真奈さん…」のように
    // 同じ人が同じ週に2件並ぶことがあるため、氏名で重複を除く
    if (CONFIG.CALENDAR.dedupeByName) {
      var name = extractPersonName_(title);
      if (name) {
        if (seenPerWeek[key][name]) return;
        seenPerWeek[key][name] = true;
      }
    }

    b.reserved += 1;                    // 予約は実施の有無にかかわらず1件
    if (kind === 'held') b.held += 1;   // 面談数は「面談済」が付いたものだけ
  });

  return weekly;
}

/**
 * イベント名から人名らしき部分を取り出す。
 * 「面談済）山口 藍李さん: ◆Lリーチ経由…」→「山口藍李」
 * 取れなければ null（その場合は重複除去をしない）。
 */
function extractPersonName_(title) {
  var s = String(title);

  // 先頭の「〜）」「〜)」という状態ラベルを落とす
  s = s.replace(/^[^）)]{0,40}[）)]\s*/, '');
  // 「KANOA 」のような流入元プレフィックスと絵文字を落とす
  s = s.replace(/^(KANOA|JP|KN)\s*/i, '').replace(/[🌈★◆◇☆▽●○■□]/g, '').trim();

  // 「◯◯さん」「◯◯様」の直前までを人名とみなす。
  // 「石井栞様 担当A※松永さん友人」のように後ろにも「さん」が出るため、
  // 最短一致にして最初の「さん / 様」で切る。
  var m = s.match(/^([^:：]+?)\s*(?:さん|様)/);

  // 「電話面談30分：小泉 柚紀様（…）」のように前置きが付く場合は区切りの後ろで再試行
  if (!m) {
    var tail = s.split(/[:：]/).pop();
    m = tail ? tail.match(/^\s*([^:：]+?)\s*(?:さん|様)/) : null;
  }

  if (!m) return null;
  return m[1].replace(/\s+/g, '');
}

/**
 * カレンダーから指定週をKPI表に反映する（面談予約数・面談数のみ）
 */
function syncWeeksFromCalendar_(weekKeys, dryRun) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) {
    throw new Error('別の同期処理が実行中です。しばらく待ってから再実行してください。');
  }

  try {
    var sorted = weekKeys.slice().sort();
    var from = new Date(sorted[0] + 'T00:00:00');
    var to = new Date(sorted[sorted.length - 1] + 'T00:00:00');
    to.setDate(to.getDate() + 7);

    var weekly = aggregateCalendarByWeek_(from, to);
    var sheet = getKpiSheet_();
    var colMap = buildWeekColumnMap_(sheet);

    var reports = [];
    var rawSubset = {};

    weekKeys.forEach(function (key) {
      var counts = weekly[key] || { registrations: null, reserved: 0, held: 0 };
      rawSubset[key] = counts;
      reports.push(writeWeek_(sheet, colMap, key, counts, dryRun));
    });

    appendRawRows_(rawSubset, dryRun);

    var logLines = reports.map(function (r) {
      var detail = ['カレンダー'];
      if (r.column) detail.push('列' + r.column);
      if (r.written.length) detail.push('書込: ' + r.written.join(' / '));
      if (r.skipped.length) detail.push('スキップ: ' + r.skipped.join(' / '));
      if (r.error) detail.push('エラー: ' + r.error);
      return { week: r.week, status: r.error ? 'NG' : (dryRun ? 'DRY-RUN' : 'OK'), detail: detail.join(' | ') };
    });

    if (!dryRun) appendLog_(logLines);
    logLines.forEach(function (l) { Logger.log('[%s] %s %s', l.status, l.week, l.detail); });

    return { friendCount: 0, source: 'Googleカレンダー', reports: reports };
  } finally {
    lock.releaseLock();
  }
}

/** カレンダーから前週分を反映（定期実行のエントリポイント） */
function syncLastWeekFromCalendar() {
  var key = Utilities.formatDate(lastWeekStart_(), TZ, 'yyyy-MM-dd');
  return syncWeeksFromCalendar_([key], false);
}

/** カレンダーから期間を指定して反映 */
function backfillFromCalendar(fromStr, toStr) {
  var from = new Date(fromStr + 'T00:00:00');
  var to = new Date(toStr + 'T00:00:00');
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    throw new Error('日付は yyyy-MM-dd 形式で指定してください。');
  }
  return syncWeeksFromCalendar_(listWeekKeys_(from, to), false);
}

/**
 * KPI表にすでに入っている手入力値と、カレンダー集計値を突き合わせる。
 * 書き込みは一切行いません。判定ルールを調整するときに使ってください。
 */
function validateAgainstSheet(fromStr, toStr) {
  var from = new Date(fromStr + 'T00:00:00');
  var to = new Date(toStr + 'T00:00:00');
  var keys = listWeekKeys_(from, to);

  var rangeEnd = new Date(keys[keys.length - 1] + 'T00:00:00');
  rangeEnd.setDate(rangeEnd.getDate() + 7);
  var weekly = aggregateCalendarByWeek_(new Date(keys[0] + 'T00:00:00'), rangeEnd);

  var sheet = getKpiSheet_();
  var colMap = buildWeekColumnMap_(sheet);
  var rows = CONFIG.SHEET.rows;
  var lines = [];

  keys.forEach(function (key) {
    var col = colMap[key];
    if (!col) {
      lines.push(key + ' : 対応する列がありません');
      return;
    }
    var c = weekly[key] || { reserved: 0, held: 0 };
    var sheetReserved = sheet.getRange(rows.meetingReserved, col).getValue();
    var sheetHeld = sheet.getRange(rows.meetingHeld, col).getValue();

    var mark = function (a, b) {
      if (b === '' || b === null) return '（表は未入力）';
      return Number(a) === Number(b) ? '一致' : '差分 ' + (Number(a) - Number(b));
    };

    lines.push(
      key +
      '  予約 カレンダー=' + c.reserved + ' / 表=' + sheetReserved + ' → ' + mark(c.reserved, sheetReserved) +
      '  ｜ 面談 カレンダー=' + c.held + ' / 表=' + sheetHeld + ' → ' + mark(c.held, sheetHeld)
    );
  });

  lines.forEach(function (l) { Logger.log(l); });
  return lines.join('\n');
}

/**
 * 判定にかかったイベント名を一覧表示する（ルール調整用）。
 * 意図しないイベントを拾っていないか、逆に取りこぼしが無いかを目で確認できます。
 */
function diagnoseCalendar(fromStr, toStr) {
  var from = new Date(fromStr + 'T00:00:00');
  var to = new Date(toStr + 'T00:00:00');
  var events = getTargetCalendar_().getEvents(from, to);

  var lines = [];
  events.forEach(function (ev) {
    var title = ev.getTitle() || '';
    var kind = classifyEvent_(title);
    if (!kind) return;
    var label = kind === 'held' ? '[実施]' : (kind === 'excluded' ? '[除外]' : '[予約]');
    lines.push(
      Utilities.formatDate(ev.getStartTime(), TZ, 'MM/dd HH:mm') + ' ' + label +
      ' ' + title + '  → 氏名判定: ' + extractPersonName_(title)
    );
  });

  Logger.log('該当 %s 件', lines.length);
  lines.forEach(function (l) { Logger.log(l); });
  return lines.length + ' 件を実行ログに出力しました。';
}
