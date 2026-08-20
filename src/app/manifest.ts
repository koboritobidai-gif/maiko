import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "naruトレ｜家でできるパーソナルトレーニング",
    short_name: "naruトレ",
    description:
      "初心者から上級者まで、あなたに合った強度のメニューを自動作成。器具なし・自宅で運動習慣をつくるアプリ。",
    lang: "ja",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f6fb",
    theme_color: "#2563eb",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
