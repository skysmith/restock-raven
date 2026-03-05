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
    <div className="rr-pager">
      <strong className="rr-pager-label">{props.label}</strong>
      <span className="rr-pager-meta">
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

  try {
    await queueManualEvent(variantId);
  } catch (error) {
    console.error("triggerVariantAction failed", error);
  }
  revalidatePath("/admin/restock");
}

async function triggerAndProcessAction(formData: FormData): Promise<void> {
  "use server";

  const variantId = String(formData.get("variantId") ?? "").trim();
  if (!variantId) return;

  try {
    await queueManualEvent(variantId);
    await processRestockQueue(100);
  } catch (error) {
    console.error("triggerAndProcessAction failed", error);
  }
  revalidatePath("/admin/restock");
}

async function processNowAction(): Promise<void> {
  "use server";
  try {
    await processRestockQueue(100);
  } catch (error) {
    console.error("processNowAction failed", error);
  }
  revalidatePath("/admin/restock");
}

async function ensureWebhookAction(): Promise<void> {
  "use server";

  try {
    await fetch(`${process.env.APP_BASE_URL}/api/admin/restock/webhooks/ensure`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${process.env.ADMIN_USERNAME}:${process.env.ADMIN_PASSWORD}`).toString("base64")}`
      }
    });
  } catch (error) {
    console.error("ensureWebhookAction failed", error);
  }

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

  let subscriptions = [] as Awaited<ReturnType<typeof listSubscriptions>>;
  let subscriptionsTotal = 0;
  let subscriptionCounts: Record<string, number> = { active: 0, notified: 0, unsubscribed: 0, total: 0 };
  let eventCounts: Record<string, number> = { received: 0, queued: 0, processed: 0, ignored: 0, total: 0 };
  let messageCounts: Record<string, number> = { sent: 0, failed: 0, total: 0 };
  let events = [] as Awaited<ReturnType<typeof listRecentEvents>>;
  let eventsTotal = 0;
  let messageLog = [] as Awaited<ReturnType<typeof listMessageLog>>;
  let messageLogTotal = 0;
  let dashboardError: string | null = null;

  try {
    [
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
  } catch (error) {
    dashboardError = error instanceof Error ? error.message : "Unknown dashboard data error";
  }

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
    <main className="rr-admin">
      <style>{`
        .rr-admin {
          --rr-bg: #ffffff;
          --rr-text: #333333;
          --rr-border: #dedede;
          --rr-soft: #b5c2cd;
          --rr-accent: #ffad64;
          --rr-accent-border: #e09a57;
          max-width: 1280px;
          margin: 0 auto;
          padding: 24px 20px 40px;
          color: var(--rr-text);
          font-family: var(--font-body-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
        }

        .rr-admin h1 {
          font-family: var(--font-heading-family, var(--font-body-family, inherit));
          font-size: 48px;
          line-height: 1.05;
          margin: 0 0 18px;
          letter-spacing: 0.01em;
        }

        .rr-admin h2 {
          font-family: var(--font-heading-family, var(--font-body-family, inherit));
          font-size: 44px;
          line-height: 1.05;
          margin: 24px 0 10px;
          letter-spacing: 0.01em;
        }

        .rr-admin input[type="text"],
        .rr-admin select {
          min-height: 38px;
          border: 1px solid var(--rr-border);
          border-radius: 9px;
          padding: 6px 10px;
          background: #fff;
          color: var(--rr-text);
        }

        .rr-filters input[type="text"] {
          background: #eef6ff;
          border-color: #d8e4f3;
        }

        .rr-filters select:nth-of-type(1) {
          background: #fff3f4;
          border-color: #f2d9de;
        }

        .rr-filters select:nth-of-type(2) {
          background: #fff7ef;
          border-color: #f1dfcc;
        }

        .rr-filters select:nth-of-type(3) {
          background: #fffbea;
          border-color: #f0e8c8;
        }

        .rr-filters select:nth-of-type(4) {
          background: #f1f9ef;
          border-color: #d8e8d3;
        }

        .rr-admin input[type="text"]:focus-visible,
        .rr-admin select:focus-visible,
        .rr-admin button:focus-visible,
        .rr-admin a:focus-visible {
          outline: 2px solid var(--rr-soft);
          outline-offset: 2px;
        }

        .rr-admin button {
          min-height: 38px;
          border: 1px solid var(--rr-accent-border);
          border-radius: 9px;
          padding: 0 12px;
          background: var(--rr-accent);
          color: #1a1a1a;
          font-weight: 700;
          letter-spacing: 0.01em;
          cursor: pointer;
        }

        .rr-admin button:hover {
          background: #ffb676;
        }

        .rr-filters button[type="submit"] {
          background: #e7f6ef;
          border-color: #cfe6db;
          color: #253648;
        }

        .rr-filters button[type="submit"]:hover {
          background: #dcf1e7;
        }

        .rr-kpis {
          display: grid;
          grid-template-columns: repeat(3, minmax(220px, 1fr));
          gap: 10px;
          margin-bottom: 16px;
        }

        .rr-kpi {
          border: 1px solid var(--rr-border);
          border-radius: 12px;
          padding: 12px;
          background: linear-gradient(180deg, #ffffff 0%, #fbfbfb 100%);
        }

        .rr-filters,
        .rr-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 16px;
        }

        .rr-guide {
          border: 1px solid var(--rr-border);
          border-radius: 12px;
          padding: 12px 14px;
          margin: 0 0 16px;
          background: linear-gradient(180deg, #ffffff 0%, #fbfbfb 100%);
        }

        .rr-guide h3 {
          margin: 0 0 8px;
          font-size: 18px;
          line-height: 1.2;
          font-family: var(--font-heading-family, var(--font-body-family, inherit));
        }

        .rr-guide ol {
          margin: 0;
          padding-left: 18px;
        }

        .rr-action-card {
          border: 1px solid var(--rr-border);
          border-radius: 10px;
          padding: 8px;
          background: #fff;
        }

        .rr-actions .rr-action-card input[type="text"] {
          background: #fff3f4;
          border-color: #f2d9de;
        }

        .rr-actions .rr-action-card:nth-child(2) input[type="text"] {
          background: #fff7ef;
          border-color: #f1dfcc;
        }

        .rr-actions .rr-action-card:nth-child(1) button {
          background: #fffbea;
          border-color: #f0e8c8;
          color: #253648;
        }

        .rr-actions .rr-action-card:nth-child(2) button {
          background: #f1f9ef;
          border-color: #d8e8d3;
          color: #253648;
        }

        .rr-actions .rr-action-card:nth-child(3) button {
          background: #edf4ff;
          border-color: #d8e4f3;
          color: #253648;
        }

        .rr-actions .rr-action-card:nth-child(4) button {
          background: #f5efff;
          border-color: #e1d6f1;
          color: #253648;
        }

        .rr-actions .rr-action-card button:hover {
          filter: brightness(0.98);
        }

        .rr-help {
          margin-top: 6px;
          font-size: 12px;
          color: #4a5764;
          max-width: 360px;
          line-height: 1.35;
        }

        .rr-pager {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 8px 0 14px;
        }

        .rr-pager-label {
          font-size: 34px;
          line-height: 1.05;
        }

        .rr-pager-meta {
          opacity: 0.88;
        }

        .rr-admin table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 24px;
        }

        .rr-admin th {
          text-align: left;
          border-bottom: 2px solid var(--rr-border);
          padding: 10px 8px;
          font-size: 15px;
          white-space: nowrap;
        }

        .rr-admin td {
          border-top: 1px solid var(--rr-border);
          padding: 10px 8px;
          vertical-align: top;
        }

        .rr-admin tr:hover td {
          background: #fcfcfc;
        }

        .rr-admin a {
          color: #2e4053;
          text-underline-offset: 2px;
        }

        @media (max-width: 900px) {
          .rr-admin h1 { font-size: 40px; }
          .rr-admin h2 { font-size: 34px; }
          .rr-kpis { grid-template-columns: 1fr; }
          .rr-pager { flex-wrap: wrap; }
        }
      `}</style>
      <h1>Restock Raven Admin</h1>
      {dashboardError ? (
        <div
          style={{
            background: "#fff3cd",
            border: "1px solid #ffe69c",
            borderRadius: 8,
            padding: 10,
            marginBottom: 12
          }}
        >
          Dashboard data failed to load: {dashboardError}
        </div>
      ) : null}

      <section className="rr-guide" aria-label="Manual restock instructions">
        <h3>Manual Restock Quick Guide</h3>
        <ol>
          <li>Find the variant ID from your product URL or the variants table in Shopify admin.</li>
          <li>Paste the variant ID and click <strong>Trigger + Process Now</strong> for one-step send testing.</li>
          <li>Check <strong>Recent Events</strong> for `processed` and <strong>Message Log</strong> for `sent` or `failed`.</li>
          <li>Use <strong>Requeue</strong> on a subscription row if you need to resend for that subscriber.</li>
        </ol>
      </section>

      <section className="rr-kpis">
        <div className="rr-kpi">
          <strong>Subscriptions</strong>
          <div>Total: {subscriptionCounts.total ?? 0}</div>
          <div>Active: {subscriptionCounts.active ?? 0}</div>
          <div>Notified: {subscriptionCounts.notified ?? 0}</div>
          <div>Unsubscribed: {subscriptionCounts.unsubscribed ?? 0}</div>
        </div>
        <div className="rr-kpi">
          <strong>Events</strong>
          <div>Total: {eventCounts.total ?? 0}</div>
          <div>Queued: {eventCounts.queued ?? 0}</div>
          <div>Processed: {eventCounts.processed ?? 0}</div>
          <div>Ignored: {eventCounts.ignored ?? 0}</div>
        </div>
        <div className="rr-kpi">
          <strong>Messages</strong>
          <div>Total: {messageCounts.total ?? 0}</div>
          <div>Sent: {messageCounts.sent ?? 0}</div>
          <div>Failed: {messageCounts.failed ?? 0}</div>
        </div>
      </section>

      <form method="GET" className="rr-filters">
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

      <div className="rr-actions">
        <div className="rr-action-card">
          <form action={triggerVariantAction}>
            <input
              type="text"
              name="variantId"
              placeholder="Variant ID"
              style={{ width: 200, marginRight: 8 }}
            />
            <button type="submit" title="Adds an event to queue only. Does not send until processed.">
              Queue Manual Restock Event
            </button>
          </form>
          <p className="rr-help">Queue only. Use this if you want to line up multiple variants first.</p>
        </div>

        <div className="rr-action-card">
          <form action={triggerAndProcessAction}>
            <input
              type="text"
              name="variantId"
              placeholder="Variant ID"
              style={{ width: 200, marginRight: 8 }}
            />
            <button type="submit" title="Queues one variant event and immediately processes sends.">
              Trigger + Process Now
            </button>
          </form>
          <p className="rr-help">Fastest test button. One click to queue and send.</p>
        </div>

        <div className="rr-action-card">
          <form action={processNowAction}>
            <button type="submit" title="Processes all currently queued events and sends notifications.">
              Process Queue Now
            </button>
          </form>
          <p className="rr-help">Use after queueing events if they have not been processed yet.</p>
        </div>

        <div className="rr-action-card">
          <form action={ensureWebhookAction}>
            <button type="submit" title="Creates or verifies inventory webhook registration in Shopify.">
              Ensure Shopify Inventory Webhook
            </button>
          </form>
          <p className="rr-help">Run this after app/env changes to keep webhook delivery active.</p>
        </div>
      </div>

      <h2>Subscriptions</h2>
      <Pager
        label="Subscriptions"
        page={currentSubPage}
        total={subscriptionsTotal}
        pageSize={SUB_PAGE_SIZE}
        makeHref={(page) => buildHref({ ...baseParams, subPage: page })}
      />
      <table>
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
            <tr key={subscription.id}>
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
      <table>
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
            <tr key={event.id}>
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
      <table>
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
            <tr key={msg.id}>
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
