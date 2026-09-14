// **M7.1's GATE: every declared contrast is verified against the engine.**
//
// The ladder in `src/shell/contrastGrid.ts` claims that each cell differs from the one above it in a
// named set of ledger rows. This test derives the real difference set by RUNNING both cells through
// `resolveState` — the same path the shell takes — and requires the two to match exactly, in both
// directions: nothing undeclared may differ, and nothing declared may agree.
//
// Both directions matter for opposite reasons. Missing a difference makes the grid lie about what
// isolates what, which is the only thing it is for. Declaring one that does not happen would let a
// regression hide: if the engine stopped changing that row, the cell would go on claiming it does.
import { describe, expect, it } from "vitest";
import { diffLedgers, rowKeys } from "../src/engine/contrast.js";
import { CONTRAST_CELLS, contrastSideOf, contrastTable } from "../src/shell/contrastGrid.js";
import { compile, resolveState } from "../src/shell/state.js";
import { decodeShell, encodeShell } from "../src/shell/viewState.js";

const sideOf = (i: number) => {
  const s = contrastSideOf(CONTRAST_CELLS[i].state());
  if (s === null) throw new Error(`cell ${CONTRAST_CELLS[i].id} produced nothing`);
  return s;
};

describe("the ladder itself", () => {
  it("is five cells with unique ids, the first declaring no difference", () => {
    expect(CONTRAST_CELLS).toHaveLength(5);
    expect(new Set(CONTRAST_CELLS.map((c) => c.id)).size).toBe(5);
    expect(CONTRAST_CELLS[0].differsAbove).toBeUndefined();
    expect(CONTRAST_CELLS.slice(1).every((c) => c.differsAbove !== undefined)).toBe(true);
  });

  it("spans BOTH modes, because the wrong-way cell cannot be a record", () => {
    // B1 derives its closing side from `sgnA`, a read-only `derived` parameter, so the record is
    // incapable of being closed wrongly. This is the measurement that reshaped the plan; if some
    // future edit made every cell a record again, the wrong-way rung would have quietly vanished.
    const modes = CONTRAST_CELLS.map((c) => c.state().mode);
    expect(modes).toContain("gallery");
    expect(modes).toContain("sandbox");
    expect(CONTRAST_CELLS.find((c) => c.id === "wrong-way")?.state().mode).toBe("sandbox");
  });

  it("every cell produces a readable argument", () => {
    for (let i = 0; i < CONTRAST_CELLS.length; i++) {
      const side = sideOf(i);
      expect(side.ledger.rows.length, CONTRAST_CELLS[i].id).toBeGreaterThan(0);
    }
  });
});

describe("every declared difference set is EXACTLY what the engine produces", () => {
  for (let i = 1; i < CONTRAST_CELLS.length; i++) {
    const cell = CONTRAST_CELLS[i];
    const step = cell.differsAbove;
    if (step === undefined) continue;

    describe(`${CONTRAST_CELLS[i - 1].id} → ${cell.id}`, () => {
      it("differs in exactly the declared rows, and in no others", () => {
        const d = diffLedgers(sideOf(i - 1), sideOf(i));
        const declared = [...step.rows, ...(step.alsoDiffers ?? []).map((x) => x.key)].sort();
        expect([...d.keys].sort()).toEqual(declared);
      });

      it("every row declared as CONTENT really differs", () => {
        // The other direction. Without this, a step could declare a row that stopped changing and
        // the grid would go on pointing at it.
        const d = diffLedgers(sideOf(i - 1), sideOf(i));
        for (const key of step.rows) expect(d.keys, `${key} was declared but agrees`).toContain(key);
      });

      it("files nothing INCIDENTAL that is really a status change", () => {
        // The loophole this closes: if a satisfied row went to failed, the argument changed, and
        // calling that "wording" would empty the whole declaration of content.
        const d = diffLedgers(sideOf(i - 1), sideOf(i));
        for (const { key } of step.alsoDiffers ?? []) {
          const delta = d.rows.find((r) => r.key === key);
          expect(delta, `${key} was declared incidental but does not differ`).toBeDefined();
          expect(delta?.kind, `${key} is a ${delta?.kind ?? "?"} change, not a wording one`).toBe("claim");
        }
      });

      it("declares the non-row differences it has, and none it does not", () => {
        const d = diffLedgers(sideOf(i - 1), sideOf(i));
        // `closes`: declared iff it moved, and to the value it moved to.
        if (step.closes === undefined) {
          expect(d.closes, "closes moved but was not declared").toBeNull();
        } else {
          expect(d.closes?.to, "closes was declared but did not move to that").toBe(step.closes);
        }
        // `pieceLimits`: the same rule. This is the difference NO row carries.
        if (step.pieceLimits === undefined) {
          expect(d.pieceLimits, "pieceLimits moved but was not declared").toBeNull();
        } else {
          expect(d.pieceLimits?.to).toEqual(step.pieceLimits);
        }
        // The answer, which is the record's solved value and not the ledger's `∮`.
        if (step.answer === undefined) {
          expect(d.answer, "the answer moved but was not declared").toBeNull();
        } else {
          expect(d.answer?.to).toBe(step.answer);
        }
      });
    });
  }
});

