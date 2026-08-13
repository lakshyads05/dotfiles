import type { RefreshableBabyMenuWidget } from "@babymenu/contracts";
import { CursorQuotaView } from "./components";
import { fetchQuota } from "./store";

export const cursorQuotaWidget: RefreshableBabyMenuWidget = {
  id: "cursor-quota",
  title: "cursor quota",
  viewRefreshIntervalMs: 5 * 60 * 1000,
  refreshView: () => fetchQuota(),
  render: () => <CursorQuotaView />,
};
