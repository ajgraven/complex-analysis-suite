import { describe, expect, it } from "vitest";
import {
  decodeLink,
  isEnvelopeOfKind,
  validateEnvelope,
  GOLDEN_CREATED_AT,
  QD_TO_CD_DELTOID_LINK,
  QD_TO_CD_DELTOID_SIGMA_LINK,
  QD_TO_CD_SINGLE_POLE_SIGMA_LINK,
  QD_TO_CD_BOUNDED_LOBE_SIGMA_LINK,
} from "@cas/interchange";
import {
  buildExportEnvelope,
  buildSigmaEnvelope,
  classifyPhiForExport,
  explainPhiUnavailable,
  explainSigmaUnavailable,
  exportPhiLink,
  exportSigmaLink,
  phiToMapSpec,
} from "../app/schwarz/schwarz-export.mjs";

// Phase 4 (C2, QD emit): the φ -> interchange serialization + a full round-trip through the
// @cas/interchange codec/validator. Confirms the QD side produces a valid, decodable envelope.

const C = (re: number, im = 0) => ({ re, im });

// The deltoid φ(ζ) = ζ + 1/(2ζ²): unbounded, c = 1, polyA = [F_0, F_1, F_2] = [0, 0, 1/2].
const deltoidPhi = { unbounded: true, c: 1, polyA: [C(0), C(0), C(0.5)], branches: [] };
// A direct-tab rational φ = z / (1 + z²).
const rationalPhi = { P: [C(0), C(1)], Q: [C(1), C(0), C(1)] };

describe("QD φ -> interchange (Phase 4 C2)", () => {
  it("serializes the deltoid as a LaurentMap", () => {
    expect(phiToMapSpec(deltoidPhi)).toEqual({ form: "laurent", c: C(1), F: [C(0), C(0), C(0.5)] });
  });

  it("serializes a direct rational φ as a RationalMap", () => {
    expect(phiToMapSpec(rationalPhi)).toEqual({ form: "rational", num: [C(0), C(1)], den: [C(1), C(0), C(1)] });
  });

  it("returns null for a family not yet closed-form-exportable (e.g. bounded classical)", () => {
    expect(phiToMapSpec({ w0: C(0), branches: [{ z: C(0.5), A: [C(1)] }] })).toBeNull();
  });

  it("builds a valid quadrature-domain envelope, tagged CANONICAL, bounded flag from φ", () => {
    const env = buildExportEnvelope(deltoidPhi, { createdAt: "2026-07-06T00:00:00Z", appVersion: "0.1.0" });
    expect(env).not.toBeNull();
    const validated = validateEnvelope(env); // throws if malformed
    expect(isEnvelopeOfKind(validated, "quadrature-domain")).toBe(true);
    expect(env!.payload.bounded).toBe(false); // deltoid is unbounded
    expect(env!.payload.conventions).toEqual({ area: "standard", contour: "standard" });
    expect(env!.provenance.app).toBe("quadrature-domains");
  });

  it("round-trips through the deep-link codec (QD encode -> interchange decode)", () => {
    const link = exportPhiLink(rationalPhi, { createdAt: "2026-07-06T00:00:00Z" });
    expect(link!.startsWith("#s=")).toBe(true);
    const back = decodeLink(link!);
    expect(back.kind).toBe("quadrature-domain");
    expect((back.payload as { phi: unknown }).phi).toEqual({ form: "rational", num: [C(0), C(1)], den: [C(1), C(0), C(1)] });
  });

  it("exportPhiLink returns null for a non-exportable φ", () => {
    expect(exportPhiLink({ w0: C(0) })).toBeNull();
  });

  // The PRODUCER half of the QD -> CD contract (qd-interchange-e2e-08). The assertions above only
  // say QD is self-consistent; this one says QD emits the exact bytes CD is tested against. The
  // golden lives in @cas/interchange because the dependency rule forbids either app importing the
  // other, so the wire artifact is the only place the two suites can meet — see
  // packages/interchange/src/goldens.ts, and apps/complex-dynamics/test/importMap.test.ts for the
  // consumer half. If this fails, the hand-off format changed: regenerate the golden only if that
  // was intended, and expect CD's test to start consuming the new bytes immediately.
  it("emits the exact link CD is tested against (cross-app golden)", () => {
    const link = exportPhiLink(deltoidPhi, { createdAt: GOLDEN_CREATED_AT, appVersion: "0.1.0" });
    expect(link).toBe(QD_TO_CD_DELTOID_LINK);
  });
});

