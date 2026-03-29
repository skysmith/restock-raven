import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/utils/env";

interface SessionTokenPayload {
  iss?: string;
  dest?: string;
  aud?: string;
  sub?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  sid?: string;
  sig?: string;
  [key: string]: unknown;
}

export interface VerifiedShopifySessionToken {
  shop: string;
  userId: string | null;
  payload: SessionTokenPayload;
  token: string;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

function encodeBase64Url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function normalizeShopHost(value: string): string {
  const normalized = value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`;
  return new URL(normalized).host.toLowerCase();
}

function extractBearerToken(header: string | null): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return null;
  return trimmed.slice(7).trim() || null;
}

export function getShopifySessionTokenFromAuthorizationHeader(header: string | null): string | null {
  return extractBearerToken(header);
}

export function verifyShopifySessionToken(token: string): VerifiedShopifySessionToken {
  const clientId = getEnv("SHOPIFY_CLIENT_ID");
  const clientSecret = getEnv("SHOPIFY_CLIENT_SECRET");
  const expectedShop = normalizeShopHost(getEnv("SHOPIFY_STORE_DOMAIN"));

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed Shopify session token");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = JSON.parse(decodeBase64Url(encodedHeader)) as { alg?: string; typ?: string };
  if (header.alg !== "HS256") {
    throw new Error(`Unsupported Shopify session token algorithm: ${header.alg ?? "unknown"}`);
  }

  const payload = JSON.parse(decodeBase64Url(encodedPayload)) as SessionTokenPayload;
  if (payload.aud !== clientId) {
    throw new Error("Shopify session token audience mismatch");
  }

  if (!payload.dest) {
    throw new Error("Shopify session token missing destination");
  }

  const destHost = normalizeShopHost(payload.dest);
  if (destHost !== expectedShop) {
    throw new Error(`Shopify session token destination mismatch: ${destHost}`);
  }

  if (!payload.iss) {
    throw new Error("Shopify session token missing issuer");
  }

  const issuerHost = normalizeShopHost(payload.iss);
  if (issuerHost !== expectedShop) {
    throw new Error(`Shopify session token issuer mismatch: ${issuerHost}`);
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= now) {
    throw new Error("Shopify session token expired");
  }

  if (typeof payload.nbf !== "number" || payload.nbf > now + 5) {
    throw new Error("Shopify session token not active yet");
  }

  const expectedSignature = encodeBase64Url(
    createHmac("sha256", clientSecret).update(`${encodedHeader}.${encodedPayload}`).digest()
  );
  const providedSignature = encodedSignature;
  const expectedBuffer = Buffer.from(expectedSignature);
  const providedBuffer = Buffer.from(providedSignature);
  if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) {
    throw new Error("Shopify session token signature mismatch");
  }

  return {
    shop: destHost,
    userId: typeof payload.sub === "string" ? payload.sub : null,
    payload,
    token
  };
}
