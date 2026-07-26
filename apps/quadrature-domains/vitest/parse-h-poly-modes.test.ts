// The polynomial-part mode list must agree with the mode descriptors, for EVERY mode.
//
// parse-h.mjs and ui-h-text.mjs each kept their own copy of "does this mode allow a polynomial part
// of h", and they drifted: the UI listed all five *unbounded* modes (matching ui-modes.mjs's
// `cards.poly: true`), while the engine listed only three — omitting pqd-unbounded and
// pqd-unbounded-singular. So the UI wrote a polynomial part into #h-text for the five shipped
// PQD-unbounded presets and the engine then threw "polynomial part of h is only valid in unbounded
// mode" on it, which also silently broke share-link restore for those presets (ui-url-state.mjs
// re-parses #h-text on load).
//
// There is now one list, exported as QD.modeAllowsPoly. These assertions pin it against the mode
// descriptors, so a mode added to one place and forgotten in the other fails here.
import { describe, expect, it, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";

let modeAllowsPoly: (mode: string) => boolean;

beforeAll(async () => {
  const QD = (await import("../app/solver.mjs")).default as Record<string, unknown>;
  await import("../app/poly-helpers.mjs");
  await import("../app/parse-h.mjs");
  modeAllowsPoly = QD.modeAllowsPoly as typeof modeAllowsPoly;
});

/** Every mode descriptor in ui-modes.mjs, with the `cards.poly` it declares. */
function descriptorPolyFlags(): Array<[string, boolean]> {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "app", "ui-modes.mjs"),
    "utf8",
  );
  const out: Array<[string, boolean]> = [];
  const re = /['"]([a-z-]*(?:bounded|unbounded)[a-z-]*)['"]\s*:\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const poly = /poly:\s*(true|false)/.exec(src.slice(m.index, m.index + 900));
    if (poly) out.push([m[1], poly[1] === "true"]);
  }
  return out;
}

describe("QD.modeAllowsPoly", () => {
  it("is exported from the engine (one source of truth for engine + UI)", () => {
    expect(typeof modeAllowsPoly).toBe("function");
  });

  it("agrees with every mode descriptor's cards.poly", () => {
    const flags = descriptorPolyFlags();
    // Guard the guard: if the scrape stops finding modes, this test would pass vacuously.
    expect(flags.length).toBeGreaterThanOrEqual(10);
    for (const [mode, declared] of flags) {
      expect(modeAllowsPoly(mode), `mode "${mode}" (descriptor says poly=${declared})`).toBe(declared);
    }
  });

  it("allows a polynomial part in the PQD-unbounded modes — the two the engine used to reject", () => {
    expect(modeAllowsPoly("pqd-unbounded")).toBe(true);
    expect(modeAllowsPoly("pqd-unbounded-singular")).toBe(true);
  });

  it("the rule is UNBOUNDED, independent of the weight", () => {
    for (const m of ["unbounded", "pqd-unbounded", "pqd-unbounded-singular", "lqd-unbounded", "lqd-unbounded-singular"])
      expect(modeAllowsPoly(m), m).toBe(true);
    for (const m of ["bounded", "pqd-bounded", "pqd-bounded-singular", "lqd-bounded", "lqd-bounded-singular"])
      expect(modeAllowsPoly(m), m).toBe(false);
  });

  it("an unknown mode does not silently allow a polynomial part", () => {
    // Explicit membership rather than a `mode.includes('unbounded')` sniff: a new mode must opt in.
    expect(modeAllowsPoly("semi-unbounded-experimental")).toBe(false);
    expect(modeAllowsPoly("")).toBe(false);
  });
});
