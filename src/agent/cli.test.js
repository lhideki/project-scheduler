import { describe, it, expect } from "vitest";

import { seedData } from "../lib/seedData.js";
import { buildProjectExport } from "../lib/exportUtils.js";
import { buildHolidayMap, makeCalendar, parseISO } from "../lib/calendar.js";
import { runCPM, levelResources, rollupSummaries, deriveProjectStart } from "../lib/scheduling.js";
import { detectDependencyIssues } from "../lib/dependencyIssues.js";
import {
  computeSchedule, scheduleRows, analyzeIntegrity, findParentCycles,
  checkFieldShapes, buildVersionSnapshot, applyAutoSchedule, validateProject,
} from "./cli.js";

function seedProject() {
  const s = seedData();
  return buildProjectExport(s.tasks, s.resources, s.sprints, [], false);
}

describe("computeSchedule", () => {
  it("App.jsx と同じ手順（projectStart 導出・holidayMap 範囲・runCPM）でスケジュールを計算する", () => {
    const data = seedProject();
    const r = computeSchedule(data, { respectManualPins: true, leveling: false });

    // App.jsx の cpm useMemo を忠実に再現した参照実装
    const dates = data.tasks.filter(t => t.startDate).map(t => t.startDate);
    const projectStart = dates.reduce((a, b) => (a < b ? a : b));
    const y = parseISO(projectStart).getUTCFullYear();
    const cal = makeCalendar(buildHolidayMap(y - 1, y + 6));
    const ref = runCPM(data.tasks, cal, projectStart, data.sprints);

    for (const [id, expected] of ref.result) {
      const got = r.schedule.get(id);
      expect(got.schedStart, id).toBe(expected.schedStart);
      expect(got.schedFinish, id).toBe(expected.schedFinish);
      expect(got.critical, id).toBe(expected.critical);
    }
  });

  it("leveling:auto はデータの levelingOn に従う（seed は false なので CPM 結果と一致）", () => {
    const data = seedProject();
    const off = computeSchedule(data, { leveling: false });
    const on = computeSchedule({ ...data, levelingOn: true }, { leveling: true });
    expect(off.projectEnd).toBeTruthy();
    expect(on.levelWarnings).toEqual([]);
  });

  it("seed データはスプリント矛盾・平準化警告を出さない", () => {
    const data = seedProject();
    const r = computeSchedule(data, { leveling: true });
    expect(r.sprintConflicts).toEqual([]);
    expect(r.levelWarnings).toEqual([]);
  });

  const finishOf = (data, r, name) => scheduleRows(data, r.schedule).find(row => row.name === name).schedFinish;

  it("calendarExceptions（休日指定）を反映してタスクの終了日が後ろ倒しになる", () => {
    const data = seedProject();
    const before = computeSchedule(data, { leveling: false });
    const start = parseISO(before.projectStart);
    const exceptions = [];
    for (let i = 1; i <= 12; i++) {
      const d = new Date(start.getTime() + i * 86400000);
      const dow = d.getUTCDay();
      if (dow !== 0 && dow !== 6) exceptions.push({ date: d.toISOString().slice(0, 10), type: "holiday", name: "臨時休業" });
    }
    const edited = { ...data, calendarExceptions: exceptions };
    const after = computeSchedule(edited, { leveling: false });
    expect(finishOf(edited, after, "業務要件ヒアリング") > finishOf(data, before, "業務要件ヒアリング")).toBe(true);
  });

  it("calendarExceptions（稼働日指定）を反映してタスクの終了日が前倒しになる", () => {
    const data = seedProject();
    const before = computeSchedule(data, { leveling: false });
    const start = parseISO(before.projectStart);
    const exceptions = [];
    for (let i = 0; i <= 30; i++) {
      const d = new Date(start.getTime() + i * 86400000);
      const dow = d.getUTCDay();
      if (dow === 0 || dow === 6) exceptions.push({ date: d.toISOString().slice(0, 10), type: "workday", name: "休日出勤" });
    }
    const edited = { ...data, calendarExceptions: exceptions };
    const after = computeSchedule(edited, { leveling: false });
    expect(finishOf(edited, after, "業務要件ヒアリング") < finishOf(data, before, "業務要件ヒアリング")).toBe(true);
  });
});

