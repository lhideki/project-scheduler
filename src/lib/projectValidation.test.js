import { describe, it, expect } from "vitest";
import { normalizeImportedProject, normalizeProjectVersions, prepareProjectImport, buildProjectExport } from "./exportUtils.js";
import { analyzeIntegrity, checkFieldShapes, validateProjectData, isBlockingProjectIssue } from "./projectValidation.js";
import { createAppTranslator, formatProjectIssue } from "./i18n.js";
import { seedData } from "./seedData.js";
import { parseEmbeddedProject } from "./embeddedProject.js";

const task = (overrides = {}) => ({ id: "t1", name: "Task", parentId: null, order: 0, ...overrides });
const resource = (overrides = {}) => ({ id: "r1", name: "Resource", weeklyCapacity: 5, monthlyCapacity: 20, ...overrides });
const sprint = (overrides = {}) => ({ id: "s1", name: "Sprint", startDate: "2026-10-01", endDate: "2026-10-10", order: 0, ...overrides });
const version = (overrides = {}) => ({ id: "v1", name: "Before", createdAt: 1, tasks: [{ id: "old-task", name: "Old task", schedStart: "2026-09-01", schedFinish: "2026-09-02" }], ...overrides });
const project = (overrides = {}) => ({ schemaVersion: 1, exportedAt: "2026-10-06T12:00:00.000Z", tasks: [task()], resources: [resource()], sprints: [sprint()], versions: [], ...overrides });
const snapshot = (overrides = {}) => version({ rawTasks: [task()], rawResources: [resource()], rawSprints: [sprint()], hasFullSnapshot: true, ...overrides });
const key = ({ code, severity, path }) => ({ code, severity, path });

function importError(data) {
  try { normalizeImportedProject(data); } catch (error) { return error; }
  throw new Error("Expected import to fail");
}

