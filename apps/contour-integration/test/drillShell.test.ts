// @vitest-environment jsdom
// The drill AT THE SHELL — the masks, the grading and the fade, in the app.
//
// `drill.test.ts` pins the model (what a rung asks, what the ledger says about a pick, what a
// drawing has to enclose) and that every rung is a permalink. What only the shell can show is the
// MASK: that rung ii really does take the KILL rows off the ledger, that rung iii takes the whole
// argument *and the contour* off the screen, and that both come back. A mask that silently masked
// nothing would leave every model test green.
import { describe, expect, it, beforeEach } from "vitest";
import { mountApp, type ShellHandle } from "../src/shell/app.js";
import { DRILL_TASKS, runTask, pieceQuestions } from "../src/shell/drill.js";
import { PROGRESS_KEY, readProgress } from "../src/shell/drillProgress.js";
import { DRILL_STAGES, taskById, taskState } from "../src/shell/drill.js";
import { encodeShell } from "../src/shell/viewState.js";

const setup = (): { root: HTMLElement; app: ShellHandle } => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  if (!("setPointerCapture" in Element.prototype)) {
    (Element.prototype as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = () => {};
    (Element.prototype as unknown as { releasePointerCapture: (id: number) => void }).releasePointerCapture = () => {};
  }
  window.localStorage.clear();
  window.history.replaceState(null, "", window.location.pathname);
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  return { root, app: mountApp(root) };
};

const q = <T extends HTMLElement = HTMLElement>(root: Element, sel: string): T => {
  const e = root.querySelector<T>(sel);
  if (e === null) throw new Error(`no ${sel}`);
  return e;
};
const byLabel = <T extends HTMLElement = HTMLElement>(root: Element, label: string): T =>
  q<T>(root, `[aria-label="${label}"]`);
const text = (e: Element | null): string => (e?.textContent ?? "").replace(/\s+/g, " ");
/** The button in `host` whose label contains `needle`. */
const clickIn = (host: Element, needle: string): void => {
  const b = [...host.querySelectorAll("button")].find((x) => (x.textContent ?? "").includes(needle));
  if (b === undefined) throw new Error(`no button matching '${needle}' in ${host.className}`);
  b.click();
};
/**
 * The button whose label IS `label`.
 *
 * Needed because "circle" is a substring of "semicircle ↑", and the substring clicker silently
 * picked the semicircle — which then reported that the argument closes with the target on it, and
 * read as the model disagreeing with itself.
 */
const clickExact = (host: Element, label: string): void => {
  const b = [...host.querySelectorAll("button")].find((x) => (x.textContent ?? "").trim() === label);
  if (b === undefined) throw new Error(`no button labelled exactly '${label}'`);
  b.click();
};
/** Open the drill at a task's offered rung. */
const openTask = (root: Element, label: string): void => {
  byLabel<HTMLButtonElement>(root, "practise choosing a contour, with less given each time").click();
  clickIn(q(root, ".drillPanel"), label);
};

beforeEach(() => {
  window.localStorage.clear();
});

describe("the drill's own surface", () => {
  it("offers the four tasks, each at the rung it has reached", () => {
    const { root } = setup();
    byLabel<HTMLButtonElement>(root, "practise choosing a contour, with less given each time").click();
    const panel = q(root, ".drillPanel");
    expect(panel.hidden).toBe(false);
    const items = [...panel.querySelectorAll(".drillTasks li")];
    expect(items).toHaveLength(DRILL_TASKS.length);
    // Nothing cleared yet, so every task opens at rung 1 — the worked example.
    for (const li of items) expect(text(li)).toContain("rung 1 of 4");
  });

  it("opens a task on its RECORD, with the drill card above everything", () => {
    const { root, app } = setup();
    openTask(root, "∫ cos x/(x²+1) dx");
    const state = app.currentState();
    expect(state.drill).toEqual({ task: "oscillatory", stage: 1 });
    expect(state.mode).toBe("gallery");
    expect(state.record).toBe("jordan-cosine-kernel");
    const card = q(root, ".drillCard");
    expect(card.hidden).toBe(false);
    expect(text(card)).toContain("rung 1 of 4");
    // Rung i masks nothing: this is the app as it otherwise is.
    expect(text(q(root, ".rail"))).toContain("the real segment");
    expect(q(root, ".ledger")).not.toBeNull();
  });
});

