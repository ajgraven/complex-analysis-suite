import { describe, expect, it } from "vitest";
import {
  encodeLink,
  SCHEMA_ID,
  VERSION,
  CD_TO_RM_BOTTCHER_LINK,
  CD_TO_RM_BOTTCHER_PSI_AT_2,
  type Envelope,
} from "@cas/interchange";
import { parse } from "@cas/expr/parser";
import { makeComplexFn } from "@cas/expr/evaluate";
import { importEnvelopeText } from "../src/interchange/importMap.js";

// The suite's second pillar (hand-off): a sibling tool (the plotter / Complex Dynamics) emits an f(z) as
// an @cas/interchange envelope, and this tool imports it to study its zeros, poles, and winding. These
// pin the consumer against the shared cross-app golden and a round-tripped `view` envelope.

describe("suite hand-off: importing an f(z) from a sibling tool", () => {
  it("consumes the real Complex-Dynamics Böttcher golden link (a Laurent map)", () => {
    const m = importEnvelopeText(CD_TO_RM_BOTTCHER_LINK);
    expect(m.source).toBe("complex-dynamics");
    expect(m.expr).toBe("(1)*z + (0.5)/z^2");
    // The imported source parses in the shared @cas/expr and evaluates ψ(2) = 2.125 (the pinned value).
    const f = makeComplexFn(parse(m.expr));
    const [re, im] = f([2, 0], [0, 0]);
    expect(re).toBeCloseTo(CD_TO_RM_BOTTCHER_PSI_AT_2, 12);
    expect(im).toBeCloseTo(0, 12);
  });

  it("round-trips a plotter/CD `view` expr hand-off (the headline case)", () => {
    const env = {
      schema: SCHEMA_ID,
      version: VERSION,
      kind: "view",
      payload: {
        map: { form: "expr", expr: "z*z*z - 1", vars: ["z"] },
        viewport: { center: { re: 0.5, im: -0.25 }, zoom: 2 },
      },
      provenance: { app: "complex-function-plotter", appVersion: "0.1.0", createdAt: "2026-01-01T00:00:00Z" },
    } as unknown as Envelope;
    const link = encodeLink(env);
    const m = importEnvelopeText(link);
    expect(m.expr).toBe("z*z*z - 1");
    expect(m.source).toBe("complex-function-plotter");
    expect(m.center).toEqual({ re: 0.5, im: -0.25 });
  });

  it("throws on a non-interchange link (e.g. this app's own #vs=)", () => {
    expect(() => importEnvelopeText("#vs=not-a-hand-off")).toThrow();
  });
});
