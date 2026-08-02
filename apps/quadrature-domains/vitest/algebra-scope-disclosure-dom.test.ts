// @vitest-environment jsdom
// Operation-scope disclosure — the RENDERED half (refactor Phase 2, QD-ALG-3). The one markup fact D1a
// can break: the scope banner #alg-scope is a SIBLING of #alg-sections, never a descendant — so the
// inspector's opacity fade on #alg-sections (.is-behind-inspector → opacity .55, which composites the
// whole subtree and a child cannot opt out of) cannot dim the very warning the banner exists to show.
// The handler/registry/CSS invariants (which ops read the canvas selection, the SELECTION_SCOPED
// registry, scopeCaveat/scopeNote wiring, renderScopeBanner building nodes not innerHTML, the style.css
// opacity-override check) stay in the node companion algebra-scope-disclosure.test.ts.
import { describe, it, expect, beforeAll } from "vitest";
import { mountAlgebra, type AlgebraMount } from "./_algebra-mount";

let m: AlgebraMount;
beforeAll(async () => { m = await mountAlgebra(); });

describe("the scope banner is placed so the inspector fade cannot dim it", () => {
  it("#alg-scope renders OUTSIDE #alg-sections, ahead of it in document order", () => {
    const banner = m.$("#alg-scope");
    const sections = m.$("#alg-sections");
    expect(banner, "the scope banner renders").toBeTruthy();
    expect(sections, "the sections container renders").toBeTruthy();
    expect(banner!.closest("#alg-sections"), "banner must not be inside #alg-sections").toBeNull();
    expect(
      !!(banner!.compareDocumentPosition(sections!) & Node.DOCUMENT_POSITION_FOLLOWING),
      "#alg-scope should precede #alg-sections",
    ).toBe(true);
  });
});
