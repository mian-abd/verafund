// Subscription discovery: find recurring charges in a workspace's transaction history
// (seeded or imported from Plaid) and turn the ones the user picks into guarded cards.
// INTERFACE ONLY: implemented by the discovery feature. Other modules (the Vera agent)
// depend on these exact signatures.

export interface DiscoveredSubscription {
  merchant: string; // normalized display name, e.g. "Netflix"
  category: string; // our category, e.g. "Streaming" or "subscriptions"
  amountCents: number; // most recent charge, positive cents
  cycle: "monthly" | "yearly";
  occurrences: number; // how many matching charges were found
  lastChargedAt: number; // ms
  nextExpectedAt: number; // ms, estimated
  confidence: number; // 0..1, how sure we are it is a subscription
  reason: string; // plain English, e.g. "3 charges of $15.99 about 30 days apart"
  source: "rules" | "rules+jev";
  alreadyGuarded: boolean; // a guarded subscription with this merchant already exists
  priceChanged: boolean; // the latest charge differs from the earlier ones
}

export async function discoverSubscriptions(_workspaceId: string): Promise<DiscoveredSubscription[]> {
  throw new Error("discoverSubscriptions is not implemented yet");
}

// Creates a guarded card for each chosen merchant (limit = its latest price).
// Returns how many were created. Skips merchants that are already guarded.
export async function guardDiscovered(_workspaceId: string, _merchants: string[]): Promise<number> {
  throw new Error("guardDiscovered is not implemented yet");
}
