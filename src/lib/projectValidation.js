/* Shared, side-effect-free validation for browser imports and the scheduling CLI.
 * Validate before cloning: JSON cloning would hide non-finite numbers and bad values.
 * Scheduling errors (dependency cycles/self-dependencies) remain CLI errors, but are
 * nonblocking on import so an exported plan can be reopened and repaired in the UI.
 */
import { detectDependencyIssues } from "./dependencyIssues.js";
import { computeOverlappingSprintIds } from "./sprints.js";

export const PROJECT_SCHEMA_VERSION = 1;
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isNumber = value => typeof value === "number" && Number.isFinite(value);
const isString = value => typeof value === "string";
// Several calculation helpers use object dictionaries and the WBS root sentinel.
const isId = value => isString(value) && !!value.trim() && value !== "__root__" && !Object.hasOwn(Object.prototype, value);
const has = (object, key) => Object.hasOwn(object, key) && object[key] !== undefined;

export function isISODate(value) {
  if (!isString(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isISODateTime(value) {
  if (!isString(value)) return false;
  const match = /^(\d{4}-\d{2}-\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/.exec(value);
  return !!match && isISODate(match[1]) && +match[2] < 24 && +match[3] < 60 && +match[4] < 60
    && (!match[5] || (+match[5] < 24 && +match[6] < 60)) && Number.isFinite(Date.parse(value));
}

function issue(severity, code, path, messageKey, params = {}, extra = {}) {
  return { severity, code, path, messageKey: `projectValidation.${messageKey}`, params, ...extra };
}
export const isBlockingProjectIssue = item => item.severity === "error" && item.blocking !== false;

function fields(value, path, kind, definitions, issues) {
  if (!isObject(value)) {
    issues.push(issue("error", `${kind}-not-object`, path, "object"));
    return false;
  }
  for (const [key, check, required, messageKey] of definitions) {
    if ((!has(value, key) && required) || (has(value, key) && !check(value[key]))) {
      issues.push(issue("error", `${kind}-${key}-invalid`, `${path}.${key}`, messageKey, { field: key },
        isString(value.id) ? { ids: [value.id] } : {}));
    }
  }
  return true;
}
const field = (key, check, required, messageKey) => [key, check, required, messageKey];
const idField = field("id", isId, true, "id");
const nameField = field("name", isString, true, "string");
const nonnegative = value => isNumber(value) && value >= 0;
const numberField = (key, required = false, check = isNumber) => field(key, check, required,
  check === nonnegative ? "nonnegativeNumber" : "number");
const stringField = (key, required = false) => field(key, isString, required, "string");
const booleanField = key => field(key, value => typeof value === "boolean", false, "boolean");
const dateField = (key, required = false, allowEmpty = false) => field(key, value => (allowEmpty && value === "") || isISODate(value), required, "date");
const progressField = field("progress", value => isNumber(value) && value >= 0 && value <= 100, false, "progress");
const taskFields = [
  idField, nameField,
  field("parentId", value => value === null || isId(value), true, "nullableId"),
  numberField("order", true), dateField("startDate", false, true), dateField("fixedDate", false, true),
  numberField("duration", false, nonnegative), numberField("savedDuration", false, nonnegative), progressField,
  field("assigneeId", value => value === null || isId(value), false, "nullableId"),
  booleanField("milestone"), field("milestoneMode", value => ["flexible", "fixed"].includes(value), false, "milestoneMode"),
  stringField("notes"), numberField("diagX"), numberField("diagY"),
  // Older schema-v1 tasks may still carry this field; callers retain their existing migration policy.
  field("sprintId", value => value === null || isId(value), false, "nullableId"),
];
const resourceFields = [idField, nameField, numberField("weeklyCapacity", true, nonnegative), numberField("monthlyCapacity", true, nonnegative)];
const sprintFields = [idField, nameField, stringField("theme"), dateField("startDate", true), dateField("endDate", true), numberField("order", true)];
const exceptionFields = [dateField("date", true), field("type", value => ["holiday", "workday"].includes(value), true, "calendarType"), stringField("name")];

function arrayField(object, key, path, required, issues, visit, code = `${key}-invalid`) {
  if (!has(object, key) && !required) return;
  if (!Array.isArray(object[key])) {
    issues.push(issue("error", code, path, "array"));
    return;
  }
  for (let i = 0; i < object[key].length; i++) visit(object[key][i], `${path}[${i}]`, i);
}

function checkTask(value, path, issues) {
  if (!fields(value, path, "task", taskFields, issues)) return;
  arrayField(value, "sprintIds", `${path}.sprintIds`, false, issues, (id, itemPath) => {
    if (!isId(id)) issues.push(issue("error", "task-sprintId-invalid", itemPath, "id", {}, { ids: [value.id] }));
  }, "task-sprintIds-invalid");
  arrayField(value, "predecessors", `${path}.predecessors`, false, issues, (dep, itemPath) => {
    fields(dep, itemPath, "dependency", [idField,
      field("type", type => ["FS", "SS", "FF", "SF"].includes(type), true, "dependencyType"),
      numberField("lag", true),
    ], issues);
  }, "task-predecessors-invalid");
}

function checkCollections(data, paths, issues, { allowEditingValues = false } = {}) {
  // Browser editors can persist incomplete sprint ranges, cleared calendar dates
  // and negative capacity inputs. Only local restoration opts into these states.
  const resourceDefinitions = allowEditingValues
    ? [idField, nameField, numberField("weeklyCapacity", true), numberField("monthlyCapacity", true)] : resourceFields;
  const sprintDefinitions = allowEditingValues
    ? [idField, nameField, stringField("theme"), dateField("startDate", true, true), dateField("endDate", true, true), numberField("order", true)] : sprintFields;
  const exceptionDefinitions = allowEditingValues
    ? [dateField("date", true, true), ...exceptionFields.slice(1)] : exceptionFields;
  arrayField(data, "tasks", paths.tasks, false, issues, (value, path) => checkTask(value, path, issues));
  arrayField(data, "resources", paths.resources, false, issues, (value, path) => fields(value, path, "resource", resourceDefinitions, issues));
  arrayField(data, "sprints", paths.sprints, false, issues, (value, path) => {
    if (fields(value, path, "sprint", sprintDefinitions, issues) && !allowEditingValues && isISODate(value.startDate) && isISODate(value.endDate) && value.startDate > value.endDate) {
      issues.push(issue("error", "sprint-date-range-invalid", `${path}.endDate`, "dateRange", {}, { ids: [value.id] }));
    }
  });
  arrayField(data, "calendarExceptions", paths.calendarExceptions, false, issues, (value, path) => fields(value, path, "calendar-exception", exceptionDefinitions, issues));
}

const rootPaths = { tasks: "tasks", resources: "resources", sprints: "sprints", calendarExceptions: "calendarExceptions" };
function rawSnapshot(version, path) {
  const data = {}, paths = {};
  for (const key of Object.keys(rootPaths)) {
    const rawKey = `raw${key[0].toUpperCase()}${key.slice(1)}`;
    paths[key] = `${path}.${rawKey}`;
    if (has(version, rawKey)) data[key] = version[rawKey];
  }
  return { data, paths };
}

function checkVersion(value, path, issues, options) {
  if (!fields(value, path, "version", [idField, nameField,
    field("createdAt", value => isNumber(value) && Number.isFinite(new Date(value).getTime()), true, "timestamp"),
    booleanField("hasWbsInfo"), booleanField("hasFullSnapshot"), booleanField("rawLevelingOn"),
  ], issues)) return;
  arrayField(value, "tasks", `${path}.tasks`, true, issues, (task, taskPath) => {
    const definitions = [idField, nameField, field("level", value => Number.isInteger(value) && value >= 0, false, "nonnegativeInteger"),
      stringField("wbsNo"), booleanField("hasChildren"), booleanField("critical"), booleanField("milestone"),
      dateField("schedStart"), dateField("schedFinish"),
      numberField("duration", false, value => value === null || nonnegative(value)),
      field("assigneeId", id => id === null || isId(id), false, "nullableId"), progressField].map(definition => [...definition]);
    // Pre-WBS comparison-only snapshots omit these fields. Validate them when present;
    // newer snapshots explicitly advertising WBS information must include its fields.
    if (value.hasWbsInfo === true) {
      for (const definition of definitions) {
        if (["level", "wbsNo", "hasChildren", "critical", "milestone", "assigneeId", "progress"].includes(definition[0])) definition[2] = true;
      }
    }
    if (fields(task, taskPath, "version-task", definitions, issues) && isISODate(task.schedStart) && isISODate(task.schedFinish) && task.schedFinish < task.schedStart) {
      issues.push(issue("error", "version-task-date-range-invalid", `${taskPath}.schedFinish`, "dateRange", {}, { ids: [task.id] }));
    }
  }, "version-tasks-invalid");
  const snapshot = rawSnapshot(value, path);
  checkCollections(snapshot.data, snapshot.paths, issues, options);
  if (value.hasFullSnapshot === true) {
    for (const key of ["rawTasks", "rawResources", "rawSprints"]) {
      if (!has(value, key)) issues.push(issue("error", "version-snapshot-incomplete", `${path}.${key}`, "snapshotMissing"));
    }
  }
}

/** Shape checks accept partial in-memory projects, while validateProjectData also
 * requires the schema-v1 envelope. Optional omissions are never coerced bad values. */
export function checkFieldShapes(data, options = {}) {
  const issues = [];
  if (!isObject(data)) return [issue("error", "project-not-object", "$", "object")];
  checkCollections(data, rootPaths, issues, options);
  if (has(data, "levelingOn") && typeof data.levelingOn !== "boolean") issues.push(issue("error", "levelingOn-invalid", "levelingOn", "boolean", { field: "levelingOn" }));
  arrayField(data, "versions", "versions", false, issues, (value, path) => checkVersion(value, path, issues, options));
  return issues;
}

/** Parent cycles are unsafe tree data, unlike repairable dependency cycles. */
export function findParentCycles(tasks) {
  const byId = new Map(tasks.map(task => [task.id, task]));
  const cycles = [], settled = new Set();
  for (const start of tasks) {
    const route = [], indices = new Map();
    let task = start;
    while (task && !settled.has(task.id)) {
      if (indices.has(task.id)) { cycles.push(route.slice(indices.get(task.id))); break; }
      indices.set(task.id, route.length);
      route.push(task.id);
      task = task.parentId == null ? null : byId.get(task.parentId);
    }
    route.forEach(id => settled.add(id));
  }
  return cycles;
}

function duplicateIds(values, path, kind, issues) {
  const seen = new Set();
  values.forEach((value, i) => {
    if (seen.has(value.id)) issues.push(issue("error", `duplicate-${kind}-id`, `${path}[${i}].id`, "duplicateId", { id: value.id }, { ids: [value.id] }));
    seen.add(value.id);
  });
  return seen;
}

/** Shared adaptation of dependency diagnostics. Keep route separately from the
 * JSON location so every project issue uses the same path contract. */
export function projectDependencyIssue(value, tasks, path = "tasks") {
  const { params, path: dependencyPath, ...detail } = value;
  const index = tasks.findIndex(task => task.id === value.ids[0]);
  const task = tasks[index];
  const depIndex = task?.predecessors?.findIndex(dep => dep.id === value.predecessorId) ?? -1;
  const location = index < 0 ? path : `${path}[${index}].predecessors${depIndex < 0 ? "" : `[${depIndex}].id`}`;
  return {
    ...detail, path: location,
    ...(dependencyPath ? { dependencyPath } : {}),
    ...(value.code === "dependency-cycle" || value.code === "self-dependency" ? { blocking: false } : {}),
    messageKey: "projectValidation.dependency",
    params: { ...params, subjectName: task?.name || task?.id || null },
  };
}

function collectionIntegrity(data, paths, issues) {
  const tasks = data.tasks || [], resources = data.resources || [], sprints = data.sprints || [];
  const taskIds = duplicateIds(tasks, paths.tasks, "task", issues);
  const resourceIds = duplicateIds(resources, paths.resources, "resource", issues);
  const sprintIds = duplicateIds(sprints, paths.sprints, "sprint", issues);
  const cycles = findParentCycles(tasks);
  for (const ids of cycles) {
    const index = tasks.findIndex(task => task.id === ids[0]);
    issues.push(issue("error", "parent-cycle", `${paths.tasks}[${index}].parentId`, "parentCycle", { route: ids }, { ids }));
  }
  const groups = new Set(tasks.map(task => task.parentId));
  tasks.forEach((task, i) => {
    const path = `${paths.tasks}[${i}]`;
    if (task.parentId != null && !taskIds.has(task.parentId)) issues.push(issue("error", "parent-missing", `${path}.parentId`, "parentMissing", { id: task.parentId }, { ids: [task.id] }));
    if (task.assigneeId && !resourceIds.has(task.assigneeId)) issues.push(issue("warning", "assignee-missing", `${path}.assigneeId`, "assigneeMissing", { id: task.assigneeId }, { ids: [task.id] }));
    (task.sprintIds || (task.sprintId ? [task.sprintId] : [])).forEach((id, j) => {
      if (!sprintIds.has(id)) issues.push(issue("warning", "sprint-missing", task.sprintIds ? `${path}.sprintIds[${j}]` : `${path}.sprintId`, "sprintMissing", { id }, { ids: [task.id] }));
    });
    if (task.predecessors?.length && groups.has(task.id)) issues.push(issue("warning", "group-has-predecessors", `${path}.predecessors`, "groupPredecessors", { name: task.name }, { ids: [task.id] }));
  });
  // Invalid trees/duplicate IDs must not reach graph and WBS traversal helpers.
  if (!cycles.length && taskIds.size === tasks.length) {
    issues.push(...detectDependencyIssues(tasks).map(value => projectDependencyIssue(value, tasks, paths.tasks)));
  }
  const overlaps = [...computeOverlappingSprintIds(sprints)];
  if (overlaps.length) issues.push(issue("warning", "sprint-overlap", paths.sprints, "sprintOverlap", { ids: overlaps }, { ids: overlaps }));
  const byDate = new Map();
  (data.calendarExceptions || []).forEach((exception, i) => {
    const prev = byDate.get(exception.date);
    if (prev && prev !== exception.type) issues.push(issue("warning", "calendar-exception-conflict", `${paths.calendarExceptions}[${i}].type`, "calendarConflict", { date: exception.date }));
    byDate.set(exception.date, exception.type);
  });
}

export function analyzeIntegrity(data, options = {}) {
  const issues = checkFieldShapes(data, options);
  if (issues.some(isBlockingProjectIssue)) return issues;
  collectionIntegrity(data, rootPaths, issues);
  duplicateIds(data.versions || [], "versions", "version", issues);
  (data.versions || []).forEach((version, i) => {
    const path = `versions[${i}]`;
    duplicateIds(version.tasks, `${path}.tasks`, "version-task", issues);
    const snapshot = rawSnapshot(version, path);
    collectionIntegrity(snapshot.data, snapshot.paths, issues);
  });
  return issues;
}

/** Return all safe-to-evaluate content issues, including paths into snapshots.
 * Unknown extension fields are retained for task/version forward compatibility. */
export function validateProjectData(data, options = {}) {
  if (!isObject(data)) return checkFieldShapes(data, options);
  const issues = [];
  if (data.schemaVersion !== PROJECT_SCHEMA_VERSION) issues.push(issue("error", "schema-version-invalid", "schemaVersion", "schemaVersion", { version: PROJECT_SCHEMA_VERSION }));
  if (!isISODateTime(data.exportedAt)) issues.push(issue("error", "exportedAt-invalid", "exportedAt", "dateTime", { field: "exportedAt" }));
  for (const key of ["tasks", "resources", "sprints", "versions"]) {
    if (!has(data, key)) issues.push(issue("error", `${key}-invalid`, key, "requiredArray"));
  }
  return [...issues, ...analyzeIntegrity(data, options)];
}
