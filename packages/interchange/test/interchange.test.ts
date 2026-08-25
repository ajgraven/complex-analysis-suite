import { describe, expect, it } from "vitest";
import {
  CANONICAL,
  SCHEMA_ID,
  VERSION,
  decodeLink,
  encodeLink,
  isMapSpec,
  validateEnvelope,
  QD_TO_CD_DELTOID_SIGMA_LINK,
  QD_TO_CD_DELTOID_SIGMA_AT_W0,
  QD_TO_CD_SINGLE_POLE_SIGMA_LINK,
  RM_TO_POTENTIAL_CONFORMAL_LINK,
  type ConformalMap,
  type Envelope,
  type LaurentMap,
  type MapSpec,
  type SchwarzReflection,
} from "../src/index.js";

// Golden corpus for @cas/interchange: schema constants, the runtime validator (accept + reject),
// forward-compat, and a full deep-link round-trip.

// The deltoid's phi = zeta + 1/(2 zeta^2) as a Laurent map — a canonical first-hand-off payload.
const deltoidSigma: LaurentMap = { form: "laurent", c: { re: 1, im: 0 }, F: [{ re: 0, im: 0 }, { re: 0, im: 0 }, { re: 0.5, im: 0 }] };

function schwarzEnvelope(): Envelope<"schwarz-reflection"> {
  const payload: SchwarzReflection = { sigma: deltoidSigma, conventions: CANONICAL };
  return {
    schema: SCHEMA_ID,
    version: VERSION,
    kind: "schwarz-reflection",
    payload,
    provenance: { app: "quadrature-domains", appVersion: "0.1.0", createdAt: "2026-07-06T00:00:00Z" },
  };
}

