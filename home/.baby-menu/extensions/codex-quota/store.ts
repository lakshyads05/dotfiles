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
  resetCredits?: {
    availableCount?: number;
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

export function findFiveHourWindow(snapshot: CodexQuotaSnapshot): QuotaWindow | undefined {
  return snapshot.windows.find((w) => w.id === "five_hour");
}

// The free-reset-credit expiry is user-known (from OpenAI's own notices), not part of the
// usage API response, so it is tracked locally rather than fetched.
const RESET_EXPIRY_TABLE = "codex_quota_reset_credit";

async function ensureResetExpiryTable(): Promise<void> {
  await window.babyMenu!.db.exec(
    `CREATE TABLE IF NOT EXISTS ${RESET_EXPIRY_TABLE} (id INTEGER PRIMARY KEY CHECK (id = 1), expires_at TEXT)`,
  );
}

export async function getResetCreditExpiry(): Promise<string | undefined> {
  await ensureResetExpiryTable();
  const row = await window.babyMenu!.db.get<{ expires_at: string | null }>(
    `SELECT expires_at FROM ${RESET_EXPIRY_TABLE} WHERE id = 1`,
  );
  return row?.expires_at ?? undefined;
}

export async function setResetCreditExpiry(expiresAt: string | undefined): Promise<void> {
  await ensureResetExpiryTable();
  await window.babyMenu!.db.run(
    `INSERT INTO ${RESET_EXPIRY_TABLE} (id, expires_at) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET expires_at = excluded.expires_at`,
    [expiresAt ?? null],
  );
}
