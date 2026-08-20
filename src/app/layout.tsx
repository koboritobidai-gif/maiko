import type { Metadata, Viewport } from "next";
import { AppFrame } from "@/components/app-frame";
import { AppStoreProvider } from "@/store/app-store";
import "./globals.css";

export const metadata: Metadata = {
  title: "naruトレ｜家でできるパーソナルトレーニング",
  description:
    "パーソナルトレーナーnaruが監修。初心者から上級者まで、あなたに合った強度のメニューを自動作成。器具なし・自宅で運動習慣をつくるアプリ。",
  applicationName: "naruトレ",
  appleWebApp: { capable: true, title: "naruトレ", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <AppStoreProvider>
          <AppFrame>{children}</AppFrame>
        </AppStoreProvider>
      </body>
    </html>
  );
}
