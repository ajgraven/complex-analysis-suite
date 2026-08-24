import { describe, it, expect, beforeAll } from "vitest";
import { Complex as K, type Cx } from "@cas/core";
import {
  makeUnboundedLaurentSchwarz,
  makeBoundedSchwarz,
  type Complex as Tuple,
  type SchwarzBranch,
} from "@cas/schwarz";

// Differential drift-guard: QD's schwarz-common.mjs σ vs @cas/schwarz's σ (ADR-0026 Action Item 2).
//
// WHY THIS EXISTS — the classical Schwarz kernel is implemented TWICE:
//
//   @cas/schwarz reconstructs σ(w) = conj(F(φ⁻¹(w))) from a closed-form φ (the QD → CD hand-off,
//   ADR-0009). QD's own app/schwarz/schwarz-common.mjs builds σ for the SAME classical bounded +
//   unbounded-Laurent families — the byte-for-byte same kernel — and QD does NOT depend on
//   @cas/schwarz. ADR-0026 accepted that duplication *for now* (no second consumer for QD's weighted
//   families yet), but it is only safe while the two engines agree: the moment a σ fix lands in one
//   and not the other, one of them is quietly wrong about a map every CD/Correspondences escape-time
//   figure is drawn from, and nothing notices — the "plausible-but-wrong figure, no error signal"
//   landmine (RISKS.md §2). ADR-0026 §Trade-off promised "a differential test turns silent drift into
//   a red build"; Action Item 2 was open. This is that test. (@cas/schwarz is a QD devDependency
//   solely so both engines load into one process — QD's runtime still ships schwarz-common.mjs
//   unchanged, exactly as exact-symcore-differential.test.ts added @cas/exact for the ADR-0008 guard.)
//
// WHAT MAKES THIS A REAL TEST, NOT A TAUTOLOGY:
//
//   σ is floating-point Newton on both sides, so a pure "engine A ≈ engine B" check would PASS if
//   both drift the same way (a shared conceptual error). So every grid point is a THREE-way check
//   against an INDEPENDENT reference σ built here from @cas/core object-arithmetic — a third code
//   path — and that reference is itself pinned at each family's golden (w₀, σ(w₀)) point, whose value
//   was hand-derived in packages/interchange/src/goldens.ts via σ(φ(z₀)) = conj(F(z₀)). If all three
//   agree AND agree with the human-derived golden, no single implementation is silently wrong.
//
//   BRANCH SELECTION: σ is multivalued (φ⁻¹ has many preimages). To compare the SAME branch without a
//   seeding fight, each grid w is GENERATED as w = φ(z) from a known preimage z — exterior (|z|>1) for
//   the unbounded families, interior (|z|<1) for the bounded one — the region each engine's own
//   accept-z predicate already selects. Both engines then invert w back to that branch, and the
//   reference is evaluated at that same z. The near-boundary multivalued region is deliberately out of
//   scope for this guard.

const cpx = (re: number, im = 0): Cx => ({ re, im });
const tup = (z: Cx): Tuple => [z.re, z.im];
const fromTuple = (t: Tuple): Cx => ({ re: t[0], im: t[1] });
const near = (a: Cx, b: Cx, tol: number): boolean =>
  Math.hypot(a.re - b.re, a.im - b.im) < tol;

// z/(1 − z_j·z) — the finite-pole basis u_j(z), shared by both families' branch terms.
const uBasis = (z: Cx, zj: Cx): Cx => K.div(z, K.sub(cpx(1), K.mul(zj, z)));

interface Recipe {
  name: string;
  qdPhi: unknown; // hand-built QD phi (loose — QD is untyped)
  pkg: { sigma(w: Tuple): Tuple | null };
  phiRef(z: Cx): Cx; // independent forward map
  sigmaRef(z: Cx): Cx; // independent σ = conj(F(z))
  seeds: Cx[]; // grid of preimages z on the correct branch
  golden: { z0: Cx; w0: Cx; s0: Cx };
}

