/* =========================================================================================
   AIエージェント向けスケジューリングエンジンの集約点
   ------------------------------------------------------------------------------------------
   src/lib/ の純粋ロジックを、CLI（src/agent/cli.js）から必要な分だけ再エクスポートする薄い層。
   ここに新しいロジックを書かないこと（ロジックの正は src/lib/、テスト対象も src/lib/）。
   esbuild で .claude/skills/schedule-adjust/cli.mjs へバンドルする際のエントリの一部。
   ========================================================================================= */

export { toISO, parseISO, buildHolidayMap, makeCalendar, fmtJP } from "../lib/calendar.js";
export {
  runCPM, levelResources, rollupSummaries, deriveProjectStart,
  candidateFromDep, earliestSprintFloor,
} from "../lib/scheduling.js";
export { detectSprintConflicts, computeOverlappingSprintIds } from "../lib/sprints.js";
export {
  normalizeImportedProject, buildProjectExport,
  PROJECT_JSON_SCHEMA, PROJECT_SCHEMA_VERSION,
} from "../lib/exportUtils.js";
export {
  buildFlatList, isGroupId, migrateSprintIds, effectivePredecessors,
} from "../lib/taskTree.js";
