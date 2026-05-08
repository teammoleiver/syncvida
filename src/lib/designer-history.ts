import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Figma-style history hook.
 *  - `state`        — current value
 *  - `setLive(fn)`  — update without committing (use during a drag, slider, typing)
 *  - `commit(fn)`   — atomically update AND push the previous value onto the undo stack
 *  - `commitNow()`  — push current state as a checkpoint (use right before a destructive action)
 *  - `undo` / `redo` — standard
 *
 * Live updates that are not committed are reverted by undo (because undo restores the last committed snapshot).
 */
export function useHistory<T>(initial: T | null, max = 200) {
  const [state, setState] = useState<T | null>(initial);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const [, force] = useState(0);
  const stateRef = useRef<T | null>(state);
  stateRef.current = state;

  // reset on new initial
  useEffect(() => {
    setState(initial);
    past.current = [];
    future.current = [];
    force((n) => n + 1);
  }, [initial]);

  const setLive = useCallback((next: (prev: T) => T) => {
    setState((prev) => (prev == null ? prev : next(prev)));
  }, []);

  const commit = useCallback((next: (prev: T) => T) => {
    setState((prev) => {
      if (prev == null) return prev;
      past.current.push(structuredClone(prev));
      if (past.current.length > max) past.current.shift();
      future.current = [];
      const value = next(prev);
      force((n) => n + 1);
      return value;
    });
  }, [max]);

  const commitNow = useCallback(() => {
    if (stateRef.current == null) return;
    past.current.push(structuredClone(stateRef.current));
    if (past.current.length > max) past.current.shift();
    future.current = [];
    force((n) => n + 1);
  }, [max]);

  const undo = useCallback(() => {
    setState((prev) => {
      if (prev == null || past.current.length === 0) return prev;
      const last = past.current.pop()!;
      future.current.push(structuredClone(prev));
      force((n) => n + 1);
      return last;
    });
  }, []);

  const redo = useCallback(() => {
    setState((prev) => {
      if (prev == null || future.current.length === 0) return prev;
      const next = future.current.pop()!;
      past.current.push(structuredClone(prev));
      force((n) => n + 1);
      return next;
    });
  }, []);

  const reset = useCallback((value: T | null) => {
    past.current = [];
    future.current = [];
    setState(value);
  }, []);

  return {
    state,
    setLive,
    commit,
    commitNow,
    undo,
    redo,
    reset,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
