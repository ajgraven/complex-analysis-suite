// One value → one string, for comparing two states and for keying a compiled program.
//
// **Extracted on the second-consumer rule** (M8 step 2.1). `undo.ts` has had this since step 1.11,
// where the replacer is the whole point; `stageView.ts` keyed its shader program with a bare
// `JSON.stringify` of the same kind of value and threw on the first declared branch factor — the
// second consumer arriving as a defect rather than as a request.

/**
 * A structural key, cheap enough to run on every commit and on every draw.
 *
 * **`JSON.stringify` is safe for the values this app compares and would not be for others**: they
 * are plain data, built by spreading and never cyclic, and they carry no functions — `Contour` has
 * no sampled representation and no closures (`engine/contour/model.ts` says why), and a `PathFn` or
 * a compiled evaluator lives on the RESOLUTION, never on the state. A field holding one would
 * compare equal to any other, because `JSON.stringify` drops a function silently.
 *
 * **The replacer is not decoration.** Plain `JSON.stringify` THROWS on a `ShellState` that carries a
 * branch point or a declaration: `BranchPoint.order.alpha` and `DeclarationState.window` are `Frac`s,
 * whose `n` and `d` are bigints, and `JSON.stringify` refuses a bigint rather than skipping it.
 * `test/undo.test.ts` pins that throw, so the replacer cannot be removed as tidying.
 *
 * Key ORDER is insertion order, so two objects equal in value but built in different orders read as
 * different. For the undo stack that can only ever produce an extra entry, never swallow a real one;
 * for a program key it can only ever rebuild a program that was already right.
 */
export function stableKey(v: unknown): string {
  // `?? ""` is for the type: `JSON.stringify` returns `undefined` only for `undefined` itself.
  return JSON.stringify(v, (_key, x: unknown) => (typeof x === "bigint" ? `${x}n` : x)) ?? "";
}
