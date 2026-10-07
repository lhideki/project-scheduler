import { normalizeImportedProject } from "./exportUtils.js";
import { migrateSprintIds } from "./taskTree.js";

/** ローカル保存の旧形式のみを現行検証へ渡す。tasks: [] は保存済み計画として扱う。 */
export function normalizeStoredProject(project, versions, fallbackResources = []) {
  const candidate = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    projectName: project.projectName,
    tasks: project.tasks,
    resources: project.resources === undefined ? fallbackResources : project.resources,
    sprints: project.sprints === undefined ? [] : project.sprints,
    versions,
    levelingOn: project.levelingOn === undefined ? false : project.levelingOn,
    calendarExceptions: project.calendarExceptions === undefined ? [] : project.calendarExceptions,
  };
  // 不正要素は共通バリデーターに渡し、移行処理自体で例外にしない。
  if (Array.isArray(candidate.tasks)) {
    candidate.tasks = candidate.tasks.map(task => task && typeof task === "object" ? migrateSprintIds([task])[0] : task);
  }
  return normalizeImportedProject(candidate, { allowEditingValues: true });
}