describe("rung ii — the KILL column is MASKED, and comes back", () => {
  const toRungTwo = (root: Element): void => {
    openTask(root, "∫ cos x/(x²+1) dx");
    clickIn(q(root, ".drillCard"), "Next rung");
  };

  it("takes the KILL rows off the ledger and hides the derivation", () => {
    const { root, app } = setup();
    const before = [...q(root, ".rail").querySelectorAll(".ledgerRow")].length;
    toRungTwo(root);
    expect(app.currentState().drill).toEqual({ task: "oscillatory", stage: 2 });
    const rows = [...root.querySelectorAll(".ledgerRow")];
    // The KILL rows are gone and the others are not: a mask, not a blank.
    expect(rows.length).toBeLessThan(before);
    expect(rows.map((r) => text(r.querySelector(".constraint")))).not.toContain("KILL");
    expect(rows.map((r) => text(r.querySelector(".constraint")))).toContain("LEGALITY");
    expect(q(root, ".card + .card")).toBeTruthy();
    // The derivation says which lemma kills which piece, so masking one and not the other would be
    // masking nothing.
    const derivation = [...root.querySelectorAll("section.card")].find((c) => text(c).includes("Derivation"));
    expect(derivation === undefined || (derivation as HTMLElement).hidden).toBe(true);
  });

  it("asks one question per piece, and grades it against the LEDGER's row", () => {
    const { root } = setup();
    toRungTwo(root);
    const task = DRILL_TASKS.find((t) => t.id === "oscillatory");
    const run = task === undefined ? null : runTask(task);
    if (run === null) throw new Error("no run");
    const questions = pieceQuestions(run);
    const picks = [...root.querySelectorAll<HTMLSelectElement>(".drillPick")];
    expect(picks).toHaveLength(questions.length);

    // Answer them all correctly.
    picks.forEach((pick, i) => {
      pick.value = questions[i].answer;
      pick.dispatchEvent(new Event("change", { bubbles: true }));
    });
    clickIn(q(root, ".drillCard"), "Check");
    expect(text(q(root, ".drillCard"))).toContain("Every piece");
    // And the ledger is the answer sheet now: the KILL rows are back.
    expect([...root.querySelectorAll(".ledgerRow")].map((r) => text(r.querySelector(".constraint")))).toContain("KILL");
    // Cleared, which is what fades the support next time.
    expect(readProgress(window.localStorage).oscillatory).toBe(2);
  });

  it("marks a wrong answer with the ledger's own claim, and does not clear the rung", () => {
    const { root } = setup();
    toRungTwo(root);
    const picks = [...root.querySelectorAll<HTMLSelectElement>(".drillPick")];
    // Every question answered, exactly ONE of them wrongly — the arc "is the target", which is a
    // real misreading rather than a typo. (Leaving the other blank would make it wrong too, and the
    // first `.drillWhy` would then be about the piece the test was not asking about.)
    const answer = (i: number, v: string): void => {
      picks[i].value = v;
      picks[i].dispatchEvent(new Event("change", { bubbles: true }));
    };
    answer(0, "target");
    answer(1, "target");
    clickIn(q(root, ".drillCard"), "Check");
    const card = q(root, ".drillCard");
    expect(text(card)).toContain("Not every piece");
    // Exactly one row of feedback, and it is the LEDGER'S: Jordan's bound, in the row's own words.
    expect(root.querySelectorAll(".drillWhy")).toHaveLength(1);
    expect(text(q(root, ".drillWhy"))).toContain("π/|a|");
    // Rung 1 was cleared on the way here (reading it IS that rung's task); rung 2 was not.
    expect(readProgress(window.localStorage).oscillatory).toBe(1);
    // Try again puts the sheet back.
    clickIn(card, "Try again");
    expect(root.querySelector(".drillWhy")).toBeNull();
    expect([...root.querySelectorAll<HTMLSelectElement>(".drillPick")].every((p) => p.value === "")).toBe(true);
  });
});

