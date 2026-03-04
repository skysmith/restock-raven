import Link from "next/link";
import { revalidatePath } from "next/cache";
import {
  countSubscriptions,
  getSubscriptionStatusCounts,
  listSubscriptions,
  requeueSubscription
} from "@/lib/db/subscriptions";
import {
  countEvents,
  getEventStatusCounts,
  getVariantInventoryState,
  insertRestockEvent,
  listRecentEvents
} from "@/lib/db/events";
import {
  countMessageLog,
  getMessageStatusCounts,
  listMessageLog
} from "@/lib/db/message-log";
import { getRestockMinQtyFromZero } from "@/lib/jobs/transition";
import { processRestockQueue } from "@/lib/jobs/process-restock";

type SubscriptionStatusFilter = "all" | "active" | "notified" | "unsubscribed";
type EventStatusFilter = "all" | "received" | "queued" | "processed" | "ignored";
type MessageStatusFilter = "all" | "sent" | "failed";
type ChannelFilter = "all" | "email" | "sms";

const SUB_PAGE_SIZE = 50;
const EVENT_PAGE_SIZE = 50;
const MSG_PAGE_SIZE = 100;

function toPositiveInt(value: string | undefined, fallback = 1): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function buildHref(params: {
  q?: string;
  status: SubscriptionStatusFilter;
  eventStatus: EventStatusFilter;
  msgStatus: MessageStatusFilter;
  channel: ChannelFilter;
  subPage: number;
  eventPage: number;
  msgPage: number;
}): string {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.status !== "all") qs.set("status", params.status);
  if (params.eventStatus !== "all") qs.set("eventStatus", params.eventStatus);
  if (params.msgStatus !== "all") qs.set("msgStatus", params.msgStatus);
  if (params.channel !== "all") qs.set("channel", params.channel);
  if (params.subPage > 1) qs.set("subPage", String(params.subPage));
  if (params.eventPage > 1) qs.set("eventPage", String(params.eventPage));
  if (params.msgPage > 1) qs.set("msgPage", String(params.msgPage));
  return `/admin/restock?${qs.toString()}`;
}

function Pager(props: {
  label: string;
  page: number;
  total: number;
  pageSize: number;
  makeHref: (page: number) => string;
}) {
  const totalPages = Math.max(1, Math.ceil(props.total / props.pageSize));
  const clampedPage = Math.min(props.page, totalPages);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 14px" }}>
      <strong>{props.label}</strong>
      <span>
        Page {clampedPage} of {totalPages} ({props.total} rows)
      </span>
      {clampedPage > 1 ? <Link href={props.makeHref(clampedPage - 1)}>Prev</Link> : <span>Prev</span>}
      {clampedPage < totalPages ? <Link href={props.makeHref(clampedPage + 1)}>Next</Link> : <span>Next</span>}
    </div>
  );
}

async function requeueAction(formData: FormData): Promise<void> {
  "use server";

  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  if (!subscriptionId) return;

  await requeueSubscription(subscriptionId);
  revalidatePath("/admin/restock");
}

async function queueManualEvent(variantId: string): Promise<void> {
  const previousQty = await getVariantInventoryState(variantId);
  await insertRestockEvent({
    variantId,
    inventoryFrom: previousQty,
    inventoryTo: getRestockMinQtyFromZero(),
    occurredAt: new Date().toISOString(),
    webhookId: null,
    status: "queued"
  });
}

async function triggerVariantAction(formData: FormData): Promise<void> {
  "use server";

  const variantId = String(formData.get("variantId") ?? "").trim();
  if (!variantId) return;

  await queueManualEvent(variantId);
  revalidatePath("/admin/restock");
}

async function triggerAndProcessAction(formData: FormData): Promise<void> {
  "use server";

  const variantId = String(formData.get("variantId") ?? "").trim();
  if (!variantId) return;

  await queueManualEvent(variantId);
  await processRestockQueue(100);
  revalidatePath("/admin/restock");
}

async function processNowAction(): Promise<void> {
  "use server";
  await processRestockQueue(100);
  revalidatePath("/admin/restock");
}

