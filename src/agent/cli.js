/* =========================================================================================
   AIエージェントによるスケジュール調整用CLI
   ------------------------------------------------------------------------------------------
   Project Scheduler の保存JSON（schemaVersion: 1）を入力に、スケジュール計算・検証・変更影響の
   レポートを行う。このスクリプトは【JSONファイルを一切書き換えない】。保存はSkill手順に従って
   エージェントが行う（＝レポートをユーザーに提示し、保存可否の判断を仰いだうえで書き込む）。

   使い方:
     node cli.mjs validate <file> [--leveling on|off|auto]
     node cli.mjs recalc   <file> [--leveling on|off|auto]
     node cli.mjs plan     <original.json> <edited.json> [--leveling on|off|auto]
     node cli.mjs explain  <file> --task <taskId> [--leveling on|off|auto]

   出力は常に構造化JSON（stdout）。エージェントが日本語サマリーへ整形して提示する。
   ロジックの正は src/lib/。このファイルとバンドル成果物 cli.mjs には計算ロジックを書かない。
   ========================================================================================= */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  toISO, buildHolidayMap, makeCalendar,
  runCPM, buildDisplaySchedule, deriveProjectStart,
  candidateFromDep, earliestSprintFloor, computeAutoSchedule,
  idleSegments,
  detectSprintConflicts,
  detectDependencyIssues, SCHEDULE_DEPENDENCY_ISSUE_CODES,
  normalizeImportedProject,
  checkFieldShapes, analyzeIntegrity, findParentCycles, validateProjectData, projectDependencyIssue,
  buildFlatList, isGroupId, effectivePredecessors,
  createAppTranslator, formatProjectIssue, formatLevelWarning,
  formatSprintConflictReason, formatSprintConflictSprintNames,
} from "./engine.js";

// src/lib/ はメッセージをコード＋パラメータで返すため、レポートの文言はアプリと同じメッセージカタログ
// （src/messages/ja.json）から作る。CLI のレポートは日本語のまま出す。
const tJa = createAppTranslator("ja");

function formatIssue(issue) {
  return { ...issue, message: formatProjectIssue(tJa, issue) };
}

/* -------------------------------------------------------------------------------------------
   入出力
   ------------------------------------------------------------------------------------------- */

function fail(message, extra = {}) {
  process.stdout.write(JSON.stringify({ ok: false, error: message, ...extra }, null, 2) + "\n");
  process.exit(1);
}

function emit(obj) {
  process.stdout.write(JSON.stringify({ ok: true, ...obj }, null, 2) + "\n");
}

