// protocol.mjs -- typed message envelope + worker-side dispatch for the QD solver workers
// (QD-UI-4 / refactor C2).
//
// The worker lanes speak a tiny request/reply protocol over postMessage: the main thread posts
// `{ kind, jobId, ...args }`; the worker replies `{ kind, jobId, result }` on success or
// `{ kind, jobId, error }` on failure, echoing the request's kind + jobId so the caller's
// kind-and-jobId-filtered listener matches its own reply. Every entry hand-rolled that envelope
// (~a dozen postMessage sites) AND its own kind-dispatch `if / else if` chain — and the chain had no
// `else`, so a kind no handler recognized was silently dropped and the caller's promise hung forever.
//
// This centralizes the envelope (`reply` / `replyError`) and the dispatch, and closes the silent-hang:
// an unhandled kind now replies with an error envelope (echoing the request kind) instead of nothing,
// so the caller settles (rejects) rather than spinning.

// `{ kind, jobId, result }` -- the success reply.
export function reply(kind, jobId, result) {
  return { kind, jobId, result };
}

// `{ kind, jobId, error }` -- the failure reply. `error` is always a string (the stack when available),
// matching what every entry posted by hand: `String((err && err.stack) || err)`.
export function replyError(kind, jobId, err) {
  return { kind, jobId, error: String((err && err.stack) || err) };
}

// Worker-side dispatch. `handlers` maps kind -> (msg) => result; a handler just returns its result (or
// throws), and dispatch owns the envelope + the try/catch. `post` is the worker's postMessage. A falsy
// message is ignored (matches the entries' `if (!msg) return`); an unhandled kind replies with an error
// envelope (the QD-UI-4 fix) rather than being dropped.
export function dispatch(msg, handlers, post) {
  if (!msg) return;
  const handler = handlers[msg.kind];
  if (!handler) {
    post(replyError(msg.kind, msg.jobId, 'unhandled worker message kind: ' + msg.kind));
    return;
  }
  let result;
  try {
    result = handler(msg);
  } catch (err) {
    post(replyError(msg.kind, msg.jobId, err));
    return;
  }
  post(reply(msg.kind, msg.jobId, result));
}
