# `@cas/export`

Shared **figure-export primitives** for the suite — the small, pure, DOM-free routines an app
needs to turn a rendered view into a self-describing file. Today that is **PNG `tEXt` metadata**:
the mechanism by which an exported figure carries its own recipe.

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
`tEXt` chunk that image viewers ignore but that this module can read back. Re-open the image, and
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

**`injectPngText(png, entries)`** inserts one `tEXt` chunk per `entries` pair immediately before the
terminating `IEND`, with a correct CRC-32, and returns a **new** byte array (the input is left
untouched). A non-PNG, or a PNG with no `IEND`, is returned unchanged. Keywords are truncated to the
79-byte PNG limit; text outside Latin-1 is coerced to `?` (the `tEXt` charset).

**`readPngText(png)`** is the inverse: it walks the chunk stream and returns every `tEXt` keyword →
text pair as a record (`{}` for a non-PNG).

`crc32`, `pngChunk`, and `PNG_SIGNATURE` are the lower-level primitives the two text functions are
built from, exported because they are independently useful (building fixtures, framing other
ancillary chunks).

## Consumers

- **Complex Dynamics** — `src/hiResExport.ts` stamps its high-resolution PNG exports.
- **Complex-Function Plotter** — `src/render/plot.ts` stamps exported plots.
- **Riemann Map** — `src/main.ts` stamps both the single-pane and the disk-image plate exports with
  `Software` + the `cas:state` permalink.

## Tests

`test/png.test.ts` — the CRC-32 canonical check value, chunk framing, an inject → read round-trip,
the "metadata goes before IEND / file still ends at IEND" invariant, Latin-1 coercion, and the
non-PNG / empty-entries no-ops. Pure byte assertions, no DOM.
