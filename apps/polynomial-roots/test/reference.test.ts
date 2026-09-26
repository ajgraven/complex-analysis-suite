import { describe, it, expect } from "vitest";
import { compileAlphabet } from "../src/engine/alphabet";
import { orbitSpace } from "../src/engine/orbits";
import { sweepChunk } from "../src/engine/sweep";
import {
  centreOnRoot,
  coefficientString,
  emptyFrame,
  nearestRoot,
  packFrame,
  rootAt,
  residualCertified,
  runReference,
  MAX_REFERENCE_DEPTH,
} from "../src/engine/deep/reference";
import type { ReferenceResult } from "../src/engine/deep/reference";

const LITTLEWOOD = { preset: "littlewood" } as const;
const ok = (r: ReferenceResult | { error: string }): ReferenceResult => {
  if ("error" in r) throw new Error(r.error);
  return r;
};

/** The zoom story's own root: an exact root of one degree-26 Littlewood polynomial. */
const STORY_CX = "4.206512041286740015298812143756041e-1";
const STORY_CY = "4.8372964222232227103378339664795e-1";

describe("the deep walk against the root engine", () => {
  it("finds EXACTLY the roots the sweep finds, in the same window", () => {
    // The strongest statement available, and the one that pins the whole engine at once: the root
    // engine enumerates every proper polynomial up to degree 12 and solves it; the deep walk prunes the
    // same tree at one point and solves what survives. In a window both can see, the two must produce
    // the same set of roots — which tests the pruning, the properness rule, the unit reduction and the
    // Newton polish together, against a computation that shares none of them.
    const alphabet = compileAlphabet(LITTLEWOOD);
    if ("error" in alphabet) throw new Error(alphabet.error);
    const cx = 0.6;
    const cy = 0.45;
    const halfHeight = 0.05;
    const aspect = 1.55;
    const halfWidth = halfHeight * aspect;
    const maxDegree = 12;

    const fromSweep: { x: number; y: number }[] = [];
    for (let degree = 1; degree <= maxDegree; degree++) {
      const space = orbitSpace(alphabet.alphabet, degree);
      const swept = sweepChunk({ spec: LITTLEWOOD, degree, lo: 0, hi: space.total, circleDelta: 0.02 });
      if ("error" in swept) throw new Error(swept.error);
      for (let p = 0; p + 2 < swept.points.length; p += 3) {
        const x0 = swept.points[p];
        const y0 = swept.points[p + 1];
        for (const g of alphabet.alphabet.group) {
          let x = x0;
          let y = y0;
          if (g.conj) y = -y;
          if (g.rev) {
            const d = x * x + y * y;
            x = x / d;
            y = -y / d;
          }
          if (g.neg) {
            x = -x;
            y = -y;
          }
          if (Math.abs(x - cx) >= halfWidth || Math.abs(y - cy) >= halfHeight) continue;
          // DEDUPED. The sweep enumerates orbit representatives and mirrors each over the whole group,
          // so a polynomial fixed by a group element yields the same root twice; the walk enumerates up
          // to UNITS and lists each polynomial once. Measured, the difference is exactly three of 150 —
          // and the first draft of this test read those three as roots the walk had missed.
          if (fromSweep.some((q) => Math.hypot(q.x - x, q.y - y) < 1e-6)) continue;
          fromSweep.push({ x, y });
        }
      }
    }

    const run = ok(
      runReference({
        alphabet: LITTLEWOOD,
        cx: String(cx),
        cy: String(cy),
        halfHeight,
        aspect,
        depth: maxDegree,
        precision: "float64",
        budget: 4e6,
      }),
    );
    const fromWalk = run.roots.filter((r) => r.degree <= maxDegree).map((r) => ({ x: cx + r.dx, y: cy + r.dy }));

    // Measured: 147 distinct roots of degree ≤ 12 land in this window (150 before deduping).
    expect(fromSweep.length, "the sweep found nothing — the corpus is vacuous").toBeGreaterThan(100);
    // The sweep's points are a Float32Array (they are GPU vertex data), so they carry seven digits; the
    // pairing tolerance is that, not the walk's.
    const unmatched: string[] = [];
    const used = new Set<number>();
    for (const s of fromSweep) {
      let best = -1;
      let bestDist = 1e-5;
      fromWalk.forEach((w, i) => {
        if (used.has(i)) return;
        const d = Math.hypot(w.x - s.x, w.y - s.y);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      if (best < 0) unmatched.push(`${s.x.toFixed(7)},${s.y.toFixed(7)}`);
      else used.add(best);
    }
    expect(unmatched.slice(0, 5).join(" | "), "roots the sweep found and the walk missed").toBe("");
    expect(used.size).toBe(fromSweep.length);
    // And the other direction: nothing invented. Multiplicity aside, the two lists are the same length.
    expect(fromWalk.length).toBe(fromSweep.length);
  });

  it("can fail — a walk one degree too shallow misses roots the sweep has", () => {
    // An inclusion test nothing can violate is not evidence.
    const run = ok(
      runReference({
        alphabet: LITTLEWOOD,
        cx: "0.6",
        cy: "0.45",
        halfHeight: 0.05,
        aspect: 1.55,
        depth: 8,
        precision: "float64",
        budget: 4e6,
      }),
    );
    const deep = ok(
      runReference({
        alphabet: LITTLEWOOD,
        cx: "0.6",
        cy: "0.45",
        halfHeight: 0.05,
        aspect: 1.55,
        depth: 12,
        precision: "float64",
        budget: 4e6,
      }),
    );
    expect(run.roots.length).toBeLessThan(deep.roots.length);
  });
});

describe("precision", () => {
  it("float64 and double-double agree EXACTLY while a double can still place the centre", () => {
    // Measured: the root sets are identical from 1e-10 to 1e-13, with the offsets differing by 9.1e-7 of
    // a view height at 1e-10 and 1.0e-3 at 1e-13; at 1e-14 the sets part; by 1e-24 float64 finds nothing
    // at all. The engine switches at 1e-11, where the disagreement is a hundredth of a texel.
    const r = Math.hypot(Number(STORY_CX), Number(STORY_CY));
    for (const halfHeight of [1e-10, 1e-12, 1e-13]) {
      const depth = Math.ceil(Math.log(halfHeight * 1.85) / Math.log(r)) + 4;
      const base = { alphabet: LITTLEWOOD, cx: STORY_CX, cy: STORY_CY, halfHeight, aspect: 1.55, depth };
      const a = ok(runReference({ ...base, precision: "float64" }));
      const b = ok(runReference({ ...base, precision: "dd" }));
      const key = (x: { digits: readonly number[] }): string => x.digits.join("");
      expect(a.roots.map(key).sort(), `${halfHeight}`).toEqual(b.roots.map(key).sort());
      expect(a.roots.length, `${halfHeight}`).toBeGreaterThan(100);
    }
  });

  it("and part company where a double runs out, which is why there are two", () => {
    const halfHeight = 1e-18;
    const r = Math.hypot(Number(STORY_CX), Number(STORY_CY));
    const depth = Math.ceil(Math.log(halfHeight * 1.85) / Math.log(r)) + 4;
    const base = { alphabet: LITTLEWOOD, cx: STORY_CX, cy: STORY_CY, halfHeight, aspect: 1.55, depth };
    const a = ok(runReference({ ...base, precision: "float64" }));
    const b = ok(runReference({ ...base, precision: "dd" }));
    // The float64 run still reports roots — it is not obviously broken, which is the danger — but they
    // are a different set, and every low degree has vanished because its centre is off by more than the
    // whole view.
    expect(Math.min(...a.roots.map((x) => x.degree))).toBeGreaterThan(60);
    expect(Math.min(...b.roots.map((x) => x.degree))).toBe(26);
    expect(a.roots.length).not.toBe(b.roots.length);
  });

  it("the residual is the certificate, and it is the arithmetic's own", () => {
    const halfHeight = 1e-12;
    const r = Math.hypot(Number(STORY_CX), Number(STORY_CY));
    const depth = Math.ceil(Math.log(halfHeight * 1.85) / Math.log(r)) + 4;
    const base = { alphabet: LITTLEWOOD, cx: STORY_CX, cy: STORY_CY, halfHeight, aspect: 1.55, depth };
    const a = ok(runReference({ ...base, precision: "float64" }));
    const b = ok(runReference({ ...base, precision: "dd" }));
    // Measured: 1.8e-16 in float64, 1.5e-32 in double-double — 53 bits and 106 bits, visible.
    expect(Math.max(...a.roots.map((x) => x.residual))).toBeLessThan(1e-14);
    expect(Math.max(...a.roots.map((x) => x.residual))).toBeGreaterThan(1e-18);
    expect(Math.max(...b.roots.map((x) => x.residual))).toBeLessThan(1e-30);
  });

  it("reaches 10⁻³⁰ — ADR-0046's stated floor, and the milestone's gate", () => {
    const halfHeight = 1e-30;
    const r = Math.hypot(Number(STORY_CX), Number(STORY_CY));
    const depth = Math.ceil(Math.log(halfHeight * 1.85) / Math.log(r)) + 4;
    expect(depth).toBeLessThanOrEqual(MAX_REFERENCE_DEPTH);
    const run = ok(
      runReference({
        alphabet: LITTLEWOOD,
        cx: STORY_CX,
        cy: STORY_CY,
        halfHeight,
        aspect: 1.55,
        depth,
        precision: "dd",
      }),
    );
    // Measured: 2,223 roots of degree 26–158 from 15,871 nodes, worst backward error 1.549e-32.
    expect(run.exhausted).toBe(false);
    expect(run.roots.length).toBeGreaterThan(1000);
    expect(Math.max(...run.roots.map((x) => x.degree))).toBeGreaterThan(140);
    // **The polish reaches the ARITHMETIC's own floor**, and the bound says so rather than merely being
    // satisfied: at `|α| ≈ 0.64` the double-double's eps is `2⁻¹⁰⁶ = 1.2e-32`, so 1.549e-32 is 1.3 of
    // them and `1e-31` is eight. Float64 on the same view is 1.8e-16 — fifteen orders away, which is
    // what this decade of tightening over the original `1e-30` is testing for.
    expect(Math.max(...run.roots.map((x) => x.residual))).toBeLessThan(1e-31);
    // The picture is roots, not a blur: the nearest is at the centre and the rest spread across the view.
    expect(Math.hypot(run.roots[0].dx, run.roots[0].dy)).toBeLessThan(1e-32);
    expect(Math.max(...run.roots.map((x) => Math.hypot(x.dx, x.dy)))).toBeGreaterThan(halfHeight / 2);
  });
});

describe("the deflation loop", () => {
  it("reports each root ONCE — deflation may not hand back one it has already found", () => {
    // `couldReach` stops the deflation loop when what is LEFT provably has no root in the view. Without
    // it the loop runs its full eight passes, Newton on an over-deflated polynomial converges back into
    // a basin already visited, and the re-polish on the ORIGINAL lands on a root already in the list.
    // Measured at 1e-12: **414 rows for 399 roots, 15 of them exact repeats**, at 31× the cost (150 ms
    // → 4,689 ms; 3.4 s → 374.5 s at 1e-30). No root is MISSED either way, so the value is the same
    // number reported twice — and that is not cosmetic, because the deep picture's density IS the
    // multiplicity: a duplicate is a dot that does not exist.
    const halfHeight = 1e-12;
    const r = Math.hypot(Number(STORY_CX), Number(STORY_CY));
    const run = ok(
      runReference({
        alphabet: LITTLEWOOD,
        cx: STORY_CX,
        cy: STORY_CY,
        halfHeight,
        aspect: 1.55,
        depth: Math.ceil(Math.log(halfHeight * 1.85) / Math.log(r)) + 4,
        precision: "dd",
      }),
    );
    const keys = run.roots.map((x) => `${x.digits.join("")}@${x.dx.toExponential(10)},${x.dy.toExponential(10)}`);
    expect(keys.length).toBeGreaterThan(300);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("a centre is never inherited", () => {
  it("re-deriving it is what makes a deep view reachable at all", () => {
    // The finding this exists for. A `ReferenceRoot` carries a float64 OFFSET, so a centre built by
    // adding one to the old centre is accurate to about 1e-17. Measured: at a half-height of 1e-18 such
    // a centre puts |P(z₀)| at 4.4e-17 against an ε of 1.4e-17, and the walk finds NOTHING — including
    // the very polynomial the centre was taken from.
    const shallow = ok(
      runReference({
        alphabet: LITTLEWOOD,
        cx: "0.42065",
        cy: "0.48354",
        halfHeight: 2e-4,
        aspect: 1.55,
        depth: 26,
        precision: "float64",
        budget: 2e6,
      }),
    );
    const near = shallow.roots[0];
    expect(near.degree).toBe(26);

    const naive = {
      cx: String(0.42065 + near.dx),
      cy: String(0.48354 + near.dy),
    };
    const derived = centreOnRoot(LITTLEWOOD, near.digits, "0.42065", "0.48354", "dd");
    if ("error" in derived) throw new Error(derived.error);

    const halfHeight = 1e-24;
    const r = Math.hypot(Number(derived.cx), Number(derived.cy));
    const depth = Math.ceil(Math.log(halfHeight * 1.85) / Math.log(r)) + 4;
    const base = { alphabet: LITTLEWOOD, halfHeight, aspect: 1.55, depth, precision: "dd" as const };
    expect(ok(runReference({ ...base, ...naive })).roots.length).toBe(0);
    expect(ok(runReference({ ...base, ...derived })).roots.length).toBeGreaterThan(500);
    // And the derived centre IS the root: the polynomial vanishes there to the arithmetic's own floor.
    const at = ok(runReference({ ...base, ...derived }));
    expect(Math.hypot(at.roots[0].dx, at.roots[0].dy)).toBeLessThan(1e-32);
  });
});

describe("what the walk refuses, and what it admits to", () => {
  it("refuses a point outside the disk by name rather than dividing by a negative tail", () => {
    const outside = runReference({
      alphabet: LITTLEWOOD,
      cx: "1.4",
      cy: "0",
      halfHeight: 1e-6,
      aspect: 1.55,
      depth: 40,
      precision: "float64",
    });
    expect("error" in outside).toBe(true);
    if ("error" in outside) expect(outside.error).toContain("1/z");
  });

  it("refuses an unreadable centre and an unreadable alphabet", () => {
    const bad = runReference({
      alphabet: LITTLEWOOD,
      cx: "not a number",
      cy: "0",
      halfHeight: 1e-6,
      aspect: 1.55,
      depth: 20,
      precision: "dd",
    });
    expect("error" in bad).toBe(true);
    const worse = runReference({
      alphabet: { preset: "custom", custom: "$$$" },
      cx: "0.5",
      cy: "0.4",
      halfHeight: 1e-6,
      aspect: 1.55,
      depth: 20,
      precision: "dd",
    });
    expect("error" in worse).toBe(true);
  });

  it("spends its budget and SAYS SO — a shallow view is the wrong tool and the list is partial", () => {
    // At a half-height of 1e-3 the fudge is 7.8e-3 and essentially the whole tree survives: this engine
    // is for depth, and asked for an overview it reports that it did not finish rather than drawing a
    // fraction of the picture as if it were all of it.
    const run = ok(
      runReference({
        alphabet: LITTLEWOOD,
        cx: STORY_CX,
        cy: STORY_CY,
        halfHeight: 1e-3,
        aspect: 1.55,
        depth: 40,
        precision: "float64",
        budget: 5000,
      }),
    );
    expect(run.exhausted).toBe(true);
    expect(run.nodes).toBe(5001);
  });
});

describe("what the walk counts, and how", () => {
  it("the tail bound is the INFINITE one, and its node count says so", () => {
    // `tail_k = max|a|·|z|^{k+1}/(1−|z|)`. Dropping the `|z|^{k+1}` factor's last power loosens the
    // prune by `1/|z|` at every level — the same roots, more tree. The walk is deterministic, so the
    // node count is the observable: measured at this view, 705 nodes.
    const run = ok(
      runReference({
        alphabet: LITTLEWOOD,
        cx: STORY_CX,
        cy: STORY_CY,
        halfHeight: 1e-6,
        aspect: 1.55,
        depth: 34,
        precision: "float64",
      }),
    );
    expect(run.nodes).toBe(705);
    expect(run.roots.length).toBe(119);
  });

  it("only PROPER polynomials are reported — a zero leading coefficient is a lower degree", () => {
    // `{−1, +1}` has no zero, so the properness rule is vacuous there and cannot be tested at all; over
    // `{−1, 0, +1}` it decides which levels may report. Without it the SAME polynomial is reported at
    // every level its coefficients happen to be padded to.
    const run = ok(
      runReference({
        alphabet: { preset: "trinary" },
        cx: "0.6",
        cy: "0.45",
        halfHeight: 0.02,
        aspect: 1.55,
        depth: 10,
        precision: "float64",
        budget: 4e6,
      }),
    );
    expect(run.roots.length).toBeGreaterThan(20);
    const values = [-1, 0, 1];
    for (const root of run.roots) {
      expect(root.degree, "degree 0 is a constant and has no roots").toBeGreaterThanOrEqual(1);
      expect(root.digits.length).toBe(root.degree + 1);
      expect(values[root.digits[root.degree]], "leading coefficient").not.toBe(0);
      expect(values[root.digits[0]], "constant term").not.toBe(0);
    }
  });

  it("the residual is a BACKWARD error, not a raw |P|", () => {
    // `|P(α)| / Σ|a_k||α|^k` — Adams's certificate, the same one the root engine uses. Dropping the
    // normaliser leaves a number that is still small and no longer means anything: for a Littlewood
    // polynomial at `|z| ≈ 0.64` the scale is about 2.8, so the two differ by a factor nothing in the
    // picture would reveal. Checked against the quantity computed here, from the record's own digits.
    const run = ok(
      runReference({
        alphabet: LITTLEWOOD,
        cx: STORY_CX,
        cy: STORY_CY,
        halfHeight: 1e-6,
        aspect: 1.55,
        depth: 34,
        precision: "float64",
      }),
    );
    const root = run.roots[0];
    const zr = Number(STORY_CX) + root.dx;
    const zi = Number(STORY_CY) + root.dy;
    let pr = root.digits[root.degree] === 1 ? 1 : -1;
    let pi = 0;
    for (let k = root.degree - 1; k >= 0; k--) {
      const nr = pr * zr - pi * zi + (root.digits[k] === 1 ? 1 : -1);
      pi = pr * zi + pi * zr;
      pr = nr;
    }
    const absz = Math.hypot(zr, zi);
    let scale = 0;
    let power = 1;
    for (let k = 0; k <= root.degree; k++) {
      scale += power;
      power *= absz;
    }
    expect(scale).toBeGreaterThan(2);
    expect(root.residual).toBeCloseTo(Math.hypot(pr, pi) / scale, 24);
    expect(root.residual).not.toBeCloseTo(Math.hypot(pr, pi), 24);
  });
});

describe("the frame that crosses the worker boundary", () => {
  it("packs and unpacks every root", () => {
    const run = ok(
      runReference({
        alphabet: LITTLEWOOD,
        cx: STORY_CX,
        cy: STORY_CY,
        halfHeight: 1e-6,
        aspect: 1.55,
        depth: 34,
        precision: "float64",
      }),
    );
    const frame = packFrame(run);
    expect(frame.count).toBe(run.roots.length);
    expect(frame.degreeMin).toBe(Math.min(...run.roots.map((r) => r.degree)));
    expect(frame.degreeMax).toBe(Math.max(...run.roots.map((r) => r.degree)));
    expect(frame.residual).toBeCloseTo(Math.max(...run.roots.map((r) => r.residual)), 20);
    for (let i = 0; i < frame.count; i++) {
      const back = rootAt(frame, i);
      expect(back, String(i)).not.toBeNull();
      expect(back?.digits).toEqual(run.roots[i].digits);
      expect(back?.degree).toBe(run.roots[i].degree);
      // float32 on the wire: an OFFSET, so it carries full RELATIVE precision however deep the view.
      expect(Math.abs((back?.dx ?? 0) - run.roots[i].dx)).toBeLessThan(Math.abs(run.roots[i].dx) * 1e-6 + 1e-40);
    }
    expect(rootAt(frame, -1)).toBeNull();
    expect(rootAt(frame, frame.count)).toBeNull();
    // `distinct` is keyed on BOTH coordinates. Two roots in a column would otherwise merge, and at
    // depth the count of distinct points is a headline number in the panel.
    const column = packFrame({
      ...run,
      roots: [
        { ...run.roots[0], dx: 1e-9, dy: 2e-9 },
        { ...run.roots[0], dx: 1e-9, dy: -2e-9 },
      ],
    });
    expect(column.count).toBe(2);
    expect(column.distinct).toBe(2);
  });

  it("carries an offset at 10⁻³⁰ that float32 would have lost as an absolute position", () => {
    // The point of decision 3, as a number: a float32 cannot tell 0.42065120412867 from the centre of a
    // 1e-30 view, but it carries the OFFSET between them with all 24 of its bits.
    const absolute = Math.fround(Number(STORY_CX) + 3e-31);
    expect(absolute).toBe(Math.fround(Number(STORY_CX)));
    const offset = Math.fround(3e-31);
    expect(offset).toBeGreaterThan(2.9e-31);
    expect(offset).toBeLessThan(3.1e-31);
  });

  it("finds the root nearest the cursor, which is all the probe is", () => {
    const run = ok(
      runReference({
        alphabet: LITTLEWOOD,
        cx: STORY_CX,
        cy: STORY_CY,
        halfHeight: 1e-6,
        aspect: 1.55,
        depth: 34,
        precision: "float64",
      }),
    );
    const frame = packFrame(run);
    const target = run.roots[7];
    expect(nearestRoot(frame, target.dx, target.dy)).toBe(7);
    expect(nearestRoot(emptyFrame(), 0, 0)).toBe(-1);
    expect(emptyFrame("nope").error).toBe("nope");
  });

  it("echoes the centre back at the precision it used", () => {
    // `Num.format` is how a float64 run reports what it walked, and how `centreOnRoot` returns a
    // re-derived centre. Seventeen significant figures round-trip a double exactly; nine do not, and a
    // centre quietly shortened to nine would open a different view every time it was followed.
    const run = ok(
      runReference({
        alphabet: LITTLEWOOD,
        cx: STORY_CX,
        cy: STORY_CY,
        halfHeight: 1e-6,
        aspect: 1.55,
        depth: 34,
        precision: "float64",
      }),
    );
    // Count SIGNIFICANT figures: everything after the leading zeros of the mantissa. Stripping every
    // `0` instead would undercount `0.42065120412867400` as fourteen and pass a nine-figure centre
    // whose digits happened to be non-zero.
    const significant = (s: string): number =>
      s
        .split(/[eE]/)[0]
        .replace(/[-+.]/g, "")
        .replace(/^0+/, "").length;
    expect(Number(run.cx)).toBe(Number(STORY_CX));
    expect(significant(run.cx)).toBeGreaterThanOrEqual(16);
    const moved = centreOnRoot(LITTLEWOOD, run.roots[0].digits, STORY_CX, STORY_CY, "float64");
    if ("error" in moved) throw new Error(moved.error);
    expect(significant(moved.cx)).toBeGreaterThanOrEqual(16);
    expect(significant("0.42065120412867400")).toBe(17);
    expect(significant("4.2e-1")).toBe(2);
  });

  it("prints a coefficient vector a reader can check", () => {
    const alphabet = compileAlphabet(LITTLEWOOD);
    if ("error" in alphabet) throw new Error(alphabet.error);
    // `{−1, +1}` reads as signs; anything wider reads as a list.
    expect(coefficientString(alphabet.alphabet, [0, 1, 1, 0])).toBe("−++−");
    const complex = compileAlphabet({ preset: "custom", custom: "1, i, -1" });
    if ("error" in complex) throw new Error(complex.error);
    expect(coefficientString(complex.alphabet, [0, 1, 2])).toContain(",");
  });
});

describe("the 2026-09-26 review's deep-zoom fixes", () => {
  it("refuses a view that reaches the unit circle, where the margin has no bound", () => {
    // ε was computed from `1 − |z₀|`, the margin at the centre; over the view it is `1 − |z₀| − r`.
    const r = runReference({ alphabet: LITTLEWOOD, cx: "0.9", cy: "0", halfHeight: 0.08, aspect: 1.55, depth: 20, precision: "float64" });
    expect("error" in r && r.error).toContain("reaches the unit circle");
    // A view clear of it still runs.
    expect("error" in runReference({ alphabet: LITTLEWOOD, cx: "0.6", cy: "0.45", halfHeight: 0.01, aspect: 1.55, depth: 20, precision: "float64" })).toBe(false);
  });

  it("re-centres on the root PROBED, not on whichever root Newton reaches from the view centre", () => {
    // A wide forced-deep view holds polynomials with two roots in it. Seeding Newton at the centre
    // converges to one of them for both probes; seeding at the probed root lands on it. Measured at this
    // view: 81 polynomials with two roots in it, and 81 of their 162 probes re-centred on the WRONG root
    // without the seed. (The first draft of this test used a view whose "pairs" were one root repeated —
    // the deflation bug below — so it passed with the seed removed; the batch-B sweep found it.)
    const cx = "-0.3";
    const cy = "0.5";
    const res = ok(runReference({ alphabet: LITTLEWOOD, cx, cy, halfHeight: 0.2, aspect: 1.55, depth: 14, precision: "dd" }));
    const byPoly = new Map<string, typeof res.roots>();
    for (const root of res.roots) {
      const key = root.digits.join(",");
      byPoly.set(key, [...(byPoly.get(key) ?? []), root]);
    }
    // Every root found once, and as many as the deflation reaches: 5,805 of the 5,821 that Aberth finds
    // in view for these polynomials (deflating by the deflated polynomial's own root reaches 5,711).
    expect(res.roots.length).toBe(5805);
    const pairs = [...byPoly.values()].filter((rs) => rs.length >= 2).slice(0, 12);
    expect(pairs.length).toBeGreaterThanOrEqual(12);
    let wrongWithoutSeed = 0;
    for (const rs of pairs) {
      // Anti-vacuity: the pair's roots are DIFFERENT points, so one Newton start cannot serve both.
      expect(Math.hypot(rs[0].dx - rs[1].dx, rs[0].dy - rs[1].dy)).toBeGreaterThan(1e-6);
      for (const root of rs) {
        const at = (m: { cx: string; cy: string } | { error: string }): number => {
          if ("error" in m) throw new Error(m.error);
          return Math.hypot(Number(m.cx) - (Number(cx) + root.dx), Number(m.cy) - (Number(cy) + root.dy));
        };
        expect(at(centreOnRoot(LITTLEWOOD, root.digits, cx, cy, "dd", { dx: root.dx, dy: root.dy }))).toBeLessThan(1e-12);
        if (at(centreOnRoot(LITTLEWOOD, root.digits, cx, cy, "dd")) > 1e-12) wrongWithoutSeed++;
      }
    }
    expect(wrongWithoutSeed).toBeGreaterThan(0);
  });

  it("draws each root of a polynomial once — a polish that lands on a root already found is not a new one", () => {
    // Measured at this view before the fix: 998 rows, 16 polynomials carrying the same root 3–4 times.
    const res = ok(runReference({ alphabet: LITTLEWOOD, cx: "0.5", cy: "0.45", halfHeight: 0.12, aspect: 1.55, depth: 12, precision: "dd" }));
    const seen = new Set<string>();
    for (const root of res.roots) {
      const key = `${root.digits.join(",")}@${root.dx.toFixed(9)},${root.dy.toFixed(9)}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
    expect(res.roots.length).toBe(972);
  });

  it("certifies a residual by the arithmetic's own precision, 16 units of it", () => {
    expect(residualCertified(16 * 2 ** -106, 106)).toBe(true);
    expect(residualCertified(17 * 2 ** -106, 106)).toBe(false);
    expect(residualCertified(16 * 2 ** -53, 53)).toBe(true);
    expect(residualCertified(17 * 2 ** -53, 53)).toBe(false);
    expect(residualCertified(Number.NaN, 53)).toBe(false);
  });

  it("paints no root whose residual is not certified", () => {
    // Every root the walk returns carries a backward error within its arithmetic's own floor — the
    // filter that stops an unsettled Newton iterate being drawn as a root.
    for (const precision of ["float64", "dd"] as const) {
      const res = ok(
        runReference({ alphabet: LITTLEWOOD, cx: "0.6", cy: "0.45", halfHeight: 0.02, aspect: 1.55, depth: 16, precision }),
      );
      expect(res.roots.length).toBeGreaterThan(10);
      const bits = precision === "dd" ? 106 : 53;
      for (const root of res.roots) expect(root.residual).toBeLessThanOrEqual(16 * 2 ** -bits);
    }
  });
});
