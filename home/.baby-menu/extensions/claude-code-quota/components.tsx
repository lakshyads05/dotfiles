import { useEffect, useState } from "react";
import { Progress, Skeleton, StatusDot } from "@babymenu/ui";
import { fetchQuota, findWindow, getCachedQuota, subscribeQuota, type QuotaResult, type QuotaWindow } from "./store";

function toneForRemaining(percentRemaining: number): "live" | "warn" | "danger" {
  if (percentRemaining <= 10) return "danger";
  if (percentRemaining <= 30) return "warn";
  return "live";
}

const toneTextClass: Record<"live" | "warn" | "danger" | "muted", string> = {
  live: "text-signal-live",
  warn: "text-signal-warn",
  danger: "text-signal-danger",
  muted: "text-ink-soft",
};

function formatUsd(amount: number, currency = "USD"): string {
  const symbol = currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${amount.toFixed(2)}`;
}

function formatDisabledReason(reason: string): string {
  return reason.replace(/_/g, " ");
}

function formatResetAt(resetAt?: string): string | undefined {
  if (!resetAt) return undefined;
  const ms = Date.parse(resetAt);
  if (Number.isNaN(ms)) return undefined;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

function Header({ tone, label }: { tone: "live" | "warn" | "danger" | "muted"; label: string }) {
  return (
    <div className="flex items-center justify-between text-xxs uppercase tracking-caps text-ink-label">
      <span>claude code</span>
      <span className={`flex items-center gap-1.5 ${toneTextClass[tone]}`}>
        <StatusDot tone={tone} pulse={tone === "live"} />
        {label}
      </span>
    </div>
  );
}

function RingChart({ percentRemaining, tone, size = 36 }: { percentRemaining: number; tone: "live" | "warn" | "danger" | "muted"; size?: number }) {
  const clamped = Math.min(100, Math.max(0, percentRemaining));
  const strokeWidth = Math.max(3, Math.round(size * 0.12));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} stroke="currentColor" className="text-line" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className={toneTextClass[tone]}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`font-light tracking-value ${size >= 44 ? "text-xs" : "text-xxs"} ${toneTextClass[tone]}`}>
          {Math.round(clamped)}%
        </span>
      </div>
    </div>
  );
}

function Tile({
  label,
  percentRemaining,
  resetText,
  resetAt,
}: {
  label: string;
  percentRemaining: number;
  resetText?: string;
  resetAt?: string;
}) {
  const tone = toneForRemaining(percentRemaining);
  const percentUsed = Math.round(100 - percentRemaining);
  const resetAtLabel = formatResetAt(resetAt);
  return (
    <div className="flex flex-1 flex-col gap-1.5 rounded-sm bg-elevated px-2.5 py-2">
      <span className="text-xxs uppercase tracking-caps text-ink-label">{label}</span>
      <div className="flex items-center gap-2.5">
        <RingChart percentRemaining={percentRemaining} tone={tone} />
        <div className="flex flex-1 flex-col gap-1">
          <Progress value={percentUsed} tone={tone} />
          <span className={`text-xs ${toneTextClass[tone]}`}>
            {percentUsed}
            <span className="ml-0.5 text-ink-soft">% used</span>
          </span>
        </div>
      </div>
      {resetText || resetAtLabel ? (
        <span className="text-xxs text-ink-soft">
          {resetText}
          {resetText && resetAtLabel ? " · " : ""}
          {resetAtLabel}
        </span>
      ) : (
        <span className="text-xxs text-ink-soft">reset time unavailable</span>
      )}
    </div>
  );
}

function ExtraUsageTile({ window }: { window: QuotaWindow }) {
  const { percentUsed, spentUsd, limitUsd, currency, enabled, disabledReason } = window;
  const tone = percentUsed !== undefined ? toneForRemaining(100 - percentUsed) : "muted";
  const showAmounts = spentUsd !== undefined && limitUsd !== undefined;
  return (
    <div className="flex flex-col gap-1.5 rounded-sm bg-elevated px-2.5 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xxs uppercase tracking-caps text-ink-label">extra usage</span>
        {enabled === false ? (
          <span className="text-xxs text-ink-soft">{disabledReason ? formatDisabledReason(disabledReason) : "disabled"}</span>
        ) : null}
      </div>
      {percentUsed !== undefined ? (
        <div className="flex items-center gap-2.5">
          <RingChart percentRemaining={100 - percentUsed} tone={tone} />
          <div className="flex flex-1 flex-col gap-1">
            <Progress value={Math.round(percentUsed)} tone={tone} />
            <span className={`text-xs ${toneTextClass[tone]}`}>
              {Math.round(percentUsed)}
              <span className="ml-0.5 text-ink-soft">% used</span>
            </span>
          </div>
        </div>
      ) : spentUsd !== undefined ? (
        <span className="text-lg font-light tracking-value text-ink-strong">{formatUsd(spentUsd, currency)}</span>
      ) : null}
      {showAmounts ? (
        <span className="text-xxs text-ink-soft">
          {formatUsd(spentUsd!, currency)} of {formatUsd(limitUsd!, currency)}
        </span>
      ) : null}
    </div>
  );
}

export function ClaudeCodeQuotaView() {
  const [result, setResult] = useState<QuotaResult | undefined>(getCachedQuota());

  useEffect(() => {
    const unsubscribe = subscribeQuota(() => setResult(getCachedQuota()));
    if (!getCachedQuota()) void fetchQuota();
    return unsubscribe;
  }, []);

  if (!result) {
    return (
      <div className="flex flex-col gap-3">
        <Header tone="muted" label="loading" />
        <Skeleton className="h-10 w-24" />
        <div className="flex gap-2">
          <Skeleton className="h-16 flex-1" />
          <Skeleton className="h-16 flex-1" />
        </div>
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div className="flex flex-col gap-2">
        <Header tone="danger" label="error" />
        <span className="text-sm text-ink">{result.error}</span>
      </div>
    );
  }

  const fiveHour = findWindow(result.data, "five_hour");
  const weekly = findWindow(result.data, "seven_day");
  const extraUsage = findWindow(result.data, "extra_usage");

  if (fiveHour?.percentUsed === undefined && weekly?.percentUsed === undefined && !extraUsage) {
    return (
      <div className="flex flex-col gap-2">
        <Header tone="muted" label={result.data.stale ? "stale" : "no data"} />
        <span className="text-sm text-ink-muted">usage windows unavailable</span>
      </div>
    );
  }

  const overallRemaining = Math.round(
    100 - Math.max(fiveHour?.percentUsed ?? 0, weekly?.percentUsed ?? 0),
  );
  const overallTone = toneForRemaining(overallRemaining);

  return (
    <div className="flex flex-col gap-2.5">
      <Header tone={result.data.stale ? "muted" : overallTone} label={result.data.stale ? "stale" : "live"} />
      <div className="flex gap-2">
        {fiveHour?.percentUsed !== undefined ? (
          <Tile
            label="5 hour"
            percentRemaining={100 - fiveHour.percentUsed}
            resetText={fiveHour.resetText}
            resetAt={fiveHour.resetAt}
          />
        ) : null}
        {weekly?.percentUsed !== undefined ? (
          <Tile
            label="weekly"
            percentRemaining={100 - weekly.percentUsed}
            resetText={weekly.resetText}
            resetAt={weekly.resetAt}
          />
        ) : null}
      </div>
      {extraUsage ? <ExtraUsageTile window={extraUsage} /> : null}
    </div>
  );
}
