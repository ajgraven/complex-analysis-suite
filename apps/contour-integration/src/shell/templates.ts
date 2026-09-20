// The sandbox's contour templates: the shapes the reader can pick, and the cut systems two of them
// presuppose.
//
// **EXTRACTED FROM `app.ts` ON THE SECOND-CONSUMER RULE** (ADR-0007). `shell/viewState.ts` carries
// the sandbox contour as the RECIPE that produced it — `{template, params, shift}` — rather than as
// its piece geometry, which is what takes M6.2a's worst-case permalink from 2,838 B of URL, over
// research 07 §6's warning, to 1,078 B. The codec is DOM-free, so the table cannot stay in a module
// that builds a WebGL2 stage. It is pure data and pure functions either way, so this is where it
// belonged.

import { Frac } from "@cas/exact";
import { addBranchPoint, joinToOneCut, setOrder } from "../engine/branchEdit.js";
import type { Contour } from "../engine/contour/model.js";
import {
  circleTemplate,
  dogboneTemplate,
  indentedSemicircleTemplate,
  keyholeTemplate,
  rectangleTemplate,
  semicircleTemplate,
  squareTemplate,
  stripTemplate,
  wedgeTemplate,
} from "../engine/contour/templates.js";
import type { TemplateId } from "../engine/vocabulary.js";
import type { BranchChoice } from "../kernel/branch/model.js";

/**
 * The sandbox's template ids — the identity a `#vs=` permalink carries for a contour.
 *
 * The first seven are the names the FAMILY schema uses (`Family.contour.template`), which the
 * sandbox borrowed; the last three are the sandbox's own. `"strip"` is where the two vocabularies
 * diverge and the table below says why: a record declares that shape as `"rectangle"` (E1, E2 and E3
 * all do) while the sandbox already uses that name for its free four-sided shape.
 *
 * **Declared in `engine/vocabulary.ts` and re-exported here** (M8 step 2.1), for the reason
 * `ConstraintId` is: the labels are decided in that one file, and an id whose label lived across a
 * module boundary from it could come to disagree with the picker that offers it.
 */
export type { TemplateId };

/**
 * `seed` is how a template whose SHAPE presupposes a cut declares one.
 *
 * A keyhole with no cut is four pieces with a coincidence in them, and a dogbone with no cut is a
 * closed curve enclosing nothing — which is to say `∮ = 0` and no lesson. So these two offer the cut
 * system they were drawn for. It stays a CHOICE in exactly the sense M4.1 fixed: the seeded points
 * and cut are ordinary declared objects, listed in the Branch cuts card, draggable, re-orderable and
 * removable, and the template only offers them when nothing is declared yet — it never overwrites a
 * cut the user placed.
 */
export const TEMPLATES: {
  id: TemplateId;
  build: () => Contour;
  seed?: (branch: BranchChoice) => BranchChoice;
}[] = [
  { id: "circle", build: () => circleTemplate([0, 0], 1.5) },
  { id: "semicircle", build: () => semicircleTemplate(3, "upper") },
  { id: "semicircleDown", build: () => semicircleTemplate(3, "lower") },
  // C1's contour, and the one that makes `∮` stop being the answer: it encloses nothing, so
  // `∮ = 0` while the integral is π/2 and the entire value comes from the indentation's
  // `iα·Res`. The engine has had this template since M3 with no way in.
  {
    id: "indented",
    build: () => indentedSemicircleTemplate(8, 0.05),
  },
  { id: "rectangle", build: () => rectangleTemplate(-1.6, -1.2, 1.6, 1.2) },
  // Tier E's shape, alongside tier D's two below: the quasi-periodic strip, whose top side
  // REPRODUCES the bottom rather than vanishing. `exp(0.3*z)/(1 + exp(z))` on it is E1.
  { id: "strip", build: () => stripTemplate(2 * Math.PI, 6) },
  // Tier F's shape, and the rotational twin of the strip above: the return ray reproduces the
  // outgoing one by `−ω·μ` rather than by `−λ`. `1/(1 + z^3)` on it is F1.
  { id: "wedge", build: () => wedgeTemplate(3, 4) },
  // Tier G's shape, and the only one whose every side vanishes — `pi*cot(pi*z)/z^2` on it is G1's
  // contour. The half-integer offset is the point: at half-width 2 the vertical sides run through
  // the kernel's poles at `z = ±2`.
  { id: "square", build: () => squareTemplate(2) },
  // Tier D's two shapes, which the engine has had since M4.2 and M4.6 with no way in either.
  {
    id: "keyhole",
    build: () => keyholeTemplate(4, 0.15),
    seed: (b) => setOrder(addBranchPoint(b, [0, 0]), "b1", { kind: "power", alpha: Frac.of(1n, 2n) }),
  },
  // The one that encloses nothing and is not zero — but only once the cut is inside it, which is
  // why this is the template that seeds a BOUNDED cut rather than a ray.
  {
    id: "dogbone",
    build: () => dogboneTemplate(-1, 1, 0.12),
    seed: (b) => {
      const half = { kind: "power", alpha: Frac.of(-1n, 2n) } as const;
      let next = setOrder(addBranchPoint(b, [-1, 0]), "b1", half);
      next = setOrder(addBranchPoint(next, [1, 0]), "b2", half);
      return joinToOneCut(next, "b1", "b2") ?? next;
    },
  },
];

