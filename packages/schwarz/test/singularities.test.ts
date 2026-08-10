import { describe, expect, it } from "vitest";
import {
  makeUnboundedLaurentSchwarz,
  makeBoundedSchwarz,
  findSigmaSingularities,
  type Complex,
} from "../src/index.js";

// σ-singularities (F4h): branch points (zeros of φ′) + σ-poles (φ(z_j) for the bounded branch). The deltoid
// is the ground truth — φ′ = 1 − 1/z³ vanishes at the three cube roots of unity, which φ carries to the
// domain's three cusps φ(1), φ(e^{±2πi/3}).

const near = (a: Complex, b: Complex, p = 3): boolean =>
  Math.abs(a[0] - b[0]) < 10 ** -p && Math.abs(a[1] - b[1]) < 10 ** -p;

describe("@cas/schwarz findSigmaSingularities (F4h)", () => {
  const DELTOID = makeUnboundedLaurentSchwarz(1, [[0, 0], [0, 0], [0.5, 0]]);

  it("the deltoid has NO finite σ-poles and exactly 3 branch points — its cusps", () => {
    const s = findSigmaSingularities(DELTOID, []);
    expect(s.poles).toHaveLength(0);
    expect(s.branchPoints).toHaveLength(3);
    // The three cusps φ(1) = 1.5, φ(e^{±2πi/3}) = −0.75 ± 1.299i, in any order.
    const cusps: Complex[] = [[1.5, 0], [-0.75, 1.29904], [-0.75, -1.29904]];
    for (const cusp of cusps) {
      expect(s.branchPoints.some((b) => near(b.w, cusp)), `missing cusp ${cusp}`).toBe(true);
    }
    // Each critical point sits on |z| = 1 (the cube roots of unity).
    for (const b of s.branchPoints) expect(Math.hypot(b.z[0], b.z[1])).toBeCloseTo(1, 4);
  });

  it("the unit disk (φ(z) = z, φ′ ≡ 1) has no singularities at all", () => {
    const disk = makeUnboundedLaurentSchwarz(1, []);
    const s = findSigmaSingularities(disk, []);
    expect(s.poles).toHaveLength(0);
    expect(s.branchPoints).toHaveLength(0); // φ′ = 1 never vanishes
  });

  it("a bounded map's σ-pole is the forward image φ(z_j), where σ genuinely blows up", () => {
    // LOBE: φ(z) = 0.5z/(1−0.3z), one interior pole z_j = 0.3 ⇒ σ-pole at w = φ(0.3) = 0.5·0.3/0.91 ≈ 0.1648.
    const LOBE = makeBoundedSchwarz([0, 0], [{ z: [0.3, 0], A: [[0.5, 0]] }]);
    const s = findSigmaSingularities(LOBE, [{ z: [0.3, 0], A: [[0.5, 0]] }], { bounded: true });
    expect(s.poles).toHaveLength(1);
    expect(s.poles[0].order).toBe(1);
    expect(s.poles[0].label).toBe("a₁");
    expect(near(s.poles[0].w, [0.5 * 0.3 / 0.91, 0], 4)).toBe(true);
    // It IS a pole: σ there overflows far past any escape radius.
    const back = LOBE.sigma(s.poles[0].w);
    expect(back).not.toBeNull();
    if (back) expect(Math.hypot(back[0], back[1])).toBeGreaterThan(1e6);
  });

  it("an UNBOUNDED map's interior pole gives NO finite σ-pole (it sits at ∞)", () => {
    // The exterior branch never reaches the interior pole z_j, so there is no finite σ-pole marker.
    const single = makeUnboundedLaurentSchwarz(1, [], [{ z: [0.2, 0], A: [[0.3, 0]] }]);
    const s = findSigmaSingularities(single, [{ z: [0.2, 0], A: [[0.3, 0]] }], { bounded: false });
    expect(s.poles).toHaveLength(0);
  });
});
