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

/**
 * What a task has to show for itself — M8 step 3.4.
 *
 * `stage` is what it has cleared; `predicted` is rung iii's forced choice, absent until it has been
 * answered. Two facts rather than one because they fade different things: the stage decides where
 * the task OPENS, and the prediction is a thing a reader did once and should not be asked to redo
 * on a revisit.
 */
export interface TaskProgress {
  readonly stage: Cleared;
  /** Was rung iii's prediction right? Absent means "not answered yet", NOT "wrong". */
  readonly predicted?: boolean;
}

/** Progress by task id. Tasks absent from the map have cleared nothing. */
export type DrillProgress = Readonly<Record<string, TaskProgress>>;

export const NO_PROGRESS: DrillProgress = {};

/**
 * The key, version included.
 *
 * `v2` is `{ [taskId]: { stage: 0..4, predicted?: boolean } }`. `v1` was `{ [taskId]: 0..4 }`.
 *
 * **`v1` IS STILL READ, and that is a deliberate exception to rule 1 above rather than a lapse
 * from it.** The rule's reason is the clause after the colon — *a half-read stale shape that
 * silently un-fades a rung is worse than starting again* — and reading `v1` cannot un-fade
 * anything: the stage is exactly what `v1` carries, and the field it does not carry defaults to
 * "not answered", which is the same thing a reader who has never seen rung iii's question already
 * has. What the rule forbids and this still does not do is WRITE the old shape: every write goes
 * to `v2`, so a `v1` value is read once and then superseded, never merged into.
 */
export const PROGRESS_KEY = "ci.drill.v2";

/** The shape before the prediction. Read, never written — see {@link PROGRESS_KEY}. */
export const LEGACY_KEY = "ci.drill.v1";

/** The slice of `Storage` this needs — so a test can pass an object and a caller `localStorage`. */
export interface KeyStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const isCleared = (x: unknown): x is Cleared =>
  typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= LAST_STAGE;

/** One `v2` entry, or null. Rule 2: a bad entry is dropped, never repaired into a guess. */
function entryOf(v: unknown): TaskProgress | null {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (!isCleared(o.stage)) return null;
  // `predicted` is tri-state on the wire too: present-and-boolean, or absent. Anything else is the
  // absence, because a `predicted: "yes"` is not evidence about the prediction either way.
  return typeof o.predicted === "boolean" ? { stage: o.stage, predicted: o.predicted } : { stage: o.stage };
}

/** Parse one stored payload, or null when there is nothing usable in it at all. */
function parseStore(store: KeyStore, key: string): unknown {
  let raw: string | null;
  try {
    raw = store.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * What has been cleared. Total: any failure at all reads as {@link NO_PROGRESS}.
 *
 * Entries are filtered individually rather than the payload rejected whole, because one bad entry
 * is not evidence about the others — but a payload that is not an object at all carries no entries
 * to keep.
 */
export function readProgress(store: KeyStore | null): DrillProgress {
  if (store === null) return NO_PROGRESS;
  const now = parseStore(store, PROGRESS_KEY);
  if (now !== null && typeof now === "object" && !Array.isArray(now)) {
    const out: Record<string, TaskProgress> = {};
    for (const [k, v] of Object.entries(now as Record<string, unknown>)) {
      const entry = entryOf(v);
      if (entry !== null) out[k] = entry;
    }
    return out;
  }
  // **The `v1` fallback, and it is a fallback rather than a merge.** It is consulted only when `v2`
  // has nothing to say — an unreadable `v2`, a `v2` that is not an object, or no `v2` at all — so
  // a reader who has started under the new shape can never have an old value reach back into it.
  const old = parseStore(store, LEGACY_KEY);
  if (old === null || typeof old !== "object" || Array.isArray(old)) return NO_PROGRESS;
  const out: Record<string, TaskProgress> = {};
  for (const [k, v] of Object.entries(old as Record<string, unknown>)) {
    if (isCleared(v)) out[k] = { stage: v };
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

export const clearedOf = (progress: DrillProgress, task: string): Cleared => progress[task]?.stage ?? 0;

/** Rung iii's outcome, or `null` where it has not been answered. Never `false` for "unasked". */
export const predictionOf = (progress: DrillProgress, task: string): boolean | null =>
  progress[task]?.predicted ?? null;

/**
 * Record the prediction's outcome.
 *
 * **First answer wins, like the stage.** `withCleared` is monotone so revisiting an early rung
 * cannot un-fade a later one, and the same reasoning applies here from the other side: a reader who
 * got it right and comes back to look at the question again has not unlearned it, and a store that
 * flipped to `false` on the second visit would be recording the visit rather than the prediction.
 */
export function withPrediction(progress: DrillProgress, task: string, ok: boolean): DrillProgress {
  const at = progress[task] ?? { stage: 0 as Cleared };
  if (at.predicted !== undefined) return progress;
  return { ...progress, [task]: { ...at, predicted: ok } };
}

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
  if (stage <= now) return progress;
  // Spread the entry rather than replace it: the prediction is the other half of this task's record
  // and clearing a rung is not evidence about it.
  return { ...progress, [task]: { ...(progress[task] ?? {}), stage } };
}

/** Has this task been finished — every rung cleared? */
export const isComplete = (progress: DrillProgress, task: string): boolean =>
  clearedOf(progress, task) >= LAST_STAGE;
