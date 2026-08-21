import InvoiceCreatorView from "@/components/InvoiceCreatorView";
import { loadRevenueRecords, revenueDataTimeoutFallback } from "@/lib/revenue-data";
import { withTimeout } from "@/lib/with-timeout";

// app/page.tsx と同じ理由(コメントもそちらを参照)で `force-dynamic` は使わない: Next.js 16 では
// force-dynamic が全 fetch を強制 no-store に上書きするため、messenger.ts等のデータキャッシュ
// (next.revalidate 指定)まで無効化されてしまう。`revalidate = 0` なら動的レンダリングのまま、
// fetch 個別の revalidate 指定は尊重される。
export const revalidate = 0;

// 他ページのローダーと同じ値(with-timeout.ts のコメント参照)。
const LOADER_TIMEOUT_MS = 25_000;

export default async function InvoicePage() {
  const revenueResult = await withTimeout(loadRevenueRecords(), LOADER_TIMEOUT_MS, revenueDataTimeoutFallback);

  return <InvoiceCreatorView records={revenueResult.records} />;
}
