import { describe, it, expect } from "vitest";
import { initialState, fieldOf, freshId, findSingularity } from "../src/state.js";
import { monopoleKind } from "../src/render/overlay.js";

describe("app state", () => {
  it("initial state has three identified singularities and a sensible view", () => {
    const s = initialState();
    expect(s.singularities).toHaveLength(3);
    const ids = new Set(s.singularities.map((x) => x.id));
    expect(ids.size).toBe(3); // ids are unique
    expect(s.view.halfSpan).toBeGreaterThan(0);
    expect(s.selected).toBeNull();
    expect(s.lens).toBe("electrostatic");
  });

  it("fieldOf snapshots the uniform + singularities for the renderer", () => {
    const s = initialState();
    const f = fieldOf(s);
    expect(f.uniform).toEqual(s.uniform);
    expect(f.singularities).toBe(s.singularities);
  });

  it("freshId is monotonic and findSingularity resolves by id", () => {
    const a = freshId();
    const b = freshId();
    expect(b).toBeGreaterThan(a);
    const s = initialState();
    const first = s.singularities[0];
    expect(findSingularity(s, first.id)).toBe(first);
    expect(findSingularity(s, null)).toBeUndefined();
    expect(findSingularity(s, -999)).toBeUndefined();
  });
});

describe("monopole classification (glyph + colour)", () => {
  it("splits a coefficient c = q + iγ into source / sink / vortex / spiral", () => {
    expect(monopoleKind([1, 0])).toBe("source");
    expect(monopoleKind([-1, 0])).toBe("sink");
    expect(monopoleKind([0, 1])).toBe("vortex");
    expect(monopoleKind([0, -1])).toBe("vortex");
    expect(monopoleKind([1, 1])).toBe("spiral");
    expect(monopoleKind([0, 0])).toBe("source");
  });
});
