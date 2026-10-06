import { describe, expect, it } from "vitest";
import { normalizeStoredProject } from "./storedProject.js";

describe("stored projects", () => {
  it("restores a deliberately empty plan with all settings", () => {
    const project = { tasks: [], resources: [{ id: "r1", name: "Test", weeklyCapacity: 4, monthlyCapacity: 16 }], sprints: [{ id: "s1", name: "Sprint", order: 0, startDate: "2026-10-01", endDate: "2026-10-09" }], levelingOn: true, calendarExceptions: [{ date: "2026-10-06", type: "holiday" }] };
    const result = normalizeStoredProject(project, []);
    expect(result).toMatchObject(project);
    expect(result.versions).toEqual([]);
  });
  it("preserves defaults for old local storage and migrates sprintId", () => {
    const result = normalizeStoredProject({ tasks: [{ id: "t", name: "Task", parentId: null, order: 0, sprintId: "old" }] }, []);
    expect(result.tasks[0].sprintIds).toEqual(["old"]);
    expect(result).toMatchObject({ sprints: [], resources: [], levelingOn: false, calendarExceptions: [] });
  });
  it.each([
    { startDate: "", endDate: "2026-10-09" },
    { startDate: "2026-10-12", endDate: "2026-10-09" },
  ])("restores UI-editable sprint dates and negative capacity, including raw versions: %j", dates => {
    const resources = [{ id: "r", name: "Resource", weeklyCapacity: -1, monthlyCapacity: -2 }];
    const sprints = [{ id: "s", name: "Sprint", order: 0, ...dates }];
    const version = { id: "v", name: "Editing snapshot", createdAt: 1, tasks: [], rawTasks: [], rawResources: resources, rawSprints: sprints, hasFullSnapshot: true };
    const restored = normalizeStoredProject({ tasks: [], resources, sprints }, [version]);
    expect(restored.resources).toEqual(resources);
    expect(restored.sprints).toEqual(sprints);
    expect(restored.versions[0].rawResources).toEqual(resources);
    expect(restored.versions[0].rawSprints).toEqual(sprints);
  });
  it("does not relax malformed date strings, null capacities or malformed snapshot objects", () => {
    const resource = { id: "r", name: "R", weeklyCapacity: null, monthlyCapacity: 1 };
    expect(() => normalizeStoredProject({ tasks: [], resources: [resource] }, [])).toThrow("invalid_project_json");
    const sprint = { id: "s", name: "S", order: 0, startDate: "2026-02-30", endDate: "2026-10-09" };
    expect(() => normalizeStoredProject({ tasks: [], sprints: [sprint] }, [])).toThrow("invalid_project_json");
  });
  it("does not silently replace malformed saved fields with defaults", () => {
    expect(() => normalizeStoredProject({ tasks: [null], resources: [] }, [])).toThrow("invalid_project_json");
    expect(() => normalizeStoredProject({ tasks: [], resources: "wrong" }, [])).toThrow("invalid_project_json");
  });
});
