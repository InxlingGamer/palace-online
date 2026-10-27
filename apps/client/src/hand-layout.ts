/** Keep a readable index strip; scroll only once that minimum no longer fits. */
export function handLayout(
  rowWidth: number,
  cardWidth: number,
  count: number,
  minimumStrip: number,
  gap = 8,
) {
  const step =
    count <= 1
      ? 0
      : Math.max(minimumStrip, Math.min(cardWidth + gap, (rowWidth - cardWidth) / (count - 1)));
  const width = count === 0 ? 0 : cardWidth + step * (count - 1);
  return { step, width, overflows: width > rowWidth + 0.5 };
}
