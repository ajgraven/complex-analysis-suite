/**
 * Tier-1 (analytic / orbit-based) Julia-set properties. Oracles use known parameters of z²+c:
 * c=0 (unit disk: area π, dimension 1, superattracting), c=−1 (basilica, period-2), c=−0.5 (an
 * attracting fixed point in the cardioid), c=2 (escapes → Cantor, area 0). Also checks the monic
 * gating: an arbitrary / non-holomorphic f returns null for the capacity-based rows.
 */
import { describe, it, expect } from "vitest";
import type { Complex } from "../src/complex";
import { parse } from "@cas/expr/parser";
import {
  analyticAreaUpperBound,
  boundaryMask,
  boundingRadius,
  boxCountDimension,
  computeJuliaProperties,
  connectedComponents,
  connectivityVerdict,
  countInterior,
  detectSymmetries,
  dilateMask,
  estimateExtent,
  imageConnectivity,
  interiorMask,
  polynomialCapacity,
} from "../src/render/juliaProperties";

const F2 = parse("z^2+c");
const F3 = parse("z^3+c");
const ESC = parse("abs(z)>2");
const O: Complex = [0, 0];
const props = (degree: number | null, c: Complex, fAst = F2) =>
  computeJuliaProperties({ degree, c, fAst, escAst: ESC, criticalPoint: O, a: [0, 0] });

describe("boundingRadius (escape radius of z^d+c)", () => {
  it("d=2 closed form", () => {
    expect(boundingRadius(2, [0, 0])).toBeCloseTo(1, 12); // unit disk
    expect(boundingRadius(2, [2, 0])).toBeCloseTo(2, 12); // (1+√9)/2
    expect(boundingRadius(2, [0, 0.75])).toBeCloseTo((1 + Math.sqrt(1 + 3)) / 2, 12);
  });
  it("d=3 Newton root of R³ − R − |c| = 0", () => {
    const R = boundingRadius(3, [1.5, 0]);
    expect(Math.abs(R ** 3 - R - 1.5)).toBeLessThan(1e-9);
    expect(R).toBeGreaterThan(1);
  });
});

describe("analyticAreaUpperBound", () => {
  it("c=0 gives π (the unit disk: all b_k = 0)", () => {
    expect(analyticAreaUpperBound(2, [0, 0])).toBeCloseTo(Math.PI, 9);
  });
  it("is a monotone upper bound — more coefficients never increase it", () => {
    const c: Complex = [-0.2, 0.1];
    expect(analyticAreaUpperBound(2, c, 64)).toBeLessThanOrEqual(
      analyticAreaUpperBound(2, c, 8) + 1e-12,
    );
  });
  it("a connected non-trivial c has area in (0, π)", () => {
    const area = analyticAreaUpperBound(2, [-0.12, 0.74]); // rabbit
    expect(area).toBeGreaterThan(0);
    expect(area).toBeLessThan(Math.PI);
  });
});

describe("computeJuliaProperties — z²+c known parameters", () => {
  it("c=0: connected unit disk — period-1 superattracting, area π, dimension 1, capacity 1", () => {
    const p = props(2, [0, 0]);
    expect(p.degree).toBe(2);
    expect(p.connected).toBe(true);
    expect(p.escapes).toBe(false);
    expect(p.cycle?.period).toBe(1);
    expect(p.cycle?.multiplierMag ?? 9).toBeLessThan(1e-6); // superattracting
    expect(p.paramClass).toBe("hyperbolic");
    expect(p.lyapunov).toBe(-Infinity); // superattracting ⇒ −∞
    expect(p.analyticArea ?? 0).toBeCloseTo(Math.PI, 6);
    expect(p.smallCDimension ?? 0).toBeCloseTo(1, 9);
    expect(p.boundingRadius ?? 0).toBeCloseTo(1, 9);
    expect(p.capacity).toBe(1);
  });

  it("c=-1: connected basilica — period 2, area in (0, π), no small-c dimension", () => {
    const p = props(2, [-1, 0]);
    expect(p.connected).toBe(true);
    expect(p.cycle?.period).toBe(2);
    expect(p.analyticArea ?? -1).toBeGreaterThan(0);
    expect(p.analyticArea ?? 9).toBeLessThan(Math.PI);
    expect(p.smallCDimension).toBeNull(); // period 2 ≠ principal cardioid
  });

  it("c=-0.5: attracting fixed point in the cardioid — |λ|∈(0,1), λ_Lyap<0, small-c dim>1", () => {
    const p = props(2, [-0.5, 0]);
    expect(p.cycle?.period).toBe(1);
    expect(p.cycle?.multiplierMag ?? 9).toBeGreaterThan(0);
    expect(p.cycle?.multiplierMag ?? 9).toBeLessThan(1);
    expect(p.paramClass).toBe("hyperbolic");
    expect(p.lyapunov ?? 9).toBeLessThan(0); // attracting
    expect(p.smallCDimension ?? 0).toBeCloseTo(1 + 0.25 / (4 * Math.log(2)), 6);
  });

  it("z³+c: the small-c dimension is quadratic-only (null for d=3, even in its principal cardioid)", () => {
    const p = props(3, [0, 0], F3);
    expect(p.degree).toBe(3);
    expect(p.connected).toBe(true);
    expect(p.cycle?.period).toBe(1); // 0 is a superattracting fixed point of z³
    expect(p.smallCDimension).toBeNull(); // Ruelle asymptotic restricted to z²+c
    expect(p.capacity).toBe(1); // monic ⇒ capacity 1 (unaffected by the gate)
  });

  it("c=2: escapes → disconnected Cantor set, area 0", () => {
    const p = props(2, [2, 0]);
    expect(p.connected).toBe(false);
    expect(p.escapes).toBe(true);
    expect(p.paramClass).toBe("outside");
    expect(p.cycle).toBeNull();
    expect(p.lyapunov).toBeNull(); // escaping ⇒ reported via `escapes`
    expect(p.analyticArea).toBe(0);
    expect(p.smallCDimension).toBeNull();
    expect(p.boundingRadius ?? 0).toBeCloseTo(2, 9);
  });
});

