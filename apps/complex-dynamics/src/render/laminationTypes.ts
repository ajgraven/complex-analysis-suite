/**
 * laminationTypes.ts — leaf-level shared types for the lamination subsystem, split out of
 * lamination.ts so that consumers needing only the *type* (e.g. render/overlay.ts) do not create an
 * import edge back into lamination.ts. This module has NO imports (a dependency graph leaf), which
 * removes the type-only cycle madge reported across
 *   angleOfPoint → angleParameter → inspect → overlay → lamination → (angleOfPoint / angleParameter).
 * The edge was already erased at runtime (`import type` under verbatimModuleSyntax), so this is a
 * type-only relocation with no emitted-JS change; it also unblocks the planned dependency-cruiser gate.
 * Re-exported from lamination.ts for backward compatibility.
 */

/** A leaf of the lamination: a chord joining two co-landing external angles (turns in [0, 1)). */
export interface Leaf {
  a: number;
  b: number;
}
