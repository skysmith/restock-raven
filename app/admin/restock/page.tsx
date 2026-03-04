import { listSubscriptions, requeueSubscription } from "@/lib/db/subscriptions";
import { revalidatePath } from "next/cache";

async function requeueAction(formData: FormData): Promise<void> {
  "use server";

  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  if (!subscriptionId) return;

  await requeueSubscription(subscriptionId);
  revalidatePath("/admin/restock");
}

export default async function AdminRestockPage(props: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await props.searchParams;
  const subscriptions = await listSubscriptions(q);

  return (
    <main style={{ fontFamily: "sans-serif", padding: 24 }}>
      <h1>Restock Raven Admin</h1>
      <form method="GET" style={{ marginBottom: 16 }}>
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by email, phone, or variant"
          style={{ width: 360, marginRight: 8 }}
        />
        <button type="submit">Search</button>
      </form>

      <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th align="left">Email</th>
            <th align="left">Phone</th>
            <th align="left">Variant</th>
            <th align="left">Status</th>
            <th align="left">Marketing</th>
            <th align="left">Notified</th>
            <th align="left">Action</th>
          </tr>
        </thead>
        <tbody>
          {subscriptions.map((subscription) => (
            <tr key={subscription.id} style={{ borderTop: "1px solid #ddd" }}>
              <td>{subscription.email ?? "-"}</td>
              <td>{subscription.phone ?? "-"}</td>
              <td>{subscription.variant_id}</td>
              <td>{subscription.status}</td>
              <td>{subscription.marketing_opt_in ? "opted-in" : "-"}</td>
              <td>{subscription.notified_at ?? "-"}</td>
              <td>
                <form action={requeueAction}>
                  <input type="hidden" name="subscriptionId" value={subscription.id} />
                  <button type="submit">Resend (Requeue)</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
