# M8 review inputs

Working materials behind the Contour Integration review of 2026-09-14 (the published review page is
`https://claude.ai/artifact/3uUWAhH4PM9qGR2siHvpjV`; it carries the screenshots and mockup images, which are
deliberately not committed here).

| file | what it is |
|---|---|
| `shell-review.md` | read-through of `src/shell/` + `src/ui/`: structure, interaction defects, on-screen strings, feasibility per owner decision, styling, tests that constrain a rebuild |
| `content-review.md` | every user-facing string of the 28 records, the ledger/derivation templates, the drill and contrast strings — flagged, with proposed replacements; per-record four-line descriptions and draft citations (`[verify]` = unconfirmed); the front-door taxonomy |
| `mockups/` | the HTML/CSS/JS used to render the layout mockups (A single-rail, B two-rail, Bc collapsed, Bw worked-example mode, C drawer, D document, G gallery front door) and `treat.html`, the stage-colouring post-processor; the `*.mjs` are the Playwright drivers. They expect a local KaTeX under `mockups/katex/` and the captured `*-gl.png` / `*-ink.png` layers from `capture.mjs`. |

Decisions taken on the review (owner, 2026-09-14): layout **B**; stage modes **quiet · full · isochromatic · textbook**
plus the modulus-contour toggle, with textbook and light-phase as the figure export's print and light variants;
vocabulary **Hypotheses · Residues · Boundary terms · Target**; textbook voice; KaTeX; exploration first with a
user-driven worked-example mode; citations wanted; desktop/laptop only; one long-lived branch, merged once.
