import { describe, expect, it } from "vitest";
import { buildProjectExport, normalizeImportedProject } from "./exportUtils.js";
import { normalizeStoredProject } from "./storedProject.js";
import { buildVersionSnapshot, restoreVersionSnapshot } from "./versionSnapshot.js";
import { canUndoTasks, createTaskHistory, taskHistoryReducer } from "./history.js";
import { applyScheduleStartDates } from "./schedulingFeedback.js";
import { computeSchedule } from "../agent/cli.js";

const initial = () => buildProjectExport([
  { id: "a", name: "Design", parentId: null, order: 0, startDate: "2026-10-01", duration: 2, assigneeId: "r", predecessors: [] },
  { id: "b", name: "Build", parentId: null, order: 1, startDate: "2026-10-01", duration: 2, assigneeId: "r", predecessors: [{ id: "a", type: "FS", lag: 0 }] },
], [{ id: "r", name: "Owner", weeklyCapacity: 2, monthlyCapacity: 10 }], [], [], true, [], "Before rename");

describe("integrated project safety, history, feedback and metadata", () => {
  it.each([true, false, undefined])("restores saved calculation inputs without rewinding the current name (saved leveling %s)", rawLevelingOn => {
    const original = initial();
    const version = buildVersionSnapshot(original, computeSchedule(original, { leveling: original.levelingOn }).schedule, "Baseline");
    if (rawLevelingOn === undefined) delete version.rawLevelingOn;
    else version.rawLevelingOn = rawLevelingOn;
    const current = { ...original, projectName: "Current name 日本語", levelingOn: false, versions: [version] };
    const imported = normalizeImportedProject(JSON.parse(JSON.stringify(current)));
    const restored = restoreVersionSnapshot(imported.versions[0], imported.levelingOn);
    expect(restored).not.toHaveProperty("projectName");
    const combined = { ...imported, ...restored };
    expect(combined.projectName).toBe(current.projectName);
    expect(combined.levelingOn).toBe(rawLevelingOn ?? current.levelingOn);
    expect(normalizeStoredProject(combined, combined.versions).projectName).toBe(current.projectName);
    const expectedLeveling = rawLevelingOn ?? current.levelingOn;
    expect(computeSchedule(combined, { leveling: combined.levelingOn }).schedule)
      .toEqual(computeSchedule(original, { leveling: expectedLeveling }).schedule);
    expect(computeSchedule(combined, { leveling: combined.levelingOn }).schedule)
      .not.toEqual(computeSchedule(original, { leveling: !expectedLeveling }).schedule);
    const history = taskHistoryReducer(createTaskHistory(current.tasks), { type: "edit", key: "a:name", value: tasks => tasks.map(task => ({ ...task, name: "Draft" })) });
    const reset = taskHistoryReducer(history, { type: "reset", value: restored.tasks });
    expect(canUndoTasks(reset)).toBe(false);
    expect(reset).not.toHaveProperty("edit");
    expect(taskHistoryReducer(reset, { type: "undo" }).present).toBe(restored.tasks);
  });

  it("keeps one committed cell edit and one scheduling operation while repeated scheduling is a no-op", () => {
    const original = initial();
    let history = createTaskHistory(original.tasks);
    for (const name of ["D", "Design revised"]) {
      history = taskHistoryReducer(history, { type: "edit", key: "a:name", value: tasks => tasks.map(task => task.id === "a" ? { ...task, name } : task) });
    }
    const dates = new Map([["b", "2026-10-05"]]);
    const applied = applyScheduleStartDates(history.present, dates);
    history = taskHistoryReducer(history, { type: "set", value: applied.tasks });
    expect(history.past).toHaveLength(2);
    expect([...applied.changedIds]).toEqual(["b"]);
    const repeated = applyScheduleStartDates(history.present, dates);
    expect(repeated.changedIds.size).toBe(0);
    expect(taskHistoryReducer(history, { type: "set", value: repeated.tasks })).toBe(history);
    history = taskHistoryReducer(history, { type: "undo" });
    expect(history.present[0].name).toBe("Design revised");
    expect(history.present[1].startDate).toBe("2026-10-01");
    history = taskHistoryReducer(history, { type: "undo" });
    expect(history.present).toEqual(original.tasks);
  });
});
