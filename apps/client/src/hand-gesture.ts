export const TAP_DISTANCE = 10;
export const TAP_SCROLL_DELTA = 2;
export const GLIDE_IDLE_MS = 80;
export const HAND_FADE_WIDTH = 32;
/** Only the outer half of the fade hides an index; the inner half stays readable. */
export const HAND_FADE_COVER = HAND_FADE_WIDTH / 2;
export const MIN_VISIBLE_STRIP = 12;

export function isTap({
  dx,
  dy,
  scrollDelta,
  msSinceLastScroll,
}: {
  dx: number;
  dy: number;
  scrollDelta: number;
  msSinceLastScroll: number;
}) {
  return (
    Math.hypot(dx, dy) <= TAP_DISTANCE &&
    Math.abs(scrollDelta) <= TAP_SCROLL_DELTA &&
    msSinceLastScroll > GLIDE_IDLE_MS
  );
}

export interface SelectedStrip {
  index: number;
  left: number;
  right: number;
}

/** Coordinates share a scroll-box origin; callers inset only edges with a fade. */
export function selectedVisibility(left: number, right: number, strips: SelectedStrip[]) {
  let hiddenLeft = 0;
  let hiddenRight = 0;
  let nearestLeft: number | undefined;
  let nearestRight: number | undefined;
  let leftDistance = Infinity;
  let rightDistance = Infinity;
  for (const strip of strips) {
    const visible = Math.max(0, Math.min(right, strip.right) - Math.max(left, strip.left));
    if (visible >= MIN_VISIBLE_STRIP) continue;
    if (strip.left < left) {
      hiddenLeft++;
      const distance = left - strip.right;
      if (distance < leftDistance) {
        leftDistance = distance;
        nearestLeft = strip.index;
      }
    } else {
      hiddenRight++;
      const distance = strip.left - right;
      if (distance < rightDistance) {
        rightDistance = distance;
        nearestRight = strip.index;
      }
    }
  }
  return { hiddenLeft, hiddenRight, nearestLeft, nearestRight };
}
