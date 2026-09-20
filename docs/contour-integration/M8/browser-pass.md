# M8 step 5.1 — the browser pass

**What this is.** A click-through checklist for a real machine with a real GPU. The executor ran it
first under **SwiftShader** (headless Chromium 1194, `--enable-unsafe-swiftshader --use-gl=angle
--use-angle=swiftshader`, viewport 1440×950, against the dev server) and the results are recorded
beside each item, so the owner is checking a claim rather than discovering one. **Every number below
was measured, not expected.**

SwiftShader is a software rasteriser. It cannot see three classes of defect, which is the whole
reason the owner runs this again: a driver that reports WebGL2 and then fails to link a real program,
a colour path that differs on real hardware (float precision in the portrait shader), and anything
about frame TIMING — a drag that is smooth here may not be on a machine compositing at 60 Hz.

## The links

Paste after `…/contour-integration/`. These are the exact states the executor used.

| # | state |
|---|---|
| `A6` | `#vs=eyJ2IjoxLCJhcHAiOiJjaSIsInN0YXRlIjp7Im0iOiJnIiwiciI6InNlbWljaXJjbGUtcXVhcnRpYyJ9fQ` |
| `D1` | `#vs=eyJ2IjoxLCJhcHAiOiJjaSIsInN0YXRlIjp7Im0iOiJnIiwiciI6Im1lbGxpbi1rZXlob2xlIn19` |
| `D7` | `#vs=eyJ2IjoxLCJhcHAiOiJjaSIsInN0YXRlIjp7Im0iOiJnIiwiciI6ImRvZ2JvbmUtdHdvLWZyYWN0aW9uYWwtcG93ZXJzIn19` |
| `G1` | `#vs=eyJ2IjoxLCJhcHAiOiJjaSIsInN0YXRlIjp7Im0iOiJnIiwiciI6InNlcmllcy1jb3QtY29sbGlzaW9uIn19` |
| `sandbox` | `#vs=eyJ2IjoxLCJhcHAiOiJjaSIsInN0YXRlIjp7ImUiOiIxLygxK3peMikifX0` |
| `declared` | `#vs=eyJ2IjoxLCJhcHAiOiJjaSIsInN0YXRlIjp7ImUiOiIxLygxK3opIiwiYyI6eyJ0Ijoia2V5aG9sZSJ9LCJkYyI6eyJwIjoiYjEiLCJ3IjpbIjAvMSIsIjIvMSJdLCJzIjoxLCJrIjpbMSwwXSwibCI6Mn0sImJkIjoiel4oLTEvMikvKDEreikiLCJiciI6eyJjdiI6InByaW5jaXBhbCIsInB0IjpbeyJpIjoiYjEiLCJhdCI6WzAsMF0sImEiOiItMS8yIiwibCI6InogPSAwLjAwICsgMC4wMGkifV0sImN0IjpbeyJpIjoizpMxIiwiZiI6ImIxIiwidCI6ImluZmluaXR5IiwidiI6W1sxMDAwMCwwXV19XSwiYnAiOlswLDFdLCJzayI6MH19fQ` |
| `bad` | `#vs=eyJ2IjoxLCJhcHAiOiJjaSIsInN0YXRlIjp7Im0iOiJnIiwiciI6Im5vLXN1Y2gtcmVjb3JkIn19` |

`A6` = `semicircle-quartic`, `D1` = `mellin-keyhole`, `D7` = `dogbone-two-fractional-powers`,
`G1` = `series-cot-collision`. `declared` is the sandbox keyhole with a `z^(−1/2)` factor declared.
`bad` names a record that does not exist, deliberately.

## The checklist

### 1 — each stage mode on A6, D1, D7 and G1

Open each link, then press **Quiet**, **Full**, **Isolines**, **Textbook** in turn. Expect: the
portrait changes behind a contour that does not move, the verdict does not move either, and the
console stays clean.

*Measured (distinct colours / non-transparent pixels, GL layer and ink layer, 498,576 px frame):*

