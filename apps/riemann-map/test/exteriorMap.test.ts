import { describe, expect, it } from "vitest";
import { SCHEMA_ID, VERSION, decodeLink, isEnvelopeOfKind, type LaurentMap } from "@cas/interchange";
import { analyzeExterior } from "../src/analysis/exterior.js";
import { exteriorMapEnvelope, exteriorMapLink } from "../src/interchange/exteriorMap.js";

// A fixed timestamp keeps the producer deterministic (matches the QD golden idiom).
const FIXED = { createdAt: "2026-08-10T00:00:00Z", appVersion: "0.0.0" };

describe("exterior-map hand-off (G8 producer, on @cas/interchange)", () => {
  it("wraps K's exterior Riemann map as a kind:\"map\" Laurent envelope", () => {
    const a = analyzeExterior("z*z - 1"); // basilica
    expect(a).not.toBeNull();
    if (!a) return;
    const env = exteriorMapEnvelope(a, { ...FIXED, sourceExpr: "z*z - 1" });
    expect(env.schema).toBe(SCHEMA_ID);
    expect(env.version).toBe(VERSION);
    expect(env.kind).toBe("map");
    expect(env.provenance.app).toBe("riemann-map");
    const phi = env.payload as LaurentMap;
    expect(phi.form).toBe("laurent");
    // γ₁ → c, {b_k} → F, in order.
    expect(phi.c.re).toBeCloseTo(a.lead[0], 12);
    expect(phi.c.im).toBeCloseTo(a.lead[1], 12);
    expect(phi.F.length).toBe(a.coeffs.length);
    expect(phi.F[0].re).toBeCloseTo(a.coeffs[0][0], 12);
    expect(phi.F[0].im).toBeCloseTo(a.coeffs[0][1], 12);
    // Honest labelling: the tail is estimated, and the note says so (≈).
    expect(env.provenance.note ?? "").toContain("≈");
  });

  it("round-trips through the interchange codec (encode → decode → validate)", () => {
    const a = analyzeExterior("z*z - 1");
    if (!a) throw new Error("analysis unexpectedly null");
    const link = exteriorMapLink(a, FIXED);
    expect(link.startsWith("#s=")).toBe(true);
    const env = decodeLink(link); // decodeLink validates; a malformed payload would throw here
    expect(isEnvelopeOfKind(env, "map")).toBe(true);
    const phi = env.payload as LaurentMap;
    expect(phi.form).toBe("laurent");
    expect(phi.c.re).toBeCloseTo(a.lead[0], 12);
    expect(phi.F.length).toBe(a.coeffs.length);
  });

  it("ground-truth: the c=0 disk's exterior map is ψ(w)=w (γ₁=1, all bₖ≈0)", () => {
    const a = analyzeExterior("z*z"); // K = closed unit disk
    if (!a) throw new Error("analysis unexpectedly null");
    const phi = exteriorMapEnvelope(a, FIXED).payload as LaurentMap;
    expect(phi.c.re).toBeCloseTo(1, 9);
    expect(phi.c.im).toBeCloseTo(0, 9);
    for (const f of phi.F) {
      expect(Math.hypot(f.re, f.im)).toBeLessThan(1e-6);
    }
  });
});