describe("computeJuliaProperties — non-monic gating", () => {
  it("degree null (arbitrary f) hides the monic-only rows but keeps orbit facts", () => {
    const p = props(null, [-0.1, 0]); // holomorphic z²+c but treated as arbitrary
    expect(p.degree).toBeNull();
    expect(p.analyticArea).toBeNull(); // Gronwall bound needs the monic exterior coeffs
    expect(p.boundingRadius).toBeNull();
    expect(p.smallCDimension).toBeNull();
    expect(p.capacity ?? 9).toBeCloseTo(1, 3); // PR δ: z²+c is a polynomial ⇒ capacity 1
    expect(p.connected).toBe(true); // orbit-based facts still computed
    expect(typeof p.lyapunov).toBe("number"); // holomorphic ⇒ Lyapunov available
  });

  it("non-holomorphic f: |λ| and Lyapunov come from the real 2×2 Jacobian (PR β)", () => {
    // f = ½·conj(z): a linear non-holomorphic map, fixed point 0 with Jacobian [[.5,0],[0,−.5]].
    const linConj = parse("0.5*conjugate(z)");
    const p = props(null, [0, 0], linConj);
    expect(p.connected).toBe(true); // 0 is a bounded (fixed) orbit
    expect(p.cycle?.period).toBe(1); // cycle now found via the real-Jacobian multiplier
    expect(p.cycle?.multiplierMag ?? 9).toBeCloseTo(0.5, 6); // ρ of the Jacobian
    expect(p.paramClass).toBe("hyperbolic");
    expect(p.lyapunov ?? 9).toBeCloseTo(Math.log(0.5), 4); // attracting ⇒ ≈ −0.693
    expect(p.analyticArea).toBeNull(); // capacity-based rows still monic-gated
    expect(p.capacity).toBeNull();
  });
});

describe("Tier-2 image metrics (interior mask, pixel area, box-counting)", () => {
  it("pixel area: z²+c at c=0 fills the unit disk (area ≈ π)", () => {
    const size = 160;
    const H = 1; // window [-1,1]² bounds K_0 (the closed unit disk)
    const mask = interiorMask(F2, ESC, [0, 0], [0, 0], 0, 0, H, size, 120);
    const area = countInterior(mask) * ((2 * H) / size) ** 2;
    expect(Math.abs(area - Math.PI)).toBeLessThan(0.1);
  });

  it("interior mask is empty when the set is a Cantor dust (c=2)", () => {
    const mask = interiorMask(F2, ESC, [2, 0], [0, 0], 0, 0, 2, 64, 80);
    expect(countInterior(mask)).toBe(0);
  });

  it("box-counting dimension of a filled disk ≈ 1 (its boundary is a circle)", () => {
    const size = 256;
    const r = 90;
    const mid = size / 2;
    const disk = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if ((x - mid) ** 2 + (y - mid) ** 2 <= r * r) disk[y * size + x] = 1;
      }
    }
    const res = boxCountDimension(disk, size);
    expect(res).not.toBeNull();
    expect(res?.dimension ?? 9).toBeGreaterThan(0.85);
    expect(res?.dimension ?? 9).toBeLessThan(1.25);
    // The SE is reported, finite, and small (a smooth circle boundary fits the log–log line well).
    expect(res?.stderr ?? 9).toBeGreaterThanOrEqual(0);
    expect(res?.stderr ?? 9).toBeLessThan(0.5);
  });

  it("box-counting dimension is null for an empty mask", () => {
    expect(boxCountDimension(new Uint8Array(64 * 64), 64)).toBeNull();
  });

  it("boundaryMask marks interior cells touching the exterior or window edge", () => {
    // A full 3×3 mask: every cell but the centre sits on the window edge → 8 boundary cells.
    expect(countInterior(boundaryMask(new Uint8Array(9).fill(1), 3))).toBe(8);
    // A lone interior cell is entirely boundary.
    const one = new Uint8Array(9);
    one[4] = 1;
    expect(countInterior(boundaryMask(one, 3))).toBe(1);
  });
});

