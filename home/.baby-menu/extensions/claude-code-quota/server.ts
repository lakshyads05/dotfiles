import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFile, spawn } from "node:child_process";
import type { BabyMenuServerContext } from "@babymenu/contracts";

type QuotaWindowId = "five_hour" | "seven_day" | "seven_day_sonnet" | "seven_day_opus" | "extra_usage";

type QuotaWindow = {
  id: QuotaWindowId;
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

type ClaudeQuotaSnapshot = {
  source: "oauth" | "cli";
  accountEmail?: string;
  plan?: string;
  windows: QuotaWindow[];
  refreshedAt: string;
  stale: boolean;
};

type QuotaResult<T> = { ok: true; data: T } | { ok: false; error: string; sourceTried: string[] };

const WINDOW_LABEL: Record<QuotaWindowId, string> = {
  five_hour: "5 hour",
  seven_day: "weekly",
  seven_day_sonnet: "weekly · sonnet",
  seven_day_opus: "weekly · opus",
  extra_usage: "extra usage",
};

function formatResetText(resetAtIso: unknown): string | undefined {
  if (typeof resetAtIso !== "string") return undefined;
  const ms = Date.parse(resetAtIso);
  if (Number.isNaN(ms)) return undefined;
  const diffMs = ms - Date.now();
  if (diffMs <= 0) return "resetting";
  const hours = diffMs / (1000 * 60 * 60);
  if (hours < 1) return `resets in ${Math.max(1, Math.round(diffMs / 60_000))}m`;
  if (hours < 48) return `resets in ${Math.round(hours)}h`;
  return `resets in ${Math.round(hours / 24)}d`;
}

type OAuthCredential = { token: string; expiresAt?: number; source: "keychain" | "file" };

type CredentialFileShape = {
  claudeAiOauth?: {
    accessToken?: string;
    expiresAt?: number;
    subscriptionType?: string;
  };
  accessToken?: string;
  access_token?: string;
};

function parseCredentialBlob(raw: string): OAuthCredential | undefined {
  let parsed: CredentialFileShape;
  try {
    parsed = JSON.parse(raw) as CredentialFileShape;
  } catch {
    return undefined;
  }
  const oauth = parsed.claudeAiOauth;
  const token = oauth?.accessToken ?? parsed.accessToken ?? parsed.access_token;
  if (!token) return undefined;
  return { token, expiresAt: oauth?.expiresAt, source: "file" };
}

function readFileCredential(): OAuthCredential | undefined {
  try {
    const raw = readFileSync(join(homedir(), ".claude", ".credentials.json"), "utf8");
    const cred = parseCredentialBlob(raw);
    return cred ? { ...cred, source: "file" } : undefined;
  } catch {
    return undefined;
  }
}

function readKeychainCredential(): Promise<OAuthCredential | undefined> {
  return new Promise((resolve) => {
    execFile(
      "security",
      ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
      { timeout: 8_000 },
      (error: Error | null, stdout: string) => {
        if (error) {
          resolve(undefined);
          return;
        }
        const cred = parseCredentialBlob(stdout.trim());
        resolve(cred ? { ...cred, source: "keychain" } : undefined);
      },
    );
  });
}

function isExpired(cred: OAuthCredential): boolean {
  return typeof cred.expiresAt === "number" && cred.expiresAt < Date.now();
}

async function resolveCredentialCandidates(): Promise<OAuthCredential[]> {
  const [keychain, file] = await Promise.all([readKeychainCredential(), Promise.resolve(readFileCredential())]);
  const usable = [keychain, file].filter((c): c is OAuthCredential => !!c && !isExpired(c));
  // macOS: Keychain is authoritative and refreshed in place - prefer it whenever present
  // and unexpired, regardless of the file credential's expiresAt. Otherwise order by
  // latest expiresAt so a fresher usable token is tried first.
  usable.sort((a, b) => {
    if (a.source === "keychain" && b.source !== "keychain") return -1;
    if (b.source === "keychain" && a.source !== "keychain") return 1;
    return (b.expiresAt ?? 0) - (a.expiresAt ?? 0);
  });
  return usable;
}

async function fetchOAuthUsage(token: string): Promise<{ status: number; body?: Record<string, unknown> }> {
  const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return { status: res.status };
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

function normalizeOAuthUsage(body: Record<string, unknown>): ClaudeQuotaSnapshot {
  const windows: QuotaWindow[] = [];
  const windowKeys: QuotaWindowId[] = ["five_hour", "seven_day", "seven_day_sonnet", "seven_day_opus"];
  for (const id of windowKeys) {
    const w = body[id] as Record<string, unknown> | null | undefined;
    if (!w) continue;
    const percentUsed = typeof w.utilization === "number" ? w.utilization : undefined;
    if (percentUsed === undefined) continue;
    windows.push({
      id,
      label: WINDOW_LABEL[id],
      percentUsed: Math.min(100, Math.max(0, percentUsed)),
      resetAt: typeof w.resets_at === "string" ? w.resets_at : undefined,
      resetText: formatResetText(w.resets_at),
    });
  }
  const extra = body.extra_usage as Record<string, unknown> | null | undefined;
  if (extra) {
    // used_credits / monthly_limit are minor units (e.g. cents), scaled by decimal_places -
    // a live account showed used_credits: 9272, monthly_limit: 10000, decimal_places: 2,
    // which is $92.72 of $100.00, not $9272 of $10000.
    const decimalPlaces = typeof extra.decimal_places === "number" ? extra.decimal_places : 2;
    const divisor = 10 ** decimalPlaces;
    const utilization = typeof extra.utilization === "number" ? extra.utilization : undefined;
    const usedCredits = typeof extra.used_credits === "number" ? extra.used_credits : undefined;
    const monthlyLimit = typeof extra.monthly_limit === "number" ? extra.monthly_limit : undefined;
    // is_enabled reflects whether extra usage can still be spent right now, not whether there is
    // data to show - a live account reported is_enabled: false with disabled_reason:
    // "out_of_credits" while still holding a real 92.72% utilization. Render whenever there is
    // usable data and surface the disabled state separately instead of hiding the window.
    if (utilization !== undefined || usedCredits !== undefined || monthlyLimit !== undefined) {
      windows.push({
        id: "extra_usage",
        label: WINDOW_LABEL.extra_usage,
        percentUsed: utilization !== undefined ? Math.min(100, Math.max(0, utilization)) : undefined,
        spentUsd: usedCredits !== undefined ? usedCredits / divisor : undefined,
        limitUsd: monthlyLimit !== undefined ? monthlyLimit / divisor : undefined,
        currency: typeof extra.currency === "string" ? extra.currency : undefined,
        enabled: typeof extra.is_enabled === "boolean" ? extra.is_enabled : undefined,
        disabledReason: typeof extra.disabled_reason === "string" ? extra.disabled_reason : undefined,
      });
    }
  }
  return {
    source: "oauth",
    windows,
    refreshedAt: new Date().toISOString(),
    stale: false,
  };
}

type CliProbeResult = { text: string } | { authRequired: true } | { launchFailed: true } | undefined;

const ANSI_PATTERN = /\x1b\[[0-9;]*[a-zA-Z]/g;

function stripAnsi(input: string): string {
  return input.replace(ANSI_PATTERN, "");
}

function runClaudeCliProbe(): Promise<CliProbeResult> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn("claude", ["--allowed-tools", ""], { stdio: ["pipe", "pipe", "pipe"] });
    } catch {
      resolve({ launchFailed: true });
      return;
    }

    let settled = false;
    let output = "";
    let sentUsageCommand = false;

    const finish = (result: CliProbeResult) => {
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

    const hardTimeout = setTimeout(() => finish({ text: stripAnsi(output) }), 15_000);

    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
      const clean = stripAnsi(output);
      if (!sentUsageCommand && />\s*$/.test(clean.trimEnd())) {
        sentUsageCommand = true;
        setTimeout(() => child.stdin?.write("/usage\n"), 300);
      }
      if (sentUsageCommand && /current session/i.test(clean) && /current week/i.test(clean)) {
        setTimeout(() => finish({ text: clean }), 300);
      }
      if (/invalid api key|please run.*login|not authenticated|token.*expired/i.test(clean)) {
        finish({ authRequired: true });
      }
    });

    child.on("error", () => finish({ launchFailed: true }));
    child.on("exit", () => {
      if (!settled) finish(output ? { text: stripAnsi(output) } : undefined);
    });
  });
}