describe("the three rungs that are ONE ROW apart", () => {
  // The ladder's premise, asserted as a property of the whole run rather than cell by cell: the
  // first three steps each isolate a single row, and it is the SAME row all three times — the arc's.
  // That is what makes the sequence teach "the arc's lemma is the variable" instead of five facts.
  it("isolate the arc's KILL row, and the same one each time", () => {
    for (let i = 1; i <= 3; i++) {
      const step = CONTRAST_CELLS[i].differsAbove;
      expect(step?.rows, `step ${i}`).toEqual(["KILL/vanish#0"]);
      // And it is a real difference, not just a declared one.
      const d = diffLedgers(sideOf(i - 1), sideOf(i));
      expect(d.keys, `step ${i}`).toContain("KILL/vanish#0");
      // The only other rows that may move are the ones declared incidental, and there are at most
      // one per step — so "one row apart" is true of the ARGUMENT even where the prose moves.
      const incidental = (step?.alsoDiffers ?? []).map((x) => x.key);
      expect([...d.keys].filter((k) => !incidental.includes(k)), `step ${i}`).toEqual(["KILL/vanish#0"]);
    }
  });

  it("and the middle one is the only rung that does not close", () => {
    const closes = CONTRAST_CELLS.map((_, i) => sideOf(i).ledger.closes);
    expect(closes).toEqual([true, true, false, true, true]);
    expect(sideOf(2).ledger.failedAt).toBe("KILL");
  });
});

describe("C1's rung shows why the grid must print the ANSWER, not `∮`", () => {
  it("its ledger value is 0 while the integral it determines is π/2", () => {
    const c1 = sideOf(4);
    expect(c1.ledger.value?.text).toBe("0");
    expect(c1.answer).toBe("π/2");
  });
});

describe("clause 2: every cell is addressable by permalink", () => {
  it("encodes, decodes, and re-runs to the same verdict and the same answer", () => {
    for (let i = 0; i < CONTRAST_CELLS.length; i++) {
      const cell = CONTRAST_CELLS[i];
      const enc = encodeShell(cell.state());
      expect(enc.ok, `${cell.id}: ${enc.ok ? "" : enc.reason}`).toBe(true);
      if (!enc.ok) continue;
      const back = decodeShell(enc.hash);
      expect(back?.ok, `${cell.id} did not decode`).toBe(true);
      if (back === null || !back.ok) continue;

      const before = sideOf(i);
      const after = contrastSideOf(back.state);
      expect(after, cell.id).not.toBeNull();
      if (after === null) continue;
      // By VERDICT and by answer, which is M6.2's rule: field equality would pass a codec that
      // dropped something the engine happens not to read at this binding.
      expect(after.ledger.verdict.level, cell.id).toBe(before.ledger.verdict.level);
      expect(after.ledger.closes, cell.id).toBe(before.ledger.closes);
      expect(after.answer, cell.id).toBe(before.answer);
      expect(diffLedgers(before, after).rows, cell.id).toEqual([]);
    }
  });

  it("and the sandbox cell's recipe really rebuilds the lower semicircle", () => {
    // The recipe is verified on encode (M6.2), so a wrong template id would refuse rather than mint
    // a link to a different shape. This pins that the cell's declared recipe is the right one.
    const cell = CONTRAST_CELLS.find((c) => c.id === "wrong-way");
    expect(cell).toBeDefined();
    if (cell === undefined) return;
    const state = cell.state();
    // `contourSource` is nullable — that is M6.2's refusal for a contour with no recipe, which is
    // the pen tool's case (M7.2). A cell must never be in it, or the cell has no permalink.
    expect(state.contourSource).not.toBeNull();
    expect(state.contourSource?.template).toBe("semicircleDown");
    const enc = encodeShell(state);
    expect(enc.ok).toBe(true);
    if (!enc.ok) return;
    const back = decodeShell(enc.hash);
    expect(back?.ok).toBe(true);
    if (back === null || !back.ok) return;
    const res = resolveState(back.state, compile(back.state.expr));
    expect(res.kind).toBe("plain");
    if (res.kind !== "plain") return;
    // The whole point of this rung: it fails, at KILL, on the arc.
    expect(res.analysis.ledger.closes).toBe(false);
    expect(res.analysis.ledger.failedAt).toBe("KILL");
  });
});

