// **WHAT A CROSSING COSTS**, and the two halves of north-star #3.
//
// `kernel/branch/monodromy.ts` answers research 06 §3.2's contract — refuse the crossing or change
// sheet, "with the multiplicative factor shown" — and §3.4's insistence that BOTH forms appear,
// since a reader who only ever meets the reduced `e^{2πiα}` carries it over to an `x^s` integrand
// where the `−1` is not there to cancel. These pin the arithmetic and the two shapes.
import { describe, expect, it } from "vitest";
import { Frac, SqrtExt } from "@cas/exact";
import { INFINITY, type BranchChoice, type BranchPoint } from "../src/kernel/branch/model.js";
import {
  allCrossingMonodromy,
  crossingMonodromy,
  cutGeometryInvariance,
} from "../src/kernel/branch/monodromy.js";

const q = (n: bigint, d = 1n) => Frac.of(n, d);

const power = (id: string, at: [number, number], alpha: Frac): BranchPoint => ({
  id,
  at,
  order: { kind: "power", alpha },
  label: `z = ${at[0]}`,
});

/** One branch point at the origin, cut to infinity along `ℝ₊`. */
const keyhole = (alpha: Frac): BranchChoice => ({
  convention: "zeroToTwoPi",
  points: [power("b", [0, 0], alpha)],
  cuts: [{ id: "Γ", from: "b", to: INFINITY, via: [[1, 0]] }],
  basePoint: [0, 1],
  sheet: 0,
});

/** Two branch points joined by a bounded arc — the dogbone. */
const dogbone = (a: Frac, b: Frac): BranchChoice => ({
  convention: "zeroToTwoPi",
  points: [power("b1", [-1, 0], a), power("b2", [1, 0], b)],
  cuts: [{ id: "Γ", from: "b1", to: "b2", via: [] }],
  basePoint: [0, 1],
  sheet: 0,
});

const logged = (): BranchChoice => ({
  convention: "zeroToTwoPi",
  points: [{ id: "b", at: [0, 0], order: { kind: "log" }, label: "z = 0" }],
  cuts: [{ id: "Γ", from: "b", to: INFINITY, via: [[1, 0]] }],
  basePoint: [0, 1],
  sheet: 0,
});

describe("the multiplicative factor", () => {
  it("is e^(2πi·J) with J the arc's jump weight, and folds when 4J ∈ ℤ", () => {
    const m = crossingMonodromy(keyhole(q(1n, 2n)), "Γ");
    expect(m?.kind).toBe("multiplicative");
    if (m?.kind !== "multiplicative") return;
    expect(m.jump.equals(q(1n, 2n))).toBe(true);
    expect(m.literal).toBe("e^(2πi·1/2)");
    // `e^{iπ} = −1`, and the fold is `Exponent.asAlgebraicFactor`'s rather than a special case here.
    expect(m.value?.equals(SqrtExt.ONE.neg())).toBe(true);
    expect(m.detail).toContain("−1");
  });

  it("gives i at a quarter and −i at three quarters, by the same rule", () => {
    const at = (j: Frac): string => {
      const m = crossingMonodromy(keyhole(j), "Γ");
      return m?.kind === "multiplicative" && m.value !== null ? m.value.toTuple().join(",") : "carried";
    };
    expect(at(q(1n, 4n))).toBe("0,1");
    expect(at(q(3n, 4n))).toBe("0,-1");
  });

  it("CARRIES the factor rather than inventing a radical when 4J ∉ ℤ", () => {
    // `e^{2πi/3}` needs a cube root of unity, which is not in ℚ(i) and not in one quadratic
    // extension the coefficients may already be using — the same reason `asAlgebraicFactor` refuses
    // a quarter-integer `r`. Carrying it is the honest answer, not a shortfall.
    const m = crossingMonodromy(keyhole(q(1n, 3n)), "Γ");
    if (m?.kind !== "multiplicative") throw new Error("expected a multiplicative crossing");
    expect(m.value).toBeNull();
    expect(m.literal).toBe("e^(2πi·1/3)");
    expect((m.certificate.provenance ?? []).some((x) => x.text.includes("4J ∉ ℤ"))).toBe(true);
  });
});

describe("BOTH forms, which is research 06 §3.4's point and not a flourish", () => {
  it("prints the literal exponent AND the reduced one, and says why they agree", () => {
    // D1's integrand is `x^{α−1}`, so at α = 3/10 the jump weight is `−7/10` — the LITERAL form. The
    // textbook writes `e^{2πiα} = e^{2πi·3/10}`, the reduced one. Same number, because `e^{−2πi} = 1`.
    const m = crossingMonodromy(keyhole(q(-7n, 10n)), "Γ");
    if (m?.kind !== "multiplicative") throw new Error("expected a multiplicative crossing");
    expect(m.literal).toBe("e^(2πi·−7/10)");
    expect(m.reduced).toBe("e^(2πi·3/10)");
    const lines = (m.certificate.provenance ?? []).map((x) => x.text);
    expect(lines.some((t) => t.includes("e^(−2πi) = 1"))).toBe(true);
    expect(lines.some((t) => t.includes("the literal form is the one the integrand's exponent gives"))).toBe(true);
  });

  it("says so when J is already reduced, rather than printing the same thing twice", () => {
    const m = crossingMonodromy(keyhole(q(3n, 10n)), "Γ");
    if (m?.kind !== "multiplicative") throw new Error("expected a multiplicative crossing");
    expect(m.literal).toBe(m.reduced);
    expect(m.detail).not.toContain("with the integer part");
    expect((m.certificate.provenance ?? []).some((x) => x.text.includes("already reduced"))).toBe(true);
  });

  it("reduces a negative jump into [0,1) and not into (−1,0]", () => {
    const m = crossingMonodromy(keyhole(q(-1n, 3n)), "Γ");
    if (m?.kind !== "multiplicative") throw new Error("expected a multiplicative crossing");
    expect(m.reduced).toBe("e^(2πi·2/3)");
  });
});

