/**
 * Import side of the suite hand-off: turn an `@cas/interchange` map Envelope — an f(z) handed off from
 * the Complex-Function Plotter or Complex Dynamics (an `expr` / `view` map), a uniformizing map φ from
 * Quadrature Domains, or a bare rational / Laurent map — into an `@cas/expr` source string this tool can
 * study for its zeros, poles, and winding. The MapSpec -> expr converter (`mapSpecToExpr` /
 * `envelopeToMapSpec`, incl. the degenerate-denominator / pole-bearing-Laurent / schwarz refusals) now
 * lives in `@cas/interchange` (ADR-0027, shared with the plotter and Complex Dynamics); this module keeps
 * only the outer glue — decode the payload, and redirect a numerical `schwarz` σ to its generating map φ,
 * honestly labelled.
 */
import {
  decodeLink,
  validateEnvelope,
  mapSpecToExpr,
  envelopeToMapSpec,
  type Complex,
  type View,
} from "@cas/interchange";

// Re-export the shared converter so this module stays the app's single interchange-import facade
// (existing tests import mapSpecToExpr / envelopeToMapSpec from here).
export { mapSpecToExpr, envelopeToMapSpec } from "@cas/interchange";

/** The result of importing an interchange text: the `@cas/expr` source, an honest note about what was
 *  imported, the source app, and a viewport center to restore for a `view`. */
export interface ImportedMap {
  expr: string;
  note: string;
  source: string;
  center?: Complex;
}

/**
 * Decode an interchange payload (an `#s=` link or a JSON envelope) into an `@cas/expr` source. A `schwarz`
 * σ is redirected to its generating map φ with a note. Throws (InterchangeError or a plain Error) on a
 * malformed / unsupported payload — the caller surfaces the message.
 */
export function importEnvelopeText(text: string): ImportedMap {
  const t = text.trim();
  const env = t.startsWith("{") ? validateEnvelope(JSON.parse(t)) : decodeLink(t);
  const spec = envelopeToMapSpec(env);
  const source = typeof env.provenance?.app === "string" ? env.provenance.app : "unknown";
  if (!spec) throw new Error(`This “${env.kind}” payload carries no map to study.`);

  const center = env.kind === "view" ? (env.payload as View).viewport.center : undefined;

  if (spec.form === "schwarz") {
    const phi = spec.phi;
    if (phi.form === "bounded") {
      throw new Error(
        "This Schwarz reflection's generating map φ is a bounded map (φ: 𝔻 → Ω), which this tool's import doesn't represent yet.",
      );
    }
    return {
      expr: mapSpecToExpr(phi),
      note: "Imported φ, the generating map — the numerical Schwarz reflection σ is not itself studied here.",
      source,
      center,
    };
  }
  const note = env.kind === "quadrature-domain" ? "Imported the uniformizing map φ." : "";
  return { expr: mapSpecToExpr(spec), note, source, center };
}
