import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import type { BabyMenuServerContext } from "@babymenu/contracts";

type QuotaWindowId = "included_usage" | "auto_usage" | "api_usage";

type QuotaWindow = {
  id: QuotaWindowId;
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

type CursorQuotaSnapshot = {
  source: "api";
  accountEmail?: string;
  plan?: string;
  windows: QuotaWindow[];
  onDemand?: OnDemandUsage;
  refreshedAt: string;
  stale: boolean;
  status?: string;
};

type QuotaResult<T> = { ok: true; data: T } | { ok: false; error: string; sourceTried: string[] };

const SQLITE_CANDIDATES = ["sqlite3", "/usr/bin/sqlite3", "/opt/homebrew/bin/sqlite3", "/usr/local/bin/sqlite3"];

function dbPath(): string {
  return join(homedir(), "Library", "Application Support", "Cursor", "User", "globalStorage", "state.vscdb");
}

function runSqlite(binary: string, args: string[]): Promise<{ ok: true; stdout: string } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    execFile(binary, args, { timeout: 5_000 }, (error, stdout) => {
      if (error) {
        resolve({ ok: false, error: error.message });
        return;
      }
      resolve({ ok: true, stdout });
    });
  });
}

async function findSqlite(): Promise<string | undefined> {
  for (const candidate of SQLITE_CANDIDATES) {
    const result = await runSqlite(candidate, ["-version"]);
    if (result.ok) return candidate;
  }
  return undefined;
}

type AuthRow = { accessToken?: string; cachedEmail?: string; stripeMembershipType?: string };

async function readAuthFromDb(sqliteBin: string): Promise<{ ok: true; row: AuthRow } | { ok: false; busy: boolean }> {
  const query =
    "SELECT key, value FROM ItemTable WHERE key IN ('cursorAuth/accessToken', 'cursorAuth/cachedEmail', 'cursorAuth/stripeMembershipType');";
  const result = await runSqlite(sqliteBin, ["-readonly", "-cmd", ".timeout 1000", dbPath(), query]);
  if (!result.ok) {
    const busy = /locked|busy/i.test(result.error);
    return { ok: false, busy };
  }
  const row: AuthRow = {};
  for (const line of result.stdout.split("\n")) {
    const sep = line.indexOf("|");
    if (sep === -1) continue;
    const key = line.slice(0, sep);
    const value = line.slice(sep + 1);
    if (key === "cursorAuth/accessToken") row.accessToken = value;
    else if (key === "cursorAuth/cachedEmail") row.cachedEmail = value;
    else if (key === "cursorAuth/stripeMembershipType") row.stripeMembershipType = value;
  }
  return { ok: true, row };
}

