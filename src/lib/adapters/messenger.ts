/**
 * MessengerSource アダプタ
 * Slack投稿の取得(ハイライトフィード)、求職者Slackスレッド(#求職者チャンネル、1人1スレッド運用の
 * 進捗データベース)の取得、メッセージ配信(「届ける」機能)を抽象化する。
 * デモ段階は DemoSlackSource が demo-data.ts の投稿・スレッドを返し、送信は実際には飛ばさず
 * その場でエコーする(コンソール出力+成功レスポンス)。
 * 実連携は SlackSource が Slack Web API(chat.postMessage / conversations.history /
 * conversations.replies / chat.getPermalink / users.info)を直接 fetch で呼び出す
 * (@slack/web-api 等の追加npm依存は使わない)。
 */
import type { CandidateThread, CandidateThreadReply, SlackPost } from "../types";
import { candidateThreads, slackPosts } from "../demo-data";

export interface PostMessageResult {
  ok: boolean;
  post: SlackPost;
}

export interface MessengerSource {
  getRecentPosts(limit?: number): Promise<SlackPost[]>;
  postMessage(channel: string, author: string, body: string): Promise<PostMessageResult>;
  /** 求職者Slackスレッド(#求職者チャンネル)一覧を取得する(更新日時の新しい順)。 */
  getCandidateThreads(): Promise<CandidateThread[]>;
}