describe("analyzeIntegrity", () => {
  it("正常な seed データでは issue を返さない", () => {
    expect(analyzeIntegrity(seedProject())).toEqual([]);
  });

  it("存在しない先行タスク参照を error として検出する", () => {
    const data = seedProject();
    const leaf = data.tasks.find(t => !data.tasks.some(x => x.parentId === t.id));
    leaf.predecessors = [{ id: "ghost", type: "FS", lag: 0 }];
    const issues = analyzeIntegrity(data);
    expect(issues.some(i => i.code === "predecessor-missing" && i.severity === "error")).toBe(true);
  });

  it("存在しない親タスク・担当者・スプリント参照を検出する", () => {
    const data = seedProject();
    data.tasks[1].parentId = "nope";
    data.tasks[2].assigneeId = "nobody";
    data.tasks[3].sprintIds = ["missing"];
    const codes = analyzeIntegrity(data).map(i => i.code);
    expect(codes).toContain("parent-missing");
    expect(codes).toContain("assignee-missing");
    expect(codes).toContain("sprint-missing");
  });

  it("自己依存を検出する（src/lib/dependencyIssues.js と共通。code は従来どおり self-dependency）", () => {
    const data = seedProject();
    const leaf = data.tasks.find(t => !data.tasks.some(x => x.parentId === t.id));
    leaf.predecessors = [{ id: leaf.id, type: "FS", lag: 0 }];
    const self = analyzeIntegrity(data).filter(i => i.code === "self-dependency");
    expect(self).toHaveLength(1);
    expect(self[0]).toMatchObject({ severity: "error", ids: [leaf.id] });
    expect(self[0].message).toBe(`「${leaf.name}」: 自分自身を先行タスクにしています（この依存関係は計算に使われていません）`);
  });
});

describe("analyzeIntegrity: 循環参照（src/lib/dependencyIssues.js と共通）", () => {
  it("相互依存を1件の循環として error で返す", () => {
    const data = seedProject();
    data.tasks.push(
      { id: "a", name: "A", parentId: null, order: 90, duration: 1, predecessors: [{ id: "b", type: "FS", lag: 0 }] },
      { id: "b", name: "B", parentId: null, order: 91, duration: 1, predecessors: [{ id: "a", type: "FS", lag: 0 }] },
    );
    const cycles = analyzeIntegrity(data).filter(i => i.code === "dependency-cycle");
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toMatchObject({ severity: "error", ids: ["a", "b"], path: ["a", "b", "a"], message: "循環参照: 「A」→「B」→「A」" });
  });

  it("グループを介した循環（AがグループGに依存し、G配下のBがAに依存）を検出する", () => {
    const data = seedProject();
    data.tasks.push(
      { id: "A", name: "A", parentId: null, order: 90, duration: 1, predecessors: [{ id: "G", type: "FS", lag: 0 }] },
      { id: "G", name: "G", parentId: null, order: 91 },
      { id: "B", name: "B", parentId: "G", order: 0, duration: 1, predecessors: [{ id: "A", type: "FS", lag: 0 }] },
    );
    const cycles = analyzeIntegrity(data).filter(i => i.code === "dependency-cycle");
    expect(cycles).toHaveLength(1);
    expect(new Set(cycles[0].ids)).toEqual(new Set(["A", "G", "B"]));
    expect(cycles[0].message).toContain("「B」はグループ「G」の配下");
  });
});

