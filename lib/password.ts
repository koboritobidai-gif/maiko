import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * パスワードのハッシュ化。
 * Next.js に依存させないことで、seed スクリプトからも同じ実装を使えるようにする。
 */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length);
  // 長さが違うと timingSafeEqual が例外を投げるため先に確認する。
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
