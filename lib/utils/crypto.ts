import crypto from "node:crypto";

export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("hex");
}

export function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex");
}
