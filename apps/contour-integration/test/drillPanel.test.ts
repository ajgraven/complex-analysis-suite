// @vitest-environment jsdom
//
// The drill AS A RAIL CARD — M8 step 1.7.
//
// `drill.test.ts` pins the model (what a rung asks, what the ledger says about a pick, what a
// drawing has to enclose); `drillShell.test.ts` pins the OLD shell's masks. This is the same
// property set against `shell2`: that {@link drillMask} decides exactly what the old `mask()`
// decided, that each rung renders its own controls and nobody else's, and that the grading, the menu
// and the enclosure check are the ENGINE's verdicts rather than sentences this card composed.
//
// **Rendered, not mounted** — `cards.test.ts`'s method: a card is `(state, resolution, session,
// actions) → description`, so the honest instrument is to call it and patch the result into a
// detached node. Its helpers are copied rather than imported, because step 1.7 does not own that
// file.
import { describe, expect, it } from "vitest";

import { circleTemplate, semicircleTemplate } from "../src/engine/contour/templates.js";
import { reverseContour } from "../src/engine/contour/edit.js";
import {
  DRILL_TASKS,
  VERIFIED_ROLE_TEMPLATES,
  menuVerdict,
  pieceQuestions,
  runTask,
  taskById,
  taskState,
  type DrillStage,
  type DrillTask,
} from "../src/shell/drill.js";
import { PROGRESS_KEY, readProgress } from "../src/shell/drillProgress.js";
import { compile, defaultState, resolveState, type ShellState } from "../src/shell/state.js";
import { patch } from "../src/shell2/dom.js";
import { defaultSession, resetTransient, type Session } from "../src/shell2/session.js";
import { drillMask, drillPanel } from "../src/shell2/drillPanel.js";
import type { CardContext, ShellActions } from "../src/shell2/cards/card.js";

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Helpers — `cards.test.ts`'s, plus the two this file needs (a live session and the applied state).
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Actions that record what was asked for — and, for `applyState`, the state that was asked for. */
function spyActions(): ShellActions & { calls: string[]; applied: ShellState[] } {
  const calls: string[] = [];
  const applied: ShellState[] = [];
  return {
    calls,
    applied,
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
    applyState: (next) => {
      applied.push(next);
      calls.push("applyState");
    },
    openFrontDoor: () => calls.push("frontDoor"),
    notify: (text, level) => calls.push(`notify:${level}:${text}`),
    redraw: () => calls.push("redraw"),
  };
}

const sandbox = (over: Partial<ShellState> = {}): ShellState => ({
  ...defaultState(circleTemplate([0, 0], 1.5)),
  ...over,
});

const gallery = (record: string, fixture = 0): ShellState =>
  sandbox({ mode: "gallery", record, fixture });

/** A context for a state, with a session the caller can keep across redraws. */
function contextOf(state: ShellState, session: Session, actions: ShellActions): CardContext {
  const compiled = compile(state.expr);
  const resolution = resolveState(state, compiled);
  const poles =
    resolution.kind === "gallery" ? (resolution.run?.poles ?? null) : compiled.ok ? compiled.poles : null;
  return { state, resolution, session, poles, actions };
}

/**
 * The panel for a state, with a `draw()` that re-renders into the SAME host and session.
 *
 * The redraw is manual on purpose: in the app a card asks for one with `actions.redraw()`, and a
 * harness that redrew by itself would hide a handler that mutated the session and asked for nothing
 * — a reader clicking Check and watching nothing happen.
 */
function harness(state: ShellState): {
  host: HTMLElement;
  session: Session;
  actions: ReturnType<typeof spyActions>;
  draw: () => void;
} {
  const session = defaultSession();
  const actions = spyActions();
  const ctx = contextOf(state, session, actions);
  const host = document.createElement("div");
  const draw = (): void => {
    const desc = drillPanel(ctx);
    patch(host, desc === null ? [] : [desc]);
  };
  draw();
  return { host, session, actions, draw };
}

const drillState = (task: string, stage: DrillStage): ShellState => taskState(taskById(task) as DrillTask, stage);

