import { useEffect, useState } from "react";
import { Badge, Button, Input, Progress, Skeleton, StatusDot } from "@babymenu/ui";
import {
  fetchQuota,
  findFiveHourWindow,
  findWeeklyWindow,
  getCachedQuota,
  getResetCreditExpiry,
  setResetCreditExpiry,
  subscribeQuota,
  type CodexQuotaSnapshot,
  type QuotaResult,
} from "./store";

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

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
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
      <span>codex · weekly</span>
      <span className={`flex items-center gap-1.5 ${toneTextClass[tone]}`}>
        <StatusDot tone={tone} pulse={tone === "live"} />
        {label}
      </span>
    </div>
  );
}

function RingChart({ percentRemaining, tone, size = 44 }: { percentRemaining: number; tone: "live" | "warn" | "danger" | "muted"; size?: number }) {
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

function SessionTile({ percentUsed, resetText, resetAt }: { percentUsed: number; resetText?: string; resetAt?: string }) {
  const percentRemaining = Math.round(100 - percentUsed);
  const tone = toneForRemaining(percentRemaining);
  const reset = resetText || formatResetAt(resetAt);
  return (
    <div className="flex flex-1 flex-col gap-1.5 rounded-sm bg-elevated px-2.5 py-2">
      <span className="text-xxs uppercase tracking-caps text-ink-label">session · 5h</span>
      <div className="flex items-center gap-2">
        <RingChart percentRemaining={percentRemaining} tone={tone} size={36} />
        <div className="flex flex-1 flex-col gap-1">
          <Progress value={Math.round(percentUsed)} tone={tone} />
          <span className={`text-xs ${toneTextClass[tone]}`}>
            {Math.round(percentUsed)}
            <span className="ml-0.5 text-ink-soft">% used</span>
          </span>
        </div>
      </div>
      {reset ? <span className="text-xxs text-ink-soft">{reset}</span> : null}
    </div>
  );
}

function daysUntil(dateStr: string): number | undefined {
  const ms = Date.parse(dateStr);
  if (Number.isNaN(ms)) return undefined;
  return Math.ceil((ms - Date.now()) / (1000 * 60 * 60 * 24));
}

function formatExpiryDate(dateStr: string): string {
  const ms = Date.parse(dateStr);
  if (Number.isNaN(ms)) return dateStr;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(ms));
}

function FreeResetTile({
  availableCount,
  expiresAt,
  onSetExpiry,
}: {
  availableCount: number;
  expiresAt?: string;
  onSetExpiry: (expiresAt: string | undefined) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(expiresAt ?? "");

  useEffect(() => {
    setDraft(expiresAt ?? "");
  }, [expiresAt]);

  const remainingDays = expiresAt ? daysUntil(expiresAt) : undefined;
  const expiringSoon = remainingDays !== undefined && remainingDays <= 7;

  if (editing) {
    return (
      <div className="flex flex-1 flex-col gap-1.5 rounded-sm bg-elevated px-2.5 py-2">
        <span className="text-xxs uppercase tracking-caps text-ink-label">free reset · expiry</span>
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="text-xxs"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              onSetExpiry(draft || undefined);
              setEditing(false);
            }}
          >
            save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-1.5 rounded-sm bg-elevated px-2.5 py-2">
      <span className="text-xxs uppercase tracking-caps text-ink-label">free reset</span>
      <span className="text-lg font-light tracking-value text-ink-strong">{availableCount}</span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={`text-left text-xxs ${expiringSoon ? "text-signal-warn" : "text-ink-soft underline decoration-dotted"}`}
      >
        {expiresAt
          ? `expires ${formatExpiryDate(expiresAt)}${remainingDays !== undefined ? ` (${remainingDays}d)` : ""}`
          : "set expiry"}
      </button>
    </div>
  );
}

