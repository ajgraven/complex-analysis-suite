// The three-tier tooltip rule, applied to the Algebra sidebar (finding S7 / 4.3).
//
// Thirty-six controls carried a `title` over the ~120-character hard rule — the worst 489 — and a
// long `title` is the least readable affordance the platform offers: invisible on touch,
// unreachable by keyboard, gone the moment the pointer moves. The content was good; the container
// was not. QD.Strings.algebraOps now holds one record per control — `short` (the title) and
// `detail` (the ORIGINAL text, moved verbatim) — and the section's `?` renders the details.
//
// Node environment, source-only: jsdom breaks fileURLToPath via import.meta.url.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const UI = readFileSync(
  fileURLToPath(new URL("../app/algebra/algebra-ui.mjs", import.meta.url)), "utf8");
const STRINGS = readFileSync(
  fileURLToPath(new URL("../app/ui-strings.mjs", import.meta.url)), "utf8");

/** The algebraOps block, parsed into {id: {section, short, detail}}. */
function ops(): Record<string, { section: string; short: string; detail: string }> {
  const start = STRINGS.indexOf("    algebraOps: {");
  expect(start, "algebraOps block not found").toBeGreaterThan(-1);
  const end = STRINGS.indexOf("\n    },", start);
  const block = STRINGS.slice(start, end);
  // Field-order tolerant. The first version pinned `section, short, detail` in that exact order and
  // silently dropped every record once an optional `label` was added ahead of them — reporting 31
  // of 36 rather than failing on the missing field. Parse each record's body, then read fields by
  // name.
  const out: any = {};
  for (const m of block.matchAll(/'([a-z0-9-]+)':\s*\{([\s\S]*?)\n      \},/g)) {
    const body = m[2];
    const field = (name: string) => {
      const f = body.match(new RegExp(name + ":\\s*`([^`]*)`"));
      return f ? f[1] : undefined;
    };
    out[m[1]] = { section: field("section"), short: field("short"), detail: field("detail"), label: field("label") };
  }
  return out;
}

describe("tier 1 — every title is one line", () => {
  it("no record's short exceeds the 120-character rule", () => {
    for (const [id, r] of Object.entries(ops())) {
      expect(r.short.length, id + " short is " + r.short.length + " chars").toBeLessThanOrEqual(120);
    }
  });

  it("no long hardcoded title survives in the sidebar markup", () => {
    // The markup is where they were; if one comes back it bypasses the registry entirely and the
    // section's `?` will not know about it.
    const long = [...UI.matchAll(/title="([^"]{121,})"/g)].map((m) => m[1].slice(0, 60));
    expect(long).toEqual([]);
  });

  it("the moved ui-strings hooks are gone, so one mechanism owns every tooltip", () => {
    // Six tooltips reached their controls via data-str-title rather than a literal title=, which is
    // why a first pass over the markup alone missed them — measured in-browser as still 120+.
    for (const k of ["assumeReal", "gaugeElim", "groebner", "dimension", "solveNumeric", "algFixW0"]) {
      expect(UI, "tooltips." + k + " should now come from algebraOps").not.toMatch(
        new RegExp('data-str-title="tooltips\\.' + k + '"'));
    }
  });
});

describe("tier 3 — the detail is relocated, not deleted", () => {
  it("every record carries a detail longer than its short", () => {
    // The details are the original tooltips moved verbatim; each was over 120 and each short is
    // under, so this holds by construction — and fails loudly if a detail is ever emptied.
    for (const [id, r] of Object.entries(ops())) {
      expect(r.detail.length, id + " has no detail").toBeGreaterThan(r.short.length);
    }
  });

  it("covers every control that had an over-length tooltip", () => {
    const all = ops();
    expect(Object.keys(all).length).toBe(36);
    // spot-check the extremes: the worst offender and one of the six that came via ui-strings
    expect(all["alg-solve"], "the 489-char solveNumeric").toBeTruthy();
    expect(all["alg-pin-data"], "the 345-char hardcoded worst").toBeTruthy();
  });

  it("every record names a section that can render it", () => {
    // 'header' is legitimate but has no <summary>, so it needs the #alg-help fallback — see below.
    const SECTIONS = ["header", "Assume", "Pin values", "Edit system", "Reduce", "Analyze",
                      "Univalence constraints", "Shape from moments", "Export"];
    for (const [id, r] of Object.entries(ops())) {
      expect(SECTIONS, id + " names an unknown section: " + r.section).toContain(r.section);
    }
  });

  it("header records have somewhere to land", () => {
    // The pinned header has no <summary> to hang a `?` on. Without the #alg-help fallback their
    // details would be moved out of the tooltips and then dropped — worse than leaving them long.
    const hasHeader = Object.values(ops()).some((r) => r.section === "header");
    expect(hasHeader).toBe(true);
    expect(UI).toMatch(/bySection\.get\('header'\)/);
    expect(UI).toMatch(/#alg-help/);
  });
});

describe("the wiring order is load-bearing", () => {
  it("applyOpHelp runs after Strings.apply", () => {
    // #alg-help carries data-str-html, so Strings.apply() rewrites its innerHTML. With applyOpHelp
    // first, the appended header block was silently wiped — measured as 0 entries in-browser.
    const apply = UI.indexOf("QD.Strings.apply(panel)");
    const opHelp = UI.indexOf("applyOpHelp();");
    expect(apply).toBeGreaterThan(-1);
    expect(opHelp).toBeGreaterThan(apply);
  });

  it("and after wireSectionPersistence, which writes the data-section keys it looks up", () => {
    const wire = UI.indexOf("wireSectionPersistence(panel);");
    expect(UI.indexOf("applyOpHelp();")).toBeGreaterThan(wire);
  });

  it("titles come from the record, not a second hand-written copy", () => {
    expect(UI).toMatch(/el\.title = rec\.short/);
  });
});