async function callDashboard(
  path: string,
  token: string,
): Promise<{ status: number; body?: Record<string, unknown> }> {
  const res = await fetch(`https://api2.cursor.sh/aiserver.v1.DashboardService/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "connect-protocol-version": "1",
    },
    body: "{}",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return { status: res.status };
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

function parseResetAt(epochMsString: unknown): string | undefined {
  if (typeof epochMsString !== "string" && typeof epochMsString !== "number") return undefined;
  const ms = Number(epochMsString);
  if (!Number.isFinite(ms) || ms <= 0) return undefined;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function clampPercent(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(100, Math.max(0, value));
}

function clampCents(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

// "On-demand usage" is Cursor's usage-based billing beyond the included plan quota,
// capped by a user-configurable spend limit (Cursor's dashboard "Spend limits" setting).
// The API reports it as spendLimitUsage.individualUsed/individualLimit in integer cents.
function normalizeOnDemand(usageBody: Record<string, unknown>): OnDemandUsage | undefined {
  const spendLimitUsage = usageBody.spendLimitUsage as Record<string, unknown> | undefined;
  if (!spendLimitUsage) return undefined;
  const usedCents = clampCents(spendLimitUsage.individualUsed) ?? clampCents(spendLimitUsage.totalSpend);
  if (usedCents === undefined) return undefined;
  const limitCents = clampCents(spendLimitUsage.individualLimit);
  const remainingCents = clampCents(spendLimitUsage.individualRemaining);
  const percentUsed = limitCents && limitCents > 0 ? Math.min(100, Math.max(0, (usedCents / limitCents) * 100)) : undefined;
  return {
    usedCents,
    limitCents,
    remainingCents,
    percentUsed,
    limitType: typeof spendLimitUsage.limitType === "string" ? spendLimitUsage.limitType : undefined,
  };
}

function normalizeUsage(
  usageBody: Record<string, unknown>,
  planName: string | undefined,
  fallbackPlan: string | undefined,
): CursorQuotaSnapshot {
  const planUsage = usageBody.planUsage as Record<string, unknown> | undefined;
  const resetAt = parseResetAt(usageBody.billingCycleEnd);
  const windows: QuotaWindow[] = [];

  const specs: Array<{ id: QuotaWindowId; label: string; field: string }> = [
    { id: "included_usage", label: "included usage", field: "totalPercentUsed" },
    { id: "auto_usage", label: "auto usage", field: "autoPercentUsed" },
    { id: "api_usage", label: "API usage", field: "apiPercentUsed" },
  ];
  for (const spec of specs) {
    const percentUsed = clampPercent(planUsage?.[spec.field]);
    if (percentUsed === undefined) continue;
    windows.push({
      id: spec.id,
      label: spec.label,
      kind: "monthly",
      percentUsed,
      percentRemaining: 100 - percentUsed,
      resetAt,
    });
  }

  return {
    source: "api",
    plan: planName ?? fallbackPlan,
    windows,
    onDemand: normalizeOnDemand(usageBody),
    refreshedAt: new Date().toISOString(),
    stale: false,
  };
}

function ensureSnapshotTable(context: BabyMenuServerContext) {
  context.db.exec(
    "CREATE TABLE IF NOT EXISTS cursor_quota_snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), snapshot_json TEXT NOT NULL, updated_at INTEGER NOT NULL)",
  );
}

function persistSnapshot(context: BabyMenuServerContext, snapshot: CursorQuotaSnapshot) {
  ensureSnapshotTable(context);
  context.db.run(
    "INSERT INTO cursor_quota_snapshot (id, snapshot_json, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET snapshot_json = excluded.snapshot_json, updated_at = excluded.updated_at",
    [JSON.stringify(snapshot), Date.now()],
  );
}

function readLastSnapshot(context: BabyMenuServerContext): CursorQuotaSnapshot | undefined {
  ensureSnapshotTable(context);
  const row = context.db.get<{ snapshot_json: string }>(
    "SELECT snapshot_json FROM cursor_quota_snapshot WHERE id = 1",
  );
  if (!row) return undefined;
  try {
    return JSON.parse(row.snapshot_json) as CursorQuotaSnapshot;
  } catch {
    return undefined;
  }
}

export const actions = {
  getQuota: async (
    _input: unknown,
    context: BabyMenuServerContext,
  ): Promise<QuotaResult<CursorQuotaSnapshot>> => {
    const sourceTried: string[] = ["local-db"];

    const sqliteBin = await findSqlite();
    if (!sqliteBin) {
      return { ok: false, error: "Cursor quota unavailable", sourceTried };
    }

    const authResult = await readAuthFromDb(sqliteBin);
    if (!authResult.ok) {
      if (authResult.busy) {
        const stale = readLastSnapshot(context);
        if (stale) return { ok: true, data: { ...stale, stale: true } };
      }
      return { ok: false, error: "Cursor quota unavailable", sourceTried };
    }

    const token = authResult.row.accessToken;
    if (!token) {
      return { ok: false, error: "Cursor sign-in required", sourceTried };
    }

    sourceTried.push("dashboard-api");
    let usageResponse: { status: number; body?: Record<string, unknown> };
    try {
      usageResponse = await callDashboard("GetCurrentPeriodUsage", token);
    } catch {
      const stale = readLastSnapshot(context);
      if (stale) return { ok: true, data: { ...stale, stale: true } };
      return { ok: false, error: "Cursor quota unavailable", sourceTried };
    }

    if (usageResponse.status === 401 || usageResponse.status === 403) {
      return { ok: false, error: "Cursor sign-in required", sourceTried };
    }
    if (usageResponse.status !== 200 || !usageResponse.body) {
      const stale = readLastSnapshot(context);
      if (stale) return { ok: true, data: { ...stale, stale: true } };
      return { ok: false, error: "Cursor quota unavailable", sourceTried };
    }

    let planName: string | undefined;
    try {
      const planResponse = await callDashboard("GetPlanInfo", token);
      if (planResponse.status === 200 && planResponse.body) {
        const planInfo = planResponse.body.planInfo as Record<string, unknown> | undefined;
        if (typeof planInfo?.planName === "string") planName = planInfo.planName;
      }
    } catch {
      // optional call - ignore failures
    }

    const fallbackPlan = authResult.row.stripeMembershipType
      ? authResult.row.stripeMembershipType.charAt(0).toUpperCase() + authResult.row.stripeMembershipType.slice(1)
      : undefined;

    const snapshot = normalizeUsage(usageResponse.body, planName, fallbackPlan);
    snapshot.accountEmail = authResult.row.cachedEmail;
    persistSnapshot(context, snapshot);
    return { ok: true, data: snapshot };
  },
};
