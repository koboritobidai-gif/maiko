/**
 * 週次集計
 *
 * Lステップの友だちレコード配列から、週（月曜〜日曜）ごとの
 *   ・LINE登録人数
 *   ・面談予約数
 *   ・面談数
 * を数え上げます。
 *
 * KPI表の率3種（LINE登録率 / 面談実行率 / 面談移行率）はシート側に
 * 既に数式が入っているため、ここでは計算しません。
 */

var TZ = 'Asia/Tokyo';

// ── 週ユーティリティ ────────────────────────────────────────

/** その日付が属する週の月曜0:00を返す */
function weekStartOf_(date) {
  var d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  var dow = d.getDay();            // 0=日, 1=月, ... 6=土
  var diff = (dow === 0) ? -6 : (1 - dow);
  d.setDate(d.getDate() + diff);
  return d;
}

/** 前週の月曜0:00 */
function lastWeekStart_() {
  var d = weekStartOf_(new Date());
  d.setDate(d.getDate() - 7);
  return d;
}

/** 週キー（yyyy-MM-dd 形式の月曜日） */
function weekKey_(date) {
  return Utilities.formatDate(weekStartOf_(date), TZ, 'yyyy-MM-dd');
}

/** 開始〜終了の間の週キーを列挙する */
function listWeekKeys_(from, to) {
  var keys = [];
  var cur = weekStartOf_(from);
  var end = weekStartOf_(to);
  while (cur.getTime() <= end.getTime()) {
    keys.push(Utilities.formatDate(cur, TZ, 'yyyy-MM-dd'));
    cur.setDate(cur.getDate() + 7);
  }
  return keys;
}

// ── レコード読み取り ────────────────────────────────────────

/** 候補キーの配列から最初に見つかった値を返す */
function pickField_(record, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    var key = candidates[i];
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
      return record[key];
    }
  }
  return null;
}

/** 友だち情報（カスタム項目）から指定名の値を読む */
function readFriendInfo_(record, fieldName) {
  var containers = CONFIG.MEETING.friendInfoPathCandidates;

  for (var i = 0; i < containers.length; i++) {
    var box = record[containers[i]];
    if (!box) continue;

    // 形式A: { "面談予約日": "2026-08-05" }
    if (!Array.isArray(box) && typeof box === 'object') {
      if (box[fieldName] !== undefined) return box[fieldName];
    }

    // 形式B: [{ name: "面談予約日", value: "2026-08-05" }, ...]
    if (Array.isArray(box)) {
      for (var j = 0; j < box.length; j++) {
        var item = box[j];
        if (!item || typeof item !== 'object') continue;
        var name = item.name || item['名前'] || item.title || item['項目名'] || item.key;
        if (name === fieldName) {
          return item.value !== undefined ? item.value : item['値'];
        }
      }
    }
  }

  // 形式C: トップレベルに直接ぶら下がっている
  if (record[fieldName] !== undefined) return record[fieldName];
  return null;
}

/** タグ名の配列を読む */
function readTags_(record) {
  var containers = CONFIG.MEETING.tagsPathCandidates;
  for (var i = 0; i < containers.length; i++) {
    var box = record[containers[i]];
    if (!box) continue;
    if (typeof box === 'string') return box.split(/[,、]\s*/);
    if (Array.isArray(box)) {
      return box.map(function (t) {
        if (typeof t === 'string') return t;
        if (t && typeof t === 'object') return t.name || t['名前'] || t.title || t.tag_name || '';
        return '';
      }).filter(String);
    }
  }
  return [];
}

/**
 * 日付らしき値を Date に変換する。
 * "2026-08-05 13:04:00" / "2026/08/05" / ISO8601 / Date に対応。
 * 変換できなければ null。
 */
function parseDate_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return isNaN(value.getTime()) ? null : value;
  }
  var s = String(value).trim();
  if (!s) return null;

  // "2026-08-05 13:04:00" は Safari/V8 差異を避けるため T 区切りに寄せる
  var normalized = s.replace(' ', 'T').replace(/\//g, '-');
  var d = new Date(normalized);
  if (!isNaN(d.getTime())) return d;

  // "2026年8月5日" 形式のフォールバック
  var m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  return null;
}

/** 集計対象のステータスかどうか */
function isCountableStatus_(record) {
  var st = pickField_(record, CONFIG.FIELDS.status);
  if (!st) return true; // ステータス項目が無い場合は全件対象
  return CONFIG.COUNT_STATUSES.indexOf(String(st)) !== -1;
}

// ── 集計本体 ────────────────────────────────────────────────

/**
 * 友だち配列を週次に集計する
 * @param {Array<Object>} friends
 * @return {Object} { 'yyyy-MM-dd': {registrations, reserved, held} }
 */
function aggregateByWeek_(friends) {
  var result = {};
  var mode = CONFIG.MEETING.mode;
  var skippedNoDate = 0;

  function bucket(key) {
    if (!result[key]) result[key] = { registrations: 0, reserved: 0, held: 0 };
    return result[key];
  }

  friends.forEach(function (rec) {
    if (!isCountableStatus_(rec)) return;

    // ① LINE登録人数：友だち登録日時の週で数える
    var created = parseDate_(pickField_(rec, CONFIG.FIELDS.createdAt));
    if (created) {
      bucket(weekKey_(created)).registrations += 1;
    } else {
      skippedNoDate += 1;
    }

    if (mode === 'dateField') {
      // ② 面談予約数 / ③ 面談数：友だち情報の日付欄の週で数える
      var reservedAt = parseDate_(readFriendInfo_(rec, CONFIG.MEETING.reservedDateFieldName));
      if (reservedAt) bucket(weekKey_(reservedAt)).reserved += 1;

      var heldAt = parseDate_(readFriendInfo_(rec, CONFIG.MEETING.heldDateFieldName));
      if (heldAt) bucket(weekKey_(heldAt)).held += 1;

    } else if (mode === 'tag') {
      // タグ運用の場合は「登録した週」に寄せて数える（暫定手段）
      if (!created) return;
      var tags = readTags_(rec);
      if (tags.indexOf(CONFIG.MEETING.reservedTagName) !== -1) bucket(weekKey_(created)).reserved += 1;
      if (tags.indexOf(CONFIG.MEETING.heldTagName) !== -1) bucket(weekKey_(created)).held += 1;

    } else {
      throw new Error('CONFIG.MEETING.mode は dateField か tag を指定してください: ' + mode);
    }
  });

  if (skippedNoDate > 0) {
    Logger.log('※ 登録日時を読み取れなかったレコードが %s 件ありました。CONFIG.FIELDS.createdAt を確認してください。', skippedNoDate);
  }
  return result;
}