export default async function AdminRestockPage(props: {
  searchParams: Promise<{
    q?: string;
    status?: SubscriptionStatusFilter;
    eventStatus?: EventStatusFilter;
    msgStatus?: MessageStatusFilter;
    channel?: ChannelFilter;
    subPage?: string;
    eventPage?: string;
    msgPage?: string;
  }>;
}) {
  const {
    q,
    status = "all",
    eventStatus = "all",
    msgStatus = "all",
    channel = "all",
    subPage,
    eventPage,
    msgPage
  } = await props.searchParams;

  const currentSubPage = toPositiveInt(subPage, 1);
  const currentEventPage = toPositiveInt(eventPage, 1);
  const currentMsgPage = toPositiveInt(msgPage, 1);

  const [
    subscriptions,
    subscriptionsTotal,
    subscriptionCounts,
    eventCounts,
    messageCounts,
    events,
    eventsTotal,
    messageLog,
    messageLogTotal
  ] = await Promise.all([
    listSubscriptions(q, status, {
      limit: SUB_PAGE_SIZE,
      offset: (currentSubPage - 1) * SUB_PAGE_SIZE
    }),
    countSubscriptions(q, status),
    getSubscriptionStatusCounts(),
    getEventStatusCounts(),
    getMessageStatusCounts(),
    listRecentEvents(EVENT_PAGE_SIZE, eventStatus, (currentEventPage - 1) * EVENT_PAGE_SIZE),
    countEvents(eventStatus),
    listMessageLog({
      query: q,
      status: msgStatus,
      channel,
      limit: MSG_PAGE_SIZE,
      offset: (currentMsgPage - 1) * MSG_PAGE_SIZE
    }),
    countMessageLog({ query: q, status: msgStatus, channel })
  ]);

  const csvHref = `/api/admin/restock/export?q=${encodeURIComponent(q ?? "")}&status=${encodeURIComponent(
    status
  )}`;

  const baseParams = {
    q,
    status,
    eventStatus,
    msgStatus,
    channel,
    subPage: currentSubPage,
    eventPage: currentEventPage,
    msgPage: currentMsgPage
  };

  return (
    <main style={{ fontFamily: "sans-serif", padding: 24 }}>
      <h1>Restock Raven Admin</h1>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(220px, 1fr))",
          gap: 10,
          marginBottom: 16
        }}
      >
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>
          <strong>Subscriptions</strong>
          <div>Total: {subscriptionCounts.total ?? 0}</div>
          <div>Active: {subscriptionCounts.active ?? 0}</div>
          <div>Notified: {subscriptionCounts.notified ?? 0}</div>
          <div>Unsubscribed: {subscriptionCounts.unsubscribed ?? 0}</div>
        </div>
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>
          <strong>Events</strong>
          <div>Total: {eventCounts.total ?? 0}</div>
          <div>Queued: {eventCounts.queued ?? 0}</div>
          <div>Processed: {eventCounts.processed ?? 0}</div>
          <div>Ignored: {eventCounts.ignored ?? 0}</div>
        </div>
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>
          <strong>Messages</strong>
          <div>Total: {messageCounts.total ?? 0}</div>
          <div>Sent: {messageCounts.sent ?? 0}</div>
          <div>Failed: {messageCounts.failed ?? 0}</div>
        </div>
      </section>

      <form method="GET" style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 8 }}>
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search email, phone, variant"
          style={{ width: 280 }}
        />
        <select name="status" defaultValue={status}>
          <option value="all">All subscriptions</option>
          <option value="active">Active</option>
          <option value="notified">Notified</option>
          <option value="unsubscribed">Unsubscribed</option>
        </select>
        <select name="eventStatus" defaultValue={eventStatus}>
          <option value="all">All events</option>
          <option value="queued">Queued</option>
          <option value="processed">Processed</option>
          <option value="ignored">Ignored</option>
          <option value="received">Received</option>
        </select>
        <select name="msgStatus" defaultValue={msgStatus}>
          <option value="all">All message status</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
        </select>
        <select name="channel" defaultValue={channel}>
          <option value="all">All channels</option>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
        </select>
        <button type="submit">Apply Filters</button>
        <Link href={csvHref}>Export CSV</Link>
      </form>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <form action={triggerVariantAction}>
          <input
            type="text"
            name="variantId"
            placeholder="Variant ID"
            style={{ width: 200, marginRight: 8 }}
          />
          <button type="submit">Queue Manual Restock Event</button>
        </form>

        <form action={triggerAndProcessAction}>
          <input
            type="text"
            name="variantId"
            placeholder="Variant ID"
            style={{ width: 200, marginRight: 8 }}
          />
          <button type="submit">Trigger + Process Now</button>
        </form>

        <form action={processNowAction}>
          <button type="submit">Process Queue Now</button>
        </form>
      </div>

      <h2>Subscriptions</h2>
      <Pager
        label="Subscriptions"
        page={currentSubPage}
        total={subscriptionsTotal}
        pageSize={SUB_PAGE_SIZE}
        makeHref={(page) => buildHref({ ...baseParams, subPage: page })}
      />
      <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%", marginBottom: 24 }}>
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
              <td>{formatCell(subscription.notified_at)}</td>
              <td>
                <form action={requeueAction}>
                  <input type="hidden" name="subscriptionId" value={subscription.id} />
                  <button type="submit">Requeue</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Recent Events</h2>
      <Pager
        label="Events"
        page={currentEventPage}
        total={eventsTotal}
        pageSize={EVENT_PAGE_SIZE}
        makeHref={(page) => buildHref({ ...baseParams, eventPage: page })}
      />
      <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%", marginBottom: 24 }}>
        <thead>
          <tr>
            <th align="left">Occurred</th>
            <th align="left">Variant</th>
            <th align="left">From</th>
            <th align="left">To</th>
            <th align="left">Status</th>
            <th align="left">Processed</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id} style={{ borderTop: "1px solid #ddd" }}>
              <td>{formatCell(event.occurred_at)}</td>
              <td>{event.variant_id}</td>
              <td>{event.inventory_from ?? "-"}</td>
              <td>{event.inventory_to}</td>
              <td>{event.status}</td>
              <td>{formatCell(event.processed_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Message Log</h2>
      <Pager
        label="Messages"
        page={currentMsgPage}
        total={messageLogTotal}
        pageSize={MSG_PAGE_SIZE}
        makeHref={(page) => buildHref({ ...baseParams, msgPage: page })}
      />
      <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th align="left">Sent At</th>
            <th align="left">Channel</th>
            <th align="left">Status</th>
            <th align="left">Contact</th>
            <th align="left">Variant</th>
            <th align="left">Provider ID</th>
            <th align="left">Error</th>
          </tr>
        </thead>
        <tbody>
          {messageLog.map((msg) => (
            <tr key={msg.id} style={{ borderTop: "1px solid #ddd" }}>
              <td>{formatCell(msg.sent_at)}</td>
              <td>{msg.channel}</td>
              <td>{msg.status}</td>
              <td>{msg.email ?? msg.phone ?? "-"}</td>
              <td>{msg.variant_id}</td>
              <td>{msg.provider_message_id ?? "-"}</td>
              <td>{msg.error ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
