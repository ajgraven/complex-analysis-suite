// Aligning two ledgers — the primitive M7.1's contrast grid rests on.
//
// The load-bearing test here is the SECOND one: it pins the row key by showing that the obvious
// alternative is wrong on real data. Measuring the five cells found that B1 names its target piece
// `realAxis` while the sandbox's semicircle names the same row's piece `diameter`, so an id-keyed
// alignment reports a removal and an addition where one row changed status. A comment saying "we do
// not key on pieceId" would not have caught anyone re-introducing it.
import { describe, expect, it } from "vitest";
import { makeComplexFn, parse } from "@cas/expr";
import { analyse } from "../src/engine/analyse.js";
import { diffLedgers, rowKeys, type ContrastSide } from "../src/engine/contrast.js";
import type { Contour } from "../src/engine/contour/model.js";
import { semicircleTemplate } from "../src/engine/contour/templates.js";
import { findPoles } from "../src/kernel/poles.js";
import type { Cx } from "../src/kernel/geom.js";
import { FAMILIES } from "../src/families/index.js";
import { primaryGolden, solveFamily } from "../src/families/runFamily.js";

const familyById = (id: string) => {
  const f = FAMILIES.find((x) => x.id === id);
  if (f === undefined) throw new Error(`no record ${id}`);
  return f;
};

/** A record at a chosen binding, as the shell's gallery mode builds it. */
function record(id: string, params: Record<string, number> = {}): ContrastSide {
  const family = familyById(id);
  const g = primaryGolden(family);
  const r = solveFamily(family, { ...g, params: { ...g.params, ...params } });
  if (!r.ok) throw new Error(`${id}: ${r.reason}`);
  return {
    ledger: r.run.ledger,
    pieces: r.run.contour.pieces,
    answer: r.solved?.text ?? r.run.ledger.value?.text ?? null,
  };
}

/** The sandbox path: an integrand and a contour, no family and therefore no Pass 5. */
function sandbox(src: string, contour: Contour): ContrastSide {
  const ast = parse(src);
  const fn = makeComplexFn(ast);
  const f = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
  const a = analyse({ ast, f, poles: findPoles(ast), contour });
  return { ledger: a.ledger, pieces: contour.pieces, answer: a.ledger.value?.text ?? null };
}

describe("the row key", () => {
  it("is UNIQUE within every record's ledger, across the whole corpus", () => {
    // Measured rather than assumed: `(constraint, role)` alone is NOT unique — C1 carries two
    // KILL/target rows and two KILL/vanish rows — which is why the key ends in an ordinal. If some
    // future record made even that ambiguous, the grid would silently pair the wrong rows.
    let checked = 0;
    for (const family of FAMILIES) {
      const r = solveFamily(family, primaryGolden(family));
      if (!r.ok) continue;
      const keys = rowKeys(r.run.ledger.rows, r.run.contour.pieces);
      expect(new Set(keys).size, `${family.id} has a duplicate row key`).toBe(keys.length);
      expect(keys.length).toBe(r.run.ledger.rows.length);
      checked += 1;
    }
    // And the sweep is not vacuous: the corpus really is all 28 records.
    expect(checked).toBe(28);
  });

  it("files a row naming no piece under `argument`, and one naming a piece under its ROLE", () => {
    const b1 = record("jordan-cosine-kernel", { a: 1, b: 1 });
    const keys = rowKeys(b1.ledger.rows, b1.pieces);
    expect(keys).toContain("LEGALITY/argument#0");
    expect(keys).toContain("CATCH/argument#0");
    expect(keys).toContain("KILL/target#0");
    expect(keys).toContain("KILL/vanish#0");
    expect(keys).toContain("COVER/argument#0");
  });

  it("numbers C1's repeated buckets, which is the case that forces the ordinal", () => {
    const c1 = record("indented-sinc");
    const keys = rowKeys(c1.ledger.rows, c1.pieces);
    // The real axis either side of the indentation, and the indentation beside the big arc.
    expect(keys).toContain("KILL/target#0");
    expect(keys).toContain("KILL/target#1");
    expect(keys).toContain("KILL/vanish#0");
    expect(keys).toContain("KILL/vanish#1");
  });
});

describe("keying on `pieceId` instead would MIS-PAIR the grid's own rows", () => {
  // The alternative, implemented here so the comparison is real: pair rows by (constraint, pieceId).
  const byPieceId = (side: ContrastSide): readonly string[] =>
    side.ledger.rows.map((r) => `${r.constraint}/${r.pieceId ?? "—"}`);

  const b1 = record("jordan-cosine-kernel", { a: 1, b: 1 });
  const lower = sandbox("exp(i*z)/(1+z^2)", semicircleTemplate(6, "lower"));

  it("because the same row's piece is `realAxis` in the record and `diameter` in the sandbox", () => {
    expect(b1.pieces.map((p) => p.id)).toContain("realAxis");
    expect(lower.pieces.map((p) => p.id)).toContain("diameter");
    // Both are the piece the argument solves for. Same row, same role, different name.
    const roleOf = (s: ContrastSide, id: string) => s.pieces.find((p) => p.id === id)?.role;
    expect(roleOf(b1, "realAxis")).toBe("target");
    expect(roleOf(lower, "diameter")).toBe("target");
  });

  it("so the id-keyed pairing loses rows on BOTH sides, where the real diff is one status flip", () => {
    const left = new Set(byPieceId(b1));
    const right = new Set(byPieceId(lower));
    const onlyLeft = [...left].filter((k) => !right.has(k));
    const onlyRight = [...right].filter((k) => !left.has(k));
    // The failing alternative: unmatched rows on each side, none of which actually vanished.
    expect(onlyLeft.length).toBeGreaterThan(0);
    expect(onlyRight.length).toBeGreaterThan(0);

    // The key this module uses pairs every row, and reports exactly the change that happened.
    const d = diffLedgers(b1, lower);
    expect(d.rows.filter((r) => r.kind === "added" || r.kind === "removed")).toEqual([]);
    expect(d.rows.map((r) => `${r.key}:${r.kind}`)).toContain("KILL/vanish#0:status");
  });
});

