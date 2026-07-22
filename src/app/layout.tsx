import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import AppShell from "@/components/AppShell";
import "./globals.css";

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
});

export const metadata: Metadata = {
  title: "Tobidai Cockpit | 株式会社翔び台",
  description: "株式会社翔び台 社内コックピット — 今日の経営をひと目で",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${notoSansJP.variable} h-full`}>
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
