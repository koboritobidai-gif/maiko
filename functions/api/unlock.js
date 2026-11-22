/* =========================================================================
   メールアドレスでログインする
   -------------------------------------------------------------------------
   お客さんが入力したメールアドレスを Stripe に問い合わせて、
   いま課金が生きているかどうかを判定する。

   ・Stripe のキーはここ（サーバー側）にしか無く、ページのソースには出ない
   ・解約されると次の確認で入れなくなる
   ・誰がいつ開いたかを KV に残す（共有されていれば分かる）

   必要な設定（Cloudflare の画面で入れるもの）
   ・変数とシークレット：STRIPE_KEY = 読み取り専用の制限付きキー
   ・バインディング：LOGINS = KV 名前空間（無くても動く。記録が残らないだけ）
   ========================================================================= */

const DAYS = 7;                       // 何日ごとに Stripe へ確認しに行くか
const COACH_FROM = 10000;             // この金額以上の申し込みは「コーチングつき」とみなす
const PROGRAM_FROM = 1000;            // この金額未満は「コミュニティだけ」の方（月額330円）
                                      // ※ ここを下回る申し込みでトレーニングを開かせない。
                                      //    330円でプログラム全部が見られてしまうのを防ぐ。
const OK_STATUS = ["active", "trialing", "past_due"];
/* past_due（カード期限切れなどで引き落とし失敗中）も通す。
   Stripe が自動で再試行している期間なので、ここで締め出すと
   払う気のあるお客さんを怒らせることになる。
   最終的に失敗すると canceled / unpaid になり、そこで入れなくなる。 */

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8",
               "cache-control": "no-store" }
  });

async function stripe(env, path) {
  const r = await fetch("https://api.stripe.com/v1/" + path, {
    headers: { authorization: "Bearer " + env.STRIPE_KEY }
  });
  if (!r.ok) throw new Error("stripe " + r.status + " " + path);
  return r.json();
}

export async function onRequestPost({ request, env }) {
  if (!env.STRIPE_KEY) return json({ ok: false, reason: "setup" }, 500);

  let email = "";
  try {
    const b = await request.json();
    email = String(b && b.email || "").trim().toLowerCase();
  } catch (e) { /* 本文が壊れている */ }

  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email) || email.length > 254)
    return json({ ok: false, reason: "format" }, 400);

  /* 生きている申し込みのうち、いちばん高い金額で判定する。
     コミュニティ（330円）とプログラム（3,500円）の両方に入っている方が
     いても、正しくプログラムの方で通るようにするため。 */
  let found = false, top = 0;
  try {
    /* Stripe ではメールアドレスは一意ではないので、同じアドレスの顧客が
       複数いることがある。1件でも生きていれば通す。 */
    const cus = await stripe(env, "customers?limit=20&email=" + encodeURIComponent(email));
    for (const c of (cus.data || [])) {
      const subs = await stripe(env, "subscriptions?limit=20&status=all&customer=" + c.id);
      for (const s of (subs.data || [])) {
        if (!OK_STATUS.includes(s.status)) continue;
        found = true;
        /* どのプランかは「金額」で見分ける。
           コミュニティ 330 円、スタンダード 3,500 / 3,900 円、
           コーチング 14,800 / 19,800 円。
           価格IDを直接書くと、値段を変えるたびにここも直すことになるので、
           しきい値（1,000円・1万円）で判定している。 */
        for (const it of ((s.items && s.items.data) || [])) {
          const yen = (it.price && it.price.unit_amount) || 0;
          if (yen > top) top = yen;
        }
      }
      if (top >= COACH_FROM) break;
    }
  } catch (e) {
    /* Stripe に届かない／キーが間違っている。
       ここで false を返すと、払っているお客さんが締め出される。
       アプリ側はこの reason を見て「パスワードで入る」案内を出す。 */
    return json({ ok: false, reason: "upstream" }, 503);
  }

  if (!found) return json({ ok: false, reason: "nosub" }, 200);

  /* コミュニティ（月額330円）だけの方は、トレーニングプログラムは開けない。
     ここを通すと、3,500円のプログラムが330円で見られてしまう。 */
  if (top < PROGRAM_FROM) return json({ ok: false, reason: "fanonly" }, 200);

  const plan = top >= COACH_FROM ? "coach" : "std";
  const until = Date.now() + DAYS * 864e5;
  await note(env, request, email);
  return json({ ok: true, until: until, days: DAYS, plan: plan });
}

/* ── ログインの記録 ──────────────────────────────────────────
   1アドレスにつき1件。直近10回ぶんの日時・国・端末を残す。
   同じアドレスがいくつもの端末や国から開かれていれば、ここで見える。 */
async function note(env, request, email) {
  if (!env.LOGINS) return;
  try {
    const key = "u:" + email;
    const prev = await env.LOGINS.get(key, "json") || { n: 0, hits: [] };
    const cf = request.cf || {};
    const ua = request.headers.get("user-agent") || "";
    const hit = {
      t : new Date().toISOString(),
      co: cf.country || "?",                       // 国
      ci: cf.city || "",                           // 都市
      d : /iPhone|iPad/.test(ua) ? "iOS"
        : /Android/.test(ua)     ? "Android"
        : /Mac/.test(ua)         ? "Mac"
        : /Windows/.test(ua)     ? "Windows" : "その他",
      ip: await hash((request.headers.get("cf-connecting-ip") || "") + email)
      /* IPアドレスそのものは残さない。同じ回線かどうかが分かれば足りるので、
         ハッシュにしてから保存する（個人情報を持たないため） */
    };
    const hits = [hit].concat(prev.hits || []).slice(0, 10);
    await env.LOGINS.put(key, JSON.stringify({
      n: (prev.n || 0) + 1, first: prev.first || hit.t, last: hit.t, hits: hits
    }));
  } catch (e) { /* 記録は失敗してもログインは通す */ }
}

async function hash(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].slice(0, 4).map(x => x.toString(16).padStart(2, "0")).join("");
}

/* ── 設定の確認用 ────────────────────────────────────────
   ブラウザでこのURLを開くと、設定がそろっているかだけ返す。
   キーの中身は返さない。Stripe へは1件だけ問い合わせて、
   通ったかどうか（HTTPの番号）を見る。 */
export async function onRequestGet({ env }) {
  const out = {
    ok: false, reason: "method",
    stripeKey: !!env.STRIPE_KEY,     // キーが入っているか
    kv       : !!env.LOGINS          // KV が繋がっているか
  };
  if (env.STRIPE_KEY) {
    try {
      const r = await fetch("https://api.stripe.com/v1/customers?limit=1", {
        headers: { authorization: "Bearer " + env.STRIPE_KEY }
      });
      out.stripeStatus = r.status;   // 200 なら成功。401=キーが違う 403=権限不足
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        out.stripeError = (e.error && (e.error.code || e.error.type)) || "";
      }
    } catch (e) { out.stripeStatus = "とどかない"; }
  }
  return json(out, 405);
}
