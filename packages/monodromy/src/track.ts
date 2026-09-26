// The CERTIFIED root tracker (DESIGN §4.4, ADR-0047 PRA-3): the roots of p_t followed along a polyline
// of values of ONE coefficient aⱼ (j < n, the leading coefficient held fixed), with a proof on every
// segment that no two roots meet — so the permutation a closed loop induces is a theorem, not the
// nearest-match estimate `monodromy.ts` makes for the plotter's sheets.
//
// Per segment [a, b] of the polyline, with z₁ … zₙ the approximations at a:
//
// 1. p_t = p_a + (t − a)·zʲ is LINEAR in t and aₙ does not move, so each Weierstrass correction
//    Wᵢ(t) = p_t(zᵢ)/(aₙ∏_{k≠i}(zᵢ − z_k)) is linear in t at the FIXED zᵢ, |Wᵢ| is convex on the
//    segment, and its maximum is at an endpoint. The envelope of the two endpoints' Smith discs
//    (`smithDiscsEnvelope`) therefore contains every p_t's Smith disc about the same zᵢ.
// 2. If the envelope's discs are pairwise disjoint, then for EVERY t on the segment each disc holds
//    exactly one root of p_t (Smith). The roots move continuously, so none can leave its disc: the root
//    in Dᵢ at b is the continuation of the one in Dᵢ at a. This is the whole certificate.
// 3. The roots at b are solved (by the caller's solver, seeded from zᵢ) and each gets its OWN Smith disc
//    Sₘ at b. The root in Sₘ lies in some Dₖ; if Sₘ meets Dₖ and no other D, it is Dₖ's root, and the
//    labels carry across. A bijection is required.
// 4. Any failure bisects the segment at its exact midpoint (all parameter values are Gaussian rationals,
//    so the path certified is exactly the polyline asked for); below `floor` bisections it REFUSES,
//    naming the segment. A refusal is the honest answer near a collision, never a guess.
//
// Everything that decides is exact (`@cas/exact`); floats only propose the next approximations.
import {
  Frac,
  Gauss,
  gaussOfDoubles,
  smithDiscs,
  smithDiscsEnvelope,
  smithDiscsSeries,
  type SmithDisc,
} from "@cas/exact";
import type { Perm } from "./permGroup.js";

export type Cx = readonly [number, number];

/** Solve p (float coefficients, exact twin given) for all n roots, seeded from `seeds`. */
export type Solver = (
  coeffs: readonly Cx[],
  exact: readonly Gauss[],
  seeds: readonly Cx[],
) => readonly Cx[];

export interface TrackInput {
  /** Exact coefficients a₀ … aₙ at the START of the path. */
  readonly coeffs: readonly Gauss[];
  /** The coefficient that moves, j < n. */
  readonly coefficient: number;
  /** Exact values of aⱼ at the polyline's vertices; `path[0]` must equal `coeffs[j]`. */
  readonly path: readonly Gauss[];
  /** The starting approximations, one per root, each in its own Smith disc. */
  readonly roots: readonly Cx[];
  readonly solve: Solver;
  /** Bisections allowed below a polyline edge before refusing (default 20: 2⁻²⁰ of the edge). */
  readonly floor?: number;
  /** Certified steps allowed in all (default 20 000). */
  readonly maxSteps?: number;
  /**
   * Called with every CERTIFIED step's evidence: the segment, the fixed points and each disc's radius
   * (an upper bound, for checking). The claim is that for every t in [from, to] each disc holds exactly
   * one root of p_t — which a test can falsify by sampling t, and does.
   */
  readonly onStep?: (step: {
    readonly from: Gauss;
    readonly to: Gauss;
    readonly centres: readonly Cx[];
    readonly radii: readonly number[];
  }) => void;
}

export interface TrackEvidence {
  /** Certified segments. */
  readonly steps: number;
  /** Segments that failed and were halved. */
  readonly bisections: number;
  /** The deepest halving any segment needed (0: every edge certified whole). */
  readonly maxDepth: number;
}

