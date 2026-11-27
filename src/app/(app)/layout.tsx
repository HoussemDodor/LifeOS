import { Sidebar } from "@/components/Sidebar";
import { featureLabel, getAiUsageMonth } from "@/lib/ai-usage";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The AI tracker must never take the app down: on any error the sidebar just leaves it out.
  const usage = await getAiUsageMonth().catch(() => null);
  const ai = usage && {
    costUsd: usage.costUsd,
    capUsd: usage.capUsd,
    calls: usage.calls,
    tokens: usage.tokens,
    breakdown: usage.byFeature.map((b) => ({ label: featureLabel(b.feature), costUsd: b.costUsd, calls: b.calls })),
  };
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <Sidebar ai={ai} />
      <main className="min-w-0 flex-1 px-4 py-8 sm:px-8 md:px-12 md:py-12">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