describe("@cas/interchange schema + constants", () => {
  it("CANONICAL is the standard/standard convention", () => {
    expect(CANONICAL).toEqual({ area: "standard", contour: "standard" });
  });
  it("isMapSpec recognizes each form and rejects junk", () => {
    expect(isMapSpec(deltoidSigma)).toBe(true);
    expect(isMapSpec({ form: "rational", num: [{ re: 1, im: 0 }], den: [{ re: 1, im: 0 }] })).toBe(true);
    expect(isMapSpec({ form: "expr", expr: "conjugate(z)^2 + c", vars: ["z", "c"] })).toBe(true);
    expect(isMapSpec({ form: "laurent", c: { re: 1, im: 0 } })).toBe(false); // missing F
    expect(isMapSpec({ form: "bogus" })).toBe(false);
    expect(isMapSpec(null)).toBe(false);
  });
  it("isMapSpec recognizes the schwarz form (S3a) and rejects malformed ones", () => {
    // A schwarz map is the RECIPE for a Schwarz reflection σ = conj(F(φ⁻¹)): the closed-form φ plus
    // which disk it uniformizes and how φ⁻¹ is taken. σ itself is anti-holomorphic, so the flag is
    // definitionally true. See schema.ts SchwarzMap.
    const schwarz = { form: "schwarz", phi: deltoidSigma, disk: "D*", inverse: "newton-dk", antiholomorphic: true };
    expect(isMapSpec(schwarz)).toBe(true);
    // phi must itself be a valid CLOSED-FORM map (laurent | rational) — the σ engine reads its
    // coefficients; an `expr` or nested `schwarz` phi has none, so reject it.
    expect(isMapSpec({ ...schwarz, phi: { form: "expr", expr: "z", vars: ["z"] } })).toBe(false);
    expect(isMapSpec({ ...schwarz, phi: { form: "laurent", c: { re: 1, im: 0 } } })).toBe(false); // phi missing F
    expect(isMapSpec({ ...schwarz, disk: "X" })).toBe(false); // disk ∈ {D, D*}
    expect(isMapSpec({ ...schwarz, inverse: "handwave" })).toBe(false); // inverse ∈ the known-methods set
    expect(isMapSpec({ ...schwarz, antiholomorphic: false })).toBe(false); // a Schwarz reflection is anti-holomorphic
    expect(isMapSpec({ form: "schwarz", phi: deltoidSigma, disk: "D*", inverse: "newton-dk" })).toBe(false); // flag absent → reject
  });
  it("SECURITY: bounds coefficient-array length, expr length, and vars entries", () => {
    const big = Array.from({ length: 5000 }, () => ({ re: 0, im: 0 }));
    expect(isMapSpec({ form: "rational", num: big, den: [{ re: 1, im: 0 }] })).toBe(false); // > MAX_COEFF_LEN
    expect(isMapSpec({ form: "expr", expr: "z", vars: ["z", "drop table"] })).toBe(false); // bad var name
    expect(isMapSpec({ form: "expr", expr: "z", vars: ["z", "c", "a"] })).toBe(true);
    expect(isMapSpec({ form: "expr", expr: "z".repeat(9000), vars: [] })).toBe(false); // > MAX_EXPR_LEN
  });
  it("isMapSpec validates optional Laurent branches (pole-bearing unbounded QD, 1.2.0)", () => {
    // A laurent φ MAY carry finite-pole branch terms { z ∈ 𝔻, A: principal-part coeffs } — the
    // pole-bearing unbounded QDs (single exterior pole, cardioid). Omitted/empty ⇒ the pole-free deltoid.
    const br = { z: { re: 0.2, im: 0 }, A: [{ re: 0.3, im: 0 }] };
    expect(isMapSpec({ ...deltoidSigma, branches: [br] })).toBe(true);
    expect(isMapSpec({ ...deltoidSigma, branches: [] })).toBe(true);
    // Malformed branches are REJECTED, not silently ignored (the seatbelt owns the guarantee).
    expect(isMapSpec({ ...deltoidSigma, branches: "nope" })).toBe(false);
    expect(isMapSpec({ ...deltoidSigma, branches: [{ z: { re: 0 }, A: [] }] })).toBe(false); // z.im missing
    expect(isMapSpec({ ...deltoidSigma, branches: [{ z: { re: 0, im: 0 } }] })).toBe(false); // A missing
    expect(isMapSpec({ ...deltoidSigma, branches: [{ z: { re: 0, im: 0 }, A: [{ re: 1 }] }] })).toBe(false); // A[0].im missing
    // SECURITY: an over-cap A array and an over-cap branch count are rejected (untrusted-input bounds).
    const bigA = Array.from({ length: 5000 }, () => ({ re: 0, im: 0 }));
    expect(isMapSpec({ ...deltoidSigma, branches: [{ z: { re: 0, im: 0 }, A: bigA }] })).toBe(false);
    const manyBranches = Array.from({ length: 5000 }, () => br);
    expect(isMapSpec({ ...deltoidSigma, branches: manyBranches })).toBe(false);
  });
  it("isMapSpec validates the bounded schwarz φ form (S5-C2, 1.3.0)", () => {
    // A schwarz map's φ may be `form:"bounded"` — a bounded QD (φ: 𝔻 → Ω): w₀ + finite-pole branches, no
    // c / Laurent tail. CD rebuilds it via @cas/schwarz makeBoundedSchwarz (the interior branch).
    const bounded = {
      form: "schwarz",
      phi: { form: "bounded", w0: { re: 0, im: 0 }, branches: [{ z: { re: 0.3, im: 0 }, A: [{ re: 0.5, im: 0 }] }] },
      disk: "D",
      inverse: "newton-dk",
      antiholomorphic: true,
    };
    expect(isMapSpec(bounded)).toBe(true);
    expect(isMapSpec({ ...bounded, phi: { form: "bounded", w0: { re: 0.1, im: -0.2 } } })).toBe(true); // branchless
    // Malformed bounded φ is REJECTED, not silently coerced (the seatbelt owns the guarantee).
    expect(isMapSpec({ ...bounded, phi: { form: "bounded" } })).toBe(false); // w₀ missing
    expect(isMapSpec({ ...bounded, phi: { form: "bounded", w0: { re: 0 } } })).toBe(false); // w₀.im missing
    expect(isMapSpec({ ...bounded, phi: { form: "bounded", w0: { re: 0, im: 0 }, branches: "nope" } })).toBe(false);
    const manyBranches = Array.from({ length: 5000 }, () => ({ z: { re: 0, im: 0 }, A: [{ re: 1, im: 0 }] }));
    expect(isMapSpec({ ...bounded, phi: { form: "bounded", w0: { re: 0, im: 0 }, branches: manyBranches } })).toBe(false); // over-cap
  });
  it("isMapSpec validates the conformal polygon-map form (M2.4c, 1.4.0)", () => {
    // A ConformalMap (schema.ts): engine tag + polygon corners + converged, plus optional fit data. The
    // consumer rebuilds it from `polygon` via @cas/conformal. Minimal + full both validate.
    const minimal: ConformalMap = {
      form: "conformal",
      engine: "sc-exterior",
      polygon: [{ re: 1, im: -1 }, { re: 1, im: 1 }, { re: -1, im: 1 }, { re: -1, im: -1 }],
      converged: true,
    };
    expect(isMapSpec(minimal)).toBe(true);
    expect(isMapSpec({ ...minimal, engine: "sc-interior", angles: [0.5, 0.5, 0.5, 0.5] })).toBe(true);
    expect(
      isMapSpec({
        ...minimal,
        engine: "lightning",
        prevertices: [{ re: 1, im: 0 }, { re: 0, im: 1 }, { re: -1, im: 0 }, { re: 0, im: -1 }],
        constant: { re: 1.18, im: 0 },
        capacity: 1.18,
        degraded: false,
        residual: 1e-13,
      }),
    ).toBe(true);
    // Malformed / hostile inputs are REJECTED (the seatbelt owns the guarantee).
    expect(isMapSpec({ ...minimal, engine: "bogus" })).toBe(false); // unknown engine
    expect(isMapSpec({ ...minimal, polygon: [{ re: 1, im: 0 }] })).toBe(false); // < 2 corners
    expect(isMapSpec({ ...minimal, converged: "yes" })).toBe(false); // non-boolean flag
    expect(isMapSpec({ ...minimal, angles: "nope" })).toBe(false); // non-array angles
    expect(isMapSpec({ ...minimal, capacity: "big" })).toBe(false); // non-finite capacity
    const bigPoly = Array.from({ length: 5000 }, () => ({ re: 0, im: 0 }));
    expect(isMapSpec({ ...minimal, polygon: bigPoly })).toBe(false); // over-cap (untrusted-input bound)
  });
});

