"use client";

import { useState, type ReactNode } from "react";
import Header from "./Header";
import RoleModal from "./RoleModal";
import TabBar from "./TabBar";
import { getRoleProfile, useSession } from "@/store/session";

export default function AppShell({ children }: { children: ReactNode }) {
  const { role, hydrated, setRole } = useSession();
  const [switching, setSwitching] = useState(false);

  if (!hydrated) {
    // localStorage 確認中のちらつき防止(ほぼ一瞬)
    return <div className="app-shell" style={{ background: "var(--color-navy)" }} />;
  }

  return (
    <div className="app-shell">
      {role ? (
        <>
          <Header
            profile={getRoleProfile(role)}
            onRequestSwitchRole={() => setSwitching(true)}
          />
          <main className="flex-1 overflow-y-auto pb-6">{children}</main>
          <TabBar />
        </>
      ) : null}

      {(!role || switching) && (
        <RoleModal
          mandatory={!role}
          onSelect={(next) => {
            setRole(next);
            setSwitching(false);
          }}
          onClose={() => setSwitching(false)}
        />
      )}
    </div>
  );
}
