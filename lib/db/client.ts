import { neon } from "@neondatabase/serverless";
import { getEnv } from "@/lib/utils/env";

interface SqlResult<T> {
  rows: T[];
  rowCount: number | null;
}

export function sql<T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<SqlResult<T>> {
  const query = neon(getEnv("DATABASE_URL"), { fullResults: true });
  return query(strings, ...values) as unknown as Promise<SqlResult<T>>;
}
