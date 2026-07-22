/**
 * SpreadsheetSource アダプタ
 * 求職者・成約・拠点・プロジェクト・メンバーのマスタデータを取得する抽象化層。
 * デモ段階は DemoSpreadsheetSource が demo-data.ts を返す。
 * 実連携時は GoogleSheetsSource を実装して差し替える(6章参照)。
 */
import type { Branch, Candidate, Member, Placement, Project } from "../types";
import {
  branches,
  candidates,
  members,
  placements,
  projects,
} from "../demo-data";

export interface SpreadsheetSource {
  getCandidates(): Promise<Candidate[]>;
  getPlacements(): Promise<Placement[]>;
  getBranches(): Promise<Branch[]>;
  getProjects(): Promise<Project[]>;
  getMembers(): Promise<Member[]>;
}

/** デモ実装: demo-data.ts の内容をそのまま返す。 */
export class DemoSpreadsheetSource implements SpreadsheetSource {
  async getCandidates(): Promise<Candidate[]> {
    return candidates;
  }
  async getPlacements(): Promise<Placement[]> {
    return placements;
  }
  async getBranches(): Promise<Branch[]> {
    return branches;
  }
  async getProjects(): Promise<Project[]> {
    return projects;
  }
  async getMembers(): Promise<Member[]> {
    return members;
  }
}

/**
 * 実連携スタブ: Google スプレッドシート連携。
 *
 * 差し替え手順:
 * 1. `npm install googleapis` (もしくは `google-spreadsheet`)
 * 2. Google Cloud でサービスアカウントを発行し、対象スプレッドシートを
 *    サービスアカウントのメールアドレスに共有(閲覧/編集権限)
 * 3. `.env` に `GOOGLE_SERVICE_ACCOUNT_JSON`(鍵JSON) と `SHEET_ID` を設定
 * 4. コンストラクタで JWT クライアントを生成し、各メソッド内で
 *    `sheets.spreadsheets.values.get({ spreadsheetId, range })` を呼び出して
 *    行データを対応する型(Candidate/Placement/...)へマッピングする
 * 5. `getSpreadsheetSource()` の `DATA_MODE` 分岐が自動的にこちらへ切り替わる
 */
export class GoogleSheetsSource implements SpreadsheetSource {
  constructor(
    private readonly config: {
      serviceAccountJson?: string;
      sheetId?: string;
    } = {},
  ) {}

  async getCandidates(): Promise<Candidate[]> {
    throw new Error(
      "GoogleSheetsSource は未実装です。docs/DESIGN.md 6章の手順に従って実装してください。",
    );
  }
  async getPlacements(): Promise<Placement[]> {
    throw new Error("GoogleSheetsSource.getPlacements is not implemented yet.");
  }
  async getBranches(): Promise<Branch[]> {
    throw new Error("GoogleSheetsSource.getBranches is not implemented yet.");
  }
  async getProjects(): Promise<Project[]> {
    throw new Error("GoogleSheetsSource.getProjects is not implemented yet.");
  }
  async getMembers(): Promise<Member[]> {
    throw new Error("GoogleSheetsSource.getMembers is not implemented yet.");
  }
}

/** `DATA_MODE` 環境変数(`live` | `demo`)に応じてアダプタを切り替える。既定はデモ。 */
export function getSpreadsheetSource(): SpreadsheetSource {
  if (process.env.DATA_MODE === "live") {
    return new GoogleSheetsSource({
      serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
      sheetId: process.env.SHEET_ID,
    });
  }
  return new DemoSpreadsheetSource();
}
