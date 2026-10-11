import { describe, expect, it } from "vitest";
import { buildVersionSnapshot, hasFullVersionSnapshot, restoreVersionSnapshot } from "./versionSnapshot.js";
import { buildProjectExport, normalizeImportedProject } from "./exportUtils.js";
import { buildHolidayMap, makeCalendar } from "./calendar.js";
import { buildDisplaySchedule, runCPM } from "./scheduling.js";

function project(levelingOn = true) {
  return {
    tasks: [
      { id: "t1", name: "First", parentId: null, order: 0, startDate: "2024-01-09", duration: 3, assigneeId: "r1", predecessors: [], sprintIds: ["s1"], progress: 0, notes: "Saved detail" },
      { id: "t2", name: "Second", parentId: null, order: 1, startDate: "2024-01-09", duration: 2, assigneeId: "r1", predecessors: [], sprintIds: [], progress: 0 },
    ],
    resources: [{ id: "r1", name: "Owner", weeklyCapacity: 2, monthlyCapacity: 10 }],
    sprints: [{ id: "s1", name: "Sprint", startDate: "2024-01-09", endDate: "2024-01-31", order: 0 }],
    calendarExceptions: [{ date: "2024-01-10", type: "holiday", name: "Day off" }],
    levelingOn,
  };
}

function schedule(data) {
  const cal = makeCalendar(buildHolidayMap(2023, 2025), data.calendarExceptions);
  const cpm = runCPM(data.tasks, cal, "2024-01-09", data.sprints);
  return buildDisplaySchedule(data.tasks, cpm.result, data.resources, cal, data.sprints, { leveling: data.levelingOn }).schedule;
}

describe("version snapshots", () => {
  it.each([true, false])("restores the saved calculation conditions (leveling %s) after export/import", levelingOn => {
    const original = project(levelingOn);
    const before = schedule(original);
    const version = buildVersionSnapshot(original, before, "Saved");
    expect(version.rawLevelingOn).toBe(levelingOn);
    const exported = buildProjectExport(original.tasks, original.resources, original.sprints, [version], !levelingOn, original.calendarExceptions);
    const imported = normalizeImportedProject(JSON.parse(JSON.stringify(exported)));
    const restored = restoreVersionSnapshot(imported.versions[0], !levelingOn);
    expect(restored).toEqual(original);
    expect(schedule(restored)).toEqual(before);
    expect(schedule({ ...restored, levelingOn: !levelingOn })).not.toEqual(before);
  });

  it("isolates saved and restored nested data from subsequent edits", () => {
    const original = project();
    const expected = structuredClone(original);
    const version = buildVersionSnapshot(original, schedule(original), "Saved");
    original.tasks[0].sprintIds.push("other");
    original.tasks[0].notes = "Changed";
    original.resources[0].weeklyCapacity = 5;
    original.sprints[0].startDate = "2024-02-01";
    original.calendarExceptions[0].name = "Changed";
    const restored = restoreVersionSnapshot(version, false);
    expect(restored).toEqual(expected);
    restored.tasks[0].sprintIds.push("another");
    restored.resources[0].weeklyCapacity = 1;
    restored.sprints[0].name = "Changed";
    restored.calendarExceptions[0].name = "Changed again";
    expect(restoreVersionSnapshot(version, false)).toEqual(expected);
  });

  it.each([true, false])("preserves current leveling %s for a legacy snapshot with unknown conditions", currentLevelingOn => {
    const original = project();
    const version = buildVersionSnapshot(original, schedule(original), "Legacy");
    delete version.rawLevelingOn;
    delete version.rawCalendarExceptions;
    expect(hasFullVersionSnapshot(version)).toBe(true);
    expect(restoreVersionSnapshot(version, currentLevelingOn)).toMatchObject({
      levelingOn: currentLevelingOn, calendarExceptions: [],
    });
    expect(version).not.toHaveProperty("rawLevelingOn");
  });

  it("keeps comparison-only and incomplete versions non-restorable even with a claimed flag", () => {
    const comparison = { id: "v1", tasks: [], hasFullSnapshot: true, rawLevelingOn: true };
    expect(hasFullVersionSnapshot(comparison)).toBe(false);
    expect(restoreVersionSnapshot(comparison)).toBeNull();
    expect(restoreVersionSnapshot({ ...comparison, rawTasks: [], rawResources: [] })).toBeNull();
    expect(restoreVersionSnapshot(null)).toBeNull();
  });

  it("migrates legacy sprint IDs only in the restored copy", () => {
    const original = project();
    delete original.tasks[0].sprintIds;
    original.tasks[0].sprintId = "s1";
    const version = buildVersionSnapshot(original, new Map(), "Legacy");
    expect(restoreVersionSnapshot(version).tasks[0].sprintIds).toEqual(["s1"]);
    expect(version.rawTasks[0].sprintId).toBe("s1");
    expect(version.rawTasks[0]).not.toHaveProperty("sprintIds");
  });

  it("records false explicitly when saving a project without the older optional setting", () => {
    const original = project();
    delete original.levelingOn;
    expect(buildVersionSnapshot(original, new Map(), "Saved").rawLevelingOn).toBe(false);
  });
});


