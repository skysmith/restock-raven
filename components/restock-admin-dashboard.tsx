import Link from "next/link";
import { revalidatePath } from "next/cache";
import { RestockTriggerPanel } from "@/components/restock-trigger-panel";
import {
  countSubscriptions,
  getSubscriptionStatusCounts,
  isClearedEmailPlaceholder,
  listSubscriptions,
  listSubscribedVariants,
  requeueSubscription
} from "@/lib/db/subscriptions";
import type { SortDirection, SubscriptionSortKey } from "@/lib/db/subscriptions";
import {
  getEventStatusCounts,
  getVariantInventoryState,
  insertRestockEvent,
} from "@/lib/db/events";
import {
  countMessageLog,
  getMessageStatusCounts,
  listMessageLog
} from "@/lib/db/message-log";
import { getRestockMinQtyFromZero } from "@/lib/jobs/transition";
import { processRestockQueue } from "@/lib/jobs/process-restock";
import { buildTriggerVariantOptions, type TriggerVariantOption } from "@/lib/restock/trigger-options";
import { getVariantAdminMetaMap, type VariantAdminMeta } from "@/lib/shopify/admin";

type SubscriptionStatusFilter = "all" | "active" | "notified" | "unsubscribed";
type MessageStatusFilter = "all" | "sent" | "failed";
type ChannelFilter = "all" | "email" | "sms";
type DashboardShell = "standalone" | "embedded";

const SUB_PAGE_SIZE = 50;
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

function formatEmailCell(email: string | null): string {
  if (!email) return "-";
  return isClearedEmailPlaceholder(email) ? "Cleared after alert" : email;
}

function formatContactCell(email: string | null, phone: string | null): string {
  const formattedEmail = formatEmailCell(email);
  return formattedEmail !== "-" ? formattedEmail : phone ?? "-";
}

function formatProductName(variantMeta: VariantAdminMeta | undefined): string {
  return variantMeta?.productTitle?.trim() || "Unknown product";
}

function formatVariantDetails(variantMeta: VariantAdminMeta | undefined): string {
  return [variantMeta?.sku, variantMeta?.variantTitle].filter(Boolean).join(" - ") || "-";
}

function getSubscriptionSortKey(value: string | undefined): SubscriptionSortKey {
  if (value === "product" || value === "notified" || value === "active" || value === "created") {
    return value;
  }
  return "created";
}

function getDefaultSortDirection(sortBy: SubscriptionSortKey): SortDirection {
  return sortBy === "created" || sortBy === "notified" ? "desc" : "asc";
}

function getSortDirection(value: string | undefined, sortBy: SubscriptionSortKey): SortDirection {
  if (value === "asc" || value === "desc") return value;
  return getDefaultSortDirection(sortBy);
}

const productCollator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

function sortSubscriptionsByProduct<T extends { variant_id: string }>(
  subscriptions: T[],
  variantMetaById: Record<string, VariantAdminMeta>,
  sortDirection: SortDirection
): T[] {
  return [...subscriptions].sort((a, b) => {
    const aProduct = formatProductName(variantMetaById[a.variant_id]);
    const bProduct = formatProductName(variantMetaById[b.variant_id]);
    const result = productCollator.compare(aProduct, bProduct);
    return sortDirection === "asc" ? result : -result;
  });
}

function getSystemStatus(
  eventCounts: Record<string, number>,
  messageCounts: Record<string, number>
): { label: string; detail: string; tone: "good" | "warning" | "danger" } {
  const queued = eventCounts.queued ?? 0;
  const processing = eventCounts.received ?? 0;
  const pending = queued + processing;
  const processed = eventCounts.processed ?? 0;
  const failed = messageCounts.failed ?? 0;

  if (failed > 0) {
    return {
      label: "Needs attention",
      detail: `${failed} failed delivery attempt${failed === 1 ? "" : "s"}.`,
      tone: "danger"
    };
  }

  if (pending > 0) {
    return {
      label: "Queue waiting",
      detail: `${pending} restock alert${pending === 1 ? "" : "s"} waiting to process.`,
      tone: "warning"
    };
  }

  return {
    label: "Working",
    detail: `Queue clear. ${processed} processed restock alert${processed === 1 ? "" : "s"}.`,
    tone: "good"
  };
}

