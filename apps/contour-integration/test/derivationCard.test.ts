// @vitest-environment jsdom
//
// The Derivation card — M8 step 1.5b.
//
// **Rendered, not mounted**, for `test/cards.test.ts`'s reason: a card is
// `(state, resolution, session, actions) → description` and has no closure, so the honest instrument
// is to call it and patch the result into a detached node. The helpers below are that file's and are
// duplicated rather than imported — they are local to it, and a shared harness is a second thing to
// keep in step for no gain while both files are this small.
//
// Every test here names the defect it prevents. Two of them exist because the first assertion
// written for them would have passed with the feature absent, which is the only kind of test worth
// writing about a renderer: a `<details>` that is never built is not open, and a card that renders
// nothing contains no dollar signs.
import { describe, expect, it } from "vitest";

import { buildDerivation } from "../src/engine/derivation.js";
import { circleTemplate } from "../src/engine/contour/templates.js";
import { compile, defaultState, offeredCorpus, resolveState, type ShellState } from "../src/shell/state.js";
import { patch } from "../src/shell2/dom.js";
import { render } from "../src/shell2/render.js";
import { defaultSession, type Session } from "../src/shell2/session.js";
import type { ShellActions } from "../src/shell2/cards/card.js";

/** Actions that record what was asked for, so a control can be pressed and the ask inspected. */
function spyActions(): ShellActions & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    fitContour: () => calls.push("fit"),
    setExpr: (s) => calls.push(`expr:${s}`),
    setFixture: (i) => calls.push(`fixture:${i}`),
    setParam: (n, v) => calls.push(`param:${n}=${v}`),
    setScrubbing: (on) => calls.push(`scrub:${on}`),
    hover: (p) => calls.push(`hover:${p}`),
    setTemplate: (id) => calls.push(`template:${id}`),
    reverseContour: () => calls.push("reverse"),
    penStart: () => calls.push("pen:start"),
    penStop: () => calls.push("pen:stop"),
    penBack: () => calls.push("pen:back"),
    penCommit: (closed) => calls.push(`pen:commit:${closed}`),
    setBranch: () => calls.push("branch"),
    setIso: (on) => calls.push(`iso:${on}`),
    setStageMode: (m) => calls.push(`stageMode:${m}`),
    undo: () => calls.push("undo"),
    redo: () => calls.push("redo"),
    declare: (id) => calls.push(`declare:${id}`),
    undeclare: () => calls.push("undeclare"),
    setDeclaration: () => calls.push("decl"),
    setOpen: (id, open) => calls.push(`open:${id}:${open}`),
    copyLink: () => calls.push("copyLink"),
    saveFigure: (t) => calls.push(`saveFigure:${t}`),
    copyFigure: () => calls.push("copyFigure"),
    setMode: (m) => calls.push(`mode:${m}`),
    setRail: (side, folded) => calls.push(`rail:${side}:${folded}`),
    toSandbox: () => calls.push("toSandbox"),
    setContrastsOpen: (open) => calls.push(`contrasts:${open}`),
    applyState: () => calls.push("applyState"),
    openFrontDoor: () => calls.push("frontDoor"),
    notify: (text, level) => calls.push(`notify:${level}:${text}`),
    redraw: () => calls.push("redraw"),
  };
}

/** Draw the right rail for a state and hand back the Derivation card plus the actions it will call. */
function derivationOf(
  state: ShellState,
  session: Session = defaultSession(),
): { card: HTMLElement; actions: ReturnType<typeof spyActions> } {
  const compiled = compile(state.expr);
  const resolution = resolveState(state, compiled);
  const poles =
    resolution.kind === "gallery"
      ? (resolution.run?.poles ?? null)
      : compiled.ok
        ? compiled.poles
        : null;
  const actions = spyActions();
  const host = document.createElement("div");
  patch(host, render(state, resolution, session, actions, poles).right);
  const found = host.querySelector<HTMLElement>('[data-card="derivation"]');
  if (found === null) throw new Error("the right rail has no Derivation card");
  return { card: found, actions };
}

