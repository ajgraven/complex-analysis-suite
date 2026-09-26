// The Tour card (PLAN §7 PRA-10): one step of Arnold's proof at a time, over the state that step opens.
// The prose is the lecture's (vocabulary `TOUR`); what the state shows is certificates (tour.ts
// `claims`), hidden behind a prediction where the step asks one and graded from the same run — so the
// card can neither tell the reader something the computation did not show nor mark a right answer
// wrong because an answer key drifted.
import { h, type Child, type Desc } from "@cas/ui";
import { TOUR } from "../engine/vocabulary.js";
import { level } from "./level.js";
import { TOUR_STEPS, type TourContext } from "./tour.js";

export interface TourModel {
  readonly step: number;
  /** Whether the app is still showing the state this step opened. */
  readonly onStep: boolean;
  /** The reader's choice for this step's prediction, if made this session. */
  readonly chosen: number | null;
  readonly ctx: TourContext;
}

export interface TourHandlers {
  readonly onGo: (k: number) => void;
  readonly onChoose: (choice: number) => void;
  readonly onLeave: () => void;
}

type StepText = {
  readonly title: string;
  readonly lines: readonly string[];
  readonly question?: string;
  readonly choices?: readonly string[];
};

export function tourCard(m: TourModel, on: TourHandlers): Desc {
  const step = TOUR_STEPS[m.step];
  const text = TOUR.steps[step.id] as StepText;
  const n = TOUR_STEPS.length;
  const rows: Child[] = [
    h("p", { key: "k", class: "legend" }, TOUR.step(m.step + 1, n)),
    h("h3", { key: "title" }, text.title),
    ...text.lines.map((l, i) => h("p", { key: `l${i}`, class: "summary" }, l)),
  ];

  if (!m.onStep) {
    rows.push(
      h("p", { key: "off", class: "legend" }, TOUR.offStep),
      h(
        "button",
        { key: "return", type: "button", onclick: () => on.onGo(m.step) },
        TOUR.returnTo,
      ),
    );
  } else {
    const asks = text.question !== undefined && step.answer !== undefined;
    const answer = asks ? step.answer!(m.ctx) : null;
    if (asks) {
      rows.push(
        h(
          "fieldset",
          { key: "predict", class: "predict" },
          h("legend", { key: "lg" }, `${TOUR.predict}: ${text.question}`),
          ...(text.choices ?? []).map((c, i) =>
            h(
              "label",
              { key: `c${i}`, class: "ring-choice" },
              h("input", {
                key: "i",
                type: "radio",
                name: `tour-${step.id}`,
                value: String(i),
                checked: m.chosen === i,
                onChange: () => on.onChoose(i),
              }),
              h("span", { key: "s" }, ` ${c}`),
            ),
          ),
        ),
      );
      if (m.chosen === null)
        rows.push(h("p", { key: "wait", class: "legend" }, TOUR.unanswered));
      else
        rows.push(
          h(
            "p",
            { key: "grade", class: "grade", role: "status" },
            answer === null
              ? TOUR.ungraded
              : answer === m.chosen
                ? TOUR.right
                : TOUR.wrong,
          ),
        );
    }
    // What the state shows — withheld until a prediction is made, so the card never answers first.
    if (!asks || m.chosen !== null) {
      const claims = step.claims(m.ctx);
      rows.push(h("h3", { key: "ch" }, TOUR.computed));
      rows.push(
        claims.length
          ? h(
              "ul",
              { key: "claims", class: "claims" },
              ...claims.map((c, i) =>
                h(
                  "li",
                  { key: `c${i}`, class: "claim" },
                  level(c, "lv"),
                  c.level === "⚠" ? ` ${c.method}.` : ` ${c.claim}.`,
                ),
              ),
            )
          : h("p", { key: "claims", class: "legend" }, TOUR.pending),
      );
    }
  }

  rows.push(
    h(
      "div",
      { key: "tools", class: "toolbar" },
      h(
        "button",
        {
          key: "prev",
          type: "button",
          disabled: m.step === 0,
          onclick: () => on.onGo(m.step - 1),
        },
        TOUR.previous,
      ),
      h(
        "button",
        {
          key: "next",
          type: "button",
          disabled: m.step === n - 1,
          onclick: () => on.onGo(m.step + 1),
        },
        TOUR.next,
      ),
      h("button", { key: "leave", type: "button", onclick: on.onLeave }, TOUR.leave),
    ),
  );
  return h(
    "section",
    { key: "tour", class: "card tour", "aria-labelledby": "card-tour" },
    h("h2", { key: "t", id: "card-tour" }, TOUR.heading),
    ...rows,
  );
}
