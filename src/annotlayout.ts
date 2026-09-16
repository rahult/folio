/**
 * Where each annotation card sits in the sidebar: level with the passage it
 * refers to, pushed down only when the card above needs the room. The
 * anchors come from the document (view coordinates); the heights from the
 * cards once they are in the DOM. Pure, so the stacking rule is
 * unit-testable.
 */

export interface AnchorSlot {
  id: string;
  /** The passage's top in document-content space; null when the quote can
   *  no longer be found in the document (a rewrite removed it). */
  anchorTop: number | null;
}

export interface PlacedSlot {
  id: string;
  top: number;
}

/** Slot order: by passage, unresolved ones last in their given order. */
export function orderSlots(slots: AnchorSlot[]): AnchorSlot[] {
  return [...slots].sort((a, b) => {
    if (a.anchorTop === null && b.anchorTop === null) return 0;
    if (a.anchorTop === null) return 1;
    if (b.anchorTop === null) return -1;
    return a.anchorTop - b.anchorTop;
  });
}

/** Stack the cards: each starts at its anchor and never overlaps the one
 *  above. `heights` is measured per id; a missing height counts as one
 *  line's worth rather than zero, so cards without one cannot pile up on
 *  the same row. Returns the tops and the height the list needs. */
export function stackSlots(
  slots: AnchorSlot[],
  heights: Readonly<Record<string, number>>,
  gap = 8,
  minHeight = 24,
): { placed: PlacedSlot[]; listHeight: number } {
  let lastBottom = 0;
  const placed: PlacedSlot[] = [];
  for (const slot of orderSlots(slots)) {
    const height = Math.max(minHeight, heights[slot.id] ?? minHeight);
    const top = Math.max(slot.anchorTop ?? lastBottom + gap, lastBottom + gap);
    placed.push({ id: slot.id, top });
    lastBottom = top + height;
  }
  return { placed, listHeight: lastBottom + gap };
}
