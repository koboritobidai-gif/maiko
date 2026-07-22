"use client";

/**
 * ロール選択(宮崎社長 = exec / 高梨CA = ca)を localStorage に保持する軽量フック。
 * 設計書 4.0(ログイン/ロール選択)に対応。
 */
import { useCallback, useEffect, useState } from "react";
import { CA_MEMBER_ID, EXEC_MEMBER_ID, members } from "@/lib/demo-data";

export type Role = "exec" | "ca";

const STORAGE_KEY = "tobidai-cockpit:role";

export interface RoleProfile {
  role: Role;
  /** 表示名(◯◯さん、◯◯として…) */
  name: string;
  /** members.ts 上の対応 ID */
  memberId: string;
}

const ROLE_PROFILES: Record<Role, RoleProfile> = {
  exec: { role: "exec", name: "宮崎", memberId: EXEC_MEMBER_ID },
  ca: { role: "ca", name: "高梨", memberId: CA_MEMBER_ID },
};

export function getRoleProfile(role: Role): RoleProfile {
  return ROLE_PROFILES[role];
}

export function getMemberForRole(role: Role) {
  const profile = getRoleProfile(role);
  return members.find((m) => m.id === profile.memberId);
}

/**
 * ロールを localStorage に保持するフック。
 * 初回訪問時(未選択時)は role === null となり、呼び出し側でロール選択モーダルを表示する。
 */
export function useSession() {
  const [role, setRoleState] = useState<Role | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "exec" || stored === "ca") {
        // localStorage はクライアントでしか読めないため、初回マウント後に反映する
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRoleState(stored);
      }
    } catch {
      // localStorage が使えない環境ではロール未選択のまま扱う
    } finally {
      setHydrated(true);
    }
  }, []);

  const setRole = useCallback((next: Role) => {
    setRoleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 保存できなくても画面上のロール切替自体は継続させる
    }
  }, []);

  const clearRole = useCallback(() => {
    setRoleState(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // no-op
    }
  }, []);

  return {
    role,
    hydrated,
    profile: role ? getRoleProfile(role) : null,
    setRole,
    clearRole,
  };
}
