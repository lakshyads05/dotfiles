import type { BabyMenuLayoutProps } from "@babymenu/contracts";

const TOP_ROW = ["codex-quota", "claude-code-quota"];
const FULL_WIDTH = ["cursor-quota"];

export default function Layout({ widgets, renderWidget }: BabyMenuLayoutProps) {
  const known = new Set([...TOP_ROW, ...FULL_WIDTH]);
  const rest = widgets.filter((widget) => !known.has(widget.id));

  return (
    <div className="flex w-[840px] flex-col gap-6 p-3">
      <div className="grid grid-cols-2 gap-6">
        {TOP_ROW.filter((id) => widgets.some((w) => w.id === id)).map((id) => (
          <div key={id}>{renderWidget(id)}</div>
        ))}
      </div>
      {FULL_WIDTH.filter((id) => widgets.some((w) => w.id === id)).map((id) => (
        <div key={id}>{renderWidget(id)}</div>
      ))}
      {rest.map((widget) => (
        <div key={widget.id}>{renderWidget(widget.id)}</div>
      ))}
    </div>
  );
}
