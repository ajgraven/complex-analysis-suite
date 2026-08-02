// algebra-op-runner.mjs -- the single-flight op-runner for installAlgebra's ~25 off-main-thread
// (worker) ops (QD-ALG-4). Carved out of installAlgebra (algebra-ui.mjs) in refactor Phase 3 · D1d
// (seam 1) as a ctx-injected factory. BEHAVIOR-PRESERVING: every method's body is the code that used
// to sit inline in the installAlgebra closure, verbatim. The busy lifecycle + single-flight guard it
// owns are pinned by vitest/algebra-op-runner.test.ts (the D1b behavioural net); the undo/redo
// affordance's read of this busy state is pinned by vitest/algebra-tier6.test.ts.
//
// It OWNS the two pieces of in-flight state that were installAlgebra closure locals:
//   _abort — the AbortController of the op currently in flight (null when idle). The single-flight
//            guards read it (isBusy / guard); Cancel aborts it (cancel).
//   _busy  — the boolean setBusy last wrote. The undo/redo + status-bar refreshers read it (busyFlag)
//            so they stay honest across the busy window and never re-enable Undo mid-op.
// The pair is coupled but written independently in the source (setBusy writes _busy; begin/end write
// _abort) and different consumers read different halves, so both are exposed faithfully — isBusy()
// (reads _abort) and busyFlag() (reads _busy) — rather than collapsed into one predicate.
//
// ctx — dependency-injected so the module needs neither the algebra DOM root nor the solver import:
//   $            (sel) => Element|null   the algebra-root-scoped selector (#alg-palette / #alg-cancel / #algebra-graph)
//   setStatus    (text) => void          write the status line
//   toast        (msg, opts) => void      user feedback (guard()'s "Busy — wait…")
//   cancelWorker () => void              cancel the backing worker (QD.SymWorker.cancel) — external to this module
export function createOpRunner(ctx) {
  const $ = ctx.$;
  const setStatus = ctx.setStatus;
  const toast = ctx.toast;
  const cancelWorker = ctx.cancelWorker || function () { /* no worker to cancel */ };

  let _abort = null;
  let _busy = false;

  // Busy-state manager for the off-main-thread (worker) ops — disables the heavy
  // controls AND the graph-mutating controls (undo/redo, reductions, palette) so a
  // mutation can't land mid-op and orphan an in-flight derivation (A5), reveals
  // Cancel, and routes progress to the status line.
  function setBusy(on, label) {
    _busy = !!on;
    // Marked with `js-busy-lock` AT the control, not listed here. This was a hand-maintained
    // array of 30 ids sitting ~700 lines from the buttons it named (finding 5.9, "will
    // drift") — and it had drifted: `alg-seed-moment` and `alg-w0-fix` both RE-SEED, and
    // neither was in the array nor self-guarded, so either could drop a fresh system on top
    // of an in-flight worker derivation. That is precisely what this lock exists to prevent.
    // The marker now sits in the markup beside the control, where it is visible to whoever
    // adds one. (It does not make remembering unnecessary — it puts the reminder in view.)
    document.querySelectorAll('.js-busy-lock').forEach((b) => { b.disabled = on; });
    const pal = $('#alg-palette'); if (pal) pal.querySelectorAll('button').forEach((b) => { b.disabled = on; });
    const cancel = $('#alg-cancel'); if (cancel) cancel.classList.toggle('hidden', !on);
    // Q2 — a busy state on the CANVAS surface too (not just the sidebar): the result lands here, so the
    // graph dimming + spinner is where the eye is during a multi-second op, and it reads as "working"
    // rather than "did my click register?". CSS draws the overlay from the .is-busy class + data-busy label.
    const graph = $('#algebra-graph');
    if (graph) { graph.classList.toggle('is-busy', on); if (on && label) graph.setAttribute('data-busy', label); else graph.removeAttribute('data-busy'); }
    if (on && label) setStatus(label);
  }
  function _newAbort() { return (typeof AbortController !== 'undefined') ? new AbortController() : null; }

  // The single-flight busy lifecycle, factored out of the async ops (QD-ALG-4, D1b): begin arms a
  // fresh abort controller as THE in-flight op (guard / isBusy read it) and shows the busy label; end
  // disarms it and restores the idle status. The ~19 standard ops route their _abort/busy lifecycle
  // through begin()/end(). `end({ keepStatus: true })` disarms + releases the lock but LEAVES the
  // status line standing — for the ops that write their own terminal status per result branch
  // (doGroebner, doAutoSolve), which must not flash the idle baseline between op-end and result.
  function begin(label) { const ctrl = _newAbort(); _abort = ctrl; setBusy(true, label); return ctrl; }
  function end(opts) { _abort = null; setBusy(false); if (!(opts && opts.keepStatus)) setStatus(''); }

  // Guard a graph-mutating action so it can't land while a worker op is in flight. The
  // inspector's action buttons (Duplicate / Delete / Attempt-to-factor / factor cases)
  // are rebuilt on every selection, so they can't be reached by setBusy's id list (A5) —
  // they call this instead. Returns true (and warns) when an op is running.
  function guard() {
    if (_abort) { toast('Busy — wait for the current computation to finish (or Cancel).', { kind: 'error' }); return true; }
    return false;
  }
  function cancel() { if (_abort) { try { _abort.abort(); } catch (e) { /* ignore */ } } cancelWorker(); }

  return {
    begin,
    end,
    guard,
    cancel,
    isBusy: function () { return !!_abort; },   // reads _abort — the in-flight guard predicate (was `if (_abort)`)
    busyFlag: function () { return _busy; },    // reads _busy — the setBusy boolean (undo/redo + status-bar refreshers)
  };
}
