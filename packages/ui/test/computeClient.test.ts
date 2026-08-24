import { describe, it, expect } from "vitest";
import { createComputeClient } from "../src/computeClient.js";

// jsdom has no Worker, so these exercise the synchronous-fallback path: coalescing, the busy affordance,
// deferSync scheduling, and cancel. The worker path is verified in-browser at app-adoption time.

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("createComputeClient (sync fallback)", () => {
  it("deferSync (default) computes on a macrotask and toggles busy", async () => {
    const busy: boolean[] = [];
    const client = createComputeClient<number, number>({
      compute: (n) => n * 2,
      onBusy: (b) => busy.push(b),
    });
    let result: number | null = null;
    client.request(21, (r) => {
      result = r;
    });
    // Deferred: not computed yet, but already marked busy.
    expect(result).toBeNull();
    expect(client.busy()).toBe(true);
    await tick();
    expect(result).toBe(42);
    expect(client.busy()).toBe(false);
    expect(busy).toEqual([true, false]);
  });

  it("coalesces rapid requests — only the latest computes and paints", async () => {
    let computeCalls = 0;
    const client = createComputeClient<number, number>({
      compute: (n) => {
        computeCalls += 1;
        return n;
      },
    });
    const seen: number[] = [];
    client.request(1, (r) => seen.push(r));
    client.request(2, (r) => seen.push(r));
    client.request(3, (r) => seen.push(r));
    await tick();
    expect(computeCalls).toBe(1);
    expect(seen).toEqual([3]);
  });

  it("deferSync:false computes synchronously", () => {
    const client = createComputeClient<string, string>({
      compute: (s) => s.toUpperCase(),
      deferSync: false,
    });
    let result = "";
    client.request("hi", (r) => {
      result = r;
    });
    expect(result).toBe("HI");
    expect(client.busy()).toBe(false);
  });

  it("cancel drops a queued deferred request and clears busy", async () => {
    let computeCalls = 0;
    const client = createComputeClient<number, number>({
      compute: (n) => {
        computeCalls += 1;
        return n;
      },
    });
    let fired = false;
    client.request(7, () => {
      fired = true;
    });
    expect(client.busy()).toBe(true);
    client.cancel();
    expect(client.busy()).toBe(false);
    await tick();
    expect(computeCalls).toBe(0);
    expect(fired).toBe(false);
  });
});
