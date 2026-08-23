import { describe, expect, it } from "vitest";
import {
  coeffExpr,
  polyExpr,
  laurentExpr,
  mapSpecToExpr,
  envelopeToMapSpec,
  type Complex,
  type Envelope,
  type LaurentMap,
  type RationalMap,
} from "../src/index.js";

// Cross-consumer golden for the shared MapSpec → @cas/expr converter (ADR-0027 / review MED #1).
// The three apps (Complex Dynamics, plotter, Argument Principle) all delegate here, so this pins the
// output grammar AND the two loud-failure guards CD's ancestor copy used to lack (empty/zero denominator,
// pole-bearing Laurent) — the whole point of the extraction. Emitted text is @cas/expr grammar: `i`, `^`.

const cx = (re: number, im = 0): Complex => ({ re, im });

describe("@cas/interchange mapSpecToExpr — coefficient & polynomial grammar", () => {
  it("renders complex coefficients as parenthesised expr atoms", () => {
    expect(coeffExpr(cx(3))).toBe("(3)");
    expect(coeffExpr(cx(0, 2))).toBe("(2*i)");
    expect(coeffExpr(cx(1, -2))).toBe("(1-2*i)");
    expect(coeffExpr(cx(1, 2))).toBe("(1+2*i)");
  });

  it("renders an ascending-coefficient polynomial, skipping zero terms", () => {
    // 2 + 0·z + 3·z²
    expect(polyExpr([cx(2), cx(0), cx(3)], "z")).toBe("(2) + (3)*z^2");
    expect(polyExpr([], "z")).toBe("(0)");
  });

  it("laurent: leading c·z plus tail fₗ/z^l", () => {
    expect(laurentExpr(cx(1), [cx(0), cx(0), cx(2)], "z")).toBe("(1)*z + (2)/z^2");
  });
});

describe("@cas/interchange mapSpecToExpr — MapSpec forms", () => {
  it("rational with unit denominator collapses to the numerator polynomial", () => {
    const m: RationalMap = { form: "rational", num: [cx(0), cx(1)], den: [cx(1)] };
    expect(mapSpecToExpr(m)).toBe("(1)*z");
  });

  it("rational with a real denominator emits (num)/(den)", () => {
    const m: RationalMap = { form: "rational", num: [cx(1)], den: [cx(0), cx(1)] };
    expect(mapSpecToExpr(m)).toBe("((1)) / ((1)*z)");
  });

  it("antiholomorphic maps build on conjugate(z)", () => {
    const m: RationalMap = { form: "rational", num: [cx(0), cx(1)], den: [cx(1)], antiholomorphic: true };
    expect(mapSpecToExpr(m)).toBe("(1)*conjugate(z)");
  });

  it("expr form passes through verbatim", () => {
    expect(mapSpecToExpr({ form: "expr", expr: "z^2 + c", vars: ["z", "c"] })).toBe("z^2 + c");
  });
});

describe("@cas/interchange mapSpecToExpr — loud-failure guards (the CD-divergence fix)", () => {
  it("throws on an empty denominator (0/0) instead of emitting a NaN map", () => {
    const m: RationalMap = { form: "rational", num: [cx(1)], den: [] };
    expect(() => mapSpecToExpr(m)).toThrow(/denominator/i);
  });

  it("throws on an identically-zero denominator", () => {
    const m: RationalMap = { form: "rational", num: [cx(1)], den: [cx(0), cx(0)] };
    expect(() => mapSpecToExpr(m)).toThrow(/denominator|zero/i);
  });

  it("throws on a pole-bearing Laurent map (finite-pole branches)", () => {
    const m: LaurentMap = {
      form: "laurent",
      c: cx(1),
      F: [cx(0)],
      branches: [{ z: cx(0.5), A: [cx(1)] }],
    };
    expect(() => mapSpecToExpr(m)).toThrow(/branch|pole/i);
  });

  it("throws on a schwarz-form map (numerical inverse, not expr-compilable)", () => {
    const m = {
      form: "schwarz" as const,
      antiholomorphic: true as const,
      disk: "D*" as const,
      inverse: "newton-dk" as const,
      phi: { form: "laurent" as const, c: cx(1), F: [cx(0), cx(0), cx(0.5)] },
    };
    expect(() => mapSpecToExpr(m)).toThrow(/schwarz|numerical/i);
  });
});

describe("@cas/interchange envelopeToMapSpec", () => {
  const wrap = (kind: string, payload: unknown): Envelope =>
    ({ v: "1.3.0", kind, payload, provenance: { app: "test" } }) as unknown as Envelope;

  it("extracts φ from a quadrature-domain, σ from a schwarz-reflection, map from view/map", () => {
    const phi: LaurentMap = { form: "laurent", c: cx(1), F: [] };
    expect(envelopeToMapSpec(wrap("quadrature-domain", { phi }))).toBe(phi);
    const sigma = { form: "expr", expr: "z", vars: ["z"] };
    expect(envelopeToMapSpec(wrap("schwarz-reflection", { sigma }))?.form).toBe("expr");
    expect(envelopeToMapSpec(wrap("view", { map: phi }))).toBe(phi);
    expect(envelopeToMapSpec(wrap("map", phi))).toBe(phi);
  });
});
