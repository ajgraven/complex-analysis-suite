// @vitest-environment jsdom
//
// **The typeset cache is a cache, and it is BOUNDED** — the 2026-09-20 review.
//
// `math.ts` renders each distinct formula once and keeps the HTML, which is what makes a contour
// drag cost one map read rather than a KaTeX parse per frame. Its comment said the map was
// *"unbounded on purpose: the corpus of formulas is finite and small"*, and the corpus is — 1,270
// distinct formulas over the app's 43 states. What is not finite is the SANDBOX: the Integrand card
// previews what the parser read on every keystroke, so typing one expression mints an entry per
// prefix and a session spent typing grows the map without limit.
//
// `test/shell2.test.ts` already asserts the HIT side (a second render of the same formula adds
// nothing). This file asserts the other half, which had nothing at all. **One test, because the
// cache is module state**: a second `it` would start where the first one left it, at the ceiling,
// where a hit and a miss are indistinguishable by size alone.
import { describe, expect, it } from "vitest";

import { math, renderCacheHolds, renderCacheLimit, renderedCount } from "../src/shell/math.js";

describe("the KaTeX cache", () => {
  it("stays under its ceiling, and evicts what was not asked for again", () => {
    // A formula of the app's own kind, asked for repeatedly the way a card's is on every render.
    const resident = "\\oint_\\gamma f(z)\\,dz";
    math(resident);
    // The one minted first and never asked for again — a keystroke's preview, in effect.
    const draft = "y + 0";
    math(draft);
    expect(renderCacheHolds(resident) && renderCacheHolds(draft), "nothing was cached at all").toBe(true);

    // Fill to just under the ceiling, so `resident` and `draft` are the two OLDEST entries and no
    // eviction has run yet.
    for (let i = 1; i < renderCacheLimit - 8; i++) math(`y + ${i}`);
    expect(renderedCount(), "the cache is already evicting, so the two oldest are not pinned").toBe(
      renderCacheLimit - 7,
    );

    // **The one gesture the LRU is about**: `resident` is asked for AGAIN here, at the very end of
    // the fill, and `draft` is not. Re-inserting on a hit is what turns that ask into recency; a
    // cache that only ordered by FIRST insertion would leave both of them where they were.
    math(resident);

    // Enough further formulas to evict everything that is still at the front of the order.
    for (let i = 0; i < 64; i++) math(`z + ${i}`);

    expect(renderedCount(), "the cache grew past its ceiling").toBeLessThanOrEqual(renderCacheLimit);
    // It did not stop caching, and it was not simply cleared at the cliff: a `RENDERED.clear()`
    // eviction leaves this near 1.
    expect(renderedCount(), "the cache was emptied rather than evicted from").toBeGreaterThan(renderCacheLimit / 2);

    // **The LRU, which is what makes the bound cost nothing.** The app's own formulas are asked for
    // on every render and a keystroke's preview is asked for once, so re-inserting on a hit is
    // exactly what keeps the corpus resident and evicts the drafts.
    expect(renderCacheHolds(resident), "the formula asked for again was evicted anyway").toBe(true);
    expect(renderCacheHolds(draft), "a formula asked for once, thousands ago, is still held").toBe(false);
  });
});
