"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

interface EmbeddedSummaryResponse {
  ok: true;
  shop: string;
  subscriptions: {
    total: number;
    active: number;
    notified: number;
    unsubscribed: number;
  };
  events: {
    total: number;
    received: number;
    queued: number;
    processed: number;
    ignored: number;
  };
  messages: {
    total: number;
    sent: number;
    failed: number;
  };
}

interface EmbeddedSubscriptionsResponse {
  ok: true;
  shop: string;
  total: number;
  subscriptions: EmbeddedSubscription[];
}

interface EmbeddedSubscription {
  id: string;
  email: string | null;
  phone: string | null;
  variant_id: string;
  product_title: string | null;
  sku: string | null;
  variant_title: string | null;
  status: "active" | "notified" | "unsubscribed";
  marketing_opt_in: boolean;
  created_at: string;
  notified_at: string | null;
}

type SubscriptionSortKey = "created" | "notified" | "active" | "product";
type SortDirection = "asc" | "desc";

interface ProcessResult {
  eventsClaimed: number;
  subscriptionsProcessed: number;
  messagesSent: number;
  messagesFailed: number;
}

interface TriggerResponse {
  ok: true;
  variantId: string;
  eventCreated: boolean;
  processResult: null | ProcessResult;
}

interface ProcessQueuedResponse {
  ok: true;
  processResult: ProcessResult;
}

interface TriggerOption {
  variantId: string;
  label: string;
  detail: string | null;
  subscriptionCount: number;
  activeSubscriptionCount: number;
}

interface TriggerOptionsResponse {
  ok: true;
  shop: string;
  options: TriggerOption[];
}

interface EmbeddedMessagesResponse {
  ok: true;
  total: number;
  messages: Array<{
    id: string;
    channel: "email" | "sms";
    status: "sent" | "failed";
    email: string | null;
    phone: string | null;
    variant_id: string;
    provider_message_id: string | null;
    sent_at: string;
    error: string | null;
  }>;
}

declare global {
  interface Window {
    shopify?: {
      idToken: () => Promise<string>;
    };
  }
}

const HOST_STORAGE_KEY = "restock-raven.shopify-host";

interface EmbeddedDiagnostics {
  hostParamPresent: boolean;
  persistedHostPresent: boolean;
  apiKeyMetaPresent: boolean;
  appBridgeScriptPresent: boolean;
  insideIframe: boolean;
}

function readEmbeddedDiagnostics(): EmbeddedDiagnostics {
  return {
    hostParamPresent: Boolean(new URLSearchParams(window.location.search).get("host")),
    persistedHostPresent: Boolean(window.sessionStorage.getItem(HOST_STORAGE_KEY)),
    apiKeyMetaPresent: Boolean(document.querySelector('meta[name="shopify-api-key"]')),
    appBridgeScriptPresent: Boolean(
      document.querySelector('script[src="https://cdn.shopify.com/shopifycloud/app-bridge.js"]')
    ),
    insideIframe: window.self !== window.top
  };
}

function persistEmbeddedHost() {
  const host = new URLSearchParams(window.location.search).get("host");
  if (host) {
    window.sessionStorage.setItem(HOST_STORAGE_KEY, host);
  }
}

function formatEmbeddedBridgeError(timeoutMs: number, diagnostics: EmbeddedDiagnostics) {
  const issues: string[] = [];

  if (!diagnostics.insideIframe) {
    issues.push("the page is not currently running inside the Shopify Admin iframe");
  }

  if (!diagnostics.hostParamPresent && !diagnostics.persistedHostPresent) {
    issues.push("the Shopify `host` parameter was missing");
  }

  if (!diagnostics.apiKeyMetaPresent) {
    issues.push("the `shopify-api-key` meta tag was missing");
  }

  if (!diagnostics.appBridgeScriptPresent) {
    issues.push("the App Bridge CDN script was missing");
  }

  if (issues.length === 0) {
    return `Shopify App Bridge did not initialize within ${Math.round(timeoutMs / 1000)} seconds. This usually points to an embedded app configuration or credential mismatch in Shopify/Vercel.`;
  }

  return `Shopify App Bridge did not initialize within ${Math.round(timeoutMs / 1000)} seconds because ${issues.join(
    ", "
  )}.`;
}

