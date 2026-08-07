import { describe, expect, it } from "vitest";
import {
  CANONICAL,
  SCHEMA_ID,
  VERSION,
  decodeLink,
  encodeLink,
  QD_TO_CD_DELTOID_LINK,
  QD_TO_CD_DELTOID_PHI_AT_2,
  QD_TO_CD_DELTOID_SIGMA_LINK,
  QD_TO_CD_DELTOID_SIGMA_W0,
  QD_TO_CD_DELTOID_SIGMA_AT_W0,
  type Envelope,
  type QuadratureDomain,
} from "@cas/interchange";
import type { Complex } from "../src/complex";
import { makeComplexFn } from "@cas/expr/evaluate";
import { parse } from "@cas/expr/parser";
import { envelopeToMapSpec, mapSpecToExpr, schwarzEngineFromMapSpec } from "../src/interchange/importMap";

// Phase 4 (C3, CD consume): the QD -> CD path, end to end and headless. An interchange link (as
// QD's "Export map" button produces) is decoded, its MapSpec turned into a CD expr string, compiled
// through CD's REAL expr pipeline (parser -> evaluate), and evaluated — proving CD can consume and
// render an imported map. Uses the deltoid φ = z + 1/(2z²). (The WebGL render itself is CD's
// existing machinery; here we verify the compile + numeric evaluation, which needs no GPU.)

const deltoidPhi = {
  form: "laurent" as const,
  c: { re: 1, im: 0 },
  F: [{ re: 0, im: 0 }, { re: 0, im: 0 }, { re: 0.5, im: 0 }],
};

function qdStyleLink(): string {
  const env: Envelope<"quadrature-domain"> = {
    schema: SCHEMA_ID,
    version: VERSION,
    kind: "quadrature-domain",
    payload: { phi: deltoidPhi, bounded: false, conventions: CANONICAL } as QuadratureDomain,
    provenance: { app: "quadrature-domains", appVersion: "0.1.0", createdAt: "2026-07-06T00:00:00Z" },
  };
  return encodeLink(env);
}

