import { EmbeddedRestockClient } from "@/components/embedded-restock-client";

export default async function EmbeddedRestockPage(props: {
  searchParams: Promise<{
    [key: string]: string | string[] | undefined;
  }>;
}) {
  await props.searchParams;
  return <EmbeddedRestockClient />;
}