describe("shared project validation", () => {
  it("round-trips current exports and accepts an empty project", () => {
    const seed = seedData();
    const data = buildProjectExport(seed.tasks, seed.resources, seed.sprints, [], true, seed.calendarExceptions);
    expect(validateProjectData(data)).toEqual([]);
    expect(normalizeImportedProject(data)).toEqual(data);
    expect(validateProjectData(project({ tasks: [], resources: [], sprints: [] }))).toEqual([]);
  });

  it("keeps emergency JSON export available for current data that needs repair", () => {
    const rawTasks = [task({ duration: -1 })];
    const versions = [snapshot({ rawTasks }), null];
    const out = buildProjectExport(rawTasks, [], [], versions, true);
    expect(out.tasks).toEqual(rawTasks);
    expect(out.versions[0].rawTasks).toEqual(rawTasks);
    expect(out.versions[1]).toBeNull();
    expect(() => JSON.stringify(out)).not.toThrow();
    const error = importError(out);
    expect(error.issues.map(item => item.path)).toEqual(expect.arrayContaining(["tasks[0].duration", "versions[0].rawTasks[0].duration", "versions[1]"]));
  });

  it("preserves schema-v1 optional omissions and cleared optional task dates", () => {
    const data = project({ tasks: [task({ startDate: "", fixedDate: "" })] });
    expect(normalizeImportedProject(data)).toMatchObject({ levelingOn: false, calendarExceptions: [] });
    expect(normalizeImportedProject(data).tasks).toEqual(data.tasks);
  });

  it.each([
    ["null project", () => null, "project-not-object", "$"],
    ["array project", () => [], "project-not-object", "$"],
    ["schema version", data => ({ ...data, schemaVersion: 2 }), "schema-version-invalid", "schemaVersion"],
    ["missing tasks", data => { delete data.tasks; return data; }, "tasks-invalid", "tasks"],
    ["tasks object", data => ({ ...data, tasks: {} }), "tasks-invalid", "tasks"],
    ["invalid export time", data => ({ ...data, exportedAt: "not a date" }), "exportedAt-invalid", "exportedAt"],
    ["impossible export date", data => ({ ...data, exportedAt: "2026-02-30T12:00:00Z" }), "exportedAt-invalid", "exportedAt"],
    ["null task", data => ({ ...data, tasks: [null] }), "task-not-object", "tasks[0]"],
    ["array task", data => ({ ...data, tasks: [[]] }), "task-not-object", "tasks[0]"],
    ["sparse task array", data => ({ ...data, tasks: new Array(1) }), "task-not-object", "tasks[0]"],
    ["missing name", data => { delete data.tasks[0].name; return data; }, "task-name-invalid", "tasks[0].name"],
    ["missing parent", data => { delete data.tasks[0].parentId; return data; }, "task-parentId-invalid", "tasks[0].parentId"],
    ["missing order", data => { delete data.tasks[0].order; return data; }, "task-order-invalid", "tasks[0].order"],
    ["reserved ID", data => ({ ...data, tasks: [task({ id: "__proto__" })] }), "task-id-invalid", "tasks[0].id"],
    ["string duration", data => ({ ...data, tasks: [task({ duration: "3" })] }), "task-duration-invalid", "tasks[0].duration"],
    ["negative duration", data => ({ ...data, tasks: [task({ duration: -1 })] }), "task-duration-invalid", "tasks[0].duration"],
    ["infinite duration", data => ({ ...data, tasks: [task({ duration: Infinity })] }), "task-duration-invalid", "tasks[0].duration"],
    ["null duration", data => ({ ...data, tasks: [task({ duration: null })] }), "task-duration-invalid", "tasks[0].duration"],
    ["invalid progress", data => ({ ...data, tasks: [task({ progress: 101 })] }), "task-progress-invalid", "tasks[0].progress"],
    ["invalid date", data => ({ ...data, tasks: [task({ startDate: "2026-02-29" })] }), "task-startDate-invalid", "tasks[0].startDate"],
    ["invalid fixed date", data => ({ ...data, tasks: [task({ fixedDate: "2026-13-01" })] }), "task-fixedDate-invalid", "tasks[0].fixedDate"],
    ["bad milestone", data => ({ ...data, tasks: [task({ milestone: "yes" })] }), "task-milestone-invalid", "tasks[0].milestone"],
    ["bad milestone mode", data => ({ ...data, tasks: [task({ milestoneMode: "manual" })] }), "task-milestoneMode-invalid", "tasks[0].milestoneMode"],
    ["bad sprint ID", data => ({ ...data, tasks: [task({ sprintIds: [7] })] }), "task-sprintId-invalid", "tasks[0].sprintIds[0]"],
    ["bad dependencies", data => ({ ...data, tasks: [task({ predecessors: {} })] }), "task-predecessors-invalid", "tasks[0].predecessors"],
    ["null dependency", data => ({ ...data, tasks: [task({ predecessors: [null] })] }), "dependency-not-object", "tasks[0].predecessors[0]"],
    ["bad dependency type", data => ({ ...data, tasks: [task({ predecessors: [{ id: "t2", type: "XX", lag: 0 }] })] }), "dependency-type-invalid", "tasks[0].predecessors[0].type"],
    ["missing dependency lag", data => ({ ...data, tasks: [task({ predecessors: [{ id: "t2", type: "FS" }] })] }), "dependency-lag-invalid", "tasks[0].predecessors[0].lag"],
    ["missing parent ref", data => ({ ...data, tasks: [task({ parentId: "gone" })] }), "parent-missing", "tasks[0].parentId"],
    ["missing predecessor ref", data => ({ ...data, tasks: [task({ predecessors: [{ id: "gone", type: "FS", lag: 0 }] })] }), "predecessor-missing", "tasks[0].predecessors[0].id"],
    ["duplicate task ID", data => ({ ...data, tasks: [task(), task()] }), "duplicate-task-id", "tasks[1].id"],
    ["parent cycle", data => ({ ...data, tasks: [task({ parentId: "t1" })] }), "parent-cycle", "tasks[0].parentId"],
    ["null resource", data => ({ ...data, resources: [null] }), "resource-not-object", "resources[0]"],
    ["missing capacity", data => { delete data.resources[0].weeklyCapacity; return data; }, "resource-weeklyCapacity-invalid", "resources[0].weeklyCapacity"],
    ["negative capacity", data => ({ ...data, resources: [resource({ monthlyCapacity: -1 })] }), "resource-monthlyCapacity-invalid", "resources[0].monthlyCapacity"],
    ["duplicate resource ID", data => ({ ...data, resources: [resource(), resource()] }), "duplicate-resource-id", "resources[1].id"],
    ["null sprint", data => ({ ...data, sprints: [null] }), "sprint-not-object", "sprints[0]"],
    ["missing sprint date", data => { delete data.sprints[0].startDate; return data; }, "sprint-startDate-invalid", "sprints[0].startDate"],
    ["reversed sprint range", data => ({ ...data, sprints: [sprint({ endDate: "2026-09-01" })] }), "sprint-date-range-invalid", "sprints[0].endDate"],
    ["duplicate sprint ID", data => ({ ...data, sprints: [sprint(), sprint()] }), "duplicate-sprint-id", "sprints[1].id"],
    ["wrong leveling type", data => ({ ...data, levelingOn: "false" }), "levelingOn-invalid", "levelingOn"],
    ["null calendar", data => ({ ...data, calendarExceptions: null }), "calendarExceptions-invalid", "calendarExceptions"],
    ["null exception", data => ({ ...data, calendarExceptions: [null] }), "calendar-exception-not-object", "calendarExceptions[0]"],
    ["bad exception date", data => ({ ...data, calendarExceptions: [{ date: "2026-02-30", type: "holiday" }] }), "calendar-exception-date-invalid", "calendarExceptions[0].date"],
    ["bad exception type", data => ({ ...data, calendarExceptions: [{ date: "2026-10-06", type: "other" }] }), "calendar-exception-type-invalid", "calendarExceptions[0].type"],
    ["bad exception name", data => ({ ...data, calendarExceptions: [{ date: "2026-10-06", type: "holiday", name: {} }] }), "calendar-exception-name-invalid", "calendarExceptions[0].name"],
  ])("blocks %s with a localized, actionable path", (_, mutate, code, path) => {
    const data = mutate(project());
    const error = importError(data);
    expect(error.message).toBe("invalid_project_json");
    expect(error.issues).toEqual(validateProjectData(data));
    const found = error.issues.find(item => item.code === code && item.path === path);
    expect(found).toBeDefined();
    expect(isBlockingProjectIssue(found)).toBe(true);
    expect(formatProjectIssue(createAppTranslator("ja"), found)).toBeTruthy();
    expect(formatProjectIssue(createAppTranslator("en"), found)).toBeTruthy();
    expect(formatProjectIssue(createAppTranslator("ja"), found)).not.toBe(formatProjectIssue(createAppTranslator("en"), found));
    expect(found).not.toHaveProperty("message");
    expect(found).not.toHaveProperty("messageEn");
    expect(found.params).toBeTypeOf("object");
  });

  it("keeps recoverable schedule constraints and missing optional references importable", () => {
    const data = project({ tasks: [
      task({ assigneeId: "old", sprintIds: ["old"], predecessors: [{ id: "t2", type: "FS", lag: 0 }] }),
      task({ id: "t2", order: 1, predecessors: [{ id: "t1", type: "FS", lag: 0 }] }),
      task({ id: "t3", order: 2, predecessors: [{ id: "t3", type: "FS", lag: 0 }] }),
    ], sprints: [sprint(), sprint({ id: "s2" })], calendarExceptions: [
      { date: "2026-10-06", type: "holiday" }, { date: "2026-10-06", type: "workday" },
    ] });
    const issues = validateProjectData(data);
    expect(issues.map(item => item.code)).toEqual(expect.arrayContaining(["dependency-cycle", "self-dependency", "assignee-missing", "sprint-missing", "sprint-overlap", "calendar-exception-conflict"]));
    expect(issues.some(isBlockingProjectIssue)).toBe(false);
    expect(issues.filter(item => item.severity === "error").every(item => item.blocking === false)).toBe(true);
    expect(normalizeImportedProject(data).tasks).toEqual(data.tasks);
  });

  it("uses the same validation in embedded JSON imports", () => {
    const bad = project({ tasks: [null] });
    let error;
    try { parseEmbeddedProject(JSON.stringify(bad)); } catch (caught) { error = caught; }
    expect(error.issues.map(key)).toEqual(validateProjectData(bad).map(key));
  });

  it("does not mutate inputs or retain references in normalized data", () => {
    const data = project({ tasks: [task({ predecessors: [] })], versions: [snapshot()] });
    const before = structuredClone(data);
    const result = normalizeImportedProject(data);
    result.tasks[0].name = "new";
    result.versions[0].rawTasks[0].name = "new";
    expect(data).toEqual(before);
    expect(validateProjectData(data)).toEqual([]);
    expect(checkFieldShapes(project())).toEqual([]); // validating WBS snapshot fields never changes task requirements
  });
});