function getSubscriptionProductName(subscription: EmbeddedSubscription): string {
  return subscription.product_title?.trim() || "Unknown product";
}

function getSubscriptionVariantDetails(subscription: EmbeddedSubscription): string | null {
  return [subscription.sku, subscription.variant_title].filter(Boolean).join(" - ") || null;
}

function getDefaultSortDirection(sortBy: SubscriptionSortKey): SortDirection {
  return sortBy === "created" || sortBy === "notified" ? "desc" : "asc";
}

function formatTriggerOption(option: TriggerOption): string {
  return `${option.label}${option.detail ? ` - ${option.detail}` : ""}${
    option.activeSubscriptionCount ? ` (${option.activeSubscriptionCount} active)` : ""
  }`;
}

function formatWaitingCustomers(count: number): string {
  return count === 1 ? "1 waiting customer" : `${count} waiting customers`;
}

function getSystemStatus(summary: EmbeddedSummaryResponse): {
  label: string;
  detail: string;
  tone: "good" | "warning" | "danger";
} {
  const pending = summary.events.queued + summary.events.received;
  const failed = summary.messages.failed;

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
    detail: `Queue clear. ${summary.events.processed} processed restock alert${
      summary.events.processed === 1 ? "" : "s"
    }.`,
    tone: "good"
  };
}

async function waitForShopifyBridge(timeoutMs = 12000): Promise<NonNullable<Window["shopify"]>> {
  const started = Date.now();
  persistEmbeddedHost();

  return new Promise((resolve, reject) => {
    const tick = () => {
      if (window.shopify?.idToken) {
        resolve(window.shopify);
        return;
      }

      if (Date.now() - started > timeoutMs) {
        reject(new Error(formatEmbeddedBridgeError(timeoutMs, readEmbeddedDiagnostics())));
        return;
      }

      window.setTimeout(tick, 100);
    };

    tick();
  });
}

async function getSessionToken(): Promise<string> {
  const shopify = await waitForShopifyBridge();
  return shopify.idToken();
}