/** App.jsx の cpm / schedule useMemo と dependencyIssues useMemo を忠実に再現した参照実装。 */
function appDependencyIssues(data, leveling) {
  const projectStart = deriveProjectStart(data.tasks, "2026-01-01");
  const y = parseISO(projectStart).getUTCFullYear();
  const cal = makeCalendar(buildHolidayMap(y - 1, y + 6), data.calendarExceptions || []);
  const cpm = runCPM(data.tasks, cal, projectStart, data.sprints);
  let schedule = cpm.result;
  if (leveling) {
    const { placed } = levelResources(data.tasks, cpm.result, data.resources, cal, data.sprints);
    schedule = new Map(cpm.result);
    for (const [id, dates] of Object.entries(placed)) schedule.set(id, { ...schedule.get(id), schedStart: dates.start, schedFinish: dates.finish });
    rollupSummaries(data.tasks, schedule);
  }
  return detectDependencyIssues(data.tasks, schedule, cal);
}

/** 4種類の依存関係の矛盾（＋自己依存）をすべて含むプロジェクト。 */
function conflictingProject() {
  const t = (o) => ({ parentId: null, duration: 1, predecessors: [], ...o });
  const fs = (id) => [{ id, type: "FS", lag: 0 }];
  const tasks = [
    t({ id: "design", name: "基本設計", order: 0, startDate: "2026-09-01", duration: 5, assigneeId: "r1" }),
    // 開始日との矛盾: 基本設計（〜9/7）の終了前に開始している
    t({ id: "impl", name: "実装", order: 1, startDate: "2026-09-03", duration: 3, assigneeId: "r1", predecessors: fs("design") }),
    // 着手済みなので開始日との矛盾としては警告しない
    t({ id: "doc", name: "マニュアル作成", order: 2, startDate: "2026-09-02", duration: 2, progress: 50, predecessors: fs("design") }),
    // 固定マイルストーンの期日超過: 実装の終了より前の期日
    t({ id: "ms", name: "リリース判定", order: 3, duration: 0, milestone: true, milestoneMode: "fixed", fixedDate: "2026-09-04", startDate: "2026-09-04", predecessors: fs("impl") }),
    // グループを介した循環: review がグループ qa に依存し、qa 配下の test が review に依存
    t({ id: "review", name: "レビュー", order: 4, startDate: "2026-09-10", predecessors: fs("qa") }),
    t({ id: "qa", name: "品質保証", order: 5 }),
    t({ id: "test", name: "テスト", parentId: "qa", order: 0, startDate: "2026-09-11", predecessors: fs("review") }),
    // 存在しない先行タスク
    t({ id: "deploy", name: "デプロイ", order: 6, startDate: "2026-09-20", predecessors: fs("deleted-task") }),
    // 自己依存
    t({ id: "ops", name: "運用設計", order: 7, startDate: "2026-09-21", predecessors: fs("ops") }),
  ];
  const resources = [{ id: "r1", name: "佐藤", weeklyCapacity: 5, monthlyCapacity: 20 }];
  return buildProjectExport(tasks, resources, [], [], false);
}

