type QuotaWindow = {
  id: "included_usage" | "auto_usage" | "api_usage";
  label: string;
  kind?: "monthly";
  percentUsed: number;
  percentRemaining?: number;
  resetAt?: string;
};

type OnDemandUsage = {
  usedCents: number;
  limitCents?: number;
  remainingCents?: number;
  percentUsed?: number;
  limitType?: string;
};

export type CursorQuotaSnapshot = {
  source: "api";
  accountEmail?: string;
  plan?: string;
  windows: QuotaWindow[];
  onDemand?: OnDemandUsage;
  refreshedAt: string;
  stale: boolean;
  status?: string;
};

export type QuotaResult =
  | { ok: true; data: CursorQuotaSnapshot }
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
    .babyMenu!.capabilities.invoke<QuotaResult>("cursor-quota", "getQuota")
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

export function findWindow(snapshot: CursorQuotaSnapshot, id: QuotaWindow["id"]): QuotaWindow | undefined {
  return snapshot.windows.find((w) => w.id === id);
}