function parsePercent(text: string, label: string): number | undefined {
  const regex = new RegExp(`${label}[\\s\\S]{0,120}?(\\d{1,3})%\\s*(used|left)`, "i");
  const match = text.match(regex);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (Number.isNaN(value)) return undefined;
  return match[2].toLowerCase() === "left" ? 100 - value : value;
}

function parseResetText(text: string, label: string): string | undefined {
  const regex = new RegExp(`${label}[\\s\\S]{0,160}?(resets? (?:in|at) [^\\n]+)`, "i");
  const match = text.match(regex);
  return match?.[1]?.trim();
}

function normalizeCliProbe(text: string): ClaudeQuotaSnapshot {
  const windows: QuotaWindow[] = [];
  const fiveHour = parsePercent(text, "Current session");
  if (fiveHour !== undefined) {
    windows.push({
      id: "five_hour",
      label: WINDOW_LABEL.five_hour,
      percentUsed: fiveHour,
      resetText: parseResetText(text, "Current session"),
    });
  }
  const weekly = parsePercent(text, "Current week");
  if (weekly !== undefined) {
    windows.push({
      id: "seven_day",
      label: WINDOW_LABEL.seven_day,
      percentUsed: weekly,
      resetText: parseResetText(text, "Current week"),
    });
  }
  return {
    source: "cli",
    windows,
    refreshedAt: new Date().toISOString(),
    stale: false,
  };
}

