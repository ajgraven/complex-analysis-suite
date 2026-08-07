import { describe, expect, it } from "vitest";
import {
  CANONICAL,
  SCHEMA_ID,
  VERSION,
  decodeLink,
  encodeLink,
  isMapSpec,
  validateEnvelope,
  type Envelope,
  type LaurentMap,
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
  it("SECURITY: bounds coefficient-array length, expr length, and vars entries", () => {
    const big = Array.from({ length: 5000 }, () => ({ re: 0, im: 0 }));
    expect(isMapSpec({ form: "rational", num: big, den: [{ re: 1, im: 0 }] })).toBe(false); // > MAX_COEFF_LEN
    expect(isMapSpec({ form: "expr", expr: "z", vars: ["z", "drop table"] })).toBe(false); // bad var name
    expect(isMapSpec({ form: "expr", expr: "z", vars: ["z", "c", "a"] })).toBe(true);
    expect(isMapSpec({ form: "expr", expr: "z".repeat(9000), vars: [] })).toBe(false); // > MAX_EXPR_LEN
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
    const env = { schema: SCHEMA_ID, version: VERSION, kind: "quadrature-domain", payload: { phi: deltoidSigma, conventions: CANONICAL, boundarySamples: big }, provenance: prov };
    expect(() => validateEnvelope(env)).toThrow(/boundarySamples/);
  });
});