describe("validateEnvelope", () => {
  it("accepts a well-formed schwarz-reflection envelope", () => {
    const env = validateEnvelope(schwarzEnvelope());
    expect(env.kind).toBe("schwarz-reflection");
  });

  it("accepts unknown optional fields (forward-compat)", () => {
    const env = { ...schwarzEnvelope(), futureField: 42, payload: { ...schwarzEnvelope().payload, extra: "ok" } };
    expect(() => validateEnvelope(env)).not.toThrow();
  });

  it("rejects a wrong schema id", () => {
    expect(() => validateEnvelope({ ...schwarzEnvelope(), schema: "something-else" })).toThrow(/wrong schema/);
  });

  it("rejects an incompatible major version", () => {
    expect(() => validateEnvelope({ ...schwarzEnvelope(), version: "2.0.0" })).toThrow(/incompatible major/);
  });

  it("rejects an unknown kind", () => {
    expect(() => validateEnvelope({ ...schwarzEnvelope(), kind: "correspondence" })).toThrow(/unknown payload kind/);
  });

  it("rejects a schwarz-reflection missing its conventions tag", () => {
    const bad = schwarzEnvelope();
    const payload = { sigma: bad.payload.sigma } as unknown; // no conventions
    expect(() => validateEnvelope({ ...bad, payload })).toThrow(/conventions/);
  });

  it("rejects a well-formed but NON-canonical conventions tag — the ADR-0006 π/2πi guard", () => {
    // The wire is canonical by contract; a non-canonical tag means a producer failed to convert, and the
    // consumer reads the payload AS canonical (it never inspects the tag). isConventions accepts these as
    // WELL-FORMED, so validateEnvelope must still reject them loudly — otherwise a domain scaled by a stray
    // factor of π / 2πi renders silently, the exact failure ADR-0006 keeps the tag to prevent.
    const nonCanonical = [
      { area: "normalized", contour: "standard" },
      { area: "standard", contour: "suppressed-2pii" },
      { area: "normalized", contour: "suppressed-2pii" },
    ];
    for (const conventions of nonCanonical) {
      const bad = schwarzEnvelope();
      expect(() => validateEnvelope({ ...bad, payload: { sigma: bad.payload.sigma, conventions } })).toThrow(/non-canonical/);
    }
  });

  it("rejects a schwarz-reflection with an invalid sigma", () => {
    expect(() => validateEnvelope({ ...schwarzEnvelope(), payload: { sigma: { form: "nope" }, conventions: CANONICAL } })).toThrow(/MapSpec/);
  });

  it("rejects a non-object and bad provenance", () => {
    expect(() => validateEnvelope(null)).toThrow(/must be an object/);
    expect(() => validateEnvelope({ ...schwarzEnvelope(), provenance: { app: "x" } })).toThrow(/provenance/);
  });

  it("SECURITY: rejects a prototype-pollution key anywhere in the tree", () => {
    // __proto__ as an OWN key from JSON.parse (not the setter) ⇒ throw at the boundary, so the package
    // owns the guarantee instead of relying on every consumer to read named fields defensively.
    const proto = JSON.parse(
      '{"schema":"' + SCHEMA_ID + '","version":"' + VERSION +
        '","kind":"map","payload":{"form":"expr","expr":"z","vars":[],"__proto__":{"x":1}},' +
        '"provenance":{"app":"x","appVersion":"1","createdAt":"t"}}',
    );
    expect(() => validateEnvelope(proto)).toThrow(/forbidden key/);
  });
});

