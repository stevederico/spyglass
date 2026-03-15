import { useState, useCallback, useRef } from 'react';

const MAX_DEPTH = 50;

/** Fields tracked in per-slot history (excludes images). */
const HISTORY_FIELDS = [
  'bgColor', 'isGradient', 'gradientStart', 'gradientEnd', 'gradientDirection',
  'textLine1', 'textLine2', 'textPosition', 'fontSize', 'textColor', 'textShadow',
  'fontWeight', 'autoFitText', 'device', 'showBezel', 'selectedFont',
  'frameModel', 'frameColor', 'frameLayout', 'orientation'
];

/**
 * Extracts the subset of slot properties that are tracked in history.
 *
 * @param {Object} slot - A slot object containing design properties
 * @returns {Object} Snapshot of history-relevant fields
 */
function extractHistoryState(slot) {
  const state = {};
  for (const key of HISTORY_FIELDS) {
    state[key] = slot[key];
  }
  return state;
}

/**
 * Manages independent undo/redo history stacks for each slot.
 *
 * Each slot (identified by its `id`) gets its own history stack so that
 * switching between slots preserves per-slot undo/redo state. Histories
 * for removed slots are cleaned up automatically.
 *
 * @param {Object[]} slots - Array of slot objects, each must have an `id` property
 * @param {number} activeSlotIndex - Index of the currently active slot in the array
 * @returns {{
 *   currentState: Object|null,
 *   pushState: (state: Object) => void,
 *   undo: () => void,
 *   redo: () => void,
 *   canUndo: boolean,
 *   canRedo: boolean
 * }}
 */
export function useSlotHistory(slots, activeSlotIndex) {
  // Map<slotId, { stack: Object[], index: number }>
  const historiesRef = useRef(new Map());
  const [revision, setRevision] = useState(0); // force re-renders

  const activeSlot = slots[activeSlotIndex];
  const slotId = activeSlot?.id;

  // Ensure current slot has a history entry
  if (slotId && !historiesRef.current.has(slotId)) {
    historiesRef.current.set(slotId, {
      stack: [extractHistoryState(activeSlot)],
      index: 0
    });
  }

  const history = slotId ? historiesRef.current.get(slotId) : null;

  /** Push a new state snapshot onto the active slot's history stack. */
  const pushState = useCallback((state) => {
    if (!slotId) return;
    const h = historiesRef.current.get(slotId);
    if (!h) return;
    // Truncate any redo states
    h.stack = h.stack.slice(0, h.index + 1);
    h.stack.push(state);
    if (h.stack.length > MAX_DEPTH) h.stack.shift();
    h.index = h.stack.length - 1;
    setRevision(r => r + 1);
  }, [slotId]);

  /** Move backward one step in the active slot's history. */
  const undo = useCallback(() => {
    if (!slotId) return;
    const h = historiesRef.current.get(slotId);
    if (!h || h.index <= 0) return;
    h.index--;
    setRevision(r => r + 1);
  }, [slotId]);

  /** Move forward one step in the active slot's history. */
  const redo = useCallback(() => {
    if (!slotId) return;
    const h = historiesRef.current.get(slotId);
    if (!h || h.index >= h.stack.length - 1) return;
    h.index++;
    setRevision(r => r + 1);
  }, [slotId]);

  const canUndo = history ? history.index > 0 : false;
  const canRedo = history ? history.index < history.stack.length - 1 : false;
  const currentState = history ? history.stack[history.index] : null;

  // Clean up histories for removed slots to prevent memory leaks
  const slotIds = new Set(slots.map(s => s.id));
  for (const [id] of historiesRef.current) {
    if (!slotIds.has(id)) historiesRef.current.delete(id);
  }

  return { currentState, pushState, undo, redo, canUndo, canRedo };
}