const q = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string): T => {
  const e = root.querySelector<T>(sel);
  if (e === null) throw new Error(`no ${sel}`);
  return e;
};
const buttons = (root: ParentNode): HTMLButtonElement[] => [...root.querySelectorAll("button")];
/** The most recent entry. `Array.prototype.at` is past this app's `lib`, and a `!` is not a test. */
function last<T>(items: readonly T[]): T {
  const item = items[items.length - 1];
  if (item === undefined) throw new Error("nothing was applied");
  return item;
}
const clickExact = (root: ParentNode, label: string): void => {
  const b = buttons(root).find((x) => (x.textContent ?? "").trim() === label);
  if (b === undefined) throw new Error(`no button labelled exactly '${label}'`);
  b.click();
};
const tagsSaying = (root: ParentNode, word: string): number =>
  [...root.querySelectorAll(".tag")].filter((t) => (t.textContent ?? "").trim() === word).length;

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The mask.
// ──────────────────────────────────────────────────────────────────────────────────────────────

const maskOf = (state: ShellState, over: Partial<Session> = {}): string =>
  drillMask({ ...contextOf(state, { ...defaultSession(), ...over }, spyActions()) });

describe("drillMask — the one decision the whole page reads", () => {
  it("masks exactly the rungs the old shell's `mask()` masked, and nothing else", () => {
    // **The table IS the assertion.** A mask that returned `"none"` everywhere would leave every
    // model test green and the drill giving its own answers away, which is why this enumerates all
    // four rungs in both modes rather than spot-checking the one that is interesting.
    expect(maskOf(gallery("jordan-cosine-kernel")), "no rung open").toBe("none");
    expect(maskOf(drillState("oscillatory", 1)), "rung i is the app as it otherwise is").toBe("none");
    expect(maskOf(drillState("oscillatory", 2)), "rung ii hides the KILL column").toBe("kill");
    expect(maskOf(drillState("oscillatory", 3)), "rung iii hides the whole argument").toBe("argument");
    expect(maskOf(drillState("oscillatory", 4)), "rung iv is the sandbox; there is nothing to hide").toBe("none");
  });

  it("stops masking at rung iii once the reader's OWN contour is on screen", () => {
    // A pick is an ordinary sandbox state, and from that moment the ledger is judging the reader's
    // contour rather than giving the record's away. Masking it would hide the reply to their move —
    // and this is the clause the old `mask()` spelled `&& mode === "gallery"`.
    const picked: ShellState = { ...drillState("oscillatory", 3), mode: "sandbox", record: null };
    expect(maskOf(picked)).toBe("none");
  });

  it("a GRADED rung ii unmasks — the ledger is the answer sheet now", () => {
    // The old shell carried this as `&& drillGraded === null` in `renderLedger` AND in
    // `renderDerivation`, two readers of one question; folded in here so it cannot be half-applied.
    expect(maskOf(drillState("oscillatory", 2), { drillGraded: true })).toBe("none");
    // And a grading may NOT unmask rung iii, where the argument is exactly what is masked (M7.4).
    expect(maskOf(drillState("oscillatory", 3), { drillGraded: true })).toBe("argument");
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The card, and what belongs to which rung.
// ──────────────────────────────────────────────────────────────────────────────────────────────

describe("the card itself", () => {
  it("is nothing at all when no rung is open", () => {
    // Not a hidden card and not an empty one: a heading over nothing claims a rung is open.
    expect(drillPanel(contextOf(gallery("jordan-cosine-kernel"), defaultSession(), spyActions()))).toBeNull();
    expect(harness(gallery("jordan-cosine-kernel")).host.children).toHaveLength(0);
  });

  it("refuses a task this build does not have, rather than drawing a card about it", () => {
    // A link can name anything. `taskById` is the reader, and a card titled `Drill` over a task that
    // does not exist would mask the page (the mask reads the STAGE) with nothing to say why.
    const bogus: ShellState = { ...gallery("jordan-cosine-kernel"), drill: { task: "no-such-task", stage: 2 } };
    expect(drillPanel(contextOf(bogus, defaultSession(), spyActions()))).toBeNull();
  });

  it("is one card with exactly one heading, addressed as `drill`", () => {
    // `card()` cannot build it — `vocabulary.ts` has no `drill` id — so the shape is reproduced by
    // hand, and a second `<h2>` here breaks the page's heading outline, which is one of the four
    // structural invariants the shell asserts.
    const { host } = harness(drillState("oscillatory", 1));
    const card = q(host, 'section[data-card="drill"]');
    expect(card.classList.contains("card2")).toBe(true);
    expect(card.querySelectorAll("h2")).toHaveLength(1);
    expect(host.querySelectorAll("section")).toHaveLength(1);
    expect(card.textContent).toContain("rung 1 of 4");
  });

  it("gives each rung its OWN controls and no other rung's", () => {
    // The defect this prevents is a card that renders every control and hides the irrelevant ones
    // with CSS: rung iii's menu on screen at rung ii is the answer to the question being asked.
    const at = (stage: DrillStage): HTMLElement => harness(drillState("oscillatory", stage)).host;

    const one = at(1);
    expect(one.querySelectorAll("select"), "rung i asks nothing").toHaveLength(0);
    expect(buttons(one).map((b) => b.textContent)).toEqual(["Next rung", "Leave the drill"]);

    const two = at(2);
    expect(two.querySelectorAll("select").length, "rung ii is the questions").toBeGreaterThan(0);
    expect(two.querySelector('[aria-label^="close over"]'), "no menu at rung ii").toBeNull();
    expect(buttons(two).map((b) => b.textContent)).toContain("Check");

    const three = at(3);
    expect(three.querySelectorAll("select"), "no answer sheet at rung iii").toHaveLength(0);
    expect(three.querySelectorAll('[aria-label^="close over"]').length).toBeGreaterThan(0);

    const four = at(4);
    expect(four.querySelectorAll("select")).toHaveLength(0);
    expect(four.querySelector('[aria-label^="close over"]'), "no menu at rung iv").toBeNull();
    expect(buttons(four).map((b) => b.textContent)).toContain("Check the enclosure");
    expect(buttons(four).map((b) => b.textContent)).toContain("Start again");
  });

  it("puts no `$` on screen, in any rung of any task", () => {
    // Piece names and ledger claims are `$…$` sentences (`the $R \to \infty$ semicircle`), so a card
    // that set one as text would print raw dollars and backslashes. **`.katex-mathml` carries the
    // LaTeX source**, so it is stripped first — otherwise the assertion reads what KaTeX emits for
    // screen readers rather than what a reader sees.
    for (const task of DRILL_TASKS) {
      for (const stage of [1, 2, 3, 4] as const) {
        const { host } = harness(drillState(task.id, stage));
        const clone = host.cloneNode(true) as HTMLElement;
        for (const m of clone.querySelectorAll(".katex-mathml")) m.remove();
        const shown = clone.textContent ?? "";
        expect(shown, `${task.id}/${stage} leaked LaTeX`).not.toContain("$");
        expect(shown, `${task.id}/${stage} leaked LaTeX`).not.toMatch(/\\to|\\rho|\\alpha|\\operatorname/);
      }
    }
  });

  it("typesets the piece names rather than merely dropping their delimiters", () => {
    // The weaker test above passes if the card strips `$` and prints the LaTeX plain. This one fails
    // unless KaTeX actually ran on it.
    const { host } = harness(drillState("oscillatory", 2));
    expect(host.querySelectorAll(".katex").length, "nothing was typeset").toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Rung ii.
// ──────────────────────────────────────────────────────────────────────────────────────────────

describe("rung ii — the KILL column", () => {
  it("asks one question per PIECE, in the ledger's own order", () => {
    // A card that asked about ledger ROWS instead would ask about LEGALITY and COVER too, which are
    // about the argument rather than about a piece and have no answer in this vocabulary.
    const task = taskById("indented") as DrillTask;
    const questions = pieceQuestions(runTask(task) as NonNullable<ReturnType<typeof runTask>>);
    const { host } = harness(drillState("indented", 2));
    const selects = [...host.querySelectorAll<HTMLSelectElement>("select")];
    expect(selects).toHaveLength(questions.length);
    expect(selects.map((s) => s.getAttribute("aria-label"))).toEqual(
      questions.map((k) => `what ${k.name.split("$").join("")} is for`),
    );
  });

  it("does NOT give a constant answer full marks — 5 of 10 across the four tasks", () => {
    // **M7.3's own measurement, asserted.** The drill asks what each piece is FOR precisely because
    // every ledger row on these four tasks is satisfied, so any question about the ROW is free
    // marks. The disposal question is not: target ×5, vanishes ×4, a known limit ×1. If a future
    // change made every piece a `target`, this is the test that notices.
    let correct = 0;
    let asked = 0;
    for (const task of DRILL_TASKS) {
      const { host, session, draw, actions } = harness(drillState(task.id, 2));
      const selects = [...host.querySelectorAll<HTMLSelectElement>("select")];
      for (const s of selects) {
        s.value = "target";
        s.dispatchEvent(new Event("change", { bubbles: true }));
      }
      clickExact(host, "Check");
      // The click asked for a re-render rather than silently mutating the session: without this the
      // reader presses Check and the page does not move.
      expect(actions.calls, `${task.id} asked for no redraw`).toContain("redraw");
      // **And NOT through the notice channel**, which renders under an honest-labelling badge: a
      // grading is not a certificate about anything, and `=` beside "you got them right" spends the
      // engine's vocabulary on the reader's answers.
      expect(actions.calls.filter((c) => c.startsWith("notify:")), `${task.id} announced a level`).toHaveLength(0);
      expect(session.drillGraded).toBe(true);
      draw();
      asked += selects.length;
      correct += tagsSaying(host, "correct");
      expect(tagsSaying(host, "correct") + tagsSaying(host, "wrong")).toBe(selects.length);
    }
    expect(asked).toBe(10);
    expect(correct).toBe(5);
  });

  it("answers a WRONG pick with the ledger's own row, and only there", () => {
    // The card never writes a sentence about why a piece does what it does. A wrong answer is
    // answered by the row the ledger already wrote; a right one is not lectured at.
    const { host, draw } = harness(drillState("oscillatory", 2));
    const selects = [...host.querySelectorAll<HTMLSelectElement>("select")];
    const questions = pieceQuestions(runTask(taskById("oscillatory") as DrillTask) as NonNullable<ReturnType<typeof runTask>>);
    selects[0].value = questions[0].answer;
    selects[0].dispatchEvent(new Event("change", { bubbles: true }));
    selects[1].value = "target"; // the arc "is the target" — a real misreading, not a typo
    selects[1].dispatchEvent(new Event("change", { bubbles: true }));
    clickExact(host, "Check");
    draw();
    const claims = [...host.querySelectorAll("[data-feedback]")];
    expect(claims, "one row of feedback, for the one wrong answer").toHaveLength(1);
    const clone = claims[0].cloneNode(true) as HTMLElement;
    for (const m of clone.querySelectorAll(".katex-mathml")) m.remove();
    // **In the LEDGER's words, derived from the row rather than transcribed here** — both halves of
    // the row: its prose, and the LaTeX it chose. (The LaTeX is read from the UNstripped node, where
    // KaTeX's MathML annotation carries the source; a card that printed its own plausible sentence
    // about Jordan's bound fails on both.)
    const [prose, formula] = questions[1].row.claim.split("$");
    expect(prose.trim().length, "the row has no prose to match on").toBeGreaterThan(0);
    expect(clone.textContent ?? "").toContain(prose.trim());
    expect(claims[0].textContent ?? "").toContain(formula);
  });

  it("locks the sheet once graded, and `Try again` unlocks it and clears the grading", () => {
    // **The grading may not outlive its rung** (M7.4). `Try again` is the one place inside a rung
    // where it is dropped, and a card that cleared the answers but left `session.drillGraded` true
    // would show every question marked wrong with no way back.
    const { host, session, draw } = harness(drillState("rational", 2));
    const selects = [...host.querySelectorAll<HTMLSelectElement>("select")];
    for (const s of selects) {
      s.value = "target";
      s.dispatchEvent(new Event("change", { bubbles: true }));
    }
    clickExact(host, "Check");
    draw();
    expect([...host.querySelectorAll<HTMLSelectElement>("select")].every((s) => s.disabled)).toBe(true);
    clickExact(host, "Try again");
    expect(session.drillGraded).toBe(false);
    draw();
    const after = [...host.querySelectorAll<HTMLSelectElement>("select")];
    expect(after.every((s) => !s.disabled)).toBe(true);
    expect(after.every((s) => s.value === "")).toBe(true);
    expect(host.querySelector(".tag.warn"), "no marks survive the reset").toBeNull();
  });

  it("keeps the answer sheet where the DOOR can clear it — `resetTransient`, not a local", () => {
    // **M7.4's defect, in the shape this file could reintroduce it.** The sheet is
    // `session.drillAnswers`, so `applyState` clears it by construction; a copy kept in this module
    // would survive every rung change, and a reader opening a second task would find it pre-filled
    // with the first one's answers. The test is therefore in two halves: the card must WRITE to the
    // session (otherwise `resetTransient` has nothing to clear), and it must READ from it
    // (otherwise clearing the session changes nothing on screen).
    const session = defaultSession();
    const actions = spyActions();
    const host = document.createElement("div");
    const draw = (state: ShellState): void => {
      const desc = drillPanel(contextOf(state, session, actions));
      patch(host, desc === null ? [] : [desc]);
    };
    draw(drillState("rational", 2));
    for (const s of host.querySelectorAll<HTMLSelectElement>("select")) {
      s.value = "vanishes";
      s.dispatchEvent(new Event("change", { bubbles: true }));
    }
    expect(Object.values(session.drillAnswers), "the sheet never reached the session").toContain("vanishes");
    // **Shown BEFORE it is cleared, or the clearing proves nothing.** Without this the last
    // assertion passes on a card that never rendered the sheet at all — a test satisfied by the
    // feature's absence. (Measured: a first draft omitted it and a leak mutant survived because
    // nothing had made the leaked value visible in the first place.)
    draw(drillState("rational", 2));
    expect([...host.querySelectorAll<HTMLSelectElement>("select")].every((s) => s.value === "vanishes")).toBe(true);
    // The door, as `applyStateNow` calls it.
    resetTransient(session);
    draw(drillState("indented", 2));
    expect([...host.querySelectorAll<HTMLSelectElement>("select")].every((s) => s.value === "")).toBe(true);
    // And rung iv's last check goes the same way — a verdict about a contour the reader has left.
    draw(drillState("oscillatory", 4));
    clickExact(host, "Check the enclosure");
    expect(session.drillDrawn, "the check never reached the session").not.toBeNull();
    draw(drillState("oscillatory", 4));
    expect(host.querySelector(".tag.warn"), "the check was never shown").not.toBeNull();
    resetTransient(session);
    draw(drillState("oscillatory", 4));
    expect(host.querySelector(".tag.warn"), "a stale verdict survived the door").toBeNull();
  });

  it("clears the rung when every piece is right, and not when one is wrong", () => {
    // The fade is the drill's only persistent state, and it may never be earned by a wrong answer.
    window.localStorage.clear();
    const wrong = harness(drillState("indented", 2));
    for (const s of wrong.host.querySelectorAll<HTMLSelectElement>("select")) {
      s.value = "target";
      s.dispatchEvent(new Event("change", { bubbles: true }));
    }
    clickExact(wrong.host, "Check");
    expect(readProgress(window.localStorage).indented ?? 0).toBeLessThan(2);

    const right = harness(drillState("indented", 2));
    const questions = pieceQuestions(runTask(taskById("indented") as DrillTask) as NonNullable<ReturnType<typeof runTask>>);
    [...right.host.querySelectorAll<HTMLSelectElement>("select")].forEach((s, i) => {
      s.value = questions[i].answer;
      s.dispatchEvent(new Event("change", { bubbles: true }));
    });
    clickExact(right.host, "Check");
    expect(readProgress(window.localStorage).indented).toBe(2);
    window.localStorage.removeItem(PROGRESS_KEY);
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Rung iii.
// ──────────────────────────────────────────────────────────────────────────────────────────────

describe("rung iii — the menu", () => {
  it("offers only templates whose every role the ledger ESTABLISHES", () => {
    // **The rule is load-bearing, and this is the measurement that says so:** the wedge is not in the
    // menu, and the wedge ANSWERS the rational task — it closes with a target on it, because it
    // carries a `reproduces` piece and the ledger takes that role on faith (nothing checks
    // `f(ωz) = μ f(z)`). A menu built from "whatever closes" would mark that false friend correct.
    const task = taskById("rational") as DrillTask;
    const run = runTask(task) as NonNullable<ReturnType<typeof runTask>>;
    expect(menuVerdict(run, "wedge").answers, "the wedge no longer answers — the rule needs re-measuring").toBe(true);
    expect(VERIFIED_ROLE_TEMPLATES).not.toContain("wedge");

    const { host } = harness(drillState("rational", 3));
    const offered = [...host.querySelectorAll('[aria-label^="close over"]')].map((b) => (b.textContent ?? "").trim());
    expect(offered.length).toBeGreaterThan(0);
    expect(offered).not.toContain("wedge (2π/3)");
    // Every offered option is one of the verified set, by its own label.
    const verifiedLabels = new Set(
      VERIFIED_ROLE_TEMPLATES.map((id) => id as string),
    );
    for (const label of offered) {
      const match = ["circle", "semicircle ↑", "semicircle ↓", "indented semicircle", "rectangle", "square (N+½)"];
      expect(match, `'${label}' is not a verified-role template`).toContain(label);
    }
    expect(verifiedLabels.size).toBeGreaterThan(0);
  });

  it("judges a pick by the LEDGER, and the same template is right in one task and wrong in another", () => {
    // The pair differs by the kernel and by nothing else, which is what makes it evidence that the
    // card reads `menuVerdict` rather than comparing the pick against `task.intended`: at `a = 0`
    // the lower semicircle answers, and with `e^{iz}` over it the same contour diverges.
    const good = harness(drillState("rational", 3));
    clickExact(good.host, "semicircle ↓");
    const applied = last(good.actions.applied);
    expect(applied.contourSource?.template).toBe("semicircleDown");
    expect(applied.drill).toEqual({ task: "rational", stage: 3 });

    // Render the picked state: the verdict is the ledger's.
    const after = harness(applied);
    expect(after.host.textContent ?? "").toContain("the target is a piece of it");
    // **The MARK and the sentence must be the same verdict** — a sweep survivor, and the E2 defect
    // in miniature: a card that always marked a pick `answers` still prints the ledger's refusal
    // underneath, so the two disagree and the mark is the half a reader reads first.
    expect(q(after.host, ".verdict .tag").textContent).toBe("answers");
    expect(after.host.querySelector(".verdict .tag.warn")).toBeNull();
    expect(after.host.textContent ?? "", "a declared second answer is named as one").toContain("nothing to force the half-plane");

    const bad = harness(drillState("oscillatory", 3));
    clickExact(bad.host, "semicircle ↓");
    const wrongPick = harness(last(bad.actions.applied));
    const clone = wrongPick.host.cloneNode(true) as HTMLElement;
    for (const m of clone.querySelectorAll(".katex-mathml")) m.remove();
    expect(clone.textContent ?? "").toContain("diverges");
    expect(clone.textContent ?? "").toContain("KILL");
    expect(q(wrongPick.host, ".verdict .tag").textContent).toBe("does not answer");
    expect(q(wrongPick.host, ".verdict .tag").classList.contains("warn")).toBe(true);
  });

  it("says COVER's refusal for the circle, which CLOSES", () => {
    // The one option that fails for a different reason from all the others. "It does not close" would
    // be false about it, and would teach the wrong lesson about the one case worth the rung.
    const { host, actions } = harness(drillState("oscillatory", 3));
    clickExact(host, "circle");
    const after = harness(last(actions.applied));
    expect(after.host.textContent ?? "").toContain("no piece of this contour is the target");
  });

  it("clears the rung on a pick that ANSWERS, and not on one that does not", () => {
    window.localStorage.clear();
    const bad = harness(drillState("oscillatory", 3));
    clickExact(bad.host, "circle");
    expect(readProgress(window.localStorage).oscillatory ?? 0).toBeLessThan(3);
    clickExact(bad.host, "semicircle ↑");
    expect(readProgress(window.localStorage).oscillatory).toBe(3);
    window.localStorage.removeItem(PROGRESS_KEY);
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Rung iv.
// ──────────────────────────────────────────────────────────────────────────────────────────────

describe("rung iv — the enclosure", () => {
  /** The rung-iv state with a contour of the caller's choosing, as a drawing would leave it. */
  const drawn = (task: string, contour: ShellState["contour"]): ShellState => ({
    ...drillState(task, 4),
    contour,
    sandboxContour: contour,
  });

  it("refuses a loop of the wrong SIGN", () => {
    // **The sign is the argument.** A contour that encloses the right pole the wrong way round gives
    // `−2πi·Res`, and a check that compared only WHICH singularities are enclosed would pass it —
    // which is the misreading the rung exists to catch, since the picture looks identical.
    const state = drawn("oscillatory", reverseContour(semicircleTemplate(3, "upper")));
    const { host, draw, actions } = harness(state);
    clickExact(host, "Check the enclosure");
    expect(actions.calls).toContain("redraw");
    draw();
    const shown = host.textContent ?? "";
    expect(shown).toContain("winds -1 times");
    expect(shown).toContain("needs 1");
    expect(host.querySelector(".tag.warn"), "refused, and marked as refused").not.toBeNull();

    // The same curve the right way round is accepted — so the refusal above is about the sign and
    // not about the shape.
    const ok = harness(drawn("oscillatory", semicircleTemplate(3, "upper")));
    clickExact(ok.host, "Check the enclosure");
    ok.draw();
    expect(ok.host.textContent ?? "").toContain("Exactly that");
  });

  it("refuses a contour that encloses BOTH poles where the task wants one", () => {
    // `one-pole`, and the default circle is exactly the drawing a reader makes first. The residues
    // cancel there, so the number that comes back is plausible and is not the target's.
    const { host, draw } = harness(drillState("rational", 4));
    clickExact(host, "Check the enclosure");
    draw();
    expect(host.textContent ?? "").toContain("2 singularities are enclosed");
  });

  it("offers NO check where there is nothing to check, and says why", () => {
    // C1 encloses nothing at all — its whole value comes from the indentation's limit — so "wind
    // about no pole" would be a mark for any loop that misses the origin. A check that always passed
    // is worse than none, and this asserts the button is absent rather than merely inert.
    const { host } = harness(drillState("indented", 4));
    expect(buttons(host).map((b) => b.textContent)).not.toContain("Check the enclosure");
    const clone = host.cloneNode(true) as HTMLElement;
    for (const m of clone.querySelectorAll(".katex-mathml")) m.remove();
    expect(clone.textContent ?? "").toContain("nothing here to check about the enclosure");
  });

  it("clears the rung only on a check that passes", () => {
    window.localStorage.clear();
    const bad = harness(drillState("oscillatory", 4));
    clickExact(bad.host, "Check the enclosure");
    expect(readProgress(window.localStorage).oscillatory ?? 0).toBeLessThan(4);
    const good = harness(drawn("oscillatory", semicircleTemplate(3, "upper")));
    clickExact(good.host, "Check the enclosure");
    expect(readProgress(window.localStorage).oscillatory).toBe(4);
    window.localStorage.removeItem(PROGRESS_KEY);
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Moving between rungs.
// ──────────────────────────────────────────────────────────────────────────────────────────────

describe("moving between rungs", () => {
  it("asks for the NEXT rung's state, by its exact stage", () => {
    // A rung is a `ShellState`, which is M7's gate clause 2 (every rung is a permalink) and the
    // reason the card owns no navigation of its own. Asserting the stage rather than that
    // `applyState` was called at all is the difference between this and a test a no-op would pass.
    for (const [from, to] of [[1, 2], [2, 3], [3, 4], [4, 1]] as const) {
      const { host, actions } = harness(drillState("oscillatory", from));
      clickExact(host, from === 4 ? "Start again" : "Next rung");
      const next = last(actions.applied);
      expect(next.drill, `rung ${from} moved somewhere else`).toEqual({ task: "oscillatory", stage: to });
    }
  });

  it("opens rung iv in the SANDBOX on the record's own integrand", () => {
    // The pen lives in the sandbox, and the twin is verified against the record's compiled `f` by
    // `drill.test.ts` — so the state the card asks for is the one that puts a pen under the right
    // integrand rather than merely a blank plane.
    const { host, actions } = harness(drillState("oscillatory", 3));
    clickExact(host, "Next rung");
    const next = last(actions.applied);
    expect(next.mode).toBe("sandbox");
    expect(next.expr).toBe("exp(i*z)/(z^2 + 1)");
  });

  it("clears rung i by LEAVING it, because reading the worked argument is its task", () => {
    window.localStorage.clear();
    const { host } = harness(drillState("rational", 1));
    clickExact(host, "Next rung");
    expect(readProgress(window.localStorage).rational).toBe(1);
    // And no other rung is cleared merely by moving off it.
    const two = harness(drillState("rational", 2));
    clickExact(two.host, "Next rung");
    expect(readProgress(window.localStorage).rational).toBe(1);
    window.localStorage.removeItem(PROGRESS_KEY);
  });

  it("leaves the drill through the mode, not through a second exit of its own", () => {
    // `setMode("explore")` clears `drill`, which unmasks everything by the one decision in
    // `drillMask`. An exit that wrote its own field would be a second place for the mask to be
    // wrong — and `shellMode` derives the mode from `drill`, so two writers cannot agree for long.
    const { host, actions } = harness(drillState("oscillatory", 2));
    clickExact(host, "Leave the drill");
    expect(actions.calls).toContain("mode:explore");
    expect(actions.applied, "leaving is not an applyState").toHaveLength(0);
  });
});
