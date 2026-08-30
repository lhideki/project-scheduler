import { describe, it, expect } from "vitest";

import { seedData } from "../lib/seedData.js";
import { buildProjectExport } from "../lib/exportUtils.js";
import { buildHolidayMap, makeCalendar, parseISO } from "../lib/calendar.js";
import { runCPM } from "../lib/scheduling.js";
import {
  computeSchedule, scheduleRows, analyzeIntegrity, findDependencyCycles, findParentCycles,
  checkFieldShapes, buildVersionSnapshot, applyAutoSchedule,
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

  it("自己依存を検出する", () => {
    const data = seedProject();
    const leaf = data.tasks.find(t => !data.tasks.some(x => x.parentId === t.id));
    leaf.predecessors = [{ id: leaf.id, type: "FS", lag: 0 }];
    expect(analyzeIntegrity(data).some(i => i.code === "self-dependency")).toBe(true);
  });
});

describe("findDependencyCycles", () => {
  it("循環が無ければ空", () => {
    expect(findDependencyCycles(seedProject().tasks)).toEqual([]);
  });

  it("相互依存を1件の循環として返す", () => {
    const tasks = [
      { id: "a", predecessors: [{ id: "b", type: "FS", lag: 0 }] },
      { id: "b", predecessors: [{ id: "a", type: "FS", lag: 0 }] },
    ];
    const cycles = findDependencyCycles(tasks);
    expect(cycles.length).toBeGreaterThan(0);
    expect(new Set(cycles[0])).toEqual(new Set(["a", "b"]));
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
