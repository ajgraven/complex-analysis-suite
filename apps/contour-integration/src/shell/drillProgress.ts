// The drill's PROGRESS — the only state in this app that outlives a tab.
//
// Research 02 §6, Kalyuga's expertise reversal: support that does not fade hurts the learners who
// progress, so the rung a task OPENS at is derived from what has been cleared rather than chosen
// from a menu. That makes progress the one thing the app has to remember, and `localStorage` the
// only place to put it (Riemann-Map's theme handling is the house precedent).
//
// **THREE RULES, from M7-plan §2's risk S-e.**
//
//  1. **Versioned key.** A schema change gets a new key rather than a migration: the whole payload
//     is four small integers a learner can re-earn in a minute, and a half-read stale shape that
//     silently un-fades a rung is worse than starting again.
//  2. **Absence and garbage are the same thing.** Every read is total — no throw, no `null` for the
//     caller to handle, no partial trust in a payload that parsed but means nothing. A private
//     window, cleared site data, a hand-edited value and a future version all land on "no progress".
//  3. **Progress may never change a NUMBER.** It decides what is masked; `resolveState` does not
//     read it, and nothing here is passed to the engine. That is why this module knows about rungs
//     and task ids and nothing else about the drill.
//
// The store is a parameter rather than `window.localStorage` reached for directly, so the whole
// module runs in the node gate — the same reason `state.ts` has no DOM.

/** The rung a task has been cleared UP TO. `0` is "nothing yet", `4` is the last rung. */
export type Cleared = 0 | 1 | 2 | 3 | 4;

export const LAST_STAGE = 4;

/** Cleared rungs by task id. Tasks absent from the map have cleared nothing. */
export type DrillProgress = Readonly<Record<string, Cleared>>;

export const NO_PROGRESS: DrillProgress = {};

/**
 * The key, version included.
 *
 * `v1` is the shape `{ [taskId]: 0..4 }`. A future shape takes `v2` and leaves this one to expire
 * with the browser, which is rule 1.
 */
export const PROGRESS_KEY = "ci.drill.v1";

/** The slice of `Storage` this needs — so a test can pass an object and a caller `localStorage`. */
export interface KeyStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const isCleared = (x: unknown): x is Cleared =>
  typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= LAST_STAGE;

/**
 * What has been cleared. Total: any failure at all reads as {@link NO_PROGRESS}.
 *
 * Entries are filtered individually rather than the payload rejected whole, because one bad entry
 * is not evidence about the others — but a payload that is not an object at all carries no entries
 * to keep.
 */
export function readProgress(store: KeyStore | null): DrillProgress {
  if (store === null) return NO_PROGRESS;
  let raw: string | null;
  try {
    raw = store.getItem(PROGRESS_KEY);
  } catch {
    return NO_PROGRESS;
  }
  if (raw === null) return NO_PROGRESS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NO_PROGRESS;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return NO_PROGRESS;
  const out: Record<string, Cleared> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (isCleared(v)) out[k] = v;
  }
  return out;
}

/** Best-effort. A store that throws (a private window, quota) leaves the drill working. */
export function writeProgress(store: KeyStore | null, progress: DrillProgress): void {
  if (store === null) return;
  try {
    store.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    /* the drill is not worth an error banner */
  }
}

export const clearedOf = (progress: DrillProgress, task: string): Cleared => progress[task] ?? 0;

/**
 * The rung a task opens at — one past what it has cleared, capped at the last.
 *
 * The FADE, in one line. A reader may still address any rung by permalink; this is only where the
 * drill's own "open this task" lands.
 */
export function stageFor(progress: DrillProgress, task: string): 1 | 2 | 3 | 4 {
  const next = clearedOf(progress, task) + 1;
  return (next > LAST_STAGE ? LAST_STAGE : next) as 1 | 2 | 3 | 4;
}

/** Record a cleared rung. Monotone: revisiting an early rung cannot un-fade a later one. */
export function withCleared(progress: DrillProgress, task: string, stage: Cleared): DrillProgress {
  const now = clearedOf(progress, task);
  return stage > now ? { ...progress, [task]: stage } : progress;
}

/** Has this task been finished — every rung cleared? */
export const isComplete = (progress: DrillProgress, task: string): boolean =>
  clearedOf(progress, task) >= LAST_STAGE;
