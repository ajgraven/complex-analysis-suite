// The Ladder card (PLAN §7 PRA-8): Arnold's proof as four rungs. Each rung is a polynomial whose roots
// the reader moves by WORDS — nested commutators of root motions — and a radical formula followed along
// the word: each radical closes or not (measured), the theorem says which must, and the verdict says
// whether the word rules the formula out. The identities and the derived series beside it are composed
// and enumerated by the permutation engine, never quoted.
import { h, type Child, type Desc } from "@cas/ui";
import type { Perm } from "@cas/monodromy";
import {
  derivedCert,
  identityCert,
  ladderVerdict,
  radicalCert,
  radicalTheoremCert,
} from "../engine/certify.js";
import {
  identities,
  rung,
  symmetricDerived,
  type RungDegree,
} from "../engine/ladder/rungs.js";
import type { LadderResult } from "../engine/ladder/run.js";
import { permText, wordDepth, wordPerm, wordText } from "../engine/ladder/word.js";
import { readFormula } from "../engine/formula/tree.js";
import { LADDER } from "../engine/vocabulary.js";
import { level } from "./level.js";
import type { LadderState } from "./state.js";

export interface LadderModel {
  readonly state: LadderState | null;
  readonly result: LadderResult | null;
  /** The formula box's text when it did not read, and why. */
  readonly text: string | null;
  readonly refusal: string | null;
  /**
   * What the drill is hiding (PRA-10): 1 hides the words, every run, the identities and the derived
   * series; 2 also the formula's depth and the rung's explanation. Absent or 0 hides nothing.
   */
  readonly mask?: 0 | 1 | 2;
}

export interface LadderHandlers {
  readonly onRung: (d: RungDegree) => void;
  readonly onFormula: (text: string) => void;
  readonly onWord: (id: string) => void;
  readonly onLeave: () => void;
}

const DEGREES: readonly RungDegree[] = [2, 3, 4, 5];
const SYM = ["", "S₁", "S₂", "S₃", "S₄", "S₅"];

/** The derived series drawn as the group's elements, those in each level lit (non-interactive). */
function derivedPicture(n: number): Desc {
  const d = symmetricDerived(n);
  const all = d.levels[0];
  const key = (p: Perm): string => p.join(",");
  const cert = derivedCert(d.orders);
  return h(
    "div",
    { key: "derived", class: "derived" },
    h("h3", { key: "h" }, LADDER.derived),
    h(
      "p",
      { key: "orders", class: "claim" },
      level(cert, "lv"),
      `${SYM[n]}: ${d.orders.join(" → ")}.`,
    ),
    ...d.levels.map((lv, i) => {
      const inLevel = new Set(lv.map(key));
      return h(
        "div",
        { key: `l${i}`, class: "derived-level" },
        h("span", { key: "t", class: "derived-label" }, `${lv.length}`),
        h(
          "span",
          { key: "g", class: "derived-grid", "aria-hidden": "true" },
          ...all.map((p, j) =>
            h("span", { key: `e${j}`, class: inLevel.has(key(p)) ? "el lit" : "el" }),
          ),
        ),
      );
    }),
    h(
      "p",
      { key: "why", class: "legend" },
      d.solvable ? LADDER.derivedEnds : LADDER.derivedStall,
    ),
  );
}

