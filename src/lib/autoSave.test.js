import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutoSaver, getAutoSaveStatus } from "./autoSave.js";

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("serialized latest-edit saving", () => {
  it("debounces edits and reports pending then saved", async () => {
    const persist = vi.fn().mockResolvedValue(true); const onState = vi.fn();
    const saver = createAutoSaver({ persist, onState });
    const latest = { tasks: [2] };
    saver.update({ tasks: [1] });
    await vi.advanceTimersByTimeAsync(500);
    saver.update(latest);
    await vi.advanceTimersByTimeAsync(799);
    expect(persist).not.toHaveBeenCalled();
    expect(onState).toHaveBeenLastCalledWith({ status: "pending", snapshot: latest });
    expect(onState.mock.lastCall[0].snapshot).toBe(latest);
    await vi.advanceTimersByTimeAsync(1);
    expect(persist).toHaveBeenCalledExactlyOnceWith(latest);
    expect(onState).toHaveBeenLastCalledWith({ status: "saved", snapshot: latest });
    expect(onState.mock.lastCall[0].snapshot).toBe(latest);
  });
  it("serializes asynchronous writes and never calls an old completion saved", async () => {
    const first = deferred(), second = deferred(); const onState = vi.fn();
    const persist = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const saver = createAutoSaver({ persist, onState });
    saver.update("old"); await vi.advanceTimersByTimeAsync(800);
    saver.update("new"); await vi.advanceTimersByTimeAsync(800);
    expect(persist).toHaveBeenCalledTimes(1);
    first.resolve(true); await vi.advanceTimersByTimeAsync(0);
    expect(onState.mock.calls.map(([state]) => state.status)).not.toContain("saved");
    expect(persist).toHaveBeenLastCalledWith("new");
    second.resolve(true); await vi.advanceTimersByTimeAsync(0);
    expect(onState).toHaveBeenLastCalledWith({ status: "saved", snapshot: "new" });
  });
  it.each([false, "throw"])("shows failure (%s) and retries only the newest snapshot", async failure => {
    const onState = vi.fn();
    const persist = vi.fn().mockImplementationOnce(async () => { if (failure === "throw") throw new Error("quota"); return false; }).mockResolvedValue(true);
    const saver = createAutoSaver({ persist, onState });
    saver.update("a"); await vi.advanceTimersByTimeAsync(800);
    expect(onState).toHaveBeenLastCalledWith({ status: "failed", snapshot: "a" });
    saver.update("b");
    await saver.update("b", { immediate: true });
    expect(persist).toHaveBeenLastCalledWith("b");
    expect(onState).toHaveBeenLastCalledWith({ status: "saved", snapshot: "b" });
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
    expect(onState.mock.calls.map(([state]) => state.status)).not.toContain("failed");
    expect(onState).toHaveBeenLastCalledWith({ status: "saved", snapshot: 3 });
  });
  it("does not write or publish state after disposal", async () => {
    const persist = vi.fn(); const onState = vi.fn();
    const saver = createAutoSaver({ persist, onState });
    saver.update(1); saver.dispose(); await vi.advanceTimersByTimeAsync(800);
    expect(persist).not.toHaveBeenCalled();
    expect(onState).toHaveBeenCalledExactlyOnceWith({ status: "pending", snapshot: 1 });
  });
});

