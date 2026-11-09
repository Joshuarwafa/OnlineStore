import { useRef, useState, type MouseEvent, type ReactNode } from "react";

interface Tip {
  x: number;
  y: number;
  content: ReactNode;
}

// Hover tooltip for HTML charts. Put `ref` on a position:relative container, call show/hide from
// each mark's mouse handlers, and render `tooltip` inside the container.
export function useChartTooltip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  const show = (e: MouseEvent, content: ReactNode) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    // Keep the tooltip inside the chart horizontally.
    const x = Math.min(Math.max(e.clientX - box.left, 90), box.width - 90);
    setTip({ x, y: e.clientY - box.top, content });
  };

  const hide = () => setTip(null);

  const tooltip = tip && (
    <div className="chart-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>
      {tip.content}
    </div>
  );

  return { ref, show, hide, tooltip };
}
