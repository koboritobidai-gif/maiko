import PlaceholderPage from "@/components/PlaceholderPage";
import { IconChat } from "@/components/icons";

export const metadata = { title: "AIに聞く | Tobidai Cockpit" };

export default function AskPage() {
  return (
    <PlaceholderPage
      title="AIに聞く"
      description={
        "「今日の成約は?」「大阪拠点の状況は?」など、気になる数字をチャットで質問できるようになります。回答はデータから計算した正確な数値と一言インサイトつきでお答えします。"
      }
      icon={<IconChat width={30} height={30} />}
    />
  );
}
