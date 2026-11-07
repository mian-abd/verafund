import { ErrorBanner, Timeline } from "@/components/guard";
import { getActivity } from "@/lib/guard";
import { getWorkspaceId } from "@/lib/session";

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const workspaceId = (await getWorkspaceId())!;
  const { timeline, merchantById } = await getActivity(workspaceId);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Activity</h1>
        <p className="text-sm text-muted-foreground">
          Every charge decision and policy change in this demo, newest first.
        </p>
      </div>
      <ErrorBanner message={error} />
      <Timeline items={timeline} merchantById={merchantById} />
    </div>
  );
}
