// The wedge template, and the one thing about it that is not geometry: a coefficient that is itself
// a parameter.
//
// The affine `Scalar` claimed to cover every contour template in the gallery, and F1 is the
// counter-example — `R·e^{2πi/n}` is a product of two parameters. These tests pin the property that
// makes the widening safe rather than a slide toward an expression language: a `derived` coefficient
// is FROZEN at instantiation, so the product still has exactly one live factor and the picture stays
// closed under every drag.
import { describe, expect, it } from "vitest";
import { isClosed, arcLength } from "../src/kernel/geom.js";
import type { Contour } from "../src/engine/contour/model.js";
import { resolveAll, resolveScalar, pt } from "../src/engine/contour/model.js";
import { translateContour, radiusDragValue, handlesOf, setParam } from "../src/engine/contour/edit.js";
import { wedgeTemplate } from "../src/engine/contour/templates.js";

const P = (value: number, range: readonly [number, number] = [-1e6, 1e6]) => ({
  name: "x",
  value,
  range,
  scale: "linear" as const,
});

describe("Scalar with a parameter coefficient", () => {
  const params = {
    R: { ...P(4), name: "R" },
    k: { ...P(0.25), name: "k" },
  };

  it("multiplies by the named parameter's value", () => {
    expect(resolveScalar({ param: "R", mul: { param: "k" } }, params)).toBeCloseTo(1, 12);
    expect(resolveScalar({ param: "R", mul: { param: "k" }, add: 3 }, params)).toBeCloseTo(4, 12);
  });

  it("leaves a LITERAL coefficient byte-identical — the widening is additive", () => {
    expect(resolveScalar({ param: "R", mul: -1 }, params)).toBe(-4);
    expect(resolveScalar({ param: "R" }, params)).toBe(4);
    expect(resolveScalar(7, params)).toBe(7);
  });

  it("THROWS on a coefficient naming a parameter that is not there", () => {
    // Not `?? 1`. A missing coefficient read as the identity would draw the wedge's return ray along
    // the positive real axis, on top of the outgoing one — a degenerate contour that `isClosed`
    // accepts and every winding number then reads as zero.
    expect(() => resolveScalar({ param: "R", mul: { param: "nope" } }, params)).toThrow(/nope/);
  });
});

describe("wedgeTemplate", () => {
  it("is closed, and STAYS closed as R moves — the ray follows the arc", () => {
    // The claim the widening exists for. Were the ray's endpoint a `derived` value it would be
    // frozen at instantiation: the arc, bound to `{param:"R"}`, would follow a drag and the ray
    // would not, opening a contour whose ledger had just certified it closed.
    for (const n of [2, 3, 4, 5, 6, 7, 8]) {
      const w = wedgeTemplate(n, 4);
      for (const R of [0.5, 4, 40, 1000]) {
        expect(isClosed(resolveAll(setParam(w, "R", R)))).toBe(true);
      }
    }
  });

  it("puts the return ray at exactly 2π/n, and the arc's sweep with it", () => {
    for (const n of [2, 3, 5, 7]) {
      const angle = (2 * Math.PI) / n;
      const at = resolveAll(setParam(wedgeTemplate(n, 4), "R", 9));
      const arc = at[1];
      const ray = at[2];
      if (arc?.kind !== "arc" || ray?.kind !== "segment") throw new Error("expected arc then segment");
      expect(arc.theta1 - arc.theta0).toBeCloseTo(angle, 12);
      expect(Math.atan2(ray.from[1], ray.from[0])).toBeCloseTo(angle > Math.PI ? angle - 2 * Math.PI : angle, 12);
      expect(Math.hypot(...ray.from)).toBeCloseTo(9, 12);
      expect(ray.to).toEqual([0, 0]);
    }
  });

  it("takes n rather than an angle, so a wedge that relates nothing cannot be drawn", () => {
    // F1's first trap, structural. `f(ωz) = μ f(z)` holds for `ω = e^{2πi/n}` and no other rotation,
    // so an angle the template could be handed directly is an angle at which the return ray is not a
    // rotation of the outgoing one at all. The arc's sweep is 2π/n by construction here.
    const sweeps = [2, 3, 4, 5, 6].map((n) => {
      const a = resolveAll(wedgeTemplate(n, 4))[1];
      if (a?.kind !== "arc") throw new Error("expected an arc");
      return a.theta1 - a.theta0;
    });
    sweeps.forEach((s, k) => expect(s).toBeCloseTo((2 * Math.PI) / (k + 2), 12));
  });

  it("declares its three roles: target, vanish (L2), reproduces", () => {
    const w = wedgeTemplate(3, 4);
    expect(w.pieces.map((p) => p.role)).toEqual(["target", "vanish", "reproduces"]);
    expect(w.pieces[1]?.lemma).toBe("L2");
    // The return ray carries NO lemma: it does not vanish, and asking one to kill it is the
    // rotational form of E1's first trap.
    expect(w.pieces[2]?.lemma).toBeUndefined();
  });

  it("stays closed, and rigid, under translation", () => {
    const w = wedgeTemplate(3, 4);
    const before = resolveAll(w).map(arcLength);
    for (const d of [[1, 0], [-2.5, 0.75], [0, -4]] as const) {
      const moved = translateContour(w, d);
      expect(isClosed(resolveAll(moved))).toBe(true);
      resolveAll(moved)
        .map(arcLength)
        .forEach((len, k) => expect(len).toBeCloseTo(before[k] ?? NaN, 12));
      // And it is still a template: R still drives it after the drag.
      expect(isClosed(resolveAll(setParam(moved, "R", 17)))).toBe(true);
    }
  });

  it("offers the R handle, and the drag inverts a parameter coefficient", () => {
    const w = wedgeTemplate(3, 4);
    const handles = handlesOf(w, resolveAll(w));
    expect(handles.map((h) => h.param)).toEqual(["R"]);

    // An arc whose RADIUS carries a parameter coefficient: `r = k·R`, so a handle dragged to 3 with
    // `k = 1/2` means `R = 6`. The inversion is the same one a literal coefficient gets.
    const scaled: Contour = {
      pieces: [
        {
          id: "arc",
          name: "arc",
          geom: {
            kind: "arc",
            center: pt(0, 0),
            radius: { param: "R", mul: { param: "k" } },
            theta0: 0,
            theta1: Math.PI,
          },
          role: "free",
          colour: 0,
        },
      ],
      params: {
        R: { name: "R", value: 4, range: [0.1, 100], scale: "linear" },
        k: { name: "k", value: 0.5, range: [0.1, 4], scale: "linear" },
      },
    };
    const h = handlesOf(scaled, resolveAll(scaled))[0];
    if (h === undefined) throw new Error("expected a radius handle");
    expect(radiusDragValue(scaled, h, [3, 0])).toEqual({ param: "R", value: 6 });
    // A coefficient naming a parameter that is not in the contour is not a handle to move.
    const orphan: Contour = {
      ...scaled,
      params: { R: { name: "R", value: 4, range: [0.1, 100], scale: "linear" } },
    };
    expect(radiusDragValue(orphan, h, [3, 0])).toBeNull();
  });
});
