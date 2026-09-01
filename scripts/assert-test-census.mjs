// assert-test-census.mjs — post-`vitest run` gate (review P1 #3): fail if any workspace PROJECT
// collected ZERO test files, or if the whole run's file count dropped below a floor.
//
// Why: Vitest's aggregate run stays green as long as SOME project has tests. So a project whose
// include-glob silently stops matching — files relocated in a refactor, a glob typo, or
// `passWithNoTests` — would vanish from CI with the bar still green, and a whole app could stop being
// tested unnoticed. This reads what Vitest ACTUALLY collected (its --reporter=json report: one
// `testResults` entry per collected file, `.name` = absolute path) and asserts a floor per project,
// so a silently-empty project fails the build. Mirrors the repo's existing "assertion floor" idiom
// (the QD node-test.js FLOORS).
//
// Keep PROJECTS in sync with vitest.workspace.ts. Per-project floors are 1 — the point is "not zero".
// The global floor is a loose backstop against a gross collapse, deliberately well under the current
// ~266 so routine spec add/remove never trips it.
import { readFileSync } from 'node:fs';

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error('usage: node scripts/assert-test-census.mjs <vitest-json-report>');
  process.exit(2);
}

let report;
try {
  report = JSON.parse(readFileSync(jsonPath, 'utf8'));
} catch (err) {
  console.error(`✗ test-census gate: could not read Vitest JSON report at ${jsonPath} — ${err.message}`);
  console.error('  (the `test` script writes it via `vitest run --reporter=json --outputFile=…`)');
  process.exit(1);
}

// Vitest's json reporter emits one testResults entry per collected TEST FILE (`.name` = abs path).
const files = Array.isArray(report.testResults) ? report.testResults : [];

// One entry per workspace project; `match` is a path fragment unique to that project's tree.
const PROJECTS = [
  { name: 'core', match: '/packages/core/', floor: 1 },
  { name: 'exact', match: '/packages/exact/', floor: 1 },
  { name: 'export', match: '/packages/export/', floor: 1 },
  { name: 'interchange', match: '/packages/interchange/', floor: 1 },
  { name: 'expr', match: '/packages/expr/', floor: 1 },
  { name: 'gpu', match: '/packages/gpu/', floor: 1 },
  { name: 'schwarz', match: '/packages/schwarz/', floor: 1 },
  { name: 'dynamics', match: '/packages/dynamics/', floor: 1 },
  { name: 'conformal', match: '/packages/conformal/', floor: 1 },
  { name: 'faber', match: '/packages/faber/', floor: 1 },
  { name: 'ui', match: '/packages/ui/', floor: 1 },
  { name: 'flow', match: '/packages/flow/', floor: 1 },
  { name: 'complex-dynamics', match: '/apps/complex-dynamics/', floor: 1 },
  { name: 'complex-function-plotter', match: '/apps/complex-function-plotter/', floor: 1 },
  { name: 'correspondences', match: '/apps/correspondences/', floor: 1 },
  { name: 'quadrature-domains', match: '/apps/quadrature-domains/', floor: 1 },
  { name: 'riemann-map', match: '/apps/riemann-map/', floor: 1 },
  { name: 'argument-principle', match: '/apps/argument-principle/', floor: 1 },
  { name: 'faber-transform', match: '/apps/faber-transform/', floor: 1 },
  { name: '2d-electrostatics', match: '/apps/2d-electrostatics/', floor: 1 },
  { name: 'hele-shaw-flow', match: '/apps/hele-shaw-flow/', floor: 1 },
];
const GLOBAL_FILE_FLOOR = 200;

const counts = Object.fromEntries(PROJECTS.map((p) => [p.name, 0]));
let unbucketed = 0;
for (const f of files) {
  const name = String(f.name || '').replaceAll('\\', '/');
  const proj = PROJECTS.find((p) => name.includes(p.match));
  if (proj) counts[proj.name]++;
  else unbucketed++;
}

const problems = [];
for (const p of PROJECTS) {
  if (counts[p.name] < p.floor) {
    problems.push(`project '${p.name}' collected ${counts[p.name]} test file(s), floor ${p.floor} — silently empty?`);
  }
}
if (files.length < GLOBAL_FILE_FLOOR) {
  problems.push(`total collected test files = ${files.length}, floor ${GLOBAL_FILE_FLOOR}`);
}

if (problems.length) {
  console.error('✗ test-census gate FAILED — the run collected fewer specs than required:');
  for (const p of problems) console.error('    ' + p);
  console.error(
    '\nA workspace project collecting zero files means its tests silently stopped running (moved\n' +
      'files, a broken include glob, or passWithNoTests). Restore its specs, or — if a project was\n' +
      'intentionally removed — update PROJECTS here and vitest.workspace.ts together.',
  );
  process.exit(1);
}

console.log(
  `✓ test-census: ${files.length} test files across ${PROJECTS.length} projects ` +
    `(${PROJECTS.map((p) => `${p.name}:${counts[p.name]}`).join(', ')}` +
    (unbucketed ? `, +${unbucketed} unbucketed` : '') +
    ').',
);
