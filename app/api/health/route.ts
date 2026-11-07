import { sql } from "drizzle-orm";
import { databaseKind, getDb } from "@/lib/db/client";
import { paymentsMode } from "@/lib/payments";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    await db.run(sql`select 1`);
    return Response.json({ ok: true, database: databaseKind(), payments: paymentsMode() });
  } catch (err) {
    console.error("[health]", err);
    return Response.json(
      { ok: false, database: databaseKind(), payments: paymentsMode(), error: "database unreachable" },
      { status: 503 },
    );
  }
}