describe("a log does not multiply", () => {
  it("reports an ADDITIVE crossing, with no factor to print", () => {
    const m = crossingMonodromy(logged(), "Γ");
    expect(m?.kind).toBe("additive");
    expect(m?.detail).toContain("ADDS 2πi");
    // The shapes are different on purpose: writing this as `exp(2πi·something)` is the type error
    // D4's own record warns about, and a `value: null` on a multiplicative result would let a
    // caller print "×1" for it.
    expect(m && "value" in m).toBe(false);
  });
});

describe("an integral jump weight is no crossing at all", () => {
  it("returns null, because a factor of 1 must not be announced as one", () => {
    // Research 06 §5.1: a candidate arc is a real cut iff its jump weight is ∉ ℤ. An integer
    // exponent is single-valued, so there is nothing there to cross.
    expect(crossingMonodromy(keyhole(q(2n)), "Γ")).toBeNull();
    expect(allCrossingMonodromy(keyhole(q(2n)))).toHaveLength(0);
  });

  it("and a cut that does not exist returns null rather than throwing", () => {
    expect(crossingMonodromy(keyhole(q(1n, 2n)), "not-a-cut")).toBeNull();
  });
});

describe("the dogbone's arc takes ONE side's exponent", () => {
  it("so its factor is α_{b₁}, not the sum — and the other side agrees modulo 1", () => {
    // `jumpWeights` walks the `from` side with the arc removed, so D6's arc carries `−1/2` rather
    // than `−1`. The other orientation gives `−1/2` too, and in general the two agree modulo 1
    // exactly when the sum is an integer — which is admissibility, so the FACTOR is well defined
    // whichever way the record wrote the arc.
    const one = crossingMonodromy(dogbone(q(-1n, 2n), q(-1n, 2n)), "Γ");
    if (one?.kind !== "multiplicative") throw new Error("expected a multiplicative crossing");
    expect(one.jump.equals(q(-1n, 2n))).toBe(true);
    expect(one.value?.equals(SqrtExt.ONE.neg())).toBe(true);

    const flipped = crossingMonodromy(
      { ...dogbone(q(-1n, 2n), q(-1n, 2n)), cuts: [{ id: "Γ", from: "b2", to: "b1", via: [] }] },
      "Γ",
    );
    if (flipped?.kind !== "multiplicative") throw new Error("expected a multiplicative crossing");
    expect(flipped.value?.equals(SqrtExt.ONE.neg())).toBe(true);
  });

  it("lists every cut, so a two-cut system does not have one of its answers chosen for it", () => {
    const two: BranchChoice = {
      ...dogbone(q(1n, 2n), q(1n, 4n)),
      cuts: [
        { id: "Γ1", from: "b1", to: INFINITY, via: [[-1, 0]] },
        { id: "Γ2", from: "b2", to: INFINITY, via: [[1, 0]] },
      ],
    };
    const all = allCrossingMonodromy(two);
    expect(all.map((m) => m.cut)).toEqual(["Γ1", "Γ2"]);
    expect(all.map((m) => (m.kind === "multiplicative" ? m.literal : "add"))).toEqual([
      "e^(2πi·1/2)",
      "e^(2πi·1/4)",
    ]);
  });
});

describe("the invariance certificate — north-star #3's first half", () => {
  it("says ∮ cannot see where an admissible cut runs, and why", () => {
    const c = cutGeometryInvariance(2);
    // `@cas/rigor`'s `Level` IS the glyph, branded so it cannot be written by hand — `exact()` is
    // the only way to obtain `=`, which is the whole point of the package. So this asserts that the
    // invariance is claimed at that strength, not that some renderer chose to draw it that way.
    expect(c.level).toBe("=");
    expect(c.claim).toContain("invariant under any deformation");
    // The REASON matters more than the claim: it is the correction's own definition, so the
    // invariance is a consequence of how the picture is computed rather than a separate assertion.
    expect(c.method).toContain("count of jump-weighted crossings");
    expect((c.provenance ?? []).some((x) => x.text.includes("2 cut(s)"))).toBe(true);
    expect((c.provenance ?? []).some((x) => x.text.includes("moves the picture's seam and not the answer"))).toBe(true);
  });
});
