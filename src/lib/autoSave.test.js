import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutoSaver } from "./autoSave.js";

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("serialized latest-edit saving", () => {
  it("debounces edits and reports pending then saved", async () => {
    const persist = vi.fn().mockResolvedValue(true); const onState = vi.fn();
    const saver = createAutoSaver({ persist, onState });
    saver.update({ tasks: [1] });
    await vi.advanceTimersByTimeAsync(500);
    saver.update({ tasks: [2] });
    await vi.advanceTimersByTimeAsync(799);
    expect(persist).not.toHaveBeenCalled();
    expect(onState).toHaveBeenLastCalledWith("pending");
    await vi.advanceTimersByTimeAsync(1);
    expect(persist).toHaveBeenCalledExactlyOnceWith({ tasks: [2] });
    expect(onState).toHaveBeenLastCalledWith("saved");
  });
  it("serializes asynchronous writes and never calls an old completion saved", async () => {
    const first = deferred(), second = deferred(); const onState = vi.fn();
    const persist = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const saver = createAutoSaver({ persist, onState });
    saver.update("old"); await vi.advanceTimersByTimeAsync(800);
    saver.update("new"); await vi.advanceTimersByTimeAsync(800);
    expect(persist).toHaveBeenCalledTimes(1);
    first.resolve(true); await vi.advanceTimersByTimeAsync(0);
    expect(onState.mock.calls.flat()).not.toContain("saved");
    expect(persist).toHaveBeenLastCalledWith("new");
    second.resolve(true); await vi.advanceTimersByTimeAsync(0);
    expect(onState).toHaveBeenLastCalledWith("saved");
  });
  it.each([false, "throw"])("shows failure (%s) and retries only the newest snapshot", async failure => {
    const onState = vi.fn();
    const persist = vi.fn().mockImplementationOnce(async () => { if (failure === "throw") throw new Error("quota"); return false; }).mockResolvedValue(true);
    const saver = createAutoSaver({ persist, onState });
    saver.update("a"); await vi.advanceTimersByTimeAsync(800);
    expect(onState).toHaveBeenLastCalledWith("failed");
    saver.update("b");
    await saver.update("b", { immediate: true });
    expect(persist).toHaveBeenLastCalledWith("b");
    expect(onState).toHaveBeenLastCalledWith("saved");
    await vi.advanceTimersByTimeAsync(800);
    expect(persist).toHaveBeenCalledTimes(2);
  });
  it("skips superseded queued writes and ignores an obsolete failure", async () => {
    const first = deferred(); const onState = vi.fn();
    const persist = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(true);
    const saver = createAutoSaver({ persist, onState });
    saver.update(1); await vi.advanceTimersByTimeAsync(800);
    saver.update(2); await vi.advanceTimersByTimeAsync(800);
    saver.update(3); await vi.advanceTimersByTimeAsync(800);
    first.resolve(false); await vi.advanceTimersByTimeAsync(0);
    expect(persist.mock.calls.flat()).toEqual([1, 3]);
    expect(onState.mock.calls.flat()).not.toContain("failed");
    expect(onState).toHaveBeenLastCalledWith("saved");
  });
  it("does not write or publish state after disposal", async () => {
    const persist = vi.fn(); const onState = vi.fn();
    const saver = createAutoSaver({ persist, onState });
    saver.update(1); saver.dispose(); await vi.advanceTimersByTimeAsync(800);
    expect(persist).not.toHaveBeenCalled();
    expect(onState).toHaveBeenCalledExactlyOnceWith("pending");
  });
});
