import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { BabyMenuServerContext } from "@babymenu/contracts";

type QuotaWindowId = "five_hour" | "weekly";

type QuotaWindow = {
  id: QuotaWindowId;
  label: string;
  percentUsed?: number;
  resetText?: string;
  resetAt?: string;
};

type CodexQuotaSnapshot = {
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

type QuotaResult<T> = { ok: true; data: T } | { ok: false; error: string; sourceTried: string[] };

// 5-hour windows report ~18000s / ~300min; weekly windows report ~604800s / ~10080min.
// Classify by proximity instead of trusting a fixed primary/secondary mapping - a live
// probe on this account showed the weekly window arriving as `primary_window` (OAuth)
// and `primary` (CLI) with `secondary` null, so the label alone isn't reliable.
const FIVE_HOUR_MAX_SECONDS = 21_600;
const WEEKLY_MIN_SECONDS = 259_200;

function classifyWindowSeconds(seconds: unknown): QuotaWindowId | undefined {
  if (typeof seconds !== "number") return undefined;
  if (seconds <= FIVE_HOUR_MAX_SECONDS) return "five_hour";
  if (seconds >= WEEKLY_MIN_SECONDS) return "weekly";
  return undefined;
}

function windowLabel(id: QuotaWindowId): string {
  return id === "five_hour" ? "5 hour" : "weekly";
}

function formatResetText(resetAtSeconds: unknown): string | undefined {
  if (typeof resetAtSeconds !== "number") return undefined;
  const diffMs = resetAtSeconds * 1000 - Date.now();
  if (diffMs <= 0) return "resetting";
  const hours = diffMs / (1000 * 60 * 60);
  if (hours < 1) return `resets in ${Math.max(1, Math.round(diffMs / 60_000))}m`;
  if (hours < 48) return `resets in ${Math.round(hours)}h`;
  return `resets in ${Math.round(hours / 24)}d`;
}

function authPath(): string {
  const home = process.env.CODEX_HOME;
  return home ? join(home, "auth.json") : join(homedir(), ".codex", "auth.json");
}

type AuthFile = {
  OPENAI_API_KEY?: string | null;
  tokens?: {
    access_token?: string;
    accessToken?: string;
    account_id?: string;
    accountId?: string;
  };
};

function readAuthFile(): AuthFile | undefined {
  try {
    const raw = readFileSync(authPath(), "utf8");
    return JSON.parse(raw) as AuthFile;
  } catch {
    return undefined;
  }
}

function resolveCredential(auth: AuthFile): { token: string; accountId?: string } | undefined {
  if (typeof auth.OPENAI_API_KEY === "string" && auth.OPENAI_API_KEY.length > 0) {
    return { token: auth.OPENAI_API_KEY };
  }
  const token = auth.tokens?.access_token ?? auth.tokens?.accessToken;
  if (!token) return undefined;
  return { token, accountId: auth.tokens?.account_id ?? auth.tokens?.accountId };
}

async function fetchOAuthUsage(
  token: string,
  accountId?: string,
): Promise<{ status: number; body?: Record<string, unknown> }> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (accountId) headers["ChatGPT-Account-Id"] = accountId;
  const res = await fetch("https://chatgpt.com/backend-api/wham/usage", {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return { status: res.status };
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

function buildWindowsFromSeconds(rateLimit: Record<string, unknown> | undefined): QuotaWindow[] {
  if (!rateLimit) return [];
  const windows: QuotaWindow[] = [];
  for (const key of ["primary_window", "secondary_window"]) {
    const w = rateLimit[key] as Record<string, unknown> | null | undefined;
    if (!w) continue;
    const id = classifyWindowSeconds(w.limit_window_seconds);
    if (!id) continue;
    const percentUsed = typeof w.used_percent === "number" ? w.used_percent : undefined;
    if (percentUsed === undefined) continue;
    windows.push({
      id,
      label: windowLabel(id),
      percentUsed: Math.min(100, Math.max(0, percentUsed)),
      resetAt: typeof w.reset_at === "number" ? new Date(w.reset_at * 1000).toISOString() : undefined,
      resetText: formatResetText(w.reset_at),
    });
  }
  return windows;
}

function normalizeOAuthUsage(body: Record<string, unknown>): CodexQuotaSnapshot {
  const rateLimit = body.rate_limit as Record<string, unknown> | undefined;
  const credits = body.credits as Record<string, unknown> | undefined;
  return {
    source: "oauth",
    accountEmail: typeof body.email === "string" ? body.email : undefined,
    plan: typeof body.plan_type === "string" ? body.plan_type : undefined,
    windows: buildWindowsFromSeconds(rateLimit),
    credits: credits
      ? {
          balance:
            typeof credits.balance === "string"
              ? Number(credits.balance)
              : typeof credits.balance === "number"
                ? credits.balance
                : undefined,
          hasCredits: typeof credits.has_credits === "boolean" ? credits.has_credits : undefined,
          unlimited: typeof credits.unlimited === "boolean" ? credits.unlimited : undefined,
        }
      : undefined,
    refreshedAt: new Date().toISOString(),
    stale: false,
  };
}

type CliRpcResult = {
  accountEmail?: string;
  plan?: string;
  rateLimits?: Record<string, unknown>;
  launchFailed?: boolean;
};

function runCodexAppServer(): Promise<CliRpcResult | undefined> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn("codex", ["-s", "read-only", "-a", "untrusted", "app-server"], {
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      resolve({ launchFailed: true });
      return;
    }

    let settled = false;
    let buffer = "";
    let nextId = 1;
    const pending = new Map<number, (result: unknown) => void>();

    const finish = (result: CliRpcResult | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimeout);
      try {
        child.kill();
      } catch {
        // already exited
      }
      resolve(result);
    };

    const hardTimeout = setTimeout(() => finish(undefined), 15_000);

    function send(method: string, params: Record<string, unknown> = {}): Promise<any> {
      return new Promise((res) => {
        const id = nextId++;
        pending.set(id, res);
        child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
        setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            res(undefined);
          }
        }, 8_000);
      });
    }

    child.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (typeof msg.id === "number" && pending.has(msg.id)) {
            const resolver = pending.get(msg.id)!;
            pending.delete(msg.id);
            resolver(msg.result);
          }
        } catch {
          // ignore non-JSON / notification lines
        }
      }
    });

    child.on("error", () => finish({ launchFailed: true }));
    child.on("exit", () => finish(undefined));

    (async () => {
      const init = await send("initialize", { clientInfo: { name: "baby-menu", version: "1.0.0" } });
      if (init === undefined) {
        finish(undefined);
        return;
      }
      const account = await send("account/read");
      const rateLimitsResp = await send("account/rateLimits/read");
      finish({
        accountEmail: account?.account?.email,
        plan: account?.account?.planType,
        rateLimits: rateLimitsResp?.rateLimits,
      });
    })();
  });
}

