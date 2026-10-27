import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { handLayout } from "./hand-layout";
export function Hand({
  count,
  setup,
  children,
}: {
  count: number;
  setup: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ step: 24, width: 0, overflows: false });
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const style = getComputedStyle(el);
      setLayout(
        handLayout(
          el.clientWidth - 8,
          parseFloat(style.getPropertyValue("--card-w")),
          count,
          parseFloat(style.getPropertyValue("--minimum-strip")),
        ),
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, [count]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setEdges({
        left: el.scrollLeft > 1,
        right: el.scrollWidth - el.clientWidth - el.scrollLeft > 1,
      });
    el.addEventListener("scroll", update, { passive: true });
    update();
    return () => el.removeEventListener("scroll", update);
  }, [layout]);
  return (
    <div
      className={`hand-wrap ${edges.left ? "hand-wrap--left" : ""} ${edges.right ? "hand-wrap--right" : ""}`}
    >
      <div
        ref={ref}
        className={`hand ${setup ? "hand--setup" : ""}`}
        aria-label={layout.overflows ? "Your hand, swipe sideways for more" : "Your hand"}
        style={{ "--hand-step": `${layout.step}px` } as CSSProperties}
      >
        <div className="hand-row" style={{ width: layout.width }}>
          {children}
        </div>
      </div>
      {edges.right && (
        <span className="hand-chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="m9 5 7 7-7 7" />
          </svg>
        </span>
      )}
    </div>
  );
}
