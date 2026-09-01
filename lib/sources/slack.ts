import { findMeetingDate, looksLikeMinutes, type MinutesDoc, type MinutesSource } from "./types.ts";

/**
 * Slack のチャンネルから議事録を取り込む。
 *
 * 指定したチャンネルの投稿のうち、議事録らしいものを拾う。
 * 議事録専用チャンネルを指定した場合は、キーワード判定を省ける（MINUTES_SLACK_ALL=1）。
 */

const API = "https://slack.com/api";

function token(): string {
  return process.env.MINUTES_SLACK_TOKEN ?? "";
}

function channels(key: string): string[] {
  return (process.env[key] ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

async function callSlack<T>(method: string, params: Record<string, string>): Promise<T> {
  const url = `${API}/${method}?${new URLSearchParams(params)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
  const data = (await response.json()) as { ok: boolean; error?: string } & T;
  if (!data.ok) throw new Error(`Slack API (${method}) が失敗しました: ${data.error}`);
  return data;
}

interface SlackMessage {
  ts: string;
  text?: string;
  user?: string;
  subtype?: string;
}

export const slackSource: MinutesSource = {
  name: "slack",
  label: "Slack",
  requirement: "MINUTES_SLACK_TOKEN / MINUTES_SLACK_CHANNELS",
  configured: () => Boolean(token() && channels("MINUTES_SLACK_CHANNELS").length),

  async fetchRecent(days: number): Promise<MinutesDoc[]> {
    const execChannels = new Set(channels("MINUTES_SLACK_EXEC_CHANNELS"));
    const all = channels("MINUTES_SLACK_CHANNELS");
    const oldest = String(Math.floor((Date.now() - days * 86_400_000) / 1000));
    const skipKeywordCheck = process.env.MINUTES_SLACK_ALL === "1";

    const names = new Map<string, string>();
    const docs: MinutesDoc[] = [];

    for (const channel of [...new Set([...all, ...execChannels])]) {
      if (!names.has(channel)) {
        const info = await callSlack<{ channel: { name: string } }>("conversations.info", { channel });
        names.set(channel, info.channel?.name ?? channel);
      }
      const history = await callSlack<{ messages: SlackMessage[] }>("conversations.history", {
        channel,
        oldest,
        limit: "100",
      });

      for (const message of history.messages ?? []) {
        if (message.subtype || !message.text) continue;
        const firstLine = message.text.split("\n")[0] ?? "";
        if (!skipKeywordCheck && !looksLikeMinutes(message.text)) continue;

        const postedAt = new Date(Number(message.ts) * 1000).toISOString().slice(0, 10);
        docs.push({
          source: "slack",
          externalId: `${channel}:${message.ts}`,
          title: firstLine.replace(/[*_`>]/g, "").slice(0, 80).trim() || `#${names.get(channel)} の投稿`,
          meetingDate: findMeetingDate(message.text, postedAt),
          url: `https://slack.com/archives/${channel}/p${message.ts.replace(".", "")}`,
          author: message.user ?? "",
          body: message.text,
          visibility: execChannels.has(channel) ? "executive" : "all",
        });
      }
    }
    return docs;
  },
};