export type TrackResult =
  | {
      readonly ok: true;
      /** For a CLOSED path, σ with σ[i] the start index the root that started at i returns to; else null. */
      readonly perm: Perm | null;
      /** The approximations at the end: `ends[i]` continues the root that started at i. */
      readonly ends: readonly Cx[];
      /** Per starting root, its position after every certified step (the first entry is the start). */
      readonly paths: readonly (readonly Cx[])[];
      readonly evidence: TrackEvidence;
    }
  | {
      readonly ok: false;
      readonly reason: string;
      /** The polyline edge (0-based) where certification stopped, when it got that far. */
      readonly edge: number | null;
      /** The parameter interval of the last segment tried. */
      readonly at: readonly [Cx, Cx] | null;
      readonly paths: readonly (readonly Cx[])[];
      readonly evidence: TrackEvidence;
    };

const exactOf = (z: Cx): Gauss => gaussOfDoubles(z[0], z[1]);
const HALF = new Gauss(Frac.of(1n, 2n), Frac.ZERO);

/**
 * Do discs `a` and `b` provably not meet? A float prefilter decides the pairs that are far apart
 * (`radiusUpper` is an upper bound, and the margin covers the rounding of the distance); only the
 * near ones reach the exact test, which is `discsDisjoint`'s cleared of denominators so that no
 * thousand-bit gcd is ever taken (reading `radiusSq` reduces the squared radius).
 */
function disjoint(a: SmithDisc, b: SmithDisc): boolean {
  const [ax, ay] = a.centre.toTuple();
  const [bx, by] = b.centre.toTuple();
  const d = Math.hypot(ax - bx, ay - by);
  const r = a.radiusUpper() + b.radiusUpper();
  if (d > r * (1 + 1e-9) + 8 * Number.EPSILON * (Math.hypot(ax, ay) + Math.hypot(bx, by)))
    return true;
  // δ² = P/Q exactly; sₐ = a.rNum/a.rDen, s_b likewise. Disjoint ⟺ G > 0 and G² > 4·aN·bN·Q²·aD·bD
  // with G = P·aD·bD − Q·(aN·bD + bN·aD).
  const dd = a.centre.sub(b.centre).norm2();
  const P = dd.n;
  const Q = dd.d;
  const G = P * a.rDen * b.rDen - Q * (a.rNum * b.rDen + b.rNum * a.rDen);
  return G > 0n && G * G > 4n * a.rNum * b.rNum * Q * Q * a.rDen * b.rDen;
}

/**
 * Float estimate of the segment's disc envelope: would it plainly FAIL? Only a hint — a `true` skips
 * the exact test and halves the segment at once; `false` proves nothing and the exact test decides.
 */
function plainlyOverlapping(
  ca: readonly Cx[],
  cb: readonly Cx[],
  z: readonly Cx[],
): boolean {
  const n = z.length;
  const radius = (c: readonly Cx[], i: number): number => {
    let pr = c[n][0];
    let pi = c[n][1];
    const [x, y] = z[i];
    for (let k = n - 1; k >= 0; k--) {
      const nr = pr * x - pi * y + c[k][0];
      pi = pr * y + pi * x + c[k][1];
      pr = nr;
    }
    let den = Math.hypot(c[n][0], c[n][1]);
    for (let k = 0; k < n; k++) if (k !== i) den *= Math.hypot(x - z[k][0], y - z[k][1]);
    return (n * Math.hypot(pr, pi)) / den;
  };
  const r = z.map((_, i) => Math.max(radius(ca, i), radius(cb, i)));
  for (let i = 0; i < n; i++)
    for (let k = i + 1; k < n; k++)
      if (r[i] + r[k] > 1.5 * Math.hypot(z[i][0] - z[k][0], z[i][1] - z[k][1]))
        return true;
  return false;
}

/**
 * The label rule: for each new disc, the ONE old disc it meets — or null if any new disc meets none or
 * several, or two meet the same one. With the old discs pairwise disjoint and each holding one root,
 * a new disc meeting only Dₖ holds Dₖ's root, which is the whole argument for carrying the label.
 */
