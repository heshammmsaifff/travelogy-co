import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const startTime = Date.now();
  let dbStatus = "healthy";
  let dbLatencyMs = 0;

  try {
    const supabase = createServiceRoleClient();
    const t0 = Date.now();
    const { error } = await supabase.from("agencies").select("id").limit(1);
    dbLatencyMs = Date.now() - t0;

    if (error) {
      dbStatus = `degraded: ${error.message}`;
    }
  } catch (err) {
    dbStatus = `error: ${err instanceof Error ? err.message : "Unknown error"}`;
  }

  const isHealthy = !dbStatus.startsWith("error");

  return NextResponse.json(
    {
      status: isHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV ?? "development",
      version: "1.0.0",
      checks: {
        database: {
          status: dbStatus,
          latencyMs: dbLatencyMs,
        },
      },
      durationMs: Date.now() - startTime,
    },
    {
      status: isHealthy ? 200 : 503,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Content-Type": "application/json",
      },
    },
  );
}
