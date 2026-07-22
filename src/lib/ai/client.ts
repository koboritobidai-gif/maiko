/**
 * Claude API 呼び出しクライアント。
 * `ANTHROPIC_API_KEY` が設定されていれば実際に Claude API を呼び出し、
 * 設定されていなければ null を返す。呼び出し元(ai/demo-responder.ts や各 API route)は
 * null が返ってきた場合にデモレスポンダへフォールバックすること。
 */
import Anthropic from "@anthropic-ai/sdk";

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) {
    return null;
  }
  if (!cachedClient) {
    cachedClient = new Anthropic();
  }
  return cachedClient;
}

/**
 * system プロンプトと user 入力を渡して Claude の応答テキストを取得する。
 * API キーが無い、もしくは呼び出しに失敗した場合は null を返す。
 */
export async function askClaude(
  system: string,
  user: string,
): Promise<string | null> {
  const client = getClient();
  if (!client) {
    return null;
  }

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: user }],
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );
    return textBlock?.text ?? null;
  } catch (error) {
    console.error("[ai/client] Claude API の呼び出しに失敗しました:", error);
    return null;
  }
}

/** API キーが設定されているかどうか(UI表示・分岐用)。 */
export function isClaudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
