/* =========================================================================================
   AIエージェントによるスケジュール調整用CLI
   ------------------------------------------------------------------------------------------
   Project Scheduler の保存JSON（schemaVersion: 1）を入力に、スケジュール計算・検証・変更影響の
   レポートを行う。このスクリプトは【JSONファイルを一切書き換えない】。保存はSkill手順に従って
   エージェントが行う（＝レポートをユーザーに提示し、保存可否の判断を仰いだうえで書き込む）。

   使い方:
     node cli.mjs validate <file>
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
  runCPM, levelResources, rollupSummaries, deriveProjectStart,
  candidateFromDep, earliestSprintFloor,
  detectSprintConflicts, computeOverlappingSprintIds,
  normalizeImportedProject,
  buildFlatList, isGroupId, effectivePredecessors,
} from "./engine.js";

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
      fail(`保存フォーマットが正しくありません（schemaVersion:1 と必須項目を確認してください）: ${path}`);
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

function makeProjectCalendar(projectStart) {
  const y = Number(projectStart.slice(0, 4));
  return makeCalendar(buildHolidayMap(y - 1, y + 6));
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

  const projectStart = deriveProjectStart(tasks, toISO(new Date()));
  const cal = makeProjectCalendar(projectStart);
  const cpm = runCPM(tasks, cal, projectStart, sprints, { respectManualPins });

  let schedule = cpm.result;
  let levelWarnings = [];
  if (leveling) {
    const { placed, warnings } = levelResources(tasks, cpm.result, resources, cal, sprints);
    const merged = new Map(cpm.result);
    for (const [id, dates] of Object.entries(placed)) {
      const prev = merged.get(id) || {};
      merged.set(id, { ...prev, schedStart: dates.start, schedFinish: dates.finish });
    }
    rollupSummaries(tasks, merged);
    schedule = merged;
    levelWarnings = warnings;
  }

  let projectEnd = cpm.projectEnd;
  schedule.forEach(v => { if (v.schedFinish && v.schedFinish > projectEnd) projectEnd = v.schedFinish; });

  const sprintConflicts = detectSprintConflicts(tasks, sprints, schedule);

  return { projectStart, cal, cpm, schedule, projectEnd, leveling, levelWarnings, sprintConflicts };
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

function nameOf(tasks, id) {
  const t = tasks.find(x => x.id === id);
  return t ? t.name : id;
}

export function findDependencyCycles(tasks) {
  const adj = new Map(tasks.map(t => [t.id, []]));
  for (const t of tasks) {
    for (const p of t.predecessors || []) {
      if (adj.has(p.id)) adj.get(p.id).push(t.id);
    }
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(tasks.map(t => [t.id, WHITE]));
  const stack = [];
  const cycles = [];
  const dfs = (u) => {
    color.set(u, GRAY);
    stack.push(u);
    for (const v of adj.get(u) || []) {
      if (color.get(v) === GRAY) {
        const i = stack.indexOf(v);
        if (i >= 0) cycles.push(stack.slice(i).concat(v));
      } else if (color.get(v) === WHITE) {
        dfs(v);
      }
    }
    stack.pop();
    color.set(u, BLACK);
  };
  for (const t of tasks) if (color.get(t.id) === WHITE) dfs(t.id);
  return cycles;
}

/** 参照整合性・循環依存・スプリント重複を検査して issue 配列を返す。 */
export function analyzeIntegrity(data) {
  const issues = [];
  const tasks = data.tasks || [];

  const seen = new Set();
  const dup = new Set();
  for (const t of tasks) {
    if (seen.has(t.id)) dup.add(t.id);
    seen.add(t.id);
  }
  for (const id of dup) {
    issues.push({ severity: "error", code: "duplicate-task-id", ids: [id], message: `タスクID「${id}」が重複しています` });
  }

  const taskIds = seen;
  const resIds = new Set((data.resources || []).map(r => r.id));
  const sprintIds = new Set((data.sprints || []).map(s => s.id));

  for (const t of tasks) {
    if (t.parentId != null && !taskIds.has(t.parentId)) {
      issues.push({ severity: "error", code: "parent-missing", ids: [t.id], message: `「${t.name}」の親タスク「${t.parentId}」が存在しません` });
    }
    if (t.assigneeId && !resIds.has(t.assigneeId)) {
      issues.push({ severity: "warning", code: "assignee-missing", ids: [t.id], message: `「${t.name}」の担当者「${t.assigneeId}」が存在しません` });
    }
    for (const sid of t.sprintIds || []) {
      if (!sprintIds.has(sid)) {
        issues.push({ severity: "warning", code: "sprint-missing", ids: [t.id], message: `「${t.name}」のスプリント参照「${sid}」が存在しません` });
      }
    }
    for (const p of t.predecessors || []) {
      if (p.id === t.id) {
        issues.push({ severity: "error", code: "self-dependency", ids: [t.id], message: `「${t.name}」が自分自身に依存しています` });
      } else if (!taskIds.has(p.id)) {
        issues.push({ severity: "error", code: "predecessor-missing", ids: [t.id], message: `「${t.name}」の先行タスク「${p.id}」が存在しません` });
      }
    }
    if ((t.predecessors || []).length && isGroupId(tasks, t.id)) {
      issues.push({ severity: "warning", code: "group-has-predecessors", ids: [t.id], message: `グループ「${t.name}」に先行タスクが設定されています（依存はリーフタスクに付けてください）` });
    }
  }

  for (const cyc of findDependencyCycles(tasks)) {
    issues.push({
      severity: "error",
      code: "dependency-cycle",
      ids: cyc,
      message: `循環依存: ${cyc.map(id => nameOf(tasks, id)).join(" → ")}`,
    });
  }

  const overlaps = computeOverlappingSprintIds(data.sprints || []);
  if (overlaps.size) {
    issues.push({ severity: "warning", code: "sprint-overlap", ids: [...overlaps], message: `期間が重複しているスプリントがあります: ${[...overlaps].join(", ")}` });
  }

  return issues;
}

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
    hasFullSnapshot: true,
  };
}

