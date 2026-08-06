// worker-crash-detail.mjs -- one-line detail formatter for a worker-level `error` event, shared by
// the QD worker-lane wrappers (QD-UI-1 / refactor C1b).
//
// A worker-level ErrorEvent carries { message, filename, lineno } (all optional — a bundle-load
// failure may populate none). Every lane wrapper (primary-solver / sym / schwarz / param-slice-pool)
// rendered the same "<message> @ <filename>:<lineno>" string from its OWN copy; drift here is exactly
// the QD-UI-1 duplication class. This is the one primitive all four genuinely share — the surrounding
// settle/teardown is legitimately per-lane (reject a Promise / call an onError callback / pool-survivor),
// which is why the C1a `createWorkerLane` collapse stopped at the three PSW lanes and did NOT swallow
// these. Behaviour-identical: for any truthy event the output equals every prior copy — `(ev.message ||
// ev)` and `((e && e.message) || e)` both reduce to `(ev && ev.message || ev)`.
export function formatWorkerErrorDetail(ev) {
  return (ev && ev.message || ev) + ' @ ' + (ev && ev.filename || 'bundle') + ':' + (ev && ev.lineno || '?');
}
