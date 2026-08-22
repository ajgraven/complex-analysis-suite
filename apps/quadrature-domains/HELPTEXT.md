# Where to edit UI text

Most of the app's editable prose now lives in **one file**:

> ### `app/ui-strings.mjs`  (the `QD.Strings` object)

Open it and edit the value you want — the code reads from there, so nothing else
needs to change. That file's header explains the grouping and the markup rules
(which entries are HTML vs plain-text tooltips, what Unicode to preserve, etc.).

It holds: the **"?" help-popovers**, the **family hint blocks** under the
Domain-type card, the **card hints**, the **overlay tooltips + legend notes**, the
**Faber** and **analytic-oracle** card help, the **thesis-example blurbs**, the
**solve-failure guidance**, and — for the Algebra tab — **`algebraOps`**.

**`algebraOps` is where every Algebra control's text lives now.** One record per control,
keyed by element id: `short` (the one-line `title`, held to ~120 characters), `detail` (the
full explanation, rendered in that section's `?` popover), `section` (which popover), and an
optional `label` for controls whose name cannot be read off the DOM — a `<select>`'s
`textContent` is its concatenated options, and a bare `<input>` has none.

Two things follow that are easy to get wrong:

* The Algebra panel's markup is generated in `app/algebra/algebra-ui.mjs`, **not `index.html`**,
  so its `data-str*` hooks are not where the section above implies. Only one survives
  (`tooltips.eliminateVars`); every other Algebra tooltip is assigned by `applyOpHelp()`, which
  reads `algebraOps` and sets `el.title = rec.short` directly.
* Editing an Algebra tooltip means editing `algebraOps`, not `tooltips.*`. The `short` and the
  popover entry come from the same record on purpose, so they cannot drift.

How the text reaches the screen:
- JS prose is read directly (e.g. `QD.Strings.help.cCard`).
- Static HTML text is injected by `QD.Strings.apply()` into elements that carry a
  `data-str` / `data-str-html` / `data-str-title` attribute in `index.html`.

**After editing** any file under `app/`, run `pnpm lint` and `pnpm test` (from the repo root);
`vite build` regenerates the static `dist/` for deployment. *(The old `version:sync` cache-versioning
step was retired at the ESM flip.)*

---

## Not centralized (edit in the named module)

A few categories are intentionally left in their modules — they are pure control
text or are interleaved with computed values:

| What | Where |
|---|---|
| Control labels / buttons / options / tab names | `app/index.html` |
| Validation errors + family external-field labels | `app/ui-modes.mjs` |
| Live status / validity / geometry / cusp / observable lines (interleaved with numbers) | `app/ui-solve.mjs` |
| Oracle row names (with computed values) | `app/thesis-examples.mjs` (`checkOracle`) |
| On-canvas labels (pole `aₙ`, cusp `(p,q)`, `Fₙ roots`, tip / max-κ) | `app/ui/ui-domain-plot.mjs` |
| Copy/help affordance text + the shared `?` overlay chrome | `app/qol.mjs` |
| Keyboard-shortcut **descriptions** | per tab, via `QD.QoL.registerShortcuts(scope, items)` — e.g. the Algebra tab's ~14 in `algebraShortcutItems()` (`app/algebra/algebra-ui.mjs`). `qol.mjs` owns the overlay, not the text. |

To locate any specific string, search the repo for a few words of it.
