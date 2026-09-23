// The deep walk, off the main thread.
//
// It is one call per frame rather than a pool: the walk is a single depth-first traversal at one point
// and there is nothing to chunk. `@cas/ui`'s `createComputeClient` supplies the coalescing (only the
// latest view paints), the busy state, and the synchronous fallback for a browser without workers —
// which is also how the node tests reach it.
import { packFrame, runReference } from "./reference.js";
import type { ReferenceRequest } from "./reference.js";

interface Incoming {
  readonly reqId: number;
  readonly request: ReferenceRequest;
}

self.onmessage = (event: MessageEvent<Incoming>): void => {
  const { reqId, request } = event.data;
  try {
    const frame = packFrame(runReference(request));
    // The typed arrays are transferred: a deep frame is hundreds of kilobytes and copying it would
    // undo the point of computing it off the thread.
    (self as unknown as Worker).postMessage({ reqId, frame }, [
      frame.points.buffer,
      frame.digits.buffer,
      frame.starts.buffer,
    ]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ reqId, error: err instanceof Error ? err.message : String(err) });
  }
};
