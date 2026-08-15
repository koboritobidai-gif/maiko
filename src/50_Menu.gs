/**
 * スプレッドシートのカスタムメニューと定期実行トリガー
 *
 * 取得ルートは2つあります。使う側を選んでください。
 *   ・API連携   … 完全自動。Lステップのプロプラン以上＋API連携オプションが必要
 *   ・CSV取り込み … 週1回のエクスポートだけ手動。全プランで使える
 */

function onOpen() {
  var ui = SpreadsheetApp.getUi();

  var apiMenu = ui.createMenu('API連携から取得')
    .addItem('前週分を反映', 'menuSyncLastWeek')
    .addItem('今週分を反映（速報）', 'menuSyncThisWeek')
    .addItem('期間を指定して反映…', 'menuBackfill')
    .addSeparator()
    .addItem('書き込まずに確認（直近8週）', 'menuDryRun')
    .addItem('API接続テスト・項目診断', 'menuDiagnose')
    .addSeparator()
    .addItem('毎週月曜の自動実行をON', 'installWeeklyTriggerApi');

  var csvMenu = ui.createMenu('CSV取り込みから反映')
    .addItem('最新CSVで前週分を反映', 'menuSyncLastWeekCsv')
    .addItem('最新CSVで期間を指定して反映…', 'menuBackfillCsv')
    .addSeparator()
    .addItem('CSVの列名・集計結果を確認', 'menuDiagnoseCsv')
    .addSeparator()
    .addItem('毎週月曜の自動実行をON', 'installWeeklyTriggerCsv');

  ui.createMenu('Lステップ同期')
    .addSubMenu(apiMenu)
    .addSubMenu(csvMenu)
    .addSeparator()
    .addItem('自動実行をすべてOFF', 'removeTriggers')
    .addToUi();
}

// ── API ルート ──────────────────────────────────────────────

function menuSyncLastWeek() {
  runWithToast_('前週分を反映', function () { return summarize_(syncLastWeek()); });
}

function menuSyncThisWeek() {
  runWithToast_('今週分を反映', function () { return summarize_(syncThisWeek()); });
}

function menuBackfill() {
  var range = promptDateRange_();
  if (!range) return;
  runWithToast_('期間反映', function () { return summarize_(backfill(range[0], range[1])); });
}

function menuDryRun() {
  runWithToast_('確認実行', function () {
    var r = dryRunRecentWeeks();
    var lines = r.reports.map(function (x) {
      return x.week + ': ' + (x.error ? x.error : x.written.join(' / '));
    });
    return '友だち ' + r.friendCount + ' 件を取得。\n' + lines.join('\n');
  });
}

function menuDiagnose() {
  runWithToast_('API診断', function () {
    diagnoseApi();
    return '診断結果を実行ログに出力しました。\nApps Script エディタの「実行数 > ログ」で確認してください。';
  });
}

// ── CSV ルート ──────────────────────────────────────────────

function menuSyncLastWeekCsv() {
  runWithToast_('CSVから前週分を反映', function () { return summarize_(syncLastWeekFromCsv()); });
}

function menuBackfillCsv() {
  var range = promptDateRange_();
  if (!range) return;
  runWithToast_('CSVから期間反映', function () {
    return summarize_(backfillFromCsv(range[0], range[1]));
  });
}

function menuDiagnoseCsv() {
  runWithToast_('CSV診断', function () {
    diagnoseCsv();
    return 'CSVの列名と週次集計を実行ログに出力しました。\nApps Script エディタの「実行数 > ログ」で確認してください。';
  });
}

// ── 共通 ────────────────────────────────────────────────────

function promptDateRange_() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt(
    '期間を指定して反映',
    '開始日と終了日を yyyy-MM-dd,yyyy-MM-dd の形式で入力してください。\n例: 2026-06-01,2026-08-09',
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() !== ui.Button.OK) return null;

  var parts = res.getResponseText().split(',').map(function (s) { return s.trim(); });
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    ui.alert('入力形式が正しくありません。');
    return null;
  }
  return parts;
}

function runWithToast_(title, fn) {
  var ui = SpreadsheetApp.getUi();
  try {
    var msg = fn();
    ui.alert(title + ' 完了', String(msg), ui.ButtonSet.OK);
  } catch (e) {
    ui.alert(title + ' エラー', String(e && e.message ? e.message : e), ui.ButtonSet.OK);
    throw e;
  }
}

function summarize_(result) {
  var lines = result.reports.map(function (r) {
    if (r.error) return r.week + ' : ' + r.error;
    var s = r.week + ' (列' + r.column + ') ' + (r.written.length ? r.written.join(' / ') : '書き込みなし');
    if (r.skipped.length) s += '\n   ※既存値を優先: ' + r.skipped.join(' / ');
    return s;
  });
  var head = result.source
    ? 'CSV「' + result.source + '」から ' + result.friendCount + ' 件を読み込み。'
    : '友だち ' + result.friendCount + ' 件を取得。';
  return head + '\n\n' + lines.join('\n');
}

// ── トリガー ────────────────────────────────────────────────

var TRIGGER_HANDLERS = ['syncLastWeek', 'syncLastWeekFromCsv'];

function installWeeklyTriggerApi() { installWeeklyTrigger_('syncLastWeek', 'API連携'); }
function installWeeklyTriggerCsv() { installWeeklyTrigger_('syncLastWeekFromCsv', 'CSV取り込み'); }

/** 毎週月曜の自動実行を登録（ルートが混ざらないよう既存を消してから作る） */
function installWeeklyTrigger_(handler, label) {
  removeTriggers();
  ScriptApp.newTrigger(handler)
    .timeBased()
    .onWeekDay(CONFIG.TRIGGER.weekDay)
    .atHour(CONFIG.TRIGGER.hour)
    .inTimezone(TZ)
    .create();
  SpreadsheetApp.getUi().alert(
    label + 'ルートで、毎週月曜 ' + CONFIG.TRIGGER.hour + '時台に前週分を自動反映するよう設定しました。'
  );
}

/** このスクリプトの時間トリガーを全削除 */
function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (TRIGGER_HANDLERS.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
}
