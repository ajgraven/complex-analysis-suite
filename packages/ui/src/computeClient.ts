// @cas/ui — worker-offload compute client with a synchronous fallback + busy affordance.
//
// Generalizes Complex Dynamics' JuliaMetricsClient
// (apps/complex-dynamics/src/render/juliaMetricsClient.ts): post heavy work to a module worker when one
// is available, COALESCE so only the latest request paints, drop stale responses, and fall back to a
// synchronous main-thread compute when Workers are unavailable (headless, jsdom, or a load failure) so a
// result is always produced. Adds an `onBusy` hook that drives a "computing…" affordance. The newest apps
// run heavy solves synchronously with no feedback and freeze the tab (UX audit finding #4); this gives
// them the off-thread path where a worker is wired, and a spinner-friendly deferred compute where it isn't.
//
// ADOPTION NOTE: the worker path needs the app to supply `worker` + `toMessage`/`fromMessage` (the
// serialization boundary differs per app). U0 ships the fallback + coalescing + busy state; each app
// wires its own worker at adoption time.

export interface ComputeClientOptions<Req, Res> {
  /** Synchronous fallback — always required; the source of truth when no worker is wired. */
  readonly compute: (req: Req) => Res;
  /** Module-worker factory, e.g. `() => new Worker(new URL("./x.worker.ts", import.meta.url), {type:"module"})`. */
  readonly worker?: () => Worker;
  /** Request → postMessage payload; stamp `reqId` so responses can be matched. Required with `worker`. */
  readonly toMessage?: (req: Req, reqId: number) => unknown;
  /** Worker message → `{ reqId, result }`. Required with `worker`. */
  readonly fromMessage?: (data: unknown) => { reqId: number; result?: Res };
  /** Busy-state hook — called with `true` when a compute is outstanding, `false` when it settles. */
  readonly onBusy?: (busy: boolean) => void;
  /** Defer the synchronous fallback to a macrotask so the busy state can paint first (default true). */
  readonly deferSync?: boolean;
}

export interface ComputeClient<Req, Res> {
  /** Compute `req`; `cb` fires with the latest result (only the most recent request paints). */
  request(req: Req, cb: (res: Res) => void): void;
  /** Is a compute outstanding? */
  busy(): boolean;
  /** Drop any outstanding/queued request and clear busy. */
  cancel(): void;
  /** Cancel and release the worker. */
  dispose(): void;
}

/** Create a compute client that offloads to a worker when possible and falls back to a sync compute. */
export function createComputeClient<Req, Res>(
  opts: ComputeClientOptions<Req, Res>,
): ComputeClient<Req, Res> {
  const canWorker =
    typeof Worker !== "undefined" && !!opts.worker && !!opts.toMessage && !!opts.fromMessage;
  const deferSync = opts.deferSync ?? true;

  let worker: Worker | null = null;
  let reqId = 0;
  let cb: ((res: Res) => void) | null = null;
  let busyState = false;
  let inFlight = false; // a worker request is posted and awaiting its response
  let pending: Req | null = null; // latest request that arrived while a worker request was in flight
  let timer: ReturnType<typeof setTimeout> | null = null; // scheduled sync compute
  let latestReq: Req | null = null;

  const setBusy = (b: boolean): void => {
    if (b === busyState) return;
    busyState = b;
    opts.onBusy?.(b);
  };

  const postWorker = (req: Req): void => {
    reqId += 1;
    inFlight = true;
    setBusy(true);
    worker!.postMessage(opts.toMessage!(req, reqId));
  };

  const runSync = (): void => {
    timer = null;
    if (latestReq === null) return;
    const req = latestReq;
    latestReq = null;
    const res = opts.compute(req);
    setBusy(false);
    cb?.(res);
  };

  const cancel = (): void => {
    pending = null;
    latestReq = null;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    inFlight = false;
    reqId += 1; // invalidate any worker response still in flight
    setBusy(false);
  };

  if (canWorker) {
    try {
      worker = opts.worker!();
      worker.onmessage = (e: MessageEvent): void => {
        const { reqId: rid, result } = opts.fromMessage!(e.data);
        if (rid !== reqId) return; // superseded response
        inFlight = false;
        if (result !== undefined && cb) cb(result);
        if (pending !== null) {
          const next = pending;
          pending = null;
          postWorker(next);
        } else {
          setBusy(false);
        }
      };
      worker.onerror = (): void => {
        worker?.terminate();
        worker = null; // fall back to sync from here on
      };
    } catch {
      worker = null;
    }
  }

  return {
    request(req: Req, callback: (res: Res) => void): void {
      cb = callback;
      if (worker) {
        if (inFlight) {
          pending = req; // coalesce — only the latest runs next
          return;
        }
        postWorker(req);
        return;
      }
      // Synchronous fallback.
      latestReq = req;
      setBusy(true);
      if (!deferSync) {
        runSync();
        return;
      }
      if (timer === null) timer = setTimeout(runSync, 0);
    },
    busy(): boolean {
      return busyState;
    },
    cancel,
    dispose(): void {
      cancel();
      worker?.terminate();
      worker = null;
    },
  };
}
