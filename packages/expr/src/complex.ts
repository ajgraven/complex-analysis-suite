/**
 * The complex-number type used throughout the expression compiler: a `[re, im]` tuple. This is
 * @cas/expr's sole formerly-external dependency (previously imported from the Complex Dynamics
 * app's `src/complex.ts`); defining it here makes the package self-contained. Structurally it is
 * the same tuple the app (and @cas/core's ComplexTuple) use, so values interoperate without
 * conversion.
 */
export type Complex = [re: number, im: number];