/** デモ実装: demo-data.ts の投稿・スレッドを返し、送信はメモリ上でエコーするのみ。 */
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

  async getCandidateThreads(): Promise<CandidateThread[]> {
    return [...candidateThreads].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
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
  let res = await fetch(url, {
    headers: { Authorization: `Bearer ${botToken}` },
    cache: "no-store",
  });
  // レート制限(429)のときは Retry-After 秒(最大10秒)待って1回だけやり直す。
  // 求職者スレッドを最大250件読むようになり、瞬間的に制限へ達することがあるため。
  if (res.status === 429) {
    const retryAfter = Math.min(Number(res.headers.get("retry-after") ?? "1") || 1, 10);
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${botToken}` },
      cache: "no-store",
    });
  }
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

interface SlackMessage {
  ts: string;
  text?: string;
  user?: string;
  bot_id?: string;
  subtype?: string;
  /** 親メッセージのみに含まれる、スレッド内の返信数(conversations.history 経由)。 */
  reply_count?: number;
  /** 親メッセージのみに含まれる、最新返信の ts。スレッド返信キャッシュの鮮度判定に使う。 */
  latest_reply?: string;
}

/**
 * スレッド返信のモジュールメモリキャッシュ。キーはスレッドの ts、cacheKey は「返信数:最新返信ts」。
 * 求職者スレッドを最大100件読むため、変化のないスレッドの conversations.replies 再取得を省き、
 * Slack API のレート制限(1分あたりの呼び出し数)に達しにくくする。
 */
const threadRepliesCache = new Map<string, { cacheKey: string; replies: CandidateThreadReply[] }>();

interface SlackHistoryResponse extends SlackApiResponseBase {
  messages?: SlackMessage[];
  response_metadata?: { next_cursor?: string };
}

interface SlackRepliesResponse extends SlackApiResponseBase {
  messages?: SlackMessage[];
}

interface SlackPermalinkResponse extends SlackApiResponseBase {
  permalink?: string;
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
      /** 求職者データベース(#求職者チャンネル)の取得対象チャンネルID */
      candidateChannel?: string;
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

  /**
   * Slackメッセージ本文を表示用に整形する。
   * `<@U…>` メンションは可能な限り表示名へ、`<url|label>` は label へ、`<url>` は url(素の文字列)へ変換する。
   */
  private async formatMessageText(botToken: string, text: string): Promise<string> {
    if (!text) return "";
    let formatted = text;

    // <@U12345> → @表示名(解決できるユーザーIDのみ置換)
    const mentionIds = Array.from(new Set(Array.from(text.matchAll(/<@([A-Z0-9]+)>/g)).map((m) => m[1])));
    for (const userId of mentionIds) {
      const name = await this.resolveUserName(botToken, userId);
      formatted = formatted.replaceAll(`<@${userId}>`, `@${name}`);
    }

    // <https://...|表示ラベル> → 表示ラベル
    formatted = formatted.replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, "$2");
    // <https://...> → https://...(角括弧のみ除去)
    formatted = formatted.replace(/<(https?:\/\/[^>]+)>/g, "$1");

    return formatted;
  }

  /**
   * 求職者データベース(#求職者チャンネル)の1スレッド分の返信を取得する(最大50件)。
   * 親メッセージ自身・subtype付き(channel_joinなど)・ボット投稿は除外する。
   */
  private async fetchThreadReplies(
    botToken: string,
    channelId: string,
    threadTs: string,
  ): Promise<CandidateThreadReply[]> {
    const res = await slackGet<SlackRepliesResponse>(botToken, "conversations.replies", {
      channel: channelId,
      ts: threadTs,
      limit: "50",
    });
    const replyMessages = (res.messages ?? []).filter(
      (m) => m.ts !== threadTs && !m.subtype && !m.bot_id && m.text,
    );
    return Promise.all(
      replyMessages.map(async (m) => ({
        author: m.user ? await this.resolveUserName(botToken, m.user) : "Slack Bot",
        postedAt: new Date(Number(m.ts.split(".")[0]) * 1000),
        text: await this.formatMessageText(botToken, m.text ?? ""),
      })),
    );
  }

  /** 親メッセージへのパーマリンクを取得する。失敗しても処理は継続する(undefined を返す)。 */
  private async fetchPermalink(
    botToken: string,
    channelId: string,
    messageTs: string,
  ): Promise<string | undefined> {
    try {
      const res = await slackGet<SlackPermalinkResponse>(botToken, "chat.getPermalink", {
        channel: channelId,
        message_ts: messageTs,
      });
      return res.permalink;
    } catch {
      return undefined;
    }
  }

  /**
   * 求職者Slackスレッド(#求職者チャンネル、1人1スレッド運用)を取得する。
   * conversations.history で親メッセージ(reply_count>0 のものがスレッドの親)を取得し、
   * subtype付き(channel_joinなど)とボット投稿は除外、親テキストの1行目(20文字まで)を
   * name とする。
   *
   * API呼び出し数を抑えるための工夫:
   * - conversations.replies(返信取得)は「直近アクティブな250スレッド」まで。さらに
   *   返信数・最新返信tsが前回から変わっていないスレッドはメモリキャッシュを使い再取得しない
   * - パーマリンクは chat.getPermalink を先頭の1件だけに呼び、返ってきたURLからワークスペースの
   *   ドメインを覚えて、残りは「https://◯◯.slack.com/archives/チャンネル/p<ts>」形式で組み立てる
   * - 取得は10スレッドずつに分けて実行し、瞬間的なレート制限(429)を避ける
   */
  async getCandidateThreads(): Promise<CandidateThread[]> {
    const botToken = this.requireToken();
    const channelId = this.config.candidateChannel;
    if (!channelId) {
      throw new Error("環境変数 SLACK_CANDIDATE_CHANNEL(#求職者のチャンネルID)を設定してください。");
    }

    // CA別実績で6月分まで表示したいという経営者の要望のため、履歴は約4ヶ月(120日)前まで
    // カーソルページングで遡る(以前は直近100メッセージのみで、古い月のスレッドが範囲外に落ちていた)。
    // 返信取得の上限も同じ理由で250スレッドまで拡大(返信キャッシュにより2回目以降の取得は差分のみ)。
    const REPLY_FETCH_LIMIT = 250;
    const THREAD_CONCURRENCY = 10;
    const HISTORY_LOOKBACK_DAYS = 120;
    const HISTORY_MAX_MESSAGES = 600;

    const oldest = String(Math.floor(Date.now() / 1000) - HISTORY_LOOKBACK_DAYS * 86400);
    const historyMessages: SlackMessage[] = [];
    let cursor: string | undefined;
    do {
      const history = await slackGet<SlackHistoryResponse>(botToken, "conversations.history", {
        channel: channelId,
        limit: "200",
        oldest,
        ...(cursor ? { cursor } : {}),
      });
      historyMessages.push(...(history.messages ?? []));
      cursor = history.response_metadata?.next_cursor || undefined;
    } while (cursor && historyMessages.length < HISTORY_MAX_MESSAGES);

    const parents = historyMessages.filter((m) => !m.subtype && !m.bot_id && m.text);

    // パーマリンクの土台(https://◯◯.slack.com/archives/)を先頭1件のAPI呼び出しから求める。
    let permalinkBase: string | undefined;
    if (parents.length > 0) {
      const first = await this.fetchPermalink(botToken, channelId, parents[0].ts);
      const match = first?.match(/^(https:\/\/[^/]+\/archives\/)/);
      permalinkBase = match?.[1];
    }
    const buildPermalink = (ts: string): string | undefined =>
      permalinkBase ? `${permalinkBase}${channelId}/p${ts.replace(".", "")}` : undefined;

    const buildThread = async (m: SlackMessage, index: number): Promise<CandidateThread> => {
      const firstLine = (m.text ?? "").split("\n")[0]?.trim() ?? "";
      const name = firstLine.slice(0, 20);
      const registeredAt = new Date(Number(m.ts.split(".")[0]) * 1000);
      const replyCount = m.reply_count ?? 0;
      const withinBudget = index < REPLY_FETCH_LIMIT;

      let replies: CandidateThreadReply[] = [];
      if (replyCount > 0 && withinBudget) {
        const cacheKey = `${replyCount}:${m.latest_reply ?? ""}`;
        const cached = threadRepliesCache.get(m.ts);
        if (cached && cached.cacheKey === cacheKey) {
          replies = cached.replies;
        } else {
          replies = await this.fetchThreadReplies(botToken, channelId, m.ts);
          threadRepliesCache.set(m.ts, { cacheKey, replies });
        }
      }

      const latest = replies[replies.length - 1];
      return {
        threadTs: m.ts,
        name,
        registeredAt,
        updatedAt: latest ? latest.postedAt : registeredAt,
        replyCount,
        parentText: await this.formatMessageText(botToken, m.text ?? ""),
        latestText: latest ? latest.text : "",
        permalink: buildPermalink(m.ts),
        replies,
      };
    };

    // 10スレッドずつ順に処理する(多数スレッドの一斉並列でレート制限に当たるのを避ける)。
    const threads: CandidateThread[] = [];
    for (let i = 0; i < parents.length; i += THREAD_CONCURRENCY) {
      const chunk = parents.slice(i, i + THREAD_CONCURRENCY);
      threads.push(...(await Promise.all(chunk.map((m, j) => buildThread(m, i + j)))));
    }

    return threads.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
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
      candidateChannel: process.env.SLACK_CANDIDATE_CHANNEL,
    });
  }
  return new DemoSlackSource();
}
