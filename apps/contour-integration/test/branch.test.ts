// Guards for the branch-cut kernel: what a cut system IS, whether it is LEGAL, and how a
// multivalued factor is FOLLOWED across it.
//
// The corpus is drawn from the tier-D gallery rather than invented, because M4's whole claim is that
// one rule (research 06 §2.1) explains every one of those records. Where a record's admissibility
// condition is stated in its own text — D7's `μ + ν ∈ ℤ` is the clearest — the test asserts the
// engine agrees with the record, not with itself.
import { describe, expect, it } from "vitest";
import { Frac } from "@cas/exact";
import { checkAdmissibility, type AdmissibilityReport } from "../src/kernel/branch/admissibility.js";
import { classifyAgainstCut, needsSide } from "../src/kernel/branch/crossing.js";
import { liftArgument } from "../src/kernel/branch/lift.js";
import {
  INFINITY,
  NO_BRANCH,
  cutPolyline,
  type BranchChoice,
  type BranchPoint,
  type CutArc,
} from "../src/kernel/branch/model.js";
import { pointAt, type Cx, type Resolved } from "../src/kernel/geom.js";
import { windingNumber } from "../src/kernel/winding.js";
import { resolveAll } from "../src/engine/contour/model.js";
import { circleTemplate, rectangleTemplate } from "../src/engine/contour/templates.js";

const frac = (n: number, d = 1): Frac => Frac.of(BigInt(n), BigInt(d));

const power = (id: string, at: Cx, n: number, d = 1): BranchPoint => ({
  id,
  at,
  order: { kind: "power", alpha: frac(n, d) },
  label: id,
});

const log = (id: string, at: Cx): BranchPoint => ({ id, at, order: { kind: "log" }, label: id });

const cut = (id: string, from: string, to: string, via: Cx[] = []): CutArc => ({ id, from, to, via });

const choice = (points: BranchPoint[], cuts: CutArc[]): BranchChoice => ({
  ...NO_BRANCH,
  points,
  cuts,
});

/** The first cut's polyline, failing the test rather than the type checker when there isn't one. */
function polyOf(b: BranchChoice, radius = 10): readonly Cx[] {
  const poly = cutPolyline(b, b.cuts[0], radius);
  if (poly === null) throw new Error("expected a cut polyline");
  return poly;
}

/** The Σα of the one bounded component, likewise. */
function boundedSum(r: AdmissibilityReport): Frac {
  const c = r.components.find((x) => !x.touchesInfinity);
  if (c === undefined || c.sum === null) throw new Error("expected one bounded component with a sum");
  return c.sum;
}

// ---------------------------------------------------------------------------------------------
// model
// ---------------------------------------------------------------------------------------------

