import { describe, expect, it } from "vitest";
import { generateOccurrences } from "./recurrence.js";
import { buildOccurrenceOverridePatch, buildOccurrenceProgressPatch, buildOccurrenceScheduleResetPatch } from "./recurrenceEditing.js";
import { createTaskHistory, taskHistoryReducer } from "./history.js";

const task = {
  id: "series", startDate: "2026-10-13", duration: 2, predecessors: [],
  recurrence: { frequency: "daily", interval: 1, endDate: "2026-10-13" },
};
const deps = [{ id: "predecessor", type: "FS", lag: 0 }];
const instance = value => generateOccurrences(value).occurrences[0];
const dates = occurrence => ({ startDate: occurrence.startDate, endDate: occurrence.endDate });

describe("buildOccurrenceOverridePatch", () => {
  it("does not pin generated dates during dependency-only edits", () => {
    const patch = buildOccurrenceOverridePatch(task, instance(task), { ...dates(instance(task)), predecessors: deps });
    expect(patch).toEqual({ occurrenceOverrides: { "2026-10-13": { predecessors: deps } } });
    expect(instance({ ...task, ...patch, duration: 4 }).endDate).toBe("2026-10-16");
    expect(task.occurrenceOverrides).toBeUndefined();
  });

  it.each([
    ["start-only", { startDate: "2026-10-17" }],
    ["end-only", { endDate: "2026-10-18" }],
    ["both explicit", { startDate: "2026-10-13", endDate: "2026-10-14" }],
  ])("preserves the existing %s date-field shape while changing dependencies", (_name, override) => {
    const existing = { ...task, occurrenceOverrides: { "2026-10-13": override } };
    const occurrence = instance(existing);
    const patch = buildOccurrenceOverridePatch(existing, occurrence, { ...dates(occurrence), predecessors: deps });
    expect(patch.occurrenceOverrides["2026-10-13"]).toEqual({ ...override, predecessors: deps });
    expect(existing.occurrenceOverrides["2026-10-13"]).toEqual(override);
    if (!Object.hasOwn(override, "endDate")) expect(instance({ ...existing, ...patch, duration: 4 }).endDate).toBe("2026-10-20");
    else expect(instance({ ...existing, ...patch, duration: 4 }).endDate).toBe(override.endDate);
  });

  it("pins the complete displayed range when either date changes", () => {
    const occurrence = instance(task);
    expect(buildOccurrenceOverridePatch(task, occurrence, { ...dates(occurrence), endDate: "2026-10-16" }))
      .toEqual({ occurrenceOverrides: { "2026-10-13": { startDate: "2026-10-13", endDate: "2026-10-16" } } });
    expect(buildOccurrenceOverridePatch(task, occurrence, { ...dates(occurrence), startDate: "2026-10-12" }))
      .toEqual({ occurrenceOverrides: { "2026-10-13": { startDate: "2026-10-12", endDate: "2026-10-14" } } });
  });

  it("does not pin stale generated dates when untouched inputs follow changed series effort", () => {
    const changed = { ...task, duration: 4 };
    const occurrence = instance(changed);
    expect(occurrence.endDate).toBe("2026-10-16");
    const patch = buildOccurrenceOverridePatch(changed, occurrence, { predecessors: deps });
    expect(patch).toEqual({ occurrenceOverrides: { "2026-10-13": { predecessors: deps } } });
    expect(instance({ ...changed, ...patch, duration: 5 }).endDate).toBe("2026-10-17");
  });

  it("keeps a manually edited full range fixed through later duration changes", () => {
    const patch = buildOccurrenceOverridePatch(task, instance(task), { startDate: "2026-10-12", endDate: "2026-10-14" });
    const moved = instance({ ...task, ...patch, duration: 4 });
    expect(moved.startDate).toBe("2026-10-12");
    expect(moved.endDate).toBe("2026-10-14");
  });

  it("treats unchanged dates and unchanged existing overrides as no-ops", () => {
    expect(buildOccurrenceOverridePatch(task, instance(task), dates(instance(task)))).toBeNull();
    const existing = { ...task, occurrenceOverrides: { "2026-10-13": { startDate: "2026-10-17", predecessors: deps } } };
    expect(buildOccurrenceOverridePatch(existing, instance(existing), dates(instance(existing)))).toBeNull();
  });

  it("removes an empty exception when restoring dependency inheritance without touching dormant changes", () => {
    const dormant = { startDate: "2026-11-02", predecessors: deps };
    const existing = { ...task, occurrenceOverrides: { "2026-10-13": { predecessors: deps }, "2026-11-01": dormant } };
    expect(buildOccurrenceOverridePatch(existing, instance(existing), { ...dates(instance(existing)), predecessors: undefined }))
      .toEqual({ occurrenceOverrides: { "2026-11-01": dormant } });
  });

  it("preserves untouched unresolved predecessors during a date-only edit", () => {
    const unresolved = [{ id: "missing-wbs", type: "FS", lag: 0 }];
    const existing = { ...task, occurrenceOverrides: { "2026-10-13": { predecessors: unresolved } } };
    const patch = buildOccurrenceOverridePatch(existing, instance(existing), { ...dates(instance(existing)), endDate: "2026-10-16" });
    expect(patch.occurrenceOverrides["2026-10-13"]).toEqual({ predecessors: unresolved, startDate: "2026-10-13", endDate: "2026-10-16" });
    expect(patch.occurrenceOverrides["2026-10-13"].predecessors).toBe(unresolved);
  });
});

