import { describe, expect, it } from "vitest";
import { generateOccurrences } from "./recurrence.js";
import { buildOccurrenceOverridePatch } from "./recurrenceEditing.js";

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
