# Where to edit UI text

Most of the app's editable prose now lives in **one file**:

> ### `app/ui-strings.js`  (the `QD.Strings` object)

Open it and edit the value you want — the code reads from there, so nothing else
needs to change. That file's header explains the grouping and the markup rules
(which entries are HTML vs plain-text tooltips, what Unicode to preserve, etc.).

It holds: the **"?" help-popovers**, the **family hint blocks** under the
Domain-type card, the **card hints**, the **overlay tooltips + legend notes**, the
**Faber** and **analytic-oracle** card help, the **thesis-example blurbs**, and the
**solve-failure guidance**.

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
| Validation errors + family external-field labels | `app/ui-modes.js` |
| Live status / validity / geometry / cusp / observable lines (interleaved with numbers) | `app/ui-solve.js` |
| Oracle row names (with computed values) | `app/thesis-examples.js` (`checkOracle`) |
| On-canvas labels (pole `aₙ`, cusp `(p,q)`, `Fₙ roots`, tip / max-κ) | `app/ui-domain-plot.js` |
| Keyboard-shortcut descriptions + copy/help affordance text | `app/qol.js` |

To locate any specific string, search the repo for a few words of it.