function CreditsRow({ credits }: { credits: NonNullable<CodexQuotaSnapshot["credits"]> }) {
  if (credits.unlimited) {
    return (
      <div className="flex items-center justify-between rounded-sm bg-elevated px-2.5 py-2">
        <span className="text-xxs uppercase tracking-caps text-ink-label">credits</span>
        <span className="text-sm text-ink-strong">unlimited</span>
      </div>
    );
  }
  if (credits.balance === undefined) return null;
  return (
    <div className="flex items-center justify-between rounded-sm bg-elevated px-2.5 py-2">
      <span className="text-xxs uppercase tracking-caps text-ink-label">credits</span>
      <span className={`text-sm ${credits.hasCredits ? "text-ink-strong" : "text-ink-soft"}`}>
        {formatUsd(credits.balance)}
        {credits.hasCredits === false ? <span className="ml-1.5 text-xxs text-ink-soft">none available</span> : null}
      </span>
    </div>
  );
}

export function CodexQuotaView() {
  const [result, setResult] = useState<QuotaResult | undefined>(getCachedQuota());
  const [resetExpiry, setResetExpiryState] = useState<string | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = subscribeQuota(() => setResult(getCachedQuota()));
    if (!getCachedQuota()) void fetchQuota();
    return unsubscribe;
  }, []);

  useEffect(() => {
    void getResetCreditExpiry().then(setResetExpiryState);
  }, []);

  function handleSetExpiry(expiresAt: string | undefined) {
    setResetExpiryState(expiresAt);
    void setResetCreditExpiry(expiresAt);
  }

  if (!result) {
    return (
      <div className="flex flex-col gap-2">
        <Header tone="muted" label="loading" />
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-2 w-full" />
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

  const weekly = findWeeklyWindow(result.data);
  const fiveHour = findFiveHourWindow(result.data);
  const credits = result.data.credits;
  const availableResets = result.data.resetCredits?.availableCount;

  if ((!weekly || weekly.percentUsed === undefined) && !credits) {
    return (
      <div className="flex flex-col gap-2">
        <Header tone="muted" label={result.data.stale ? "stale" : "no data"} />
        <span className="text-sm text-ink-muted">weekly window unavailable</span>
      </div>
    );
  }

  const percentRemaining = weekly?.percentUsed !== undefined ? Math.round(100 - weekly.percentUsed) : undefined;
  const percentUsed = weekly?.percentUsed !== undefined ? Math.round(weekly.percentUsed) : undefined;
  const tone = percentRemaining !== undefined ? toneForRemaining(percentRemaining) : "muted";

  return (
    <div className="flex flex-col gap-2.5">
      <Header tone={result.data.stale ? "muted" : tone} label={result.data.stale ? "stale" : "live"} />
      {percentRemaining !== undefined && percentUsed !== undefined ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <RingChart percentRemaining={percentRemaining} tone={tone} />
              <div className="flex flex-1 flex-col gap-1">
                <Progress value={percentUsed} tone={tone} />
                <span className={`text-sm ${toneTextClass[tone]}`}>
                  {percentUsed}
                  <span className="ml-1 text-xs text-ink-soft">% used</span>
                </span>
              </div>
            </div>
            {result.data.plan ? <Badge tone="neutral">{result.data.plan}</Badge> : null}
          </div>
          <span className="text-xxs uppercase tracking-caps text-ink-label">
            {weekly?.resetText || formatResetAt(weekly?.resetAt)
              ? [weekly?.resetText, formatResetAt(weekly?.resetAt)].filter(Boolean).join(" · ")
              : "reset time unavailable"}
          </span>
        </>
      ) : null}
      {(fiveHour && fiveHour.percentUsed !== undefined) || availableResets ? (
        <div className="flex gap-2">
          {fiveHour && fiveHour.percentUsed !== undefined ? (
            <SessionTile percentUsed={fiveHour.percentUsed} resetText={fiveHour.resetText} resetAt={fiveHour.resetAt} />
          ) : null}
          {availableResets ? (
            <FreeResetTile availableCount={availableResets} expiresAt={resetExpiry} onSetExpiry={handleSetExpiry} />
          ) : null}
        </div>
      ) : null}
      {credits ? <CreditsRow credits={credits} /> : null}
    </div>
  );
}