describe("CD consume interchange map (Phase 4 C3)", () => {
  it("compiles the deltoid LaurentMap through CD's expr and matches φ", () => {
    const f = makeComplexFn(parse(mapSpecToExpr(deltoidPhi)));
    // φ(2) = 2 + 0.5/4 = 2.125
    let v: Complex = f([2, 0], [0, 0]);
    expect(v[0]).toBeCloseTo(2.125, 12);
    expect(v[1]).toBeCloseTo(0, 12);
    // φ(i) = i + 0.5/i² = -0.5 + i
    v = f([0, 1], [0, 0]);
    expect(v[0]).toBeCloseTo(-0.5, 12);
    expect(v[1]).toBeCloseTo(1, 12);
  });

  it("full round-trip: QD-style deep link -> decode -> extract map -> expr -> compile -> evaluate", () => {
    const env = decodeLink(qdStyleLink());
    expect(env.kind).toBe("quadrature-domain");
    const spec = envelopeToMapSpec(env); // a quadrature-domain hands off its φ
    expect(spec).toEqual(deltoidPhi);
    if (!spec) throw new Error("expected a map spec");
    const v: Complex = makeComplexFn(parse(mapSpecToExpr(spec)))([2, 0], [0, 0]);
    expect(v[0]).toBeCloseTo(2.125, 12);
    expect(v[1]).toBeCloseTo(0, 12);
  });

  it("compiles a rational MapSpec num/den (φ = z/(1+z²))", () => {
    const src = mapSpecToExpr({
      form: "rational",
      num: [{ re: 0, im: 0 }, { re: 1, im: 0 }],
      den: [{ re: 1, im: 0 }, { re: 0, im: 0 }, { re: 1, im: 0 }],
    });
    const v: Complex = makeComplexFn(parse(src))([1, 0], [0, 0]);
    // φ(1) = 1/(1+1) = 0.5
    expect(v[0]).toBeCloseTo(0.5, 12);
    expect(v[1]).toBeCloseTo(0, 12);
  });

  // S0b (SIGMA-HANDOFF): an `antiholomorphic` MapSpec acts on conj(z) — mapSpecToExpr must build it
  // on conjugate(z), not z, or CD renders the holomorphic twin. (Latent until a σ / anti-map is emitted.)
  it("honors the antiholomorphic flag — a laurent map so tagged acts on conj(z)", () => {
    // φ = 1·z tagged antiholomorphic ⇒ conjugate(z). At z = 2 − 3i, conj(z) = 2 + 3i.
    const src = mapSpecToExpr({ form: "laurent", c: { re: 1, im: 0 }, F: [], antiholomorphic: true });
    const v: Complex = makeComplexFn(parse(src))([2, -3], [0, 0]);
    expect(v[0]).toBeCloseTo(2, 12);
    expect(v[1]).toBeCloseTo(3, 12); // conj(2 − 3i) = 2 + 3i (the holomorphic twin would give −3)
  });

  // The CONSUMER half of the QD -> CD contract (qd-interchange-e2e-08). Everything above decodes an
  // envelope THIS FILE built — self-consistency, not interoperability: QD's exporter could have
  // drifted (a renamed field, a reordered F, a changed `bounded` sense) and these tests would stay
  // green against a literal no exporter had emitted in months.
  //
  // This one consumes the real wire artifact. The link is not hand-written here — it is the exact
  // string QD's `exportPhiLink` produces, asserted on the QD side in
  // apps/quadrature-domains/vitest/schwarz-export.test.ts and stored in @cas/interchange because
  // the dependency rule (ARCHITECTURE.md §4) forbids either app importing the other, so the shared
  // package is the only place the two suites can meet. Regenerating the golden to satisfy QD makes
  // CD consume the NEW bytes on the next run, which is the point: an incompatibility fails here
  // instead of hiding in a stale duplicate.
  it("consumes the exact link QD's exporter emits (cross-app golden)", () => {
    const env = decodeLink(QD_TO_CD_DELTOID_LINK);
    expect(env.kind).toBe("quadrature-domain");
    expect(env.provenance.app).toBe("quadrature-domains");
    const spec = envelopeToMapSpec(env);
    if (!spec) throw new Error("expected a map spec from the QD golden link");
    // Straight through CD's real path: MapSpec -> expr string -> parse -> compile -> evaluate.
    const v: Complex = makeComplexFn(parse(mapSpecToExpr(spec)))([2, 0], [0, 0]);
    expect(v[0]).toBeCloseTo(QD_TO_CD_DELTOID_PHI_AT_2, 12);
    expect(v[1]).toBeCloseTo(0, 12);
  });

  // The interchange `schwarz` form is a σ RECIPE, not an algebraic expression — σ has a numerical
  // inverse (φ⁻¹ via Newton/Durand–Kerner), so it can't compile through the expr pipeline. mapSpecToExpr
  // must reject it LOUDLY (not silently return undefined → a cryptic downstream crash when main.ts sets
  // inpf = undefined). envelopeToMapSpec still surfaces the recipe so main.ts can recognize it and route
  // it to schwarzEngineFromMapSpec (the next test) instead of the expr path — which is what S4a shipped.
  it("rejects a schwarz-form map from the expr path; surfaces the σ recipe from its envelope", () => {
    const sigma = { form: "schwarz" as const, phi: deltoidPhi, disk: "D*" as const, inverse: "newton-dk" as const, antiholomorphic: true as const };
    expect(() => mapSpecToExpr(sigma)).toThrow(/not expr-compilable/);
    const spec = envelopeToMapSpec(decodeLink(QD_TO_CD_DELTOID_SIGMA_LINK));
    expect(spec?.form).toBe("schwarz"); // the recipe is surfaced (not null, not silently dropped)
  });

  // S4a (SIGMA-HANDOFF, the approved end-state): CD RECONSTRUCTS σ from the golden's recipe, rather than
  // declining it. σ is not expr-compilable (numerical inverse), so it is rebuilt from sigma.phi via
  // @cas/schwarz — and the reconstructed σ(w₀) reproduces the frozen golden value END TO END through CD's
  // real import path (decode → envelopeToMapSpec → schwarzEngineFromMapSpec → .sigma). This is the
  // ground-truth net the whole hand-off was built to reach.
  it("reconstructs the deltoid σ from the golden and reproduces the frozen σ(w₀) — S4a ground truth", () => {
    const sigma = envelopeToMapSpec(decodeLink(QD_TO_CD_DELTOID_SIGMA_LINK));
    if (!sigma || sigma.form !== "schwarz") throw new Error("expected a schwarz map from the σ golden link");
    const engine = schwarzEngineFromMapSpec(sigma);
    const got = engine.sigma([QD_TO_CD_DELTOID_SIGMA_W0.re, QD_TO_CD_DELTOID_SIGMA_W0.im]);
    if (!got) throw new Error("σ(w₀) should reconstruct to a finite value for w₀ ∈ Ω, not null");
    expect(got[0]).toBeCloseTo(QD_TO_CD_DELTOID_SIGMA_AT_W0.re, 9); //  0.5
    expect(got[1]).toBeCloseTo(QD_TO_CD_DELTOID_SIGMA_AT_W0.im, 9); // −0.5 (the anti-holomorphic conj)
  });

  it("emits complex coefficients with the imaginary unit", () => {
    // φ = i·z: LaurentMap c = i, no tail. φ(1) = i.
    const v: Complex = makeComplexFn(parse(mapSpecToExpr({ form: "laurent", c: { re: 0, im: 1 }, F: [] })))(
      [1, 0],
      [0, 0],
    );
    expect(v[0]).toBeCloseTo(0, 12);
    expect(v[1]).toBeCloseTo(1, 12);
  });
});
