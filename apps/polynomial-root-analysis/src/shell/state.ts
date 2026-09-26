// The whole truth of the page (DESIGN §7): `ShellState`, and `resolveState` — one pure function from
// it to everything computed. The permalink carries a `ShellState`, undo stores `ShellState`s, and the
// golden tests run `resolveState`, so what the suite pins is what the screen shows.
import { renderQiPolyText, type Gauss } from "@cas/exact";
import { parsePolynomial } from "../engine/parse.js";
import {
  fromCoeffs,
  fromExact,
  fromRoots,
  type Continuation,
  type Cx,
  type Polynomial,
  type Ring,
} from "../engine/polynomial.js";
import { conditioning, type Conditioning } from "../engine/roots/conditioning.js";
import { rootDiscs, type DiscReport } from "../engine/roots/discs.js";
import { rootGroups, type GroupReport } from "../engine/roots/multiplicity.js";
import { analyse, type Analysis } from "../engine/analysis/analyse.js";
import type { Loop, LoopContext } from "../engine/loops/loop.js";
import { loopContext, runLoop, type LoopRun } from "../engine/loops/run.js";
import { lassoGroup, type LassoGroup } from "../engine/loops/group.js";
import {
  baseText,
  defaultBase,
  familyContext,
  readBase,
  readFamily,
  specialise,
  type FamilyReading,
} from "../engine/family/family.js";
import { arithmeticGroup, type Arithmetic } from "../engine/family/bridge.js";
import { rung, type RungDegree } from "../engine/ladder/rungs.js";
import { runLadder, type LadderResult } from "../engine/ladder/run.js";

/** A pane's camera: the world point at the centre and the half-HEIGHT of the view. */
export interface Cam {
  readonly cx: number;
  readonly cy: number;
  readonly half: number;
}

/** Which form of the polynomial is the truth — the permalink carries only that one. */
export type PolySpec =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "coeffs"; readonly coeffs: readonly Cx[] }
  | { readonly kind: "roots"; readonly roots: readonly Cx[]; readonly lead: Cx };

export interface ShellState {
  readonly ring: Ring;
  readonly poly: PolySpec;
  readonly discs: boolean;
  /** Draw the coefficients on the root plane rather than in their own pane. */
  readonly overlay: boolean;
  /** Critical points and the roots' convex hull (Gauss–Lucas). */
  readonly critical: boolean;
  /** The coefficient whose branch points the coefficient pane shows (aⱼ), or null. */
  readonly coefficient: number | null;
  /** Keep the roots' trails after a drag is released. */
  readonly trails: boolean;
  /** log₁₀ ε of the pseudozero set drawn and certified, or null for none. */
  readonly pseudozero: number | null;
  /** The loop word in the selected coefficient's plane (PRA-3), carried as the word, never samples. */
  readonly loop: Loop | null;
  /** Show the Galois correspondence — computed on request, so it is off until asked for (PRA-6). */
  readonly lattice: boolean;
  /**
   * A family p(t, z) (PRA-7). `open`: the coefficient pane is the t-plane and the root pane shows
   * p(t₀, z); not open: the sandbox holds the member p(t₀, z), specialised, and the Family card keeps
   * the bridge back to the family it came from.
   */
  readonly family: FamilyState | null;
  /**
   * The ladder (PRA-8): a rung, a formula, and the word last run (null: none yet). While it is set the
   * root plane shows the rung's own polynomial, which a reader does not edit.
   */
  readonly ladder: LadderState | null;
  readonly rootCam: Cam;
  readonly coeffCam: Cam;
}

export interface LadderState {
  readonly rung: RungDegree;
  readonly formula: string;
  readonly word: string | null;
}

export interface FamilyState {
  /** The family as typed. */
  readonly text: string;
  /** The base point t₀, exact, as text (`1`, `-1/2`, `1/2 + 3/4*i`). */
  readonly base: string;
  readonly open: boolean;
}

export const DEFAULT_STATE: ShellState = {
  ring: "Q",
  poly: { kind: "text", text: "z^5 - z - 1" },
  discs: true,
  overlay: false,
  critical: true,
  coefficient: 0,
  trails: false,
  pseudozero: null,
  loop: null,
  lattice: false,
  family: null,
  ladder: null,
  rootCam: { cx: 0, cy: 0, half: 1.6 },
  coeffCam: { cx: 0, cy: 0, half: 1.6 },
};

