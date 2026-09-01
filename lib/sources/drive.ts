import { createSign } from "node:crypto";
import { findMeetingDate, looksLikeMinutes, type MinutesDoc, type MinutesSource } from "./types.ts";

/**
 * Google ドライブ（Google ドキュメント）から議事録を取り込む。
 *
 * サービスアカウントで認証する。議事録を置いているフォルダをサービスアカウントに
 * 共有しておけば、そのフォルダの更新分を定期的に取り込める。
 * googleapis パッケージは大きいので、必要な 2 つの API だけ直接呼んでいる。
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const DOC_MIME = "application/vnd.google-apps.document";

function env(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

function privateKey(): string {
  // .env に 1 行で入れられるよう、\n をエスケープしたまま渡せるようにする。
  return env("MINUTES_DRIVE_PRIVATE_KEY").replace(/\\n/g, "\n");
}

const base64url = (input: string | Buffer) =>
  Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** サービスアカウントの鍵で署名した JWT をアクセストークンと交換する。 */
async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: env("MINUTES_DRIVE_CLIENT_EMAIL"),
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = base64url(signer.sign(privateKey()));

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
  });
  const data = (await response.json()) as { access_token?: string; error_description?: string };
  if (!data.access_token) {
    throw new Error(`Google の認証に失敗しました: ${data.error_description ?? "不明なエラー"}`);
  }
  return data.access_token;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink?: string;
  parents?: string[];
}

export const driveSource: MinutesSource = {
  name: "drive",
  label: "Google ドライブ",
  requirement: "MINUTES_DRIVE_CLIENT_EMAIL / MINUTES_DRIVE_PRIVATE_KEY / MINUTES_DRIVE_FOLDERS",
  configured: () =>
    Boolean(env("MINUTES_DRIVE_CLIENT_EMAIL") && env("MINUTES_DRIVE_PRIVATE_KEY") && env("MINUTES_DRIVE_FOLDERS")),

  async fetchRecent(days: number): Promise<MinutesDoc[]> {
    const auth = { Authorization: `Bearer ${await accessToken()}` };
    const folders = env("MINUTES_DRIVE_FOLDERS").split(",").map((f) => f.trim()).filter(Boolean);
    const execFolders = new Set(
      env("MINUTES_DRIVE_EXEC_FOLDERS").split(",").map((f) => f.trim()).filter(Boolean),
    );
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const docs: MinutesDoc[] = [];

    for (const folder of [...new Set([...folders, ...execFolders])]) {
      const query = new URLSearchParams({
        q: `'${folder}' in parents and mimeType='${DOC_MIME}' and modifiedTime > '${since}' and trashed = false`,
        fields: "files(id,name,mimeType,modifiedTime,webViewLink)",
        pageSize: "50",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
      });
      const listed = await fetch(`https://www.googleapis.com/drive/v3/files?${query}`, { headers: auth });
      if (!listed.ok) {
        throw new Error(`Google ドライブの一覧取得に失敗しました（${listed.status}）`);
      }
      const { files = [] } = (await listed.json()) as { files: DriveFile[] };

      for (const file of files) {
        // 議事録専用フォルダを指定している場合を考え、フォルダ内は名前で絞り込みすぎない。
        if (!looksLikeMinutes(file.name) && env("MINUTES_DRIVE_ALL", "1") !== "1") continue;

        const exported = await fetch(
          `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain&supportsAllDrives=true`,
          { headers: auth },
        );
        if (!exported.ok) continue;
        const body = (await exported.text()).trim();
        if (!body) continue;

        docs.push({
          source: "drive",
          externalId: file.id,
          title: file.name,
          meetingDate: findMeetingDate(file.name, file.modifiedTime.slice(0, 10)),
          url: file.webViewLink ?? `https://docs.google.com/document/d/${file.id}/edit`,
          author: "",
          body,
          visibility: execFolders.has(folder) ? "executive" : "all",
        });
      }
    }
    return docs;
  },
};