describe("validateProject（validate コマンドの本体）", () => {
  it("正常な seed データでは、平準化 ON/OFF のどちらでも issue を返さない", () => {
    for (const leveling of [false, true]) {
      const r = validateProject(seedProject(), { leveling });
      expect(r.issues, `leveling=${leveling}`).toEqual([]);
      expect(r.valid).toBe(true);
      expect(r.scheduleChecks).toEqual({ performed: true, leveling });
    }
  });

  it("4種類の依存関係の矛盾を検出し、開始日との矛盾・期日超過は warning として valid を妨げない", () => {
    const r = validateProject(conflictingProject(), { leveling: false });
    const codes = r.issues.map(i => `${i.code}:${i.ids.join(",")}`);
    expect(codes).toEqual(expect.arrayContaining([
      "dependency-cycle:review,qa,test",
      "predecessor-missing:deploy",
      "self-dependency:ops",
      "dependency-violation:impl",
      "fixed-milestone-overrun:ms",
    ]));
    expect(codes.some(c => c.endsWith(":doc"))).toBe(false); // 着手済み
    const violation = r.issues.find(i => i.code === "dependency-violation");
    expect(violation.severity).toBe("warning");
    expect(violation.message).toBe("「実装」: 先行「基本設計」（FS）の条件では 2026/09/08 以降に開始する必要がありますが、2026/09/03 に開始しています");
    expect(r.valid).toBe(false); // 循環参照・存在しない先行タスクは error
  });

  for (const leveling of [false, true]) {
    it(`アプリ（App.jsx）と同じ判定結果になる（平準化${leveling ? "ON" : "OFF"}）`, () => {
      const data = conflictingProject();
      // validate は参照整合性（循環・存在しない先行）を先に、日程の検査を後に並べるため、順序は問わず比較する。
      const key = i => `${i.code}:${i.ids.join(",")}`;
      const app = appDependencyIssues(data, leveling).map(i => ({ code: i.code, ids: i.ids, severity: i.severity })).sort((a, b) => key(a).localeCompare(key(b)));
      const cliCodes = new Set(["dependency-cycle", "self-dependency", "predecessor-missing", "dependency-violation", "fixed-milestone-overrun"]);
      const cli = validateProject(data, { leveling }).issues
        .filter(i => cliCodes.has(i.code))
        .map(i => ({ code: i.code, ids: i.ids, severity: i.severity }))
        .sort((a, b) => key(a).localeCompare(key(b)));
      expect(cli).toEqual(app);
      // 期日超過は平準化 ON/OFF に関わらず出る
      expect(cli.some(i => i.code === "fixed-milestone-overrun")).toBe(true);
    });
  }

  it("computeSchedule（recalc / plan / explain）もアプリと同じ一覧を dependencyIssues として返す", () => {
    const data = conflictingProject();
    const r = computeSchedule(data, { leveling: false });
    expect(r.dependencyIssues.map(i => i.code)).toEqual(appDependencyIssues(data, false).map(i => i.code));
    expect(r.levelWarnings).toEqual([]);
  });

  it("親子関係の循環があるときは、日程に関する検査を行わず理由を返す", () => {
    const data = seedProject();
    data.tasks.push({ id: "p1", name: "P1", parentId: "p2", order: 0 }, { id: "p2", name: "P2", parentId: "p1", order: 0 });
    const r = validateProject(data, { leveling: false });
    expect(r.issues.some(i => i.code === "parent-cycle")).toBe(true);
    expect(r.scheduleChecks.performed).toBe(false);
    expect(r.scheduleChecks.reason).toContain("parent-cycle");
  });

  it("「自動スケジューリング実行」（applyAutoSchedule）後は、開始日との矛盾が出ない", () => {
    const data = conflictingProject();
    data.tasks = data.tasks.filter(t => !["review", "qa", "test", "deploy", "ops"].includes(t.id)); // 循環・存在しない先行・自己依存を除く
    for (const leveling of [false, true]) {
      const projectStart = deriveProjectStart(data.tasks);
      const y = parseISO(projectStart).getUTCFullYear();
      const cal = makeCalendar(buildHolidayMap(y - 1, y + 6));
      const { tasks } = applyAutoSchedule(data, projectStart, cal, { leveling });
      const r = validateProject({ ...data, tasks }, { leveling });
      expect(r.issues.map(i => i.code), `leveling=${leveling}`).toEqual(["fixed-milestone-overrun"]);
    }
  });
});

describe("findParentCycles", () => {
  it("循環が無ければ空", () => {
    expect(findParentCycles(seedProject().tasks)).toEqual([]);
  });

  it("自己親を検出する", () => {
    expect(findParentCycles([{ id: "a", parentId: "a" }])).toEqual([["a"]]);
  });

  it("相互の親子参照を検出する", () => {
    const cycles = findParentCycles([
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
    ]);
    expect(cycles.length).toBe(1);
    expect(new Set(cycles[0])).toEqual(new Set(["a", "b"]));
  });
});

