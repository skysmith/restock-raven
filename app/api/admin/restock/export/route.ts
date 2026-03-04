import { NextRequest, NextResponse } from "next/server";
import { listSubscriptions } from "@/lib/db/subscriptions";

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes("\n") || str.includes('"')) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const q = request.nextUrl.searchParams.get("q") ?? undefined;
  const status = (request.nextUrl.searchParams.get("status") as
    | "active"
    | "notified"
    | "unsubscribed"
    | "all"
    | null) ?? "all";

  const rows = await listSubscriptions(q, status);

  const header = [
    "id",
    "email",
    "phone",
    "variant_id",
    "product_id",
    "status",
    "marketing_opt_in",
    "created_at",
    "notified_at"
  ];

  const lines = [header.join(",")];

  for (const row of rows) {
    lines.push(
      [
        row.id,
        row.email,
        row.phone,
        row.variant_id,
        row.product_id,
        row.status,
        row.marketing_opt_in,
        row.created_at,
        row.notified_at
      ]
        .map(escapeCsv)
        .join(",")
    );
  }

  const csv = `${lines.join("\n")}\n`;
  const filename = `restock-subscriptions-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"${filename}\"`
    }
  });
}
