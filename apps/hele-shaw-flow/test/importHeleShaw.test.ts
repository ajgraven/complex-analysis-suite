import { describe, it, expect } from "vitest";
import {
  QD_TO_HELESHAW_LINK,
  QD_TO_HELESHAW_ALPHA,
  QD_TO_HELESHAW_NODE,
  RM_TO_POTENTIAL_CONFORMAL_LINK,
  CANONICAL,
  SCHEMA_ID,
  VERSION,
  encodeLink,
  type Envelope,
} from "@cas/interchange";
import { heleShawFromLink } from "../src/importHeleShaw.js";

// The consumer side of the QD → Hele-Shaw Flow golden (M4d): decode the SAME frozen link the
// QD producer emits (schwarz-export.test.ts pins the producer half) and recover the one-point charge α.
// A producer→consumer test cannot live in either app, so both pin the shared @cas/interchange golden.

type Cplx = { re: number; im: number };
const c = (re: number, im = 0): Cplx => ({ re, im });
/** Build a Hele-Shaw hand-off link with a given `hData` (a valid placeholder φ rides along). */
function qdLink(hData: unknown): string {
  const env = {
    schema: SCHEMA_ID,
    version: VERSION,
    kind: "quadrature-domain",
    payload: {
      phi: { form: "laurent", c: c(1), F: [], branches: [{ z: c(0.2), A: [c(0.3)] }] },
      bounded: false,
      hData,
      conventions: CANONICAL,
    },
    provenance: { app: "quadrature-domains", appVersion: "0.1.0", createdAt: "2026-07-06T00:00:00Z" },
  } as unknown as Envelope;
  return encodeLink(env);
}
const hRational = (num: Cplx[], den: Cplx[]) => ({ form: "rational", num, den });

describe("heleShawFromLink — the QD → 2D-E golden (consumer side)", () => {
  it("recovers α = i at node w₀ = 2 from the frozen golden link", () => {
    const got = heleShawFromLink(QD_TO_HELESHAW_LINK);
    if (!got || !got.ok) throw new Error("golden link did not decode to a drivable Hele-Shaw charge");
    expect(got.alpha[0]).toBeCloseTo(QD_TO_HELESHAW_ALPHA.re, 12);
    expect(got.alpha[1]).toBeCloseTo(QD_TO_HELESHAW_ALPHA.im, 12);
    // the node pinned in the golden is the engine's fixed w₀
    expect(QD_TO_HELESHAW_NODE).toEqual({ re: 2, im: 0 });
  });
});

describe("heleShawFromLink — null (not this hand-off, use presets)", () => {
  it("ignores a malformed hash, a non-QD kind, and a φ-only quadrature domain", () => {
    expect(heleShawFromLink("#s=not-a-real-link")).toBeNull();
    expect(heleShawFromLink("#nonsense")).toBeNull();
    expect(heleShawFromLink(RM_TO_POTENTIAL_CONFORMAL_LINK)).toBeNull(); // kind:"map" (conformal)
    // a quadrature-domain WITHOUT hData is the φ-only QD→CD hand-off, not a Hele-Shaw recipe
    const env = {
      schema: SCHEMA_ID,
      version: VERSION,
      kind: "quadrature-domain",
      payload: { phi: { form: "laurent", c: c(1), F: [c(0), c(0), c(0.5)] }, bounded: false, conventions: CANONICAL },
      provenance: { app: "quadrature-domains", appVersion: "0.1.0", createdAt: "2026-07-06T00:00:00Z" },
    } as unknown as Envelope;
    expect(heleShawFromLink(encodeLink(env))).toBeNull();
  });
});

describe("heleShawFromLink — honest rejection (a Hele-Shaw recipe the one-point engine can't drive)", () => {
  it("rejects a non-single-simple-pole h", () => {
    // an order-2 pole: den = (w−2)² = w² − 4w + 4 ⇒ [4, −4, 1] (length 3)
    const got = heleShawFromLink(qdLink(hRational([c(1)], [c(4), c(-4), c(1)])));
    expect(got).toEqual({ ok: false, reason: expect.stringMatching(/single simple pole/i) });
  });
  it("rejects a node other than w₀ = 2", () => {
    // h = i/(w − 3): den = [−3, 1]
    const got = heleShawFromLink(qdLink(hRational([c(0, 1)], [c(-3), c(1)])));
    expect(got).toEqual({ ok: false, reason: expect.stringMatching(/node/i) });
  });
  it("rejects a charge outside the admissible parabola", () => {
    // α = 2i at w₀ = 2: 2 + Re α = 2 is NOT > |α| = 2 ⇒ inadmissible
    const got = heleShawFromLink(qdLink(hRational([c(0, 2)], [c(-2), c(1)])));
    expect(got).toEqual({ ok: false, reason: expect.stringMatching(/admissible/i) });
  });
  it("rejects a zero charge (h ≡ 0 — a degenerate non-domain admissible would wave through)", () => {
    const got = heleShawFromLink(qdLink(hRational([c(0, 0)], [c(-2), c(1)])));
    expect(got).toEqual({ ok: false, reason: expect.stringMatching(/zero/i) });
  });
  it("accepts an admissible single pole at w₀ = 2 (negative real charge)", () => {
    // h = −0.5/(w − 2): α = −0.5 (−1 < −0.5 ⇒ admissible)
    const got = heleShawFromLink(qdLink(hRational([c(-0.5)], [c(-2), c(1)])));
    if (!got || !got.ok) throw new Error("expected an admissible import");
    expect(got.alpha[0]).toBeCloseTo(-0.5, 12);
    expect(got.alpha[1]).toBeCloseTo(0, 12);
  });
});
