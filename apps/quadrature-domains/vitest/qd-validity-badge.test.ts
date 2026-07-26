// The QD tab's validity badge must not present an ESTIMATE as a certified quadrature domain.
//
// `showQDSolution` (ui.mjs) renders a φ handed over from the Algebra tab. It used to hardcode
// `univalent: true, identityOK: true` on the strength of an in-code claim that "the algebra tab has
// already certified the φ univalent" — an invariant the caller never enforced. certifyLeaf pushes a
// φ onto its genuine list even when neither `exactPoint` nor `atRootCertified` holds (row-noted
// '[rationalized ≈]', verdict rigor below 'exact'), so an ≈ result rendered in the QD tab as an
// unqualified "✓ Valid quadrature domain".
//
// The hand-off now carries the verdict's rigor and the badge distinguishes the two cases.
import { describe, expect, it, beforeAll } from "vitest";

let badge: (sol: unknown) => { cls: string; text: string };

beforeAll(async () => {
  await import("../app/ui-solve.mjs");
  const { QD_UI } = await import("../app/ui-registry.mjs");
  badge = (QD_UI as Record<string, unknown>).qdValidityBadge as typeof badge;
});

const certified = { univalent: true, identityOK: true, univalenceCertified: true };
const estimated = { univalent: true, identityOK: true, univalenceCertified: false };
const solverMade = { univalent: true, identityOK: true }; // no field: the ordinary solver path

describe("qdValidityBadge honest labelling", () => {
  it("exposes the helper for testing", () => {
    expect(typeof badge).toBe("function");
  });

  it("a certified hand-off earns the unqualified ✓", () => {
    const b = badge(certified);
    expect(b.cls).toBe("ok");
    expect(b.text).toContain("✓");
    expect(b.text).not.toContain("≈");
  });

  it("an UNCERTIFIED hand-off must not read as certified", () => {
    const b = badge(estimated);
    expect(b.cls).not.toBe("ok"); // was 'ok' + "✓ Valid quadrature domain" pre-fix
    expect(b.text).not.toContain("✓");
    expect(b.text).toContain("≈"); // says plainly that univalence is estimated
    expect(b.text.toLowerCase()).toContain("not certified");
  });

  it("does NOT claim the boundary self-intersects when univalence merely wasn't certified", () => {
    // The failure mode to avoid in the other direction: an unproven claim is not a disproof.
    expect(badge(estimated).text).not.toContain("self-intersect");
  });

  it("leaves the ordinary solver path byte-identical (field absent ⇒ unchanged verdict)", () => {
    expect(badge(solverMade)).toEqual({ cls: "ok", text: "✓ Valid quadrature domain" });
  });

  it("still reports the genuinely bad cases", () => {
    expect(badge(null).cls).toBe("err");
    expect(badge({ univalent: false, identityOK: false }).cls).toBe("err");
    expect(badge({ univalent: false, identityOK: true }).text).toContain("self-intersects");
    expect(badge({ univalent: true, identityOK: false }).text).toContain("identity");
  });
});