function SortHeader(props: {
  label: string;
  sortBy: SubscriptionSortKey;
  currentSortBy: SubscriptionSortKey;
  currentSortDirection: SortDirection;
  makeHref: (sortBy: SubscriptionSortKey, sortDirection: SortDirection) => string;
}) {
  const isCurrent = props.sortBy === props.currentSortBy;
  const nextDirection: SortDirection = isCurrent
    ? props.currentSortDirection === "asc"
      ? "desc"
      : "asc"
    : getDefaultSortDirection(props.sortBy);
  const suffix = isCurrent ? ` ${props.currentSortDirection.toUpperCase()}` : "";

  return (
    <Link className="rr-sort-link" href={props.makeHref(props.sortBy, nextDirection)}>
      {props.label}
      <span className="rr-sort-state">{suffix}</span>
    </Link>
  );
}

function buildHref(params: {
  basePath: string;
  q?: string;
  status: SubscriptionStatusFilter;
  msgStatus: MessageStatusFilter;
  channel: ChannelFilter;
  debug?: boolean;
  subSort: SubscriptionSortKey;
  subDir: SortDirection;
  subPage: number;
  msgPage: number;
}): string {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.status !== "all") qs.set("status", params.status);
  if (params.msgStatus !== "all") qs.set("msgStatus", params.msgStatus);
  if (params.channel !== "all") qs.set("channel", params.channel);
  if (params.debug) qs.set("debug", "1");
  if (params.subSort !== "created") qs.set("subSort", params.subSort);
  if (params.subDir !== getDefaultSortDirection(params.subSort)) qs.set("subDir", params.subDir);
  if (params.subPage > 1) qs.set("subPage", String(params.subPage));
  if (params.msgPage > 1) qs.set("msgPage", String(params.msgPage));
  const query = qs.toString();
  return query ? `${params.basePath}?${query}` : params.basePath;
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
  revalidatePath("/embedded/restock");
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
  revalidatePath("/embedded/restock");
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
  revalidatePath("/embedded/restock");
}

async function processNowAction(): Promise<void> {
  "use server";
  try {
    await processRestockQueue(100);
  } catch (error) {
    console.error("processNowAction failed", error);
  }
  revalidatePath("/admin/restock");
  revalidatePath("/embedded/restock");
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
  revalidatePath("/embedded/restock");
}

function getShellCopy(shell: DashboardShell): {
  title: string;
  subtitle: string;
  banner: string | null;
} {
  if (shell === "embedded") {
    return {
      title: "Restock Raven in Shopify",
      subtitle:
        "Preview the operations dashboard on the Shopify-facing route while we migrate auth and app navigation into a proper embedded experience.",
      banner:
        "Phase 1 preview: this route still uses the same Vercel-backed admin logic, but it gives us a stable surface to wire into the Shopify app next."
    };
  }

  return {
    title: "Restock Raven Admin",
    subtitle:
      "Manage subscribers, trigger restock sends, and inspect delivery issues. Diagnostics stay out of the way unless you explicitly open them.",
    banner: null
  };
}

