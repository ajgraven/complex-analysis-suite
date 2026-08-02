// @vitest-environment jsdom
// Full-DOM characterization of the mounted Algebra sidebar (refactor Phase 3, D1a / QD-ALG-2).
//
// The structural `-dom` companions pin SPECIFIC facts (section order, labels, tooltips, banner
// placement, busy-lock markers). This pins the WHOLE rendered #controls-algebra — every control, in
// order, with its attributes — as one normalized fingerprint. It exists to guard the D1a rewrite of
// mountSidebar (one ~390-line innerHTML string → a data-described build): the data-driven version must
// reproduce this DOM byte-for-byte (modulo insignificant inter-tag whitespace), so any control that
// silently moves, drops, or changes an attribute fails here even if no structural assertion covers it.
//
// Whitespace between tags is collapsed (it is not semantic — jsdom keeps it as text nodes, but the
// hand-written string and a renderer indent differently); text WITHIN elements (labels, captions) is
// preserved. The mount is deterministic for an empty store, so the snapshot is stable run-to-run.
import { describe, it, expect, beforeAll } from "vitest";
import { mountAlgebra, type AlgebraMount } from "./_algebra-mount";

const normalize = (html: string) => html.replace(/>\s+</g, "><").trim();

let m: AlgebraMount;
beforeAll(async () => { m = await mountAlgebra(); });

describe("the mounted sidebar renders a stable, complete DOM (D1a fingerprint)", () => {
  it("matches the pinned #controls-algebra fingerprint", () => {
    expect(normalize(m.container.innerHTML)).toMatchSnapshot();
  });
});
