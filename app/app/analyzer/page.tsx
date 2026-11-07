import { and, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AnalysisResult, CheckHistory } from "@/components/analyzer/AnalysisResult";
import { AnalyzerForm } from "@/components/analyzer/AnalyzerForm";
import { visionEnabled } from "@/lib/ai";
import { getDb } from "@/lib/db/client";
import { purchaseChecks } from "@/lib/db/schema";
import { getWorkspaceId } from "@/lib/session";
import { parseStored } from "./stored";

export const dynamic = "force-dynamic";

export default async function AnalyzerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; check?: string }>;
}) {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) redirect("/");
  const { error, check } = await searchParams;

  const db = await getDb();
  const history = await db
    .select()
    .from(purchaseChecks)
    .where(eq(purchaseChecks.workspaceId, workspaceId))
    .orderBy(desc(purchaseChecks.createdAt))
    .limit(30);

  let selected: (typeof history)[number] | undefined;
  if (typeof check === "string" && check) {
    selected = history.find((r) => r.id === check);
    if (!selected) {
      const [row] = await db
        .select()
        .from(purchaseChecks)
        .where(and(eq(purchaseChecks.id, check), eq(purchaseChecks.workspaceId, workspaceId)));
      selected = row;
    }
  }
  const analysis = selected ? parseStored(selected.analysis) : null;
  const missingCheck = Boolean(check) && (!selected || !analysis);

  return (
    <div className="mx-auto max-w-3xl space-y-4" data-testid="analyzer-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Purchase Analyzer</h1>
        <p className="text-sm text-muted-foreground">
          See what something really costs: hours of work, share of income, budget room and how it affects your goals.
        </p>
      </div>

      <AnalyzerForm key={selected?.id ?? "new"} aiOnline={visionEnabled()} error={error ?? (missingCheck ? "That check could not be found." : null)} />

      {selected && analysis && (
        <AnalysisResult item={selected.item} createdAt={selected.createdAt} analysis={analysis} />
      )}

      <CheckHistory
        activeId={selected?.id ?? null}
        rows={history.map((r) => ({
          id: r.id,
          item: r.item,
          priceCents: r.priceCents,
          verdict: r.verdict,
          createdAt: r.createdAt,
        }))}
      />
    </div>
  );
}
