# `@cas/export`

Shared **figure-export primitives** for the suite — the small, pure, DOM-free routines an app
needs to turn a rendered view into a self-describing file. Today that is **PNG text metadata**
(`tEXt`, and `iTXt` where the text needs more than Latin-1): the mechanism by which an exported
figure carries its own recipe.

Extracted per [ADR-0007](../../docs/DECISIONS.md#adr-0007-incremental-extraction-driven-by-real-need)
once **three** apps each carried a byte-for-byte-equivalent copy of the same code — Complex
Dynamics, the Complex-Function Plotter, and Riemann Map. The rule is "extract on the second
consumer"; this one was well past due. Convention-neutral per
[ADR-0006](../../docs/DECISIONS.md#adr-0006-convention-neutral-core-packages): this is byte manipulation —
no `π` / `2πi`, indeed no mathematics, lives here.

## Why a figure should carry its own recipe

A publication figure that cannot be regenerated is a dead end: six months later the reader (often
the author) has the picture but not the parameters that made it. The suite's answer is to embed the
**permalink** — the full serializable view-state — into the exported PNG itself, in an ancillary
text chunk that image viewers ignore but that this module can read back. Re-open the image, and
the exact view is recoverable. The pixels are untouched; only invisible metadata is added.

## API

```ts
import {
  PNG_SIGNATURE,               // the 8-byte PNG signature
  crc32,                       // CRC-32/ISO-HDLC (crc32("123456789") === 0xcbf43926)
  pngChunk,                    // build one framed chunk: [length][type][data][crc]
  injectPngText,               // splice tEXt entries before IEND (Record<string,string>)
  readPngText,                 // read them all back (Record<string,string>)
} from "@cas/export";

// after canvas.toBlob(...) → bytes:
const stamped = injectPngText(bytes, {
  Software: "Riemann Map — Complex Analysis Suite",
  "cas:state": permalink,
});
```

**`injectPngText(png, entries)`** inserts one text chunk per `entries` pair immediately before the
terminating `IEND`, with a correct CRC-32, and returns a **new** byte array (the input is left
untouched). A non-PNG, or a PNG with no `IEND`, is returned unchanged. Keywords are truncated to the
79-byte PNG limit and stay Latin-1, which the spec requires.

**The chunk type is chosen per entry.** `tEXt` is Latin-1 only, so anything above U+00FF used to be
coerced to `?` — and that was destroying real content rather than exotic content: every consumer's
`Software` string carries an em-dash, and Contour Integration stamps a figure's own verdict, where
`= 2π√3/3` was being stored as `= 2??3/3`. So an entry whose text is pure Latin-1 is written as
`tEXt`, exactly as before, and one that is not is written as **`iTXt`**, PNG's UTF-8 text chunk
(uncompressed, empty language tag). Existing ASCII payloads — permalinks, parameter strings — are
byte-identical to what they always were.

**`readPngText(png)`** is the inverse: it walks the chunk stream and returns every `tEXt` **and**
`iTXt` keyword → text pair as a record (`{}` for a non-PNG). A *compressed* `iTXt` — which this
module does not write — needs zlib, which it deliberately does not carry, so such a key is left
**absent** rather than present and garbled.

`crc32`, `pngChunk`, and `PNG_SIGNATURE` are the lower-level primitives the two text functions are
built from, exported because they are independently useful (building fixtures, framing other
ancillary chunks).

## Consumers

- **Complex Dynamics** — `src/hiResExport.ts` stamps its high-resolution PNG exports.
- **Complex-Function Plotter** — `src/render/plot.ts` stamps exported plots.
- **Riemann Map** — `src/main.ts` stamps both the single-pane and the disk-image plate exports with
  `Software` + the `cas:state` permalink.
- **Argument Principle** — `src/main.ts` stamps its exported figures.
- **2D Electrostatics** — `src/main.ts` stamps its PNG field/figure exports (`injectPngText`).
- **2D Hydrodynamics** — `src/pngExport.ts` stamps its composited plate.
- **Contour Integration** — `src/shell/figure.ts` stamps the plate with `Software`, the `cas:state`
  permalink and the argument's **verdict**, which is what made `iTXt` necessary.

**A note on keys.** This README specifies `Software` + `cas:state`, and **three** consumers follow it
(Riemann Map, Contour Integration, and Complex Dynamics since the 2026-09-16 review — which also
keeps `cdjs:state` as a deprecated alias for one release, so anything already reading its PNGs still
works). The remaining three each minted their own prefix before this package existed — `ap:url`,
`2de:url`, `2dh:url` — so a reader wanting to open any figure in the suite has three special cases. Unifying them is a suite-wide change, deliberately not
made from inside one app; it is recorded here so the discrepancy is visible rather than assumed away.

## Tests

`test/png.test.ts` — the CRC-32 canonical check value, chunk framing, an inject → read round-trip,
the "metadata goes before IEND / file still ends at IEND" invariant, the `tEXt`/`iTXt` choice (that a
pure-ASCII entry stays in `tEXt` so existing consumers' bytes do not move, that mathematics and an
em-dash survive intact, that both types mix in one file, that a foreign `iTXt` carrying a language tag
still reads, and that a compressed one is left absent), Latin-1 keyword coercion, and the non-PNG /
empty-entries no-ops. Pure byte assertions, no DOM.
