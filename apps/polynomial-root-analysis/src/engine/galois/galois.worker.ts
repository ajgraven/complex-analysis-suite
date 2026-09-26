// The Galois evidence, off the main thread (DESIGN §6). Evidence only: certificates are made by
// engine/certify.ts on the main thread, so no label is ever minted here.
import { galoisEvidence, type GaloisRequest } from "./tier0.js";

interface Incoming {
  readonly reqId: number;
  readonly request: GaloisRequest;
}

self.onmessage = (event: MessageEvent<Incoming>): void => {
  const { reqId, request } = event.data;
  try {
    (self as unknown as Worker).postMessage({ reqId, evidence: galoisEvidence(request) });
  } catch (err) {
    (self as unknown as Worker).postMessage({
      reqId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