describe("deep-link codec", () => {
  it("round-trips an envelope through encode -> decode", () => {
    const env = schwarzEnvelope();
    const link = encodeLink(env);
    expect(link.startsWith("#s=")).toBe(true);
    expect(link.slice(3)).not.toMatch(/[+/=]/); // payload is url-safe base64, unpadded
    expect(decodeLink(link)).toEqual(env);
  });

  it("decodes from a bare 's=' param and from a full URL hash", () => {
    const link = encodeLink(schwarzEnvelope());
    const payload = link.slice(1); // drop '#'
    expect(decodeLink(payload)).toEqual(schwarzEnvelope()); // "s=..."
    expect(decodeLink(`https://example.com/app/${link}`)).toEqual(schwarzEnvelope()); // full URL
  });

  it("throws on a missing / malformed payload", () => {
    expect(() => decodeLink("#nope=1")).toThrow(/no "s="/);
    expect(() => decodeLink("#s=!!!not-base64-json")).toThrow();
  });
});

describe("deltoid σ golden (S3a)", () => {
  // The σ counterpart of the φ golden: a schwarz-reflection deep link whose sigma is the form:"schwarz"
  // recipe. This package has no σ engine, so it pins the DECODE + the recipe shape; the frozen σ(w₀) is
  // verified against the real engine in @cas/schwarz and reproduced through CD's import path in S4a.
  it("decodes to the form:\"schwarz\" σ recipe over the deltoid φ", () => {
    const env = decodeLink(QD_TO_CD_DELTOID_SIGMA_LINK);
    expect(env.kind).toBe("schwarz-reflection");
    expect(env.version).toBe(VERSION); // minted at 1.1.0 — the version the schwarz form arrived in
    const sigma = (env.payload as SchwarzReflection).sigma;
    expect(sigma).toEqual({
      form: "schwarz",
      phi: { form: "laurent", c: { re: 1, im: 0 }, F: [{ re: 0, im: 0 }, { re: 0, im: 0 }, { re: 0.5, im: 0 }] },
      disk: "D*",
      inverse: "newton-dk",
      antiholomorphic: true,
    });
    // isMapSpec accepts the decoded recipe (validateEnvelope already ran it, but pin it explicitly).
    expect(isMapSpec(sigma)).toBe(true);
    expect(QD_TO_CD_DELTOID_SIGMA_AT_W0).toEqual({ re: 0.5, im: -0.5 }); // the frozen value CD reproduces
  });

  // Phase 2: the pole-bearing σ golden — a `schwarz` recipe whose `sigma.phi` carries finite-pole
  // `branches` (1.2.0). This package has no σ engine, so it pins the DECODE + that the branches survive
  // the wire + validate; CD reconstructs the frozen σ(w₀) from them (importMap.test.ts).
  it("decodes the single-pole σ golden, carrying the finite-pole branches through the seatbelt", () => {
    const env = decodeLink(QD_TO_CD_SINGLE_POLE_SIGMA_LINK); // decodeLink runs validateEnvelope
    expect(env.kind).toBe("schwarz-reflection");
    expect(env.version).toBe(VERSION); // minted at 1.2.0 — the version branches arrived in
    const sigma = (env.payload as SchwarzReflection).sigma as { form: string; phi: LaurentMap };
    expect(sigma.form).toBe("schwarz");
    expect(sigma.phi).toEqual({
      form: "laurent",
      c: { re: 1, im: 0 },
      F: [],
      branches: [{ z: { re: 0.2, im: 0 }, A: [{ re: 0.3, im: 0 }] }],
    });
    expect(isMapSpec(sigma)).toBe(true);
  });
});

