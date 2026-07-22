import ProposalView from "@/components/ProposalView";
import { loadDataBundle } from "@/lib/data-bundle";

export const metadata = { title: "提案書 | Tobidai Cockpit" };
export const revalidate = 60;

export default async function ProposalPage() {
  const bundle = await loadDataBundle();
  return <ProposalView candidates={bundle.candidates} branches={bundle.branches} />;
}