describe("the table's row order", () => {
  const table = contrastTable();
  const keysOf = (i: number) => {
    const side = sideOf(i);
    return rowKeys(side.ledger.rows, side.pieces);
  };

  it("reads in EVERY column's own argument order, not just the first's", () => {
    // The topological property, checked per column: the rows that column has, in the order the
    // table puts them, are that ledger's own order.
    for (let i = 0; i < CONTRAST_CELLS.length; i++) {
      const mine = new Set(keysOf(i));
      const asDrawn = table.rows.map((r) => r.key).filter((k) => mine.has(k));
      expect(asDrawn, CONTRAST_CELLS[i].id).toEqual(keysOf(i));
    }
  });

  it("which FIRST APPEARANCE would get wrong — C1's extra rows would fall below COVER", () => {
    // The alternative, implemented so the choice is pinned by a failure rather than by a comment.
    // C1 emits target, indentation, target, big arc, COVER; the cells before it emit target, arc,
    // COVER — so taking keys as they first appear puts COVER down at cell 1, and C1's second target
    // and second arc have nowhere to go but the bottom of the table.
    const first: string[] = [];
    for (let i = 0; i < CONTRAST_CELLS.length; i++) {
      for (const k of keysOf(i)) if (!first.includes(k)) first.push(k);
    }
    expect(first.indexOf("COVER/argument#0")).toBeLessThan(first.indexOf("KILL/target#1"));
    // The merge puts it back where the argument has it.
    const drawn = table.rows.map((r) => r.key);
    expect(drawn.indexOf("KILL/target#1")).toBeLessThan(drawn.indexOf("COVER/argument#0"));
    expect(drawn.indexOf("KILL/vanish#1")).toBeLessThan(drawn.indexOf("COVER/argument#0"));
  });

  it("draws an absence as an absence", () => {
    const row = table.rows.find((r) => r.key === "KILL/vanish#1");
    expect(row).toBeDefined();
    // Only C1 has a second vanishing piece.
    expect(row?.cells.map((c) => c !== null)).toEqual([false, false, false, false, true]);
  });

  it("numbers a repeated bucket and leaves a unique one bare", () => {
    expect(table.rows.find((r) => r.key === "COVER/argument#0")?.label).toBe("COVER · argument");
    expect(table.rows.find((r) => r.key === "KILL/vanish#0")?.label).toBe("KILL · vanish #1");
  });
});

describe("the table marks the contrast, and only the contrast", () => {
  const table = contrastTable();

  it("highlights the declared row in the column it is declared for", () => {
    const arc = table.rows.find((r) => r.key === "KILL/vanish#0");
    // Cells 1..4 each declare the arc row; cell 0 declares nothing.
    expect(arc?.highlight).toEqual([1, 2, 3, 4]);
  });

  it("keeps an incidental rewording MUTED rather than highlighted", () => {
    const target = table.rows.find((r) => r.key === "KILL/target#0");
    expect(target?.muted).toEqual([2, 3]); // the two record↔sandbox crossings
    expect(target?.highlight).toEqual([4]); // and C1's split, which IS content
  });

  it("carries the ANSWER per column, which for C1 is π/2 and not its ∮ of 0", () => {
    expect(table.cells.map((c) => c.answer)).toEqual(["π", "π/e", null, "π/e", "π/2"]);
    expect(table.cells.map((c) => c.closes)).toEqual([true, true, false, true, true]);
    expect(table.cells[2].failedAt).toBe("KILL");
  });

  it("carries the step's own sentence on every cell but the first", () => {
    expect(table.cells[0].because).toBeNull();
    expect(table.cells.slice(1).every((c) => (c.because ?? "").length > 0)).toBe(true);
  });
});
