/**
 * スプレッドシートのカスタムメニューと定期実行トリガー
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Lステップ同期')
    .addItem('前週分を反映', 'menuSyncLastWeek')
    .addItem('今週分を反映（速報）', 'menuSyncThisWeek')
    .addItem('期間を指定して反映…', 'menuBackfill')
    .addSeparator()
    .addItem('書き込まずに確認（直近8週）', 'menuDryRun')
    .addItem('API接続テスト・項目診断', 'menuDiagnose')
    .addSeparator()
    .addItem('毎週月曜の自動実行をON', 'installWeeklyTrigger')
    .addItem('自動実行をOFF', 'removeTriggers')
    .addToUi();
}

function menuSyncLastWeek() {
  runWithToast_('前週分を反映', function () {
    var r = syncLastWeek();
    return summarize_(r);
  });
}

function menuSyncThisWeek() {
  runWithToast_('今週分を反映', function () {
    var r = syncThisWeek();
    return summarize_(r);
  });
}

function menuBackfill() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt(
    '期間を指定して反映',
    '開始日と終了日を yyyy-MM-dd,yyyy-MM-dd の形式で入力してください。\n例: 2026-06-01,2026-08-09',
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() !== ui.Button.OK) return;

  var parts = res.getResponseText().split(',').map(function (s) { return s.trim(); });
  if (parts.length !== 2) {
    ui.alert('入力形式が正しくありません。');
    return;
  }
  runWithToast_('期間反映', function () {
    return summarize_(backfill(parts[0], parts[1]));
  });
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
  return '友だち ' + result.friendCount + ' 件を取得。\n\n' + lines.join('\n');
}

/** 毎週月曜の自動実行を登録（重複登録しないよう既存を消してから作る） */
function installWeeklyTrigger() {
  removeTriggers();
  ScriptApp.newTrigger('syncLastWeek')
    .timeBased()
    .onWeekDay(CONFIG.TRIGGER.weekDay)
    .atHour(CONFIG.TRIGGER.hour)
    .inTimezone(TZ)
    .create();
  SpreadsheetApp.getUi().alert(
    '毎週月曜 ' + CONFIG.TRIGGER.hour + '時台に、前週分を自動反映するよう設定しました。'
  );
}

/** このスクリプトの時間トリガーを全削除 */
function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncLastWeek') ScriptApp.deleteTrigger(t);
  });
}
