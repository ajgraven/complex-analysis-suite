// Editing a loop word (PLAN §5.2 rule 4): pure functions from the word on screen to the next one, so
// the builder's behaviour is tested without a DOM and undo is simply the previous state.
import type { Loop } from "../engine/loops/loop.js";

/** A lasso round branch point k — set as the whole loop, or appended to the word being built. */
export function withLasso(loop: Loop | null, k: number, append: boolean): Loop {
  const l: Loop = { kind: "lasso", point: k, sign: 1 };
  if (!append || !loop) return l;
  return loop.kind === "word"
    ? { kind: "word", parts: [...loop.parts, l] }
    : { kind: "word", parts: [loop, l] };
}

/** The loop travelled backwards. A lasso flips its sign; an inverse unwraps. */
export function inverted(loop: Loop): Loop {
  if (loop.kind === "lasso") return { ...loop, sign: loop.sign === 1 ? -1 : 1 };
  if (loop.kind === "inverse") return loop.of;
  return { kind: "inverse", of: loop };
}

/** Can the last two parts of the word be made into a commutator? */
export function canCommute(loop: Loop | null): boolean {
  return loop !== null && loop.kind === "word" && loop.parts.length >= 2;
}

/** The word with its last two parts `a, b` replaced by `[a, b]`; a two-part word becomes `[a, b]`. */
export function commuteLastTwo(loop: Loop): Loop {
  if (!canCommute(loop) || loop.kind !== "word") return loop;
  const parts = loop.parts;
  const c: Loop = {
    kind: "commutator",
    a: parts[parts.length - 2],
    b: parts[parts.length - 1],
  };
  return parts.length === 2 ? c : { kind: "word", parts: [...parts.slice(0, -2), c] };
}

/** Every node of the word, depth-first, with its depth — the tree the card lists, each node runnable. */
export function nodes(loop: Loop, depth = 0): { loop: Loop; depth: number }[] {
  const out = [{ loop, depth }];
  const kids: Loop[] =
    loop.kind === "word"
      ? [...loop.parts]
      : loop.kind === "inverse"
        ? [loop.of]
        : loop.kind === "commutator"
          ? [loop.a, loop.b]
          : [];
  for (const k of kids) out.push(...nodes(k, depth + 1));
  return out;
}
