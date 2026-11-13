import { useEffect, useRef } from "react";

/** Keep the existing dialog markup while isolating its sibling table controls. */
/** `opener` finds the control that opened the dialog: Safari does not focus buttons on click,
 * so the element focused before opening can be <body>. */
export function useDialogFocus(opener?: string) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    const shell = dialog.closest(".game-shell");
    const inertBefore = new Map<HTMLElement, boolean>();
    const isolate = () => {
      for (const child of shell?.children ?? []) {
        if (!(child instanceof HTMLElement) || child.contains(dialog) || inertBefore.has(child))
          continue;
        inertBefore.set(child, child.inert);
        child.inert = true;
      }
    };
    isolate();
    // Notices can appear while a rematch request is pending.
    const observer = new MutationObserver(isolate);
    if (shell) observer.observe(shell, { childList: true });

    const controls = () =>
      [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
    const focusFirst = () => (controls()[0] ?? dialog).focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      event.preventDefault();
      const available = controls();
      const current = available.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey
        ? (current <= 0 ? available.length : current) - 1
        : (current + 1) % available.length;
      (available[next] ?? dialog).focus();
    };
    const containFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) focusFirst();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", containFocus);
    focusFirst();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", containFocus);
      observer.disconnect();
      for (const [child, inert] of inertBefore) child.inert = inert;
      const back =
        previousFocus instanceof HTMLElement &&
        previousFocus.isConnected &&
        previousFocus !== document.body
          ? previousFocus
          : opener
            ? document.querySelector<HTMLElement>(opener)
            : null;
      back?.focus();
    };
  }, [opener]);
  return ref;
}