describe("RM → potential conformal golden (M2.4c)", () => {
  // The first `form:"conformal"` hand-off (1.4.0): Riemann-Map exports a polygon SC map as a bare
  // `kind:"map"` ConformalMap; 2D-Electrostatics decodes the corners and re-fits the exterior flow map via
  // @cas/conformal. This package has no conformal engine, so it pins the DECODE + the recipe shape; the
  // frozen capacity is reproduced through the consumer's real @cas/conformal fit (its own test).
  it("decodes to the ConformalMap recipe over the side-2 square", () => {
    const env = decodeLink(RM_TO_POTENTIAL_CONFORMAL_LINK); // decodeLink runs validateEnvelope
    expect(env.kind).toBe("map");
    expect(env.version).toBe(VERSION); // minted at 1.4.0 — the version the conformal form arrived in
    const map = env.payload as MapSpec;
    expect(map).toEqual({
      form: "conformal",
      engine: "sc-interior",
      polygon: [{ re: 1, im: -1 }, { re: 1, im: 1 }, { re: -1, im: 1 }, { re: -1, im: -1 }],
      angles: [0.5, 0.5, 0.5, 0.5],
      converged: true,
    });
    expect(isMapSpec(map)).toBe(true);
  });
});

describe("validatePayload — the non-MapSpec structural fields (review P2 / interchange A-02/A-03)", () => {
  const prov = { app: "cd", appVersion: "0.1.0", createdAt: "2026-07-06T00:00:00Z" };
  it("rejects a view envelope with a missing or invalid viewport (was silently trusted)", () => {
    const viewEnv = (viewport: unknown) => ({ schema: SCHEMA_ID, version: VERSION, kind: "view", payload: { map: deltoidSigma, viewport }, provenance: prov });
    expect(() => validateEnvelope(viewEnv(undefined))).toThrow(/viewport/);
    expect(() => validateEnvelope(viewEnv({ center: { re: 0 } }))).toThrow(/viewport/); // center.im missing
    expect(() => validateEnvelope(viewEnv({ center: { re: 0, im: 0 }, zoom: "5" }))).toThrow(/viewport/); // zoom not a number
    expect(validateEnvelope(viewEnv({ center: { re: -0.5, im: 0 }, zoom: 3 })).kind).toBe("view"); // a valid viewport passes
  });
  it("rejects a schwarz-reflection with a malformed escape spec; absent escape is fine", () => {
    const withEscape = (escape: unknown) => ({ ...schwarzEnvelope(), payload: { ...schwarzEnvelope().payload, escape } });
    expect(() => validateEnvelope(withEscape({ predicate: "abs-gt", R: NaN }))).toThrow(/escape/); // non-finite R
    expect(() => validateEnvelope(withEscape({ predicate: "bogus" }))).toThrow(/escape/); // predicate not in the union
    expect(validateEnvelope(withEscape({ predicate: "abs-gt", R: 100 })).kind).toBe("schwarz-reflection"); // valid
    expect(validateEnvelope(withEscape(undefined)).kind).toBe("schwarz-reflection"); // optional — absent is fine
  });
  it("rejects a quadrature-domain with an over-cap boundarySamples array", () => {
    const big = Array.from({ length: 5000 }, () => ({ re: 0, im: 0 })); // > MAX_COEFF_LEN
    const env = { schema: SCHEMA_ID, version: VERSION, kind: "quadrature-domain", payload: { phi: deltoidSigma, bounded: false, conventions: CANONICAL, boundarySamples: big }, provenance: prov };
    expect(() => validateEnvelope(env)).toThrow(/boundarySamples/);
  });
  it("validates a schwarz-reflection's nested sourceDomain — non-canonical conventions rejected (interchange-validate-01)", () => {
    const withSource = (sourceDomain: unknown) => ({ ...schwarzEnvelope(), payload: { ...schwarzEnvelope().payload, sourceDomain } });
    // A nested QD's non-canonical convention tag previously escaped the ADR-0006 canonical-wire guard.
    expect(() => validateEnvelope(withSource({ phi: deltoidSigma, bounded: false, conventions: { area: "normalized", contour: "suppressed-2pii" } }))).toThrow(/non-canonical/);
    expect(() => validateEnvelope(withSource({ phi: { form: "bogus" }, bounded: false, conventions: CANONICAL }))).toThrow(/sourceDomain\.phi/); // malformed nested phi
    expect(validateEnvelope(withSource({ phi: deltoidSigma, bounded: false, conventions: CANONICAL })).kind).toBe("schwarz-reflection"); // canonical sourceDomain passes
    expect(validateEnvelope(withSource(undefined)).kind).toBe("schwarz-reflection"); // optional — absent is fine
  });
  it("rejects a schwarz-reflection whose tilingSetHint.fundamentalTile exceeds the coeff cap", () => {
    const big = Array.from({ length: 5000 }, () => ({ re: 0, im: 0 })); // > MAX_COEFF_LEN
    const withHint = (tilingSetHint: unknown) => ({ ...schwarzEnvelope(), payload: { ...schwarzEnvelope().payload, tilingSetHint } });
    expect(() => validateEnvelope(withHint({ fundamentalTile: big }))).toThrow(/tilingSetHint/);
    expect(validateEnvelope(withHint({ fundamentalTile: [{ re: 0, im: 0 }] })).kind).toBe("schwarz-reflection"); // small tile passes
    expect(validateEnvelope(withHint({})).kind).toBe("schwarz-reflection"); // fundamentalTile optional
  });
});

