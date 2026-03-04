import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/client";

function isAuthorized(request: NextRequest): boolean {
  const configured = process.env.HEALTHCHECK_SECRET;
  if (!configured) return true;

  const headerSecret = request.headers.get("x-health-secret");
  const querySecret = request.nextUrl.searchParams.get("secret");
  return headerSecret === configured || querySecret === configured;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sql<{ db_now: string; db_name: string }>`
      SELECT NOW()::text AS db_now, current_database()::text AS db_name
    `;

    return NextResponse.json({
      ok: true,
      service: "restock-raven",
      timestamp: new Date().toISOString(),
      database: result.rows[0]?.db_name ?? null,
      dbTime: result.rows[0]?.db_now ?? null
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        service: "restock-raven",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Database healthcheck failed"
      },
      { status: 500 }
    );
  }
}