// S3b (SIGMA-HANDOFF): the σ (Schwarz reflection) hand-off, ALONGSIDE φ. σ ships as a `form:"schwarz"`
// recipe (interchange v1.1.0); CD reconstructs it via @cas/schwarz. Scoped to the unbounded-Laurent
// family (the deltoid), the only σ the shared engine can rebuild today.
describe("QD σ (Schwarz reflection) export (S3b)", () => {
  it("builds a schwarz-reflection envelope carrying the form:\"schwarz\" σ recipe over the deltoid φ", () => {
    const env = buildSigmaEnvelope(deltoidPhi, { createdAt: GOLDEN_CREATED_AT, appVersion: "0.1.0" });
    expect(env).not.toBeNull();
    const validated = validateEnvelope(env); // throws if malformed
    expect(isEnvelopeOfKind(validated, "schwarz-reflection")).toBe(true);
    expect((env!.payload as { sigma: unknown }).sigma).toEqual({
      form: "schwarz",
      phi: { form: "laurent", c: C(1), F: [C(0), C(0), C(0.5)] },
      disk: "D*",
      inverse: "newton-dk",
      antiholomorphic: true,
    });
    expect((env!.payload as { conventions: unknown }).conventions).toEqual({ area: "standard", contour: "standard" });
  });

  it("returns null for a φ the σ engine can't reconstruct (rational / non-exportable)", () => {
    expect(buildSigmaEnvelope(rationalPhi)).toBeNull(); // rational Direct-tab φ — no unbounded-Laurent σ engine
    expect(buildSigmaEnvelope({ w0: C(0) })).toBeNull(); // not exportable at all
  });

  it("round-trips through the deep-link codec (QD encode σ -> interchange decode)", () => {
    const link = exportSigmaLink(deltoidPhi, { createdAt: GOLDEN_CREATED_AT });
    expect(link!.startsWith("#s=")).toBe(true);
    const back = decodeLink(link!);
    expect(back.kind).toBe("schwarz-reflection");
    expect((back.payload as { sigma: { form: string } }).sigma.form).toBe("schwarz");
  });

  // The PRODUCER half of the σ contract: QD emits the EXACT bytes stored as the cross-app golden and
  // consumed by CD (apps/complex-dynamics/test/importMap.test.ts). Closes the producer↔consumer loop
  // that S3a opened with a hand-built golden — now a real exporter reproduces it byte-for-byte.
  it("emits the exact deltoid-σ link stored as the cross-app golden", () => {
    const link = exportSigmaLink(deltoidPhi, { createdAt: GOLDEN_CREATED_AT, appVersion: "0.1.0" });
    expect(link).toBe(QD_TO_CD_DELTOID_SIGMA_LINK);
  });
});

// Phase 1 (σ-export legibility): the export card used to reject EVERY non-Laurent φ with one blind
// "needs an unbounded-Laurent φ (e.g. the deltoid)" line — so "nothing captured", "captured a
// pole-bearing unbounded QD", and "captured a bounded domain" all pointed the user at the deltoid,
// which is the one case that DOES export. These pure classifiers turn each rejection into its real
// reason; the UI (_exportSigma/_exportMap) just displays the string. Kept next to phiToMapSpec because
// the availability verdict must stay in lockstep with it (a message that says "exportable" while the
// builder returns null, or vice-versa, is its own bug).
describe("export availability — structural classifier (Phase 1)", () => {
  // A pole-bearing UNBOUNDED QD (a single exterior pole): the real single-pole solve emits this shape
  // (φ = c·z + branch term, no Laurent poly). Passes phi.unbounded but carries a finite-pole branch.
  const polePhi = { unbounded: true, c: 0.6, polyA: [], branches: [{ z: C(2), A: [C(1)] }] };
  // A bounded classical QD: phi.unbounded is false.
  const boundedPhi = { unbounded: false, branches: [{ z: C(0.5), A: [C(1)] }] };

  it("classifies each captured-φ shape", () => {
    expect(classifyPhiForExport(null)).toEqual({ kind: "none" });
    expect(classifyPhiForExport(deltoidPhi).kind).toBe("unbounded-laurent");
    expect(classifyPhiForExport(rationalPhi).kind).toBe("rational");
    expect(classifyPhiForExport(boundedPhi).kind).toBe("bounded");
    expect(classifyPhiForExport(polePhi)).toEqual({ kind: "unbounded-poles", poleCount: 1, branchTerms: 1 });
  });
});

