type QuotaWindow = {
  id: "five_hour" | "weekly";
  label: string;
  percentUsed?: number;
  resetText?: string;
  resetAt?: string;
};

export type CodexQuotaSnapshot = {
  source: "oauth" | "cli-rpc";
  accountEmail?: string;
  plan?: string;
  windows: QuotaWindow[];
  credits?: {
    balance?: number;
    hasCredits?: boolean;
    unlimited?: boolean;
  };
  refreshedAt: string;
  stale: boolean;
};

export type QuotaResult =
  | { ok: true; data: CodexQuotaSnapshot }
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
    .babyMenu!.capabilities.invoke<QuotaResult>("codex-quota", "getQuota")
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

export function findWeeklyWindow(snapshot: CodexQuotaSnapshot): QuotaWindow | undefined {
  return snapshot.windows.find((w) => w.id === "weekly");
}
