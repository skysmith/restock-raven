"use client";

import { useMemo, useState, type FormEvent } from "react";

import type { TriggerVariantOption } from "@/lib/restock/trigger-options";

type ServerAction = (formData: FormData) => void | Promise<void>;

interface RestockTriggerPanelProps {
  options: TriggerVariantOption[];
  sendAction: ServerAction;
  queueAction: ServerAction;
  processAction: ServerAction;
}

function formatOptionLabel(option: TriggerVariantOption): string {
  return option.detail ? `${option.label} - ${option.detail}` : option.label;
}

function formatCustomerCount(count: number): string {
  return count === 1 ? "1 waiting customer" : `${count} waiting customers`;
}

export function RestockTriggerPanel({
  options,
  sendAction,
  queueAction,
  processAction,
}: RestockTriggerPanelProps) {
  const [variantId, setVariantId] = useState(options[0]?.variantId ?? "");
  const selectedOption = useMemo(
    () => options.find((option) => option.variantId === variantId) ?? null,
    [options, variantId]
  );
  const canSubmit = Boolean(selectedOption);

  function requireSelected(event: FormEvent<HTMLFormElement>) {
    if (!selectedOption) {
      event.preventDefault();
      return false;
    }
    return true;
  }

  function confirmSend(event: FormEvent<HTMLFormElement>) {
    if (!requireSelected(event)) {
      return;
    }
    const recipientCount =
      selectedOption?.activeSubscriptionCount ?? selectedOption?.subscriptionCount ?? 0;
    const confirmed = window.confirm(
      `Send restock alert for ${formatOptionLabel(selectedOption!)}?\n\nThis will email ${formatCustomerCount(
        recipientCount
      )} now.`
    );
    if (!confirmed) {
      event.preventDefault();
    }
  }

  function confirmQueue(event: FormEvent<HTMLFormElement>) {
    if (!requireSelected(event)) {
      return;
    }
    const confirmed = window.confirm(
      `Queue a restock alert for ${formatOptionLabel(
        selectedOption!
      )} without sending it now?`
    );
    if (!confirmed) {
      event.preventDefault();
    }
  }

  function confirmProcess(event: FormEvent<HTMLFormElement>) {
    const confirmed = window.confirm(
      "Process all queued restock alerts now?\n\nThis may email waiting customers."
    );
    if (!confirmed) {
      event.preventDefault();
    }
  }

  return (
    <section className="rr-trigger-panel rr-card rr-card--padded">
      <div className="rr-trigger-header">
        <h2>Send Restock Alert</h2>
        <p className="rr-note">
          Choose a product with waiting customers, then send the alert when you are
          ready.
        </p>
      </div>

      <div className="rr-status-banner">
        <strong>Automatic restock emails are paused.</strong>
        <span> Alerts only send when you click Send Alert Now.</span>
      </div>

      <div className="rr-trigger-primary">
        <label className="rr-trigger-select">
          <span>Product</span>
          <select
            name="variantId"
            value={variantId}
            onChange={(event) => setVariantId(event.target.value)}
            disabled={options.length === 0}
          >
            {options.length === 0 ? (
              <option value="">No subscribed products yet</option>
            ) : null}
            {options.map((option) => (
              <option key={option.variantId} value={option.variantId}>
                {formatOptionLabel(option)} ({option.activeSubscriptionCount} active)
              </option>
            ))}
          </select>
        </label>

        <form action={sendAction} onSubmit={confirmSend}>
          <input type="hidden" name="variantId" value={variantId} />
          <button
            className="rr-btn rr-btn--primary rr-btn--send"
            type="submit"
            disabled={!canSubmit}
          >
            Send Alert Now
          </button>
        </form>
      </div>

      <details className="rr-advanced-actions">
        <summary>Advanced</summary>
        <div className="rr-advanced-grid">
          <form action={queueAction} onSubmit={confirmQueue}>
            <input type="hidden" name="variantId" value={variantId} />
            <button className="rr-btn" type="submit" disabled={!canSubmit}>
              Queue without sending
            </button>
          </form>
          <form action={processAction} onSubmit={confirmProcess}>
            <button className="rr-btn" type="submit">
              Process queued alerts
            </button>
          </form>
        </div>
      </details>
    </section>
  );
}