const sandbox = (over: Partial<ShellState> = {}): ShellState => ({
  ...defaultState(circleTemplate([0, 0], 1.5)),
  ...over,
});

const gallery = (record: string, fixture = 0): ShellState =>
  sandbox({ mode: "gallery", record, fixture });

/** A sandbox whose pole sits ON the circle: LEGALITY refuses, so one stage fails and others do not. */
const refusing = (): ShellState => sandbox({ expr: "1/(z-1.5)" });

const RECORD_IDS = offeredCorpus()
  .tiers.flatMap((t) => t.families)
  .map((f) => f.id);

/** The stage disclosures, in order — the card's own children, not any nested `<details>`. */
const stagesOf = (card: HTMLElement): HTMLDetailsElement[] =>
  [...card.querySelectorAll<HTMLDetailsElement>(":scope > details")];

const summaryOf = (d: HTMLDetailsElement): string => d.querySelector("summary")?.textContent ?? "";

const stageNamed = (card: HTMLElement, title: string): HTMLDetailsElement => {
  const found = stagesOf(card).find((d) => summaryOf(d).startsWith(title));
  if (found === undefined) throw new Error(`no stage titled ${title} in ${stagesOf(card).map(summaryOf).join(" | ")}`);
  return found;
};

/**
 * What a reader actually SEES.
 *
 * KaTeX emits a `<span class="katex-mathml">` carrying the LaTeX source verbatim, so a naive
 * `textContent` reads the delimiters back out of the typeset formula and can never detect a raw one.
 * Stripping it first is `test/cards.test.ts`'s own technique.
 */
function visibleText(card: HTMLElement): string {
  const clone = card.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".katex-mathml").forEach((n) => n.remove());
  return clone.textContent ?? "";
}

