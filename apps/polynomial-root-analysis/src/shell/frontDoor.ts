// The front door (PLAN §7 PRA-10): the classics, in a modal on @cas/ui's `createModal` — the
// mechanics Contour Integration's front door proved, moved into the package for this second app
// (ADR-0007). Each classic OPENS something the app already does — a polynomial, a family, a ladder
// state, the tour or the drill — so the door says nothing about a classic that the state it opens
// does not then compute; its one-line blurbs name what to look at, not what is true.
import { createModal, h, patch, type Modal } from "@cas/ui";
import { DOOR } from "../engine/vocabulary.js";
import type { Opens } from "./tour.js";

export type Classic =
  | { readonly kind: "open"; readonly opens: Opens; readonly lattice?: boolean }
  | { readonly kind: "family"; readonly text: string; readonly base?: string }
  | { readonly kind: "tour" }
  | { readonly kind: "drill" };

export interface ClassicEntry {
  readonly id: string;
  readonly label: string;
  readonly blurb: string;
  readonly does: Classic;
}

const sandbox = (text: string): Opens => ({ kind: "sandbox", text });

const WILKINSON = Array.from({ length: 10 }, (_, k) => `(z-${k + 1})`).join("*");

export const CLASSICS: readonly ClassicEntry[] = [
  {
    id: "s5",
    label: "x⁵ − x − 1",
    blurb:
      "The generic quintic: look at its Galois group, and play a generator on the roots.",
    does: { kind: "open", opens: sandbox("z^5 - z - 1") },
  },
  {
    id: "a5",
    label: "x⁵ + 20x + 16",
    blurb: "A quintic whose discriminant is a square: its group is even.",
    does: { kind: "open", opens: sandbox("z^5 + 20z + 16") },
  },
  {
    id: "d5",
    label: "x⁵ − 5x + 12",
    blurb: "A quintic solvable by radicals: its group is small.",
    does: { kind: "open", opens: sandbox("z^5 - 5z + 12") },
  },
  {
    id: "trinks",
    label: "x⁷ − 7x + 3 (Trinks)",
    blurb: "A septic with a group of order 168, and no swap anywhere in its cycle types.",
    does: { kind: "open", opens: sandbox("z^7 - 7z + 3") },
  },
  {
    id: "cuberoot",
    label: "x³ − 2 and its fixed fields",
    blurb:
      "The Galois correspondence drawn: subgroups, invariants and the fields they fix.",
    does: { kind: "open", opens: sandbox("z^3 - 2"), lattice: true },
  },
  {
    id: "wilkinson",
    label: "Wilkinson's polynomial",
    blurb:
      "(z − 1)(z − 2)…(z − 10): integer roots that a tiny change in one coefficient scatters.",
    does: { kind: "open", opens: sandbox(WILKINSON) },
  },
  {
    id: "family",
    label: "The family x⁵ − x − t",
    blurb:
      "Loop t round the places where roots collide, and the roots are permuted: all of S₅.",
    does: { kind: "family", text: "x^5 - x - t" },
  },
  {
    id: "sottile",
    label: "The family x⁴ − 4x² + t (Sottile)",
    blurb: "A family whose monodromy is smaller than S₄.",
    does: { kind: "family", text: "x^4 - 4x^2 + t" },
  },
  {
    id: "ladder",
    label: "Abel–Ruffini, executed",
    blurb:
      "A three-level quintic formula, and the depth-3 word of root motions that rules it out.",
    does: {
      kind: "open",
      opens: { kind: "ladder", rung: 5, formula: "#q3", word: "d3" },
    },
  },
  {
    id: "tour",
    label: "The tour",
    blurb: "Arnold's proof in ten steps, with a prediction to make at five of them.",
    does: { kind: "tour" },
  },
  {
    id: "drill",
    label: "The drill",
    blurb:
      "Which word rules this formula out? Eight formulas, three stages, each helping less.",
    does: { kind: "drill" },
  },
];

export interface FrontDoorInput {
  /** Where the backdrop goes — outside `page`, since `inert` cannot be undone beneath it. */
  readonly host: HTMLElement;
  readonly page: HTMLElement;
  readonly choose: (c: ClassicEntry) => void;
  readonly close: () => void;
}

export function createFrontDoor(input: FrontDoorInput): Modal {
  const modal: Modal = createModal({
    host: input.host,
    page: input.page,
    backdropClass: "modal-backdrop",
    dialogClass: "modal-dialog front-door",
    onClose: input.close,
    build: (dialog, titleId) => {
      patch(dialog, [
        h("h2", { key: "t", id: titleId }, DOOR.heading),
        h("p", { key: "w", class: "legend" }, DOOR.what),
        h(
          "ul",
          { key: "l", class: "classics" },
          ...CLASSICS.map((c) =>
            h(
              "li",
              { key: c.id },
              h(
                "button",
                {
                  key: "b",
                  type: "button",
                  class: "classic",
                  onclick: () => {
                    // Shut before opening: the state change re-renders a page that must be un-inert.
                    modal.dismiss();
                    input.choose(c);
                  },
                },
                h("span", { key: "n", class: "classic-name" }, c.label),
                h("span", { key: "b", class: "classic-blurb" }, c.blurb),
              ),
            ),
          ),
        ),
        h(
          "button",
          { key: "x", type: "button", class: "close", onclick: () => modal.dismiss() },
          DOOR.close,
        ),
      ]);
    },
  });
  return modal;
}
