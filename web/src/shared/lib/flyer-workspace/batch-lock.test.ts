import { describe, expect, it, vi } from "vitest";
import { createBatchLock } from "./batch-lock.ts";

describe("the lock of the batches", () => {
  it("is held until the last one lets go", () => {
    const lock = createBatchLock();
    expect(lock.isRunning()).toBe(false);
    const first = lock.hold();
    const second = lock.hold();
    expect(lock.isRunning()).toBe(true);
    first();
    expect(lock.isRunning()).toBe(true);
    second();
    expect(lock.isRunning()).toBe(false);
  });

  it("letting go twice counts as once: it does not free somebody else's hold", () => {
    const lock = createBatchLock();
    const first = lock.hold();
    lock.hold();
    first();
    first();
    expect(lock.isRunning()).toBe(true);
  });

  it("tells whoever listens, until they stop", () => {
    const lock = createBatchLock();
    const listener = vi.fn<() => void>();
    const stop = lock.subscribe(listener);
    const release = lock.hold();
    expect(listener).toHaveBeenCalledTimes(1);
    release();
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    lock.hold();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
