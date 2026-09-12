// Editing a cut system: the operations the sandbox offers, as pure functions.
//
// Split out of the shell for the reason `contour/edit.ts` was — a drag is geometry, and geometry is
// testable. The shell keeps pointers, hit radii and cursors; everything that decides what the cut
// system BECOMES lives here.
//
// WHY THE SANDBOX DECLARES BRANCH POINTS RATHER THAN DETECTING THEM. Reading `z^(1/3)` out of a typed
// expression is M4.2's work, and doing it *badly* here would be worse than not doing it: an
// incomplete detector reports "no branch points" for an integrand that has them, and LEGALITY then
// passes a contour that crosses an undeclared cut in silence. A declared cut system claims nothing
// about `f` — it says "these are the cuts I have drawn", and the ledger judges exactly that. When
// M4.2 derives the points from the integrand, these operations stay: research 06's thesis is that
// **where the cuts run is the user's choice**, so placing and dragging one is the teaching surface
// whatever supplies the points.
import { Frac } from "@cas/exact";
import type { Cx } from "../kernel/geom.js";
import {
  INFINITY,
  type BranchChoice,
  type BranchOrder,
  type BranchPoint,
  type CutArc,
} from "../kernel/branch/model.js";

/** The orders the sandbox offers. Every one of them appears in the tier-D gallery. */
export const OFFERED_ORDERS: readonly { readonly label: string; readonly order: BranchOrder }[] = [
  { label: "√ (α = 1/2)", order: { kind: "power", alpha: Frac.of(1n, 2n) } },
  { label: "1/√ (α = −1/2)", order: { kind: "power", alpha: Frac.of(-1n, 2n) } },
  { label: "α = 1/3", order: { kind: "power", alpha: Frac.of(1n, 3n) } },
  { label: "α = 2/3", order: { kind: "power", alpha: Frac.of(2n, 3n) } },
  { label: "α = 1/4", order: { kind: "power", alpha: Frac.of(1n, 4n) } },
  { label: "α = 3/4", order: { kind: "power", alpha: Frac.of(3n, 4n) } },
  { label: "log", order: { kind: "log" } },
];

export const orderLabel = (o: BranchOrder): string =>
  o.kind === "log" ? "log" : `α = ${o.alpha.n}/${o.alpha.d}`;

/** How far out a fresh cut's control vertex is placed, relative to its branch point's distance. */
const REACH = 3;

const freshId = (taken: Iterable<string>, stem: string): string => {
  const used = new Set(taken);
  for (let k = 1; ; k++) if (!used.has(`${stem}${k}`)) return `${stem}${k}`;
};

/**
 * A default cut for a new point: a ray heading straight out from the origin, through the point.
 *
 * Directly away from the origin is the "shadow cut" of research 06 §2.3 — the placement that follows
 * from a base point at the centre of the picture — and it has the practical virtue of never starting
 * out lying along a contour the user has already drawn about the origin.
 */
function defaultVia(at: Cx): Cx {
  const r = Math.hypot(at[0], at[1]);
  if (r === 0) return [REACH, 0];
  return [at[0] * REACH, at[1] * REACH];
}

export function addBranchPoint(branch: BranchChoice, at: Cx): BranchChoice {
  const id = freshId(branch.points.map((p) => p.id), "b");
  const point: BranchPoint = {
    id,
    at,
    order: OFFERED_ORDERS[0].order,
    label: `z = ${at[0].toFixed(2)}${at[1] < 0 ? " − " : " + "}${Math.abs(at[1]).toFixed(2)}i`,
  };
  const cut: CutArc = {
    id: freshId(branch.cuts.map((c) => c.id), "Γ"),
    from: id,
    to: INFINITY,
    via: [defaultVia(at)],
  };
  return { ...branch, points: [...branch.points, point], cuts: [...branch.cuts, cut] };
}

/** Removing a point removes every cut that ends on it — a cut to nowhere is malformed, not free. */
export function removeBranchPoint(branch: BranchChoice, id: string): BranchChoice {
  return {
    ...branch,
    points: branch.points.filter((p) => p.id !== id),
    cuts: branch.cuts.filter((c) => c.from !== id && c.to !== id),
  };
}

export function setOrder(branch: BranchChoice, id: string, order: BranchOrder): BranchChoice {
  return {
    ...branch,
    points: branch.points.map((p) => (p.id === id ? { ...p, order } : p)),
  };
}

/**
 * Move a branch point, taking its cuts with it.
 *
 * A cut running out to infinity is carried bodily, so its direction survives the move; a cut joining
 * two points keeps its bow centred by taking half the displacement, which is what a reader expects
 * from dragging one end of an arc.
 */
export function moveBranchPoint(branch: BranchChoice, id: string, to: Cx): BranchChoice {
  const point = branch.points.find((p) => p.id === id);
  if (point === undefined) return branch;
  const d: Cx = [to[0] - point.at[0], to[1] - point.at[1]];
  return {
    ...branch,
    points: branch.points.map((p) => (p.id === id ? { ...p, at: to, label: relabel(to) } : p)),
    cuts: branch.cuts.map((c) => {
      if (c.from !== id && c.to !== id) return c;
      const share = c.from === INFINITY || c.to === INFINITY ? 1 : 0.5;
      return { ...c, via: c.via.map((v): Cx => [v[0] + share * d[0], v[1] + share * d[1]]) };
    }),
  };
}

