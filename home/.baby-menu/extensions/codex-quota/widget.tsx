import type { RefreshableBabyMenuWidget } from "@babymenu/contracts";
import { CodexQuotaView } from "./components";
import { fetchQuota } from "./store";

export const codexQuotaWidget: RefreshableBabyMenuWidget = {
  id: "codex-quota",
  title: "codex quota",
  viewRefreshIntervalMs: 5 * 60 * 1000,
  refreshView: () => fetchQuota(),
  render: () => <CodexQuotaView />,
};
