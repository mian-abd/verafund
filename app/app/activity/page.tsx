import { DecisionLog } from "@/components/DecisionLog";
import { ErrorBanner, Timeline } from "@/components/guard";
import { PageHeader, SectionHeading } from "@/components/Page";
import { getActivity } from "@/lib/guard";
import { getWorkspaceId } from "@/lib/session";

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const workspaceId = (await getWorkspaceId())!;
  const { timeline, merchantById } = await getActivity(workspaceId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Activity" description="Every charge decision and policy change, newest first." />
      <ErrorBanner message={error} />
      <DecisionLog workspaceId={workspaceId} />
      <section className="space-y-3" aria-labelledby="timeline-heading">
        <SectionHeading id="timeline-heading" title="Timeline" description="Charges and rule changes across all your cards." />
        <Timeline items={timeline} merchantById={merchantById} />
      </section>
    </div>
  );
}
