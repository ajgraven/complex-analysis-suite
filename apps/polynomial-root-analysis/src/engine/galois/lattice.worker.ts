// The Galois correspondence, off the main thread (PRA-6): asked for only when the reader opens it, since
// the full lattice of S₅ (156 subgroups, 19 classes, their fixed fields) costs about half a second.
import { latticeFor, type LatticeRequest } from "./correspondence.js";

interface Incoming {
  readonly reqId: number;
  readonly request: LatticeRequest;
}

self.onmessage = (event: MessageEvent<Incoming>): void => {
  const { reqId, request } = event.data;
  try {
    (self as unknown as Worker).postMessage({ reqId, lattice: latticeFor(request) });
  } catch (err) {
    (self as unknown as Worker).postMessage({
      reqId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
