import { buildFlatList, migrateSprintIds, uid } from "./taskTree.js";

const cloneJSON = value => JSON.parse(JSON.stringify(value));

/** Capture the comparison schedule and its complete calculation inputs in UI/CLI alike. */
export function buildVersionSnapshot(data, schedule, name) {
  // Always number the fully expanded WBS so comparisons do not depend on UI folding.
  const tasks = buildFlatList(data.tasks, new Set()).map(task => {
    const result = schedule.get(task.id) || {};
    return {
      id: task.id, name: task.name, level: task.level, wbsNo: task.wbsNo, hasChildren: task.hasChildren,
      schedStart: result.schedStart, schedFinish: result.schedFinish, critical: !!result.critical,
      milestone: !!task.milestone, duration: typeof task.duration === "number" ? task.duration : null,
      assigneeId: task.assigneeId || null,
      progress: typeof result.progress === "number" ? result.progress : 0,
    };
  });
  return {
    id: uid("v"), name, createdAt: Date.now(), tasks, hasWbsInfo: true,
    rawTasks: cloneJSON(data.tasks),
    rawResources: cloneJSON(data.resources || []),
    rawSprints: cloneJSON(data.sprints || []),
    rawCalendarExceptions: cloneJSON(data.calendarExceptions || []),
    rawLevelingOn: !!data.levelingOn,
    hasFullSnapshot: true,
  };
}

/** Raw collections, not a claimed flag, distinguish restorable from comparison-only versions. */
export function hasFullVersionSnapshot(version) {
  return !!version && ["rawTasks", "rawResources", "rawSprints"].every(key => Array.isArray(version[key]));
}

/** Restore validated snapshot data without aliasing it. Legacy versions did not save
 * leveling: preserve the current setting because the original condition is unknown.
 * Callers must reset task history when applying the returned project context. */
export function restoreVersionSnapshot(version, currentLevelingOn = false) {
  if (!hasFullVersionSnapshot(version)) return null;
  return {
    tasks: migrateSprintIds(cloneJSON(version.rawTasks)),
    resources: cloneJSON(version.rawResources),
    sprints: cloneJSON(version.rawSprints),
    calendarExceptions: cloneJSON(version.rawCalendarExceptions || []),
    levelingOn: typeof version.rawLevelingOn === "boolean" ? version.rawLevelingOn : currentLevelingOn,
  };
}
