import { neon } from "@neondatabase/serverless";

function fail(message) {
  console.error(`healthcheck_failed: ${message}`);
  process.exit(1);
}

async function checkDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL is missing");

  const query = neon(url, { fullResults: true });
  const result = await query`SELECT NOW()::text AS db_now, current_database()::text AS db_name`;
  const row = result.rows?.[0] ?? {};

  console.log("healthcheck_ok: database");
  console.log(`db_name=${row.db_name ?? "unknown"}`);
  console.log(`db_time=${row.db_now ?? "unknown"}`);
}

async function checkApi() {
  const url = process.env.HEALTHCHECK_URL;
  if (!url) fail("HEALTHCHECK_URL is missing");

  const headers = {};
  if (process.env.HEALTHCHECK_SECRET) {
    headers["x-health-secret"] = process.env.HEALTHCHECK_SECRET;
  }

  const res = await fetch(url, { headers });
  const body = await res.text();

  if (!res.ok) {
    fail(`api_status=${res.status} body=${body}`);
  }

  console.log("healthcheck_ok: api");
  console.log(body);
}

if (process.env.HEALTHCHECK_MODE === "api") {
  await checkApi();
} else {
  await checkDatabase();
}
