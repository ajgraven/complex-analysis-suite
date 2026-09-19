// The four constraint ids are data keys, and never reach the screen.
//
// M8 step 0.2. `LEGALITY / CATCH / KILL / COVER` key the contrast ladder's rows, the drill's mask and
// every test that reads a ledger row — and until this step they were also what the app PRINTED, in
// the ledger's own column, in the derivation's headings, in the headline of a failing argument and
// in the contrast grid's row labels. A reader met four words of house jargon that do not describe
// what they check.
//
// Two properties, and the second is the one with teeth:
//
//  1. the map itself is total and says nothing an id says;
//  2. **nothing the engine composes for a reader contains an id** — swept over all 28 records, every
//     ledger row, every derivation stage, line, statement and provenance step. That sweep is what
//     found the two that the render sites alone would have missed: the `cover` stage's own paragraph
//     ("COVER is vacuous") and the solve's `from KILL · <piece>` statement label.
import { describe, expect, it } from "vitest";

import { buildDerivation, DERIVATION_STAGES } from "../src/engine/derivation.js";
import { ledgerHeadline } from "../src/engine/ledger.js";
import { argumentOf } from "../src/shell/argument.js";
import { circleTemplate } from "../src/engine/contour/templates.js";
import { compile, defaultState, resolveState } from "../src/shell/state.js";
import {
  constraintLabel,
  headlineFails,
  paramSymbol,
  roleLabel,
  stageTitle,
  type ConstraintId,
} from "../src/engine/vocabulary.js";
import { FAMILIES } from "../src/families/index.js";
import { primaryGolden, solveFamily } from "../src/families/runFamily.js";
import type { PieceRole } from "../src/engine/contour/model.js";

const IDS: readonly ConstraintId[] = ["LEGALITY", "CATCH", "KILL", "COVER"];
const ROLES: readonly (PieceRole | "argument")[] = [
  "target",
  "vanish",
  "reproduces",
  "residue",
  "free",
  "argument",
];

/** Any of the four ids, as a whole word. `catch` the keyword is lower case and does not match. */
const ID_IN_TEXT = /\b(LEGALITY|CATCH|KILL|COVER)\b/;

describe("the display vocabulary", () => {
  it("gives every constraint a label that is not its id", () => {
    for (const id of IDS) {
      expect(constraintLabel(id), id).not.toBe(id);
      expect(constraintLabel(id), id).not.toMatch(ID_IN_TEXT);
      expect(constraintLabel(id).length, id).toBeGreaterThan(3);
    }
    expect(new Set(IDS.map(constraintLabel)).size).toBe(4);
  });

  it("titles the four middle stages with the same words the ledger rows use", () => {
    // Not a coincidence of authorship: `vocabulary.ts` reads the stage titles out of the group map,
    // so a heading and the rows beneath it cannot come to disagree. This says so.
    expect(stageTitle("legality")).toBe(constraintLabel("LEGALITY"));
    expect(stageTitle("catch")).toBe(constraintLabel("CATCH"));
    expect(stageTitle("kill")).toBe(constraintLabel("KILL"));
    expect(stageTitle("cover")).toBe(constraintLabel("COVER"));
    // And the derivation's own table is built from it, rather than repeating the words.
    for (const stage of DERIVATION_STAGES) expect(stage.title, stage.id).toBe(stageTitle(stage.id));
  });

  it("names every piece role, and never as its id where the id is jargon", () => {
    for (const role of ROLES) expect(roleLabel(role), role).toBeTruthy();
    for (const role of ["vanish", "reproduces", "residue"] as const) {
      expect(roleLabel(role), role).not.toBe(role);
    }
    expect(new Set(ROLES.map(roleLabel)).size).toBe(ROLES.length);
  });

  it("says which group failed without naming it by id", () => {
    for (const id of IDS) {
      const line = headlineFails(id);
      expect(line, id).not.toMatch(ID_IN_TEXT);
      expect(line, id).toMatch(/^The argument is incomplete: .+\.$/);
    }
    expect(new Set(IDS.map(headlineFails)).size).toBe(4);
  });
});