function ensureSnapshotTable(context: BabyMenuServerContext) {
  context.db.exec(
    "CREATE TABLE IF NOT EXISTS claude_code_quota_snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), snapshot_json TEXT NOT NULL, updated_at INTEGER NOT NULL)",
  );
}

function persistSnapshot(context: BabyMenuServerContext, snapshot: ClaudeQuotaSnapshot) {
  ensureSnapshotTable(context);
  context.db.run(
    "INSERT INTO claude_code_quota_snapshot (id, snapshot_json, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET snapshot_json = excluded.snapshot_json, updated_at = excluded.updated_at",
    [JSON.stringify(snapshot), Date.now()],
  );
}

function readLastSnapshot(context: BabyMenuServerContext): ClaudeQuotaSnapshot | undefined {
  ensureSnapshotTable(context);
  const row = context.db.get<{ snapshot_json: string }>(
    "SELECT snapshot_json FROM claude_code_quota_snapshot WHERE id = 1",
  );
  if (!row) return undefined;
  try {
    return JSON.parse(row.snapshot_json) as ClaudeQuotaSnapshot;
  } catch {
    return undefined;
  }
}

export const actions = {
  getQuota: async (
    _input: unknown,
    context: BabyMenuServerContext,
  ): Promise<QuotaResult<ClaudeQuotaSnapshot>> => {
    const sourceTried: string[] = [];
    const candidates = await resolveCredentialCandidates();

    for (const candidate of candidates) {
      sourceTried.push(`oauth:${candidate.source}`);
      try {
        const { status, body } = await fetchOAuthUsage(candidate.token);
        if (status === 200 && body) {
          const snapshot = normalizeOAuthUsage(body);
          if (snapshot.windows.length > 0) {
            persistSnapshot(context, snapshot);
            return { ok: true, data: snapshot };
          }
        }
        // 401/403 or an empty body: try the next credential candidate before the CLI
      } catch {
        // network error - try the next candidate
      }
    }

    sourceTried.push("cli");
    const probe = await runClaudeCliProbe();
    if (probe && "launchFailed" in probe) {
      const stale = readLastSnapshot(context);
      if (stale) return { ok: true, data: { ...stale, stale: true } };
      return { ok: false, error: "Claude CLI could not be launched", sourceTried };
    }
    if (probe && "authRequired" in probe) {
      return { ok: false, error: "Claude sign-in required", sourceTried };
    }
    if (probe && "text" in probe) {
      const snapshot = normalizeCliProbe(probe.text);
      if (snapshot.windows.length > 0) {
        persistSnapshot(context, snapshot);
        return { ok: true, data: snapshot };
      }
    }

    const stale = readLastSnapshot(context);
    if (stale) return { ok: true, data: { ...stale, stale: true } };

    if (candidates.length === 0) {
      return { ok: false, error: "Claude sign-in required", sourceTried };
    }
    return { ok: false, error: "Claude quota unavailable", sourceTried };
  },
};
