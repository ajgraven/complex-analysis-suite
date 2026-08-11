import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr/parser";
import { makeComplexFn } from "@cas/expr/evaluate";
import {
  CANONICAL,
  SCHEMA_ID,
  VERSION,
  encodeLink,
  decodeLink,
  validateEnvelope,
  type Complex,
  type Envelope,
  type LaurentMap,
} from "@cas/interchange";
import {
  mapSpecToExpr,
  envelopeToMapSpec,
  importEnvelopeText,
} from "../src/interchange/importMap.js";
import {
  buildViewEnvelope,
  encodeViewLink,
  cdHandoffUrl,
} from "../src/interchange/exportView.js";

// Phase 6 / 6B (K7/K8): the suite hand-off. The converter is pure, so it is pinned here — and, crucially,
// EVERY string it emits is parsed + evaluated through the same `@cas/expr` the render uses, so a factor or
// syntax error can't slip a subtly-wrong map past (the honest-labeling / ADR-0006 guardrail). The
// end-to-end "a QD map renders, a View re-opens in Complex Dynamics" is the headless round-trip check.

const cx = (re: number, im = 0): Complex => ({ re, im });
/** Evaluate a converter-produced expr string at a point, via the real @cas/expr backend. */
const evalAt = (src: string, z: [number, number]): [number, number] =>
  makeComplexFn(parse(src), {})(z, [0, 0]);

/** The deltoid uniformizing map φ = z + 1/(2 z²): c = 1, F = [0, 0, ½] (the S3a golden). */
const DELTOID: LaurentMap = { form: "laurent", c: cx(1), F: [cx(0), cx(0), cx(0.5)] };

const envelope = <K extends Envelope["kind"]>(
  kind: K,
  payload: unknown,
  app = "quadrature-domains",
): Envelope =>
  ({
    schema: SCHEMA_ID,
    version: VERSION,
    kind,
    payload,
    provenance: { app, appVersion: "1.0.0", createdAt: "2026-01-01T00:00:00Z" },
  }) as Envelope;

describe("mapSpecToExpr — MapSpec → @cas/expr source", () => {
  it("rational maps convert and evaluate through @cas/expr", () => {
    const src = mapSpecToExpr({
      form: "rational",
      num: [cx(1), cx(0), cx(1)],
      den: [cx(1)],
    });
    expect(src).toBe("(1) + (1)*z^2"); // 1 + z², unit denominator skipped
    expect(evalAt(src, [2, 0])).toEqual([5, 0]);
  });

  it("Laurent maps convert and evaluate (the deltoid φ = z + 1/(2 z²))", () => {
    const src = mapSpecToExpr(DELTOID);
    expect(src).toBe("(1)*z + (0.5)/z^2");
    const [re, im] = evalAt(src, [2, 0]);
    expect(re).toBeCloseTo(2.125, 12); // 2 + 0.5/4
    expect(im).toBeCloseTo(0, 12);
  });

  it("emits complex coefficients that parse (i, mixed re/im, pure imaginary)", () => {
    // num = (3 − 2i) + i·z ; den = 1
    const src = mapSpecToExpr({
      form: "rational",
      num: [cx(3, -2), cx(0, 1)],
      den: [cx(1)],
    });
    expect(src).toBe("(3-2*i) + (1*i)*z");
    const [re, im] = evalAt(src, [1, 0]); // (3−2i) + i = 3 − i
    expect(re).toBeCloseTo(3, 12);
    expect(im).toBeCloseTo(-1, 12);
  });

  it("an anti-holomorphic map is built on conjugate(z)", () => {
    const src = mapSpecToExpr({
      form: "rational",
      num: [cx(0), cx(0), cx(1)],
      den: [cx(1)],
      antiholomorphic: true,
    });
    expect(src).toContain("conjugate(z)");
    const [re, im] = evalAt(src, [0, 2]); // conj(2i)² = (−2i)² = −4
    expect(re).toBeCloseTo(-4, 12);
    expect(im).toBeCloseTo(0, 12);
  });

  it("passes an expr map through verbatim", () => {
    expect(mapSpecToExpr({ form: "expr", expr: "sin(z) + c", vars: ["z", "c"] })).toBe(
      "sin(z) + c",
    );
  });

  it("refuses the shapes it can't represent as a closed form (loudly, not silently)", () => {
    expect(() =>
      mapSpecToExpr({
        form: "laurent",
        c: cx(1),
        F: [cx(0)],
        branches: [{ z: cx(0.5), A: [cx(1)] }],
      }),
    ).toThrow(/finite-pole branches/);
    expect(() =>
      mapSpecToExpr({
        form: "schwarz",
        phi: DELTOID,
        disk: "D*",
        inverse: "newton-dk",
        antiholomorphic: true,
      }),
    ).toThrow(/expr-compilable/);
    // A validated-but-degenerate rational: empty or identically-zero denominator (0/0), not a NaN map.
    expect(() => mapSpecToExpr({ form: "rational", num: [cx(1)], den: [] })).toThrow(
      /denominator/,
    );
    expect(() =>
      mapSpecToExpr({ form: "rational", num: [cx(1)], den: [cx(0), cx(0)] }),
    ).toThrow(/denominator/);
  });
});