describe("rung iii — the contour is masked too", () => {
  const toRungThree = (root: Element): void => {
    openTask(root, "∫ cos x/(x²+1) dx");
    clickIn(q(root, ".drillCard"), "Next rung");
    clickIn(q(root, ".drillCard"), "Next rung");
  };

  it("masks the ledger, the value AND the contour — the record's contour IS the answer", () => {
    const { root, app } = setup();
    toRungThree(root);
    expect(app.currentState().drill).toEqual({ task: "oscillatory", stage: 3 });
    expect(text(q(root, ".rail"))).toContain("Masked");
    expect(root.querySelectorAll(".ledgerRow")).toHaveLength(0);
    // **AND THE VALUE CARD, which a sweep survivor said nothing was checking.** `∮ f dz` for the
    // record is the answer in the most authoritative place on the page; leaving it up while the
    // ledger is masked would give the rung away twice over.
    const result = [...root.querySelectorAll<HTMLElement>("section.card")].find((c) =>
      text(c.querySelector("h2")).includes("∮"),
    );
    expect(result?.hidden, "the value card is masked too").toBe(true);
    // The four options are offered by name.
    const card = q(root, ".drillCard");
    for (const label of ["semicircle ↑", "semicircle ↓", "indented", "circle"]) {
      expect(text(card)).toContain(label);
    }
  });

  it("a WRONG pick fails by the ledger's own reason, and does not clear the rung", () => {
    const { root, app } = setup();
    toRungThree(root);
    clickExact(q(root, ".drillCard"), "semicircle ↓");
    const state = app.currentState();
    // The pick is an ordinary sandbox state on the record's integrand.
    expect(state.mode).toBe("sandbox");
    expect(state.contourSource?.template).toBe("semicircleDown");
    expect(state.drill).toEqual({ task: "oscillatory", stage: 3 });
    expect(text(q(root, ".drillCard"))).toContain("DIVERGES");
    // Not cleared: rung 1's own click is the 1 below, and a wrong pick adds nothing.
    expect(readProgress(window.localStorage).oscillatory).toBe(1);
    // And the ledger is unmasked, because now there is something of the reader's to judge.
    expect([...root.querySelectorAll(".ledgerRow")].length).toBeGreaterThan(0);
    const result = [...root.querySelectorAll<HTMLElement>("section.card")].find((c) =>
      text(c.querySelector("h2")).includes("∮"),
    );
    expect(result?.hidden, "the value card comes back with the ledger").toBe(false);
  });

  it("the RIGHT pick says so and clears the rung", () => {
    const { root } = setup();
    toRungThree(root);
    clickExact(q(root, ".drillCard"), "semicircle ↑");
    expect(text(q(root, ".drillCard"))).toContain("the target is a piece of it");
    expect(readProgress(window.localStorage).oscillatory).toBe(3);
  });

  it("the circle CLOSES and is still refused — COVER, not KILL", () => {
    const { root } = setup();
    toRungThree(root);
    clickExact(q(root, ".drillCard"), "circle");
    expect(text(q(root, ".drillCard"))).toContain("no piece of this contour is the target");
    expect(readProgress(window.localStorage).oscillatory).toBe(1);
  });
});