describe("validateEnvelope — newly-validated declared fields (WP8 / A6)", () => {
  const qdEnvelope = (extra: Record<string, unknown>): unknown => ({
    schema: SCHEMA_ID,
    version: VERSION,
    kind: "quadrature-domain",
    payload: { phi: deltoidSigma, bounded: false, conventions: CANONICAL, ...extra },
    provenance: { app: "quadrature-domains", appVersion: "0.1.0", createdAt: "2026-07-06T00:00:00Z" },
  });
  const viewEnvelope = (extra: Record<string, unknown>): unknown => ({
    schema: SCHEMA_ID,
    version: VERSION,
    kind: "view",
    payload: { map: deltoidSigma, viewport: { center: { re: 0, im: 0 }, zoom: 1 }, ...extra },
    provenance: { app: "complex-dynamics", appVersion: "0.1.0", createdAt: "2026-07-06T00:00:00Z" },
  });

  it("rejects a quadrature-domain with a non-boolean `bounded`", () => {
    expect(() => validateEnvelope(qdEnvelope({ bounded: "yes" }))).toThrow(/bounded/);
  });
  it("rejects a quadrature-domain with an out-of-enum `weight`", () => {
    expect(() => validateEnvelope(qdEnvelope({ weight: "quadratic" }))).toThrow(/weight/);
    expect(validateEnvelope(qdEnvelope({ weight: "log" })).kind).toBe("quadrature-domain"); // valid enum passes
  });
  it("rejects a view whose optional `c` is present but malformed", () => {
    expect(() => validateEnvelope(viewEnvelope({ c: { re: "x", im: 0 } }))).toThrow(/view\.c/);
    expect(validateEnvelope(viewEnvelope({ c: { re: 1, im: 2 } })).kind).toBe("view"); // valid Complex passes
    expect(validateEnvelope(viewEnvelope({})).kind).toBe("view"); // c optional
  });
});
