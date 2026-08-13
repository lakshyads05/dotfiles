import type { RefreshableBabyMenuWidget } from "@babymenu/contracts";
import { ClaudeCodeQuotaView } from "./components";
import { fetchQuota } from "./store";

export const claudeCodeQuotaWidget: RefreshableBabyMenuWidget = {
  id: "claude-code-quota",
  title: "claude code quota",
  viewRefreshIntervalMs: 5 * 60 * 1000,
  refreshView: () => fetchQuota(),
  render: () => <ClaudeCodeQuotaView />,
};
