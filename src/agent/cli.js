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

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isISODate(v) {
  if (typeof v !== "string" || !ISO_DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && v === d.toISOString().slice(0, 10);
}
function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

/** タスク/リソース/スプリントのフィールド型・日付書式を検査する。
 *  normalizeImportedProject はトップレベル形状しか見ないため、ここで計算を壊す値
 *  （不正な日付・非数値の工数・id欠落・不正な依存タイプ等）を error として拾う。 */
export function checkFieldShapes(data) {
  const issues = [];
  const label = (t, i) => `タスク#${i + 1}${t && t.name ? `「${t.name}」` : t && t.id ? `（id: ${t.id}）` : ""}`;
  const DEP_TYPES = new Set(["FS", "SS", "FF", "SF"]);

  (data.tasks || []).forEach((t, i) => {
    if (typeof t !== "object" || t === null) {
      issues.push({ severity: "error", code: "task-not-object", message: `タスク#${i + 1} がオブジェクトではありません` });
      return;
    }
    if (typeof t.id !== "string" || !t.id) {
      issues.push({ severity: "error", code: "task-id-invalid", message: `${label(t, i)} の id が文字列ではありません` });
    }
    if (t.parentId != null && typeof t.parentId !== "string") {
      issues.push({ severity: "error", code: "task-parentId-invalid", ids: [t.id], message: `${label(t, i)} の parentId が文字列でも null でもありません` });
    }
    if (t.startDate != null && !isISODate(t.startDate)) {
      issues.push({ severity: "error", code: "task-startDate-invalid", ids: [t.id], message: `${label(t, i)} の startDate「${t.startDate}」が YYYY-MM-DD 形式ではありません` });
    }
    if (t.fixedDate != null && !isISODate(t.fixedDate)) {
      issues.push({ severity: "error", code: "task-fixedDate-invalid", ids: [t.id], message: `${label(t, i)} の fixedDate「${t.fixedDate}」が YYYY-MM-DD 形式ではありません` });
    }
    if (t.duration != null && !isFiniteNumber(t.duration)) {
      issues.push({ severity: "error", code: "task-duration-invalid", ids: [t.id], message: `${label(t, i)} の duration が数値ではありません` });
    }
    if (t.progress != null && !isFiniteNumber(t.progress)) {
      issues.push({ severity: "error", code: "task-progress-invalid", ids: [t.id], message: `${label(t, i)} の progress が数値ではありません` });
    }
    if (t.sprintIds != null && !Array.isArray(t.sprintIds)) {
      issues.push({ severity: "error", code: "task-sprintIds-invalid", ids: [t.id], message: `${label(t, i)} の sprintIds が配列ではありません` });
    }
    if (t.predecessors != null && !Array.isArray(t.predecessors)) {
      issues.push({ severity: "error", code: "task-predecessors-invalid", ids: [t.id], message: `${label(t, i)} の predecessors が配列ではありません` });
    } else {
      (t.predecessors || []).forEach((p, j) => {
        if (typeof p !== "object" || p === null || typeof p.id !== "string" || !p.id) {
          issues.push({ severity: "error", code: "dependency-id-invalid", ids: [t.id], message: `${label(t, i)} の先行タスク#${j + 1} に id がありません` });
        }
        if (!DEP_TYPES.has(p && p.type)) {
          issues.push({ severity: "error", code: "dependency-type-invalid", ids: [t.id], message: `${label(t, i)} の先行タスク#${j + 1} の type「${p && p.type}」が FS/SS/FF/SF ではありません` });
        }
        if (p && p.lag != null && !isFiniteNumber(p.lag)) {
          issues.push({ severity: "error", code: "dependency-lag-invalid", ids: [t.id], message: `${label(t, i)} の先行タスク#${j + 1} の lag が数値ではありません` });
        }
      });
    }
  });

  (data.resources || []).forEach((r, i) => {
    if (typeof r !== "object" || r === null || typeof r.id !== "string" || !r.id) {
      issues.push({ severity: "error", code: "resource-id-invalid", message: `リソース#${i + 1} の id が文字列ではありません` });
    }
    if (r && r.weeklyCapacity != null && !isFiniteNumber(r.weeklyCapacity)) {
      issues.push({ severity: "error", code: "resource-weeklyCapacity-invalid", message: `リソース#${i + 1} の weeklyCapacity が数値ではありません` });
    }
    if (r && r.monthlyCapacity != null && !isFiniteNumber(r.monthlyCapacity)) {
      issues.push({ severity: "error", code: "resource-monthlyCapacity-invalid", message: `リソース#${i + 1} の monthlyCapacity が数値ではありません` });
    }
  });

  (data.sprints || []).forEach((s, i) => {
    if (typeof s !== "object" || s === null || typeof s.id !== "string" || !s.id) {
      issues.push({ severity: "error", code: "sprint-id-invalid", message: `スプリント#${i + 1} の id が文字列ではありません` });
    }
    if (s && s.startDate != null && !isISODate(s.startDate)) {
      issues.push({ severity: "error", code: "sprint-startDate-invalid", message: `スプリント#${i + 1} の startDate「${s.startDate}」が YYYY-MM-DD 形式ではありません` });
    }
    if (s && s.endDate != null && !isISODate(s.endDate)) {
      issues.push({ severity: "error", code: "sprint-endDate-invalid", message: `スプリント#${i + 1} の endDate「${s.endDate}」が YYYY-MM-DD 形式ではありません` });
    }
  });

  return issues;
}

/** parentId チェーンの循環（自己参照・相互参照）を検出する。同じ循環は1件だけ返す。 */
export function findParentCycles(tasks) {
  const byId = new Map(tasks.map(t => [t.id, t]));
  const cycles = [];
  const reportedKeys = new Set();
  const settled = new Set(); // 循環でないと確定済みの起点
  for (const start of tasks) {
    if (settled.has(start.id)) continue;
    const path = [];
    const inPath = new Set();
    let cur = start;
    let hitCycle = false;
    while (cur && cur.parentId != null) {
      if (inPath.has(cur.id)) {
        const cyc = path.slice(path.indexOf(cur.id));
        const key = [...cyc].sort().join(" ");
        if (!reportedKeys.has(key)) {
          reportedKeys.add(key);
          cycles.push(cyc);
        }
        hitCycle = true;
        break;
      }
      path.push(cur.id);
      inPath.add(cur.id);
      cur = byId.get(cur.parentId);
    }
    if (!hitCycle) path.forEach(id => settled.add(id));
  }
  return cycles;
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

/** フィールド型・参照整合性・循環依存（依存関係／親子）・スプリント重複を検査して issue 配列を返す。 */
export function analyzeIntegrity(data) {
  const tasks = data.tasks || [];

  // 型・書式の検査を先に行う。ここで error が出た場合、以降の参照チェックや
  // findDependencyCycles は不正な値で誤動作しうるため、フィールド検査の結果だけ返す。
  const shapeIssues = checkFieldShapes(data);
  if (shapeIssues.some(i => i.severity === "error")) return shapeIssues;

  const issues = [...shapeIssues];

  const seen = new Set();
  const dup = new Set();
  for (const t of tasks) {
    if (seen.has(t.id)) dup.add(t.id);
    seen.add(t.id);
  }
  for (const id of dup) {
    issues.push({ severity: "error", code: "duplicate-task-id", ids: [id], message: `タスクID「${id}」が重複しています` });
  }

  for (const cyc of findParentCycles(tasks)) {
    issues.push({
      severity: "error",
      code: "parent-cycle",
      ids: cyc,
      message: `親子関係が循環しています: ${cyc.map(id => nameOf(tasks, id)).join(" → ")}`,
    });
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
 *  グループとサマリー以外の全リーフの startDate に、respectManualPins:false の CPM 結果の
 *  schedStart を書き戻す。schedStart は runCPM の選択ロジックにより、固定マイルストーン自身は
 *  LS/LF（＝fixedDate 由来）、それ以外は ES/EF（最短）となる（CLAUDE.md 準拠）。
 *  リソース平準化後の日付は焼き込まない。App のボタンと完全に一致させるため、ここでも
 *  固定マイルストーンを特別扱いしない（＝アプリと CLI で結果がずれないようにする）。 */
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

/** computeSchedule を安全に呼ぶ。整合性検査をすり抜けた不正値でも例外を投げず、
 *  呼び出し側で扱えるようにする（スタックトレースではなく整形済みエラーを返す）。 */
function tryComputeSchedule(data, opts) {
  try {
    return { ok: true, result: computeSchedule(data, opts) };
  } catch (e) {
    return { ok: false, error: `スケジュール計算に失敗しました: ${String((e && e.message) || e)}` };
  }
}

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
  const beforeComputed = tryComputeSchedule(original, { respectManualPins: true, leveling: beforeLeveling });
  if (!beforeComputed.ok) {
    return emit({ command: "plan", original: originalPath, edited: editedPath, blocked: true, reason: beforeComputed.error, integrityIssues: analyzeIntegrity(original) });
  }
  const before = beforeComputed.result;

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
  const computed = tryComputeSchedule(data, { respectManualPins: true, leveling });
  if (!computed.ok) {
    return emit({ command: "explain", file: path, computeFailed: true, error: computed.error, integrityIssues: analyzeIntegrity(data) });
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