export interface Resolution {
  readonly poly: Polynomial | null;
  /** Why there is no polynomial — a refusal by name. */
  readonly refusal: string | null;
  readonly discs: DiscReport | null;
  readonly groups: GroupReport | null;
  readonly conditioning: readonly Conditioning[] | null;
  readonly analysis: Analysis | null;
  /** Where loops in the selected coefficient's plane start and what they go round. */
  readonly loopContext: LoopContext | null;
  /** The state's loop, run through the certified tracker — on a commit, never a drag frame. */
  readonly loopRun: LoopRun | null;
  /** The family, when the state names one. */
  readonly family: FamilyResolution | null;
  /** The ladder's run, when a word has been run. */
  readonly ladder: LadderResult | null;
}

export interface FamilyResolution {
  readonly open: boolean;
  readonly reading: FamilyReading | null;
  /** Why the family (or its base point) cannot be followed. */
  readonly refusal: string | null;
  readonly base: Gauss | null;
  readonly baseText: string;
  /** One run per branch point: the flower of lassos (null mid-drag). */
  readonly runs: readonly LoopRun[] | null;
  readonly group: LassoGroup | null;
  /**
   * Where the group's lassos were run, when not at t₀: the group does not depend on the base point (a
   * path between two bases conjugates one flower's permutations into the other's), but a straight
   * tether can be blocked from one base and clear from another. Null: the lassos at t₀ themselves.
   */
  readonly groupBase: string | null;
  readonly arithmetic: Arithmetic | null;
  /** The polynomial resolved IS p(t₀, z) — false once a specialised member has been edited. */
  readonly matches: boolean;
}

/** Build the polynomial a state names, continuing root labels from `prev` when given. */
export function buildPolynomial(
  s: ShellState,
  prev?: Continuation,
): { ok: true; poly: Polynomial } | { ok: false; reason: string } {
  switch (s.poly.kind) {
    case "text": {
      const read = parsePolynomial(s.poly.text, s.ring);
      if (!read.ok) return read;
      return fromExact(read.exact, s.ring, prev);
    }
    case "coeffs":
      if (s.ring === "Q")
        return {
          ok: false,
          reason: "in ℚ mode the polynomial is carried as exact text, not as decimals",
        };
      return fromCoeffs(s.poly.coeffs, s.ring, prev);
    case "roots":
      return fromRoots(s.poly.roots, s.poly.lead, s.ring);
  }
}

const blank = (refusal: string, family: FamilyResolution | null): Resolution => ({
  poly: null,
  refusal,
  discs: null,
  groups: null,
  conditioning: null,
  analysis: null,
  loopContext: null,
  loopRun: null,
  family,
  ladder: null,
});

export function resolveState(s: ShellState, prev?: Continuation): Resolution {
  if (s.ladder) return resolveLadder(s, s.ladder);
  if (s.family?.open) return resolveFamily(s, s.family, prev, null);
  const built = buildPolynomial(s, prev);
  if (!built.ok) return blank(built.reason, null);
  const r = resolvePolynomial(built.poly, s, false);
  if (!s.family) return r;
  // Specialised: the sandbox holds a member; the bridge needs the family's own flower.
  const core = familyCore(s.family, null);
  if (core.refusal !== null || !core.reading || !core.base)
    return { ...r, family: { ...emptyFamily(s.family, core), matches: false } };
  const member = fromExact(specialise(core.reading, core.base), ringAt(core.base, false));
  const flower = member.ok ? flowerOf(core.reading, core.base, member.poly) : null;
  return {
    ...r,
    family: {
      ...emptyFamily(s.family, core),
      runs: flower?.runs ?? null,
      group: flower?.group ?? null,
      groupBase: flower?.groupBase ?? null,
      arithmetic: flower?.arithmetic ?? null,
      matches:
        built.poly.exact !== null &&
        built.poly.exact.equals(specialise(core.reading, core.base)),
    },
  };
}