it("captures effective occurrence status while restoring the raw baseline and all dormant overrides", () => {
  const original = {
    tasks: [{ id: "series", name: "Review", parentId: null, order: 0, startDate: "2024-01-09", duration: 1, progress: 40,
      recurrence: { frequency: "daily", interval: 1, endDate: "2024-01-11" },
      occurrenceOverrides: {
        "2024-01-09": { progress: 100 },
        "2024-01-10": { progress: 70, skipped: true, extension: { preserved: true } },
        "2023-01-09": { progress: 20, skipped: false },
      }, extension: { preserved: true },
    }], resources: [], sprints: [], calendarExceptions: [], levelingOn: false,
  };
  const before = schedule(original);
  const saved = buildVersionSnapshot(original, before, "Occurrence progress");
  expect(saved.tasks[0].progress).toBe(70);
  expect(saved.tasks[0].occurrences).toEqual([
    { occurrenceDate: "2024-01-09", schedStart: "2024-01-09", schedFinish: "2024-01-09", progress: 100, skipped: false },
    { occurrenceDate: "2024-01-10", schedStart: "2024-01-10", schedFinish: "2024-01-10", progress: 70, skipped: true },
    { occurrenceDate: "2024-01-11", schedStart: "2024-01-11", schedFinish: "2024-01-11", progress: 40, skipped: false },
  ]);
  expect(saved.rawTasks).toEqual(original.tasks);
  expect(saved.rawTasks[0].progress).toBe(40);
  const exported = buildProjectExport(original.tasks, [], [], [saved]);
  const imported = normalizeImportedProject(JSON.parse(JSON.stringify(exported)));
  const restored = restoreVersionSnapshot(imported.versions[0]);
  expect(restored).toEqual(original);
  expect(schedule(restored)).toEqual(before);
  restored.tasks[0].occurrenceOverrides["2024-01-10"].progress = 0;
  expect(saved.rawTasks[0].occurrenceOverrides["2024-01-10"].progress).toBe(70);
});


it("keeps the inherited baseline through disable, JSON reload, re-enable and horizon extension", () => {
  const original = {
    tasks: [{ id: "series", name: "Review", parentId: null, order: 0, startDate: "2024-01-09", duration: 1, progress: 40,
      recurrence: { frequency: "daily", interval: 1, endDate: "2024-01-11" },
      occurrenceOverrides: { "2024-01-09": { progress: 100 }, "2024-01-10": { progress: 20, skipped: true } },
    }], resources: [], sprints: [], calendarExceptions: [], levelingOn: false,
  };
  expect(schedule(original).get("series").progress).toBe(70);
  const disabled = structuredClone(original);
  delete disabled.tasks[0].recurrence;
  const reloaded = normalizeImportedProject(buildProjectExport(disabled.tasks, [], [], []));
  expect(reloaded.tasks[0].progress).toBe(40);
  expect(reloaded.tasks[0].occurrenceOverrides).toEqual(original.tasks[0].occurrenceOverrides);
  expect(schedule(reloaded).get("series").progress).toBe(40);
  reloaded.tasks[0].recurrence = { ...original.tasks[0].recurrence, endDate: "2024-01-12" };
  const reenabled = schedule(reloaded).get("series");
  expect(reenabled.progress).toBe(60);
  expect(reenabled.occurrences.map(({ progress, skipped }) => ({ progress, skipped }))).toEqual([
    { progress: 100, skipped: false }, { progress: 20, skipped: true }, { progress: 40, skipped: false }, { progress: 40, skipped: false },
  ]);
  expect(reloaded.tasks[0].progress).toBe(40);
});
