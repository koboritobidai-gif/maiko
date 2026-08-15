"use client";

import { useState, type ReactNode } from "react";
import Header from "./Header";
import RoleModal from "./RoleModal";
import Sidebar from "./Sidebar";
import TabBar from "./TabBar";
import { getRoleProfile, useSession } from "@/store/session";

export default function AppShell({ children }: { children: ReactNode }) {
  const { role, hydrated, setRole } = useSession();
  const [switching, setSwitching] = useState(false);

  if (!hydrated) {
    // localStorage 確認中のちらつき防止(ほぼ一瞬)
    return <div className="min-h-dvh" style={{ background: "var(--color-bg)" }} />;
  }

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row" style={{ background: "var(--color-bg)" }}>
      {role && <Sidebar />}

      <div className="flex min-h-dvh flex-1 flex-col lg:min-w-0">
        {role ? (
          <>
            <Header
              profile={getRoleProfile(role)}
              onRequestSwitchRole={() => setSwitching(true)}
            />
            <main className="flex-1 overflow-y-auto pb-6 lg:pb-12">{children}</main>
            <TabBar />
          </>
        ) : null}
      </div>

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
