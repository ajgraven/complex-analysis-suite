// Named starting configurations — the classic potential-flow constructions, so the sandbox opens onto
// something recognisable and the ground-truth cases are one click away. Each is pure data (no ids); the
// caller assigns fresh singularity ids when it loads one.
//   • Rankine half-body / oval — a uniform stream + a source (+ a balancing sink): the body is the
//     ψ = const streamline that closes around the source(s).
//   • Cylinder in a stream — uniform U + a doublet μ = U·a²; the circle |z| = a is a streamline
//     (W = U(z + a²/z)). Adding a vortex gives circulation, whose stagnation points coalesce at the
//     top at Γ = 4πUa (the documented ground-truth check).
import type { Complex, Singularity } from "./field.js";
import { uniformFromSpeedAngle } from "./field.js";
import type { View } from "./view.js";

export interface Preset {
  readonly id: string;
  readonly name: string;
  readonly uniform: Complex;
  readonly sings: readonly Singularity[];
  readonly view: View;
}

const V: View = { center: [0, 0], halfSpan: 3 };

export const PRESETS: readonly Preset[] = [
  {
    id: "demo",
    name: "Demo — source · vortex · doublet",
    uniform: uniformFromSpeedAngle(0.6, 0),
    sings: [
      { kind: "monopole", at: [-1.2, 0], c: [1, 0] },
      { kind: "monopole", at: [1.2, 0], c: [0, 1] },
      { kind: "doublet", at: [0, 1.1], mu: [0.4, 0] },
    ],
    view: V,
  },
  {
    id: "rankine-half",
    name: "Rankine half-body",
    uniform: uniformFromSpeedAngle(1, 0),
    sings: [{ kind: "monopole", at: [0, 0], c: [1.5, 0] }],
    view: V,
  },
  {
    id: "rankine-oval",
    name: "Rankine oval",
    uniform: uniformFromSpeedAngle(1, 0),
    sings: [
      { kind: "monopole", at: [-0.9, 0], c: [1.5, 0] },
      { kind: "monopole", at: [0.9, 0], c: [-1.5, 0] },
    ],
    view: V,
  },
  {
    id: "cylinder",
    name: "Cylinder in a stream",
    uniform: uniformFromSpeedAngle(1, 0),
    sings: [{ kind: "doublet", at: [0, 0], mu: [1, 0] }], // μ = U·a² with U = 1, a = 1
    view: V,
  },
  {
    id: "cylinder-circ",
    name: "Cylinder + circulation",
    uniform: uniformFromSpeedAngle(1, 0),
    sings: [
      { kind: "doublet", at: [0, 0], mu: [1, 0] },
      { kind: "monopole", at: [0, 0], c: [0, -1.2] }, // a vortex for lift
    ],
    view: V,
  },
  { id: "clear", name: "Empty field", uniform: [0, 0], sings: [], view: V },
];

export function presetById(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
