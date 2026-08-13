import { useEffect, useState } from "react";
import { Badge, Progress, Skeleton, StatusDot } from "@babymenu/ui";
import { fetchQuota, findWindow, getCachedQuota, subscribeQuota, type CursorQuotaSnapshot, type QuotaResult } from "./store";

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

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function Header({ tone, label }: { tone: "live" | "warn" | "danger" | "muted"; label: string }) {
  return (
    <div className="flex items-center justify-between text-xxs uppercase tracking-caps text-ink-label">
      <span>cursor · monthly</span>
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

function Tile({ label, percentRemaining }: { label: string; percentRemaining: number }) {
  const tone = toneForRemaining(percentRemaining);
  const percentUsed = Math.round(100 - percentRemaining);
  return (
    <div className="flex flex-1 flex-col gap-1.5 rounded-sm bg-elevated px-2.5 py-2">
      <span className="text-xxs uppercase tracking-caps text-ink-label">{label}</span>
      <div className="flex items-center gap-2">
        <RingChart percentRemaining={percentRemaining} tone={tone} />
        <div className="flex flex-1 flex-col gap-1">
          <Progress value={percentUsed} tone={tone} />
          <span className={`text-xs ${toneTextClass[tone]}`}>
            {percentUsed}
            <span className="ml-0.5 text-ink-soft">% used</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function OnDemandTile({ onDemand }: { onDemand: NonNullable<CursorQuotaSnapshot["onDemand"]> }) {
  if (onDemand.limitCents !== undefined && onDemand.remainingCents !== undefined) {
    const percentRemaining = Math.max(0, 100 - (onDemand.percentUsed ?? 0));
    const percentUsed = Math.round(onDemand.percentUsed ?? 0);
    const tone = toneForRemaining(percentRemaining);
    return (
      <div className="flex flex-1 flex-col gap-1.5 rounded-sm bg-elevated px-2.5 py-2">
        <span className="text-xxs uppercase tracking-caps text-ink-label">on-demand</span>
        <div className="flex items-center gap-2">
          <RingChart percentRemaining={percentRemaining} tone={tone} />
          <div className="flex flex-1 flex-col gap-1">
            <Progress value={percentUsed} tone={tone} />
            <span className={`text-xs ${toneTextClass[tone]}`}>
              {formatCents(onDemand.usedCents)}
              <span className="ml-0.5 text-ink-soft">used</span>
            </span>
          </div>
        </div>
        <span className="text-xxs text-ink-soft">of {formatCents(onDemand.limitCents)}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col gap-1.5 rounded-sm bg-elevated px-2.5 py-2">
      <span className="text-xxs uppercase tracking-caps text-ink-label">on-demand</span>
      <span className="text-lg font-light tracking-value text-ink-strong">{formatCents(onDemand.usedCents)}</span>
      <span className="text-xxs text-ink-soft">spent, no limit set</span>
    </div>
  );
}

export function CursorQuotaView() {
  const [result, setResult] = useState<QuotaResult | undefined>(getCachedQuota());

  useEffect(() => {
    const unsubscribe = subscribeQuota(() => setResult(getCachedQuota()));
    if (!getCachedQuota()) void fetchQuota();
    return unsubscribe;
  }, []);

  if (!result) {
    return (
      <div className="flex flex-col gap-2.5">
        <Header tone="muted" label="loading" />
        <Skeleton className="h-10 w-24" />
        <div className="flex gap-2">
          <Skeleton className="h-16 flex-1" />
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

  const included = findWindow(result.data, "included_usage");
  const auto = findWindow(result.data, "auto_usage");
  const api = findWindow(result.data, "api_usage");
  const onDemand = result.data.onDemand;

  if (!included && !auto && !api && !onDemand) {
    return (
      <div className="flex flex-col gap-2">
        <Header tone="muted" label={result.data.stale ? "stale" : "no data"} />
        <span className="text-sm text-ink-muted">usage windows unavailable</span>
      </div>
    );
  }

  const headlineRemaining = included ? Math.round(100 - included.percentUsed) : undefined;
  const headlineUsed = included ? Math.round(included.percentUsed) : undefined;
  const headlineTone = headlineRemaining !== undefined ? toneForRemaining(headlineRemaining) : "muted";
  const resetLabel = included?.resetAt
    ? new Date(included.resetAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : undefined;

  return (
    <div className="flex flex-col gap-2.5">
      <Header tone={result.data.stale ? "muted" : headlineTone} label={result.data.stale ? "stale" : "live"} />
      {headlineRemaining !== undefined ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <RingChart percentRemaining={headlineRemaining} tone={headlineTone} size={44} />
            <div className="flex flex-1 flex-col gap-1">
              <Progress value={headlineUsed ?? 0} tone={headlineTone} />
              <span className={`text-sm ${toneTextClass[headlineTone]}`}>
                {headlineUsed}
                <span className="ml-1 text-xs text-ink-soft">% included used</span>
              </span>
            </div>
          </div>
          {result.data.plan ? <Badge tone="neutral">{result.data.plan}</Badge> : null}
        </div>
      ) : null}
      <div className="flex gap-2">
        {auto ? <Tile label="auto" percentRemaining={100 - auto.percentUsed} /> : null}
        {api ? <Tile label="api" percentRemaining={100 - api.percentUsed} /> : null}
        {onDemand ? <OnDemandTile onDemand={onDemand} /> : null}
      </div>
      {resetLabel ? (
        <span className="text-xxs uppercase tracking-caps text-ink-label">resets {resetLabel}</span>
      ) : null}
    </div>
  );
}