describe("checkFieldShapes", () => {
  it("正常な seed データでは issue を返さない", () => {
    expect(checkFieldShapes(seedProject())).toEqual([]);
  });

  it("id 欠落・不正な日付・非数値の工数・不正な依存タイプを error として検出する", () => {
    const data = seedProject();
    data.tasks.push({ name: "no id", parentId: null, order: 99 });
    data.tasks[1].startDate = "garbage";
    data.tasks[2].duration = "five";
    data.tasks[3].predecessors = [{ id: "x", type: "XX", lag: 0 }];
    const codes = checkFieldShapes(data).map(i => i.code);
    expect(codes).toContain("task-id-invalid");
    expect(codes).toContain("task-startDate-invalid");
    expect(codes).toContain("task-duration-invalid");
    expect(codes).toContain("dependency-type-invalid");
  });

  it("不正な日付を含むと analyzeIntegrity は error を返し validate をブロックできる", () => {
    const data = seedProject();
    data.tasks[0].startDate = "2026-13-40";
    const issues = analyzeIntegrity(data);
    expect(issues.some(i => i.severity === "error" && i.code === "task-startDate-invalid")).toBe(true);
  });

  it("親子循環を analyzeIntegrity が error として報告する", () => {
    const data = seedProject();
    data.tasks[0].parentId = data.tasks[0].id;
    expect(analyzeIntegrity(data).some(i => i.code === "parent-cycle")).toBe(true);
  });

  it("不正な calendarExceptions（日付書式・type）を error として検出する", () => {
    const data = seedProject();
    data.calendarExceptions = [
      { date: "2026-13-40", type: "holiday" },
      { date: "2026-05-01", type: "invalid" },
    ];
    const codes = checkFieldShapes(data).map(i => i.code);
    expect(codes).toContain("calendar-exception-date-invalid");
    expect(codes).toContain("calendar-exception-type-invalid");
  });

  it("配列でない calendarExceptions を error として検出する", () => {
    const data = { ...seedProject(), calendarExceptions: {} };
    expect(checkFieldShapes(data).map(i => i.code)).toContain("calendarExceptions-invalid");
  });

  it("同一日の休日＋稼働日を warning として報告する", () => {
    const data = seedProject();
    data.calendarExceptions = [
      { date: "2026-05-01", type: "holiday", name: "休日" },
      { date: "2026-05-01", type: "workday", name: "稼働" },
    ];
    expect(analyzeIntegrity(data).some(i => i.code === "calendar-exception-conflict" && i.severity === "warning")).toBe(true);
  });
});

describe("buildVersionSnapshot", () => {
  it("App.jsx saveVersion と同じ構造（比較用 tasks ＋ 復元用 raw* ＋ 各フラグ）を返す", () => {
    const data = seedProject();
    const r = computeSchedule(data, { leveling: false });
    const v = buildVersionSnapshot(data, r.schedule, "テスト");

    expect(v).toMatchObject({ name: "テスト", hasWbsInfo: true, hasFullSnapshot: true });
    expect(typeof v.id).toBe("string");
    expect(typeof v.createdAt).toBe("number");
    expect(v.tasks.length).toBe(data.tasks.length);
    expect(v.tasks[0]).toHaveProperty("wbsNo");
    expect(v.tasks[0]).toHaveProperty("schedStart");
    expect(v.rawTasks.length).toBe(data.tasks.length);
    expect(Array.isArray(v.rawResources)).toBe(true);
    expect(Array.isArray(v.rawSprints)).toBe(true);
    expect(Array.isArray(v.rawCalendarExceptions)).toBe(true);
  });

  it("rawCalendarExceptions にカレンダー例外を含める", () => {
    const data = seedProject();
    data.calendarExceptions = [{ date: "2026-05-01", type: "holiday", name: "創立記念日" }];
    const r = computeSchedule(data, { leveling: false });
    const v = buildVersionSnapshot(data, r.schedule, "テスト");
    expect(v.rawCalendarExceptions).toEqual([{ date: "2026-05-01", type: "holiday", name: "創立記念日" }]);
  });
});