describe("the Derivation card", () => {
  // The whole corpus through one renderer. Three things could break it and none is visible from a
  // single record: `dom.ts` THROWS on two children of one parent sharing a key (step 1.4 found the
  // Singularities card spending `card()`'s `"t"` a second time and drawing the heading twice), a
  // record whose stage list is empty would render a card with a title and nothing under it, and a
  // `$…$` sentence set as a text node puts raw LaTeX on screen.
  //
  // **The `$` clause is the one that needed care**: a card that rendered nothing contains no dollar
  // signs either, so it is asserted only alongside a positive count of typeset formulas. It caught a
  // real defect — `Piece.name` is itself a `$…$` sentence (`the circle $|z - a| = R$`), which the
  // first draft set as a plain tag.
  it("renders every gallery record: stages, typeset, and no delimiter on screen", () => {
    expect(RECORD_IDS.length).toBe(28);
    for (const id of RECORD_IDS) {
      const { card } = derivationOf(gallery(id));
      expect(stagesOf(card).length, `${id}: stages`).toBeGreaterThan(0);
      expect(card.querySelectorAll(".katex").length, `${id}: typeset`).toBeGreaterThan(0);
      expect(visibleText(card), `${id}: a raw delimiter reached the screen`).not.toContain("$");
    }
  });

  // The card's reason for existing: a reader whose argument did not close is looking for the step
  // that stopped it. If every stage opened, the diagnostic would be buried in the proof; if none
  // did, it would be one click further away than the failure is urgent.
  //
  // Asserting only "the failing one is open" would pass with `open` hardcoded to `true`, so the
  // non-failing stage in the SAME card is asserted shut in the same breath.
  it("opens the failing stage and leaves the others shut", () => {
    const { card } = derivationOf(refusing());
    const failing = stageNamed(card, "Hypotheses");
    const passing = stageNamed(card, "Residues");
    expect(summaryOf(failing)).toContain("failed");
    expect(failing.open).toBe(true);
    expect(passing.open).toBe(false);
    // And the card says WHERE it stops in the reader's words. `failedAt` is a `ConstraintId` — a
    // DATA KEY — and the old shell printed it raw, so a reader met `LEGALITY` here and the textbook
    // name for the same group two cards away (`vocabulary.ts` §0.2: ids are never labels).
    expect(card.textContent ?? "").toContain("where it stops: Hypotheses");
    expect(card.textContent ?? "").not.toContain("LEGALITY");
  });

  // The problem statement is the one thing in the card that is NOT a levelled line, and it has to be
  // there: a derivation that opens with `Hypotheses` never says what is being integrated. It is also
  // the only content whose absence the stage summary cannot reveal — the summary counts
  // `stage.statements`, so it reads `2 statements` whether or not either was drawn.
  it("states the problem, with its label, in the setup stage", () => {
    const setup = stageNamed(derivationOf(refusing()).card, "The problem");
    const text = setup.textContent ?? "";
    expect(text).toContain("integrand");
    expect(text).toContain("1/(z-1.5)");
    expect(text).toContain("contour");
    expect(setup.querySelectorAll(".tag").length).toBe(2);
    // And the stage's standing rationale — why this step is in the argument at all. It is a property
    // of the METHOD rather than of this integral, which is why `derivation.ts` carries it as data;
    // dropping it here would leave the headings with nothing under them but their own titles.
    expect(text).toContain("The integral to be evaluated, the integrand on the contour");
  });

  // **A restricted claim that loses its restriction is not a vaguer claim, it is a false one**
  // (`@cas/rigor`'s own words), and a repair is the only part of a refusal a reader can act on. So
  // neither is ever behind a disclosure, and both are asserted where they occur: the keyhole's
  // `arg z ∈ [0, 2π)` rides its solve and verdict lines, and the repair rides the refusing sandbox's
  // failed hypothesis.
  //
  // The selector is a DIRECT child of the line's body on purpose — a failed audit STEP also carries
  // `restriction`, so a loose `.restriction` would count the trail's ✗ marks and pass with the
  // line's own restriction gone.
  it("keeps a restriction and a repair in the open", () => {
    const state = gallery("mellin-keyhole");
    const resolution = resolveState(state, compile(state.expr));
    if (resolution.kind !== "gallery" || resolution.run === null) throw new Error("no run");
    const run = resolution.run;
    const restricted = buildDerivation({
      ledger: run.ledger,
      poles: run.poles,
      integral: run.integral,
      theorem: run.theorem,
      spec: run.contour.pieces,
      ...(resolution.solved === null ? {} : { solved: resolution.solved }),
    })
      .stages.flatMap((st) => st.lines)
      .filter((l) => l.restriction !== undefined).length;
    expect(restricted).toBeGreaterThan(0);
    expect(
      derivationOf(state).card.querySelectorAll("li > .pieceValue > p.restriction").length,
    ).toBe(restricted);

    const refused = derivationOf(refusing()).card;
    const repairs = [...refused.querySelectorAll<HTMLElement>("li > .pieceValue > p.repair")];
    expect(repairs.length).toBe(1);
    expect((repairs[0]?.textContent ?? "").length).toBeGreaterThan(0);
  });

  // **A stage with no LINES is not an empty stage.** `The problem` carries the record's target and
  // the expression actually integrated and never carries a certified line at all — nothing about a
  // problem statement was established, which is exactly why it arrives as a `Statement` — so a
  // summary counting only lines announces `0 steps` above the two sentences a reader most needs.
  // The same is true of a refused argument's `Residues`, which can hold a pole table and nothing
  // else. Both wordings are asserted, since a summary that said `statements` everywhere would be
  // wrong in the other direction.
  it("counts whichever of lines, statements and poles a stage actually has", () => {
    const { card } = derivationOf(refusing());
    expect(summaryOf(stageNamed(card, "The problem"))).toContain("2 statements");
    expect(summaryOf(stageNamed(card, "Residues"))).toContain("1 pole");
    expect(summaryOf(stageNamed(card, "Hypotheses"))).toContain("1 of 1 failed");
    expect(summaryOf(stageNamed(derivationOf(sandbox({ expr: "1/z" })).card, "Hypotheses"))).toContain("2 steps");
  });

  // `session.open[id]` is tri-state, and this is what the third state buys. A reader who shuts the
  // failing stage must find it shut after the next recompute — a derivation is rebuilt on every
  // frame of a contour drag, so a boolean defaulting to `true` would re-open the panel under the
  // pointer. Both directions, because an override that could only OPEN would leave the failing
  // stage unclosable, which is the half a `?? false` default hides.
  it("lets an explicit open state win over the computed default, both ways", () => {
    const shut = defaultSession();
    shut.open["derivation:legality"] = false;
    expect(stageNamed(derivationOf(refusing(), shut).card, "Hypotheses").open).toBe(false);

    const opened = defaultSession();
    opened.open["derivation:catch"] = true;
    expect(stageNamed(derivationOf(refusing(), opened).card, "Residues").open).toBe(true);
  });

  // The click has to REACH the session, or the override above is unreachable in the app: `setOpen`
  // is the only channel, since the state is read from the session and never off the DOM (a patch
  // that rebuilt a `<details>` would otherwise silently close it). Asserting the id as well as the
  // call, because an action fired with the wrong id writes a state nothing reads.
  it("reports a toggle through setOpen, by id", () => {
    const { card, actions } = derivationOf(refusing());
    const passing = stageNamed(card, "Residues");
    passing.open = true;
    passing.dispatchEvent(new Event("toggle"));
    expect(actions.calls).toContain("open:derivation:catch:true");
  });

  // **No badge in this card is a literal.** The rule the app is defending is PLAN §9's R2: a
  // renderer that minted its own labels could choose them. So the badges are read off the DOM in
  // order and compared against the levels the ENGINE computed for the same inputs — a hand-written
  // `=` anywhere in the card makes the sequences differ.
  //
  // The one substitution the card is allowed is `⚠` in place of a FAILED row's level, which the
  // Result card makes too. **Measuring found that almost nothing observes it**: on every record at
  // fixture 0 no line fails at all, and on the sandbox's refusing states the failed line's own level
  // is already `⚠`, so dropping the substitution changes not one glyph. `keyhole-x-to-the-n` at
  // fixture 3 is the case where it bites — Pass 5 refuses while the run itself is sound, so
  // `buildDerivation` mints the `unknown` it is allowed to mint and the verdict line fails carrying
  // `?`. Without the substitution that line would badge a REFUSAL as "nothing was established",
  // which is a weaker statement than the app is entitled to make. The assertion below pins that the
  // case is present rather than trusting it: an expected `⚠` whose engine level is not `⚠`.
  it.each([
    ["mellin-keyhole", 0],
    ["keyhole-x-to-the-n", 3],
  ])("badges every line of %s#%i from the engine's own level", (record, fixture) => {
    const state = gallery(record, fixture);
    const compiled = compile(state.expr);
    const resolution = resolveState(state, compiled);
    if (resolution.kind !== "gallery" || resolution.run === null) throw new Error("no run");
    const run = resolution.run;
    const lines = buildDerivation({
      ledger: run.ledger,
      poles: run.poles,
      integral: run.integral,
      theorem: run.theorem,
      spec: run.contour.pieces,
      ...(resolution.solved === null ? {} : { solved: resolution.solved }),
    }).stages.flatMap((s) => s.lines);
    const expected = lines.map((l) => (l.status === "failed" ? "⚠" : l.level));

    const { card } = derivationOf(state);
    const drawn = [...card.querySelectorAll<HTMLElement>("li > .badge")].map((b) => b.textContent);
    expect(expected.length).toBeGreaterThan(0);
    expect(drawn).toEqual(expected);
    if (fixture === 3) {
      // The anti-vacuity clause: this row is the only reason the substitution is observable at all.
      expect(lines.some((l) => l.status === "failed" && l.level !== "⚠")).toBe(true);
    }
  });

  // **How a claim was established travels with it.** A derivation whose lines carried only their
  // badge would say `=` beside a sentence and leave a reader with no way to ask what produced it —
  // which is the whole difference between this card and a list of results. One method line per
  // line, and its text is the certificate's own `method` string, not a paraphrase.
  it("prints each line's method beneath it", () => {
    const state = sandbox({ expr: "1/z" });
    const compiled = compile(state.expr);
    const resolution = resolveState(state, compiled);
    if (resolution.kind !== "plain" || !compiled.ok) throw new Error("no analysis");
    const a = resolution.analysis;
    const methods = buildDerivation({
      ledger: a.ledger,
      poles: compiled.poles,
      integral: a.integral,
      theorem: a.theorem,
      spec: state.contour.pieces,
    })
      .stages.flatMap((st) => st.lines)
      .map((l) => l.method);

    const { card } = derivationOf(state);
    const drawn = [...card.querySelectorAll<HTMLElement>("li > .pieceValue > p.muted.small")].map(
      (p) => p.textContent ?? "",
    );
    expect(drawn.length).toBe(methods.length);
    // The header counts the same lines the stages hold. `8 steps, each with its evidence` is the
    // card's one summary of its own size, and a constant there would go on reading right while the
    // argument beneath it grew or shrank.
    expect(card.querySelector("p.muted.small")?.textContent ?? "").toBe(
      `${methods.length} steps, each with its evidence`,
    );
    // Compared only on the methods carrying no `$`, because a typeset one's `textContent` is
    // KaTeX's rendering and not the source — asserting those by string would be asserting KaTeX.
    const plain = methods.filter((m) => !m.includes("$"));
    expect(plain.length).toBeGreaterThan(0);
    for (const m of plain) expect(drawn).toContain(m);
  });

  // The rail end of the three-surface highlight: the piece list, the stage and this line all key it
  // on `Piece.id`. A line that asked with the piece's NAME would break the first time two pieces
  // were named alike — a keyhole's two lips are — and `hover(undefined)` would not clear anything.
  //
  // Vacuity is the risk: a card with no piece-bearing line would make an empty loop pass, so the
  // line is found first and its existence asserted.
  it("asks for its piece on pointerenter and clears it on leave", () => {
    const { card, actions } = derivationOf(sandbox({ expr: "1/z" }));
    const hot = [...card.querySelectorAll<HTMLElement>("li")].filter((li) =>
      li.querySelector(".tag") !== null,
    );
    expect(hot.length).toBeGreaterThan(0);
    const li = hot[0] as HTMLElement;
    li.dispatchEvent(new Event("pointerenter"));
    li.dispatchEvent(new Event("pointerleave"));
    expect(actions.calls).toEqual(["hover:circle", "hover:null"]);
  });

  // The other half of the same link: the session's hover has to reach the line's class, or the
  // highlight is one-way and the stage can light a piece the rail does not.
  it("marks the hovered line hot", () => {
    const cold = derivationOf(sandbox({ expr: "1/z" })).card;
    expect(cold.querySelectorAll("li.hot").length).toBe(0);

    const session = defaultSession();
    session.hover = { ...session.hover, piece: "circle" };
    const warm = derivationOf(sandbox({ expr: "1/z" }), session).card;
    expect(warm.querySelectorAll("li.hot").length).toBe(1);
  });

  // Pass 2's per-pole rows belong to the Residues stage and to no other — they are the data behind
  // the CATCH line, and a table under `Boundary terms` would attach the winding numbers to the arcs
  // that are being bounded. Both halves are needed: "it is in Residues" passes with a table in every
  // stage, and "it is in no other stage" passes with no table at all.
  it("puts the per-pole table in the Residues stage and nowhere else", () => {
    const { card } = derivationOf(gallery("semicircle-quartic"));
    const residues = stageNamed(card, "Residues");
    expect(residues.querySelectorAll(".poleTable tbody tr").length).toBeGreaterThan(0);
    for (const stage of stagesOf(card)) {
      if (stage === residues) continue;
      expect(stage.querySelectorAll(".poleTable").length, summaryOf(stage)).toBe(0);
    }
  });

  // **A winding nobody DECIDED is not a winding of zero.** `integrateContour` weighs every pole the
  // report found, so a missing entry means the geometry said nothing — and printing `0` there would
  // put a coefficient into `2πi Σ n·Res` that no predicate established. The contrast is the whole
  // assertion: `1/((z-1.5)(z-0.2))` on the circle of radius 1.5 has one pole ON the curve, which is
  // undecidable, and one strictly inside, which decides to 1. A card that printed `0` for the first
  // would look exactly as confident as the second.
  it("says undecided where the winding was not decided, and the number where it was", () => {
    const { card } = derivationOf(sandbox({ expr: "1/((z-1.5)*(z-0.2))" }));
    const rows = [...card.querySelectorAll<HTMLElement>(".poleTable tbody tr")];
    expect(rows.length).toBe(2);
    const inds = rows.map((r) => r.querySelectorAll("td")[3]);
    const texts = inds.map((td) => td?.textContent ?? "");
    expect(texts).toContain("undecided");
    expect(texts).toContain("1");
    expect(texts).not.toContain("0");
    // …and it is flagged as a doubt, not set as a value: `tag warn` is what the rail styles a
    // withheld number by, and a plain cell reading "undecided" would be indistinguishable from a
    // residue that happened to be called that.
    const doubtful = inds.find((td) => (td?.textContent ?? "") === "undecided");
    expect(doubtful?.querySelector(".tag.warn")).not.toBeNull();

    // The row's other two facts, which are the reason the table is here at all: `2πi Σ n·Res` needs
    // the residue and the coefficient side by side, and an order column that drew nothing would
    // leave a double pole looking like a simple one.
    expect(rows.map((r) => r.querySelectorAll("td")[1]?.textContent ?? "")).toEqual(["1", "1"]);
    const residues = rows.map((r) => r.querySelectorAll("td")[2]?.textContent ?? "");
    expect(residues.some((t) => t.includes("10/13"))).toBe(true);
    expect(residues.every((t) => t !== "")).toBe(true);
  });

  // The audit trail is a NESTED disclosure, shut, because a satisfied line's ✓ steps are evidence
  // worth having and not worth reading first — the stage above it is already the reader's unit of
  // attention. Asserting `open === false` alone would pass with no trail rendered at all, so the
  // trail is located first and its steps counted.
  it("folds a satisfied line's provenance into a nested disclosure, shut", () => {
    const { card } = derivationOf(sandbox({ expr: "1/z" }));
    const nested = [...card.querySelectorAll<HTMLDetailsElement>("details details")];
    expect(nested.length).toBeGreaterThan(0);
    for (const trail of nested) {
      expect(summaryOf(trail)).toContain("audit trail");
      expect(trail.querySelectorAll("p").length).toBeGreaterThan(0);
      expect(trail.open).toBe(false);
    }
  });

  // And the reader can open one: the provenance ids are namespaced per stage and per line, so two
  // trails cannot share a key and opening one cannot open another.
  it("honours an explicit open state on one provenance trail only", () => {
    const session = defaultSession();
    session.open["derivation:kill:prov:0"] = true;
    const { card } = derivationOf(sandbox({ expr: "1/z" }), session);
    const opened = [...card.querySelectorAll<HTMLDetailsElement>("details details")].filter((d) => d.open);
    expect(opened.length).toBe(1);
    expect(stageNamed(card, "Boundary terms").querySelector("details")?.open).toBe(true);
  });

  // The conclusion is badged from the CONCLUSION's own evidence, which is NOT the argument-wide
  // meet: a vanishing arc owes a `≤` at finite R and an `=` for its limit, and only the limit enters
  // the answer (DESIGN §4 Pass 3). Carrying the meet here would cap every gallery result at `≤`.
  //
  // **A literal would survive a one-record test**, which is how this one was written: `badge("=")`
  // passes against any record whose conclusion IS exact, and almost all of them are. So two records
  // are drawn and the two glyphs are required to DIFFER — `jordan-quartic` concludes at `?`, because
  // its own certificates say so — which no constant can satisfy.
  it("badges the conclusion from the conclusion's own evidence", () => {
    const drawn: string[] = [];
    for (const record of ["mellin-keyhole", "jordan-quartic"]) {
      const state = gallery(record);
      const resolution = resolveState(state, compile(state.expr));
      if (resolution.kind !== "gallery" || resolution.run === null) throw new Error("no run");
      const run = resolution.run;
      const expected = buildDerivation({
        ledger: run.ledger,
        poles: run.poles,
        integral: run.integral,
        theorem: run.theorem,
        spec: run.contour.pieces,
        ...(resolution.solved === null ? {} : { solved: resolution.solved }),
      }).conclusion;
      const conclusion = derivationOf(state).card.querySelector<HTMLElement>(".verdict");
      const badge = conclusion?.querySelector<HTMLElement>(".badge");
      expect(badge?.textContent, record).toBe(expected?.level);
      // A badge with no value beside it is a label on nothing. The text is compared only when the
      // record's own form carries no `$` — a typeset one reads back as KaTeX's rendering, not as
      // the source, and asserting that would be asserting KaTeX.
      const text = expected?.text ?? "";
      expect(text.length, record).toBeGreaterThan(0);
      if (!text.includes("$")) expect(conclusion?.textContent ?? "", record).toContain(text);
      drawn.push(badge?.textContent ?? "");
    }
    expect(new Set(drawn).size).toBe(2);
  });

  // The ✓/✗ on an audit step comes from `Step.ok` and from nothing else — not from the sentence,
  // which is written in the past tense either way ("tried the sharp route", "fell back to the coarse
  // one"). A trail that ticked everything would report a fallback as a success.
  //
  // The marks are compared in order against the engine's own flags, and the expected list is
  // required to contain a ✗: `mellin-keyhole` is the record chosen because it has one, and without
  // that clause the whole assertion passes on a card that ticks unconditionally.
  it("marks each audit step from its own ok flag", () => {
    const state = gallery("mellin-keyhole");
    const resolution = resolveState(state, compile(state.expr));
    if (resolution.kind !== "gallery" || resolution.run === null) throw new Error("no run");
    const run = resolution.run;
    const expected = buildDerivation({
      ledger: run.ledger,
      poles: run.poles,
      integral: run.integral,
      theorem: run.theorem,
      spec: run.contour.pieces,
      ...(resolution.solved === null ? {} : { solved: resolution.solved }),
    })
      .stages.flatMap((s) => s.lines)
      .flatMap((l) => l.provenance)
      .map((s) => (s.ok ? "✓" : "✗"));
    expect(expected).toContain("✗");

    const { card } = derivationOf(state);
    const marks = [...card.querySelectorAll<HTMLElement>("details details > p")].map(
      (p) => (p.textContent ?? "").charAt(0),
    );
    expect(marks).toEqual(expected);
    // And a failed step is coloured as the diagnostic it is, rather than left to be spotted among
    // the ticks — three glyphs down a list is not a scannable difference.
    const bad = [...card.querySelectorAll<HTMLElement>("details details > p")].filter((p) =>
      (p.textContent ?? "").startsWith("✗"),
    );
    expect(bad.length).toBeGreaterThan(0);
    for (const p of bad) expect(p.className).toContain("restriction");
  });

  // There is no number and no stage list when there is nothing to derive — an honest sentence
  // rather than a blank card or a heading over emptiness. `nothing()` is the shell's own em-dash
  // paragraph, and the placeholder class is what the rail styles it by.
  it("says why there is nothing, rather than showing an empty argument", () => {
    const { card } = derivationOf(sandbox({ expr: "1/(" }));
    expect(stagesOf(card).length).toBe(0);
    expect(card.querySelector(".placeholder")?.textContent ?? "").not.toBe("");
  });
});
