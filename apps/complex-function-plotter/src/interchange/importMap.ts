/**
 * Import side of the suite hand-off (catalog K7): turn an `@cas/interchange` map Envelope — a Schwarz σ /
 * uniformizing map φ from Quadrature Domains, a saved View, or a bare map — into an `@cas/expr` source
 * string the plotter can plot. The MapSpec -> expr converter (`mapSpecToExpr` / `envelopeToMapSpec`, incl.
 * the degenerate-denominator / pole-bearing-Laurent / schwarz refusals) now lives in `@cas/interchange`
 * (ADR-0027, shared with Complex Dynamics and Argument Principle); this module keeps only the plotter's
 * outer glue — decode the payload, and redirect a numerical `schwarz` σ to its generating map φ, HONESTLY
 * LABELLED (it is not σ).
 */
import {
  decodeLink,
  validateEnvelope,
  mapSpecToExpr,
  envelopeToMapSpec,
  type Complex,
  type View,
} from "@cas/interchange";

// Re-export the shared converter so this module stays the plotter's single interchange-import facade
// (existing tests import mapSpecToExpr / envelopeToMapSpec from here).
export { mapSpecToExpr, envelopeToMapSpec } from "@cas/interchange";

/** The result of importing an interchange text: the `@cas/expr` source to plot, an honest note about what
 *  was imported (φ-in-place-of-σ, etc.), the source app, and a viewport to restore for a `view`. */
export interface ImportedMap {
  expr: string;
  note: string;
  source: string;
  viewport?: { center: Complex; span: number };
}

/**
 * Decode an interchange payload (an `#s=` link or a JSON envelope) and turn it into a plottable
 * `@cas/expr` source. A `schwarz` σ is redirected to its generating map φ with an honest note; a `view`
 * additionally yields its viewport so the plotter can re-open it in place. Throws (InterchangeError or a
 * plain Error) on a malformed / unsupported payload — the caller surfaces the message.
 */
export function importEnvelopeText(text: string): ImportedMap {
  const t = text.trim();
  const env = t.startsWith("{") ? validateEnvelope(JSON.parse(t)) : decodeLink(t);
  const spec = envelopeToMapSpec(env);
  const source = typeof env.provenance?.app === "string" ? env.provenance.app : "unknown";
  if (!spec) throw new Error(`This “${env.kind}” payload carries no plottable map.`);

  const viewport =
    env.kind === "view"
      ? {
          center: (env.payload as View).viewport.center,
          span: (env.payload as View).viewport.zoom,
        }
      : undefined;

  if (spec.form === "schwarz") {
    const phi = spec.phi;
    if (phi.form === "bounded") {
      // φ: 𝔻 → Ω (a bounded quadrature domain), added to the interchange alongside the bounded σ family.
      // Its closed form is branch-based (w₀ + Σ Aⱼ,ₖ·zᵏ/(1−conj(zⱼ)·z)ᵏ), which the plotter's import doesn't
      // build yet — the same reason it already refuses a pole-bearing Laurent map. Refuse loudly rather than
      // drop terms into a subtly-wrong map; Complex Dynamics, which carries @cas/schwarz, reconstructs it.
      throw new Error(
        "This Schwarz reflection's generating map φ is a bounded map (φ: 𝔻 → Ω), which the plotter's import doesn't represent yet. Open it in Complex Dynamics, which reconstructs σ numerically.",
      );
    }
    // The numerical Schwarz reflection σ isn't a closed form; plot its generating map φ, clearly labelled.
    return {
      expr: mapSpecToExpr(phi),
      note: "Imported φ, the generating map — the numerical Schwarz reflection σ needs the Quadrature-Domains solver, so it is not itself plotted here.",
      source,
      viewport,
    };
  }
  const note = env.kind === "quadrature-domain" ? "Imported the uniformizing map φ." : "";
  return { expr: mapSpecToExpr(spec), note, source, viewport };
}
