/**
 * MessengerSource アダプタ
 * Slack投稿の取得と、メッセージ配信(「届ける」機能)を抽象化する。
 * デモ段階は DemoSlackSource が demo-data.ts の投稿を返し、送信は実際には飛ばさず
 * その場でエコーする(コンソール出力+成功レスポンス)。
 * 実連携時は SlackSource を実装して差し替える(6章参照)。
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

/**
 * 実連携スタブ: Slack API 連携。
 *
 * 差し替え手順:
 * 1. `npm install @slack/web-api`
 * 2. Slack App を作成し、Bot Token Scopes に `chat:write` / `channels:history` を付与
 * 3. ワークスペースにインストールし、Bot User OAuth Token を取得
 * 4. `.env` に `SLACK_BOT_TOKEN` を設定
 * 5. コンストラクタで `new WebClient(process.env.SLACK_BOT_TOKEN)` を生成し、
 *    `getRecentPosts` は `conversations.history`、`postMessage` は `chat.postMessage`
 *    をそれぞれ呼び出して SlackPost 型へマッピングする
 * 6. `getMessengerSource()` の `DATA_MODE` 分岐が自動的にこちらへ切り替わる
 */
export class SlackSource implements MessengerSource {
  constructor(private readonly config: { botToken?: string } = {}) {}

  async getRecentPosts(): Promise<SlackPost[]> {
    throw new Error(
      "SlackSource は未実装です。docs/DESIGN.md 6章の手順に従って実装してください。",
    );
  }

  async postMessage(): Promise<PostMessageResult> {
    throw new Error("SlackSource.postMessage is not implemented yet.");
  }
}

/** `DATA_MODE` 環境変数(`live` | `demo`)に応じてアダプタを切り替える。既定はデモ。 */
export function getMessengerSource(): MessengerSource {
  if (process.env.DATA_MODE === "live") {
    return new SlackSource({ botToken: process.env.SLACK_BOT_TOKEN });
  }
  return new DemoSlackSource();
}
