import PlaceholderPage from "@/components/PlaceholderPage";
import { IconDeliver } from "@/components/icons";

export const metadata = { title: "届ける | Tobidai Cockpit" };

export default function DeliverPage() {
  return (
    <PlaceholderPage
      title="届ける"
      description={
        "成果報告やニュース、相談ごとを入力すると、AIが最適な宛先メンバーと配信先Slackチャンネルを理由つきで提案し、整形されたメッセージを送信できるようになります。"
      }
      icon={<IconDeliver width={30} height={30} />}
    />
  );
}