function readProjectFile(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    fail(`ファイルを読み込めません: ${path}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    fail(`JSONとして解釈できません: ${path}`, { detail: String(e && e.message || e) });
  }
  return parsed;
}

/** normalizeImportedProject を通し、失敗理由を日本語化して返す。 */
function normalizeOrFail(raw, path) {
  try {
    return normalizeImportedProject(raw);
  } catch (e) {
    if (e && e.message === "invalid_project_json") {
      fail(`保存フォーマットが正しくありません（schemaVersion:1 と必須項目を確認してください）: ${path}`, { issues: (e.issues || []).map(formatIssue) });
    }
    fail(`保存フォーマットを正規化できません: ${path}`, { detail: String(e && e.message || e) });
  }
}

/* -------------------------------------------------------------------------------------------
   引数パース（依存を持たない最小実装）
   ------------------------------------------------------------------------------------------- */

function parseArgs(argv) {
  const positional = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        opts[key] = true;
      } else {
        opts[key] = next;
        i++;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, opts };
}

function resolveLeveling(optValue, data) {
  const v = optValue === undefined ? "auto" : String(optValue).toLowerCase();
  if (v === "on") return true;
  if (v === "off") return false;
  if (v === "auto") return !!data.levelingOn;
  fail(`--leveling は on / off / auto のいずれかを指定してください（指定値: ${optValue}）`);
}

/* -------------------------------------------------------------------------------------------
   スケジュール計算（App.jsx の cpm / schedule useMemo と同じ手順）
   ------------------------------------------------------------------------------------------- */

function makeProjectCalendar(projectStart, calendarExceptions = []) {
  const y = Number(projectStart.slice(0, 4));
  return makeCalendar(buildHolidayMap(y - 1, y + 6), calendarExceptions);
}

/**
 * @param {object} data - 正規化済みプロジェクトデータ
 * @param {{respectManualPins?: boolean, leveling?: boolean}} opts
 */
export function computeSchedule(data, opts = {}) {
  const respectManualPins = opts.respectManualPins !== false;
  const leveling = !!opts.leveling;
  const tasks = data.tasks || [];
  const resources = data.resources || [];
  const sprints = data.sprints || [];
  const calendarExceptions = data.calendarExceptions || [];

  const projectStart = deriveProjectStart(tasks, toISO(new Date()));
  const cal = makeProjectCalendar(projectStart, calendarExceptions);
  const cpm = runCPM(tasks, cal, projectStart, sprints, { respectManualPins });

  // アプリの schedule useMemo と同じ組み立て（src/lib/scheduling.js の buildDisplaySchedule）。
  const display = buildDisplaySchedule(tasks, cpm.result, resources, cal, sprints, { leveling });
  const { schedule } = display;
  const levelWarnings = display.levelWarnings.map(w => formatLevelWarning(tJa, w));

  let projectEnd = cpm.projectEnd;
  schedule.forEach(v => { if (v.schedFinish && v.schedFinish > projectEnd) projectEnd = v.schedFinish; });

  const sprintConflicts = detectSprintConflicts(tasks, sprints, schedule).map(formatSprintConflict);
  // アプリのヘッダー「依存関係の矛盾」・WBS表・ガントチャートと同じ判定（src/lib/dependencyIssues.js）。
  const dependencyIssues = detectDependencyIssues(tasks, schedule, cal).map(issue => formatDependencyIssue(issue, tasks));

  return { projectStart, cal, cpm, schedule, projectEnd, leveling, levelWarnings, sprintConflicts, dependencyIssues };
}

/** buildFlatList 順（WBS表示順）でスケジュール行を整形する。 */
export function scheduleRows(data, schedule) {
  return buildFlatList(data.tasks, new Set()).map(t => {
    const s = schedule.get(t.id) || {};
    return {
      id: t.id,
      wbsNo: t.wbsNo,
      name: t.name,
      level: t.level,
      isGroup: t.hasChildren,
      assigneeId: t.assigneeId || null,
      milestone: !!t.milestone,
      milestoneMode: t.milestone ? (t.milestoneMode || "flexible") : undefined,
      duration: typeof t.duration === "number" ? t.duration : undefined,
      progress: typeof s.progress === "number" ? s.progress : (t.progress || 0),
      schedStart: s.schedStart ?? null,
      schedFinish: s.schedFinish ?? null,
      critical: !!s.critical,
      float: typeof s.float === "number" ? s.float : null,
      governed: !!s.governed,
    };
  });
}

/* -------------------------------------------------------------------------------------------
   検証（スキーマ ＋ 参照整合性 ＋ 循環依存）
   ------------------------------------------------------------------------------------------- */

/** Keep dependency diagnostics in the shared severity/code/path format. */
function formatDependencyIssue(issue, tasks) {
  return formatIssue(projectDependencyIssue(issue, tasks));
}

/** src/lib/sprints.js の判定結果（理由はコード＋パラメータ）を、レポート用の文言（sprintName・reasons）へ整形する。 */
function formatSprintConflict(conflict) {
  const { taskId, name, wbsNo, reasons } = conflict;
  return {
    taskId, name, wbsNo,
    sprintName: formatSprintConflictSprintNames(tJa, conflict),
    reasons: reasons.map(r => formatSprintConflictReason(tJa, r)),
  };
}

export { checkFieldShapes, analyzeIntegrity, findParentCycles };

/* -------------------------------------------------------------------------------------------
   バージョンスナップショット（App.jsx saveVersion と同一構造）
   ------------------------------------------------------------------------------------------- */

export function buildVersionSnapshot(data, schedule, name) {
  const flatAll = buildFlatList(data.tasks, new Set());
  const tasks = flatAll.map(t => {
    const s = schedule.get(t.id) || {};
    return {
      id: t.id,
      name: t.name,
      level: t.level,
      wbsNo: t.wbsNo,
      hasChildren: t.hasChildren,
      schedStart: s.schedStart,
      schedFinish: s.schedFinish,
      critical: !!s.critical,
      milestone: !!t.milestone,
      duration: typeof t.duration === "number" ? t.duration : null,
      assigneeId: t.assigneeId || null,
      progress: typeof s.progress === "number" ? s.progress : 0,
    };
  });
  return {
    id: `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    createdAt: Date.now(),
    tasks,
    hasWbsInfo: true,
    rawTasks: JSON.parse(JSON.stringify(data.tasks)),
    rawResources: JSON.parse(JSON.stringify(data.resources || [])),
    rawSprints: JSON.parse(JSON.stringify(data.sprints || [])),
    rawCalendarExceptions: JSON.parse(JSON.stringify(data.calendarExceptions || [])),
    hasFullSnapshot: true,
  };
}