describe("version snapshots", () => {
  it("keeps pre-WBS comparison-only snapshots and does not require current resource references", () => {
    const data = project({ versions: [version({ tasks: [{ id: "historic", name: "Historic", assigneeId: "deleted-resource" }] })] });
    const result = normalizeImportedProject(data);
    expect(result.versions[0]).toMatchObject({ hasFullSnapshot: false });
    expect(result.versions[0].tasks).toEqual(data.versions[0].tasks);
    expect(validateProjectData(data)).toEqual([]);
  });

  it("recomputes full-snapshot capability and allows the older missing raw calendar", () => {
    const result = normalizeImportedProject(project({ versions: [snapshot({ hasFullSnapshot: false })] }));
    expect(result.versions[0].hasFullSnapshot).toBe(true);
    expect(result.versions[0].rawCalendarExceptions).toBeUndefined();
  });

  it.each([
    [null, "version-not-object", "versions[0]"],
    [version({ tasks: [null] }), "version-task-not-object", "versions[0].tasks[0]"],
    [version({ tasks: {} }), "version-tasks-invalid", "versions[0].tasks"],
    [version({ createdAt: "yesterday" }), "version-createdAt-invalid", "versions[0].createdAt"],
    [version({ hasWbsInfo: "yes" }), "version-hasWbsInfo-invalid", "versions[0].hasWbsInfo"],
    [version({ hasWbsInfo: true }), "version-task-level-invalid", "versions[0].tasks[0].level"],
    [version({ tasks: [{ id: "x", name: "X", schedFinish: "nope" }] }), "version-task-schedFinish-invalid", "versions[0].tasks[0].schedFinish"],
    [version({ tasks: [{ id: "x", name: "X", duration: "1" }] }), "version-task-duration-invalid", "versions[0].tasks[0].duration"],
    [version({ tasks: [{ id: "x", name: "X" }, { id: "x", name: "X" }] }), "duplicate-version-task-id", "versions[0].tasks[1].id"],
    [version({ hasFullSnapshot: true }), "version-snapshot-incomplete", "versions[0].rawTasks"],
    [version({ rawTasks: [null] }), "task-not-object", "versions[0].rawTasks[0]"],
    [version({ rawResources: [null] }), "resource-not-object", "versions[0].rawResources[0]"],
    [version({ rawSprints: [null] }), "sprint-not-object", "versions[0].rawSprints[0]"],
    [version({ rawCalendarExceptions: [{ date: "invalid", type: "holiday" }] }), "calendar-exception-date-invalid", "versions[0].rawCalendarExceptions[0].date"],
    [snapshot({ rawTasks: [task({ parentId: "missing" })] }), "parent-missing", "versions[0].rawTasks[0].parentId"],
    [snapshot({ rawTasks: [task({ predecessors: [{ id: "missing", type: "FS", lag: 0 }] })] }), "predecessor-missing", "versions[0].rawTasks[0].predecessors[0].id"],
    [snapshot({ rawResources: [resource(), resource()] }), "duplicate-resource-id", "versions[0].rawResources[1].id"],
  ])("validates present comparison and raw data (%s)", (value, code, path) => {
    expect(importError(project({ versions: [value] })).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code, path, severity: "error" })]));
  });

  it("rejects duplicate version IDs and non-arrays before cloning", () => {
    expect(importError(project({ versions: [version(), version()] })).issues.map(item => item.code)).toContain("duplicate-version-id");
    for (const values of [null, undefined, {}]) expect(() => normalizeProjectVersions(values)).toThrow("invalid_project_json");
  });
});

