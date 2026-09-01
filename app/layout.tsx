import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "フェース タスク管理",
  description: "株式会社フェース｜MTGで決まったタスクの進行状況を全社で把握するダッシュボード",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