/** 「自動スケジューリング実行」（App.jsx runScheduling）と同じ書き戻し。
 *  グループとサマリー以外の全リーフの startDate に、respectManualPins:false の CPM 結果の
 *  schedStart を書き戻す。schedStart は runCPM の選択ロジックにより、固定マイルストーン自身は
 *  LS/LF（＝fixedDate 由来）、それ以外は ES/EF（最短）となる（CLAUDE.md 準拠）。
 *  opts.leveling が true のときは、平準化後の配置日（＝平準化ON時の表示スケジュールと一致する
 *  日付）を書き戻す（autoScheduleStartDates 参照）。App のボタンと結果を揃えるため、
 *  固定マイルストーンを特別扱いしない（＝アプリと CLI で結果がずれないようにする）。 */
export function applyAutoSchedule(data, projectStart, cal, opts = {}) {
  const { startDates, converged } = computeAutoSchedule(
    data.tasks, cal, projectStart, data.sprints || [], data.resources || [],
    { leveling: !!opts.leveling }
  );
  const changed = [];
  const tasks = data.tasks.map(t => {
    if (isGroupId(data.tasks, t.id) || !startDates.has(t.id)) return t;
    const to = startDates.get(t.id);
    if (t.startDate !== to) changed.push({ id: t.id, from: t.startDate ?? null, to });
    return { ...t, startDate: to };
  });
  // converged: 平準化ONで、書き戻した開始日と表示（平準化後の配置日）の一致を確認できたか
  return { tasks, changed, converged };
}

/* -------------------------------------------------------------------------------------------
   コマンド
   ------------------------------------------------------------------------------------------- */

/** computeSchedule を安全に呼ぶ。整合性検査をすり抜けた不正値でも例外を投げず、
 *  呼び出し側で扱えるようにする（スタックトレースではなく整形済みエラーを返す）。 */
function tryComputeSchedule(data, opts) {
  try {
    return { ok: true, result: computeSchedule(data, opts) };
  } catch (e) {
    return { ok: false, error: `スケジュール計算に失敗しました: ${String((e && e.message) || e)}` };
  }
}

/** ID重複・親子関係の循環など、スケジュールを計算しても意味のある結果にならない整合性エラー（型エラーは別途判定）。 */
const SCHEDULE_BLOCKING_CODES = new Set(["duplicate-task-id", "parent-cycle"]);

/**
 * validate の本体（ファイル入出力を除いた純粋な処理）。参照整合性（analyzeIntegrity）に加え、表示スケジュールを
 * 計算して開始日との矛盾・固定マイルストーンの期日超過（アプリと同じ判定）を issues に追加する。
 * 型エラー・ID重複・親子関係の循環がある場合はスケジュールを使う判定を行わない（scheduleChecks.performed=false）。
 * @param {object} data - 正規化済みプロジェクトデータ
 * @param {{leveling?: boolean}} [opts] - 表示スケジュールの平準化条件（既定はデータの levelingOn）
 */