describe("save status belongs to the rendered snapshot", () => {
  const makeSnapshot = () => ({
    project: {
      projectName: "Plan", tasks: [{ id: "task", name: "Before" }], resources: [],
      sprints: [], levelingOn: false, calendarExceptions: [],
    },
    versions: [],
  });

  it.each(["pending", "saved", "failed"])("shows %s only for the exact matching snapshot", status => {
    const snapshot = makeSnapshot();
    const state = { status, snapshot };
    expect(getAutoSaveStatus(state, snapshot)).toBe(status);
    // Equal contents do not establish that this snapshot has finished saving.
    expect(getAutoSaveStatus(state, structuredClone(snapshot))).toBe("pending");
  });

  it("starts pending before any notification", () => {
    expect(getAutoSaveStatus(null, makeSnapshot())).toBe("pending");
    expect(getAutoSaveStatus(undefined, undefined)).toBe("pending");
  });

  it.each([
    ["project name", { projectName: "Renamed" }],
    ["tasks", { tasks: [{ id: "task", name: "Edited" }] }],
    ["empty import", { projectName: "", tasks: [], resources: [], sprints: [], calendarExceptions: [] }],
    ["resources", { resources: [{ id: "person", name: "Person" }] }],
    ["sprints", { sprints: [{ id: "sprint", name: "Sprint" }] }],
    ["leveling", { levelingOn: true }],
    ["calendar", { calendarExceptions: [{ date: "2026-10-07", type: "holiday" }] }],
  ])("shows %s changes as pending before the autosave effect updates the queue", async (_, patch) => {
    const initial = makeSnapshot();
    const persist = vi.fn().mockResolvedValue(true);
    let state = null;
    const saver = createAutoSaver({ persist, onState: next => { state = next; } });
    await saver.update(initial, { immediate: true });
    expect(getAutoSaveStatus(state, initial)).toBe("saved");

    const edited = { ...initial, project: { ...initial.project, ...patch } };
    expect(getAutoSaveStatus(state, edited)).toBe("pending");
    expect(persist).toHaveBeenCalledTimes(1);
    saver.update(edited);
    expect(getAutoSaveStatus(state, edited)).toBe("pending");
    await vi.advanceTimersByTimeAsync(800);
    expect(persist).toHaveBeenLastCalledWith(edited);
    expect(getAutoSaveStatus(state, edited)).toBe("saved");
  });

  it("does not reuse a saved badge after Undo restores an older task array", async () => {
    const initial = makeSnapshot();
    let state;
    const saver = createAutoSaver({ persist: async () => true, onState: next => { state = next; } });
    await saver.update(initial, { immediate: true });
    const edited = { ...initial, project: { ...initial.project, tasks: [{ id: "task", name: "Edited" }] } };
    await saver.update(edited, { immediate: true });
    const undone = { ...edited, project: { ...edited.project, tasks: initial.project.tasks } };
    expect(getAutoSaveStatus(state, undone)).toBe("pending");
    await saver.update(undone, { immediate: true });
    expect(getAutoSaveStatus(state, undone)).toBe("saved");
  });

  it("marks a taskless project rename pending without waiting for a queue update", async () => {
    const initial = makeSnapshot();
    initial.project.tasks = [];
    let state;
    const saver = createAutoSaver({ persist: async () => true, onState: next => { state = next; } });
    await saver.update(initial, { immediate: true });
    const renamed = { ...initial, project: { ...initial.project, projectName: "New name" } };
    expect(getAutoSaveStatus(state, renamed)).toBe("pending");
    await saver.update(renamed, { immediate: true });
    expect(getAutoSaveStatus(state, renamed)).toBe("saved");
  });

  it("includes version-only edits even when the project reference is unchanged", async () => {
    const initial = makeSnapshot();
    let state;
    const saver = createAutoSaver({ persist: async () => true, onState: next => { state = next; } });
    await saver.update(initial, { immediate: true });
    const edited = { ...initial, versions: [{ id: "version", name: "Checkpoint" }] };
    expect(getAutoSaveStatus(state, edited)).toBe("pending");
    await saver.update(edited, { immediate: true });
    expect(getAutoSaveStatus(state, edited)).toBe("saved");
  });

  it.each([true, false])("does not apply an old completion (%s) before the new edit is queued", async result => {
    const write = deferred();
    const initial = makeSnapshot();
    let state;
    const saver = createAutoSaver({ persist: () => write.promise, onState: next => { state = next; } });
    const completion = saver.update(initial, { immediate: true });
    await vi.advanceTimersByTimeAsync(0);
    const edited = { ...initial, project: { ...initial.project, projectName: "New edit" } };
    expect(getAutoSaveStatus(state, edited)).toBe("pending");
    // The effect has not queued edited yet, so the revision guard cannot reject this result.
    write.resolve(result);
    await completion;
    expect(state.status).toBe(result ? "saved" : "failed");
    expect(state.snapshot).toBe(initial);
    expect(getAutoSaveStatus(state, edited)).toBe("pending");
  });

  it("keeps failure visible until retry, then reports the matching save", async () => {
    const snapshot = makeSnapshot();
    const retry = deferred();
    let state;
    const persist = vi.fn().mockResolvedValueOnce(false).mockReturnValueOnce(retry.promise);
    const saver = createAutoSaver({ persist, onState: next => { state = next; } });
    await saver.update(snapshot, { immediate: true });
    expect(getAutoSaveStatus(state, snapshot)).toBe("failed");
    const completion = saver.update(snapshot, { immediate: true });
    expect(getAutoSaveStatus(state, snapshot)).toBe("pending");
    retry.resolve(true);
    await completion;
    expect(getAutoSaveStatus(state, snapshot)).toBe("saved");
  });

  it("preserves restore-blocked failure and recovery controls across edits", () => {
    const snapshot = makeSnapshot();
    const edited = { ...snapshot, versions: [{ id: "version" }] };
    for (const state of [null, ...["pending", "saved", "failed"].map(status => ({ status, snapshot }))]) {
      expect(getAutoSaveStatus(state, snapshot, { restoreBlocked: true })).toBe("failed");
      expect(getAutoSaveStatus(state, edited, { restoreBlocked: true })).toBe("failed");
    }
    expect(getAutoSaveStatus(null, edited, { restoreBlocked: false })).toBe("pending");
  });

  it("ignores an in-flight completion and further edits after disposal", async () => {
    const write = deferred();
    const snapshot = makeSnapshot();
    const onState = vi.fn();
    const persist = vi.fn().mockReturnValue(write.promise);
    const saver = createAutoSaver({ persist, onState });
    const completion = saver.update(snapshot, { immediate: true });
    await vi.advanceTimersByTimeAsync(0);
    saver.dispose();
    saver.update(makeSnapshot());
    write.resolve(true);
    await completion;
    await vi.advanceTimersByTimeAsync(800);
    expect(persist).toHaveBeenCalledExactlyOnceWith(snapshot);
    expect(onState).toHaveBeenCalledExactlyOnceWith({ status: "pending", snapshot });
  });
});
