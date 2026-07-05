'use strict';
// sphere.test.js — subsystem tests split from the former monolithic node-test.js (Phase 2).
// Shared kernels + harness (ok, C, T, solveInverseQD, Schwarz, PS, SC, …) are
// installed on `global` by test/bootstrap.js.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const APP_DIR = path.join(__dirname, '..');
require('./bootstrap');
module.exports = async function run() {

ok('SphereCommon: namespace exports required symbols',
   typeof SC.projectToSphere    === 'function' &&
   typeof SC.unprojectFromSphere=== 'function' &&
   typeof SC.buildSphereMesh    === 'function' &&
   typeof SC.mat4lookAt         === 'function' &&
   typeof SC.mat4perspective     === 'function' &&
   typeof SC.mat4multiply        === 'function');

// ---- projectToSphere / unprojectFromSphere roundtrip ----------------------
{
  const pts = [
    { re: 0,     im: 0     },   // origin → south pole
    { re: 1,     im: 0     },   // |w|=1, real axis
    { re: 0,     im: 1     },   // |w|=1, imag axis
    { re: 2,     im: 0     },   // outside unit disk
    { re: -1.5,  im: 0.8   },
    { re: 1e4,   im: -3e3  },   // large |w| → near north pole
  ];
  let maxErr = 0;
  for (const w of pts) {
    const p = SC.projectToSphere(w);
    const wBack = SC.unprojectFromSphere(p);
    if (!wBack) continue;  // near north pole: acceptable null
    const err = Math.hypot(wBack.re - w.re, wBack.im - w.im);
    if (err > maxErr) maxErr = err;
  }
  ok('SphereCommon: projectToSphere/unprojectFromSphere roundtrip', maxErr < 1e-10,
     'maxErr=' + maxErr.toExponential(2));
}

// ---- Specific values -------------------------------------------------------
{
  const south = SC.projectToSphere({ re: 0, im: 0 });
  ok('SphereCommon: origin → south pole (0,0,−1)',
     Math.abs(south.x) < 1e-14 && Math.abs(south.y) < 1e-14 &&
     Math.abs(south.z + 1) < 1e-14);

  // |w|=1 → equator (z=0).
  const eq1 = SC.projectToSphere({ re: 1, im: 0 });
  const eq2 = SC.projectToSphere({ re: 0, im: 1 });
  ok('SphereCommon: |w|=1 → equator z=0',
     Math.abs(eq1.z) < 1e-14 && Math.abs(eq2.z) < 1e-14);

  // |w|=2 → z = (4−1)/(4+1) = 3/5.
  const p2 = SC.projectToSphere({ re: 2, im: 0 });
  ok('SphereCommon: |w|=2 → z = 3/5',
     Math.abs(p2.z - 3/5) < 1e-14);

  // All projected points lie on the unit sphere.
  const pts = [{ re:0,im:0 }, { re:1,im:0 }, { re:3,im:-2 }, { re:-0.5,im:1.5 }];
  let allUnit = true;
  for (const w of pts) {
    const p = SC.projectToSphere(w);
    const r = Math.sqrt(p.x*p.x + p.y*p.y + p.z*p.z);
    if (Math.abs(r - 1) > 1e-14) allUnit = false;
  }
  ok('SphereCommon: projected points lie on unit sphere', allUnit);
}

// ---- unprojectFromSphere returns null near north pole ----------------------
{
  const np = { x: 0, y: 0, z: 1.0 };   // exact north pole
  const w  = SC.unprojectFromSphere(np, 1e-9);
  ok('SphereCommon: unprojectFromSphere returns null at north pole', w === null);

  // Very close but not exact north pole — also null (within eps).
  const np2 = { x: 1e-11, y: 0, z: 1 - 5e-12 };
  const w2 = SC.unprojectFromSphere(np2, 1e-9);
  ok('SphereCommon: unprojectFromSphere returns null near north pole', w2 === null);
}

// ---- 50-point random roundtrip within 1e-12 --------------------------------
{
  // Simple deterministic "random" via a seeded sequence.
  let s = 0x12345678;
  function rng() { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s >>> 0) / 0xFFFFFFFF; }
  let maxErr = 0;
  for (let i = 0; i < 50; i++) {
    const r  = rng() * 10;     // radius 0..10
    const a  = rng() * 2 * Math.PI;
    const w  = { re: r * Math.cos(a), im: r * Math.sin(a) };
    const p  = SC.projectToSphere(w);
    const w2 = SC.unprojectFromSphere(p);
    if (!w2) continue;
    const err = Math.hypot(w2.re - w.re, w2.im - w.im);
    if (err > maxErr) maxErr = err;
  }
  ok('SphereCommon: 50-point random roundtrip < 1e-12', maxErr < 1e-12,
     'maxErr=' + maxErr.toExponential(2));
}

