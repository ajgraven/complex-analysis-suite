/** Small element-wise helpers for 2-vectors (plot coordinates / shifts). */

export type Vec2 = [number, number];

/** Add two vectors element-wise. */
export function addArrays(a: Vec2, b: Vec2): Vec2 {
  return [a[0] + b[0], a[1] + b[1]];
}

/** Subtract `b` from `a` element-wise. */
export function subtractArrays(a: Vec2, b: Vec2): Vec2 {
  return [a[0] - b[0], a[1] - b[1]];
}

/** Multiply a vector by a scalar. */
export function scaleArray(a: Vec2, m: number): Vec2 {
  return [a[0] * m, a[1] * m];
}