// A ring of preimages at several angles and radii — the differential grid for one family.
function ring(radii: number[], angles: number[]): Cx[] {
  const out: Cx[] = [];
  for (const r of radii) for (const a of angles) out.push({ re: r * Math.cos(a), im: r * Math.sin(a) });
  return out;
}
const ANGLES = [0.3, 1.1, 2.0, 2.9, 3.8, 4.7, 5.6];

let buildSchwarzFromPhi: (phi: unknown, hData: unknown, boundaryPts: unknown) => any;

beforeAll(async () => {
  // Load the FULL solver graph first: it populates the shared QD namespace with QD.Complex AND the
  // family commons (QD.LqdCommon, …) that schwarz-common reads at load. Only then import the Schwarz
  // worker entry, which registers QD.Schwarz.buildSchwarzFromPhi. This is the ordering
  // worker-entry.test.ts uses ("schwarz worker entry wires the Schwarz kernel onto QD"); its
  // `typeof self` guard makes the worker module inert under Node.
  const QD: any = (await import("../app/workers/solver-graph.mjs")).default;
  await import("../app/workers/schwarz-worker-entry.mjs");
  buildSchwarzFromPhi = QD.Schwarz.buildSchwarzFromPhi;
});

function recipes(): Recipe[] {
  // --- Deltoid φ(z) = z + ½/z²  (unbounded, pole-free; c=1, F=[0,0,½]) ------------------------------
  const deltoid: Recipe = {
    name: "deltoid (unbounded, pole-free)",
    qdPhi: { unbounded: true, c: 1, F: [cpx(0), cpx(0), cpx(0.5)] },
    pkg: makeUnboundedLaurentSchwarz(1, [
      [0, 0],
      [0, 0],
      [0.5, 0],
    ]),
    phiRef: (z) => K.add(z, K.scale(K.inv(K.mul(z, z)), 0.5)), // z + ½/z²
    sigmaRef: (z) => K.conj(K.add(K.inv(z), K.scale(K.mul(z, z), 0.5))), // conj(1/z + ½z²)
    seeds: ring([1.4, 2.0, 3.0], ANGLES),
    // goldens.ts: z₀ = 1+i ⇒ w₀ = 1 + 0.75i, σ(w₀) = 0.5 − 0.5i (exercises the anti-holo conj).
    golden: { z0: cpx(1, 1), w0: cpx(1, 0.75), s0: cpx(0.5, -0.5) },
  };

  // --- Single exterior pole  (unbounded; c=1, one order-1 branch z_j=0.2, A=[0.3]) -----------------
  const zjP = cpx(0.2);
  const pole: Recipe = {
    name: "single exterior pole (unbounded, pole-bearing)",
    qdPhi: { unbounded: true, c: 1, F: [], branches: [{ z: cpx(0.2), A: [cpx(0.3)] }] },
    pkg: makeUnboundedLaurentSchwarz(1, [], [{ z: [0.2, 0], A: [[0.3, 0]] }] as SchwarzBranch[]),
    phiRef: (z) => K.add(z, K.scale(uBasis(z, zjP), 0.3)), // z + 0.3·u
    sigmaRef: (z) => K.conj(K.add(K.inv(z), K.scale(K.inv(K.sub(z, zjP)), 0.3))), // conj(1/z + 0.3/(z−0.2))
    seeds: ring([1.4, 2.0, 3.0], ANGLES),
    // goldens.ts: z₀ = 2 ⇒ w₀ = 3, σ(w₀) = 2/3 (the value that PINS the branch: pole-free φ=z gives 1/3).
    golden: { z0: cpx(2), w0: cpx(3), s0: cpx(2 / 3) },
  };

  // --- Bounded single lobe  (bounded; w₀=0, one branch z_j=0.3, A=[0.5]) ---------------------------
  const zjB = cpx(0.3);
  const bounded: Recipe = {
    name: "bounded single lobe",
    qdPhi: { unbounded: false, w0: cpx(0), branches: [{ z: cpx(0.3), A: [cpx(0.5)] }] },
    pkg: makeBoundedSchwarz([0, 0], [{ z: [0.3, 0], A: [[0.5, 0]] }] as SchwarzBranch[]),
    phiRef: (z) => K.scale(uBasis(z, zjB), 0.5), // ½·u
    sigmaRef: (z) => K.conj(K.scale(K.inv(K.sub(z, zjB)), 0.5)), // conj(0.5/(z−0.3))
    seeds: ring([0.2, 0.45, 0.7], ANGLES),
    // goldens.ts: z₀ = ½ ⇒ w = 5/17, σ(w) = 2.5.
    golden: { z0: cpx(0.5), w0: cpx(5 / 17), s0: cpx(2.5) },
  };

  return [deltoid, pole, bounded];
}

