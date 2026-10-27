import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { handLayout } from "./hand-layout";
import { HAND_FADE_COVER, HAND_FADE_WIDTH, isTap, selectedVisibility } from "./hand-gesture";
export function Hand({
  count,
  setup,
  selectedIds,
  children,
}: {
  count: number;
  setup: boolean;
  selectedIds: string[];
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ step: 24, width: 0, overflows: false });
  const [edges, setEdges] = useState({ left: false, right: false, hiddenLeft: 0, hiddenRight: 0 });
  const edgeValues = useRef(edges);
  const nearest = useRef<{ left?: HTMLElement | undefined; right?: HTMLElement | undefined }>({});
  const tapped = useRef<string | null>(null);
  const scrollTo = useCallback(
    (card: HTMLElement, fullCard: boolean) => {
      const el = ref.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      const rect = card.getBoundingClientRect();
      const left = box.left + el.clientLeft + (el.scrollLeft > 1 ? HAND_FADE_WIDTH : 0);
      const right =
        box.left +
        el.clientLeft +
        el.clientWidth -
        (el.scrollWidth - el.clientWidth - el.scrollLeft > 1 ? HAND_FADE_WIDTH : 0);
      const width =
        fullCard || card === card.parentElement?.lastElementChild ? rect.width : layout.step;
      const delta = rect.left < left ? rect.left - left : Math.max(0, rect.left + width - right);
      if (delta)
        el.scrollBy({
          left: delta,
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        });
    },
    [layout.step],
  );
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let lastScroll = -Infinity;
    let gesture: { id: number; x: number; y: number; scroll: number; idle: number } | undefined;
    let suppress = false;
    const down = (event: PointerEvent) => {
      if (event.pointerType === "mouse") {
        suppress = false;
        return;
      }
      if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
      suppress = true;
      gesture = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        scroll: el.scrollLeft,
        idle: performance.now() - lastScroll,
      };
    };
    const up = (event: PointerEvent) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      suppress = !isTap({
        dx: event.clientX - gesture.x,
        dy: event.clientY - gesture.y,
        scrollDelta: el.scrollLeft - gesture.scroll,
        msSinceLastScroll: gesture.idle,
      });
      gesture = undefined;
    };
    const cancel = (event: PointerEvent) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      gesture = undefined;
      suppress = true;
    };
    const scroll = () => {
      lastScroll = performance.now();
    };
    const click = (event: MouseEvent) => {
      if (event.detail === 0) return;
      if (suppress) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      tapped.current =
        (event.target as Element).closest<HTMLElement>("[data-card-id]")?.dataset.cardId ?? null;
    };
    const contextmenu = (event: Event) => event.preventDefault();
    el.addEventListener("pointerdown", down, { passive: true });
    el.addEventListener("pointerup", up, { passive: true });
    el.addEventListener("pointercancel", cancel, { passive: true });
    el.addEventListener("scroll", scroll, { passive: true });
    el.addEventListener("click", click, true);
    el.addEventListener("contextmenu", contextmenu);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("scroll", scroll);
      el.removeEventListener("click", click, true);
      el.removeEventListener("contextmenu", contextmenu);
    };
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const style = getComputedStyle(el);
      const next = handLayout(
        el.clientWidth - 8,
        parseFloat(style.getPropertyValue("--card-w")),
        count,
        parseFloat(style.getPropertyValue("--minimum-strip")),
      );
      setLayout((old) =>
        old.step === next.step && old.width === next.width && old.overflows === next.overflows
          ? old
          : next,
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
    let frame = 0;
    const update = () => {
      frame = 0;
      const left = el.scrollLeft > 1;
      const right = el.scrollWidth - el.clientWidth - el.scrollLeft > 1;
      const box = el.getBoundingClientRect();
      const cards = [...el.querySelectorAll<HTMLElement>("[data-card-id]")];
      const selected = new Set(selectedIds);
      const strips = cards.flatMap((card, index) => {
        if (!selected.has(card.dataset.cardId!)) return [];
        const rect = card.getBoundingClientRect();
        return [
          {
            index,
            left: rect.left,
            right: rect.left + (index === cards.length - 1 ? rect.width : layout.step),
          },
        ];
      });
      const visibility = selectedVisibility(
        box.left + el.clientLeft + (left ? HAND_FADE_COVER : 0),
        box.left + el.clientLeft + el.clientWidth - (right ? HAND_FADE_COVER : 0),
        strips,
      );
      nearest.current = {
        left: cards[visibility.nearestLeft ?? -1],
        right: cards[visibility.nearestRight ?? -1],
      };
      const next = {
        left,
        right,
        hiddenLeft: visibility.hiddenLeft,
        hiddenRight: visibility.hiddenRight,
      };
      const old = edgeValues.current;
      if (
        old.left !== left ||
        old.right !== right ||
        old.hiddenLeft !== next.hiddenLeft ||
        old.hiddenRight !== next.hiddenRight
      ) {
        edgeValues.current = next;
        setEdges(next);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    el.addEventListener("scroll", schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    update();
    const card = [...el.querySelectorAll<HTMLElement>("[data-card-id]")].find(
      (card) => card.dataset.cardId === tapped.current && selectedIds.includes(tapped.current),
    );
    tapped.current = null;
    if (card) scrollTo(card, false);
    return () => {
      el.removeEventListener("scroll", schedule);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [layout, selectedIds, scrollTo]);
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
      {(["left", "right"] as const).map((side) => {
        const count = side === "left" ? edges.hiddenLeft : edges.hiddenRight;
        return (
          count > 0 && (
            <button
              key={side}
              type="button"
              className={`hand-selected hand-selected--${side}`}
              aria-label={`Scroll to ${count} selected ${count === 1 ? "card" : "cards"}`}
              onClick={() => {
                const card = nearest.current[side];
                if (card) scrollTo(card, true);
              }}
            >
              <span>
                {side === "left" && (
                  <svg viewBox="0 0 24 24">
                    <path d="m15 5-7 7 7 7" />
                  </svg>
                )}
                {count} selected
                {side === "right" && (
                  <svg viewBox="0 0 24 24">
                    <path d="m9 5 7 7-7 7" />
                  </svg>
                )}
              </span>
            </button>
          )
        );
      })}
      {edges.right && !edges.hiddenRight && (
        <span className="hand-chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="m9 5 7 7-7 7" />
          </svg>
        </span>
      )}
    </div>
  );
}