interface FamilyCore {
  readonly reading: FamilyReading | null;
  readonly base: Gauss | null;
  readonly refusal: string | null;
}

/** The family read and its base point read — or why not. `at` overrides the base (a drag frame). */
function familyCore(f: FamilyState, at: Gauss | null): FamilyCore {
  const read = readFamily(f.text);
  if (!read.ok) return { reading: null, base: null, refusal: read.reason };
  let base = at;
  if (!base) {
    const b = readBase(f.base);
    if (!b.ok) return { reading: read.family, base: null, refusal: b.reason };
    base = b.base;
  }
  if (read.family.rawDisc.eval(base).isZero())
    return {
      reading: read.family,
      base,
      refusal: `the base point t₀ = ${baseText(base)} is a branch point: two roots of p(t₀, z) coincide there — move it off`,
    };
  return { reading: read.family, base, refusal: null };
}

function emptyFamily(f: FamilyState, core: FamilyCore): FamilyResolution {
  return {
    open: f.open,
    reading: core.reading,
    refusal: core.refusal,
    base: core.base,
    baseText: core.base ? baseText(core.base) : f.base,
    runs: null,
    group: null,
    groupBase: null,
    arithmetic: null,
    matches: true,
  };
}

/** A member's ring: ℚ at a rational base (ℝ while dragging, where it is dyadic), ℂ off the real axis. */
const ringAt = (base: Gauss, drag: boolean): Ring =>
  base.im.isZero() ? (drag ? "R" : "Q") : "C";

function lassosAt(reading: FamilyReading, base: Gauss, p: Polynomial): LoopRun[] {
  const ctx = familyContext(reading, base);
  return reading.points.map((_, k) =>
    memoRun(p, { kind: "lasso", point: k, sign: 1 }, ctx),
  );
}

function flowerOf(
  reading: FamilyReading,
  base: Gauss,
  p: Polynomial,
): {
  runs: LoopRun[];
  group: LassoGroup;
  groupBase: string | null;
  arithmetic: Arithmetic;
} {
  const runs = lassosAt(reading, base, p);
  let group = lassoGroup(runs, reading.degree);
  let groupBase: string | null = null;
  // A lasso blocked from t₀ is refused there, by name; the GROUP is asked of a base whose tethers are
  // all clear, since it is the same group from any base.
  if (group.missing) {
    const other = defaultBase(reading);
    if (!other.equals(base)) {
      const q = fromExact(specialise(reading, other), ringAt(other, false));
      if (q.ok) {
        const g = lassoGroup(lassosAt(reading, other, q.poly), reading.degree);
        if (!g.missing) {
          group = g;
          groupBase = baseText(other);
        }
      }
    }
  }
  return {
    runs,
    group,
    groupBase,
    arithmetic: arithmeticGroup(group, reading.rawDisc, reading.degree),
  };
}

/**
 * Family mode: the root pane shows p(t₀, z) and loops live in the t-plane. `at` is a drag frame's base
 * point (dyadic, not committed): then nothing slow runs — no flower, no loop.
 */
export function resolveFamily(
  s: ShellState,
  f: FamilyState,
  prev: Continuation | undefined,
  at: Gauss | null,
): Resolution {
  const drag = at !== null;
  const core = familyCore(f, at);
  const fam = emptyFamily(f, core);
  if (core.refusal !== null || !core.reading || !core.base)
    return blank(core.refusal ?? "the family cannot be read", fam);
  const built = fromExact(
    specialise(core.reading, core.base),
    ringAt(core.base, drag),
    prev,
  );
  if (!built.ok) return blank(built.reason, { ...fam, refusal: built.reason });
  const ctx = familyContext(core.reading, core.base);
  const r = resolvePolynomial(built.poly, { ...s, coefficient: null }, drag, ctx);
  if (drag) return { ...r, family: fam };
  const flower = flowerOf(core.reading, core.base, built.poly);
  return { ...r, family: { ...fam, ...flower } };
}

/** The rung's own polynomial, monic, its roots in the rung's order (labels 1 … n). */
export function ladderPolynomial(l: LadderState): Polynomial | null {
  const built = fromRoots(rung(l.rung).roots, [1, 0], "C");
  return built.ok ? built.poly : null;
}