/** 「自動スケジューリング実行」（App.jsx runScheduling）と同じ書き戻し。
 *  固定マイルストーン自身以外は CPM の ES/EF を startDate に書き戻す（平準化後の日付は焼き込まない）。 */
export function applyAutoSchedule(data, projectStart, cal) {
  const auto = runCPM(data.tasks, cal, projectStart, data.sprints || [], { respectManualPins: false });
  const changed = [];
  const tasks = data.tasks.map(t => {
    if (isGroupId(data.tasks, t.id)) return t;
    const s = auto.result.get(t.id);
    if (!s || !s.schedStart || s.isSummary) return t;
    if (t.startDate !== s.schedStart) changed.push({ id: t.id, from: t.startDate ?? null, to: s.schedStart });
    return { ...t, startDate: s.schedStart };
  });
  return { tasks, changed };
}

/* -------------------------------------------------------------------------------------------
   コマンド
   ------------------------------------------------------------------------------------------- */

function cmdValidate(positional) {
  const [path] = positional;
  if (!path) fail("使い方: validate <file>");
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
      issues: [{
        severity: "error",
        code: schemaError ? "schema" : "normalize",
        message: schemaError
          ? "保存フォーマットが正しくありません（schemaVersion:1 と必須トップレベル項目 tasks/resources/sprints/versions/exportedAt を確認してください）"
          : String(e && e.message || e),
      }],
    });
  }

  const issues = analyzeIntegrity(data);
  const hasError = issues.some(i => i.severity === "error");
  emit({
    command: "validate",
    file: path,
    valid: !hasError,
    schemaValid: true,
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

  const integrity = analyzeIntegrity(data);
  const leveling = resolveLeveling(opts.leveling, data);
  const r = computeSchedule(data, { respectManualPins: true, leveling });

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
  const integrity = analyzeIntegrity(edited);
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

  // --reschedule: 「自動スケジューリング実行」相当で全リーフの startDate を CPM 最短へ書き戻す。
  // 既定（なし）: ユーザーの編集内容だけを反映し、既存の startDate ピンはそのまま残す。
  const reschedule = !!opts.reschedule;
  const beforeLeveling = !!original.levelingOn;
  const afterLeveling = resolveLeveling(opts.leveling, edited);

  // before: 元データを「現在アプリで見えている」条件で計算（差分とスナップショットの基準）
  const before = computeSchedule(original, { respectManualPins: true, leveling: beforeLeveling });

  let proposedTasks = edited.tasks;
  let startDateChanges = [];
  if (reschedule) {
    const editedProjectStart = deriveProjectStart(edited.tasks, toISO(new Date()));
    const editedCal = makeProjectCalendar(editedProjectStart);
    const applied = applyAutoSchedule(edited, editedProjectStart, editedCal);
    proposedTasks = applied.tasks;
    startDateChanges = applied.changed;
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
  const after = computeSchedule(proposed, { respectManualPins: true, leveling: afterLeveling });
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
      newlyCritical,
      noLongerCritical,
      snapshotName,
    },
    startDateChanges,
    scheduleChanges,
    sprintConflicts: { before: before.sprintConflicts, after: after.sprintConflicts },
    levelWarnings: { before: before.levelWarnings, after: after.levelWarnings },
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
  const r = computeSchedule(data, { respectManualPins: true, leveling });
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
        "  validate <file>",
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
