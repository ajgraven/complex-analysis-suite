import { describe, it, expect } from "vitest";
import { GOLDEN_CREATED_AT, RM_TO_POTENTIAL_CONFORMAL_LINK, decodeLink } from "@cas/interchange";
import {
  conformalMapLink,
  conformalMapEnvelope,
  sendToElectrostaticsDeepLink,
  electrostaticsBase,
  type ConformalExport,
} from "../src/interchange/exportMap.js";

// The side-2 square exactly as the RM→2D-Electrostatics golden pins it: corners CCW from bottom-right,
// all interior angles ½·π. (The vertex ORDER is load-bearing — encodeLink serializes it verbatim.)
const SQUARE2: ConformalExport = {
  corners: [
    [1, -1],
    [1, 1],
    [-1, 1],
    [-1, -1],
  ],
  angles: [0.5, 0.5, 0.5, 0.5],
  converged: true,
};

describe("RM → 2D-Electrostatics conformal producer", () => {
  it("reproduces the cross-app golden byte-for-byte", () => {
    expect(conformalMapLink(SQUARE2, { createdAt: GOLDEN_CREATED_AT, appVersion: "0.1.0" })).toBe(
      RM_TO_POTENTIAL_CONFORMAL_LINK,
    );
  });

  it("emits a minimal conformal payload (engine sc-interior; no drift-prone fit fields)", () => {
    const env = conformalMapEnvelope(SQUARE2, { createdAt: GOLDEN_CREATED_AT });
    expect(env.kind).toBe("map");
    const p = env.payload as unknown as Record<string, unknown>;
    expect(p.form).toBe("conformal");
    expect(p.engine).toBe("sc-interior");
    expect(p.polygon).toHaveLength(4);
    expect(p.converged).toBe(true);
    // The minimal contract: no prevertices/constant/capacity/residual on the wire.
    for (const k of ["prevertices", "constant", "capacity", "residual", "degraded"]) expect(p[k]).toBeUndefined();
    // Round-trips through the shared codec/seatbelt.
    expect(() => decodeLink(conformalMapLink(SQUARE2, { createdAt: GOLDEN_CREATED_AT }))).not.toThrow();
  });

  it("swaps the app segment to resolve the sibling 2D-Electrostatics deep link", () => {
    const loc = { origin: "https://x.github.io", pathname: "/suite/riemann-map/index.html" };
    const { url, resolvable } = sendToElectrostaticsDeepLink(SQUARE2, loc, { createdAt: GOLDEN_CREATED_AT });
    expect(resolvable).toBe(true);
    expect(url).toBe(`https://x.github.io/suite/2d-electrostatics/polygon.html${RM_TO_POTENTIAL_CONFORMAL_LINK}`);
  });

  it("flags an unresolvable base (dev root) but still returns a usable guess", () => {
    const { base, resolvable } = electrostaticsBase({ origin: "http://localhost:5173", pathname: "/" });
    expect(resolvable).toBe(false);
    expect(base).toBe("http://localhost:5173/2d-electrostatics/");
  });
});