describe("prepareProjectImport", () => {
  it("merges atomically: incoming IDs win, local-only versions stay, newest first", () => {
    const current = [version({ id: "local", createdAt: 5 }), version({ id: "v1", name: "old", createdAt: 2 })];
    const raw = project({ versions: [version({ id: "v1", name: "incoming", createdAt: 10 })] });
    const currentBefore = structuredClone(current), rawBefore = structuredClone(raw);
    const { data, issues } = prepareProjectImport(raw, current);
    expect(data.versions.map(value => [value.id, value.name])).toEqual([["v1", "incoming"], ["local", "Before"]]);
    expect(issues).toEqual([]);
    data.versions[1].tasks[0].name = "changed";
    expect(current).toEqual(currentBefore);
    expect(raw).toEqual(rawBefore);
  });

  it("empty imported versions preserve current order; replace mode does not merge", () => {
    const current = [version({ id: "v1", createdAt: 1 }), version({ id: "v2", createdAt: 2 })];
    expect(prepareProjectImport(project(), current).data.versions.map(value => value.id)).toEqual(["v1", "v2"]);
    expect(prepareProjectImport(project(), current, { mergeVersions: false }).data.versions).toEqual([]);
  });

  it("does not change the current plan or versions when import or merge preparation fails", () => {
    const currentPlan = project({ levelingOn: true, calendarExceptions: [{ date: "2026-10-05", type: "holiday" }], versions: [version()] });
    const before = structuredClone(currentPlan);
    expect(() => prepareProjectImport(project({ tasks: [null] }), currentPlan.versions)).toThrow("invalid_project_json");
    expect(currentPlan).toEqual(before);
    const brokenVersions = [version({ rawTasks: [null] })];
    const brokenBefore = structuredClone(brokenVersions);
    expect(() => prepareProjectImport(project(), brokenVersions)).toThrow("invalid_project_json");
    expect(brokenVersions).toEqual(brokenBefore);
    expect(currentPlan).toEqual(before);
  });

  it("returns successful import's nonblocking issues without changing their contract", () => {
    const raw = project({ tasks: [task({ assigneeId: "missing" })] });
    expect(prepareProjectImport(raw).issues).toEqual(validateProjectData(raw));
    expect(analyzeIntegrity(raw)).toEqual(validateProjectData(raw));
  });
});

