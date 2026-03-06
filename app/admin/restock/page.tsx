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
import { getVariantAdminMetaMap } from "@/lib/shopify/admin";

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
  debug?: boolean;
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
  if (params.debug) qs.set("debug", "1");
  if (params.subPage > 1) qs.set("subPage", String(params.subPage));
  if (params.eventPage > 1) qs.set("eventPage", String(params.eventPage));
  if (params.msgPage > 1) qs.set("msgPage", String(params.msgPage));
  return `/admin/restock?${qs.toString()}`;
}

function Pager(props: {
  page: number;
  total: number;
  pageSize: number;
  makeHref: (page: number) => string;
}) {
  const totalPages = Math.max(1, Math.ceil(props.total / props.pageSize));
  const clampedPage = Math.min(props.page, totalPages);

  return (
    <div className="rr-pager">
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
      debug?: string;
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
    debug,
    subPage,
    eventPage,
    msgPage
  } = await props.searchParams;
  const showDebug = debug === "1";

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
  let variantMetaById: Record<string, { sku: string | null; variantTitle: string | null }> = {};
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

    try {
      variantMetaById = await getVariantAdminMetaMap(subscriptions.map((s) => s.variant_id));
    } catch {
      variantMetaById = {};
    }
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
    debug: showDebug,
    subPage: currentSubPage,
    eventPage: currentEventPage,
    msgPage: currentMsgPage
  };

  return (
    <main className="rr-admin">
      <style>{`
        .rr-admin {
          --rr-max: 1120px;
          --rr-radius: 18px;
          --rr-radius-sm: 12px;
          --rr-gap: 16px;
          --rr-font: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
          --rr-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono";
          --rr-bg: #f3f4f6;
          --rr-surface: rgba(255, 255, 255, 0.96);
          --rr-surface-solid: #ffffff;
          --rr-border: rgba(16, 24, 40, 0.09);
          --rr-text: #0b1220;
          --rr-muted: rgba(11, 18, 32, 0.65);
          --rr-faint: rgba(11, 18, 32, 0.45);
          --rr-primary: #165df5;
          --rr-primary-2: #3d7bff;
          --rr-danger: #d64545;
          --rr-warn-bg: #fff8e7;
          --rr-warn-border: rgba(214, 159, 20, 0.25);
          --rr-shadow-sm: 0 1px 2px rgba(16, 24, 40, 0.06);
          --rr-shadow: 0 10px 28px rgba(16, 24, 40, 0.08);
          --rr-shadow-lg: 0 18px 36px rgba(16, 24, 40, 0.1);
          font-family: var(--rr-font);
          color: var(--rr-text);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(255, 255, 255, 0.86)),
            radial-gradient(900px 320px at 0% 0%, rgba(22, 93, 245, 0.08), transparent 60%),
            var(--rr-bg);
          min-height: 100vh;
          padding: 28px 18px 60px;
        }

        .rr-admin .rr-container {
          max-width: var(--rr-max);
          margin: 0 auto;
        }

        .rr-admin h1 {
          font-size: 42px;
          line-height: 1.08;
          letter-spacing: -0.03em;
          margin: 0 0 8px;
        }

        .rr-admin h2 {
          font-size: 26px;
          line-height: 1.15;
          margin: 26px 0 10px;
          letter-spacing: -0.02em;
        }

        .rr-admin .rr-subtitle {
          margin: 0;
          max-width: 720px;
          color: var(--rr-muted);
          font-size: 15px;
          line-height: 1.5;
        }

        .rr-admin .rr-hero {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }

        .rr-admin .rr-title {
          font-size: 14px;
          font-weight: 650;
          letter-spacing: 0.02em;
          color: var(--rr-muted);
          text-transform: uppercase;
          margin: 0 0 10px;
        }

        .rr-admin .rr-card {
          background: var(--rr-surface);
          border: 1px solid var(--rr-border);
          border-radius: var(--rr-radius);
          box-shadow: var(--rr-shadow);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }

        .rr-admin .rr-card--padded { padding: 18px; }
        .rr-admin .rr-card--tight { padding: 14px; }

        .rr-admin .rr-grid {
          display: grid;
          gap: var(--rr-gap);
        }

        .rr-admin .rr-grid--stats {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .rr-admin .rr-grid--actions {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .rr-admin .rr-kpi > div {
          color: var(--rr-faint);
          font-size: 13px;
        }

        .rr-admin .rr-kpi > div b,
        .rr-admin .rr-kpi strong {
          color: var(--rr-text);
        }

        .rr-admin .rr-controls {
          display: grid;
          grid-template-columns: 1.6fr repeat(4, minmax(0, 1fr)) auto auto;
          gap: 10px;
          align-items: center;
        }

        .rr-admin .rr-link-row {
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
          align-items: center;
        }

        .rr-admin input[type="text"],
        .rr-admin input[type="email"],
        .rr-admin input[type="number"],
        .rr-admin select {
          width: 100%;
          height: 44px;
          padding: 0 12px;
          border-radius: 12px;
          border: 1px solid var(--rr-border);
          background: rgba(255, 255, 255, 0.92);
          color: var(--rr-text);
          box-shadow: var(--rr-shadow-sm);
          outline: none;
          transition: box-shadow 0.15s ease, border-color 0.15s ease, transform 0.08s ease;
        }

        .rr-admin input::placeholder { color: rgba(11, 18, 32, 0.4); }

        .rr-admin input:focus,
        .rr-admin select:focus {
          border-color: rgba(47, 107, 255, 0.45);
          box-shadow: 0 0 0 4px rgba(47, 107, 255, 0.15), var(--rr-shadow-sm);
        }

        .rr-admin select {
          appearance: none;
          background-image:
            linear-gradient(45deg, transparent 50%, rgba(11, 18, 32, 0.55) 50%),
            linear-gradient(135deg, rgba(11, 18, 32, 0.55) 50%, transparent 50%);
          background-position: calc(100% - 18px) 18px, calc(100% - 12px) 18px;
          background-size: 6px 6px, 6px 6px;
          background-repeat: no-repeat;
          padding-right: 34px;
        }

        .rr-admin .rr-btn {
          height: 44px;
          padding: 0 14px;
          border-radius: 12px;
          border: 1px solid var(--rr-border);
          background: rgba(255, 255, 255, 0.92);
          color: var(--rr-text);
          font-weight: 650;
          box-shadow: var(--rr-shadow-sm);
          cursor: pointer;
          transition: transform 0.08s ease, box-shadow 0.15s ease, border-color 0.15s ease;
          white-space: nowrap;
        }

        .rr-admin .rr-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 22px rgba(16, 24, 40, 0.12);
        }

        .rr-admin .rr-btn:active {
          transform: translateY(0);
          box-shadow: var(--rr-shadow-sm);
        }

        .rr-admin .rr-btn--primary {
          background: linear-gradient(135deg, var(--rr-primary), var(--rr-primary-2));
          border-color: rgba(47, 107, 255, 0.35);
          color: #fff;
        }

        .rr-admin .rr-btn--danger {
          background: linear-gradient(135deg, #ff4d6d, #ff8aa0);
          border-color: rgba(255, 77, 109, 0.35);
          color: #fff;
        }

        .rr-pager {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 8px 0 14px;
          color: var(--rr-muted);
        }

        .rr-admin .rr-pager a {
          color: var(--rr-primary);
          text-decoration: none;
          font-weight: 650;
        }

        .rr-admin table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          overflow: hidden;
          border: 1px solid var(--rr-border);
          border-radius: var(--rr-radius);
          background: var(--rr-surface-solid);
          margin-bottom: 24px;
        }

        .rr-admin thead th {
          text-align: left;
          font-size: 12px;
          letter-spacing: 0.02em;
          color: var(--rr-muted);
          font-weight: 700;
          padding: 12px 14px;
          border-bottom: 1px solid var(--rr-border);
          background: rgba(247, 248, 251, 0.8);
          white-space: nowrap;
        }

        .rr-admin tbody td {
          padding: 12px 14px;
          border-bottom: 1px solid rgba(16, 24, 40, 0.06);
          font-size: 14px;
          vertical-align: top;
        }

        .rr-admin tbody tr:hover td {
          background: rgba(47, 107, 255, 0.06);
        }

        .rr-admin .rr-mono {
          font-family: var(--rr-mono);
          font-size: 13px;
        }

        .rr-admin .rr-help {
          margin-top: 6px;
          font-size: 12px;
          color: var(--rr-muted);
          line-height: 1.35;
        }

        .rr-admin a {
          color: var(--rr-primary);
          text-decoration: none;
          font-weight: 650;
        }

        .rr-admin a:hover { text-decoration: underline; }

        .rr-admin .rr-note {
          margin: 0;
          color: var(--rr-muted);
          font-size: 14px;
          line-height: 1.45;
        }

        .rr-admin form.inline {
          display: inline;
        }

        .rr-admin .rr-action-form {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .rr-admin .rr-action-form input[type="text"] {
          max-width: 220px;
        }

        .rr-admin .rr-action-card {
          display: grid;
          gap: 10px;
        }

        .rr-admin .rr-action-card h3 {
          margin: 0;
          font-size: 16px;
        }

        .rr-admin .rr-action-card--warn {
          background: var(--rr-warn-bg);
          border-color: var(--rr-warn-border);
        }

        .rr-admin .rr-table-wrap {
          overflow-x: auto;
        }

        .rr-admin .rr-empty {
          padding: 16px;
          border: 1px dashed var(--rr-border);
          border-radius: var(--rr-radius-sm);
          color: var(--rr-muted);
          background: rgba(255, 255, 255, 0.7);
        }

        @media (max-width: 980px) {
          .rr-admin .rr-grid--stats,
          .rr-admin .rr-grid--actions,
          .rr-admin .rr-controls,
          .rr-admin .rr-hero {
            grid-template-columns: 1fr;
            display: grid;
          }
          .rr-admin h1 { font-size: 36px; }
        }
      `}</style>
      <div className="rr-container">
      <section className="rr-hero">
        <div>
          <h1>Restock Raven Admin</h1>
          <p className="rr-subtitle">
            Manage subscribers, trigger restock sends, and inspect delivery issues. Diagnostics stay out of the way unless you explicitly open them.
          </p>
        </div>
      </section>
      {dashboardError ? (
        <div className="rr-card rr-card--tight">
          Dashboard data failed to load: {dashboardError}
        </div>
      ) : null}

      <section className="rr-grid rr-grid--stats">
        <div className="rr-kpi rr-card rr-card--tight">
          <strong>Subscriptions</strong>
          <div>Total: {subscriptionCounts.total ?? 0}</div>
          <div>Active: {subscriptionCounts.active ?? 0}</div>
          <div>Notified: {subscriptionCounts.notified ?? 0}</div>
          <div>Unsubscribed: {subscriptionCounts.unsubscribed ?? 0}</div>
        </div>
        <div className="rr-kpi rr-card rr-card--tight">
          <strong>Events</strong>
          <div>Total: {eventCounts.total ?? 0}</div>
          <div>Queued: {eventCounts.queued ?? 0}</div>
          <div>Processed: {eventCounts.processed ?? 0}</div>
          <div>Ignored: {eventCounts.ignored ?? 0}</div>
        </div>
        <div className="rr-kpi rr-card rr-card--tight">
          <strong>Messages</strong>
          <div>Total: {messageCounts.total ?? 0}</div>
          <div>Sent: {messageCounts.sent ?? 0}</div>
          <div>Failed: {messageCounts.failed ?? 0}</div>
        </div>
      </section>

      <form method="GET" className="rr-controls rr-card rr-card--padded">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search contact or variant ID"
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
        <button className="rr-btn rr-btn--primary" type="submit">Apply Filters</button>
        <div className="rr-link-row">
          <Link href={csvHref}>Export CSV</Link>
          {showDebug ? (
            <Link href={buildHref({ ...baseParams, debug: false, eventPage: 1, msgPage: 1 })}>Hide diagnostics</Link>
          ) : (
            <Link href={buildHref({ ...baseParams, debug: true })}>Show diagnostics</Link>
          )}
        </div>
      </form>

      <h2>Run Actions</h2>
      <p className="rr-note">
        Use <strong>Trigger + Process Now</strong> for the normal manual test flow. The other actions are for queue control and webhook maintenance.
      </p>
      <div className="rr-grid rr-grid--actions">
        <div className="rr-action-card rr-card rr-card--tight">
          <h3>Queue only</h3>
          <form className="rr-action-form" action={triggerVariantAction}>
            <input
              type="text"
              name="variantId"
              placeholder="Variant ID"
            />
            <button className="rr-btn" type="submit" title="Adds an event to queue only. Does not send until processed.">
              Queue Manual Restock Event
            </button>
          </form>
          <p className="rr-help">Use this when you want to line up one or more variants before processing.</p>
        </div>

        <div className="rr-action-card rr-card rr-card--tight">
          <h3>Trigger and send</h3>
          <form className="rr-action-form" action={triggerAndProcessAction}>
            <input
              type="text"
              name="variantId"
              placeholder="Variant ID"
            />
            <button className="rr-btn rr-btn--primary" type="submit" title="Queues one variant event and immediately processes sends.">
              Trigger + Process Now
            </button>
          </form>
          <p className="rr-help">Fastest path for a one-off test. Queue the event and immediately attempt delivery.</p>
        </div>

        <div className="rr-action-card rr-card rr-card--tight">
          <h3>Process queued events</h3>
          <form className="inline" action={processNowAction}>
            <button className="rr-btn" type="submit" title="Processes all currently queued events and sends notifications.">
              Process Queue Now
            </button>
          </form>
          <p className="rr-help">Run this after queueing events if they have not been processed yet.</p>
        </div>

        <div className="rr-action-card rr-action-card--warn rr-card rr-card--tight">
          <h3>Webhook maintenance</h3>
          <form className="inline" action={ensureWebhookAction}>
            <button className="rr-btn rr-btn--danger" type="submit" title="Creates or verifies inventory webhook registration in Shopify.">
              Ensure Shopify Inventory Webhook
            </button>
          </form>
          <p className="rr-help">Run this after app or environment changes to keep Shopify inventory delivery active.</p>
        </div>
      </div>

      <h2>Subscriptions</h2>
      <Pager
        page={currentSubPage}
        total={subscriptionsTotal}
        pageSize={SUB_PAGE_SIZE}
        makeHref={(page) => buildHref({ ...baseParams, subPage: page })}
      />
      <div className="rr-table-wrap">
      <table>
        <thead>
          <tr>
            <th align="left">Email</th>
            <th align="left">Phone</th>
            <th align="left">SKU / Variant</th>
            <th align="left">Variant</th>
            <th align="left">Status</th>
            <th align="left">Marketing</th>
            <th align="left">Notified</th>
            <th align="left">Action</th>
          </tr>
        </thead>
        <tbody>
          {subscriptions.length ? subscriptions.map((subscription) => {
            const variantMeta = variantMetaById[subscription.variant_id];
            const skuVariant = [variantMeta?.sku, variantMeta?.variantTitle].filter(Boolean).join(" - ");
            return (
              <tr key={subscription.id}>
                <td>{subscription.email ?? "-"}</td>
                <td>{subscription.phone ?? "-"}</td>
                <td>{skuVariant || "-"}</td>
                <td>{subscription.variant_id}</td>
                <td>{subscription.status}</td>
                <td>{subscription.marketing_opt_in ? "opted-in" : "-"}</td>
                <td>{formatCell(subscription.notified_at)}</td>
                <td>
                  <form action={requeueAction}>
                    <input type="hidden" name="subscriptionId" value={subscription.id} />
                    <button className="rr-btn" type="submit">Requeue</button>
                  </form>
                </td>
              </tr>
            );
          }) : (
            <tr>
              <td colSpan={8}>
                <div className="rr-empty">No subscriptions matched the current filters.</div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      {showDebug ? (
        <>
          <h2>Diagnostics</h2>
          <p className="rr-note">Use these tables for webhook tracing and delivery debugging.</p>
          <h2>Recent Events</h2>
          <Pager
            page={currentEventPage}
            total={eventsTotal}
            pageSize={EVENT_PAGE_SIZE}
            makeHref={(page) => buildHref({ ...baseParams, eventPage: page })}
          />
          <div className="rr-table-wrap">
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
              {events.length ? events.map((event) => (
                <tr key={event.id}>
                  <td>{formatCell(event.occurred_at)}</td>
                  <td>{event.variant_id}</td>
                  <td>{event.inventory_from ?? "-"}</td>
                  <td>{event.inventory_to}</td>
                  <td>{event.status}</td>
                  <td>{formatCell(event.processed_at)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6}>
                    <div className="rr-empty">No events matched the current filters.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>

          <h2>Message Log</h2>
          <Pager
            page={currentMsgPage}
            total={messageLogTotal}
            pageSize={MSG_PAGE_SIZE}
            makeHref={(page) => buildHref({ ...baseParams, msgPage: page })}
          />
          <div className="rr-table-wrap">
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
              {messageLog.length ? messageLog.map((msg) => (
                <tr key={msg.id}>
                  <td>{formatCell(msg.sent_at)}</td>
                  <td>{msg.channel}</td>
                  <td>{msg.status}</td>
                  <td>{msg.email ?? msg.phone ?? "-"}</td>
                  <td>{msg.variant_id}</td>
                  <td>{msg.provider_message_id ?? "-"}</td>
                  <td>{msg.error ?? "-"}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7}>
                    <div className="rr-empty">No message log rows matched the current filters.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </>
      ) : null}
      </div>
    </main>
  );
}
