/**
 * Lステップ 標準API クライアント
 *
 * 「友だち情報一覧取得」をページングしながら全件取得します。
 * エンドポイントやページング方式は CONFIG.API で切り替えられるようにしてあります
 * （Lステップ側のAPIリファレンスに合わせて設定してください）。
 */

/** アクセストークン付きのリクエストヘッダーを組み立てる */
function buildAuthHeaders_() {
  var token = getProp_('LSTEP_ACCESS_TOKEN', true);
  var headers = {};
  var scheme = CONFIG.API.authScheme ? CONFIG.API.authScheme + ' ' : '';
  headers[CONFIG.API.authHeaderName] = scheme + token;
  return headers;
}

/** クエリ文字列を組み立てる */
function toQueryString_(params) {
  var parts = [];
  Object.keys(params).forEach(function (k) {
    var v = params[k];
    if (v === null || v === undefined || v === '') return;
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
  });
  return parts.length ? '?' + parts.join('&') : '';
}

/**
 * APIを1回叩く（リトライ付き）
 * @return {Object} パース済みレスポンス
 */
function callApi_(params, body) {
  var api = CONFIG.API;
  var isPost = String(api.method).toLowerCase() === 'post';

  var url = api.baseUrl.replace(/\/+$/, '') + api.friendsPath;
  if (!isPost) url += toQueryString_(params);

  var options = {
    method: isPost ? 'post' : 'get',
    headers: buildAuthHeaders_(),
    muteHttpExceptions: true,
    contentType: 'application/json'
  };
  if (isPost) {
    options.payload = JSON.stringify(Object.assign({}, api.extraBody, body || {}, params));
  }

  var lastErr = null;
  for (var attempt = 0; attempt <= api.timeoutRetry; attempt++) {
    if (attempt > 0) Utilities.sleep(api.retryWaitMs * Math.pow(2, attempt - 1));

    var res;
    try {
      res = UrlFetchApp.fetch(url, options);
    } catch (e) {
      lastErr = e;
      continue;
    }

    var code = res.getResponseCode();
    var text = res.getContentText();

    if (code === 200 || code === 201) {
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error('APIレスポンスがJSONとして解釈できません: ' + text.slice(0, 300));
      }
    }

    // 429 / 5xx は一時的な障害としてリトライ、それ以外は即エラー
    if (code === 429 || code >= 500) {
      lastErr = new Error('APIエラー HTTP ' + code + ': ' + text.slice(0, 300));
      continue;
    }
    if (code === 401 || code === 403) {
      throw new Error(
        'LステップAPIの認証に失敗しました（HTTP ' + code + '）。' +
        'スクリプトプロパティ LSTEP_ACCESS_TOKEN と、管理画面「API連携 > 認証」のトークンが一致しているか、' +
        'API連携オプションが有効か確認してください。応答: ' + text.slice(0, 300)
      );
    }
    throw new Error('APIエラー HTTP ' + code + ': ' + text.slice(0, 300));
  }
  throw lastErr || new Error('LステップAPIの呼び出しに失敗しました。');
}

/** レスポンスから友だち配列を取り出す */
function extractList_(payload) {
  if (Array.isArray(payload)) return payload;

  var candidates = CONFIG.API.listPathCandidates;
  for (var i = 0; i < candidates.length; i++) {
    var v = payload[candidates[i]];
    if (Array.isArray(v)) return v;
    // data.items のような二段構えにも対応
    if (v && typeof v === 'object') {
      for (var j = 0; j < candidates.length; j++) {
        if (Array.isArray(v[candidates[j]])) return v[candidates[j]];
      }
    }
  }
  throw new Error(
    '友だち一覧の配列が見つかりませんでした。CONFIG.API.listPathCandidates に実際のキー名を追加してください。' +
    ' 受信したトップレベルのキー: ' + Object.keys(payload).join(', ')
  );
}

/** レスポンスから次カーソルを取り出す */
function extractNextCursor_(payload) {
  var key = CONFIG.API.paging.nextCursorField;
  if (payload && payload[key]) return payload[key];
  var candidates = CONFIG.API.listPathCandidates;
  for (var i = 0; i < candidates.length; i++) {
    var v = payload[candidates[i]];
    if (v && typeof v === 'object' && v[key]) return v[key];
  }
  return null;
}

/**
 * 友だちを全件取得する
 * @return {Array<Object>} 友だちレコードの配列
 */
function fetchAllFriends_() {
  var p = CONFIG.API.paging;
  var all = [];

  if (p.type === 'none') {
    var once = callApi_(Object.assign({}, CONFIG.API.extraQuery));
    return extractList_(once);
  }

  var cursor = null;
  var page = p.startPage;
  var offset = 0;

  for (var i = 0; i < p.maxPages; i++) {
    var params = Object.assign({}, CONFIG.API.extraQuery);
    params[p.limitParam] = p.limit;

    if (p.type === 'page') {
      params[p.pageParam] = page;
    } else if (p.type === 'offset') {
      params[p.offsetParam] = offset;
    } else if (p.type === 'cursor') {
      if (cursor) params[p.cursorParam] = cursor;
    }

    var payload = callApi_(params);
    var list = extractList_(payload);
    all = all.concat(list);

    if (p.type === 'cursor') {
      cursor = extractNextCursor_(payload);
      if (!cursor) break;
    } else {
      if (list.length < p.limit) break;
      page += 1;
      offset += p.limit;
    }
  }

  Logger.log('Lステップから友だちを %s 件取得しました。', all.length);
  return all;
}

/**
 * 接続確認と項目名の診断。
 * 1ページだけ取得し、レコードの構造をログに出力します。
 * CONFIG.FIELDS / CONFIG.MEETING のマッピングを決めるときに使ってください。
 */
function diagnoseApi() {
  var p = CONFIG.API.paging;
  var params = Object.assign({}, CONFIG.API.extraQuery);
  params[p.limitParam] = 3;
  if (p.type === 'page') params[p.pageParam] = p.startPage;

  var payload = callApi_(params);
  Logger.log('--- トップレベルのキー ---');
  Logger.log(Array.isArray(payload) ? '(配列)' : Object.keys(payload).join(', '));

  var list = extractList_(payload);
  Logger.log('--- 取得件数: %s ---', list.length);
  if (!list.length) {
    Logger.log('レコードが0件でした。管理画面の友だち数と絞り込み条件を確認してください。');
    return;
  }

  var rec = list[0];
  Logger.log('--- 1件目のキー ---');
  Logger.log(Object.keys(rec).join(', '));
  Logger.log('--- 1件目の中身（先頭2000文字） ---');
  Logger.log(JSON.stringify(rec, null, 2).slice(0, 2000));

  Logger.log('--- 自動マッピング結果 ---');
  Logger.log('createdAt -> %s', pickField_(rec, CONFIG.FIELDS.createdAt));
  Logger.log('status    -> %s', pickField_(rec, CONFIG.FIELDS.status));
  Logger.log('id        -> %s', pickField_(rec, CONFIG.FIELDS.id));
  Logger.log('友だち情報「%s」 -> %s',
    CONFIG.MEETING.reservedDateFieldName,
    readFriendInfo_(rec, CONFIG.MEETING.reservedDateFieldName));
  Logger.log('友だち情報「%s」 -> %s',
    CONFIG.MEETING.heldDateFieldName,
    readFriendInfo_(rec, CONFIG.MEETING.heldDateFieldName));
  Logger.log('タグ -> %s', JSON.stringify(readTags_(rec)));
}
