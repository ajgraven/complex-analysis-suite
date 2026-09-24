// The `#vs=` permalink (DESIGN §7): `@cas/interchange`'s envelope under the namespace "pra".
//
// Semantics, not samples: the polynomial travels as the ONE form that is its truth — exact text in ℚ
// mode or when typed, else the roots or the coefficients as numbers (a JSON number round-trips a
// double exactly). A link that cannot be honoured is refused BY NAME rather than opened as something
// else: `null` means "no link", a string means "a link, and why it cannot be opened".
import { decodeViewState, encodeViewState } from "@cas/interchange";
import { MAX_DEGREE, type Cx, type Ring } from "../engine/polynomial.js";
import {
  DEFAULT_STATE,
  buildPolynomial,
  type Cam,
  type PolySpec,
  type ShellState,
} from "./state.js";

export const NAMESPACE = "pra";

interface Wire {
  r: Ring;
  t?: string;
  c?: number[];
  z?: number[];
  l?: [number, number];
  d: 0 | 1;
  o: 0 | 1;
  /** Added at PRA-2; a PRA-1 link carries none of these and opens on the defaults. */
  cr?: 0 | 1;
  j?: number | null;
  tr?: 0 | 1;
  pz?: number | null;
  rc: [number, number, number];
  cc: [number, number, number];
  [k: string]: unknown;
}

const flat = (xs: readonly Cx[]): number[] => xs.flatMap(([a, b]) => [a, b]);
const cam = (c: Cam): [number, number, number] => [c.cx, c.cy, c.half];

export function encodeShell(s: ShellState): string {
  const w: Wire = {
    r: s.ring,
    d: s.discs ? 1 : 0,
    o: s.overlay ? 1 : 0,
    cr: s.critical ? 1 : 0,
    j: s.coefficient,
    tr: s.trails ? 1 : 0,
    pz: s.pseudozero,
    rc: cam(s.rootCam),
    cc: cam(s.coeffCam),
  };
  if (s.poly.kind === "text") w.t = s.poly.text;
  else if (s.poly.kind === "coeffs") w.c = flat(s.poly.coeffs);
  else {
    w.z = flat(s.poly.roots);
    w.l = [s.poly.lead[0], s.poly.lead[1]];
  }
  return encodeViewState(NAMESPACE, w);
}

export type Decoded =
  | { readonly ok: true; readonly state: ShellState }
  | { readonly ok: false; readonly reason: string };

const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

function pairs(xs: unknown, what: string): Cx[] | string {
  if (!Array.isArray(xs) || xs.length % 2 !== 0 || !xs.every(finite))
    return `the ${what} are not a list of finite number pairs`;
  const out: Cx[] = [];
  for (let i = 0; i < xs.length; i += 2) out.push([xs[i] as number, xs[i + 1] as number]);
  return out;
}

function camOf(x: unknown, what: string): Cam | string {
  if (!Array.isArray(x) || x.length !== 3 || !x.every(finite) || !((x[2] as number) > 0))
    return `the ${what} camera is not three finite numbers with a positive size`;
  return { cx: x[0] as number, cy: x[1] as number, half: x[2] as number };
}

/** Decode a hash: `null` for no link, a refusal by name for a link this app cannot honour. */
export function decodeShell(hash: string): Decoded | null {
  if (!/(?:[#&?]|^)vs=/.test(hash)) return null;
  const env = decodeViewState<Record<string, unknown>>(hash);
  if (env === null) return { ok: false, reason: "the link is truncated or malformed" };
  if (env.app !== NAMESPACE)
    return { ok: false, reason: `the link belongs to another app ('${env.app}')` };
  const w = env.state;
  const ring = w.r;
  if (ring !== "C" && ring !== "R" && ring !== "Q")
    return { ok: false, reason: `unknown coefficient ring '${String(ring)}'` };
  let poly: PolySpec;
  if (typeof w.t === "string") poly = { kind: "text", text: w.t };
  else if (w.c !== undefined) {
    const c = pairs(w.c, "coefficients");
    if (typeof c === "string") return { ok: false, reason: c };
    poly = { kind: "coeffs", coeffs: c };
  } else if (w.z !== undefined) {
    const z = pairs(w.z, "roots");
    if (typeof z === "string") return { ok: false, reason: z };
    const l = pairs(w.l, "leading coefficient");
    if (typeof l === "string" || l.length !== 1)
      return { ok: false, reason: "the leading coefficient is missing" };
    poly = { kind: "roots", roots: z, lead: l[0] };
  } else return { ok: false, reason: "the link carries no polynomial" };
  if (
    poly.kind !== "text" &&
    (poly.kind === "coeffs" ? poly.coeffs.length - 1 : poly.roots.length) > MAX_DEGREE
  ) {
    return {
      ok: false,
      reason: `the polynomial's degree is over this app's cap of ${MAX_DEGREE}`,
    };
  }
  const rc = camOf(w.rc, "root");
  if (typeof rc === "string") return { ok: false, reason: rc };
  const cc = camOf(w.cc, "coefficient");
  if (typeof cc === "string") return { ok: false, reason: cc };
  const j = w.j === undefined ? DEFAULT_STATE.coefficient : w.j;
  if (
    j !== null &&
    (typeof j !== "number" || !Number.isInteger(j) || j < 0 || j > MAX_DEGREE)
  ) {
    return { ok: false, reason: `'${String(j)}' does not name a coefficient` };
  }
  const pz = w.pz === undefined ? DEFAULT_STATE.pseudozero : w.pz;
  if (pz !== null && (!finite(pz) || pz < -17 || pz > 0)) {
    return {
      ok: false,
      reason: `the pseudozero level ε = 10^${String(pz)} is outside 10⁻¹⁷ … 1`,
    };
  }
  const state: ShellState = {
    ring,
    poly,
    discs: w.d !== 0,
    overlay: w.o === 1,
    critical: w.cr === undefined ? DEFAULT_STATE.critical : w.cr !== 0,
    coefficient: j as number | null,
    trails: w.tr === 1,
    pseudozero: pz as number | null,
    rootCam: rc,
    coeffCam: cc,
  };
  // A link naming a polynomial this app would refuse is refused here, with the same reason.
  const built = buildPolynomial(state);
  if (!built.ok) return { ok: false, reason: built.reason };
  if (j !== null && j > built.poly.degree) {
    return {
      ok: false,
      reason: `the link selects a${j} of a degree-${built.poly.degree} polynomial`,
    };
  }
  return { ok: true, state };
}
