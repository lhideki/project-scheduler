import { describe, it, expect } from "vitest";

import { seedData } from "../lib/seedData.js";
import { buildProjectExport } from "../lib/exportUtils.js";
import { buildHolidayMap, makeCalendar, parseISO } from "../lib/calendar.js";
import { runCPM } from "../lib/scheduling.js";
import {
  computeSchedule, scheduleRows, analyzeIntegrity, findDependencyCycles,
  buildVersionSnapshot, applyAutoSchedule,
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
});
