export type QuotaWindow = {
  id: "five_hour" | "seven_day" | "seven_day_sonnet" | "seven_day_opus" | "extra_usage";
  label: string;
  percentUsed?: number;
  resetText?: string;
  resetAt?: string;
  spentUsd?: number;
  limitUsd?: number;
  currency?: string;
  enabled?: boolean;
  disabledReason?: string;
};

export type ClaudeQuotaSnapshot = {
  source: "oauth" | "cli";
  accountEmail?: string;
  plan?: string;
  windows: QuotaWindow[];
  refreshedAt: string;
  stale: boolean;
};

export type QuotaResult =
  | { ok: true; data: ClaudeQuotaSnapshot }
  | { ok: false; error: string; sourceTried: string[] };

type Listener = () => void;

let cachedResult: QuotaResult | undefined;
let inFlight: Promise<QuotaResult> | undefined;
const listeners = new Set<Listener>();

export function getCachedQuota(): QuotaResult | undefined {
  return cachedResult;
}

export function subscribeQuota(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function fetchQuota(): Promise<QuotaResult> {
  if (inFlight) return inFlight;
  inFlight = window
    .babyMenu!.capabilities.invoke<QuotaResult>("claude-code-quota", "getQuota")
    .then((result) => {
      cachedResult = result;
      listeners.forEach((listener) => listener());
      return result;
    })
    .finally(() => {
      inFlight = undefined;
    });
  return inFlight;
}

export function findWindow(snapshot: ClaudeQuotaSnapshot, id: QuotaWindow["id"]): QuotaWindow | undefined {
  return snapshot.windows.find((w) => w.id === id);
}