// ---- buildSphereMesh -------------------------------------------------------
{
  const mesh = SC.buildSphereMesh(96, 48);
  const expectedVerts = 97 * 49;   // (nLon+1)*(nLat+1)
  const expectedTris  = 96 * 48 * 2;
  ok('SphereCommon: buildSphereMesh vertex count',
     mesh.nVerts === expectedVerts && mesh.positions.length === expectedVerts * 3,
     'nVerts=' + mesh.nVerts);
  ok('SphereCommon: buildSphereMesh triangle count',
     mesh.nTris === expectedTris && mesh.indices.length === expectedTris * 3,
     'nTris=' + mesh.nTris);

  // All vertex positions lie on the unit sphere.
  let allUnit = true;
  for (let i = 0; i < mesh.nVerts; i++) {
    const x = mesh.positions[3*i], y = mesh.positions[3*i+1], z = mesh.positions[3*i+2];
    const r = Math.sqrt(x*x + y*y + z*z);
    if (Math.abs(r - 1) > 1e-6) { allUnit = false; break; }
  }
  ok('SphereCommon: all mesh vertices on unit sphere', allUnit);

  // North pole at first vertex (j=0, i=0): should be (0,0,+1).
  ok('SphereCommon: mesh vertex 0 is north pole',
     Math.abs(mesh.positions[0]) < 1e-15 &&
     Math.abs(mesh.positions[1]) < 1e-15 &&
     Math.abs(mesh.positions[2] - 1) < 1e-15);

  // Indices in range [0, nVerts).
  let idxOK = true;
  for (let i = 0; i < mesh.indices.length; i++) {
    if (mesh.indices[i] >= mesh.nVerts) { idxOK = false; break; }
  }
  ok('SphereCommon: all mesh indices in valid range', idxOK);
}

// ---- mat4lookAt orthonormal frame -----------------------------------------
{
  const eye    = [2, 1, 1.5];
  const target = [0, 0, 0];
  const up     = [0, 0, 1];
  const m = SC.mat4lookAt(eye, target, up);

  // The 3 row-vectors of the rotation part (extracted from column-major m):
  // right = (m[0], m[4], m[8])
  // vup   = (m[1], m[5], m[9])
  // -fwd  = (m[2], m[6], m[10])
  const right = [m[0], m[4], m[8]];
  const vup   = [m[1], m[5], m[9]];
  const bkwd  = [m[2], m[6], m[10]];

  function dot3(a, b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
  function len3(a)    { return Math.sqrt(dot3(a,a)); }
  const eps = 1e-12;
  ok('SphereCommon: mat4lookAt right is unit',   Math.abs(len3(right) - 1) < eps);
  ok('SphereCommon: mat4lookAt vup is unit',     Math.abs(len3(vup)   - 1) < eps);
  ok('SphereCommon: mat4lookAt bkwd is unit',    Math.abs(len3(bkwd)  - 1) < eps);
  ok('SphereCommon: mat4lookAt right⊥vup',       Math.abs(dot3(right, vup))  < eps);
  ok('SphereCommon: mat4lookAt right⊥bkwd',      Math.abs(dot3(right, bkwd)) < eps);
  ok('SphereCommon: mat4lookAt vup⊥bkwd',        Math.abs(dot3(vup,   bkwd)) < eps);

  // The last row should be (0, 0, 0, 1).
  ok('SphereCommon: mat4lookAt last row = (0,0,0,1)',
     m[3] === 0 && m[7] === 0 && m[11] === 0 && m[15] === 1);
}

// ---- mat4perspective structure --------------------------------------------
{
  const fovY = Math.PI / 3;   // 60°
  const aspect = 16 / 9;
  const near = 0.1, far = 100;
  const m = SC.mat4perspective(fovY, aspect, near, far);
  const f = 1 / Math.tan(fovY / 2);
  ok('SphereCommon: mat4perspective m[0] = f/aspect',
     Math.abs(m[0] - f/aspect) < 1e-14);
  ok('SphereCommon: mat4perspective m[5] = f',
     Math.abs(m[5] - f) < 1e-14);
  ok('SphereCommon: mat4perspective m[11] = −1 (perspective divide)',
     m[11] === -1);
  ok('SphereCommon: mat4perspective m[15] = 0 (perspective divide)',
     m[15] === 0);
}

// ---- mat4invertRigid is inverse of mat4lookAt -----------------------------
{
  const eye    = [1.5, -2, 1];
  const target = [0, 0, 0];
  const up     = [0, 0, 1];
  const m   = SC.mat4lookAt(eye, target, up);
  const inv = SC.mat4invertRigid(m);
  const prod = SC.mat4multiply(m, inv);  // should ≈ identity

  let maxErr = 0;
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      const expected = (row === col) ? 1 : 0;
      const err = Math.abs(prod[col*4+row] - expected);
      if (err > maxErr) maxErr = err;
    }
  }
  ok('SphereCommon: mat4invertRigid is left-inverse of mat4lookAt',
     maxErr < 1e-12, 'maxErr=' + maxErr.toExponential(2));
}

