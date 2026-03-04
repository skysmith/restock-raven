import type { NextRequest } from "next/server";
import { getEnv } from "@/lib/utils/env";

export function isAuthorizedBasicAuth(authHeader: string | null): boolean {
  if (!authHeader?.startsWith("Basic ")) return false;
  const encoded = authHeader.slice(6);
  const decoded = atob(encoded);
  const idx = decoded.indexOf(":");
  if (idx < 0) return false;

  const username = decoded.slice(0, idx);
  const password = decoded.slice(idx + 1);

  return username === getEnv("ADMIN_USERNAME") && password === getEnv("ADMIN_PASSWORD");
}

export function requireAdminRequest(request: NextRequest): boolean {
  return isAuthorizedBasicAuth(request.headers.get("authorization"));
}
