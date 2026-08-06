// @vitest-environment node
//
// QD -> CD hand-off URL target — regression net for the "Export map -> copy link" bug: the copied
// link stapled the payload hash onto QD's OWN location, so it re-opened QD instead of the Complex
// Dynamics app (which reads "#s=" on load, main.ts:2961). Two layers, matching the codebase's split
// of "pure logic is unit-tested; thin untestable UI wiring is source-pinned" (cf.
// worker-url-static-literal.test.ts):
//   1. resolveHandoffBase / exportPhiDeepLink — pure URL resolution (deploy sibling-swap, explicit
//      override, and the local-dev unresolved case). Unit-tested here.
//   2. a source-pin that schwarz-ui's _exportMap routes the URL through exportPhiDeepLink and no
//      longer hand-rolls `location.origin + location.pathname + <hash>` (which always targeted QD).
// The payload itself (#s=...) is unchanged and stays covered by schwarz-export.test.ts's golden.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { QD_TO_CD_DELTOID_LINK, GOLDEN_CREATED_AT } from "@cas/interchange";
import { resolveHandoffBase, exportPhiDeepLink, CD_APP_ID } from "../app/schwarz/schwarz-export.mjs";

const C = (re: number, im = 0) => ({ re, im });
// The deltoid φ(ζ) = ζ + 1/(2ζ²) — the same φ the cross-app golden is built from.
const deltoidPhi = { unbounded: true, c: 1, polyA: [C(0), C(0), C(0.5)], branches: [] };

// A production-shaped location: the combined Pages deploy serves the apps as siblings.
const DEPLOY = { origin: "https://ajgraven.github.io", pathname: "/complex-analysis-suite/quadrature-domains/" };
const DEPLOY_CD = "https://ajgraven.github.io/complex-analysis-suite/complex-dynamics/";

describe("QD -> CD hand-off base resolution", () => {
  it("combined deploy: swaps the sibling path segment to the CD app", () => {
    expect(resolveHandoffBase(DEPLOY)).toEqual({ base: DEPLOY_CD, resolvable: true, reason: "sibling" });
  });

  it("drops an explicit index.html and still targets the CD sibling", () => {
    const r = resolveHandoffBase({
      origin: DEPLOY.origin,
      pathname: "/complex-analysis-suite/quadrature-domains/index.html",
    });
    expect(r).toEqual({ base: DEPLOY_CD, resolvable: true, reason: "sibling" });
  });

  it("app served at a domain root still swaps the segment", () => {
    const r = resolveHandoffBase({ origin: "https://qd.example", pathname: "/quadrature-domains/" });
    expect(r).toEqual({ base: "https://qd.example/complex-dynamics/", resolvable: true, reason: "sibling" });
  });

  it("an explicit cdBase override wins and is normalized with a trailing slash", () => {
    expect(resolveHandoffBase(DEPLOY, "http://localhost:5174")).toEqual({
      base: "http://localhost:5174/",
      resolvable: true,
      reason: "override",
    });
  });

  it("local dev root (no sibling segment) is flagged unresolvable, not silently wrong", () => {
    const r = resolveHandoffBase({ origin: "http://localhost:5173", pathname: "/" });
    expect(r.resolvable).toBe(false);
    expect(r.reason).toBe("unresolved");
    expect(r.base).toBe("http://localhost:5173/complex-dynamics/");
  });

  it("CD_APP_ID matches the interchange provenance app id / deploy subpath", () => {
    expect(CD_APP_ID).toBe("complex-dynamics");
  });
});

describe("exportPhiDeepLink builds the full CD-targeted URL", () => {
  it("targets the CD app and carries the exact golden payload (not QD)", () => {
    const r = exportPhiDeepLink(deltoidPhi, DEPLOY, { createdAt: GOLDEN_CREATED_AT, appVersion: "0.1.0" });
    expect(r).not.toBeNull();
    expect(r!.url).toBe(DEPLOY_CD + QD_TO_CD_DELTOID_LINK);
    expect(r!.url).toContain("/complex-dynamics/");
    expect(r!.url).not.toContain("/quadrature-domains/"); // the bug: the link re-opened QD
    expect(r!.resolvable).toBe(true);
  });

  it("returns null for a non-exportable φ", () => {
    expect(exportPhiDeepLink({ w0: C(0) }, DEPLOY)).toBeNull();
  });
});

// Source-pin: _exportMap is closure-private and writes to clipboard/DOM, so it can't be unit-mounted.
// Pin — as worker-url-static-literal.test.ts does for the worker-URL bug — that the UI routes through
// the resolver and does not reintroduce the QD-targeting concatenation. RED on the pre-fix _exportMap.
describe("schwarz-ui _exportMap routes through the CD resolver (source-pin)", () => {
  const src = readFileSync(fileURLToPath(new URL("../app/schwarz/schwarz-ui.mjs", import.meta.url)), "utf8");

  it("builds the hand-off URL via exportPhiDeepLink", () => {
    expect(src).toContain("exportPhiDeepLink");
  });

  it("does not hand-roll `location.origin + location.pathname` (that always targeted QD)", () => {
    expect(src).not.toMatch(/location\.origin\s*\+\s*location\.pathname/);
  });
});
