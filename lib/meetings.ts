import { db } from "./db.ts";
import type { Visibility } from "./types.ts";

/**
 * 会議名のマスタ。
 *
 * 会議名を自由入力にすると表記ゆれで集計が割れるため、選択式にしている。
 * 会議ごとに既定の公開範囲を持たせ、役員会の議事録は自動的に役員限定として扱う。
 */

export interface MeetingType {
  id: number;
  name: string;
  visibility: Visibility;
  sortOrder: number;
  active: boolean;
}

export async function listMeetingTypes(includeInactive = false): Promise<MeetingType[]> {
  const client = await db();
  const result = await client.execute(
    `SELECT id, name, visibility, sort_order, active FROM meeting_types
     ${includeInactive ? "" : "WHERE active = 1"}
     ORDER BY sort_order, id`,
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name),
    visibility: row.visibility as Visibility,
    sortOrder: Number(row.sort_order ?? 0),
    active: Boolean(row.active),
  }));
}

/** 会議名から既定の公開範囲を引く。未登録の会議名は全社員扱い。 */
export async function visibilityForMeeting(name: string): Promise<Visibility> {
  if (!name) return "all";
  const client = await db();
  const result = await client.execute({
    sql: `SELECT visibility FROM meeting_types WHERE name = ? LIMIT 1`,
    args: [name],
  });
  return (result.rows[0]?.visibility as Visibility) ?? "all";
}

export async function addMeetingType(
  name: string,
  visibility: Visibility,
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("会議名を入力してください。");
  const client = await db();
  const max = await client.execute(`SELECT COALESCE(MAX(sort_order), 0) AS n FROM meeting_types`);
  await client.execute({
    sql: `INSERT INTO meeting_types (name, visibility, sort_order, active) VALUES (?,?,?,1)`,
    args: [trimmed, visibility, Number(max.rows[0]?.n ?? 0) + 10],
  });
}

export async function updateMeetingType(
  id: number,
  patch: { visibility?: Visibility; active?: boolean },
): Promise<void> {
  const client = await db();
  if (patch.visibility !== undefined) {
    await client.execute({
      sql: `UPDATE meeting_types SET visibility = ? WHERE id = ?`,
      args: [patch.visibility, id],
    });
  }
  if (patch.active !== undefined) {
    await client.execute({
      sql: `UPDATE meeting_types SET active = ? WHERE id = ?`,
      args: [patch.active ? 1 : 0, id],
    });
  }
}