export function matchDiscs(
  news: readonly SmithDisc[],
  olds: readonly SmithDisc[],
): number[] | null {
  const out: number[] = [];
  const taken = new Set<number>();
  for (const s of news) {
    let hit = -1;
    for (let k = 0; k < olds.length; k++) {
      if (disjoint(s, olds[k])) continue;
      if (hit >= 0) return null;
      hit = k;
    }
    if (hit < 0 || taken.has(hit)) return null;
    taken.add(hit);
    out.push(hit);
  }
  return out;
}

/**
 * THE certificate for one segment: Smith's discs about the fixed points `z` for the polynomials at both
 * ends (`ca`, `cb`), each carrying the larger radius — returned only if they are pairwise DISJOINT, in
 * exact arithmetic. By the convexity argument in the header, every p_t on the segment then has exactly
 * one root in each. (The float pre-check in the loop only skips cases this would plainly refuse.)
 */
export function certifySegment(
  ca: readonly Gauss[],
  cb: readonly Gauss[],
  z: readonly Cx[],
): readonly SmithDisc[] | null {
  const env = smithDiscsEnvelope([ca, cb], z.map(exactOf));
  return env.ok && env.components === z.length ? env.discs : null;
}

export function trackCoefficientPath(input: TrackInput): TrackResult {
  const { coeffs, coefficient: j, path } = input;
  const n = coeffs.length - 1;
  const early = (reason: string): TrackResult => ({
    ok: false,
    reason,
    edge: null,
    at: null,
    paths: input.roots.map((r) => [r]),
    evidence: { steps: 0, bisections: 0, maxDepth: 0 },
  });
  if (!(j >= 0 && j < n))
    return early(
      `only a coefficient below the leading one can be moved along a loop (a${j} of degree ${n})`,
    );
  if (path.length >= 1 && !path[0].equals(coeffs[j]))
    return early(`the path does not start at the current value of a${j}`);
  const coeffsAt = (v: Gauss): Gauss[] => coeffs.map((c, k) => (k === j ? v : c));
  return trackPath(input, {
    n,
    name: `a${j}`,
    coeffsAt,
    // Linear in t with aₙ fixed: the convexity argument in the header.
    certify: (a, b, z) => certifySegment(coeffsAt(a), coeffsAt(b), z),
  });
}

/** A family `p(t, z) = Σₖ aₖ(t) zᵏ`, `aₖ(t) = Σₘ family[k][m]·tᵐ`, followed along a path of `t`. */
export interface FamilyTrackInput extends Omit<TrackInput, "coeffs" | "coefficient"> {
  /** `family[k][m]` is the coefficient of `zᵏ·tᵐ`; the leading `aₙ` must not depend on `t`. */
  readonly family: readonly (readonly Gauss[])[];
  /** The parameter's name, for refusals (default "t"). */
  readonly name?: string;
}

/** `aₖ(v)` for every k, exactly. */
export function familyAt(family: readonly (readonly Gauss[])[], v: Gauss): Gauss[] {
  return family.map((ak) => {
    let acc = Gauss.ZERO;
    for (let m = ak.length - 1; m >= 0; m--) acc = acc.mul(v).add(ak[m]);
    return acc;
  });
}

/**
 * The parts of `p(a + s·h, z) = Σ_r s^r·partᵣ(z)`: `partᵣ` has coefficients `h^r·Σₘ C(m, r)·a^{m−r}·aₖₘ`
 * — the Taylor expansion of each `aₖ(t)` about `a`, scaled to the segment. `part₀` is `p(a, ·)`.
 */