export function validateProject(data, opts = {}) {
  const leveling = opts.leveling === undefined ? !!data?.levelingOn : !!opts.leveling;
  const issues = data && Object.hasOwn(data, "schemaVersion") ? validateProjectData(data) : analyzeIntegrity(data);
  let scheduleChecks;
  const blocking = checkFieldShapes(data).find(i => i.severity === "error")
    || issues.find(i => i.severity === "error" && SCHEDULE_BLOCKING_CODES.has(i.code));
  if (blocking) {
    scheduleChecks = { performed: false, leveling, reason: `整合性エラー（${blocking.code}）があるため、日程に関する依存関係の検査を行いませんでした` };
  } else {
    const computed = tryComputeSchedule(data, { respectManualPins: true, leveling });
    if (computed.ok) {
      const scheduleCodes = new Set(SCHEDULE_DEPENDENCY_ISSUE_CODES);
      issues.push(...computed.result.dependencyIssues.filter(i => scheduleCodes.has(i.code)));
      scheduleChecks = { performed: true, leveling };
    } else {
      scheduleChecks = { performed: false, leveling, reason: computed.error };
    }
  }
  return { valid: !issues.some(i => i.severity === "error"), issues: issues.map(formatIssue), scheduleChecks };
}

function cmdValidate(positional, opts) {
  const [path] = positional;
  if (!path) fail("使い方: validate <file> [--leveling on|off|auto]");
  const raw = readProjectFile(path);

  let data;
  try {
    data = normalizeImportedProject(raw);
  } catch (e) {
    const schemaError = e && e.message === "invalid_project_json";
    return emit({
      command: "validate",
      file: path,
      valid: false,
      schemaValid: false,
      issues: e?.issues?.map(formatIssue) || [{
        severity: "error",
        path: "$",
        code: schemaError ? "schema" : "normalize",
        message: schemaError
          ? "保存フォーマットが正しくありません（schemaVersion:1 と必須トップレベル項目 tasks/resources/sprints/versions/exportedAt を確認してください）"
          : String(e && e.message || e),
      }],
    });
  }

  const leveling = resolveLeveling(opts.leveling, data);
  const { valid, issues, scheduleChecks } = validateProject(data, { leveling });
  emit({
    command: "validate",
    file: path,
    valid,
    schemaValid: true,
    scheduleChecks,
    counts: {
      tasks: data.tasks.length,
      resources: data.resources.length,
      sprints: data.sprints.length,
      versions: data.versions.length,
    },
    issues,
  });
}

function cmdRecalc(positional, opts) {
  const [path] = positional;
  if (!path) fail("使い方: recalc <file> [--leveling on|off|auto]");
  const data = normalizeOrFail(readProjectFile(path), path);

  const integrity = analyzeIntegrity(data).map(formatIssue);
  const leveling = resolveLeveling(opts.leveling, data);
  const computed = tryComputeSchedule(data, { respectManualPins: true, leveling });
  if (!computed.ok) {
    return emit({ command: "recalc", file: path, computeFailed: true, error: computed.error, integrityIssues: integrity });
  }
  const r = computed.result;

  emit({
    command: "recalc",
    file: path,
    conditions: {
      leveling,
      levelingSource: opts.leveling === undefined || String(opts.leveling).toLowerCase() === "auto" ? "json" : "override",
      projectStart: r.projectStart,
      respectManualPins: true,
    },
    projectEnd: r.projectEnd,
    tasks: scheduleRows(data, r.schedule),
    sprintConflicts: r.sprintConflicts,
    levelWarnings: r.levelWarnings,
    dependencyIssues: r.dependencyIssues,
    integrityIssues: integrity,
  });
}

