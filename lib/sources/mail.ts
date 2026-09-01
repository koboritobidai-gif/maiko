import { ImapFlow } from "imapflow";
import { findMeetingDate, looksLikeMinutes, type MinutesDoc, type MinutesSource } from "./types.ts";

/**
 * メールから議事録を取り込む。
 *
 * 社内ツールがメールなので、これが主な取得元になる。
 * 件名に「議事録」などが含まれるメールを、指定したフォルダから拾う。
 */

function env(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

/** メール本文から引用・署名を落とす。誤ってタスクを拾わないようにするため。 */
export function stripQuotedAndSignature(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    if (/^\s*[>＞]/.test(line)) continue;
    if (/^\s*(--\s*$|__+$|-{3,}\s*$)/.test(line)) break;
    if (/^\s*(On .+ wrote:|.+さんは書きました[:：])\s*$/.test(line)) break;
    if (/^\s*(-{2,}\s*)?(Original Message|元のメッセージ|転送されたメッセージ)/i.test(line)) break;
    kept.push(line);
  }
  return kept.join("\n").trim();
}

/** 添付やHTMLを含むメールから、本文のテキストパートを取り出す。 */
function textFromSource(raw: string): string {
  // マルチパートでも、まず text/plain のパートを優先して探す。
  const plain = raw.split(/\n--[^\n]+\n/).find((part) =>
    /content-type:\s*text\/plain/i.test(part),
  );
  const target = plain ?? raw;
  const bodyStart = target.search(/\n\s*\n/);
  const body = bodyStart >= 0 ? target.slice(bodyStart) : target;
  return body
    .replace(/=\r?\n/g, "")                                  // quoted-printable の行折り返し
    .replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/<[^>]+>/g, " ");                               // HTML しか無い場合の保険
}

/** 役員限定として扱う宛先（例: board@example.co.jp）。 */
function execAddresses(): string[] {
  return env("MINUTES_MAIL_EXEC_TO")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
}

export const mailSource: MinutesSource = {
  name: "mail",
  label: "メール",
  requirement: "MINUTES_IMAP_HOST / MINUTES_IMAP_USER / MINUTES_IMAP_PASSWORD",
  configured: () => Boolean(env("MINUTES_IMAP_HOST") && env("MINUTES_IMAP_USER")),

  async fetchRecent(days: number): Promise<MinutesDoc[]> {
    const client = new ImapFlow({
      host: env("MINUTES_IMAP_HOST"),
      port: Number(env("MINUTES_IMAP_PORT", "993")),
      secure: env("MINUTES_IMAP_SECURE", "1") !== "0",
      auth: { user: env("MINUTES_IMAP_USER"), pass: env("MINUTES_IMAP_PASSWORD") },
      logger: false,
    });

    const docs: MinutesDoc[] = [];
    await client.connect();
    const lock = await client.getMailboxLock(env("MINUTES_IMAP_MAILBOX", "INBOX"));
    try {
      const since = new Date(Date.now() - days * 86_400_000);
      for await (const message of client.fetch({ since }, { envelope: true, source: true })) {
        const subject = message.envelope?.subject ?? "";
        if (!looksLikeMinutes(subject)) continue;

        const raw = message.source?.toString("utf8") ?? "";
        const body = stripQuotedAndSignature(textFromSource(raw));
        if (!body) continue;

        const sent = message.envelope?.date ?? null;
        docs.push({
          source: "mail",
          externalId: message.envelope?.messageId ?? `uid:${message.uid}`,
          title: subject.trim(),
          meetingDate: findMeetingDate(subject, sent ? sent.toISOString().slice(0, 10) : null),
          url: "",
          author: message.envelope?.from?.[0]?.address ?? "",
          body,
          // 役員向けの議事録を送るアドレスを指定しておくと、役員限定タスクとして取り込む。
          visibility: execAddresses().some((a) => subject.includes(a) ||
            (message.envelope?.to ?? []).some((t) => t.address?.includes(a)))
            ? "executive"
            : "all",
        });
      }
    } finally {
      lock.release();
      await client.logout();
    }
    return docs;
  },
};