describe("applyAutoSchedule", () => {
  it.each([[2, 20], [5, 3]])("配置失敗後の書き戻しと表示再計算で日付が先送りされ続けない（週%s・月%s）", (weeklyCapacity, monthlyCapacity) => {
    let data = {
      tasks: [{ id: "T", name: "大きなタスク", parentId: null, order: 0, startDate: "2026-09-16", duration: 10, assigneeId: "r1", progress: 0, predecessors: [] }],
      resources: [{ id: "r1", name: "担当者1", weeklyCapacity, monthlyCapacity }],
      sprints: [], calendarExceptions: [], levelingOn: true,
    };
    for (let i = 0; i < 3; i++) {
      const before = computeSchedule(data, { leveling: true });
      const applied = applyAutoSchedule(data, before.projectStart, before.cal, { leveling: true });
      expect(applied.tasks[0].startDate).toBe("2026-09-16");
      data = { ...data, tasks: applied.tasks };
      const after = computeSchedule(data, { leveling: true });
      expect(after.schedule.get("T").schedStart).toBe("2026-09-16");
      expect(after.levelWarnings).toHaveLength(1);
      expect(after.levelWarnings[0]).toContain("稼働上限を超過");
    }
  });

  it("固定マイルストーン以外のリーフの startDate を CPM 最短へ書き戻す（グループは対象外）", () => {
    const data = seedProject();
    const projectStart = data.tasks.filter(t => t.startDate).map(t => t.startDate).reduce((a, b) => (a < b ? a : b));
    const y = parseISO(projectStart).getUTCFullYear();
    const cal = makeCalendar(buildHolidayMap(y - 1, y + 6));

    const { tasks, changed } = applyAutoSchedule(data, projectStart, cal);
    const groupIds = new Set(data.tasks.filter(t => data.tasks.some(x => x.parentId === t.id)).map(t => t.id));
    for (const c of changed) expect(groupIds.has(c.id)).toBe(false);

    // 冪等性: 書き戻し済みデータに再適用しても startDate は動かない
    const again = applyAutoSchedule({ ...data, tasks }, projectStart, cal);
    expect(again.changed).toEqual([]);
  });

  it("leveling:true では平準化後の配置日を書き戻す（着手済みにしても表示が戻らない）", () => {
    const cal = makeCalendar(buildHolidayMap(2023, 2025));
    const data = {
      tasks: [
        { id: "T1", name: "T1", parentId: null, order: 0, startDate: "2024-01-09", duration: 3, assigneeId: "r1", predecessors: [] },
        { id: "T2", name: "T2", parentId: null, order: 1, startDate: "2024-01-09", duration: 3, assigneeId: "r1", predecessors: [] },
      ],
      resources: [{ id: "r1", name: "R1", weeklyCapacity: 5, monthlyCapacity: 20 }],
      sprints: [], versions: [], levelingOn: true, calendarExceptions: [],
    };
    const { tasks } = applyAutoSchedule(data, "2024-01-09", cal, { leveling: true });
    expect(tasks.find(t => t.id === "T2").startDate).toBe("2024-01-12");

    // leveling を渡さなければ従来通り CPM 最短（1/9）が書き戻る
    const plain = applyAutoSchedule(data, "2024-01-09", cal);
    expect(plain.tasks.find(t => t.id === "T2").startDate).toBe("2024-01-09");
  });

  it("固定マイルストーンも App.jsx runScheduling と同じく書き戻す（startDate が fixedDate 由来になる）", () => {
    // App のボタンと結果をずらさないため、CLI 側でも固定マイルストーンを特別扱いしない。
    const data = seedProject();
    const ms = data.tasks.find(t => t.milestone && t.milestoneMode === "fixed" && t.fixedDate);
    expect(ms).toBeTruthy();
    ms.startDate = "2000-01-01"; // わざとずらす
    const projectStart = "2026-08-01";
    const y = parseISO(projectStart).getUTCFullYear();
    const cal = makeCalendar(buildHolidayMap(y - 1, y + 6));

    const { tasks, changed } = applyAutoSchedule(data, projectStart, cal);
    const written = tasks.find(t => t.id === ms.id);
    expect(written.startDate).toBe(ms.fixedDate);
    expect(changed.some(c => c.id === ms.id)).toBe(true);
  });
});