function cmdPlan(positional, opts) {
  const [originalPath, editedPath] = positional;
  if (!originalPath || !editedPath) {
    fail("使い方: plan <original.json> <edited.json> [--reschedule] [--leveling on|off|auto]");
  }

  const original = normalizeOrFail(readProjectFile(originalPath), originalPath);
  const edited = normalizeOrFail(readProjectFile(editedPath), editedPath);

  // 編集後データの整合性を先に確認。error があれば提案JSONは出さない。
  const integrity = analyzeIntegrity(edited).map(formatIssue);
  if (integrity.some(i => i.severity === "error")) {
    return emit({
      command: "plan",
      original: originalPath,
      edited: editedPath,
      blocked: true,
      reason: "編集後データに整合性エラーがあります。修正してから再実行してください。",
      integrityIssues: integrity,
    });
  }

  // --reschedule: 「自動スケジューリング実行」相当で全リーフの startDate を依存関係ベースの
  // 日程へ書き戻す（平準化OFFなら CPM 最短、ON なら平準化後の配置日。autoScheduleStartDates 参照）。
  // 既定（なし）: ユーザーの編集内容だけを反映し、既存の startDate ピンはそのまま残す。
  const reschedule = !!opts.reschedule;
  const beforeLeveling = !!original.levelingOn;
  const afterLeveling = resolveLeveling(opts.leveling, edited);

  // before: 元データを「現在アプリで見えている」条件で計算（差分とスナップショットの基準）
  const beforeComputed = tryComputeSchedule(original, { respectManualPins: true, leveling: beforeLeveling });
  if (!beforeComputed.ok) {
    return emit({ command: "plan", original: originalPath, edited: editedPath, blocked: true, reason: beforeComputed.error, integrityIssues: analyzeIntegrity(original).map(formatIssue) });
  }
  const before = beforeComputed.result;

  let proposedTasks = edited.tasks;
  let startDateChanges = [];
  let rescheduleConverged = null;
  if (reschedule) {
    const editedProjectStart = deriveProjectStart(edited.tasks, toISO(new Date()));
    const editedCal = makeProjectCalendar(editedProjectStart, edited.calendarExceptions || []);
    const applied = applyAutoSchedule(edited, editedProjectStart, editedCal, { leveling: afterLeveling });
    proposedTasks = applied.tasks;
    startDateChanges = applied.changed;
    rescheduleConverged = applied.converged;
  }

  // 提案JSON: versions 先頭に「調整前」スナップショットを追加
  const snapshotName = `AI調整前 ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
  const proposed = {
    ...edited,
    tasks: proposedTasks,
    levelingOn: afterLeveling,
    versions: [buildVersionSnapshot(original, before.schedule, snapshotName), ...edited.versions],
    exportedAt: new Date().toISOString(),
  };

  // after: 提案JSONを表示条件で計算（保存後にアプリで見えるスケジュール）
  const afterComputed = tryComputeSchedule(proposed, { respectManualPins: true, leveling: afterLeveling });
  if (!afterComputed.ok) {
    return emit({ command: "plan", original: originalPath, edited: editedPath, blocked: true, reason: afterComputed.error, integrityIssues: integrity });
  }
  const after = afterComputed.result;
  const leveling = afterLeveling;

  const beforeRows = scheduleRows(original, before.schedule);
  const afterRows = scheduleRows(proposed, after.schedule);
  const beforeById = new Map(beforeRows.map(r => [r.id, r]));
  const afterIds = new Set(afterRows.map(r => r.id));

  const scheduleChanges = [];
  for (const a of afterRows) {
    const b = beforeById.get(a.id);
    if (!b) {
      scheduleChanges.push({ id: a.id, wbsNo: a.wbsNo, name: a.name, kind: "added", schedStart: a.schedStart, schedFinish: a.schedFinish, critical: a.critical });
      continue;
    }
    const startChanged = b.schedStart !== a.schedStart;
    const finishChanged = b.schedFinish !== a.schedFinish;
    const critChanged = b.critical !== a.critical;
    if (!startChanged && !finishChanged && !critChanged) continue;
    let shiftWorkdays;
    if (startChanged && b.schedStart && a.schedStart) {
      shiftWorkdays = after.cal.workdaysBetween(b.schedStart, a.schedStart);
    }
    scheduleChanges.push({
      id: a.id, wbsNo: a.wbsNo, name: a.name, kind: "changed",
      ...(startChanged ? { schedStart: { from: b.schedStart, to: a.schedStart } } : {}),
      ...(finishChanged ? { schedFinish: { from: b.schedFinish, to: a.schedFinish } } : {}),
      ...(critChanged ? { critical: { from: b.critical, to: a.critical } } : {}),
      ...(shiftWorkdays !== undefined ? { shiftWorkdays } : {}),
    });
  }
  for (const b of beforeRows) {
    if (!afterIds.has(b.id)) scheduleChanges.push({ id: b.id, wbsNo: b.wbsNo, name: b.name, kind: "removed" });
  }

  const newlyCritical = scheduleChanges.filter(c => c.critical && c.critical.from === false && c.critical.to === true).map(c => ({ id: c.id, wbsNo: c.wbsNo, name: c.name }));
  const noLongerCritical = scheduleChanges.filter(c => c.critical && c.critical.from === true && c.critical.to === false).map(c => ({ id: c.id, wbsNo: c.wbsNo, name: c.name }));

  emit({
    command: "plan",
    original: originalPath,
    edited: editedPath,
    blocked: false,
    conditions: {
      mode: reschedule ? "reschedule" : "adjust",
      leveling,
      levelingSource: opts.leveling === undefined || String(opts.leveling).toLowerCase() === "auto" ? "json" : "override",
      levelingChanged: beforeLeveling !== afterLeveling,
      projectStart: after.projectStart,
    },
    summary: {
      projectEnd: { from: before.projectEnd, to: after.projectEnd },
      tasksWithChangedSchedule: scheduleChanges.filter(c => c.kind === "changed").length,
      startDateWritebacks: startDateChanges.length,
      // --reschedule 時のみ。false なら書き戻した開始日と表示（平準化後の配置日）の一致を確認できていない
      rescheduleConverged,
      newlyCritical,
      noLongerCritical,
      snapshotName,
    },
    startDateChanges,
    scheduleChanges,
    sprintConflicts: { before: before.sprintConflicts, after: after.sprintConflicts },
    levelWarnings: { before: before.levelWarnings, after: after.levelWarnings },
    dependencyIssues: { before: before.dependencyIssues, after: after.dependencyIssues },
    integrityIssues: integrity,
    proposed,
  });
}

function cmdExplain(positional, opts) {
  const [path] = positional;
  const taskId = opts.task;
  if (!path || !taskId) fail("使い方: explain <file> --task <taskId> [--leveling on|off|auto]");
  const data = normalizeOrFail(readProjectFile(path), path);
  const task = data.tasks.find(t => t.id === taskId);
  if (!task) fail(`タスクが見つかりません: ${taskId}`);

  const leveling = resolveLeveling(opts.leveling, data);
  const computed = tryComputeSchedule(data, { respectManualPins: true, leveling });
  if (!computed.ok) {
    return emit({ command: "explain", file: path, computeFailed: true, error: computed.error, integrityIssues: analyzeIntegrity(data).map(formatIssue) });
  }
  const r = computed.result;
  const s = r.schedule.get(taskId) || {};

  const byId = {};
  data.tasks.forEach(t => (byId[t.id] = t));
  const sprintById = {};
  (data.sprints || []).forEach(sp => (sprintById[sp.id] = sp));

  let predecessors = [];
  if (!isGroupId(data.tasks, taskId)) {
    predecessors = effectivePredecessors(byId, task).map(dep => {
      const ps = r.schedule.get(dep.id) || {};
      let candidate = null;
      if (ps.schedStart && ps.schedFinish) {
        candidate = candidateFromDep(r.cal, dep, { start: ps.schedStart, finish: ps.schedFinish }, task.duration || 0).start;
      }
      return {
        id: dep.id,
        name: nameOf(data.tasks, dep.id),
        type: dep.type,
        lag: dep.lag,
        predFinish: ps.schedFinish ?? null,
        impliedStart: candidate,
      };
    });
  }
  const bindingPred = predecessors.reduce((best, p) => {
    if (!p.impliedStart) return best;
    if (!best || p.impliedStart > best.impliedStart) return p;
    return best;
  }, null);

  const sprintFloor = earliestSprintFloor(task.sprintIds, sprintById, r.cal);
  const isPinned = (task.progress || 0) > 0 || !!task.startDate;
  // スプリントフロアが「効いた」＝ピン留めされておらず、依存関係が示す開始日よりフロアが後で、
  // かつ最終的な schedStart がフロアと一致している場合のみ true（依存とフロアがたまたま同日の誤検出を避ける）。
  const sprintFloorApplied = !!(
    sprintFloor && s.schedStart && sprintFloor === s.schedStart && !isPinned
    && (!bindingPred || !bindingPred.impliedStart || sprintFloor > bindingPred.impliedStart)
  );

  emit({
    command: "explain",
    file: path,
    task: {
      id: task.id,
      name: task.name,
      duration: task.duration ?? null,
      startDate: task.startDate ?? null,
      progress: task.progress || 0,
      milestone: !!task.milestone,
      milestoneMode: task.milestone ? (task.milestoneMode || "flexible") : null,
      fixedDate: task.fixedDate ?? null,
      sprintIds: task.sprintIds || [],
    },
    conditions: { leveling, projectStart: r.projectStart },
    schedule: {
      ES: s.ES ?? null, EF: s.EF ?? null, LS: s.LS ?? null, LF: s.LF ?? null,
      schedStart: s.schedStart ?? null, schedFinish: s.schedFinish ?? null,
      float: typeof s.float === "number" ? s.float : null,
      critical: !!s.critical,
      governed: !!s.governed,
    },
    drivers: {
      pinned: isPinned,
      pinnedReason: (task.progress || 0) > 0
        ? "進捗率が入力済み（着手済み）のため開始日に固定"
        : (task.startDate ? "開始日が手入力されているため通常表示では固定（自動スケジューリング実行では無視）" : null),
      bindingPredecessor: bindingPred ? { id: bindingPred.id, name: bindingPred.name, impliedStart: bindingPred.impliedStart } : null,
      sprintFloor,
      sprintFloorApplied,
      fixedMilestoneBackward: !!(task.milestone && task.milestoneMode === "fixed"),
    },
    predecessors,
    // 日別割当（平準化ONでは担当者の稼働上限に合わせて延長した割当、OFFでは開始日からの連続配分）。
    // idleSegments は期間内で稼働上限により割当がなかった稼働日の区間と理由（daily=他タスクで埋まっている）。
    allocation: s.allocation ? {
      allocatedDays: s.allocation.alloc.length,
      days: s.allocation.alloc,
      idleSegments: idleSegments(s.allocation.idle, s.allocation.alloc).map(seg => ({
        ...seg,
        taskNames: seg.taskIds.map(id => nameOf(data.tasks, id)),
      })),
      overCapacity: !!s.allocation.overCapacity,
    } : null,
    dependencyIssues: r.dependencyIssues.filter(i => i.ids.includes(taskId)),
  });
}

/* -------------------------------------------------------------------------------------------
   エントリ
   ------------------------------------------------------------------------------------------- */

function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, opts } = parseArgs(rest);

  switch (command) {
    case "validate": return cmdValidate(positional, opts);
    case "recalc": return cmdRecalc(positional, opts);
    case "plan": return cmdPlan(positional, opts);
    case "explain": return cmdExplain(positional, opts);
    case undefined:
    case "--help":
    case "help":
      process.stdout.write([
        "Project Scheduler — スケジュール調整CLI",
        "",
        "  validate <file> [--leveling on|off|auto]",
        "  recalc   <file> [--leveling on|off|auto]",
        "  plan     <original.json> <edited.json> [--reschedule] [--leveling on|off|auto]",
        "  explain  <file> --task <taskId> [--leveling on|off|auto]",
        "",
        "出力は構造化JSON。このCLIはJSONファイルを書き換えません。",
        "",
      ].join("\n"));
      process.exit(command === undefined ? 1 : 0);
      break;
    default:
      fail(`不明なコマンド: ${command}`);
  }
}

// 直接実行された場合のみ main() を走らせる（テストから import しても副作用が出ないようにする）。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