// ===========================================================================
// Critical-set image (zeros of φ', mapped to w-plane)
// ===========================================================================
// Pulled out of QD_NS now that critical-set.js is loaded by the for-loop above.
const findCriticalPoints = QD_NS.findCriticalPoints;
const CriticalSet         = QD_NS.CriticalSet;

ok('CriticalSet: namespace exports',
   typeof findCriticalPoints === 'function' &&
   typeof CriticalSet === 'object' &&
   typeof CriticalSet._classify === 'function' &&
   typeof CriticalSet._snapKey === 'function');

// ---- _classify -------------------------------------------------------------
// Bounded family: relevant disk = 𝔻 (|z|<1).
{
  const a = CriticalSet._classify(0.5, false);
  ok('CriticalSet: bounded, |z|=0.5 → critical/inDomain',
     a.inDomain === true && a.severity === 'critical');

  const b = CriticalSet._classify(0.98, false);
  ok('CriticalSet: bounded, |z|=0.98 → near/inDomain',
     b.inDomain === true && b.severity === 'near');

  const c = CriticalSet._classify(1.02, false);
  ok('CriticalSet: bounded, |z|=1.02 → near/!inDomain',
     c.inDomain === false && c.severity === 'near');

  const d = CriticalSet._classify(2.0, false);
  ok('CriticalSet: bounded, |z|=2 → safe/!inDomain',
     d.inDomain === false && d.severity === 'safe');
}

// Unbounded family: relevant disk = 𝔻* (|z|>1).
{
  const a = CriticalSet._classify(2.0, true);
  ok('CriticalSet: unbounded, |z|=2 → critical/inDomain',
     a.inDomain === true && a.severity === 'critical');

  const b = CriticalSet._classify(1.04, true);
  ok('CriticalSet: unbounded, |z|=1.04 → near/inDomain',
     b.inDomain === true && b.severity === 'near');

  const c = CriticalSet._classify(0.5, true);
  ok('CriticalSet: unbounded, |z|=0.5 → safe/!inDomain',
     c.inDomain === false && c.severity === 'safe');
}

// ---- _snapKey ---------------------------------------------------------------
{
  const k1 = CriticalSet._snapKey({ re: 0.123451, im: -0.456701 });
  const k2 = CriticalSet._snapKey({ re: 0.123452, im: -0.456702 });
  ok('CriticalSet: snapKey clusters near-identical z values',
     k1 === k2, 'k1=' + k1 + ', k2=' + k2);
  const k3 = CriticalSet._snapKey({ re: 0.124,    im: -0.4567   });
  ok('CriticalSet: snapKey separates distinguishable z values',
     k1 !== k3);
}

// ---- Disk: φ(z) = R·z + c  →  φ'(z) = R, no critical points ---------------
{
  const R = 1.4, c = { re: 0.2, im: -0.1 };
  const phi = {
    family: 'boundedQD',
    w0: c, unbounded: false,
    branches: [{ z: {re:0,im:0}, A: [{re:R,im:0}] }],
  };
  const cs = findCriticalPoints(phi);
  ok('CriticalSet: disk φ(z)=R·z+c has zero critical points  — found ' + cs.points.length,
     cs.points.length === 0);
}