describe("nothing the engine composes for a reader carries an id", () => {
  // One derivation per record, at its primary fixture. `solveFamily` is the same path the gallery
  // takes, so these are the strings the app puts on screen.
  const sampled = FAMILIES.map((family) => {
    const r = solveFamily(family, primaryGolden(family));
    if (!r.ok) return { id: family.id, strings: [] as string[] };
    const derivation = buildDerivation({
      ledger: r.run.ledger,
      poles: r.run.poles,
      integral: r.run.integral,
      theorem: r.run.theorem,
      spec: r.run.contour.pieces,
      solved: r.solved,
    });
    const strings: string[] = [ledgerHeadline(r.run.ledger)];
    for (const row of r.run.ledger.rows) {
      strings.push(constraintLabel(row.constraint), row.claim);
      if (row.repair !== undefined) strings.push(row.repair);
    }
    for (const stage of derivation.stages) {
      strings.push(stage.title, stage.why);
      for (const s of stage.statements) strings.push(s.label, s.text);
      for (const line of stage.lines) {
        strings.push(line.text, line.method);
        if (line.restriction !== undefined) strings.push(line.restriction);
        for (const step of line.provenance) strings.push(step.text);
      }
    }
    return { id: family.id, strings };
  });

  it("reaches every record", () => {
    expect(sampled).toHaveLength(28);
    for (const { id, strings } of sampled) expect(strings.length, id).toBeGreaterThan(10);
  });

  it("carries no constraint id in any of them", () => {
    const offending: string[] = [];
    for (const { id, strings } of sampled) {
      for (const text of strings) {
        if (ID_IN_TEXT.test(text)) offending.push(`${id}: ${text.slice(0, 120)}`);
      }
    }
    expect(offending).toEqual([]);
  });

  it("does carry the labels, so the sweep above is not passing on an empty screen", () => {
    const everything = sampled.flatMap((s) => s.strings).join("\n");
    for (const id of IDS) expect(everything, id).toContain(constraintLabel(id));
  });
});

/**
 * **A parameter's id is an identifier and its symbol is a letter** — M8 step 3.1c.
 *
 * The same rule as the block above, one level down: an id may key a field and may not be printed.
 * It is here rather than in `steps.test.ts` because the map is `vocabulary.ts`'s, and the sweep is
 * over the corpus's real parameters rather than over the map's own keys — which a test of the map
 * would be, and would pass on a map that named nothing the app has.
 */
describe("a parameter's name, as mathematics", () => {
  it("gives each corpus parameter a symbol that typesets as ONE thing", () => {
    // Every name in the corpus, measured (20 of them) — not the map's keys, which would make this
    // a test of itself.
    const NAMES = [
      "N", "R", "R_lim", "a", "alpha", "b", "c", "eps", "eta", "mu",
      "n", "p", "q", "rho", "s", "saddle", "sgnA", "wedgeAngle", "wedgeX", "wedgeY", "xi",
    ];
    for (const name of NAMES) {
      const sym = paramSymbol(name);
      // A bare multi-character ASCII run in math mode is a PRODUCT of italic letters, which is
      // what `eps` and `wedgeAngle` were being set as. Either it is one command, or it is upright.
      const bare = /^[A-Za-z][A-Za-z_]+$/.test(sym);
      expect(bare, `${name} sets as a product of italics: ${sym}`).toBe(false);
    }
  });

  it("is exact where the corpus already names the letter, and identity where it does not", () => {
    expect(paramSymbol("eps")).toBe("\\varepsilon");
    expect(paramSymbol("rho")).toBe("\\rho");
    expect(paramSymbol("eta")).toBe("\\eta");
    // **`R_lim` is `R`** — an internal disambiguation against a template's `R`, and B1's own KILL
    // line already states the bound *at $R = 4$*. Two names for one quantity, side by side, is
    // what the map removes here.
    expect(paramSymbol("R_lim")).toBe("R");
    expect(paramSymbol("R")).toBe("R");
    expect(paramSymbol("N")).toBe("N");
    expect(paramSymbol("wedgeAngle")).toBe("\\mathrm{wedgeAngle}");
  });

  it("puts the symbol on the limit STEP, which is where the defect was seen", () => {
    // D1's is `eps`; before this it read `Let $eps \to 0^+$` on the card's heading and on the
    // stage's callout, beside a piece the record calls *the ε→0 circle*.
    const base = defaultState(circleTemplate([0, 0], 1.5));
    const state = { ...base, mode: "gallery" as const, record: "mellin-keyhole", fixture: 0 };
    const { steps } = argumentOf({ state, resolution: resolveState(state, compile(state.expr)), poles: null });
    const limits = steps.filter((s) => s.kind === "limit");
    expect(limits.length, "D1 takes two limits").toBe(2);
    const texts = limits.flatMap((s) => [s.title, ...s.statements.map((x) => x.text)]);
    expect(texts.some((t) => t.includes("\\varepsilon")), "the symbol is absent").toBe(true);
    for (const t of texts) expect(t, "the id reached the reader").not.toContain("eps ");
    for (const t of texts) expect(t).not.toContain("eps =");
  });
});