describe("rung iv — a drawn contour, and what it can be checked against", () => {
  const toRungFour = (root: Element, label = "∫ cos x/(x²+1) dx"): void => {
    openTask(root, label);
    for (let i = 0; i < 3; i++) clickIn(q(root, ".drillCard"), "Next rung");
  };

  it("opens the sandbox on the record's integrand, with the pen available", () => {
    const { root, app } = setup();
    toRungFour(root);
    const state = app.currentState();
    expect(state.drill).toEqual({ task: "oscillatory", stage: 4 });
    expect(state.mode).toBe("sandbox");
    expect(state.expr).toBe("exp(i*z)/(z^2 + 1)");
    expect(root.querySelector('[aria-label="draw a contour by hand"]')).not.toBeNull();
    // The goal, and the limitation — said rather than implied.
    const card = text(q(root, ".drillCard"));
    expect(card).toContain("winds about the singularities exactly as the worked one does");
    expect(card).toContain("fixed curve");
  });

  it("checks the ENCLOSURE against the worked contour's own windings", () => {
    const { root } = setup();
    toRungFour(root);
    // The default circle encloses BOTH poles, which is not what the argument uses.
    clickIn(q(root, ".drillCard"), "Check the enclosure");
    expect(text(q(root, ".drillCard"))).toContain("needs 0");
    expect(readProgress(window.localStorage).oscillatory).not.toBe(4);

    // The upper semicircle is the right enclosure, and the check says so. (Drawing it by hand is
    // `penInk.browser.test.ts`'s business; what is being tested here is the CHECK.)
    const templates = q(root, ".contourCard, .card");
    const picker = [...root.querySelectorAll("button")].find((b) => (b.textContent ?? "") === "semicircle ↑");
    expect(picker, "the sandbox offers the template picker at rung iv").toBeDefined();
    picker?.click();
    clickIn(q(root, ".drillCard"), "Check the enclosure");
    expect(text(q(root, ".drillCard"))).toContain("Exactly that");
    expect(readProgress(window.localStorage).oscillatory).toBe(4);
    expect(templates).toBeTruthy();
  });

  it("says there is NOTHING to check where there is nothing — C1 encloses no pole", () => {
    const { root } = setup();
    toRungFour(root, "∫ sin x/x dx");
    const card = text(q(root, ".drillCard"));
    expect(card).toContain("nothing here to check about the enclosure");
    expect(card).toContain("iα·Res");
    // No check button at all, rather than one that always passes.
    expect([...q(root, ".drillCard").querySelectorAll("button")].map((b) => b.textContent)).not.toContain(
      "Check the enclosure",
    );
  });
});

