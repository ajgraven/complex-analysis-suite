// @vitest-environment jsdom
//
// **The words the app may not use** — M8 step 2.1.
//
// Phase 0 rewrote every sentence the ENGINE composes and every record's description; Phase 1 built
// the shell and ported three cards' prose verbatim (branch cuts, drill, contrasts). This is the
// tripwire under the pass that finishes them: the house names for the Closing Ledger's four
// constraints, the lemma numbers, the internal citations, the program's own nouns, and the habit of
// shouting one word in a sentence.
//
// **It is two tests, because one instrument cannot see both halves.**
//
// The SOURCE half reads every string literal in `src/shell/**` and `src/engine/**` out of the
// TypeScript AST. Complete coverage — a sentence rendered in one rare state is still in the file —
// and no false positives from comments, which are where the house words legitimately live and where
// a regex over the file would drown. Its blind spot is the data keys: `"KILL"` is the value of a
// row's `constraint` field 48 times in `ledger.ts` alone, and every one of them is right, so they
// are exempt.
//
// The RENDERED half closes exactly that blind spot. It mounts the app across fourteen states and
// reads what is on screen, where an id has no business appearing whatever module it came from.
// `vocabulary.test.ts` does this for the sentences the ENGINE composes, over all 28 records; this
// one does it for the SHELL's own — the cards, the drill, the contrasts panel, the front door.
//
// **The plan's exemption list is a path list and could not be one.** It names `vocabulary.ts`,
// `contrast.ts`, `drill.ts` and the codec; measured, the ids appear as data in ten files, and the
// biggest by far is `ledger.ts`, whose rows each carry one. A path list would have had to grow to
// include the module the denylist most exists to police. So the exemption is the SHAPE of the
// literal — a bare id, or a contrast row's `CONSTRAINT/role#n` key — and the rendered half is what
// stops an exempt id from reaching a reader.
import ts from "typescript";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadFamilies } from "../src/families/index.js";
import { compile, defaultState, type ShellState } from "../src/shell/state.js";
import { circleTemplate } from "../src/engine/contour/templates.js";
import { DRILL_STAGES, DRILL_TASKS, taskState } from "../src/shell/drill.js";
import { mountShell2, type Shell2Handle } from "../src/shell/app.js";

/**
 * The app's `src/`, found from the working directory rather than from `import.meta.url`.
 *
 * This spec runs under jsdom, where `import.meta.url` is an `http:` URL and `fileURLToPath` refuses
 * it — and it has to run under jsdom, because its second half mounts the app. The two candidates are
 * the two roots the suite is ever launched from: the app's own, and the workspace's.
 */
const SRC = [resolve(process.cwd(), "src"), resolve(process.cwd(), "apps/contour-integration/src")].find((d) =>
  existsSync(d),
);
if (SRC === undefined) throw new Error("cannot find the app's src/ from " + process.cwd());

/**
 * The words, as they must not appear in anything a reader sees.
 *
 * `rung` is a word of this program and not of the subject; `golden` and `the solve` name parts of
 * the corpus machinery; `ledger` is the house name for the list of checks; `L1`…`L8` number lemmas
 * that have names; `research NN` and `Pass N` cite documents a reader does not have.
 */
const WORDS: readonly { readonly what: string; readonly re: RegExp }[] = [
  { what: "a constraint id", re: /\b(LEGALITY|CATCH|KILL|COVER)\b/ },
  { what: "the word 'rung'", re: /\brung/i },
  { what: "the word 'golden'", re: /\bgolden/i },
  { what: "the word 'ledger'", re: /\bledger/i },
  { what: "the phrase 'the solve'", re: /\bthe solve\b/ },
  { what: "a research citation", re: /research \d/i },
  { what: "a pass number", re: /\bPass \d/ },
  { what: "a lemma number", re: /\bL[1-8]\b/ },
];

/** Three or more capitals in a row, other than the five the app is allowed to write. */
const CAPS = /\b[A-Z]{3,}\b/g;
const CAPS_ALLOWED = new Set(["ML", "GL", "PNG", "URL", "CET"]);

/**
 * And a Roman numeral, which four of the eight books are cited by — `Freitag–Busam, Ch. III §7`.
 *
 * The exemption is the character set rather than a list of the numerals that happen to appear, so a
 * ninth book cited by chapter XIV does not break the sweep. It admits a handful of English words
 * that are also well-formed numerals (`MIX`, `DIM`), which is a price worth paying: this rule is a
 * net over a habit, not a proof, and the word list beside it catches what matters.
 */
const ROMAN = /^[IVXLCDM]{1,7}$/;

