/**
 * MessengerSource アダプタ
 * Slack投稿の取得(ハイライトフィード)と、メッセージ配信(「届ける」機能)を抽象化する。
 * デモ段階は DemoSlackSource が demo-data.ts の投稿を返し、送信は実際には飛ばさず
 * その場でエコーする(コンソール出力+成功レスポンス)。
 * 実連携は SlackSource が Slack Web API(chat.postMessage / conversations.history / users.info)
 * を直接 fetch で呼び出す(@slack/web-api 等の追加npm依存は使わない)。
 */
import type { SlackPost } from "../types";
import { slackPosts } from "../demo-data";

export interface PostMessageResult {
  ok: boolean;
  post: SlackPost;
}

export interface MessengerSource {
  getRecentPosts(limit?: number): Promise<SlackPost[]>;
  postMessage(channel: string, author: string, body: string): Promise<PostMessageResult>;
}

/** デモ実装: demo-data.ts の投稿を返し、送信はメモリ上でエコーするのみ。 */
export class DemoSlackSource implements MessengerSource {
  async getRecentPosts(limit = 8): Promise<SlackPost[]> {
    return [...slackPosts]
      .sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime())
      .slice(0, limit);
  }

  async postMessage(
    channel: string,
    author: string,
    body: string,
  ): Promise<PostMessageResult> {
    const post: SlackPost = {
      id: `demo-${Date.now()}`,
      channel,
      author,
      postedAt: new Date(),
      body,
    };
    // デモ段階では実送信を行わず、ログのみ出力する。
    console.log(`[DemoSlackSource] ${channel} へ配信(デモ): ${author} - ${body}`);
    return { ok: true, post };
  }
}

// ─────────────────────────────────────────────
// SlackSource: 実連携
// ─────────────────────────────────────────────

const SLACK_API_BASE = "https://slack.com/api";

interface SlackApiResponseBase {
  ok: boolean;
  error?: string;
}

async function slackGet<T extends SlackApiResponseBase>(
  botToken: string,
  method: string,
  params: Record<string, string>,
): Promise<T> {
  const url = `${SLACK_API_BASE}/${method}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${botToken}` },
    cache: "no-store",
  });
  const json = (await res.json()) as T;
  if (!res.ok || !json.ok) {
    throw new Error(`Slack API ${method} 呼び出しに失敗しました: ${json.error ?? res.status}`);
  }
  return json;
}

async function slackPostJson<T extends SlackApiResponseBase>(
  botToken: string,
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${SLACK_API_BASE}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json()) as T;
  if (!res.ok || !json.ok) {
    throw new Error(`Slack API ${method} 呼び出しに失敗しました: ${json.error ?? res.status}`);
  }
  return json;
}

interface SlackUserInfoResponse extends SlackApiResponseBase {
  user?: {
    name?: string;
    real_name?: string;
    profile?: { real_name?: string; display_name?: string };
  };
}

interface SlackChannelInfoResponse extends SlackApiResponseBase {
  channel?: { name?: string };
}

interface SlackHistoryResponse extends SlackApiResponseBase {
  messages?: { ts: string; text?: string; user?: string; bot_id?: string; subtype?: string }[];
}

/**
 * 実連携: Slack Web API 連携。
 * `SLACK_BOT_TOKEN`(Bot User OAuth Token、Scopes: chat:write / channels:history / channels:read / users:read)
 * と、ハイライト取得対象の `SLACK_HIGHLIGHT_CHANNELS`(カンマ区切りチャンネルID)を使用する。
 */
export class SlackSource implements MessengerSource {
  private readonly userNameCache = new Map<string, string>();
  private readonly channelNameCache = new Map<string, string>();

  constructor(
    private readonly config: {
      botToken?: string;
      highlightChannels?: string[];
      defaultChannel?: string;
    } = {},
  ) {}

  private requireToken(): string {
    if (!this.config.botToken) {
      throw new Error("環境変数 SLACK_BOT_TOKEN が設定されていません。");
    }
    return this.config.botToken;
  }

  private async resolveUserName(botToken: string, userId: string): Promise<string> {
    const cached = this.userNameCache.get(userId);
    if (cached) return cached;
    try {
      const res = await slackGet<SlackUserInfoResponse>(botToken, "users.info", { user: userId });
      const name =
        res.user?.profile?.real_name ||
        res.user?.profile?.display_name ||
        res.user?.real_name ||
        res.user?.name ||
        userId;
      this.userNameCache.set(userId, name);
      return name;
    } catch {
      return userId;
    }
  }

  private async resolveChannelName(botToken: string, channelId: string): Promise<string> {
    const cached = this.channelNameCache.get(channelId);
    if (cached) return cached;
    try {
      const res = await slackGet<SlackChannelInfoResponse>(botToken, "conversations.info", {
        channel: channelId,
      });
      const name = res.channel?.name ? `#${res.channel.name}` : channelId;
      this.channelNameCache.set(channelId, name);
      return name;
    } catch {
      return channelId;
    }
  }

  async getRecentPosts(limit = 8): Promise<SlackPost[]> {
    const botToken = this.requireToken();
    const channelIds = (this.config.highlightChannels ?? []).filter(Boolean);
    if (channelIds.length === 0) {
      throw new Error(
        "環境変数 SLACK_HIGHLIGHT_CHANNELS が設定されていません(ハイライト取得対象チャンネルIDをカンマ区切りで指定してください)。",
      );
    }

    const postsPerChannel = await Promise.all(
      channelIds.map(async (channelId) => {
        const [channelName, history] = await Promise.all([
          this.resolveChannelName(botToken, channelId),
          slackGet<SlackHistoryResponse>(botToken, "conversations.history", {
            channel: channelId,
            limit: String(Math.max(limit, 5)),
          }),
        ]);

        const messages = (history.messages ?? []).filter((m) => !m.subtype && m.text);
        return Promise.all(
          messages.map(async (m) => {
            const author = m.user ? await this.resolveUserName(botToken, m.user) : "Slack Bot";
            const post: SlackPost = {
              id: `${channelId}-${m.ts}`,
              channel: channelName,
              author,
              postedAt: new Date(Number(m.ts.split(".")[0]) * 1000),
              body: m.text ?? "",
            };
            return post;
          }),
        );
      }),
    );

    return postsPerChannel
      .flat()
      .sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime())
      .slice(0, limit);
  }

  async postMessage(channel: string, author: string, body: string): Promise<PostMessageResult> {
    const botToken = this.requireToken();
    const targetChannel = channel || this.config.defaultChannel;
    if (!targetChannel) {
      throw new Error("送信先チャンネルが指定されておらず、SLACK_DEFAULT_CHANNEL も未設定です。");
    }
    const text = `*${author}*\n${body}`;
    await slackPostJson(botToken, "chat.postMessage", { channel: targetChannel, text });
    return {
      ok: true,
      post: {
        id: `slack-${Date.now()}`,
        channel: targetChannel,
        author,
        postedAt: new Date(),
        body,
      },
    };
  }
}

/** `DATA_MODE` 環境変数(`live` | `demo`)に応じてアダプタを切り替える。既定はデモ。 */
export function getMessengerSource(): MessengerSource {
  if (process.env.DATA_MODE === "live") {
    return new SlackSource({
      botToken: process.env.SLACK_BOT_TOKEN,
      highlightChannels: process.env.SLACK_HIGHLIGHT_CHANNELS?.split(",")
        .map((c) => c.trim())
        .filter(Boolean),
      defaultChannel: process.env.SLACK_DEFAULT_CHANNEL,
    });
  }
  return new DemoSlackSource();
}