const VALUE_TOL = 1e-8; // both engines are Newton at tol 1e-12; a decade of headroom for the branch sum
const GOLDEN_TOL = 1e-9;

describe("Schwarz σ differential — schwarz-common.mjs vs @cas/schwarz (ADR-0026)", () => {
  for (const r of recipes()) {
    describe(r.name, () => {
      let qd: { sigma(w: Cx, seed?: Cx): { re: number; im: number } | null };

      beforeAll(() => {
        qd = buildSchwarzFromPhi(r.qdPhi, null, []);
        expect(qd, "QD buildSchwarzFromPhi returned a handle").toBeTruthy();
      });

      it("the independent reference reproduces the hand-derived golden (self-check)", () => {
        // If this fails, the in-test reference is wrong and every downstream comparison is void.
        expect(near(r.phiRef(r.golden.z0), r.golden.w0, 1e-12)).toBe(true);
        expect(near(r.sigmaRef(r.golden.z0), r.golden.s0, 1e-12)).toBe(true);
      });

      it("both engines reproduce the golden σ(w₀)", () => {
        const p = r.pkg.sigma(tup(r.golden.w0));
        const q = qd.sigma(r.golden.w0);
        expect(p, "@cas/schwarz σ(w₀) is finite").not.toBeNull();
        expect(q, "schwarz-common σ(w₀) is finite").not.toBeNull();
        expect(near(fromTuple(p!), r.golden.s0, GOLDEN_TOL)).toBe(true);
        expect(near({ re: q!.re, im: q!.im }, r.golden.s0, GOLDEN_TOL)).toBe(true);
      });

      it("both engines agree with the reference across the differential grid", () => {
        expect(r.seeds.length).toBeGreaterThan(0);
        const disagreements: string[] = [];
        for (const z of r.seeds) {
          const w = r.phiRef(z);
          const ref = r.sigmaRef(z);
          const p = r.pkg.sigma(tup(w));
          const q = qd.sigma(w);
          // Domain agreement: both engines must accept a point known to be on the branch.
          if (p === null || q === null) {
            disagreements.push(`  z=${fmt(z)} w=${fmt(w)}: null from ${p === null ? "@cas/schwarz" : ""}${
              q === null ? " schwarz-common" : ""
            }`);
            continue;
          }
          const pc = fromTuple(p);
          const qc = { re: q.re, im: q.im };
          if (!near(pc, ref, VALUE_TOL) || !near(qc, ref, VALUE_TOL)) {
            disagreements.push(
              `  z=${fmt(z)} w=${fmt(w)}: ref=${fmt(ref)} pkg=${fmt(pc)} qd=${fmt(qc)}`,
            );
          }
        }
        expect(
          disagreements,
          disagreements.length === 0
            ? ""
            : `σ drift between schwarz-common.mjs and @cas/schwarz (ADR-0026): the two engines no ` +
                `longer agree with the independent reference. A σ fix likely landed in one and not the ` +
                `other — reconcile them (ADR-0026 §Consequences).\n${disagreements.join("\n")}`,
        ).toHaveLength(0);
      });
    });
  }
});

function fmt(z: Cx): string {
  return `${z.re.toFixed(6)}${z.im >= 0 ? "+" : "−"}${Math.abs(z.im).toFixed(6)}i`;
}