describe("a rung opened by LINK — M7's gate clause 2, at the shell", () => {
  /** Mount with a hash already in the address bar, which is how a shared rung arrives. */
  const mountWith = (hash: string): { root: HTMLElement; app: ShellHandle } => {
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
    if (!("setPointerCapture" in Element.prototype)) {
      (Element.prototype as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = () => {};
      (Element.prototype as unknown as { releasePointerCapture: (id: number) => void }).releasePointerCapture = () => {};
    }
    window.localStorage.clear();
    window.history.replaceState(null, "", `${window.location.pathname}${hash}`);
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    return { root, app: mountApp(root) };
  };

  it("opens MASKED, which is the half `drill.test.ts` cannot see", () => {
    // The model test round-trips every rung by verdict; what it cannot check is that a link arriving
    // at rung ii lands with the ledger actually masked. The rung travels in the state, and the mask
    // is read off it — but nothing asserted the two meet on the way in.
    const task = taskById("oscillatory");
    if (task === null) throw new Error("no task");
    const enc = encodeShell(taskState(task, 2));
    expect(enc.ok, enc.ok ? "" : enc.reason).toBe(true);
    if (!enc.ok) return;
    const { root, app } = mountWith(enc.hash);
    expect(app.currentState().drill).toEqual({ task: "oscillatory", stage: 2 });
    expect(q(root, ".drillCard").hidden).toBe(false);
    expect(text(q(root, ".drillCard"))).toContain("rung 2 of 4");
    // Masked: the KILL rows are off the ledger and the questions are in the card.
    expect([...root.querySelectorAll(".ledgerRow")].map((r) => text(r.querySelector(".constraint")))).not.toContain(
      "KILL",
    );
    expect(root.querySelectorAll(".drillPick").length).toBeGreaterThan(0);
  });

  it("opens rung iii masked too, and an UNKNOWN rung refuses without opening the drill", () => {
    const task = taskById("indented");
    if (task === null) throw new Error("no task");
    const enc = encodeShell(taskState(task, 3));
    if (!enc.ok) throw new Error(enc.reason);
    const three = mountWith(enc.hash);
    expect(text(q(three.root, ".rail"))).toContain("Masked");

    // A link naming a rung this build does not have: the refusal has its own box, and the drill
    // stays shut rather than opening on nothing with the ledger hidden.
    const payload = { v: 1, app: "ci", state: { dr: ["oscillatory", 9] } };
    const bad = `#vs=${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`;
    const { root, app } = mountWith(bad);
    expect(app.currentState().drill).toBeNull();
    expect(q(root, ".drillCard").hidden).toBe(true);
    expect(text(q(root, ".linkError"))).toContain("rung 9");
  });

  it("every rung of every task opens without an error, which is the roster the gate names", () => {
    for (const t of DRILL_TASKS) {
      for (const stage of DRILL_STAGES) {
        const enc = encodeShell(taskState(t, stage));
        if (!enc.ok) throw new Error(`${t.id}/${stage}: ${enc.reason}`);
        const { root, app } = mountWith(enc.hash);
        expect(app.currentState().drill, `${t.id}/${stage}`).toEqual({ task: t.id, stage });
        expect(q(root, ".linkError").hidden, `${t.id}/${stage} refused its own link`).toBe(true);
      }
    }
  });
});

describe("the fade", () => {
  it("offers the next rung once one is cleared, and survives a remount", () => {
    const { root } = setup();
    openTask(root, "∫ cos x/(x²+1) dx");
    clickIn(q(root, ".drillCard"), "Next rung"); // clears rung 1
    expect(readProgress(window.localStorage).oscillatory).toBe(1);

    // A fresh mount reads the store, and the panel offers rung 2.
    const root2 = document.createElement("div");
    document.body.replaceChildren(root2);
    mountApp(root2);
    byLabel<HTMLButtonElement>(root2, "practise choosing a contour, with less given each time").click();
    const item = [...q(root2, ".drillPanel").querySelectorAll(".drillTasks li")].find((li) =>
      text(li).includes("∫ cos x/(x²+1) dx"),
    );
    expect(text(item ?? null)).toContain("rung 2 of 4");
  });

  it("ignores a GARBAGE store rather than un-fading or throwing", () => {
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
    window.localStorage.clear();
    window.localStorage.setItem(PROGRESS_KEY, "{not json");
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    expect(() => mountApp(root)).not.toThrow();
    byLabel<HTMLButtonElement>(root, "practise choosing a contour, with less given each time").click();
    for (const li of q(root, ".drillPanel").querySelectorAll(".drillTasks li")) {
      expect(text(li)).toContain("rung 1 of 4");
    }
  });

  it("does not carry a GRADING into another rung, however the rung changes", () => {
    // A latent leak the closing review found by reading rather than by failing: the derivation is
    // unmasked once rung ii has been checked (it is then the answer sheet), and `drillGraded` is a
    // shell local that `applyState` did not clear — so a state restored while graded would show the
    // whole derivation at rung iii, where the argument is exactly what is being masked. `enterDrill`
    // happened to clear it; a link and a contrast cell did not.
    const { root, app } = setup();
    openTask(root, "∫ cos x/(x²+1) dx");
    clickIn(q(root, ".drillCard"), "Next rung");
    for (const pick of [...root.querySelectorAll<HTMLSelectElement>(".drillPick")]) {
      pick.value = "target";
      pick.dispatchEvent(new Event("change", { bubbles: true }));
    }
    clickIn(q(root, ".drillCard"), "Check");
    expect(text(q(root, ".drillCard"))).toContain("Not every piece");

    // Straight to rung iii by restoring the state, as a link does.
    const task = taskById("oscillatory");
    if (task === null) throw new Error("no task");
    app.applyState(taskState(task, 3));
    expect(text(q(root, ".rail"))).toContain("Masked");
    const derivation = [...root.querySelectorAll<HTMLElement>("section.card")].find((c) =>
      text(c).includes("Derivation"),
    );
    expect(derivation === undefined || derivation.hidden, "the derivation must stay masked").toBe(true);
    // And the answer sheet is gone rather than half-filled.
    expect(root.querySelector(".drillWhy")).toBeNull();
  });

  it("LEAVES the drill on request, unmasking everything", () => {
    const { root, app } = setup();
    openTask(root, "∫ cos x/(x²+1) dx");
    clickIn(q(root, ".drillCard"), "Next rung");
    expect(root.querySelectorAll(".ledgerRow").length).toBeGreaterThan(0);
    clickIn(q(root, ".drillCard"), "Leave the drill");
    expect(app.currentState().drill).toBeNull();
    expect(q(root, ".drillCard").hidden).toBe(true);
    // Every row is back, KILL included.
    expect([...root.querySelectorAll(".ledgerRow")].map((r) => text(r.querySelector(".constraint")))).toContain("KILL");
  });
});
