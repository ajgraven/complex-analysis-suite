import { describe, it, expect } from "vitest";
import {
  decodeLink,
  isEnvelopeOfKind,
  GOLDEN_CREATED_AT,
  CD_TO_RM_BOTTCHER_LINK,
  CD_TO_RM_BOTTCHER_PSI_AT_2,
  type LaurentMap,
} from "@cas/interchange";
import {
  bottcherLaurentMap,
  bottcherMapEnvelope,
  bottcherMapLink,
  bottcherMapDeepLink,
  riemannMapBase,
  type BottcherExport,
} from "../src/interchange/exportMap";

// The deltoid exterior map ψ(w) = w + ½·w⁻² — the fixture pinned as the cross-app golden.
const DELTOID: BottcherExport = { lead: [1, 0], coeffs: [[0, 0], [0, 0], [0.5, 0]] };

describe("bottcherLaurentMap", () => {
  it("maps γ₁ → c and {bₖ} → F as interchange {re,im} tuples", () => {
    const m = bottcherLaurentMap({ lead: [2, -1], coeffs: [[0.5, 0], [0, 3]] });
    expect(m).toEqual<LaurentMap>({
      form: "laurent",
      c: { re: 2, im: -1 },
      F: [{ re: 0.5, im: 0 }, { re: 0, im: 3 }],
    });
  });
});

describe("bottcherMapLink / envelope", () => {
  it("round-trips through decode + validate as a kind:'map' LaurentMap", () => {
    const link = bottcherMapLink(DELTOID, { createdAt: GOLDEN_CREATED_AT });
    const env = decodeLink(link);
    expect(isEnvelopeOfKind(env, "map")).toBe(true);
    const m = env.payload as LaurentMap;
    expect(m.form).toBe("laurent");
    expect(m.c).toEqual({ re: 1, im: 0 });
    expect(m.F).toEqual([{ re: 0, im: 0 }, { re: 0, im: 0 }, { re: 0.5, im: 0 }]);
    expect(env.provenance.app).toBe("complex-dynamics");
  });

  it("reproduces the CD→RM cross-app golden byte-for-byte", () => {
    expect(bottcherMapLink(DELTOID, { createdAt: GOLDEN_CREATED_AT })).toBe(CD_TO_RM_BOTTCHER_LINK);
  });

  it("carries the map that evaluates to ψ(2) = 2.125 (γ₁·w + Σ bₖ·w⁻ᵏ)", () => {
    const m = decodeLink(CD_TO_RM_BOTTCHER_LINK).payload as LaurentMap;
    const w = 2;
    let re = m.c.re * w; // γ₁·w (real fixture)
    m.F.forEach((f, k) => {
      re += f.re * Math.pow(w, -k);
    });
    expect(re).toBeCloseTo(CD_TO_RM_BOTTCHER_PSI_AT_2, 12);
  });

  it("records the source expr and c in the provenance note when given", () => {
    const env = bottcherMapEnvelope(DELTOID, { sourceExpr: "z^2 - 1", c: [-1, 0] });
    expect(env.provenance.note).toContain("f=z^2 - 1");
    expect(env.provenance.note).toContain("c=-1+0i");
    expect(env.provenance.note).toContain("γ₁ exact"); // honest labeling
  });
});

describe("riemannMapBase / bottcherMapDeepLink", () => {
  it("swaps the app segment on the combined deploy (…/complex-dynamics/… → …/riemann-map/…)", () => {
    const r = riemannMapBase({ origin: "https://x.dev", pathname: "/suite/complex-dynamics/index.html" });
    expect(r).toEqual({ base: "https://x.dev/suite/riemann-map/", resolvable: true, reason: "sibling" });
  });

  it("falls back to a best-effort sibling (resolvable:false) with no CD segment", () => {
    const r = riemannMapBase({ origin: "https://x.dev", pathname: "/" });
    expect(r).toEqual({ base: "https://x.dev/riemann-map/", resolvable: false, reason: "unresolved" });
  });

  it("honors an explicit base override", () => {
    const r = riemannMapBase(null, "http://localhost:5173/");
    expect(r).toEqual({ base: "http://localhost:5173/", resolvable: true, reason: "override" });
  });

  it("builds a full deep link = base + '#s=…'", () => {
    const { url } = bottcherMapDeepLink(DELTOID, { origin: "https://x.dev", pathname: "/a/complex-dynamics/" }, { createdAt: GOLDEN_CREATED_AT });
    expect(url).toBe("https://x.dev/a/riemann-map/" + CD_TO_RM_BOTTCHER_LINK);
  });
});
