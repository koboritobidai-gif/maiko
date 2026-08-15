/**
 * Lステップ → KPI表 自動反映
 * 設定ファイル
 *
 * 秘匿情報（アクセストークン）はここに書かず、
 * スクリプトプロパティ（プロジェクトの設定 > スクリプト プロパティ）に保存してください。
 *   LSTEP_ACCESS_TOKEN : Lステップ管理画面「API連携 > 認証」で発行したトークン
 *   KPI_SPREADSHEET_ID : KPI表のスプレッドシートID（コンテナバインドなら省略可）
 */

var CONFIG = {

  // ───────────────────────────────────────────────────────────
  // 1. Lステップ API
  //    ★ baseUrl / friendsPath / method は、Lステップ管理画面の
  //      「API連携 > APIリファレンス」に記載の値へ必ず置き換えてください。
  //      リファレンス画面の【cURL実行サンプル】をコピーすると確実です。
  //      設定後 `diagnoseApi()` を実行すると、実レスポンスのキー一覧が
  //      ログに出るので、FIELDS のマッピングをそれに合わせられます。
  // ───────────────────────────────────────────────────────────
  API: {
    baseUrl: 'https://REPLACE-ME.example.com',   // 例: https://xxx.lstep.app
    friendsPath: '/REPLACE/ME/friends',          // 「友だち情報一覧取得」のパス
    method: 'get',                               // 'get' または 'post'

    // 認証ヘッダー。Lステップは Authorization ヘッダー方式。
    // scheme が不要な仕様なら authScheme: '' にしてください。
    authHeaderName: 'Authorization',
    authScheme: 'Bearer',

    // 固定で付与したいクエリパラメータ / ボディ（不要なら空のまま）
    extraQuery: {},
    extraBody: {},

    // ページング方式: 'page' | 'offset' | 'cursor' | 'none'
    paging: {
      type: 'page',
      limitParam: 'limit',        // 1ページ件数のパラメータ名
      limit: 500,
      pageParam: 'page',          // type='page' のとき
      startPage: 1,
      offsetParam: 'offset',      // type='offset' のとき
      cursorParam: 'cursor',      // type='cursor' のとき
      nextCursorField: 'next_cursor', // レスポンス中の次カーソル項目名
      maxPages: 200               // 暴走防止の上限
    },

    // レスポンス本体から friend 配列を取り出す候補パス（上から順に探索）
    listPathCandidates: ['data', 'friends', 'items', 'results', 'list', 'records'],

    timeoutRetry: 3,              // 失敗時のリトライ回数
    retryWaitMs: 1500             // 初回待機（指数バックオフ）
  },

  // ───────────────────────────────────────────────────────────
  // 2. レスポンス項目のマッピング
  //    値は「候補名の配列」。上から順に一致したものを採用します。
  //    diagnoseApi() の出力を見て、実際のキー名を足してください。
  // ───────────────────────────────────────────────────────────
  FIELDS: {
    // 友だち登録日時（LINE登録人数のカウント基準）
    createdAt: ['作成日時', 'created_at', 'createdAt', 'created_time', 'add_time'],
    // 表示ステータス（normal / block / hide）
    status: ['表示ステータス', 'status', 'display_status'],
    // 友だち識別子（重複排除用。無ければ行番号で代用）
    id: ['id', 'friend_id', 'friendId', 'line_user_id', 'user_id']
  },

  // 集計に含める表示ステータス。
  // KPIの「LINE登録人数」は“その週に登録した人数”なので、
  // 後からブロックされた友だちも含めるのが既存運用と整合します。
  COUNT_STATUSES: ['normal', 'block', 'hide'],

  // ───────────────────────────────────────────────────────────
  // 3. 面談予約数 / 面談数 の取得方法
  //
  //    mode: 'dateField'（推奨）
  //      Lステップの「友だち情報（日付型）」に入っている日付でカウントします。
  //      例:「面談予約日」「面談実施日」という友だち情報欄を用意し、
  //         予約完了アクション／面談実施のタグ付け時に日付を自動セットしておく。
  //      → その日付が対象週に入っている友だちの数＝その週の件数、となり
  //         KPI表の「週次イベント数」と定義が一致します。
  //
  //    mode: 'tag'
  //      指定タグが付いている友だちを、友だち登録日（createdAt）の週で
  //      カウントします。日付欄を用意できない場合の暫定手段です。
  //      ※「登録した週」に寄せて数えるため、登録と面談の週がずれると
  //        実績とずれます。恒久運用には 'dateField' を推奨します。
  // ───────────────────────────────────────────────────────────
  MEETING: {
    mode: 'dateField',

    // mode='dateField' のとき: 友だち情報欄の名称
    reservedDateFieldName: '面談予約日',
    heldDateFieldName: '面談実施日',

    // mode='tag' のとき: タグ名
    reservedTagName: '面談予約済み',
    heldTagName: '面談実施済み',

    // 友だち情報 / タグ が入っているレスポンス上のキー候補
    friendInfoPathCandidates: ['友だち情報', 'friend_info', 'friendInfo', 'custom_fields', 'fields'],
    tagsPathCandidates: ['タグ', 'tags', 'tag_list', 'labels']
  },

  // ───────────────────────────────────────────────────────────
  // 4. 書き込み先（KPI表）
  // ───────────────────────────────────────────────────────────
  SHEET: {
    name: '（新）20244～',

    weekStartRow: 1,   // 週開始日（月曜）
    weekEndRow: 2,     // 週終了日（日曜）

    rows: {
      lineRegistrations: 6,  // LINE登録人数
      meetingReserved: 8,    // 面談予約数
      meetingHeld: 9         // 面談数
    },

    // 参考: 自動計算される行（このスクリプトは触りません）
    //   5行目 PV数（Lステップ外のデータ。GA4等から別途入力）
    //   7行目 LINE登録率（=6行/5行）
    //  10行目 面談実行率（=9行/8行）
    //  11行目 LINE登録からの面談移行率（=9行/6行）
    formulaRows: [7, 10, 11],

    // 既に人が手入力した値を上書きするか
    // false: 空欄のセルだけ書き込む（既存値は温存し、ログに差分を記録）
    overwriteExisting: false,

    maxScanColumn: 400 // 週列を探す範囲
  },

  // 同期の実行記録を残すシート名（無ければ自動作成）
  LOG_SHEET_NAME: 'Lステップ同期ログ',

  // 生データ（週次集計値）の控えを残すシート名（無ければ自動作成）
  RAW_SHEET_NAME: 'Lステップ_RAW',

  // 定期実行の設定（毎週月曜の朝に前週分を同期）
  TRIGGER: {
    weekDay: ScriptApp.WeekDay.MONDAY,
    hour: 7
  }
};

/** スクリプトプロパティ取得ヘルパー */
function getProp_(key, required) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  if (required && !v) {
    throw new Error(
      'スクリプトプロパティ「' + key + '」が未設定です。' +
      'Apps Script エディタの「プロジェクトの設定 > スクリプト プロパティ」で設定してください。'
    );
  }
  return v;
}

/** 対象スプレッドシートを取得（バインド優先、無ければIDで開く） */
function getSpreadsheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  var id = getProp_('KPI_SPREADSHEET_ID', true);
  return SpreadsheetApp.openById(id);
}

/** KPIシートを取得 */
function getKpiSheet_() {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(CONFIG.SHEET.name);
  if (!sh) {
    throw new Error('シート「' + CONFIG.SHEET.name + '」が見つかりません。CONFIG.SHEET.name を確認してください。');
  }
  return sh;
}
