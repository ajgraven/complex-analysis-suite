import { describe, expect, it } from "vitest";
import { FAMILIES, checkFamily, loadFamilies } from "../src/families/index.js";
import { a5SemicircleOrder2 } from "../src/families/records/a5-semicircle-order2.js";
import type { Family, FamilyPiece } from "../src/families/schema.js";

/** A deliberately broken clone of a good record — every guard below is proved against one. */
const broken = (patch: (f: Family) => Family): Family => patch(a5SemicircleOrder2);

const invariantsHit = (f: Family): (number | string)[] =>
  checkFamily(f).map((v) => v.invariant);

describe("the corpus loads clean", () => {
  it("admits every record with no violations", () => {
    const { families, violations } = loadFamilies();
    expect(violations).toEqual([]);
    expect(families.size).toBe(FAMILIES.length);
  });

  it("keys the map by the record's own id", () => {
    const { families } = loadFamilies();
    for (const f of FAMILIES) expect(families.get(f.id)).toBe(f);
  });

  it("rejects two records claiming the same id rather than letting one shadow the other", () => {
    const { families, violations } = loadFamilies([a5SemicircleOrder2, a5SemicircleOrder2]);
    expect(families.size).toBe(1);
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toMatch(/duplicate family id/);
  });
});

// Each block below breaks exactly one thing and requires the matching guard to fire. A guard that
// stays green against its own broken input is not a guard — the repository's Batch-F discipline.
describe("invariant 1 — vanish pieces are discharged, reproduces pieces carry a coefficient", () => {
  it("fires when a vanish piece appears in no vanishingLemmas entry", () => {
    const f = broken((x) => ({ ...x, vanishingLemmas: [] }));
    expect(invariantsHit(f)).toContain(1);
    expect(checkFamily(f)[0].message).toMatch(/'arc' appears in no vanishingLemmas/);
  });

  it("fires when a reproduces piece declares no coefficient row", () => {
    const piece: FamilyPiece = {
      id: "lower",
      name: "the reproducing edge",
      geom: a5SemicircleOrder2.contour.pieces[0].geom,
      role: "reproduces",
      colour: 2,
    };
    const f = broken((x) => ({
      ...x,
      contour: { ...x.contour, pieces: [...x.contour.pieces, piece] },
    }));
    expect(checkFamily(f).some((v) => v.invariant === 1 && /no coefficient row/.test(v.message))).toBe(
      true,
    );
  });

  it("stays green on the unmodified record", () => {
    expect(invariantsHit(a5SemicircleOrder2)).toEqual([]);
  });
});

describe("invariant 2 — every family declares at least one trap", () => {
  it("fires on a family with no traps", () => {
    const f = broken((x) => ({ ...x, traps: [] }));
    expect(invariantsHit(f)).toContain(2);
  });
});

describe("invariant 3 — two goldens, and one fixture where no bonus constant vanishes", () => {
  it("fires on a single golden fixture", () => {
    const f = broken((x) => ({ ...x, golden: [x.golden[0]] }));
    expect(invariantsHit(f)).toContain(3);
  });

  it("is VACUOUS, not skipped, when the family has no bonus constants", () => {
    // A5 has no `reproduces` piece, so there is no bonus term to be zero. The clause must pass for
    // that reason and not because nothing looked.
    expect(a5SemicircleOrder2.contour.pieces.some((p) => p.role === "reproduces")).toBe(false);
    expect(invariantsHit(a5SemicircleOrder2)).toEqual([]);
  });

  it("fires when every fixture zeroes a bonus constant — the dropped 1/i = −i case", () => {
    // The rule exists because a sign error in a log-family solve was invisible on the flagship
    // fixture, where the bonus term happens to vanish. Reproduce that shape: a bonus of `a − 2`
    // with every fixture binding a = 2.
    const withBonus = (bonus: string, params: Record<string, number>): Family =>
      broken((x) => ({
        ...x,
        parameters: [{ name: "a", domain: "real", constraints: [] }],
        contour: {
          ...x.contour,
          pieces: [
            ...x.contour.pieces,
            {
              id: "lower",
              name: "the reproducing edge",
              geom: x.contour.pieces[0].geom,
              role: "reproduces",
              coefficients: [{ targetId: "I", coefficient: "0" }],
              bonus,
              colour: 2,
            },
          ],
        },
        golden: x.golden.map((g) => ({ ...g, params })),
      }));

    const allZero = withBonus("a - 2", { a: 2 });
    expect(checkFamily(allZero).some((v) => v.invariant === 3 && /zeroes at least one bonus/.test(v.message))).toBe(
      true,
    );

    // The same family with one fixture that keeps the bonus alive passes the clause.
    const survives: Family = {
      ...allZero,
      golden: [
        { ...allZero.golden[0], params: { a: 2 } },
        { ...allZero.golden[1], params: { a: 5 } },
      ],
    };
    expect(checkFamily(survives).some((v) => v.invariant === 3)).toBe(false);
  });
});