| record | Quiet | Textbook | verdict |
|---|---|---|---|
| A6 | `gl 42,539c` · `ink 112c/11,885px` | `gl 1c` · `ink 197c/25,376px` | `= π√2/2` |
| G1 | `gl 45,559c` · `ink 129c/15,090px` | — | `= π²/6` |

`gl 1c` in Textbook is **correct and is the assertion**: that mode draws no portrait at all, so a
single flat colour is what a white plate looks like. Zero page errors across all sixteen
(4 records × 4 modes) combinations.

**On real hardware also check:** the Full portrait's hue wheel is continuous (no banding at the
branch cut on D1/D7), and switching modes does not leak a frame of the previous mode.

### 2 — a drag across a pole

`sandbox` (`1/(1+z^2)` on a circle). Drag the contour so that both poles are inside, then so that
only `+i` is.

*Measured:* both enclosed `∮ = 0`; `+i` alone `∮ = π`. **The value jumps by exactly `2πi·Res`.**
Screen↔plot was calibrated from the app's own readout with two probes rather than guessed — an
earlier fixture that "worked" had in fact enclosed both poles in both positions, where `0` is the
answer either way and nothing is being tested.

### 3 — the pen

`sandbox`, Pen tool. Click four corners round `+i`, click the first vertex to close.

*Measured:* pieces `["pen0","pen1","pen2","pen3"]`, `∮ = π` — the same number the circle template
gives for the same enclosure, which is M7.2's gate in the browser.

### 4 — the keyhole's cut drag

`declared`. Focus the stage and press **Enter** repeatedly: the arrows walk the view → the whole
contour → each handle → back to the view.

*Measured — six stops, every one named:*

```
the whole contour · the R to infinity circle (R) · the epsilon to 0 circle (eps)
branch point b1 · the cut Γ1 · (back to) pan the view
```

Grab **the cut Γ1** and press ArrowUp ×8. *Measured:* the Result card refuses by name —
*"the R → ∞ circle crosses the cut Γ with no side assigned"*, with the repair *"Assign the piece to
the upper or lower side"* — while the Branch-cuts card states the crossing's price,
`e^{2πi·(−1/2)} = −1`. That is M5.1's claim, live.

Grab **branch point b1** and press ArrowUp ×8. *Measured:* *"The declared factor was refused: the
branch point is at 0 + 1.33i, off the real axis…"* — see finding **F1** below; before this step it
said *"There is no integrand."*

### 5 — every figure plate saved and opened

Share card → Save figure → dark, light, print. Open each.

*Measured:* Dark **1,586,892 B**, Light **976,262 B**, Print **111,667 B**, all **1552×2164**. The
`tEXt`/`iTXt` keys present in all three:

```
iTXt:Software · tEXt:cas:state · tEXt:cas:verdict · iTXt:cas:value · tEXt:cas:theme
```

The per-entry choice is visible in the bytes: ASCII payloads stay `tEXt` byte-for-byte, the two
carrying an em-dash or a `√` are `iTXt`. That is the M6 review's `@cas/export` fix, in a real file.

**On real hardware also check:** the plate's backdrop is the portrait and not a flat field — the
`preserveDrawingBuffer` finding from M6.3 is a driver-dependent one and SwiftShader is its easiest
case.

### 6 — the front door with keyboard only

Land on `/`. Tab. Reach everything.

*Measured, from the accessibility TREE over CDP (not a DOM walk — M6.4's lesson, and it repeated
here: a DOM walk reading `aria-label ?? textContent` reported **12 unnamed** controls where the tree
reports **0**):*

```
42 interactive nodes · 0 unnamed
```

Keyboard-only path to an answer: Tab to *"leave this record for the sandbox, keeping the contour
parked"* → Enter → the integrand box appears and takes focus → type `1/(z^2+1)` → Enter → the Result
card reads `∮ = 0`, which is right (both poles enclosed).

