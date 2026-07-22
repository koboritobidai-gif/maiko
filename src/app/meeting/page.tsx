import PlaceholderPage from "@/components/PlaceholderPage";
import { IconMic } from "@/components/icons";

export const metadata = { title: "面談AI | Tobidai Cockpit" };

export default function MeetingPage() {
  return (
    <PlaceholderPage
      title="面談AI(面談コパイロット)"
      description={
        "求職者面談・企業商談の文字起こしを貼るだけで、議事録・インサイト・ネクストアクション・ステージ更新案・フォローメール文面を自動生成できるようになります。"
      }
      icon={<IconMic width={30} height={30} />}
    />
  );
}
