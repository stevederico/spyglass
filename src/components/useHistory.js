/**
 * Custom hook for undo/redo state management
 *
 * Maintains a history stack of state snapshots with a pointer for
 * navigating backward and forward through changes.
 *
 * @param {Object} initialState - Initial state snapshot
 * @param {number} [maxDepth=50] - Maximum history entries
 * @returns {{ currentState: Object, pushState: Function, undo: Function, redo: Function, canUndo: boolean, canRedo: boolean }}
 */
import { useState, useCallback } from 'react';

export function useHistory(initialState, maxDepth = 50) {
  const [history, setHistory] = useState([initialState]);
  const [index, setIndex] = useState(0);

  const pushState = useCallback((state) => {
    setHistory((prev) => {
      const newHistory = prev.slice(0, index + 1);
      newHistory.push(state);
      if (newHistory.length > maxDepth) newHistory.shift();
      return newHistory;
    });
    setIndex((prev) => Math.min(prev + 1, maxDepth - 1));
  }, [index, maxDepth]);

  const undo = useCallback(() => {
    if (index > 0) setIndex(index - 1);
  }, [index]);

  const redo = useCallback(() => {
    if (index < history.length - 1) setIndex(index + 1);
  }, [index, history.length]);

  const canUndo = index > 0;
  const canRedo = index < history.length - 1;
  const currentState = history[index];

  return { currentState, pushState, undo, redo, canUndo, canRedo };
}
