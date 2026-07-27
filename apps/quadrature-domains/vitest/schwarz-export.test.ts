import { describe, expect, it } from "vitest";
import {
  decodeLink,
  isEnvelopeOfKind,
  validateEnvelope,
  GOLDEN_CREATED_AT,
  QD_TO_CD_DELTOID_LINK,
} from "@cas/interchange";
import { buildExportEnvelope, exportPhiLink, phiToMapSpec } from "../app/schwarz/schwarz-export.mjs";

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