describe("export availability — σ reason strings (Phase 1; bounded-classical exports since S5-C2)", () => {
  const polePhi = { unbounded: true, c: 0.6, polyA: [], branches: [{ z: C(2), A: [C(1)] }] };
  // Bounded-CLASSICAL (no family tag): σ-exportable since S5-C2. Bounded-WEIGHTED (LQD/PQD, family-tagged):
  // still not reconstructable, so it is the shape that now earns the "bounded" reason string.
  const boundedClassicalPhi = { unbounded: false, branches: [{ z: C(0.5), A: [C(1)] }] };
  const boundedWeightedPhi = { unbounded: false, family: "boundedLQD", branches: [{ z: C(0.5), A: [C(1)] }] };

  it("returns null (no message) exactly when σ IS exportable — the deltoid", () => {
    expect(explainSigmaUnavailable(deltoidPhi)).toBeNull();
  });
  it("nothing captured → names the 'Use this φ' capture step", () => {
    const msg = explainSigmaUnavailable(null);
    expect(msg).toMatch(/Use this φ/);
    expect(msg).toMatch(/Inverse tab/i);
  });
  it("rational Direct-tab φ → says it's rational and points at the φ export", () => {
    const msg = explainSigmaUnavailable(rationalPhi)!;
    expect(msg).toMatch(/rational/i);
    expect(msg).toContain("φ");
  });
  it("bounded-classical QD → now σ-exports (S5-C2), so no message", () => {
    expect(explainSigmaUnavailable(boundedClassicalPhi)).toBeNull();
  });
  it("weighted (LQD/PQD) bounded QD → says bounded/weighted, does not blame the deltoid", () => {
    const msg = explainSigmaUnavailable(boundedWeightedPhi)!;
    expect(msg).toMatch(/bounded/i);
    expect(msg).toMatch(/weighted/i);
    expect(msg).not.toMatch(/deltoid/i);
  });
  it("pole-bearing unbounded QD → now σ-exports (Phase 2), so no message", () => {
    expect(explainSigmaUnavailable(polePhi)).toBeNull();
  });
});

describe("export availability — φ reason strings (Phase 1)", () => {
  const polePhi = { unbounded: true, c: 0.6, polyA: [], branches: [{ z: C(2), A: [C(1)] }] };
  const boundedPhi = { unbounded: false, branches: [{ z: C(0.5), A: [C(1)] }] };

  it("returns null when φ IS exportable — deltoid (laurent) AND rational both export", () => {
    expect(explainPhiUnavailable(deltoidPhi)).toBeNull();
    expect(explainPhiUnavailable(rationalPhi)).toBeNull();
  });
  it("nothing captured → names the 'Use this φ' capture step", () => {
    expect(explainPhiUnavailable(null)).toMatch(/Use this φ/);
  });
  it("bounded domain → says bounded", () => {
    expect(explainPhiUnavailable(boundedPhi)).toMatch(/bounded/i);
  });
  it("pole-bearing unbounded QD → now φ-exports (Phase 2), so no message", () => {
    expect(explainPhiUnavailable(polePhi)).toBeNull();
  });
});