describe("cutPolyline", () => {
  it("is the plain polyline when both endpoints are finite", () => {
    const b = choice([power("a", [-1, 0], 1, 2), power("b", [1, 0], 1, 2)], [cut("c", "a", "b")]);
    expect(cutPolyline(b, b.cuts[0], 10)).toEqual([
      [-1, 0],
      [1, 0],
    ]);
  });

  it("keeps the interior vertices, in order", () => {
    const b = choice(
      [power("a", [-1, 0], 1, 2), power("b", [1, 0], 1, 2)],
      [cut("c", "a", "b", [[0, 2]])],
    );
    expect(cutPolyline(b, b.cuts[0], 10)).toEqual([
      [-1, 0],
      [0, 2],
      [1, 0],
    ]);
  });

  it("clips a ray to infinity along the direction of its last edge", () => {
    // 0 → (1,0) → ∞ continues along +x, so the tip is on the positive real axis and beyond `radius`.
    const b = choice([power("o", [0, 0], 1, 2)], [cut("c", "o", INFINITY, [[1, 0]])]);
    const poly = polyOf(b);
    const tip = poly[poly.length - 1];
    expect(tip[1]).toBeCloseTo(0, 12);
    expect(tip[0]).toBeGreaterThan(10);
  });

  it("points a single-vertex ray away from the origin — the shadow-cut direction", () => {
    const b = choice([power("p", [3, 4], 1, 2)], [cut("c", "p", INFINITY)]);
    const poly = polyOf(b);
    const tip = poly[poly.length - 1];
    // Collinear with the origin and beyond the branch point.
    expect(tip[0] * 4 - tip[1] * 3).toBeCloseTo(0, 9);
    expect(Math.hypot(tip[0], tip[1])).toBeGreaterThan(5);
  });

  it("still produces a direction for a branch point sitting at the origin", () => {
    const b = choice([power("o", [0, 0], 1, 2)], [cut("c", "o", INFINITY)]);
    const poly = polyOf(b);
    expect(poly).toHaveLength(2);
    expect(Number.isFinite(poly[1][0])).toBe(true);
    expect(Math.hypot(poly[1][0], poly[1][1])).toBeGreaterThan(0);
  });

  it("prepends the ray when the cut STARTS at infinity", () => {
    const b = choice([power("o", [0, 0], 1, 2)], [cut("c", INFINITY, "o", [[-1, 0]])]);
    const poly = polyOf(b);
    expect(poly[poly.length - 1]).toEqual([0, 0]);
    expect(poly[0][0]).toBeLessThan(-10);
  });

  it("returns null for an endpoint that is not a declared branch point", () => {
    const b = choice([power("o", [0, 0], 1, 2)], [cut("c", "o", "ghost")]);
    expect(cutPolyline(b, b.cuts[0], 10)).toBeNull();
  });

  it("returns null for a cut with no finite vertex at all", () => {
    const b = choice([], [cut("c", INFINITY, INFINITY)]);
    expect(cutPolyline(b, b.cuts[0], 10)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// admissibility — research 06 §2.1
// ---------------------------------------------------------------------------------------------

describe("checkAdmissibility", () => {
  it("passes a rational integrand, which has nothing to place", () => {
    const r = checkAdmissibility(NO_BRANCH);
    expect(r.ok).toBe(true);
    expect(r.certificate.level).toBe("=");
    expect(r.components).toEqual([]);
  });

  describe("the keyhole — z^(α−1), branch points at 0 and ∞", () => {
    const origin = power("0", [0, 0], 1, 3);

    it("is admissible with the cut running to infinity, wherever it runs", () => {
      // The SAME branch choice with the cut along ℝ₋ and along ℝ₊: both legal. That is the lesson,
      // and it is why a cut is drawn as a draggable object rather than baked into the integrand.
      for (const via of [[[-1, 0]] as Cx[], [[1, 0]] as Cx[], [[0.3, 0.7]] as Cx[]]) {
        const r = checkAdmissibility(choice([origin], [cut("c", "0", INFINITY, via)]));
        expect(r.ok).toBe(true);
      }
    });

    it("refuses with no cut at all, and names the repair", () => {
      const r = checkAdmissibility(choice([origin], []));
      expect(r.ok).toBe(false);
      expect(r.failure).toBe("unplaced");
      expect(r.certificate.level).toBe("⚠");
      expect(r.repair).toMatch(/to infinity/);
    });

    it("has no bounded alternative: one non-integral point cannot close on itself", () => {
      // There is nothing else for the cut to reach, so `unplaced` is the only other outcome — the
      // engine is not free to invent a bounded component here.
      expect(checkAdmissibility(choice([origin], [])).failure).toBe("unplaced");
    });
  });

  describe("the dogbone — ((z−a)(z−b))^(−1/2)", () => {
    const a = power("a", [-1, 0], -1, 2);
    const b = power("b", [1, 0], -1, 2);

    it("is admissible as the single bounded arc a→b, because Σα = −1 ∈ ℤ", () => {
      const r = checkAdmissibility(choice([a, b], [cut("c", "a", "b")]));
      expect(r.ok).toBe(true);
      const bounded = r.components.filter((c) => !c.touchesInfinity);
      expect(bounded).toHaveLength(1);
      expect(bounded[0].sum?.equals(frac(-1))).toBe(true);
      expect(r.detail).toMatch(/\$\\sum\\alpha \\in \\mathbb\{Z\}\$/);
    });

    it("is ALSO admissible as two rays to infinity", () => {
      // Research 06 calls dragging between these two the single most valuable interaction in the
      // app. It only IS an interaction because both ends of the drag are legal.
      const r = checkAdmissibility(
        choice([a, b], [cut("l", "a", INFINITY, [[-2, 0]]), cut("r", "b", INFINITY, [[2, 0]])]),
      );
      expect(r.ok).toBe(true);
      expect(r.components.every((c) => c.touchesInfinity)).toBe(true);
    });

    it("refuses the bounded arc once the exponents no longer sum to an integer", () => {
      const r = checkAdmissibility(
        choice([power("a", [-1, 0], -1, 2), power("b", [1, 0], 1, 3)], [cut("c", "a", "b")]),
      );
      expect(r.ok).toBe(false);
      expect(r.failure).toBe("component-not-integral");
      expect(r.detail).toMatch(/-1\/6/);
    });

    it("refuses when only one of the two is placed", () => {
      const r = checkAdmissibility(choice([a, b], [cut("l", "a", INFINITY)]));
      expect(r.ok).toBe(false);
      expect(r.failure).toBe("unplaced");
      expect(r.detail).toMatch(/^b /);
    });
  });

  it("D6's √(1−z²): the two half-order points sum to 1 on a bounded cut", () => {
    const r = checkAdmissibility(
      choice([power("-1", [-1, 0], 1, 2), power("+1", [1, 0], 1, 2)], [cut("c", "-1", "+1")]),
    );
    expect(r.ok).toBe(true);
    expect(boundedSum(r).equals(frac(1))).toBe(true);
  });

  describe("D7 — z^μ(1−z)^ν, whose record states its own condition as μ + ν ∈ ℤ", () => {
    const at = (mu: [number, number], nu: [number, number]): BranchChoice =>
      choice(
        [power("0", [0, 0], mu[0], mu[1]), power("1", [1, 0], nu[0], nu[1])],
        [cut("c", "0", "1")],
      );

    it("agrees with the record where the condition holds", () => {
      // μ = −1/3, ν = 1/3 → sum 0; μ = 1/4, ν = 3/4 → sum 1; μ = 2/5, ν = 3/5 → sum 1.
      for (const [mu, nu] of [
        [[-1, 3], [1, 3]],
        [[1, 4], [3, 4]],
        [[2, 5], [3, 5]],
      ] as [[number, number], [number, number]][]) {
        expect(checkAdmissibility(at(mu, nu)).ok).toBe(true);
      }
    });

    it("and where it fails", () => {
      for (const [mu, nu] of [
        [[1, 3], [1, 3]],
        [[1, 2], [1, 3]],
        [[1, 4], [1, 4]],
      ] as [[number, number], [number, number]][]) {
        const r = checkAdmissibility(at(mu, nu));
        expect(r.ok).toBe(false);
        expect(r.failure).toBe("component-not-integral");
      }
    });

    it("is decided, not measured: 1/3 + 2/3 is an integer and 0.3333… + 0.6667 is not the question", () => {
      const r = checkAdmissibility(at([1, 3], [2, 3]));
      expect(r.ok).toBe(true);
      expect(boundedSum(r).d).toBe(1n);
    });
  });

  describe("logarithms", () => {
    it("are admissible on a cut that reaches infinity", () => {
      const r = checkAdmissibility(choice([log("0", [0, 0])], [cut("c", "0", INFINITY)]));
      expect(r.ok).toBe(true);
    });

    it("are refused on a bounded cut, however the exponents look", () => {
      const r = checkAdmissibility(
        choice([log("0", [0, 0]), log("1", [1, 0])], [cut("c", "0", "1")]),
      );
      expect(r.ok).toBe(false);
      expect(r.failure).toBe("log-bounded");
      expect(r.repair).toMatch(/infinite-order monodromy/);
    });

    it("poison the component's sum rather than contributing to it", () => {
      const r = checkAdmissibility(
        choice(
          [log("0", [0, 0]), power("1", [1, 0], 1, 2)],
          [cut("c", "0", "1"), cut("d", "1", INFINITY, [[2, 0]])],
        ),
      );
      expect(r.ok).toBe(true);
      expect(r.components).toHaveLength(1);
      expect(r.components[0].sum).toBeNull();
      expect(r.components[0].touchesInfinity).toBe(true);
    });

    it("do not slip through the integrality rule on the strength of a null sum", () => {
      // A log has no finite exponent, so the component's `Σα` is `null` — and `null` is the one value
      // the integrality test cannot answer. It must read as "bounded log", never as "nothing to
      // check": the component below is refused for the log, not waved through for having no sum.
      const r = checkAdmissibility(
        choice([log("0", [0, 0]), power("1", [1, 0], 1, 2)], [cut("c", "0", "1")]),
      );
      expect(r.failure).toBe("log-bounded");
      expect(r.components[0].sum).toBeNull();
    });
  });

  describe("structural refusals, before any rule reads the geometry", () => {
    it("rejects a cut naming an endpoint that does not exist", () => {
      const r = checkAdmissibility(choice([power("a", [0, 0], 1, 2)], [cut("c", "a", "nowhere")]));
      expect(r.failure).toBe("malformed");
      expect(r.detail).toMatch(/'nowhere'/);
    });

    it("rejects a loop of cuts: a cycle encircles a region rather than opening it", () => {
      const pts = [power("a", [0, 0], 1, 3), power("b", [1, 0], 1, 3), power("c", [0, 1], 1, 3)];
      const r = checkAdmissibility(
        choice(pts, [cut("1", "a", "b"), cut("2", "b", "c"), cut("3", "c", "a")]),
      );
      expect(r.failure).toBe("cycle");
    });

    it("counts two cuts from the same point to infinity as a cycle THROUGH infinity", () => {
      const r = checkAdmissibility(
        choice(
          [power("a", [0, 0], 1, 2)],
          [cut("1", "a", INFINITY, [[1, 0]]), cut("2", "a", INFINITY, [[-1, 0]])],
        ),
      );
      expect(r.failure).toBe("cycle");
    });
  });

  it("leaves an integral-exponent point alone: it is not a branch point at all", () => {
    // α = 2 is single-valued, so rule (a) has no claim on it and no cut is owed.
    const r = checkAdmissibility(choice([power("a", [0, 0], 2)], []));
    expect(r.ok).toBe(true);
  });

  it("reports each bounded component's sum in the certificate's provenance", () => {
    const r = checkAdmissibility(
      choice([power("a", [-1, 0], -1, 2), power("b", [1, 0], -1, 2)], [cut("c", "a", "b")]),
    );
    const lines = r.certificate.provenance;
    expect(lines.some((l) => /\\sum\\alpha = -1\/1 \\in \\mathbb\{Z\}/.test(l.text))).toBe(true);
    expect(lines.every((l) => l.ok)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// the continuous-argument lift
// ---------------------------------------------------------------------------------------------

/** `t ∈ [0,1]` walked across the pieces in order, one equal share of `t` each. */
const pathOf =
  (pieces: readonly Resolved[]) =>
  (t: number): Cx => {
    const n = pieces.length;
    const s = Math.min(Math.max(t, 0), 1) * n;
    const k = Math.min(Math.floor(s), n - 1);
    return pointAt(pieces[k], s - k);
  };

const TAU = 2 * Math.PI;

/** A circle of radius `r` about `centre`, traversed `k` times; `k < 0` reverses it. */
const spin =
  (k: number, r = 1, centre: Cx = [0, 0]) =>
  (t: number): Cx => [
    centre[0] + r * Math.cos(k * TAU * t),
    centre[1] + r * Math.sin(k * TAU * t),
  ];

describe("liftArgument", () => {
  it("follows a full turn to 2π and reports one turn", () => {
    const r = liftArgument(spin(1), [0, 0]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.delta).toBeCloseTo(TAU, 9);
    expect(r.turns).toBe(1);
    expect(r.residual).toBeLessThan(1e-9);
  });

  it("reverses sign with the orientation", () => {
    const r = liftArgument(spin(-1), [0, 0]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.delta).toBeCloseTo(-TAU, 9);
    expect(r.turns).toBe(-1);
  });

  it("accumulates CONTINUOUSLY — three turns is 6π, not 0 mod 2π", () => {
    const r = liftArgument(spin(3), [0, 0]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.delta).toBeCloseTo(3 * TAU, 8);
    expect(r.turns).toBe(3);
  });

  it("does not alias a turn count that resonates with the sampling", () => {
    // Each of these defeated an earlier version of the subdivision, and they are here in the order
    // they broke it. 17 turns aliases the whole-interval step test (the principal value of 17·2π/16
    // is π/8, comfortably inside the rule). 16 puts every first-pass sample on the SAME point, so
    // the step is 0 and a whole revolution is dropped sixteen times over. 32, 64 and 96 alias the
    // midpoints too — which is why the split is at the golden ratio rather than at 1/2, and which no
    // amount of further bisection would have fixed.
    for (const k of [8, 16, 17, 32, 64, 96]) {
      const r = liftArgument(spin(k), [0, 0]);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.turns).toBe(k);
      expect(r.delta).toBeCloseTo(k * TAU, 6);
    }
  });

  it("reports no turning about a point the loop does not enclose", () => {
    const r = liftArgument(spin(1), [5, 0]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.turns).toBe(0);
    expect(Math.abs(r.delta)).toBeLessThan(1e-9);
  });

  it("reports the residual honestly on an OPEN path, so a caller can see it did not close", () => {
    // A half-circle turns by π, which is as far from a multiple of 2π as it gets.
    const half = (t: number): Cx => [Math.cos(Math.PI * t), Math.sin(Math.PI * t)];
    const r = liftArgument(half, [0, 0]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.delta).toBeCloseTo(Math.PI, 9);
    expect(r.residual).toBeCloseTo(Math.PI, 9);
    expect(r.certificate.provenance.some((l) => !l.ok)).toBe(true);
  });

  it("is a bound, never an equality — it is a sampled continuation", () => {
    const r = liftArgument(spin(1), [0, 0]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.certificate.level).toBe("≤");
  });

  describe("refuses rather than inventing a number", () => {
    it("when the path starts at the branch point", () => {
      const r = liftArgument((t) => [t, 0], [0, 0]);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toMatch(/t = 0\.000000/);
      expect(r.certificate.level).toBe("⚠");
    });

    it("when the path runs THROUGH the branch point", () => {
      const r = liftArgument((t) => [2 * t - 1, 0], [0, 0]);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toMatch(/reaches the branch point/);
    });

    it("when the path passes within r_min, even without hitting it exactly", () => {
      const grazing = (t: number): Cx => [2 * t - 1, 1e-12];
      expect(liftArgument(grazing, [0, 0]).ok).toBe(false);
      // …and is followed happily once it clears the guard.
      const clear = (t: number): Cx => [2 * t - 1, 1e-3];
      expect(liftArgument(clear, [0, 0]).ok).toBe(true);
    });

    it("when the path turns faster than the sample ceiling can follow", () => {
      const r = liftArgument(spin(64), [0, 0], { maxSamples: 24 });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toMatch(/needs more than 24 samples/);
      expect(r.certificate.level).toBe("⚠");
    });
  });

  it("agrees with the exact-sign winding number on every closed contour we draw", () => {
    // The differential test that matters: `winding.ts` decides an integer by exact orientation
    // predicates; this decides one by following an angle. They are wholly different computations and
    // must not disagree — if they ever do, one of the two engines has a bug and the app would be
    // labelling a residue sum with the wrong coefficient.
    const cases: { pieces: Resolved[]; probes: Cx[] }[] = [
      { pieces: resolveAll(circleTemplate([0, 0], 2)), probes: [[0, 0], [1.5, 0], [0, -1.9], [3, 0], [0, 5]] },
      { pieces: resolveAll(circleTemplate([1, -1], 0.5)), probes: [[1, -1], [1.3, -1], [0, 0], [5, 5]] },
      {
        pieces: resolveAll(rectangleTemplate(-2, -1, 3, 4)),
        probes: [[0, 0], [-1.9, 3.9], [2.9, -0.9], [-3, 0], [0, 9], [2.5, 2.5]],
      },
    ];
    for (const { pieces, probes } of cases) {
      for (const p of probes) {
        const w = windingNumber(pieces, p);
        const l = liftArgument(pathOf(pieces), p);
        expect(w.decided).toBe(true);
        expect(l.ok).toBe(true);
        if (!w.decided || !l.ok) continue;
        expect(l.turns).toBe(w.n);
        expect(l.residual).toBeLessThan(1e-6);
      }
    }
  });

  it("agrees with it on a multiply-traversed circle too", () => {
    for (const k of [-3, -1, 2, 5]) {
      const pieces: Resolved[] = [
        { kind: "arc", center: [0, 0], radius: 1, theta0: 0, theta1: k * TAU },
      ];
      const w = windingNumber(pieces, [0.25, 0.1]);
      const l = liftArgument(pathOf(pieces), [0.25, 0.1]);
      expect(w.decided).toBe(true);
      expect(l.ok).toBe(true);
      if (!l.ok) continue;
      expect(l.turns).toBe(k);
      expect(w.n).toBe(k);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// crossing classification
// ---------------------------------------------------------------------------------------------

describe("classifyAgainstCut", () => {
  /** ℝ₊ as a cut from the origin out past everything. */
  const positiveAxis: Cx[] = [
    [0, 0],
    [100, 0],
  ];

  it("calls a segment well clear of the cut clear, and reports how clear", () => {
    const c = classifyAgainstCut("k", { kind: "segment", from: [-1, 2], to: [1, 2] }, positiveAxis, 10);
    expect(c.kind).toBe("clear");
    expect(c.nearest).toBeCloseTo(2, 9);
    expect(c.count).toBe(0);
  });

  it("decides a transversal crossing, and where", () => {
    const c = classifyAgainstCut("k", { kind: "segment", from: [3, -1], to: [3, 1] }, positiveAxis, 10);
    expect(c.kind).toBe("crosses");
    expect(c.count).toBe(1);
    expect(c.at?.[0]).toBeCloseTo(3, 9);
    expect(c.at?.[1]).toBeCloseTo(0, 9);
  });

  it("calls a segment lying IN the cut `along` — the keyhole's lip", () => {
    // Collinear with the cut. This is not a grazing contact and must not be refused: `model.ts` says
    // the `side` tag exists to pin "which limit is meant where the piece runs along a branch cut",
    // and the keyhole's two lips are exactly that. Calling it a refusal made tier D's flagship
    // contour illegal.
    const c = classifyAgainstCut("k", { kind: "segment", from: [1, 0], to: [4, 0] }, positiveAxis, 10);
    expect(c.kind).toBe("along");
    expect(needsSide(c.kind)).toBe(true);
  });

  it("does not call a segment merely POINTING at the cut `along`", () => {
    // Parallel but off the cut, and perpendicular meeting it at an end: neither lies in it.
    expect(
      classifyAgainstCut("k", { kind: "segment", from: [1, 0.5], to: [4, 0.5] }, positiveAxis, 10).kind,
    ).toBe("clear");
    expect(
      classifyAgainstCut("k", { kind: "segment", from: [2, 0], to: [2, 3] }, positiveAxis, 10).kind,
    ).toBe("endpoint");
  });

  it("keeps the two lips of a keyhole apart, however thin they are", () => {
    // The whole point of a keyhole: two segments hugging opposite sides of ℝ₊, neither crossing it.
    // They must classify as `clear` right down to the resolution floor, or the contour that MAKES the
    // tier-D keyhole integrals work would be refused as illegal.
    for (const eps of [1e-2, 1e-6, 1e-10]) {
      for (const s of [1, -1]) {
        const c = classifyAgainstCut(
          "k",
          { kind: "segment", from: [1, s * eps], to: [8, s * eps] },
          positiveAxis,
          10,
        );
        expect(c.kind).toBe("clear");
        expect(c.nearest).toBeCloseTo(eps, 12);
      }
    }
  });

  it("and refuses once they are closer than the geometry can resolve", () => {
    const c = classifyAgainstCut(
      "k",
      { kind: "segment", from: [1, 1e-15], to: [8, 1e-15] },
      positiveAxis,
      10,
    );
    expect(c.kind).toBe("touches");
  });

  describe("arcs, through the circle–line quadratic", () => {
    const arc = (theta0: number, theta1: number, radius = 2): Resolved => ({
      kind: "arc",
      center: [0, 0],
      radius,
      theta0,
      theta1,
    });

    it("crosses the cut once per full turn", () => {
      for (const k of [1, 2, 3]) {
        const c = classifyAgainstCut("k", arc(0.3, 0.3 + k * TAU), positiveAxis, 10);
        expect(c.kind).toBe("crosses");
        expect(c.count).toBe(k);
      }
    });

    it("does not cross when the whole arc stays off the cut", () => {
      const c = classifyAgainstCut("k", arc(Math.PI / 4, (3 * Math.PI) / 4), positiveAxis, 10);
      expect(c.kind).toBe("clear");
    });

    it("counts a crossing only where the cut actually reaches", () => {
      // A cut stopping short at |z| = 1 is not met by a circle of radius 2 at all.
      const short: Cx[] = [
        [0, 0],
        [1, 0],
      ];
      expect(classifyAgainstCut("k", arc(0.3, 0.3 + TAU), short, 10).kind).toBe("clear");
    });

    it("meets the cut at its own ENDS without crossing — the keyhole's outer circle", () => {
      // A 2π sweep starting and ending at z = 2, which is on the cut. As a path in ℂ∖Γ that is an arc
      // from the upper lip round to the lower one: it never crosses. Treating a closed sweep as
      // having no ends called this a crossing, and that made the keyhole illegal — what is actually
      // wrong with a bare circle here is that it encircles the branch point, which is the ledger's
      // winding row and not this predicate's business.
      for (const sweep of [TAU, (3 * Math.PI) / 2, Math.PI]) {
        const c = classifyAgainstCut("k", arc(0, sweep), positiveAxis, 10);
        expect(c.kind).toBe("endpoint");
        expect(needsSide(c.kind)).toBe(false);
      }
    });

    it("still crosses when the cut meets its INTERIOR", () => {
      // Half a turn from θ = π/2 to 3π/2 sweeps across ℝ₋, so a cut down the negative axis is met
      // well away from either end.
      const negativeAxis: Cx[] = [
        [0, 0],
        [-100, 0],
      ];
      const c = classifyAgainstCut("k", arc(Math.PI / 2, (3 * Math.PI) / 2), negativeAxis, 10);
      expect(c.kind).toBe("crosses");
      expect(c.count).toBe(1);
      expect(c.at?.[0]).toBeCloseTo(-2, 9);
    });

    it("refuses a tangency, where the crossing count is the question", () => {
      // The circle |z| = 2 touching the horizontal line y = 2 at one point: the discriminant is zero
      // and "does it cross" has no answer.
      const tangent: Cx[] = [
        [-5, 2],
        [5, 2],
      ];
      expect(classifyAgainstCut("k", arc(0, TAU), tangent, 10).kind).toBe("touches");
    });

    it("reports the closest approach for an arc that stays clear", () => {
      const c = classifyAgainstCut("k", arc(Math.PI / 4, (3 * Math.PI) / 4), positiveAxis, 10);
      expect(c.nearest).toBeCloseTo(Math.sqrt(2), 6);
    });
  });

  describe("a bend of the cut resting on the piece", () => {
    // The one degenerate case checked before every other predicate — which is what lets the rest of
    // them stay strict. A bend has no side, so a `side` tag would pin nothing there.
    it("is refused for a segment piece", () => {
      const bent: Cx[] = [
        [0, -3],
        [2, 0],
        [5, 3],
      ];
      const c = classifyAgainstCut("k", { kind: "segment", from: [1, 0], to: [4, 0] }, bent, 10);
      expect(c.kind).toBe("touches");
      expect(c.at).toEqual([2, 0]);
    });

    it("is refused for an arc piece", () => {
      // The bend at (0,2) is on the circle and is NOT where the arc begins, so there is no handover
      // to excuse it.
      const bent: Cx[] = [
        [0, 0],
        [0, 2],
        [3, 4],
      ];
      const circle: Resolved = { kind: "arc", center: [0, 0], radius: 2, theta0: 0, theta1: TAU };
      expect(classifyAgainstCut("k", circle, bent, 10).kind).toBe("touches");
    });

    it("but a bend at the piece's own END is the ordinary handover", () => {
      // The bend at (2,0) is exactly where this arc starts and finishes. That is one piece of a
      // contour meeting the next ON the cut, which is how a keyhole is built.
      const bent: Cx[] = [
        [0, 0],
        [2, 0],
        [4, 3],
      ];
      const circle: Resolved = { kind: "arc", center: [0, 0], radius: 2, theta0: 0, theta1: TAU };
      expect(classifyAgainstCut("k", circle, bent, 10).kind).toBe("endpoint");
    });

    it("but a bend merely NEAR the piece is decided as usual", () => {
      const bent: Cx[] = [
        [0, -3],
        [2, 1e-3],
        [5, 3],
      ];
      const c = classifyAgainstCut("k", { kind: "segment", from: [1, 0], to: [4, 0] }, bent, 10);
      expect(c.kind).toBe("crosses");
      expect(c.count).toBe(1);
    });

    it("and the branch point ON the contour is the same refusal", () => {
      // The cut's first vertex IS the branch point. A contour running through it is exactly the case
      // LEGALITY exists to stop, and it must not be reported as a tidy crossing.
      const fromOrigin: Cx[] = [
        [0, 0],
        [100, 0],
      ];
      const through: Resolved = { kind: "segment", from: [0, -1], to: [0, 1] };
      expect(classifyAgainstCut("k", through, fromOrigin, 10).kind).toBe("touches");
    });
  });

  it("walks every edge of a bent cut", () => {
    const bent: Cx[] = [
      [0, 0],
      [0, 3],
      [5, 3],
    ];
    const c = classifyAgainstCut("k", { kind: "segment", from: [2, 2], to: [2, 4] }, bent, 10);
    expect(c.kind).toBe("crosses");
    expect(c.count).toBe(1);
  });
});