describe("envelopeToMapSpec — pull the renderable map out by kind", () => {
  it("reads φ / σ / view.map / bare map", () => {
    expect(
      envelopeToMapSpec(
        envelope("quadrature-domain", {
          phi: DELTOID,
          bounded: false,
          conventions: CANONICAL,
        }),
      ),
    ).toEqual(DELTOID);
    const sigma = {
      form: "schwarz",
      phi: DELTOID,
      disk: "D*",
      inverse: "newton-dk",
      antiholomorphic: true,
    };
    expect(
      envelopeToMapSpec(envelope("schwarz-reflection", { sigma, conventions: CANONICAL }))
        ?.form,
    ).toBe("schwarz");
    expect(envelopeToMapSpec(envelope("map", DELTOID))).toEqual(DELTOID);
  });
});

describe("importEnvelopeText — decode a link or JSON into a plottable map", () => {
  it("imports a QD quadrature-domain φ (link and JSON forms agree)", () => {
    const env = envelope("quadrature-domain", {
      phi: DELTOID,
      bounded: false,
      conventions: CANONICAL,
    });
    const fromJson = importEnvelopeText(JSON.stringify(env));
    const fromLink = importEnvelopeText(encodeLink(env)); // an #s= link of the same envelope
    expect(fromJson.expr).toBe("(1)*z + (0.5)/z^2");
    expect(fromJson.expr).toBe(fromLink.expr);
    expect(fromJson.note).toMatch(/φ/);
    expect(fromJson.source).toBe("quadrature-domains");
  });

  it("redirects a numerical Schwarz σ to its generating map φ, honestly labelled", () => {
    const sigma = {
      form: "schwarz",
      phi: DELTOID,
      disk: "D*",
      inverse: "newton-dk",
      antiholomorphic: true,
    };
    const res = importEnvelopeText(
      JSON.stringify(envelope("schwarz-reflection", { sigma, conventions: CANONICAL })),
    );
    expect(res.expr).toBe("(1)*z + (0.5)/z^2"); // φ, not σ
    expect(res.note).toMatch(/σ|Schwarz/);
    expect(res.note).toMatch(/φ/);
  });

  it("refuses a bounded-φ Schwarz σ (φ: 𝔻 → Ω) loudly — its branch terms aren't imported yet", () => {
    // A bounded QD's φ is branch-based (w₀ + Σ Aⱼ,ₖ·zᵏ/(1−conj(zⱼ)·z)ᵏ), which this closed-form import
    // doesn't build — the same shape it already declines for a pole-bearing Laurent map. Refuse, don't
    // silently drop terms. (Bounded σ landed with S5-C2; Complex Dynamics reconstructs it numerically.)
    const sigma = {
      form: "schwarz",
      phi: { form: "bounded", w0: cx(0), branches: [{ z: cx(0.5), A: [cx(0.2)] }] },
      disk: "D",
      inverse: "newton-dk",
      antiholomorphic: true,
    };
    expect(() =>
      importEnvelopeText(
        JSON.stringify(envelope("schwarz-reflection", { sigma, conventions: CANONICAL })),
      ),
    ).toThrow(/bounded map/);
  });

  it("imports a view and recovers its viewport", () => {
    const link = encodeViewLink({
      expr: "z^2",
      vars: ["z"],
      center: cx(0.5, -0.25),
      span: 3,
      createdAt: "2026-01-01T00:00:00Z",
    });
    const res = importEnvelopeText(link);
    expect(res.expr).toBe("z^2");
    expect(res.viewport).toEqual({ center: cx(0.5, -0.25), span: 3 });
  });
});

describe("buildViewEnvelope / encodeViewLink — the K8 export", () => {
  const view = {
    expr: "z^2 + c",
    vars: ["z", "c"] as ("z" | "c" | "a")[],
    center: cx(1, -1),
    span: 2.5,
    coloring: "oklch",
    createdAt: "2026-01-01T00:00:00Z",
  };

  it("builds an envelope that validates through @cas/interchange", () => {
    expect(() => validateEnvelope(buildViewEnvelope(view))).not.toThrow();
  });

  it("round-trips the map + viewport through an #s= link", () => {
    const env = decodeLink(encodeViewLink(view));
    expect(env.kind).toBe("view");
    const payload = env.payload as {
      map: { expr: string };
      viewport: { center: Complex; zoom: number };
    };
    expect(payload.map.expr).toBe("z^2 + c");
    expect(payload.viewport.center).toEqual(cx(1, -1));
    expect(payload.viewport.zoom).toBe(2.5);
  });

  it("defaults empty vars to [z] so the expr map stays valid", () => {
    const env = buildViewEnvelope({ ...view, vars: [] });
    expect((env.payload as { map: { vars: string[] } }).map.vars).toEqual(["z"]);
  });
});

describe("cdHandoffUrl — the send-to-Complex-Dynamics deep link", () => {
  it("resolves the sibling app under the launcher root, carrying the #s= hash", () => {
    expect(cdHandoffUrl("https://ex.com/suite/complex-function-plotter/", "#s=abc")).toBe(
      "https://ex.com/suite/complex-dynamics/#s=abc",
    );
  });
});