function resolveLadder(s: ShellState, l: LadderState): Resolution {
  const p = ladderPolynomial(l);
  if (!p) return blank("the rung's polynomial could not be built", null);
  const r = resolvePolynomial(p, { ...s, coefficient: null }, false);
  return { ...r, ladder: l.word === null ? null : runLadder(l.rung, l.formula, l.word) };
}

/** The state that opens `text` at base `base` (exact text) in family mode, or a refusal by name. */
export function familyState(
  s: ShellState,
  f: FamilyState,
): { ok: true; state: ShellState; res: Resolution } | { ok: false; reason: string } {
  const next: ShellState = { ...s, family: f, ladder: null, loop: null, overlay: false };
  const res = resolveState(next);
  if (!res.poly || !res.poly.exact || !res.family?.base)
    return { ok: false, reason: res.refusal ?? "the family cannot be read" };
  return {
    ok: true,
    state: {
      ...next,
      ring: ringAt(res.family.base, false),
      poly: { kind: "text", text: renderQiPolyText(res.poly.exact, "z") },
    },
    res,
  };
}

/** The pseudozero certificate is made over the root pane's (square) view. */
export function rootRange(s: ShellState): [number, number, number, number] {
  const c = s.rootCam;
  return [c.cx - c.half, c.cx + c.half, c.cy - c.half, c.cy + c.half];
}

/** Everything computed about a polynomial the state (or a drag frame, `drag`) holds. */
export function resolvePolynomial(
  poly: Polynomial,
  s: ShellState,
  drag: boolean,
  familyCtx?: LoopContext,
): Resolution {
  const discs = rootDiscs(poly);
  const analysis = analyse(poly, discs, {
    coefficient: s.coefficient,
    pseudozero: s.pseudozero,
    range: rootRange(s),
    drag,
  });
  const j = s.coefficient;
  const ctx = familyCtx
    ? drag
      ? null
      : familyCtx
    : j !== null && j < poly.degree && !drag
      ? loopContext(poly, j, analysis.branch)
      : null;
  return {
    poly,
    refusal: null,
    discs,
    groups: rootGroups(poly, discs),
    conditioning: conditioning(poly),
    analysis,
    loopContext: ctx,
    loopRun: ctx && s.loop ? memoRun(poly, s.loop, ctx) : null,
    family: null,
    ladder: null,
  };
}

// A run costs up to ~2 s at degree 24 (PRA-3's measurement) and every render re-resolves the state, so
// runs are memoised on exactly what decides them: the roots the tracker starts from, the coefficients,
// the coefficient moved and the word.
const RUNS = new Map<string, LoopRun>();
export function memoRun(poly: Polynomial, loop: Loop, ctx: LoopContext): LoopRun {
  const key = JSON.stringify([
    poly.coeffs,
    poly.roots,
    poly.labels,
    ctx.coefficient,
    ctx.family?.key ?? null,
    loop,
  ]);
  const hit = RUNS.get(key);
  if (hit) return hit;
  const r = runLoop(poly, loop, ctx);
  if (RUNS.size >= 32) RUNS.delete(RUNS.keys().next().value as string);
  RUNS.set(key, r);
  return r;
}

/** The spec that carries `p` as its own truth: exact text when there is an exact layer. */
export function specOf(p: Polynomial): PolySpec {
  if (p.exact) return { kind: "text", text: renderQiPolyText(p.exact, "z") };
  if (p.source === "roots") return { kind: "roots", roots: p.roots, lead: p.lead };
  return { kind: "coeffs", coeffs: p.coeffs };
}

/** A camera that shows every point with a margin, never narrower than `min`. */
export function frame(points: readonly Cx[], min = 1.2): Cam {
  if (points.length === 0) return { cx: 0, cy: 0, half: min };
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  // Half the span plus a margin, so a point on the edge of the set is not on the edge of the view.
  const half = Math.max(min, 0.55 * Math.max(x1 - x0, y1 - y0) + 0.3);
  return { cx: Math.abs(cx) < 1e-12 ? 0 : cx, cy: Math.abs(cy) < 1e-12 ? 0 : cy, half };
}