// --- PR α: bounding extent + measured symmetry (general f) ---------------------------------------

/** Synthetic filled disk of radius r centred at (cxp, cyp) on a size×size grid. */
const diskMask = (size: number, cxp: number, cyp: number, r: number): Uint8Array => {
  const m = new Uint8Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if ((x - cxp) ** 2 + (y - cyp) ** 2 <= r * r) m[y * size + x] = 1;
  return m;
};

/** `count` equal blobs of radius rb on a circle of radius R about the grid centre (n-fold by
 *  construction), the first at `baseDeg` degrees. */
const blobsMask = (
  size: number,
  R: number,
  rb: number,
  baseDeg: number,
  count: number,
): Uint8Array => {
  const m = new Uint8Array(size * size);
  const cg = (size - 1) / 2;
  const centres: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const t = ((baseDeg + (360 / count) * i) * Math.PI) / 180;
    centres.push([cg + R * Math.cos(t), cg + R * Math.sin(t)]);
  }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      for (const [bx, by] of centres)
        if ((x - bx) ** 2 + (y - by) ** 2 <= rb * rb) {
          m[y * size + x] = 1;
          break;
        }
  return m;
};

describe("estimateExtent (numerical bounding box of K_c)", () => {
  it("z²+c at c=0 bounds the unit disk: bbox ≈ [-1,1]², centred at 0, not clipped", () => {
    const ext = estimateExtent(F2, ESC, [0, 0], [0, 0], 0, 0, 2, 64, 100);
    expect(ext).not.toBeNull();
    if (!ext) return;
    expect(ext.bbox.xMin).toBeGreaterThan(-1.1);
    expect(ext.bbox.xMin).toBeLessThan(-0.85);
    expect(ext.bbox.xMax).toBeGreaterThan(0.85);
    expect(ext.bbox.xMax).toBeLessThan(1.1);
    expect(Math.abs(ext.cx)).toBeLessThan(0.08);
    expect(Math.abs(ext.cy)).toBeLessThan(0.08);
    expect(ext.clipped).toBe(false);
    expect(ext.halfWidth).toBeGreaterThan(1); // 10%-padded half-span of the unit disk
  });

  it("returns null when there is no bounded interior (c=2 escapes → Cantor dust)", () => {
    expect(estimateExtent(F2, ESC, [2, 0], [0, 0], 0, 0, 2, 64, 80)).toBeNull();
  });

  it("flags `clipped` when the set overruns the search window", () => {
    // A tiny window inside the c=0 disk: every border cell is interior ⇒ the box under-covers.
    const ext = estimateExtent(F2, ESC, [0, 0], [0, 0], 0, 0, 0.5, 32, 80);
    expect(ext?.clipped).toBe(true);
  });
});

