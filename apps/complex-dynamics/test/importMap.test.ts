import { describe, expect, it } from "vitest";
import {
  CANONICAL,
  SCHEMA_ID,
  VERSION,
  decodeLink,
  encodeLink,
  QD_TO_CD_DELTOID_LINK,
  QD_TO_CD_DELTOID_PHI_AT_2,
  type Envelope,
  type QuadratureDomain,
} from "@cas/interchange";
import type { Complex } from "../src/complex";
import { makeComplexFn } from "@cas/expr/evaluate";
import { parse } from "@cas/expr/parser";
import { envelopeToMapSpec, mapSpecToExpr } from "../src/interchange/importMap";

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