export async function RestockAdminDashboard(props: {
  shell?: DashboardShell;
  basePath?: string;
  searchParams: Promise<{
    q?: string;
    status?: SubscriptionStatusFilter;
    msgStatus?: MessageStatusFilter;
    channel?: ChannelFilter;
    debug?: string;
    subSort?: string;
    subDir?: string;
    subPage?: string;
    msgPage?: string;
  }>;
}) {
  const shell = props.shell ?? "standalone";
  const basePath = props.basePath ?? "/admin/restock";
  const shellCopy = getShellCopy(shell);
  const {
    q,
    status = "all",
    msgStatus = "all",
    channel = "all",
    debug,
    subSort,
    subDir,
    subPage,
    msgPage
  } = await props.searchParams;
  const showDebug = debug === "1";
  const subscriptionSortBy = getSubscriptionSortKey(subSort);
  const subscriptionSortDirection = getSortDirection(subDir, subscriptionSortBy);

  const currentSubPage = toPositiveInt(subPage, 1);
  const currentMsgPage = toPositiveInt(msgPage, 1);
  const subscriptionOffset = (currentSubPage - 1) * SUB_PAGE_SIZE;

  let subscriptions = [] as Awaited<ReturnType<typeof listSubscriptions>>;
  let subscriptionsTotal = 0;
  let subscriptionCounts: Record<string, number> = { active: 0, notified: 0, unsubscribed: 0, total: 0 };
  let eventCounts: Record<string, number> = { received: 0, queued: 0, processed: 0, ignored: 0, total: 0 };
  let messageCounts: Record<string, number> = { sent: 0, failed: 0, total: 0 };
  let messageLog = [] as Awaited<ReturnType<typeof listMessageLog>>;
  let messageLogTotal = 0;
  let variantMetaById: Record<string, VariantAdminMeta> = {};
  let subscribedVariants = [] as Awaited<ReturnType<typeof listSubscribedVariants>>;
  let triggerVariantOptions: TriggerVariantOption[] = [];
  let shouldSliceProductSort = false;
  let dashboardError: string | null = null;

  try {
    [
      subscriptions,
      subscriptionsTotal,
      subscriptionCounts,
      eventCounts,
      messageCounts,
      messageLog,
      messageLogTotal,
      subscribedVariants
    ] = await Promise.all([
      listSubscriptions(q, status, {
        limit: SUB_PAGE_SIZE,
        offset: subscriptionOffset,
        sortBy: subscriptionSortBy,
        sortDirection: subscriptionSortDirection
      }),
      countSubscriptions(q, status),
      getSubscriptionStatusCounts(),
      getEventStatusCounts(),
      getMessageStatusCounts(),
      listMessageLog({
        query: q,
        status: msgStatus,
        channel,
        limit: MSG_PAGE_SIZE,
        offset: (currentMsgPage - 1) * MSG_PAGE_SIZE
      }),
      countMessageLog({ query: q, status: msgStatus, channel }),
      listSubscribedVariants()
    ]);

    if (subscriptionSortBy === "product" && subscriptionsTotal > SUB_PAGE_SIZE) {
      subscriptions = await listSubscriptions(q, status, {
        limit: subscriptionsTotal,
        offset: 0,
        sortBy: subscriptionSortBy,
        sortDirection: subscriptionSortDirection
      });
      shouldSliceProductSort = true;
    }

    try {
      const variantIds = Array.from(
        new Set([
          ...subscriptions.map((subscription) => subscription.variant_id),
          ...subscribedVariants.map((subscribedVariant) => subscribedVariant.variant_id)
        ])
      );
      variantMetaById = await getVariantAdminMetaMap(variantIds);
      if (subscriptionSortBy === "product") {
        subscriptions = sortSubscriptionsByProduct(subscriptions, variantMetaById, subscriptionSortDirection);
        if (shouldSliceProductSort) {
          subscriptions = subscriptions.slice(subscriptionOffset, subscriptionOffset + SUB_PAGE_SIZE);
        }
      }
    } catch {
      variantMetaById = {};
    }
    triggerVariantOptions = buildTriggerVariantOptions(subscribedVariants, variantMetaById);
  } catch (error) {
    dashboardError = error instanceof Error ? error.message : "Unknown dashboard data error";
  }

  const csvHref = `/api/admin/restock/export?q=${encodeURIComponent(q ?? "")}&status=${encodeURIComponent(
    status
  )}`;

  const baseParams = {
    basePath,
    q,
    status,
    msgStatus,
    channel,
    debug: showDebug,
    subSort: subscriptionSortBy,
    subDir: subscriptionSortDirection,
    subPage: currentSubPage,
    msgPage: currentMsgPage
  };
  const systemStatus = getSystemStatus(eventCounts, messageCounts);

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
          --rr-bg: #f6f6f6;
          --rr-surface: rgba(255, 255, 255, 0.96);
          --rr-surface-solid: #ffffff;
          --rr-border: #d9dadd;
          --rr-text: #0b1220;
          --rr-muted: rgba(11, 18, 32, 0.65);
          --rr-faint: rgba(11, 18, 32, 0.45);
          --rr-primary: #303236;
          --rr-primary-2: #303236;
          --rr-danger: #d64545;
          --rr-warn-bg: #f3f3f4;
          --rr-warn-border: #d9dadd;
          --rr-shadow-sm: none;
          --rr-shadow: none;
          --rr-shadow-lg: none;
          font-family: var(--rr-font);
          color: var(--rr-text);
          background: var(--rr-bg);
          min-height: 100vh;
          padding: 28px 18px 60px;
          overflow-x: hidden;
        }

        .rr-admin,
        .rr-admin * {
          box-sizing: border-box;
        }

        .rr-admin .rr-container {
          width: 100%;
          max-width: var(--rr-max);
          margin: 0 auto;
          min-width: 0;
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
          overflow-wrap: break-word;
        }

        .rr-admin .rr-hero {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
          min-width: 0;
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
          min-width: 0;
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

        .rr-admin .rr-status-card {
          display: grid;
          gap: 7px;
        }

        .rr-admin .rr-status-label {
          width: max-content;
          border-radius: 999px;
          padding: 5px 10px;
          font-size: 13px;
          font-weight: 800;
        }

        .rr-admin .rr-status-label--good {
          background: #eeeeef;
          color: #3f4246;
        }

        .rr-admin .rr-status-label--warning {
          background: #eeeeef;
          color: #3f4246;
        }

        .rr-admin .rr-status-label--danger {
          background: #eeeeef;
          color: #3f4246;
        }

        .rr-admin .rr-controls {
          display: grid;
          grid-template-columns: 1.6fr repeat(3, minmax(0, 1fr)) auto auto;
          gap: 10px;
          align-items: center;
          min-width: 0;
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
          min-width: 0;
          height: 44px;
          padding: 0 12px;
          border-radius: 12px;
          border: 1px solid var(--rr-border);
          background: #ffffff;
          color: var(--rr-text);
          box-shadow: none;
          outline: none;
          transition: box-shadow 0.15s ease, border-color 0.15s ease, transform 0.08s ease;
        }

        .rr-admin input::placeholder { color: rgba(11, 18, 32, 0.4); }

        .rr-admin input:focus,
        .rr-admin select:focus {
          border-color: #9ca3af;
          box-shadow: 0 0 0 3px rgba(48, 50, 54, 0.12);
        }

        .rr-admin select {
          appearance: none;
          background-image:
            linear-gradient(45deg, transparent 50%, #777b80 50%),
            linear-gradient(135deg, #777b80 50%, transparent 50%);
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
          background: #ffffff;
          color: var(--rr-text);
          font-weight: 650;
          box-shadow: none;
          cursor: pointer;
          transition: transform 0.08s ease, box-shadow 0.15s ease, border-color 0.15s ease;
          white-space: nowrap;
        }

        .rr-admin .rr-btn:hover {
          transform: none;
          box-shadow: none;
        }

        .rr-admin .rr-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .rr-admin .rr-btn:disabled:hover {
          transform: none;
          box-shadow: none;
        }

        .rr-admin .rr-btn:active {
          transform: translateY(0);
          box-shadow: none;
        }

        .rr-admin .rr-btn--primary {
          background: var(--rr-primary);
          border-color: var(--rr-primary);
          color: #fff;
        }

        .rr-admin .rr-btn--danger {
          background: #4b4d52;
          border-color: #4b4d52;
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

        .rr-admin .rr-sort-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: inherit;
          font-weight: 800;
          text-decoration: none;
        }

        .rr-admin .rr-sort-link:hover {
          color: var(--rr-primary);
          text-decoration: none;
        }

        .rr-admin .rr-sort-state {
          color: var(--rr-primary);
          font-size: 10px;
          letter-spacing: 0.04em;
        }

        .rr-admin tbody td {
          padding: 12px 14px;
          border-bottom: 1px solid rgba(16, 24, 40, 0.06);
          font-size: 14px;
          vertical-align: top;
        }

        .rr-admin tbody tr:hover td {
          background: #f3f3f4;
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

        .rr-admin .rr-action-form select {
          min-width: 260px;
          max-width: 360px;
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

        .rr-admin .rr-trigger-panel {
          display: grid;
          gap: 14px;
          margin: 22px 0 12px;
        }

        .rr-admin .rr-trigger-header {
          display: grid;
          gap: 6px;
        }

        .rr-admin .rr-trigger-header h2 {
          margin: 0;
        }

        .rr-admin .rr-status-banner {
          border: 1px solid #d9dadd;
          border-radius: var(--rr-radius-sm);
          background: #ffffff;
          color: #4b5563;
          padding: 12px 14px;
          line-height: 1.4;
        }

        .rr-admin .rr-trigger-primary {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 12px;
          align-items: end;
          min-width: 0;
        }

        .rr-admin .rr-trigger-select {
          display: grid;
          gap: 6px;
          color: var(--rr-muted);
          font-size: 13px;
          font-weight: 700;
          min-width: 0;
        }

        .rr-admin .rr-trigger-select select {
          color: var(--rr-text);
          font-size: 15px;
          font-weight: 600;
        }

        .rr-admin .rr-btn--send {
          min-width: 170px;
        }

        .rr-admin .rr-advanced-actions {
          border-top: 1px solid rgba(16, 24, 40, 0.08);
          padding-top: 12px;
        }

        .rr-admin .rr-advanced-actions summary,
        .rr-admin .rr-maintenance summary {
          cursor: pointer;
          color: var(--rr-primary);
          font-weight: 750;
          width: max-content;
        }

        .rr-admin .rr-advanced-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 12px;
        }

        .rr-admin .rr-maintenance {
          display: grid;
          gap: 10px;
          margin: 0 0 24px;
          background: var(--rr-warn-bg);
          border-color: var(--rr-warn-border);
        }

        .rr-admin .rr-table-wrap {
          overflow-x: auto;
          max-width: 100%;
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
          .rr-admin .rr-trigger-primary,
          .rr-admin .rr-controls,
          .rr-admin .rr-hero {
            grid-template-columns: 1fr;
            display: grid;
          }
          .rr-admin h1 { font-size: 36px; }
        }

        @media (max-width: 520px) {
          .rr-admin {
            padding: 24px 12px 48px;
          }

          .rr-admin h1 {
            font-size: 32px;
            letter-spacing: 0;
          }

          .rr-admin h2 {
            font-size: 24px;
          }

          .rr-admin .rr-card--padded {
            padding: 14px;
          }

          .rr-admin .rr-trigger-primary {
            align-items: stretch;
          }

          .rr-admin .rr-trigger-primary form,
          .rr-admin .rr-trigger-primary button,
          .rr-admin .rr-controls .rr-btn {
            width: 100%;
          }

          .rr-admin .rr-advanced-grid {
            display: grid;
            grid-template-columns: 1fr;
          }

          .rr-admin table {
            min-width: 720px;
          }
        }
      `}</style>
      <div className="rr-container">
      <section className="rr-hero">
        <div>
          <h1>{shellCopy.title}</h1>
          <p className="rr-subtitle">{shellCopy.subtitle}</p>
        </div>
      </section>
      {shellCopy.banner ? (
        <div className="rr-card rr-card--tight" style={{ marginBottom: 16 }}>
          {shellCopy.banner}
        </div>
      ) : null}
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
        <div className="rr-kpi rr-status-card rr-card rr-card--tight">
          <strong>System status</strong>
          <span className={`rr-status-label rr-status-label--${systemStatus.tone}`}>
            {systemStatus.label}
          </span>
          <div>{systemStatus.detail}</div>
        </div>
        <div className="rr-kpi rr-card rr-card--tight">
          <strong>Messages</strong>
          <div>Total: {messageCounts.total ?? 0}</div>
          <div>Sent: {messageCounts.sent ?? 0}</div>
          <div>Failed: {messageCounts.failed ?? 0}</div>
        </div>
      </section>

      <form method="GET" action={basePath} className="rr-controls rr-card rr-card--padded">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search contact or variant ID"
        />
        <input type="hidden" name="subSort" value={subscriptionSortBy} />
        <input type="hidden" name="subDir" value={subscriptionSortDirection} />
        <select name="status" defaultValue={status}>
          <option value="all">All subscriptions</option>
          <option value="active">Active</option>
          <option value="notified">Notified</option>
          <option value="unsubscribed">Unsubscribed</option>
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
            <Link href={buildHref({ ...baseParams, debug: false, msgPage: 1 })}>Hide diagnostics</Link>
          ) : (
            <Link href={buildHref({ ...baseParams, debug: true })}>Show diagnostics</Link>
          )}
        </div>
      </form>

      <RestockTriggerPanel
        options={triggerVariantOptions}
        sendAction={triggerAndProcessAction}
        queueAction={triggerVariantAction}
        processAction={processNowAction}
      />

      <details className="rr-maintenance rr-card rr-card--tight">
        <summary>Webhook maintenance</summary>
        <form className="inline" action={ensureWebhookAction}>
          <button className="rr-btn rr-btn--danger" type="submit" title="Creates or verifies inventory webhook registration in Shopify.">
            Ensure Shopify Inventory Webhook
          </button>
        </form>
        <p className="rr-help">Run this after app or environment changes to keep Shopify inventory delivery active.</p>
      </details>

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
            <th align="left">
              <SortHeader
                label="Product"
                sortBy="product"
                currentSortBy={subscriptionSortBy}
                currentSortDirection={subscriptionSortDirection}
                makeHref={(sortBy, sortDirection) =>
                  buildHref({ ...baseParams, subSort: sortBy, subDir: sortDirection, subPage: 1 })
                }
              />
            </th>
            <th align="left">SKU / Variant</th>
            <th align="left">
              <SortHeader
                label="Status"
                sortBy="active"
                currentSortBy={subscriptionSortBy}
                currentSortDirection={subscriptionSortDirection}
                makeHref={(sortBy, sortDirection) =>
                  buildHref({ ...baseParams, subSort: sortBy, subDir: sortDirection, subPage: 1 })
                }
              />
            </th>
            <th align="left">Marketing</th>
            <th align="left">
              <SortHeader
                label="Created"
                sortBy="created"
                currentSortBy={subscriptionSortBy}
                currentSortDirection={subscriptionSortDirection}
                makeHref={(sortBy, sortDirection) =>
                  buildHref({ ...baseParams, subSort: sortBy, subDir: sortDirection, subPage: 1 })
                }
              />
            </th>
            <th align="left">
              <SortHeader
                label="Notified"
                sortBy="notified"
                currentSortBy={subscriptionSortBy}
                currentSortDirection={subscriptionSortDirection}
                makeHref={(sortBy, sortDirection) =>
                  buildHref({ ...baseParams, subSort: sortBy, subDir: sortDirection, subPage: 1 })
                }
              />
            </th>
            <th align="left">Action</th>
          </tr>
        </thead>
        <tbody>
          {subscriptions.length ? subscriptions.map((subscription) => {
            const variantMeta = variantMetaById[subscription.variant_id];
            return (
              <tr key={subscription.id}>
                <td>{formatEmailCell(subscription.email)}</td>
                <td>{subscription.phone ?? "-"}</td>
                <td title={`Variant ID: ${subscription.variant_id}`}>{formatProductName(variantMeta)}</td>
                <td>{formatVariantDetails(variantMeta)}</td>
                <td>{subscription.status}</td>
                <td>{subscription.marketing_opt_in ? "opted-in" : "-"}</td>
                <td>{formatCell(subscription.created_at)}</td>
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
              <td colSpan={9}>
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
          <p className="rr-note">Use this table for delivery debugging when a customer says they did not receive an alert.</p>
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
                  <td>{formatContactCell(msg.email, msg.phone)}</td>
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