function buildWindowsFromMinutes(rateLimits: Record<string, unknown> | undefined): QuotaWindow[] {
  if (!rateLimits) return [];
  const windows: QuotaWindow[] = [];
  for (const key of ["primary", "secondary"]) {
    const w = rateLimits[key] as Record<string, unknown> | null | undefined;
    if (!w) continue;
    const mins = typeof w.windowDurationMins === "number" ? w.windowDurationMins : undefined;
    const id = classifyWindowSeconds(mins !== undefined ? mins * 60 : undefined);
    if (!id) continue;
    const percentUsed = typeof w.usedPercent === "number" ? w.usedPercent : undefined;
    if (percentUsed === undefined) continue;
    windows.push({
      id,
      label: windowLabel(id),
      percentUsed: Math.min(100, Math.max(0, percentUsed)),
      resetAt: typeof w.resetsAt === "number" ? new Date(w.resetsAt * 1000).toISOString() : undefined,
      resetText: formatResetText(w.resetsAt),
    });
  }
  return windows;
}

function normalizeCliResult(result: CliRpcResult): CodexQuotaSnapshot {
  const credits = result.rateLimits?.credits as Record<string, unknown> | undefined;
  return {
    source: "cli-rpc",
    accountEmail: result.accountEmail,
    plan: result.plan,
    windows: buildWindowsFromMinutes(result.rateLimits),
    credits: credits
      ? {
          balance:
            typeof credits.balance === "string"
              ? Number(credits.balance)
              : typeof credits.balance === "number"
                ? credits.balance
                : undefined,
          hasCredits: typeof credits.hasCredits === "boolean" ? credits.hasCredits : undefined,
          unlimited: typeof credits.unlimited === "boolean" ? credits.unlimited : undefined,
        }
      : undefined,
    refreshedAt: new Date().toISOString(),
    stale: false,
  };
}

function ensureSnapshotTable(context: BabyMenuServerContext) {
  context.db.exec(
    "CREATE TABLE IF NOT EXISTS codex_quota_snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), snapshot_json TEXT NOT NULL, updated_at INTEGER NOT NULL)",
  );
}

function persistSnapshot(context: BabyMenuServerContext, snapshot: CodexQuotaSnapshot) {
  ensureSnapshotTable(context);
  context.db.run(
    "INSERT INTO codex_quota_snapshot (id, snapshot_json, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET snapshot_json = excluded.snapshot_json, updated_at = excluded.updated_at",
    [JSON.stringify(snapshot), Date.now()],
  );
}

function readLastSnapshot(context: BabyMenuServerContext): CodexQuotaSnapshot | undefined {
  ensureSnapshotTable(context);
  const row = context.db.get<{ snapshot_json: string }>(
    "SELECT snapshot_json FROM codex_quota_snapshot WHERE id = 1",
  );
  if (!row) return undefined;
  try {
    return JSON.parse(row.snapshot_json) as CodexQuotaSnapshot;
  } catch {
    return undefined;
  }
}

export const actions = {
  getQuota: async (
    _input: unknown,
    context: BabyMenuServerContext,
  ): Promise<QuotaResult<CodexQuotaSnapshot>> => {
    const sourceTried: string[] = [];
    const auth = readAuthFile();
    const credential = auth ? resolveCredential(auth) : undefined;

    if (credential) {
      sourceTried.push("oauth");
      try {
        const { status, body } = await fetchOAuthUsage(credential.token, credential.accountId);
        if (status === 200 && body) {
          const snapshot = normalizeOAuthUsage(body);
          if (snapshot.windows.length > 0) {
            persistSnapshot(context, snapshot);
            return { ok: true, data: snapshot };
          }
        }
        // non-200 (401/403/etc.) or an unparsable body falls through to the CLI below
      } catch {
        // network error - fall through to the CLI
      }
    }

    sourceTried.push("cli-rpc");
    const cliResult = await runCodexAppServer();
    if (cliResult?.launchFailed) {
      const stale = readLastSnapshot(context);
      if (stale) return { ok: true, data: { ...stale, stale: true } };
      return { ok: false, error: "Codex CLI could not be launched", sourceTried };
    }
    if (cliResult) {
      const snapshot = normalizeCliResult(cliResult);
      if (snapshot.windows.length > 0) {
        persistSnapshot(context, snapshot);
        return { ok: true, data: snapshot };
      }
    }

    const stale = readLastSnapshot(context);
    if (stale) return { ok: true, data: { ...stale, stale: true } };

    if (!credential) {
      return { ok: false, error: "Run `codex` to log in.", sourceTried };
    }
    return { ok: false, error: "Codex quota unavailable", sourceTried };
  },
};