async function fetchEmbeddedJson<T>(input: string, init?: RequestInit): Promise<T> {
  const token = await getSessionToken();
  const response = await fetch(input, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || `Embedded request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export function EmbeddedRestockClient() {
  const [sessionReady, setSessionReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<EmbeddedSummaryResponse | null>(null);
  const [subscriptions, setSubscriptions] = useState<EmbeddedSubscriptionsResponse["subscriptions"]>([]);
  const [subscriptionsTotal, setSubscriptionsTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "notified" | "unsubscribed">("all");
  const [sortBy, setSortBy] = useState<SubscriptionSortKey>("created");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(false);
  const [messages, setMessages] = useState<EmbeddedMessagesResponse["messages"]>([]);
  const [messagesTotal, setMessagesTotal] = useState(0);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [variantId, setVariantId] = useState("");
  const [triggerOptions, setTriggerOptions] = useState<TriggerOption[]>([]);
  const [triggerOptionsLoading, setTriggerOptionsLoading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [processingQueued, setProcessingQueued] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  function buildSubscriptionParams(): URLSearchParams {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (status !== "all") params.set("status", status);
    params.set("sortBy", sortBy);
    params.set("sortDirection", sortDirection);
    params.set("limit", "12");
    return params;
  }

  function updateSubscriptionSort(nextSortBy: SubscriptionSortKey) {
    setSortDirection((currentDirection) =>
      sortBy === nextSortBy
        ? currentDirection === "asc"
          ? "desc"
          : "asc"
        : getDefaultSortDirection(nextSortBy)
    );
    setSortBy(nextSortBy);
  }

  function renderSortButton(label: string, nextSortBy: SubscriptionSortKey) {
    const active = sortBy === nextSortBy;
    return (
      <button
        type="button"
        style={styles.sortButton}
        onClick={() => updateSubscriptionSort(nextSortBy)}
        title={nextSortBy === "active" ? "Sort active subscriptions first" : `Sort by ${label.toLowerCase()}`}
      >
        {label}
        {active ? <span style={styles.sortState}>{sortDirection.toUpperCase()}</span> : null}
      </button>
    );
  }

  useEffect(() => {
    let cancelled = false;

    async function loadTriggerOptions() {
      if (!sessionReady) return;
      setTriggerOptionsLoading(true);
      try {
        const data = await fetchEmbeddedJson<TriggerOptionsResponse>("/api/embedded/restock/trigger-options");
        if (!cancelled) {
          setTriggerOptions(data.options);
          setVariantId((currentVariantId) =>
            currentVariantId && data.options.some((option) => option.variantId === currentVariantId)
              ? currentVariantId
              : ""
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load trigger options");
        }
      } finally {
        if (!cancelled) {
          setTriggerOptionsLoading(false);
        }
      }
    }

    void loadTriggerOptions();

    return () => {
      cancelled = true;
    };
  }, [sessionReady]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchEmbeddedJson<EmbeddedSummaryResponse>("/api/embedded/restock/summary");
        if (!cancelled) {
          setSessionReady(true);
          setSummary(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load embedded Restock Raven summary");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSubscriptions() {
      if (!sessionReady) return;

      setSubscriptionsLoading(true);
      try {
        const params = buildSubscriptionParams();

        const data = await fetchEmbeddedJson<EmbeddedSubscriptionsResponse>(
          `/api/embedded/restock/subscriptions?${params.toString()}`
        );
        if (!cancelled) {
          setSubscriptions(data.subscriptions);
          setSubscriptionsTotal(data.total);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load subscriptions");
        }
      } finally {
        if (!cancelled) {
          setSubscriptionsLoading(false);
        }
      }
    }

    void loadSubscriptions();

    return () => {
      cancelled = true;
    };
  }, [sessionReady, query, status, sortBy, sortDirection]);

  useEffect(() => {
    let cancelled = false;

    async function loadMessages() {
      if (!sessionReady) return;
      setMessagesLoading(true);
      try {
        const data = await fetchEmbeddedJson<EmbeddedMessagesResponse>("/api/embedded/restock/messages?limit=8");
        if (!cancelled) {
          setMessages(data.messages);
          setMessagesTotal(data.total);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load message log");
        }
      } finally {
        if (!cancelled) {
          setMessagesLoading(false);
        }
      }
    }

    void loadMessages();

    return () => {
      cancelled = true;
    };
  }, [sessionReady]);

  async function reloadSubscriptions() {
    if (!sessionReady) return;
    setSubscriptionsLoading(true);
    try {
      const params = buildSubscriptionParams();

      const data = await fetchEmbeddedJson<EmbeddedSubscriptionsResponse>(
        `/api/embedded/restock/subscriptions?${params.toString()}`
      );
      setSubscriptions(data.subscriptions);
      setSubscriptionsTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reload subscriptions");
    } finally {
      setSubscriptionsLoading(false);
    }
  }

  async function requeue(subscriptionId: string) {
    if (!sessionReady) {
      setActionMessage("Shopify session token is missing. Reload this page inside Shopify Admin.");
      return;
    }

    setActionMessage(null);
    try {
      const data = await fetchEmbeddedJson<{ ok?: boolean; error?: string }>("/api/embedded/restock/requeue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ subscriptionId })
      });
      if (!data?.ok) {
        throw new Error(data?.error || "Requeue request failed");
      }
      setActionMessage(`Requeued subscription ${subscriptionId}.`);
      await reloadSubscriptions();
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Requeue failed");
    }
  }

  async function submitTrigger(processNow: boolean) {
    if (!sessionReady) {
      setActionMessage("Shopify session token is missing. Reload this page inside Shopify Admin.");
      return;
    }

    const cleanedVariantId = variantId.trim();
    if (!cleanedVariantId) {
      setActionMessage("Choose a subscribed product first.");
      return;
    }

    const selectedOption = triggerOptions.find((option) => option.variantId === cleanedVariantId) ?? null;
    if (!selectedOption) {
      setActionMessage("Choose a subscribed product first.");
      return;
    }

    const confirmed = processNow
      ? window.confirm(
          `Send restock alert for ${formatTriggerOption(selectedOption)}?\n\nThis will email ${formatWaitingCustomers(
            selectedOption.activeSubscriptionCount
          )} now.`
        )
      : window.confirm(`Queue a restock alert for ${formatTriggerOption(selectedOption)} without sending it now?`);
    if (!confirmed) {
      return;
    }

    setTriggering(true);
    setActionMessage(null);
    try {
      const data = await fetchEmbeddedJson<TriggerResponse | { ok?: false; error?: string }>(
        "/api/embedded/restock/trigger",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            variantId: cleanedVariantId,
            processNow
          })
        }
      );
      if (!data || data.ok !== true) {
        throw new Error(("error" in data && data.error) || "Trigger request failed");
      }

      setActionMessage(
        data.processResult
          ? `Sent restock alert for ${selectedOption.label}. ${data.processResult.messagesSent} message(s) sent.`
          : `Queued restock alert for ${selectedOption.label}.`
      );
      await Promise.allSettled([reloadSubscriptions()]);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Trigger failed");
    } finally {
      setTriggering(false);
    }
  }

  async function processQueuedAlerts() {
    if (!sessionReady) {
      setActionMessage("Shopify session token is missing. Reload this page inside Shopify Admin.");
      return;
    }

    const confirmed = window.confirm("Process all queued restock alerts now?\n\nThis may email waiting customers.");
    if (!confirmed) {
      return;
    }

    setProcessingQueued(true);
    setActionMessage(null);
    try {
      const data = await fetchEmbeddedJson<ProcessQueuedResponse | { ok?: false; error?: string }>(
        "/api/embedded/restock/process",
        { method: "POST" }
      );
      if (!data || data.ok !== true) {
        throw new Error(("error" in data && data.error) || "Process request failed");
      }

      setActionMessage(
        `Processed ${data.processResult.eventsClaimed} queued alert(s), sending ${data.processResult.messagesSent} message(s).`
      );
      await Promise.allSettled([reloadSubscriptions()]);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Process failed");
    } finally {
      setProcessingQueued(false);
    }
  }

  const systemStatus = summary ? getSystemStatus(summary) : null;

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <div style={styles.hero}>
          <h1 style={styles.h1}>Restock alerts</h1>
        </div>

        {loading ? <section style={styles.card}>Connecting to Shopify and loading restock summary...</section> : null}

        {error ? (
          <section style={styles.warnCard}>
            <strong>Embedded auth is not ready yet.</strong>
            <p style={styles.paragraph}>{error}</p>
            <p style={styles.paragraph}>
              This usually means the page wasn’t opened inside Shopify Admin, the app isn’t embedded yet, or the app
              credentials in this deployment don’t match Shopify.
            </p>
          </section>
        ) : null}

        {summary ? (
          <>
            <section style={styles.summaryStrip}>
              <article style={styles.statCard}>
                <div style={styles.statLabel}>Subscriptions</div>
                <p style={styles.metric}>{summary.subscriptions.total}</p>
                <p style={styles.statDetail}>
                  Active {summary.subscriptions.active} · Notified {summary.subscriptions.notified} · Unsubscribed{" "}
                  {summary.subscriptions.unsubscribed}
                </p>
              </article>
              <article style={{ ...styles.statCard, ...styles.statDivider }}>
                <div style={styles.statLabel}>System status</div>
                <p
                  style={{
                    ...styles.statusMetric,
                    ...(systemStatus?.tone === "danger"
                      ? styles.statusMetricDanger
                      : systemStatus?.tone === "warning"
                        ? styles.statusMetricWarning
                        : styles.statusMetricGood)
                  }}
                >
                  {systemStatus?.label}
                </p>
                <p style={styles.statDetail}>{systemStatus?.detail}</p>
              </article>
              <article style={{ ...styles.statCard, ...styles.statDivider }}>
                <div style={styles.statLabel}>Messages</div>
                <p style={styles.metric}>{summary.messages.total}</p>
                <p style={styles.statDetail}>
                  Sent {summary.messages.sent} · Failed {summary.messages.failed}
                </p>
              </article>
            </section>

            <section style={styles.card}>
              <strong style={styles.sectionTitle}>Send Restock Alert</strong>
              <p style={styles.paragraph}>
                Choose a product with waiting customers, then send the alert when you are ready.
              </p>
              <div style={styles.pausedBanner}>
                <strong>Automatic restock emails are paused.</strong> Alerts only send when you click Send Alert Now.
              </div>
              <div style={styles.triggerRow}>
                <select
                  value={variantId}
                  onChange={(event) => setVariantId(event.target.value)}
                  disabled={triggering || processingQueued || triggerOptionsLoading || triggerOptions.length === 0}
                  style={styles.triggerSelect}
                >
                  <option value="">
                    {triggerOptionsLoading
                      ? "Loading subscribed products..."
                      : triggerOptions.length
                        ? "Select subscribed product"
                        : "No subscribed products yet"}
                  </option>
                  {triggerOptions.map((option) => (
                    <option key={option.variantId} value={option.variantId}>
                      {formatTriggerOption(option)}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => void submitTrigger(true)}
                  disabled={triggering || processingQueued || !variantId}
                  style={{
                    ...styles.primaryButton,
                    ...((triggering || processingQueued || !variantId) ? styles.disabledButton : {})
                  }}
                >
                  Send Alert Now
                </button>
              </div>
              <details style={styles.advanced}>
                <summary style={styles.advancedSummary}>Advanced</summary>
                <div style={styles.row}>
                  <button
                    onClick={() => void submitTrigger(false)}
                    disabled={triggering || processingQueued || !variantId}
                    style={{
                      ...styles.button,
                      ...((triggering || processingQueued || !variantId) ? styles.disabledButton : {})
                    }}
                  >
                    Queue without sending
                  </button>
                  <button
                    onClick={() => void processQueuedAlerts()}
                    disabled={triggering || processingQueued}
                    style={{
                      ...styles.button,
                      ...((triggering || processingQueued) ? styles.disabledButton : {})
                    }}
                  >
                    Process queued alerts
                  </button>
                </div>
              </details>
              {actionMessage ? <p style={styles.paragraph}>{actionMessage}</p> : null}
            </section>

            <section style={styles.card}>
              <div style={styles.sectionHeader}>
                <div>
                  <strong style={styles.sectionTitle}>Subscriptions</strong>
                  <p style={styles.paragraph}>Recent subscribers.</p>
                </div>
                <div style={styles.row}>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search contact or variant"
                    style={styles.input}
                  />
                  <select
                    value={status}
                    onChange={(event) =>
                      setStatus(event.target.value as "all" | "active" | "notified" | "unsubscribed")
                    }
                    style={styles.select}
                  >
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="notified">Notified</option>
                    <option value="unsubscribed">Unsubscribed</option>
                  </select>
                </div>
              </div>
              <p style={styles.paragraph}>Showing {subscriptions.length} of {subscriptionsTotal} subscriptions.</p>
              {subscriptionsLoading ? <p style={styles.paragraph}>Loading subscriptions...</p> : null}
              {!subscriptionsLoading && subscriptions.length === 0 ? (
                <p style={styles.paragraph}>No subscriptions matched the current filters.</p>
              ) : null}
              {!subscriptionsLoading && subscriptions.length > 0 ? (
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Contact</th>
                        <th style={styles.th}>{renderSortButton("Product", "product")}</th>
                        <th style={styles.th}>{renderSortButton("Status", "active")}</th>
                        <th style={styles.th}>{renderSortButton("Created", "created")}</th>
                        <th style={styles.th}>{renderSortButton("Notified", "notified")}</th>
                        <th style={styles.th}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subscriptions.map((subscription) => {
                        const variantDetails = getSubscriptionVariantDetails(subscription);
                        return (
                          <tr key={subscription.id}>
                            <td style={styles.td}>{subscription.email || subscription.phone || "-"}</td>
                            <td style={styles.td} title={`Variant ID: ${subscription.variant_id}`}>
                              <span style={styles.primaryCell}>{getSubscriptionProductName(subscription)}</span>
                              {variantDetails ? <span style={styles.secondaryCell}>{variantDetails}</span> : null}
                            </td>
                            <td style={styles.td}>{subscription.status}</td>
                            <td style={styles.td}>{new Date(subscription.created_at).toLocaleString()}</td>
                            <td style={styles.td}>
                              {subscription.notified_at ? new Date(subscription.notified_at).toLocaleString() : "-"}
                            </td>
                            <td style={styles.td}>
                              <button style={styles.smallButton} onClick={() => void requeue(subscription.id)}>
                                Requeue
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>

            <section style={styles.card}>
              <strong style={styles.sectionTitle}>Message Log</strong>
              <p style={styles.paragraph}>Showing {messages.length} of {messagesTotal} recent delivery attempts.</p>
              {messagesLoading ? <p style={styles.paragraph}>Loading message log...</p> : null}
              {!messagesLoading && messages.length > 0 ? (
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Sent</th>
                        <th style={styles.th}>Channel</th>
                        <th style={styles.th}>Status</th>
                        <th style={styles.th}>Contact</th>
                        <th style={styles.th}>Variant</th>
                        <th style={styles.th}>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {messages.map((message) => (
                        <tr key={message.id}>
                          <td style={styles.td}>{new Date(message.sent_at).toLocaleString()}</td>
                          <td style={styles.td}>{message.channel}</td>
                          <td style={styles.td}>{message.status}</td>
                          <td style={styles.td}>{message.email || message.phone || "-"}</td>
                          <td style={styles.td}>{message.variant_id}</td>
                          <td style={styles.td}>{message.error || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    padding: "28px 28px 64px",
    background: "#f5f5f3",
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: "#2d2c29"
  },
  container: {
    maxWidth: 1120,
    margin: "0 auto",
    display: "grid",
    gap: 22
  },
  hero: {
    display: "grid",
    gap: 8,
    padding: "4px 0 0"
  },
  h1: {
    margin: 0,
    fontSize: 34,
    lineHeight: 1.08,
    letterSpacing: 0,
    color: "#2d2c29"
  },
  summaryStrip: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    borderTop: "1px solid #dddcd7",
    borderBottom: "1px solid #dddcd7",
    background: "#fcfcfa"
  },
  row: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap"
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap"
  },
  card: {
    background: "transparent",
    borderTop: "1px solid #dddcd7",
    borderRadius: 0,
    padding: "24px 0 0",
    boxShadow: "none"
  },
  statCard: {
    display: "grid",
    gap: 4,
    minHeight: 0,
    padding: "16px 18px",
    background: "transparent"
  },
  statDivider: {
    borderLeft: "1px solid #dddcd7"
  },
  warnCard: {
    background: "#fff8e7",
    border: "1px solid #e3d0a1",
    borderRadius: 12,
    padding: 16,
    boxShadow: "none"
  },
  paragraph: {
    margin: "8px 0 0",
    color: "#6f726d",
    lineHeight: 1.45
  },
  sectionTitle: {
    display: "block",
    fontSize: 18,
    lineHeight: 1.2,
    color: "#2d2c29"
  },
  mono: {
    margin: "8px 0 0",
    color: "#2d2c29",
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'
  },
  statLabel: {
    color: "#6f726d",
    fontSize: 11,
    fontWeight: 800,
    lineHeight: 1.1,
    letterSpacing: "0.08em",
    textTransform: "uppercase"
  },
  metric: {
    margin: "2px 0",
    fontSize: 26,
    fontWeight: 700,
    lineHeight: 1.05,
    letterSpacing: 0,
    color: "#2d2c29"
  },
  statusMetric: {
    width: "max-content",
    margin: "4px 0 2px",
    padding: "5px 10px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 800,
    lineHeight: 1.2
  },
  statusMetricGood: {
    background: "#d9e3db",
    color: "#3f644b"
  },
  statusMetricWarning: {
    background: "#eadccf",
    color: "#a66a3f"
  },
  statusMetricDanger: {
    background: "#f0d7d3",
    color: "#9d352d"
  },
  statDetail: {
    margin: 0,
    color: "#6f726d",
    fontSize: 12,
    lineHeight: 1.35
  },
  input: {
    height: 36,
    minWidth: 200,
    padding: "0 12px",
    borderRadius: 6,
    border: "1px solid #dddcd7",
    background: "#fcfcfa",
    color: "#2d2c29"
  },
  select: {
    height: 36,
    minWidth: 140,
    padding: "0 12px",
    borderRadius: 6,
    border: "1px solid #dddcd7",
    background: "#fcfcfa",
    color: "#2d2c29"
  },
  pausedBanner: {
    margin: "14px 0",
    padding: "10px 0 10px 12px",
    borderLeft: "3px solid #a66a3f",
    background: "transparent",
    color: "#6f4b31",
    lineHeight: 1.4
  },
  triggerRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 12
  },
  triggerSelect: {
    height: 36,
    flex: "1 1 280px",
    minWidth: 240,
    maxWidth: 560,
    padding: "0 12px",
    borderRadius: 6,
    border: "1px solid #dddcd7",
    background: "#fcfcfa",
    color: "#2d2c29"
  },
  advanced: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: "1px solid #dddcd7"
  },
  advancedSummary: {
    cursor: "pointer",
    color: "#3f644b",
    fontWeight: 700
  },
  button: {
    height: 36,
    padding: "0 14px",
    borderRadius: 6,
    border: "1px solid #8c8f89",
    background: "#fcfcfa",
    color: "#2d2c29",
    cursor: "pointer",
    fontWeight: 600
  },
  primaryButton: {
    height: 36,
    padding: "0 14px",
    borderRadius: 6,
    border: "1px solid #3f644b",
    background: "#3f644b",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 700
  },
  disabledButton: {
    opacity: 0.55,
    cursor: "not-allowed"
  },
  smallButton: {
    height: 30,
    padding: "0 10px",
    borderRadius: 6,
    border: "1px solid #8c8f89",
    background: "#fcfcfa",
    color: "#2d2c29",
    cursor: "pointer",
    fontWeight: 600
  },
  tableWrap: {
    overflowX: "auto",
    marginTop: 14,
    borderTop: "1px solid #dddcd7"
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    background: "transparent"
  },
  th: {
    textAlign: "left",
    fontSize: 12,
    color: "#6f726d",
    padding: "10px 8px",
    borderBottom: "1px solid #dddcd7"
  },
  sortButton: {
    appearance: "none",
    border: 0,
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    font: "inherit",
    fontWeight: 700,
    padding: 0
  },
  sortState: {
    color: "#3f644b",
    fontSize: 10,
    letterSpacing: "0.04em"
  },
  td: {
    padding: "12px 8px",
    borderBottom: "1px solid #e6e4df",
    fontSize: 14
  },
  primaryCell: {
    display: "block",
    color: "#2d2c29",
    fontWeight: 700
  },
  secondaryCell: {
    display: "block",
    marginTop: 3,
    color: "#6f726d",
    fontSize: 12
  }
};