export function segmentParts(
  family: readonly (readonly Gauss[])[],
  a: Gauss,
  h: Gauss,
): Gauss[][] {
  const d = Math.max(0, ...family.map((ak) => ak.length - 1));
  const parts: Gauss[][] = [];
  let hr = Gauss.ONE;
  for (let r = 0; r <= d; r++) {
    parts.push(
      family.map((ak) => {
        let acc = Gauss.ZERO;
        // Σ_{m ≥ r} C(m, r)·a^{m−r}·aₖₘ, by Horner in a over m − r.
        for (let m = ak.length - 1; m >= r; m--)
          acc = acc.mul(a).add(ak[m].mul(new Gauss(Frac.of(binomial(m, r)), Frac.ZERO)));
        return acc.mul(hr);
      }),
    );
    hr = hr.mul(h);
  }
  return parts;
}

function binomial(m: number, r: number): bigint {
  let out = 1n;
  for (let k = 1; k <= r; k++) out = (out * BigInt(m - r + k)) / BigInt(k);
  return out;
}

/**
 * The certified tracker for a FAMILY (ADR-0047 PRA-7): the roots of `p(t, ·)` followed along a polyline
 * of `t`. Each segment is certified as in the header, with one change when some `aₖ(t)` has degree > 1
 * in `t`: then `Wᵢ` is a polynomial in the segment's parameter, not linear, its modulus can peak INSIDE
 * the segment, and the endpoint envelope is not a bound — so the bound is `smithDiscsSeries`'s
 * triangle inequality over the segment's Taylor parts. With every `aₖ` of degree ≤ 1 the family moves
 * linearly and the (tighter) endpoint envelope is exactly right.
 */
export function trackFamilyPath(input: FamilyTrackInput): TrackResult {
  const { family } = input;
  const n = family.length - 1;
  const name = input.name ?? "t";
  const early = (reason: string): TrackResult => ({
    ok: false,
    reason,
    edge: null,
    at: null,
    paths: input.roots.map((r) => [r]),
    evidence: { steps: 0, bisections: 0, maxDepth: 0 },
  });
  if (n < 1)
    return early("the family has degree 0 in z, so there are no roots to follow");
  const lead = family[n];
  if (lead.length === 0 || lead[0].isZero() || lead.slice(1).some((c) => !c.isZero()))
    return early(
      `the leading coefficient must be a non-zero constant, not a polynomial in ${name}: where it vanishes a root runs off to infinity`,
    );
  const linear = family.every((ak) => ak.length <= 2);
  const coeffsAt = (v: Gauss): Gauss[] => familyAt(family, v);
  return trackPath(input, {
    n,
    name,
    coeffsAt,
    certify: (a, b, z) => {
      if (linear) return certifySegment(coeffsAt(a), coeffsAt(b), z);
      const r = smithDiscsSeries(segmentParts(family, a, b.sub(a)), z.map(exactOf));
      return r.ok && r.components === z.length ? r.discs : null;
    },
  });
}

interface PathModel {
  readonly n: number;
  /** The moving parameter's name, for refusals: `a₀`, `t`. */
  readonly name: string;
  readonly coeffsAt: (v: Gauss) => Gauss[];
  /** Discs about `z`, pairwise disjoint, each holding one root of EVERY polynomial on [a, b] — or null. */
  readonly certify: (a: Gauss, b: Gauss, z: readonly Cx[]) => readonly SmithDisc[] | null;
}

