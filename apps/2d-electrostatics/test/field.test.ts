import { describe, it, expect } from "vitest";
import {
  fieldE,
  potential,
  velocity,
  uniformFromSpeedAngle,
  type Complex,
  type Field,
} from "../src/field.js";

// Ground-truth checks for the closed-form complex potential / field (M0). Each is an exact identity
// from the paper's dictionary, so the tolerances are tight — these pin the JS twin that the GPU
// shader is later parity-checked against.

const cabs = (z: Complex): number => Math.hypot(z[0], z[1]);
const cross = (a: Complex, b: Complex): number => a[0] * b[1] - a[1] * b[0]; // parallel ⇒ 0
const dot = (a: Complex, b: Complex): number => a[0] * b[0] + a[1] * b[1]; // perpendicular ⇒ 0
const wrap = (t: number): number => Math.atan2(Math.sin(t), Math.cos(t));

describe("uniform stream", () => {
  it("E is the constant U·e^{−iα} everywhere", () => {
    const U = 1.3;
    const alpha = 0.7;
    const field: Field = { uniform: uniformFromSpeedAngle(U, alpha), singularities: [] };
    for (const z of [
      [0, 0],
      [2, -1],
      [-3, 4],
    ] as Complex[]) {
      const e = fieldE(field, z);
      expect(e[0]).toBeCloseTo(U * Math.cos(alpha), 12);
      expect(e[1]).toBeCloseTo(-U * Math.sin(alpha), 12);
    }
  });
});

describe("point charge (source)", () => {
  const q = 1.5;
  const a: Complex = [0.3, -0.4];
  const field: Field = { uniform: [0, 0], singularities: [{ kind: "monopole", at: a, c: [q, 0] }] };

  it("E = q/(z−a): magnitude q/|z−a|, and the velocity points radially outward", () => {
    const z: Complex = [2, 1];
    const d: Complex = [z[0] - a[0], z[1] - a[1]];
    const e = fieldE(field, z);
    expect(cabs(e)).toBeCloseTo(q / cabs(d), 12);
    // v = conj(E) = q·(z−a)/|z−a|² is parallel to (z−a) for a source (outflow).
    const v = velocity(field, z);
    expect(cross(v, d)).toBeCloseTo(0, 12);
    expect(dot(v, d)).toBeGreaterThan(0);
  });

  it("φ = Re W = q·log|z−a|", () => {
    const z: Complex = [1.7, 0.9];
    const d = Math.hypot(z[0] - a[0], z[1] - a[1]);
    expect(potential(field, z)[0]).toBeCloseTo(q * Math.log(d), 12);
  });
});

describe("point vortex", () => {
  const gamma = 0.8;
  const a: Complex = [-0.5, 0.2];
  const field: Field = { uniform: [0, 0], singularities: [{ kind: "monopole", at: a, c: [0, gamma] }] };

  it("velocity is perpendicular to (z−a) — purely circular flow", () => {
    for (const z of [
      [1, 1],
      [-2, 0.5],
      [0.3, -1.4],
    ] as Complex[]) {
      const d: Complex = [z[0] - a[0], z[1] - a[1]];
      const v = velocity(field, z);
      expect(dot(v, d)).toBeCloseTo(0, 12);
      expect(cabs(v)).toBeCloseTo(gamma / cabs(d), 12);
    }
  });
});

describe("doublet", () => {
  it("E = −μ/(z−a)²", () => {
    const a: Complex = [0, 0];
    const mu: Complex = [0.7, -0.2];
    const field: Field = { uniform: [0, 0], singularities: [{ kind: "doublet", at: a, mu }] };
    const z: Complex = [1.1, 0.6];
    // closed form −μ/(z−a)²
    const dx = z[0];
    const dy = z[1];
    const d2re = dx * dx - dy * dy;
    const d2im = 2 * dx * dy;
    const den = d2re * d2re + d2im * d2im;
    const expRe = -(mu[0] * d2re + mu[1] * d2im) / den;
    const expIm = -(mu[1] * d2re - mu[0] * d2im) / den;
    const e = fieldE(field, z);
    expect(e[0]).toBeCloseTo(expRe, 12);
    expect(e[1]).toBeCloseTo(expIm, 12);
  });
});

describe("superposition is linear", () => {
  it("E of a combined field equals the sum of the parts", () => {
    const a: Complex = [1, 0];
    const b: Complex = [-1, 0.5];
    const s1: Field = { uniform: [0, 0], singularities: [{ kind: "monopole", at: a, c: [1, 0] }] };
    const s2: Field = { uniform: [0.2, 0], singularities: [{ kind: "monopole", at: b, c: [0, 1] }] };
    const both: Field = {
      uniform: s2.uniform,
      singularities: [...s1.singularities, ...s2.singularities],
    };
    const z: Complex = [0.4, 0.9];
    const e1 = fieldE(s1, z);
    const e2 = fieldE(s2, z);
    const e = fieldE(both, z);
    expect(e[0]).toBeCloseTo(e1[0] + e2[0], 12);
    expect(e[1]).toBeCloseTo(e1[1] + e2[1], 12);
  });
});

describe("charge + vortex: logarithmic-spiral pitch (paper §1.7)", () => {
  it("the velocity makes a constant angle −arg(c) with the radial direction; pitch = arctan(γ/q)", () => {
    const q = 1.0;
    const gamma = 0.6;
    const a: Complex = [0.1, -0.2];
    const field: Field = {
      uniform: [0, 0],
      singularities: [{ kind: "monopole", at: a, c: [q, gamma] }],
    };
    const expectedOffset = -Math.atan2(gamma, q); // arg(v) − θ, constant around the singularity
    const pitch = Math.atan2(gamma, q); // deviation of the streamline from radial
    const r = 1.4;
    for (let k = 0; k < 8; k++) {
      const theta = (k / 8) * 2 * Math.PI;
      const z: Complex = [a[0] + r * Math.cos(theta), a[1] + r * Math.sin(theta)];
      const v = velocity(field, z);
      expect(wrap(Math.atan2(v[1], v[0]) - theta - expectedOffset)).toBeCloseTo(0, 10);
    }
    expect(pitch).toBeCloseTo(Math.atan(gamma / q), 12);
  });
});