describe("occurrence progress and skip edits", () => {
  it("undoes and redoes independent progress, skip and schedule-reset operations losslessly", () => {
    const initial = { ...task, progress: 20, occurrenceOverrides: { "2026-10-13": { startDate: "2026-10-18", predecessors: deps, extension: { keep: true } } } };
    let history = createTaskHistory([initial]);
    const states = [history.present];
    for (const edit of [
      current => buildOccurrenceProgressPatch(current, "2026-10-13", { progress: 80 }),
      current => buildOccurrenceProgressPatch(current, "2026-10-13", { skipped: true }),
      current => buildOccurrenceScheduleResetPatch(current, "2026-10-13"),
    ]) {
      history = taskHistoryReducer(history, { type: "set", value: tasks => tasks.map(current => ({ ...current, ...edit(current) })) });
      states.push(history.present);
    }
    expect(history.past).toHaveLength(3);
    expect(history.present[0].occurrenceOverrides["2026-10-13"]).toEqual({ progress: 80, skipped: true, extension: { keep: true } });
    for (let i = 2; i >= 0; i--) {
      history = taskHistoryReducer(history, { type: "undo" });
      expect(history.present).toEqual(states[i]);
    }
    for (let i = 1; i <= 3; i++) {
      history = taskHistoryReducer(history, { type: "redo" });
      expect(history.present).toEqual(states[i]);
    }
    expect(initial.progress).toBe(20);
    expect(initial.occurrenceOverrides["2026-10-13"]).not.toHaveProperty("progress");
  });
  it("changes only the selected original date and preserves scheduling and extension fields", () => {
    const original = { startDate: "2026-10-18", endDate: "2026-10-20", predecessors: deps, futureField: { keep: true } };
    const existing = { ...task, progress: 25, occurrenceOverrides: { "2026-10-13": original, "2027-01-01": { progress: 70, skipped: true } } };
    const before = structuredClone(existing);
    const patch = buildOccurrenceProgressPatch(existing, "2026-10-13", { progress: 100 });
    expect(patch.occurrenceOverrides).toEqual({ "2026-10-13": { ...original, progress: 100 }, "2027-01-01": { progress: 70, skipped: true } });
    expect(instance({ ...existing, ...patch })).toMatchObject({ occurrenceDate: "2026-10-13", startDate: "2026-10-18", progress: 100, skipped: false });
    expect(existing).toEqual(before);
  });

  it.each([0, 35, 100])("skips and restores inherited progress %s without changing it", progress => {
    const existing = { ...task, progress };
    const skipped = { ...existing, ...buildOccurrenceProgressPatch(existing, "2026-10-13", { skipped: true }) };
    expect(skipped.occurrenceOverrides["2026-10-13"]).toEqual({ skipped: true });
    expect(instance(skipped)).toMatchObject({ progress, skipped: true });
    const restored = { ...skipped, ...buildOccurrenceProgressPatch(skipped, "2026-10-13", { skipped: false }) };
    expect(instance(restored)).toMatchObject({ progress, skipped: false });
    expect(restored.progress).toBe(progress);
  });

  it("restores individually edited progress without borrowing the series baseline", () => {
    const existing = { ...task, progress: 10, occurrenceOverrides: { "2026-10-13": { progress: 65 } } };
    const skipped = { ...existing, ...buildOccurrenceProgressPatch(existing, "2026-10-13", { skipped: true }) };
    const restored = { ...skipped, ...buildOccurrenceProgressPatch(skipped, "2026-10-13", { skipped: false }) };
    expect(instance(restored)).toMatchObject({ progress: 65, skipped: false });
    expect(restored.progress).toBe(10);
  });

  it("treats unchanged and invalid progress drafts as no-ops", () => {
    const existing = { ...task, progress: 25 };
    for (const edits of [{}, { progress: 25 }, { skipped: false }, { progress: -1 }, { progress: 101 }, { progress: NaN }, { progress: Infinity }, { progress: "50" }, { skipped: "true" }]) {
      expect(buildOccurrenceProgressPatch(existing, "2026-10-13", edits)).toBeNull();
    }
    expect(buildOccurrenceProgressPatch(existing, "2026-10-13", { progress: 37.5 })).toEqual({ occurrenceOverrides: { "2026-10-13": { progress: 37.5 } } });
  });

  it("resets only dates and dependencies, retaining progress, skip and unknown fields", () => {
    const preserved = { progress: 65, skipped: true, futureField: { keep: true } };
    const existing = { ...task, occurrenceOverrides: { "2026-10-13": { ...preserved, startDate: "2026-10-18", endDate: "2026-10-20", predecessors: deps }, "2027-01-01": { skipped: true } } };
    const patch = buildOccurrenceScheduleResetPatch(existing, "2026-10-13");
    expect(patch).toEqual({ occurrenceOverrides: { "2026-10-13": preserved, "2027-01-01": { skipped: true } } });
    const reset = { ...existing, ...patch };
    expect(instance(reset)).toMatchObject({ startDate: "2026-10-13", endDate: "2026-10-14", predecessors: [], progress: 65, skipped: true });
    expect(buildOccurrenceScheduleResetPatch(reset, "2026-10-13")).toBeNull();
  });

  it("removes a schedule-only override and keeps progress when editing dates/dependencies", () => {
    const existing = { ...task, occurrenceOverrides: { "2026-10-13": { startDate: "2026-10-18", predecessors: deps } } };
    expect(buildOccurrenceScheduleResetPatch(existing, "2026-10-13")).toEqual({ occurrenceOverrides: {} });
    expect(buildOccurrenceScheduleResetPatch(task, "2026-10-13")).toBeNull();
    const withProgress = { ...task, occurrenceOverrides: { "2026-10-13": { progress: 30, skipped: true, extension: 1, predecessors: deps } } };
    expect(buildOccurrenceOverridePatch(withProgress, instance(withProgress), { endDate: "2026-10-17", predecessors: undefined })).toEqual({ occurrenceOverrides: {
      "2026-10-13": { progress: 30, skipped: true, extension: 1, startDate: "2026-10-13", endDate: "2026-10-17" },
    } });
  });
});