function trackPath(
  input: Omit<TrackInput, "coeffs" | "coefficient">,
  model: PathModel,
): TrackResult {
  const { path, solve } = input;
  const { n, name, coeffsAt } = model;
  const floor = input.floor ?? 20;
  const maxSteps = input.maxSteps ?? 20_000;
  let steps = 0;
  let bisections = 0;
  let maxDepth = 0;
  const evidence = (): TrackEvidence => ({ steps, bisections, maxDepth });
  let z: Cx[] = input.roots.map((r) => [r[0], r[1]]);
  const paths: Cx[][] = z.map((r) => [r]);
  const refuse = (
    reason: string,
    edge: number | null,
    at: readonly [Cx, Cx] | null,
  ): TrackResult => ({
    ok: false,
    reason,
    edge,
    at,
    paths,
    evidence: evidence(),
  });

  if (path.length < 2) return refuse("the path has fewer than two points", null, null);
  if (z.length !== n)
    return refuse(`${z.length} roots were given for degree ${n}`, null, null);

  const floats = (cs: readonly Gauss[]): Cx[] => cs.map((c) => c.toTuple());
  const coeffs = coeffsAt(path[0]);

  const start = smithDiscs(coeffs, z.map(exactOf));
  if (!start.ok)
    return refuse(`the starting roots cannot be certified: ${start.reason}`, null, null);
  if (start.components !== n)
    return refuse(
      "the starting roots are not each in their own disc (two roots are too close to tell apart)",
      null,
      null,
    );

  let a = path[0];
  for (let e = 0; e + 1 < path.length; e++) {
    const edgeLen = Math.hypot(...floats([path[e + 1].sub(path[e])])[0]);
    // Pending endpoints, the nearest on top.
    const stack: Gauss[] = [path[e + 1]];
    while (stack.length) {
      const b = stack[stack.length - 1];
      // How many halvings of the edge this segment is (its length decides, not its history).
      const depth = Math.round(Math.log2(edgeLen / Math.hypot(...b.sub(a).toTuple())));
      if (steps >= maxSteps)
        return refuse(`the path needed more than ${maxSteps} certified steps`, e, [
          a.toTuple(),
          b.toTuple(),
        ]);
      const ca = coeffsAt(a);
      const cb = coeffsAt(b);
      let next: Cx[] | null = null;
      const env = plainlyOverlapping(floats(ca), floats(cb), z)
        ? null
        : model.certify(a, b, z);
      if (env) {
        const solved = solve(floats(cb), cb, z);
        if (solved.length === n) {
          const at = smithDiscs(cb, solved.map(exactOf));
          if (at.ok && at.components === n) {
            const m = matchDiscs(at.discs, env);
            if (m) {
              next = new Array<Cx>(n);
              solved.forEach((r, i) => ((next as Cx[])[m[i]] = [r[0], r[1]]));
            }
          }
        }
      }
      if (next) {
        if (input.onStep && env)
          input.onStep({
            from: a,
            to: b,
            centres: z,
            radii: env.map((d) => d.radiusUpper()),
          });
        z = next;
        z.forEach((r, i) => paths[i].push(r));
        a = b;
        stack.pop();
        steps++;
        continue;
      }
      if (depth >= floor) {
        const [ax, ay] = a.toTuple();
        const [bx, by] = b.toTuple();
        return refuse(
          `the step from ${name} = ${fmt(ax, ay)} to ${fmt(bx, by)} could not be certified after ${floor} halvings of ${edgeLen.toPrecision(3)}: two roots come too close there — the path runs through, or too near, a place where roots collide`,
          e,
          [
            [ax, ay],
            [bx, by],
          ],
        );
      }
      bisections++;
      maxDepth = Math.max(maxDepth, depth + 1);
      stack.push(a.add(b).mul(HALF));
    }
  }

  const ends: Cx[] = z.map((r) => [r[0], r[1]]);
  const closed = path[path.length - 1].equals(path[0]);
  if (!closed) return { ok: true, perm: null, ends, paths, evidence: evidence() };
  // Back where it started: each root's final disc meets exactly one starting disc.
  const fin = smithDiscs(coeffs, z.map(exactOf));
  if (!fin.ok || fin.components !== n)
    return refuse(
      "the roots at the end of the loop could not be certified",
      path.length - 2,
      null,
    );
  const m = matchDiscs(fin.discs, start.discs);
  if (!m)
    return refuse(
      "the roots at the end of the loop could not be matched to the roots at its start",
      path.length - 2,
      null,
    );
  return { ok: true, perm: m, ends, paths, evidence: evidence() };
}

function fmt(x: number, y: number): string {
  const r = (v: number): string => String(Number(v.toPrecision(6)));
  if (y === 0) return r(x);
  return `${r(x)} ${y < 0 ? "−" : "+"} ${r(Math.abs(y))}i`;
}
