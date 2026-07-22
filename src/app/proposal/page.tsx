import PlaceholderPage from "@/components/PlaceholderPage";
import { IconDocument } from "@/components/icons";

export const metadata = { title: "提案書 | Tobidai Cockpit" };

export default function ProposalPage() {
  return (
    <PlaceholderPage
      title="提案書(AI推薦状ジェネレーター)"
      description={
        "求職者条件フォームを入力すると、企業向けの推薦状・提案書(推薦理由・スキルサマリ・想定手数料つき)をA4風プレビューで生成できるようになります。"
      }
      icon={<IconDocument width={30} height={30} />}
    />
  );
}
