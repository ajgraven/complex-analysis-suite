#!/usr/bin/env node
// =============================================================================
// gen-cache-version.js -- derive asset-manifest.js's CACHE_HASH from a content
// hash of every served asset, so the release/cache version can never go stale
// after an `app/` change (the version bump used to be hand-authored and was
// repeatedly mis-bumped). Zero deps; no build step required to RUN the app —
// this only guards/refreshes the committed hash.
//
// Usage:
//   node scripts/gen-cache-version.js            # print the computed hash
//   node scripts/gen-cache-version.js --write     # rewrite the CACHE_HASH line
//   node scripts/gen-cache-version.js --check      # exit 1 if committed is stale
//
// Hash input = every file in QD_ASSET_MANIFEST.ALL_ASSETS (which now includes
// asset-manifest.js + all PAGE_SCRIPTS + static assets) plus sw.js, in a
// deterministic order, keyed by relative path. asset-manifest.js is read with
// its CACHE_HASH line blanked so the hash never depends on itself.
// =============================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const APP_DIR = path.join(__dirname, '..', 'app');
const MANIFEST_PATH = path.join(APP_DIR, 'asset-manifest.js');
const HASH_LEN = 10;
// Matches `const CACHE_HASH = '....';` capturing the quoted value.
const HASH_LINE_RE = /(const\s+CACHE_HASH\s*=\s*')([^']*)(')/;

function readManifestSource() {
  return fs.readFileSync(MANIFEST_PATH, 'utf8');
}

// Evaluate the manifest in a throwaway context to read its asset lists.
function loadManifest(src) {
  const sandbox = { self: {} };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'asset-manifest.js' });
  if (!sandbox.self.QD_ASSET_MANIFEST) {
    throw new Error('gen-cache-version: asset-manifest.js did not define QD_ASSET_MANIFEST');
  }
  return sandbox.self.QD_ASSET_MANIFEST;
}

function computeHash() {
  const manifestSrc = readManifestSource();
  const m = loadManifest(manifestSrc);

  // Deterministic file set: ALL_ASSETS (manifest order) + sw.js, de-duped.
  const rel = [];
  const seen = new Set();
  for (const f of [...m.ALL_ASSETS, 'sw.js']) {
    if (!seen.has(f)) { seen.add(f); rel.push(f); }
  }

  const hash = crypto.createHash('sha256');
  for (const f of rel) {
    const abs = path.join(APP_DIR, f);
    let bytes;
    if (f === 'asset-manifest.js') {
      // Blank the hash value so the digest never depends on itself.
      bytes = Buffer.from(manifestSrc.replace(HASH_LINE_RE, '$1$3'), 'utf8');
    } else {
      bytes = fs.readFileSync(abs);
    }
    hash.update(f, 'utf8');
    hash.update('\0');
    hash.update(bytes);
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, HASH_LEN);
}

function committedHash() {
  const mm = HASH_LINE_RE.exec(readManifestSource());
  return mm ? mm[2] : null;
}

function main() {
  const mode = process.argv.includes('--write') ? 'write'
             : process.argv.includes('--check') ? 'check'
             : 'print';
  const computed = computeHash();

  if (mode === 'print') {
    console.log(computed);
    return;
  }
  if (mode === 'write') {
    const src = readManifestSource();
    const next = src.replace(HASH_LINE_RE, `$1${computed}$3`);
    if (next === src) {
      console.log('cache hash already current: ' + computed);
    } else {
      fs.writeFileSync(MANIFEST_PATH, next);
      console.log('cache hash updated -> ' + computed);
    }
    return;
  }
  // check
  const committed = committedHash();
  if (committed === computed) {
    console.log('cache hash up to date: ' + computed);
    process.exit(0);
  }
  console.error(
    'STALE cache hash in app/asset-manifest.js:\n' +
    '  committed: ' + committed + '\n' +
    '  expected:  ' + computed + '\n' +
    'An app/ asset changed without refreshing the cache version. Run:\n' +
    '  npm run version:sync\n' +
    'then commit the updated asset-manifest.js.');
  process.exit(1);
}

main();