const relabel = (at: Cx): string =>
  `z = ${at[0].toFixed(2)}${at[1] < 0 ? " − " : " + "}${Math.abs(at[1]).toFixed(2)}i`;

export function moveCutVertex(
  branch: BranchChoice,
  cutId: string,
  index: number,
  to: Cx,
): BranchChoice {
  return {
    ...branch,
    cuts: branch.cuts.map((c) =>
      c.id === cutId ? { ...c, via: c.via.map((v, k) => (k === index ? to : v)) } : c,
    ),
  };
}

/**
 * Replace two rays to infinity with one cut joining their points — the dogbone gesture.
 *
 * Research 06 calls dragging between "two rays to ∞" and "one arc `a→b`" the single most valuable
 * interaction in the app, and it only IS an interaction because both ends of it can be legal: for
 * `((z−a)(z−b))^(−1/2)` the two exponents sum to `−1 ∈ ℤ`, so the bounded component closes. For a
 * pair that does NOT sum to an integer the join is still offered and the ledger refuses it, which is
 * the lesson rather than a bug — the rule is what decides, not the button.
 */
export function joinToOneCut(branch: BranchChoice, a: string, b: string): BranchChoice | null {
  const pa = branch.points.find((p) => p.id === a);
  const pb = branch.points.find((p) => p.id === b);
  if (pa === undefined || pb === undefined || a === b) return null;
  const rest = branch.cuts.filter(
    (c) => c.from !== a && c.to !== a && c.from !== b && c.to !== b,
  );
  const mid: Cx = [(pa.at[0] + pb.at[0]) / 2, (pa.at[1] + pb.at[1]) / 2];
  return {
    ...branch,
    cuts: [...rest, { id: freshId(rest.map((c) => c.id), "Γ"), from: a, to: b, via: [mid] }],
  };
}

/** The reverse: one bounded cut becomes a ray to infinity from each of its ends. */
export function splitToRays(branch: BranchChoice, cutId: string): BranchChoice | null {
  const cut = branch.cuts.find((c) => c.id === cutId);
  if (cut === undefined || cut.from === INFINITY || cut.to === INFINITY) return null;
  const rest = branch.cuts.filter((c) => c.id !== cutId);
  const rays: CutArc[] = [];
  for (const end of [cut.from, cut.to]) {
    const at = branch.points.find((p) => p.id === end)?.at;
    if (at === undefined) continue;
    rays.push({
      id: freshId([...rest, ...rays].map((c) => c.id), "Γ"),
      from: end,
      to: INFINITY,
      via: [defaultVia(at)],
    });
  }
  return { ...branch, cuts: [...rest, ...rays] };
}

export type BranchGrab =
  | { readonly kind: "point"; readonly id: string }
  | { readonly kind: "cut"; readonly id: string; readonly index: number }
  /** The base point `z₀` — the lamp whose shadows the cuts are, in research 06 §2.3's mode. */
  | { readonly kind: "base" };

export interface BranchHandle {
  readonly at: Cx;
  readonly grab: BranchGrab;
  /** For the keyboard announcement and the cursor. */
  readonly label: string;
}

/**
 * Every draggable part of the cut system: each branch point, each cut's control vertex, and — in
 * shadow mode — the base point.
 *
 * **The cut vertices are NOT offered in shadow mode**, and that is the mode's whole shape. There the
 * cuts are a CONSEQUENCE of where `z₀` is, so a handle on one would be a handle on a consequence:
 * the drag would be silently undone by the next derivation, which is the worst kind of control.
 * What moves instead is the lamp.
 */
export function branchHandles(branch: BranchChoice): BranchHandle[] {
  const out: BranchHandle[] = [];
  for (const p of branch.points) {
    out.push({ at: p.at, grab: { kind: "point", id: p.id }, label: `branch point ${p.id}` });
  }
  if (branch.shadow === true) {
    out.push({ at: branch.basePoint, grab: { kind: "base" }, label: "the base point z₀" });
    return out;
  }
  for (const c of branch.cuts) {
    c.via.forEach((v, index) => {
      out.push({ at: v, grab: { kind: "cut", id: c.id, index }, label: `the cut ${c.id}` });
    });
  }
  return out;
}

/** Apply a move to whatever the grab names. Unknown ids are left alone rather than throwing. */
export function applyBranchGrab(branch: BranchChoice, grab: BranchGrab, to: Cx): BranchChoice {
  if (grab.kind === "base") return { ...branch, basePoint: to };
  return grab.kind === "point"
    ? moveBranchPoint(branch, grab.id, to)
    : moveCutVertex(branch, grab.id, grab.index, to);
}

/**
 * Turn shadow mode on or off, keeping whichever description survives the switch.
 *
 * Turning it ON keeps the declared arcs in place — untouched and ignored — so turning it off again
 * restores exactly the cut system the reader built, including a dogbone shadow mode cannot express.
 * The alternative is to derive over the top of them, and then the mode is a one-way door that
 * silently destroys a bounded arc.
 */
export const setShadow = (branch: BranchChoice, shadow: boolean): BranchChoice => ({
  ...branch,
  shadow,
});
