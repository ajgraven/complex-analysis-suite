import { describe, expect, it } from "vitest";
import { rootKey, diffEnclosure, type EnclosedRoot } from "../src/crossing.js";

const enc = (kind: "zero" | "pole", z: [number, number], order = 1): EnclosedRoot => ({
  key: rootKey(kind, z),
  kind,
  z,
  order,
});

const mapOf = (rs: EnclosedRoot[]): Map<string, EnclosedRoot> => new Map(rs.map((r) => [r.key, r]));

describe("diffEnclosure (C6 boundary crossings)", () => {
  it("reports a zero that just entered γ", () => {
    const prev = mapOf([]);
    const curr = [enc("zero", [0.5, 0])];
    const events = diffEnclosure(prev, curr);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "zero", entered: true });
    expect(events[0].z).toEqual([0.5, 0]);
  });

  it("reports a pole that just left γ, carrying its stored position", () => {
    const prev = mapOf([enc("pole", [-0.3, 0.2])]);
    const curr: EnclosedRoot[] = [];
    const events = diffEnclosure(prev, curr);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "pole", entered: false });
    expect(events[0].z).toEqual([-0.3, 0.2]);
  });

  it("is silent when the enclosed set is unchanged (no spurious crossings)", () => {
    const set = [enc("zero", [0.5, 0]), enc("pole", [0, 0.5])];
    expect(diffEnclosure(mapOf(set), set)).toEqual([]);
  });

  it("handles a simultaneous enter + leave in one step", () => {
    const prev = mapOf([enc("zero", [1, 0])]);
    const curr = [enc("zero", [-1, 0])];
    const events = diffEnclosure(prev, curr);
    expect(events.filter((e) => e.entered)).toHaveLength(1);
    expect(events.filter((e) => !e.entered)).toHaveLength(1);
  });

  it("rootKey distinguishes kind and position but is stable under tiny jitter", () => {
    expect(rootKey("zero", [1, 0])).not.toBe(rootKey("pole", [1, 0]));
    expect(rootKey("zero", [1.00001, 0])).toBe(rootKey("zero", [1.00002, 0])); // rounds to 4 dp
  });
});