export function ladderCard(m: LadderModel, on: LadderHandlers): Desc {
  const st = m.state;
  const rows: Child[] = [
    h("p", { key: "what", class: "legend" }, LADDER.what),
    h(
      "ul",
      { key: "rungs", class: "preset-chips", "aria-label": LADDER.rungs },
      ...DEGREES.map((d) =>
        h(
          "li",
          { key: `r${d}` },
          h(
            "button",
            {
              key: "b",
              type: "button",
              class: "chip",
              "aria-pressed": st?.rung === d ? "true" : "false",
              onclick: () => on.onRung(d),
            },
            rung(d).name,
          ),
        ),
      ),
    ),
  ];
  if (!st) return card(...rows);

  const rg = rung(st.rung);
  const read = readFormula(st.formula, st.rung);
  const mask = m.mask ?? 0;
  rows.push(
    mask >= 2 ? null : h("p", { key: "rungWhy", class: "summary" }, LADDER.rung[st.rung]),
    h("h3", { key: "fh" }, LADDER.formula),
    // The gallery's labels name each formula's depth ("three levels"), so the drill's last stage hides it.
    mask >= 2
      ? null
      : h(
          "label",
          { key: "gal", class: "field" },
          h("span", { key: "c" }, "Gallery"),
          h(
            "select",
            {
              key: "s",
              onchange: (e: Event) => on.onFormula((e.target as HTMLSelectElement).value),
            },
            ...rg.formulas.map((f) =>
              h(
                "option",
                { key: f.id, value: f.text, selected: f.text === st.formula },
                f.label,
              ),
            ),
            rg.formulas.some((f) => f.text === st.formula)
              ? null
              : h(
                  "option",
                  { key: "own", value: st.formula, selected: true },
                  "your own",
                ),
          ),
        ),
    h(
      "label",
      { key: "box", class: "field" },
      h("span", { key: "c" }, LADDER.formulaBox),
      h("input", {
        key: "in",
        type: "text",
        class: "formula-input",
        value: m.text ?? st.formula,
        spellcheck: "false",
        autocomplete: "off",
        onChange: (e: Event) => on.onFormula((e.target as HTMLInputElement).value),
      }),
    ),
    h("p", { key: "hint", class: "legend" }, LADDER.formulaHint),
    m.refusal
      ? h(
          "p",
          { key: "refuse", class: "refusal", role: "alert" },
          `Not read: ${m.refusal}.`,
        )
      : null,
    read.ok && mask < 2
      ? h("p", { key: "levels", class: "summary" }, LADDER.levels(read.formula.depth))
      : null,
  );
  if (mask >= 1) {
    rows.push(h("p", { key: "masked", class: "legend" }, LADDER.masked));
    return card(...rows);
  }
  rows.push(
    h("h3", { key: "wh" }, LADDER.words),
    h(
      "ul",
      { key: "words", class: "words", "aria-label": LADDER.wordsLabel },
      ...rg.words.map((w) => {
        const text = LADDER.wordButton(
          wordDepth(w.word),
          wordText(w.word),
          permText(wordPerm(w.word)),
        );
        return h(
          "li",
          { key: w.id },
          h(
            "button",
            {
              key: "b",
              type: "button",
              class: "word",
              "aria-pressed": st.word === w.id ? "true" : "false",
              "aria-label": `Run the word of depth ${wordDepth(w.word)}, whose permutation is ${permText(wordPerm(w.word))}`,
              onclick: () => on.onWord(w.id),
            },
            text.length > 90
              ? `${text.slice(0, 60)}… = ${permText(wordPerm(w.word))}`
              : text,
          ),
        );
      }),
    ),
  );

  const res = m.result;
  if (res && !res.ok)
    rows.push(
      h("p", { key: "rref", class: "refusal", role: "alert" }, `Not run: ${res.reason}.`),
    );
  if (res?.ok) {
    const r = res.run;
    const pt = permText(r.composed);
    const verdict = ladderVerdict(r, pt);
    rows.push(
      h(
        "p",
        { key: "perm", class: "claim" },
        level(identityCert(pt), "lv"),
        `The roots undergo ${pt}.`,
      ),
    );
    if (r.evaluation.ok) {
      const ev = r.evaluation;
      rows.push(
        h("h3", { key: "rh" }, LADDER.radicals),
        h(
          "ul",
          { key: "rads", class: "radicals" },
          ...ev.radicals.map((o, i) => {
            const c = radicalCert(o, ev.samples, ev.halvings);
            const th = radicalTheoremCert(o.radical.level, r.depth);
            return h(
              "li",
              { key: `r${i}`, class: o.closes ? "closes" : "fails" },
              h(
                "span",
                { key: "t", class: "radical" },
                `level ${o.radical.level}: ${o.radical.text}`,
              ),
              h("span", { key: "m", class: "measured" }, level(c, "lv"), ` ${c.claim}`),
              th
                ? h(
                    "span",
                    { key: "th", class: "theorem" },
                    level(th, "lv"),
                    ` must: ${th.claim}`,
                  )
                : null,
            );
          }),
        ),
      );
    }
    rows.push(
      h(
        "p",
        { key: "verdict", class: "claim verdict" },
        level(verdict, "lv"),
        verdict.level === "⚠" ? `No verdict: ${verdict.method}.` : `${verdict.claim}.`,
      ),
    );
  }

  const ids = identities(st.rung);
  if (ids.length)
    rows.push(
      h("h3", { key: "ih" }, LADDER.identities),
      h(
        "ul",
        { key: "ids", class: "identities" },
        ...ids.map((x, i) => {
          const text = `[${permText(x.a)}, ${permText(x.b)}] = ${permText(x.result)}`;
          return h("li", { key: `i${i}` }, level(identityCert(text), "lv"), ` ${text}`);
        }),
      ),
    );
  rows.push(derivedPicture(st.rung));
  rows.push(
    h(
      "div",
      { key: "tools", class: "toolbar" },
      h("button", { key: "leave", type: "button", onclick: on.onLeave }, LADDER.leave),
    ),
  );
  return card(...rows);
}

function card(...body: Child[]): Desc {
  return h(
    "section",
    { key: "ladder", class: "card", "aria-labelledby": "card-ladder" },
    h("h2", { key: "t", id: "card-ladder" }, LADDER.heading),
    ...body,
  );
}