describe("invariant 4 — rank(M) = m for the family's own goldens", () => {
  it("fires when the target piece contributes nothing, so the contour cannot see its own unknown", () => {
    const f = broken((x) => ({
      ...x,
      contour: {
        ...x.contour,
        pieces: x.contour.pieces.map((p) =>
          p.role === "target" ? { ...p, coefficients: [{ targetId: "I", coefficient: "0" }] } : p,
        ),
      },
    }));
    const hits = checkFamily(f).filter((v) => v.invariant === 4);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].message).toMatch(/rank\(M\) = 0 but the family has 1 unknown/);
    expect(hits[0].message).toMatch(/1 combination\(s\) of them are invisible/);
  });

  it("fires when a second unknown has no row of its own", () => {
    const f = broken((x) => ({
      ...x,
      targets: [x.targets[0], { ...x.targets[0], id: "J" }],
      contour: {
        ...x.contour,
        pieces: x.contour.pieces.map((p) =>
          p.role === "target" ? { ...p, coefficients: [{ targetId: "I", coefficient: "1" }] } : p,
        ),
      },
    }));
    const hits = checkFamily(f).filter((v) => v.invariant === 4);
    expect(hits[0].message).toMatch(/rank\(M\) = 1 but the family has 2 unknown/);
  });

  it("reports a coefficient it cannot decide exactly, rather than rounding it", () => {
    const f = broken((x) => ({
      ...x,
      contour: {
        ...x.contour,
        pieces: x.contour.pieces.map((p) =>
          p.role === "target" ? { ...p, coefficients: [{ targetId: "I", coefficient: "2*pi*i" }] } : p,
        ),
      },
    }));
    const hits = checkFamily(f).filter((v) => v.invariant === 4);
    expect(hits[0].message).toMatch(/could not be decided exactly/);
    expect(hits[0].message).toMatch(/irrational/);
  });
});

describe("well-formedness — what makes the four invariants mean anything", () => {
  it("catches a vanish piece that names no lemma", () => {
    const f = broken((x) => ({
      ...x,
      contour: {
        ...x.contour,
        pieces: x.contour.pieces.map((p) =>
          p.role === "vanish" ? { id: p.id, name: p.name, geom: p.geom, role: p.role, colour: p.colour } : p,
        ),
      },
    }));
    expect(checkFamily(f)[0].message).toMatch(/role 'vanish' but names no lemma/);
  });

  it("catches a lemma naming a piece that does not exist — the typo invariant 1 would miss", () => {
    const f = broken((x) => ({
      ...x,
      vanishingLemmas: x.vanishingLemmas.map((l) => ({ ...l, piece: "arcc" })),
    }));
    const hits = checkFamily(f);
    expect(hits[0].invariant).toBe("well-formed");
    expect(hits[0].message).toMatch(/names a piece 'arcc' that does not exist/);
  });

  it("catches duplicate piece and target ids", () => {
    const dupPiece = broken((x) => ({
      ...x,
      contour: { ...x.contour, pieces: [...x.contour.pieces, x.contour.pieces[0]] },
    }));
    expect(checkFamily(dupPiece)[0].message).toMatch(/duplicate piece id\(s\): realAxis/);

    const dupTarget = broken((x) => ({ ...x, targets: [x.targets[0], x.targets[0]] }));
    expect(checkFamily(dupTarget)[0].message).toMatch(/duplicate target id\(s\): I/);
  });

  it("suppresses the four while the record is malformed, so one typo reports once", () => {
    const f = broken((x) => ({
      ...x,
      traps: [],
      vanishingLemmas: x.vanishingLemmas.map((l) => ({ ...l, piece: "arcc" })),
    }));
    expect(checkFamily(f).every((v) => v.invariant === "well-formed")).toBe(true);
  });
});

describe("a failing record is dropped, not thrown on", () => {
  it("keeps the healthy records and withholds the broken one", () => {
    const bad = broken((x) => ({ ...x, id: "broken", traps: [] }));
    const { families, violations } = loadFamilies([...FAMILIES, bad]);
    expect(families.size).toBe(FAMILIES.length);
    expect(families.has("broken")).toBe(false);
    expect(violations.map((v) => v.family)).toEqual(["broken"]);
  });
});
