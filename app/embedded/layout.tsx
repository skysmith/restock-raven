import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getEnv } from "@/lib/utils/env";

export function generateMetadata(): Metadata {
  return {
    other: {
      "shopify-api-key": getEnv("SHOPIFY_CLIENT_ID"),
    },
  };
}

export default function EmbeddedLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
      {children}
    </>
  );
}