### 7 — the drill end to end

**Drill** → open the first task → **Next stage** ×3 → **Start again**.

*Measured, the fade visible in what each rung shows:*

| rung | Result card | Derivation card |
|---|---|---|
| 1 | `The argument is complete. = π` | 7 steps · 10 checks |
| 2 | `The argument is complete. = π` | **Hidden: what each piece is for** |
| 3 | **`Hidden until a contour is chosen.`** | Hidden: what each piece is for |
| 4 | `∮ f(z) dz is established exactly.` | 7 steps · 8 checks |

Rung 4 offers *"start this task again at the worked argument"*. Four tasks in the menu.

### 8 — a worked example stepped and played

**Worked example** → step 1 → **next step** to the end → drag the scrub from Home to End.

*Measured:* the stepper walks `1/8 → 2/8 → … → 8/8`, every stage named in its own control
(*"step 3 of 8 — Residues"*). The accumulator's ink grows **1,160 → 2,520 → 2,527** non-transparent
pixels from Home to End (the floor of 1,160 is the axes, which are stroked at 16 % alpha — the
M5.1-follow-on lesson about what `getImageData` counts).

### 9 — a link the app cannot honour

`bad`. *Measured:* a `.linkRefusal` box carrying `role="alert"` and *"This link names a worked
example this version does not have. The app's own starting state is shown instead."*, still present
**1.5 s later** — M6.2's finding 3 (a refusal wiped by the next successful parse is no refusal) holds
in a real browser.

## Safari and Firefox

Neither is installed in the executor's container, so these are **notes to watch**, not results.

- **`ClipboardItem` takes the PROMISE, not the resolved blob** (`shell/app.ts`, the plotter's form).
  Safari requires the `clipboard.write` to be reached synchronously inside the user gesture; awaiting
  the blob first loses the gesture and the write is rejected. The code already does this and guards
  `typeof ClipboardItem === "undefined"`. **Check on Safari:** *Copy figure* puts a PNG on the
  clipboard, and on Firefox — where `ClipboardItem` support has been partial — the guard produces a
  message rather than a silent no-op.
- **`foreignObject`**: *measured, the app does not use it.* Step 2.3 did not adopt it (`grep` over
  `src/` returns nothing), so this risk is closed rather than carried.
- **Firefox WebGL2**: the fatal boundary (`@cas/ui`'s `runWithFatalBoundary`) is the path to check —
  disable WebGL in `about:config` and confirm a banner rather than a blank stage.

## Findings

Both were found by this pass, both are fixed in the same commit, and both are the SAME defect wearing
two faces — a sentence the engine composed correctly and the Result card did not show.

**F1 — the Result card said "There is no integrand." about a refused declaration.** Reached by
grabbing the keyhole's branch point and moving it off the origin. `runDeclared` refuses exactly and
by name; Integrand, Branch cuts and Derivation all show that reason; the Result card — the one a
reader is looking at for an answer — showed none of it, and said something false while `1/(1+z)` was
still in the box. This is M8 step 2.4's gallery-`fatal` defect in the sandbox's declared route. Fixed
(`cards/result.ts`), with a test asserting EQUALITY against the resolution's own reason over both
refusals the move can reach (off the axis is `declaredRun`'s, away from the origin along it is
`buildDeclaration`'s) — a card printing a sentence of its own would satisfy "not the false one" while
still keeping the engine's words from the reader.

**F2 — the refused claim was on the card TWICE, spelled two ways.** The hypothesis table below it
renders the claim through `mathText`; the headline block printed it raw, so a reader met

```
the $R \to \infty$ circle crosses the cut $\Gamma$ with no side assigned
```

above a typeset copy of itself. Every claim in `engine/claims.ts` is written in the `$…$` convention,
and a reader of a refusal is exactly the reader who most needs it read. Fixed; step 2.1's rule holds
here as everywhere. The test was checked against the reverted fix, so it pins the reason and not only
the outcome.
