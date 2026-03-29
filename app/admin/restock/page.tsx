import { RestockAdminDashboard } from "@/components/restock-admin-dashboard";

export default async function AdminRestockPage(props: {
  searchParams: Promise<{
    q?: string;
    status?: "all" | "active" | "notified" | "unsubscribed";
    eventStatus?: "all" | "received" | "queued" | "processed" | "ignored";
    msgStatus?: "all" | "sent" | "failed";
    channel?: "all" | "email" | "sms";
    debug?: string;
    subPage?: string;
    eventPage?: string;
    msgPage?: string;
  }>;
}) {
  return <RestockAdminDashboard searchParams={props.searchParams} />;
}