// Phase 2: pole-bearing unbounded QDs now serialize — phiToMapSpec carries the finite-pole branches into
// the interchange laurent form (1.2.0), the σ recipe reflects them, and CD reconstructs the full σ. A
// pole-free φ is unaffected (no `branches` key emitted → the deltoid wire is byte-identical).
describe("pole-bearing φ → branches on the interchange laurent (Phase 2)", () => {
  const polePhi = { unbounded: true, c: 0.6, polyA: [], branches: [{ z: C(0.4, 0.1), A: [C(0.3), C(0.1, -0.05)] }] };
  const branchesOut = [{ z: C(0.4, 0.1), A: [C(0.3), C(0.1, -0.05)] }];

  it("phiToMapSpec emits form:laurent with the mapped branches", () => {
    expect(phiToMapSpec(polePhi)).toEqual({ form: "laurent", c: C(0.6), F: [], branches: branchesOut });
  });
  it("a pole-free φ still omits the branches key (deltoid wire byte-identical)", () => {
    expect(phiToMapSpec(deltoidPhi)).toEqual({ form: "laurent", c: C(1), F: [C(0), C(0), C(0.5)] });
  });
  it("buildSigmaEnvelope carries the branches into the schwarz recipe and validates", () => {
    const env = buildSigmaEnvelope(polePhi, { createdAt: GOLDEN_CREATED_AT, appVersion: "0.1.0" });
    expect(env).not.toBeNull();
    expect(isEnvelopeOfKind(validateEnvelope(env), "schwarz-reflection")).toBe(true);
    const sigma = (env!.payload as { sigma: { phi: { branches: unknown } } }).sigma;
    expect(sigma.phi.branches).toEqual(branchesOut);
  });
  it("buildExportEnvelope (φ) also carries the branches", () => {
    const env = buildExportEnvelope(polePhi, { createdAt: GOLDEN_CREATED_AT });
    expect(env).not.toBeNull();
    expect((env!.payload.phi as { branches: unknown }).branches).toEqual(branchesOut);
  });

  // The PRODUCER half of the single-pole σ cross-app contract: QD's exporter reproduces the exact bytes
  // stored as the golden and consumed by CD (apps/complex-dynamics/test/importMap.test.ts). The fixture
  // is c=1 with one order-1 pole z_j=0.2, A=0.3. If this drifts, the pole-bearing wire format changed.
  it("emits the exact single-pole σ link stored as the cross-app golden", () => {
    const singlePolePhi = { unbounded: true, c: 1, polyA: [], branches: [{ z: C(0.2, 0), A: [C(0.3, 0)] }] };
    const link = exportSigmaLink(singlePolePhi, { createdAt: GOLDEN_CREATED_AT, appVersion: "0.1.0" });
    expect(link).toBe(QD_TO_CD_SINGLE_POLE_SIGMA_LINK);
  });
});

// S5-C2: bounded-classical QDs now σ-export — the FIRST non-Laurent family on the wire. buildSigmaEnvelope
// emits `sigma.phi` as `form:"bounded"` (schema 1.3.0, `disk:"D"`); CD rebuilds σ via makeBoundedSchwarz's
// interior branch. A bounded φ is σ-ONLY: `form:"bounded"` is not a MapSpec, so it never rides the φ /
// quadrature-domain hand-off (phiToMapSpec / buildExportEnvelope stay null for it).
describe("bounded-classical φ → form:bounded σ recipe (S5-C2)", () => {
  // A single-lobe bounded QD: φ(z) = ½·u, u = z/(1 − 0.3z), centre w₀ = 0 (no family tag ⇒ classical).
  const boundedLobePhi = { unbounded: false, w0: C(0), branches: [{ z: C(0.3), A: [C(0.5)] }] };

  it("buildSigmaEnvelope emits the form:bounded recipe (disk:D) and validates", () => {
    const env = buildSigmaEnvelope(boundedLobePhi, { createdAt: GOLDEN_CREATED_AT, appVersion: "0.1.0" });
    expect(env).not.toBeNull();
    expect(isEnvelopeOfKind(validateEnvelope(env), "schwarz-reflection")).toBe(true);
    expect((env!.payload as { sigma: unknown }).sigma).toEqual({
      form: "schwarz",
      phi: { form: "bounded", w0: C(0), branches: [{ z: C(0.3), A: [C(0.5)] }] },
      disk: "D",
      inverse: "newton-dk",
      antiholomorphic: true,
    });
  });

  it("a bounded φ is σ-only — it never rides the φ / quadrature-domain hand-off", () => {
    expect(phiToMapSpec(boundedLobePhi)).toBeNull(); // form:bounded is not a MapSpec
    expect(buildExportEnvelope(boundedLobePhi, { createdAt: GOLDEN_CREATED_AT })).toBeNull();
  });

  it("a weighted (LQD/PQD) bounded φ is NOT σ-exportable — its σ needs exp/power machinery not lifted yet", () => {
    const weighted = { unbounded: false, family: "boundedLQD", w0: C(0), branches: [{ z: C(0.3), A: [C(0.5)] }] };
    expect(buildSigmaEnvelope(weighted)).toBeNull();
  });

  // The PRODUCER half of the bounded-lobe σ cross-app contract: QD reproduces the exact bytes stored as the
  // golden and consumed by CD (apps/complex-dynamics/test/importMap.test.ts). If this drifts, the bounded
  // wire format changed — regenerate the golden only if intended, and CD starts consuming the new bytes.
  it("emits the exact bounded-lobe σ link stored as the cross-app golden", () => {
    const link = exportSigmaLink(boundedLobePhi, { createdAt: GOLDEN_CREATED_AT, appVersion: "0.1.0" });
    expect(link).toBe(QD_TO_CD_BOUNDED_LOBE_SIGMA_LINK);
  });
});
