import { describe, expect, it } from "vitest";
import {
  decodeLink,
  isEnvelopeOfKind,
  validateEnvelope,
  GOLDEN_CREATED_AT,
  QD_TO_CD_DELTOID_LINK,
  QD_TO_CD_DELTOID_SIGMA_LINK,
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

describe("export availability — σ reason strings (Phase 1)", () => {
  const polePhi = { unbounded: true, c: 0.6, polyA: [], branches: [{ z: C(2), A: [C(1)] }] };
  const boundedPhi = { unbounded: false, branches: [{ z: C(0.5), A: [C(1)] }] };

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
  it("bounded domain → says bounded, does not blame the deltoid", () => {
    expect(explainSigmaUnavailable(boundedPhi)).toMatch(/bounded/i);
  });
  it("pole-bearing unbounded QD → names the pole term(s), not 'unsupported'", () => {
    const msg = explainSigmaUnavailable(polePhi)!;
    expect(msg).toMatch(/pole/i);
    expect(msg).toMatch(/1 pole term(?!s)/); // singular for a single pole
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
  it("pole-bearing unbounded QD → names the pole term(s)", () => {
    expect(explainPhiUnavailable(polePhi)).toMatch(/pole/i);
  });
});