// ---- Cardioid: φ(z) = c + R·(z + z²/2)  →  φ'(z) = R(1+z), root z=-1 ------
{
  const R = 1.0, c = { re: 0, im: 0 };
  const phi = {
    family: 'boundedQD',
    w0: c, unbounded: false,
    branches: [{ z: {re:0,im:0}, A: [{re:R,im:0}, {re:R/2,im:0}] }],
  };
  const cs = findCriticalPoints(phi);
  ok('CriticalSet: cardioid finds the z=-1 critical point  — got ' + cs.points.length,
     cs.points.length >= 1 && cs.points.length <= 3);   // ≤3 allows alias roots near ∞
  // The "near" root corresponds to z=-1 (cardioid cusp).
  let foundNeg1 = false;
  for (const p of cs.points) {
    if (Math.abs(p.z.re + 1) < 1e-5 && Math.abs(p.z.im) < 1e-5) {
      foundNeg1 = true;
      ok('CriticalSet: cardioid z=-1 classified as "near"', p.severity === 'near');
      // φ(-1) = R·(-1 + 1/2) = -R/2.
      ok('CriticalSet: cardioid w-image equals φ(-1) = -R/2',
         Math.abs(p.w.re + R/2) < 1e-8 && Math.abs(p.w.im) < 1e-8,
         'w = (' + p.w.re.toFixed(6) + ', ' + p.w.im.toFixed(6) + ')');
    }
  }
  ok('CriticalSet: cardioid contains a z = -1 root', foundNeg1);
}

// ---- Off-domain critical point: φ(z) = z + (1/3)·z² → φ' = 1 + (2/3)z, ----
// ---- root z = -3/2 → outside 𝔻, severity 'safe' ---------------------------
{
  const phi = {
    family: 'boundedQD',
    w0: {re:0,im:0}, unbounded: false,
    branches: [{ z: {re:0,im:0}, A: [{re:1,im:0}, {re:1/3,im:0}] }],
  };
  const cs = findCriticalPoints(phi);
  // φ'(z) = 1 + (2/3)z → single critical point at z = -3/2.
  let foundOutside = false;
  for (const p of cs.points) {
    if (Math.abs(p.z.re + 1.5) < 1e-5 && Math.abs(p.z.im) < 1e-5) {
      foundOutside = true;
      ok('CriticalSet: z=-3/2 is outside 𝔻', !p.inDomain);
      ok('CriticalSet: z=-3/2 is classified "safe"', p.severity === 'safe');
    }
  }
  ok('CriticalSet: φ(z)=z+z²/3 contains a z=-3/2 root', foundOutside);
}

// ---- Deduplication: many seeds converging to the same root produce one ----
{
  const phi = {
    family: 'boundedQD',
    w0: {re:0,im:0}, unbounded: false,
    branches: [{ z: {re:0,im:0}, A: [{re:1,im:0}, {re:0.5,im:0}] }],
  };
  // Cardioid again — should produce at most a small handful of unique roots
  // even though the default seed grid is ~150 points.
  const cs = findCriticalPoints(phi);
  ok('CriticalSet: dedup keeps unique count small  — nUnique=' + cs.stats.nUnique +
     ', nConverged=' + cs.stats.nConverged + ' of ' + cs.stats.nSeeds + ' seeds',
     cs.stats.nUnique <= 5);
}

// ---- Robustness: empty / null phi ------------------------------------------
{
  const r1 = findCriticalPoints(null);
  ok('CriticalSet: null phi → empty result',
     r1.points.length === 0 && r1.stats.nUnique === 0);
}

// ---- Unbounded family smoke (use the solver to get a real phi) -----------
{
  // Simple unbounded map φ(z) = c·z + F_1/z (analog of Joukowski).
  // φ'(z) = c - F_1/z², critical points at z² = F_1/c → for c=1, F_1=1
  // → z = ±1, both on the unit circle ⇒ both 'near'.
  // In the unboundedQD storage convention: polyA[0] is the constant term and
  // polyA[l] (l ≥ 1) is the coefficient of 1/z^l, so we want polyA = [0, 1].
  const phi = {
    family: 'unboundedQD',
    unbounded: true,
    c: 1.0,
    polyA: [{ re: 0.0, im: 0.0 }, { re: 1.0, im: 0.0 }],
    branches: [],
  };
  const cs = findCriticalPoints(phi);
  let foundPlus1 = false, foundNeg1 = false;
  for (const p of cs.points) {
    if (Math.abs(p.z.re - 1) < 1e-5 && Math.abs(p.z.im) < 1e-5) {
      foundPlus1 = true;
      ok('CriticalSet: unbounded z=+1 classified "near"', p.severity === 'near');
    }
    if (Math.abs(p.z.re + 1) < 1e-5 && Math.abs(p.z.im) < 1e-5) {
      foundNeg1 = true;
      ok('CriticalSet: unbounded z=-1 classified "near"', p.severity === 'near');
    }
  }
  ok('CriticalSet: unbounded c·z + 1/z finds z=+1', foundPlus1);
  ok('CriticalSet: unbounded c·z + 1/z finds z=-1', foundNeg1);
}

// =============================================================================
};