/**
 * Why a shouted word is only looked for in a string that has lowercase in it.
 *
 * A bare `"KILL"` or `"INPUT"` is a token — a data key, a `tagName` — and shouting is a property of
 * PROSE: a capitalised word inside a sentence. Applying the rule to tokens would flag the ids this
 * test deliberately exempts and `app.ts`'s three `tagName` comparisons, and would catch nothing the
 * word list does not already.
 */
const isProse = (text: string): boolean => /[a-z]/.test(text);

function offences(text: string): string[] {
  const out: string[] = [];
  for (const { what, re } of WORDS) if (re.test(text)) out.push(what);
  if (isProse(text)) {
    for (const m of text.match(CAPS) ?? []) {
      if (!CAPS_ALLOWED.has(m) && !ROMAN.test(m)) out.push(`the shouted word '${m}'`);
    }
  }
  return out;
}

// ── the source half ─────────────────────────────────────────────────────────────────────────────

function tsFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...tsFilesUnder(abs));
    else if (name.endsWith(".ts")) out.push(abs);
  }
  return out;
}

/** A bare id, or a contrast row's key, which is two ids and an ordinal. */
const IS_ID = /^(LEGALITY|CATCH|KILL|COVER)(\/[a-z]+#\d+)?$|^L[1-8]$/;

/** A module specifier — `"./ledger.js"` is a path, and a path is not a sentence. */
function isSpecifier(node: ts.Node): boolean {
  const p = node.parent as ts.Node | undefined;
  if (p === undefined) return false;
  return (
    ts.isImportDeclaration(p) ||
    ts.isExportDeclaration(p) ||
    ts.isImportTypeNode(p) ||
    (ts.isCallExpression(p) && p.expression.kind === ts.SyntaxKind.ImportKeyword)
  );
}

function literalsOf(file: string): { readonly line: number; readonly text: string }[] {
  const src = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.ES2022, true);
  const out: { line: number; text: string }[] = [];
  const visit = (node: ts.Node): void => {
    const isLiteral =
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node);
    if (isLiteral && !isSpecifier(node) && !IS_ID.test(node.text)) {
      out.push({ line: src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1, text: node.text });
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return out;
}

describe("no string the shell or the engine can print carries a house word", () => {
  const files = [...tsFilesUnder(join(SRC, "shell")), ...tsFilesUnder(join(SRC, "engine"))];

  it("reads the whole of both directories, so the sweep below is not passing on an empty list", () => {
    // **Both, counted separately.** `shell/` alone is 37 files, so a count of the two together is
    // satisfied by either one — measured by a mutant that dropped `engine/` and passed.
    const under = (dir: string): number => files.filter((f) => f.startsWith(join(SRC, dir))).length;
    expect(under("shell"), "the shell is not being read").toBeGreaterThan(20);
    expect(under("engine"), "the engine is not being read").toBeGreaterThan(10);
    expect(files.flatMap(literalsOf).length).toBeGreaterThan(1000);
  });

  it("finds none of them", () => {
    const bad: string[] = [];
    for (const file of files) {
      for (const { line, text } of literalsOf(file)) {
        const why = offences(text);
        if (why.length > 0) {
          bad.push(`${file.slice(SRC.length + 1)}:${line} — ${why.join(", ")} — ${JSON.stringify(text.slice(0, 90))}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("would find one if there were one, on each rule", () => {
    // The instrument, against a sentence of each kind it exists to catch. Without this the test
    // above is satisfied by a broken `offences`.
    expect(offences("the KILL column")).toContain("a constraint id");
    expect(offences("rung 2 of 4")).toContain("the word 'rung'");
    expect(offences("the golden value")).toContain("the word 'golden'");
    expect(offences("as the ledger has it")).toContain("the word 'ledger'");
    expect(offences("the solve reports")).toContain("the phrase 'the solve'");
    expect(offences("research 07 §6 warns")).toContain("a research citation");
    expect(offences("Pass 5 decides")).toContain("a pass number");
    expect(offences("L4 applies here")).toContain("a lemma number");
    expect(offences("the orders ADD")).toContain("the shouted word 'ADD'");
    // And the three things it must not catch.
    expect(offences("an ML bound on the arc")).toEqual([]);
    expect(offences("INPUT")).toEqual([]);
    expect(offences("Freitag–Busam, Ch. III §7")).toEqual([]);
  });
});

// ── the rendered half ───────────────────────────────────────────────────────────────────────────

const mounted: Shell2Handle[] = [];
afterEach(() => {
  for (const app of mounted.splice(0)) app.destroy();
  document.body.replaceChildren();
  window.localStorage.clear();
});

function mount(): Shell2Handle {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  window.history.replaceState(null, "", window.location.pathname);
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const app = mountShell2(root);
  mounted.push(app);
  return app;
}

const sandbox = (): ShellState => defaultState(circleTemplate([0, 0], 1.5));
const gallery = (record: string, fixture = 0): ShellState => ({
  ...sandbox(),
  mode: "gallery",
  record,
  fixture,
});

/**
 * Everything on screen: the text, and every attribute a reader can hear.
 *
 * A typeset formula stands for the sentence it is NAMED with — `shell2State.test.ts`'s rule — so the
 * `aria-label` is read instead of three copies of the glyphs KaTeX lays down.
 */
/**
 * Broken expressions of the shapes a reader types, one per throw site `shell/errors.ts` covers.
 *
 * The SAME list `test/errors.test.ts` drives the mapping with — kept here rather than imported so
 * the two suites cannot be made to agree by editing one file, which is the point of having the
 * screen sweep at all.
 */
const BROKEN_INPUTS = ["", "1/(1+z", "zz(3)", "1/z +", "1 § 2", "*/z", "if(z)", "sin(z, 1)"] as const;

/**
 * The visible text alone — no accessible names, because those legitimately carry LaTeX.
 *
 * `math()` puts the formula's plain-text form in an `aria-label`, which is the app's convention and
 * is full of backslashes by design. What must never carry one is what a reader SEES.
 */
function visibleText(): string {
  const clone = document.body.cloneNode(true) as HTMLElement;
  for (const m of clone.querySelectorAll('[role="math"]')) m.remove();
  return clone.textContent ?? "";
}

function onScreen(): string {
  const clone = document.body.cloneNode(true) as HTMLElement;
  for (const m of clone.querySelectorAll('[role="math"]')) {
    m.replaceChildren(document.createTextNode(m.getAttribute("aria-label") ?? ""));
  }
  const spoken: string[] = [];
  for (const el of clone.querySelectorAll("*")) {
    for (const name of ["aria-label", "title", "alt", "placeholder"]) {
      const v = el.getAttribute(name);
      if (v !== null) spoken.push(v);
    }
  }
  return `${clone.textContent ?? ""}\n${spoken.join("\n")}`;
}

/** The states, each named by what a reader would call it. */
function states(): { readonly name: string; readonly go: (app: Shell2Handle) => void }[] {
  const drill = DRILL_TASKS[0];
  return [
    { name: "the cold start", go: () => {} },
    { name: "the sandbox", go: (a) => a.actions().toSandbox() },
    {
      name: "the sandbox on a keyhole, with its seeded cut",
      go: (a) => {
        a.actions().toSandbox();
        a.actions().setExpr("z^(-0.5)/(1+z)");
        a.actions().setTemplate("keyhole");
      },
    },
    // **Every record, not a sample.** Eleven of the twenty-eight carried a shouted word on screen
    // when this sweep was first run — one each, in the sentence under the target — and two of them
    // said `the solve`, which is the program's word for its own machinery. A sample of three would
    // have found two of the thirteen.
    ...[...loadFamilies().families.keys()].map((id) => ({
      name: `the record '${id}'`,
      go: (a: Shell2Handle) => a.applyState(gallery(id)),
    })),
    {
      // **With the factor DECLARED**, which the state above does not reach: the split check's
      // refusal is the app's longest composed sentence and the only one that names $R(z)$, and it
      // renders nowhere else. A sweep that stopped at the seeded cut let a mutant turning that
      // sentence back into a plain string pass.
      name: "the sandbox with a branch factor declared, and the split refused",
      go: (a) => {
        a.actions().toSandbox();
        a.actions().setExpr("z^(-0.5)/(1+z)");
        a.actions().setTemplate("keyhole");
        const point = a.currentState().branch.points[0];
        if (point !== undefined) a.actions().declare(point.id);
      },
    },
    // **Two empty states, added at the Phase 2 gate** — M8 step 2.6. They are here rather than in
    // `errors.test.ts` because what failed was not the mapping: it was two READERS of
    // `resolution.reason` that never called it, and only a sweep over what is on screen can see a
    // surface nobody thought to test.
    { name: "the sandbox with an empty integrand box", go: (a) => { a.actions().toSandbox(); a.actions().setExpr(""); } },
    { name: "the sandbox with an expression that will not parse", go: (a) => { a.actions().toSandbox(); a.actions().setExpr("1/(1+z"); } },
    { name: "the worked-example mode", go: (a) => a.actions().setMode("worked") },
    { name: "the front door", go: (a) => a.actions().openFrontDoor() },
    { name: "the contrasts panel", go: (a) => a.actions().setContrastsOpen(true) },
    { name: "the practice chooser", go: (a) => a.actions().setMode("drill") },
    ...DRILL_STAGES.map((stage) => ({
      name: `practice, stage ${stage}`,
      go: (a: Shell2Handle) => a.applyState(taskState(drill, stage)),
    })),
    {
      name: "practice at stage 2, graded",
      go: (a: Shell2Handle) => {
        a.applyState(taskState(drill, 2));
        a.session().drillGraded = true;
        a.actions().redraw();
      },
    },
  ];
}

describe("nothing the SHELL puts on screen carries a house word", () => {
  // **One mount pass for both claims**, because mounting the app forty-one times takes fifteen
  // seconds and doing it twice takes thirty. The thin-screen check is the anti-vacuity clause for
  // the sweep beside it: a state that rendered nothing would pass the word check perfectly.
  const swept = states().map(({ name, go }) => {
    const app = mount();
    go(app);
    const text = onScreen();
    // **A `$` a reader can see is a sentence that was not typeset.** The convention is that every
    // formula travels inside `$…$` and `mathText` sets it; a sentence rendered as a string instead
    // puts the delimiters on screen. Step 2.1 shipped exactly that twice in one afternoon — a
    // refusal naming $R(z)$ printed as text, and a picker option, where an `<option>` renders no
    // markup at all and the fix is Unicode rather than markup.
    // **A backslash too**, and the same sweep found two: two records cite a chapter with a note in
    // TeX's OTHER inline delimiters, `\(x^{\alpha}R(x)\)`, which this app's convention does not
    // read — so the citation printed its own markup. A `$` says a sentence was not typeset; a
    // backslash says it was typeset in a notation nothing here parses.
    const raw = [...visibleText().matchAll(/[^\n]{0,40}[$\\][^\n]{0,40}/g)].map((m) => m[0]);
    for (const a of mounted.splice(0)) a.destroy();
    return { name, size: text.length, text, why: offences(text), dollars: raw };
  });

  it("reaches every state the list names", () => {
    // The count, because the two sweeps below are `filter`s: a `states()` that returned one entry
    // would satisfy both perfectly.
    expect(swept).toHaveLength(states().length);
    expect(swept.length).toBeGreaterThan(38);
  });

  it("puts no `$` and no backslash on screen — every formula is typeset, or is Unicode in a picker", () => {
    expect(swept.filter((s2) => s2.dollars.length > 0).map((s2) => `${s2.name}: ${s2.dollars.join(" | ")}`)).toEqual([]);
  });

  it("reaches every state, with enough on screen for the sweep to be about something", () => {
    expect(swept.filter((s2) => s2.size <= 400).map((s2) => s2.name)).toEqual([]);
  });

  it("puts none of the PARSER's own words on screen, in any state", () => {
    // **The Phase 2 gate found two that did** — the Derivation card printed `Empty expression` and
    // the strip printed *Nothing is plotted — Empty expression.*, three cards away from the
    // Integrand card's *Type an integrand to begin.* at the same moment. `test/errors.test.ts`
    // drives the mapping and passes either way, because neither reader called it.
    //
    // The needles come from the real `compile`, so a reworded upstream message cannot quietly stop
    // being checked for — and they are the message's own leading words rather than the whole
    // string, since the mapped sentences legitimately quote the token.
    const raw = BROKEN_INPUTS.map((src) => {
      const c = compile(src);
      return c.ok ? null : c.error.split(/[\s']/)[0];
    }).filter((w): w is string => w !== null && w.length > 3);
    expect(new Set(raw).size, "the parser's messages all start with the same word").toBeGreaterThan(2);
    const found = swept.flatMap((s2) =>
      [...new Set(raw)].filter((w) => s2.text.includes(w)).map((w) => `${s2.name}: “${w}…”`),
    );
    expect(found).toEqual([]);
  });

  it("shows the MAPPED sentence in each of those two states, so the check above is not passing on a blank screen", () => {
    const empty = swept.find((s2) => s2.name === "the sandbox with an empty integrand box");
    const broken = swept.find((s2) => s2.name === "the sandbox with an expression that will not parse");
    // **TWICE in the empty state**, which is the assertion with content: the Integrand card has
    // always said it, and the Derivation card — which printed `Empty expression` — now says it too.
    // One occurrence would pass with the defect still there.
    expect((empty?.text.match(/Type an integrand to begin/g) ?? []).length).toBe(2);
    expect(broken?.text).toContain("unbalanced parenthesis");
    expect(broken?.text).not.toContain("Expected");
  });

  it("finds none of them", () => {
    expect(swept.filter((s2) => s2.why.length > 0).map((s2) => `${s2.name}: ${s2.why.join(", ")}`)).toEqual([]);
  });

  it("does carry the LABELS, so a screen with the ids stripped out is not simply a blank one", () => {
    const app = mount();
    app.applyState(gallery("semicircle-quartic"));
    const text = onScreen();
    for (const label of ["Hypotheses", "Residues", "Boundary terms", "Target"]) {
      expect(text, label).toContain(label);
    }
  });
});