describe("local editing-state compatibility", () => {
  const options = { allowEditingValues: true };
  it.each([
    ["blank sprint start", data => { data.sprints[0].startDate = ""; }],
    ["blank sprint end", data => { data.sprints[0].endDate = ""; }],
    ["reversed sprint range", data => { data.sprints[0].endDate = "2026-09-01"; }],
    ["negative weekly capacity", data => { data.resources[0].weeklyCapacity = -1; }],
    ["negative monthly capacity", data => { data.resources[0].monthlyCapacity = -2; }],
    ["blank calendar exception date", data => { data.calendarExceptions = [{ date: "", type: "holiday", name: "Editing holiday" }]; }],
  ])("restores %s only with an explicit local editing option, including snapshots", (_, edit) => {
    const data = project();
    edit(data);
    data.versions = [snapshot({ rawTasks: data.tasks, rawResources: data.resources, rawSprints: data.sprints, ...(data.calendarExceptions ? { rawCalendarExceptions: data.calendarExceptions } : {}) })];
    const before = structuredClone(data);
    expect(() => normalizeImportedProject(data)).toThrow("invalid_project_json");
    expect(() => normalizeProjectVersions(data.versions)).toThrow("invalid_project_json");
    expect(checkFieldShapes(data, options)).toEqual([]);
    expect(analyzeIntegrity(data, options)).toEqual([]);
    expect(validateProjectData(data, options)).toEqual([]);
    expect(normalizeImportedProject(data, options).tasks).toEqual(data.tasks);
    expect(normalizeProjectVersions(data.versions, options)).toEqual(data.versions);
    expect(() => prepareProjectImport(data, [], options)).toThrow("invalid_project_json"); // Import preparation never enables local exceptions for incoming JSON.
    expect(data).toEqual(before);
  });

  it.each([
    data => { data.sprints[0].startDate = "2026-02-30"; },
    data => { data.sprints[0].endDate = null; },
    data => { data.resources[0].weeklyCapacity = "-1"; },
    data => { data.resources[0].monthlyCapacity = -Infinity; },
    data => { data.tasks[0].duration = -1; },
    data => { data.tasks[0].progress = -1; },
    data => { data.tasks[0].parentId = "missing"; },
    data => { data.tasks.push(task()); },
  ])("does not relax other invalid data or broken references", edit => {
    const data = project();
    edit(data);
    expect(() => normalizeImportedProject(data, options)).toThrow("invalid_project_json");
    expect(validateProjectData(data, options).some(isBlockingProjectIssue)).toBe(true);
  });
});


describe("strict incoming imports with retained local editing snapshots", () => {
  it("retains locally saved editing values without accepting them from the incoming JSON", () => {
    const local = snapshot({ rawResources: [resource({ weeklyCapacity: -1 })], rawSprints: [sprint({ startDate: "" })] });
    const before = structuredClone(local);
    const { data, issues } = prepareProjectImport(project(), [local]);
    expect(data.versions).toEqual([local]);
    expect(issues.some(isBlockingProjectIssue)).toBe(false);
    expect(local).toEqual(before);
    expect(() => prepareProjectImport(project({ versions: [local] }), [], { allowEditingValues: true })).toThrow("invalid_project_json");
    expect(() => prepareProjectImport(project({ resources: local.rawResources }), [version()])).toThrow("invalid_project_json");
  });

  it("lets strict incoming versions replace matching local editing snapshots", () => {
    const local = snapshot({ rawSprints: [sprint({ endDate: "" })] });
    const incoming = version({ name: "Replacement", createdAt: 5 });
    const { data } = prepareProjectImport(project({ versions: [incoming] }), [local]);
    expect(data.versions).toEqual([{ ...incoming, hasFullSnapshot: false }]);
  });
});