describe("detectSymmetries (measured from a mask)", () => {
  it("a centred disk is fully symmetric (central, both axes, high-fold rotation)", () => {
    const s = detectSymmetries(diskMask(120, 60, 60, 40), 120);
    expect(s.central).toBe(true);
    expect(s.realAxis).toBe(true);
    expect(s.imagAxis).toBe(true);
    expect(s.rotation ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("three blobs at 120° → 3-fold rotational, not central", () => {
    const s = detectSymmetries(blobsMask(120, 34, 16, 90, 3), 120);
    expect(s.rotation).toBe(3);
    expect(s.central).toBe(false);
  });

  it("an off-centre blob has no symmetry", () => {
    const s = detectSymmetries(diskMask(120, 84, 72, 12), 120);
    expect(s.central).toBe(false);
    expect(s.realAxis).toBe(false);
    expect(s.imagAxis).toBe(false);
    expect(s.rotation).toBeNull();
  });

  it("z²+c (c real) Julia set: central + both mirrors, exactly 2-fold", () => {
    const mask = interiorMask(F2, ESC, [-0.5, 0], [0, 0], 0, 0, 1.5, 96, 120);
    const s = detectSymmetries(mask, 96);
    expect(s.central).toBe(true);
    expect(s.realAxis).toBe(true);
    expect(s.rotation).toBe(2);
  });

  it("z³+c (c real) Julia set: 3-fold + real-axis mirror, not central, no imag-axis mirror", () => {
    // c=0.3 deforms the set into a clear rounded triangle (small c stays near-circular → high-fold).
    const mask = interiorMask(F3, ESC, [0.3, 0], [0, 0], 0, 0, 1.5, 96, 160);
    const s = detectSymmetries(mask, 96);
    expect(s.rotation).toBe(3);
    expect(s.realAxis).toBe(true);
    expect(s.central).toBe(false);
    expect(s.imagAxis).toBe(false);
  });
});

// --- PR γ: image connectivity (connected components) --------------------------------------------

describe("connectedComponents + connectivityVerdict", () => {
  it("a single disk is one component (connected)", () => {
    const comp = connectedComponents(diskMask(120, 60, 60, 40), 120);
    expect(comp.nontrivial).toBe(1);
    expect(comp.largestFraction).toBeGreaterThan(0.99);
    expect(connectivityVerdict(comp, 120)).toBe("connected");
  });

  it("two separated disks → two components (disconnected)", () => {
    const m = diskMask(120, 32, 60, 16);
    const m2 = diskMask(120, 88, 60, 16);
    for (let i = 0; i < m.length; i++) if (m2[i]) m[i] = 1;
    const comp = connectedComponents(m, 120);
    expect(comp.nontrivial).toBe(2);
    expect(connectivityVerdict(comp, 120)).toBe("disconnected");
  });

  it("8-connectivity bridges diagonal touches (checkerboard = one component)", () => {
    const size = 16;
    const m = new Uint8Array(size * size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) if ((x + y) % 2 === 0) m[y * size + x] = 1;
    expect(connectedComponents(m, size, 1).count).toBe(1);
  });

  it("empty / speck-only masks read as 'empty'", () => {
    expect(connectivityVerdict(connectedComponents(new Uint8Array(64 * 64), 64), 64)).toBe("empty");
    const specks = new Uint8Array(64 * 64);
    specks[10] = 1;
    specks[2000] = 1; // isolated single cells (< minCells) ⇒ no substantial component
    expect(connectivityVerdict(connectedComponents(specks, 64), 64)).toBe("empty");
  });

  it("z²+c: filled disk (c=0) reads connected; Cantor dust (c=2) reads empty", () => {
    const disk = interiorMask(F2, ESC, [0, 0], [0, 0], 0, 0, 1.1, 96, 120);
    expect(connectivityVerdict(connectedComponents(disk, 96), 96)).toBe("connected");
    const dust = interiorMask(F2, ESC, [2, 0], [0, 0], 0, 0, 2.5, 96, 120);
    expect(connectivityVerdict(connectedComponents(dust, 96), 96)).toBe("empty");
  });
});

describe("imageConnectivity (pinch-bridged connectivity)", () => {
  const disk = (m: Uint8Array, size: number, cx: number, cy: number, r: number): void => {
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) m[y * size + x] = 1;
  };

  it("dilateMask grows a single cell to a (2r+1)² block", () => {
    const m = new Uint8Array(11 * 11);
    m[5 * 11 + 5] = 1;
    expect(countInterior(dilateMask(m, 11, 1))).toBe(9);
    expect(countInterior(dilateMask(m, 11, 2))).toBe(25);
  });

  it("bridges two pinch-close blobs into one, keeps far blobs apart", () => {
    const size = 96;
    const close = new Uint8Array(size * size);
    disk(close, size, 40, 48, 12);
    disk(close, size, 66, 48, 12); // ~2-cell gap (a pinch) ⇒ bridged
    expect(imageConnectivity(close, size).components).toBe(1);
    const far = new Uint8Array(size * size);
    disk(far, size, 20, 48, 10);
    disk(far, size, 76, 48, 10); // wide gap ⇒ genuinely separate
    expect(imageConnectivity(far, size).components).toBe(2);
  });

  it("the half-basilica 2z²−0.5 reads as connected (raw CCL splits its Fatou components)", () => {
    const mask = interiorMask(parse("2*z^2+c"), ESC, [-0.5, 0], [0, 0], 0, 0, 0.85, 128, 150);
    const r = imageConnectivity(mask, 128);
    expect(r.empty).toBe(false);
    expect(r.components).toBe(1); // bridging the measure-zero pinches rejoins the bulbs
  });

  it("empty interior → empty:true", () => {
    expect(imageConnectivity(new Uint8Array(64 * 64), 64).empty).toBe(true);
  });
});

// --- PR δ: capacity for polynomials -------------------------------------------------------------

describe("polynomialCapacity (cap = |a_d|^(−1/(d−1)))", () => {
  it("monic z^d+c has capacity 1", () => {
    expect(polynomialCapacity(F2, O, O) ?? 9).toBeCloseTo(1, 3);
    expect(polynomialCapacity(F3, O, [0.2, 0]) ?? 9).toBeCloseTo(1, 3);
  });

  it("non-monic polynomials: cap = |a_d|^(−1/(d−1))", () => {
    expect(polynomialCapacity(parse("2*z^2+c"), O, O) ?? 9).toBeCloseTo(0.5, 3); // |2|^(−1)
    expect(polynomialCapacity(parse("2*z^3+c"), O, O) ?? 9).toBeCloseTo(Math.SQRT1_2, 3); // |2|^(−1/2)
  });

  it("uses the live parameters a and c in the leading coefficient", () => {
    // logistic a·z(1−z) = a·z − a·z² ⇒ a_d = −a ⇒ cap = 1/|a|
    expect(polynomialCapacity(parse("a*z*(1-z)"), [2, 0], O) ?? 9).toBeCloseTo(0.5, 3);
    // c·z² ⇒ a_d = c ⇒ cap = 1/|c|
    expect(polynomialCapacity(parse("c*z^2"), O, [3, 0]) ?? 9).toBeCloseTo(1 / 3, 3);
  });

  it("is null for non-polynomial / non-holomorphic maps (capacity undefined)", () => {
    expect(polynomialCapacity(parse("exp(z)+c"), O, O)).toBeNull(); // transcendental
    expect(polynomialCapacity(parse("1/z+c"), O, O)).toBeNull(); // rational (degree < 2)
    expect(polynomialCapacity(parse("conjugate(z)^2+c"), O, O)).toBeNull(); // non-holomorphic
  });

  it("computeJuliaProperties exposes capacity for a non-monic polynomial f", () => {
    expect(props(null, [-0.1, 0], parse("2*z^2+c")).capacity ?? 9).toBeCloseTo(0.5, 3);
    expect(props(null, [0, 0], parse("exp(z)+c")).capacity).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// Honest labelling of connectivity (review 2026-07).
//
// `classifyOrbit` documents that "undetermined" is NOT a claim of boundedness — a slow escaper, a
// Siegel/irrational orbit, or a cycle past CLASSIFY_MAX_PERIOD all land there. computeJuliaProperties
// then derived `connected = !escapes`, which folded that unknown in with genuinely bounded orbits, and
// main.ts rendered the result as "connected (c ∈ Mandelbrot set)" — a membership claim the
// computation never established. `connectivityUndetermined` keeps the third state visible.
describe("connectivity honesty: undetermined is not connected", () => {
  it("a resolved interior c reports connected AND determined", () => {
    // c = −1 is the basilica: the critical orbit 0 → −1 → 0 closes at period 2, so the fate is
    // "periodic" and the verdict is a real determination, not a cap artifact.
    const p = props(2, [-1, 0]);
    expect(p.connected).toBe(true);
    expect(p.connectivityUndetermined).toBe(false);
    expect(p.cycle?.period).toBe(2);
  });

  it("an escaping c reports neither connected nor undetermined", () => {
    const p = props(2, [2, 0]);
    expect(p.escapes).toBe(true);
    expect(p.connected).toBe(false);
    expect(p.connectivityUndetermined).toBe(false);
  });

  it("`connected` alone cannot distinguish bounded from iteration-limited", () => {
    // The contract that makes the flag safe to consume: whenever the orbit is undetermined,
    // `connected` is nonetheless true — so any caller reading `connected` on its own is at risk of
    // presenting an unresolved orbit as set membership. This is the invariant the UI now respects.
    for (const c of [[-1, 0], [2, 0], [-0.5, 0], [0, 0], [0.25, 0], [-0.75, 0.1]] as Complex[]) {
      const p = props(2, c);
      if (p.connectivityUndetermined) expect(p.connected).toBe(true);
      expect(p.connected).toBe(!p.escapes);
    }
  });
});
