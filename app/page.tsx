import { redirect } from "next/navigation";

function appendSearchParams(target: URLSearchParams, source: Record<string, string | string[] | undefined>) {
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      for (const item of value) target.append(key, item);
      continue;
    }

    if (typeof value === "string" && value.length > 0) {
      target.set(key, value);
    }
  }
}

export default async function HomePage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const nextParams = new URLSearchParams();
  appendSearchParams(nextParams, searchParams);

  const href = nextParams.toString()
    ? `/embedded/restock?${nextParams.toString()}`
    : "/embedded/restock";

  redirect(href);
}