describe("diffLedgers", () => {
  it("reports ONE delta per row, and a status change beats a wording change", () => {
    // B1 → the lower sandbox changes both the arc row's status and its claim text. A declaration has
    // to be unambiguous about which it means, so only the stronger fact is emitted.
    const d = diffLedgers(record("jordan-cosine-kernel", { a: 1, b: 1 }), sandbox("exp(i*z)/(1+z^2)", semicircleTemplate(6, "lower")));
    const arc = d.rows.filter((r) => r.key === "KILL/vanish#0");
    expect(arc).toHaveLength(1);
    expect(arc[0].kind).toBe("status");
    expect(arc[0].from).toBe("satisfied");
    expect(arc[0].to).toBe("failed");
  });

  it("finds the ONE row that differs between B1's two kernels — the grid's whole premise", () => {
    // a = 0 is the rational case discharged by plain ML; a = 1 is the oscillatory one discharged by
    // Jordan. Everything else about the argument is word-for-word identical, which is what makes the
    // pair teach one thing rather than five.
    const d = diffLedgers(record("jordan-cosine-kernel", { a: 0, b: 1 }), record("jordan-cosine-kernel", { a: 1, b: 1 }));
    expect(d.keys).toEqual(["KILL/vanish#0"]);
    expect(d.rows[0].kind).toBe("claim");
    expect(d.rows[0].from).toContain("\\deg Q - \\deg P");
    expect(d.rows[0].to).toContain("\\pi/|a|");
    // The value moves too, and that is reported apart from the rows because it is not one.
    expect(d.answer).toEqual({ from: "π", to: "π/e" });
    expect(d.closes).toBeNull();
  });

  it("reports `closes`, `failedAt` and `pieceLimits` APART from the rows", () => {
    const b1 = record("jordan-cosine-kernel", { a: -1, b: 1 });
    const c1 = record("indented-sinc");
    const d = diffLedgers(b1, c1);
    expect(d.closes).toBeNull(); // both close
    expect(d.failedAt).toBeNull();
    // C1's indentation carries a known limit; B1 has none. No ROW says this.
    expect(d.pieceLimits).toEqual({ from: [], to: ["indent"] });
  });

  it("reports a row that DISAPPEARS, which the ladder never exercises", () => {
    // A mutation sweep found this: deleting the `removed` branch left every test green, because the
    // ladder only ever runs forwards and each rung adds rows or keeps them. Compared the other way,
    // C1 loses its second target and its second vanishing piece — and a diff that reported "no
    // difference" for an argument that shed two whole rows would be worse than useless.
    const d = diffLedgers(record("indented-sinc"), record("jordan-cosine-kernel", { a: 1, b: 1 }));
    const removed = d.rows.filter((r) => r.kind === "removed").map((r) => r.key);
    expect(removed.sort()).toEqual(["KILL/target#1", "KILL/vanish#1"]);
    // And the removal carries the claim that went away, so a caller can say what was lost.
    //
    // **WHICH ROW THAT IS, IS NOT THE OBVIOUS ONE, and writing this assertion wrongly is how I
    // found out.** The ordinal counts within the role in PIECE order, and C1's pieces run left,
    // indentation, right, big arc — so its indentation is `KILL/vanish#0` and its big arc is `#1`.
    // Compared with B1, that lines B1's arc up with C1's INDENTATION and leaves C1's arc as an
    // extra row. Nothing false follows: both rows are in the step's declared difference set, so the
    // grid marks both. But the pairing is by position within the role, not by what a reader might
    // call "the same piece", and that is worth knowing before trusting any single pairing.
    expect(d.rows.find((r) => r.key === "KILL/vanish#1")?.from).toContain("semicircle");
    const c1Keys = rowKeys(record("indented-sinc").ledger.rows, record("indented-sinc").pieces);
    const c1 = record("indented-sinc");
    expect(c1.ledger.rows[c1Keys.indexOf("KILL/vanish#0")].claim).toContain("indentation");
  });

  it("is empty for a side compared with itself", () => {
    const b1 = record("jordan-cosine-kernel", { a: 1, b: 1 });
    const d = diffLedgers(b1, b1);
    expect(d.rows).toEqual([]);
    expect(d.closes).toBeNull();
    expect(d.failedAt).toBeNull();
    expect(d.answer).toBeNull();
    expect(d.pieceLimits).toBeNull();
  });
});
