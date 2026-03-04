import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/utils/env";
import { processRestockQueue } from "@/lib/jobs/process-restock";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = request.headers.get("x-job-secret");
  const querySecret = request.nextUrl.searchParams.get("secret");
  if (secret !== getEnv("CRON_JOB_SECRET") && querySecret !== getEnv("CRON_JOB_SECRET")) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await processRestockQueue(100);
  return NextResponse.json({ ok: true, ...result });
}
