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

  let found = false;
  try {
    /* Stripe ではメールアドレスは一意ではないので、同じアドレスの顧客が
       複数いることがある。1件でも生きていれば通す。 */
    const cus = await stripe(env, "customers?limit=20&email=" + encodeURIComponent(email));
    for (const c of (cus.data || [])) {
      const subs = await stripe(env, "subscriptions?limit=20&status=all&customer=" + c.id);
      if ((subs.data || []).some(s => OK_STATUS.includes(s.status))) { found = true; break; }
    }
  } catch (e) {
    /* Stripe に届かない／キーが間違っている。
       ここで false を返すと、払っているお客さんが締め出される。
       アプリ側はこの reason を見て「パスワードで入る」案内を出す。 */
    return json({ ok: false, reason: "upstream" }, 503);
  }

  if (!found) return json({ ok: false, reason: "nosub" }, 200);

  const until = Date.now() + DAYS * 864e5;
  await note(env, request, email);
  return json({ ok: true, until: until, days: DAYS });
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

export const onRequestGet = () => json({ ok: false, reason: "method" }, 405);
