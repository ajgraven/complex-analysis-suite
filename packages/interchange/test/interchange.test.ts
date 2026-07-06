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
    expect(isMapSpec({ form: "expr", expr: "conj(z)^2 + c", vars: ["z", "c"] })).toBe(true);
    expect(isMapSpec({ form: "laurent", c: { re: 1, im: 0 } })).toBe(false); // missing F
    expect(isMapSpec({ form: "bogus" })).toBe(false);
    expect(isMapSpec(null)).toBe(false);
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

  it("rejects a schwarz-reflection with an invalid sigma", () => {
    expect(() => validateEnvelope({ ...schwarzEnvelope(), payload: { sigma: { form: "nope" }, conventions: CANONICAL } })).toThrow(/MapSpec/);
  });

  it("rejects a non-object and bad provenance", () => {
    expect(() => validateEnvelope(null)).toThrow(/must be an object/);
    expect(() => validateEnvelope({ ...schwarzEnvelope(), provenance: { app: "x" } })).toThrow(/provenance/);
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
