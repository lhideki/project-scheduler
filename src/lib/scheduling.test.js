import { describe, it, expect } from "vitest";
import { buildHolidayMap, makeCalendar } from "./calendar.js";
import {
  runCPM, rollupSummaries, levelResources, dailyLoads, topoOrder, earliestSprintFloor,
  deriveProjectStart, autoScheduleStartDates, computeAutoSchedule, buildDisplaySchedule,
} from "./scheduling.js";
import { weekKey, monthKey } from "./calendar.js";
import { createAppTranslator, formatLevelWarning } from "./i18n.js";

// 2024-01-09(火)〜2024-02-09の間は土日以外の非稼働日が無い期間なので、
// 日付計算の期待値を単純な曜日カウントで検証できる。
const cal = makeCalendar(buildHolidayMap(2024, 2024));

describe("runCPM", () => {
  it("FS依存で後続タスクのESが先行タスクの終了翌稼働日になり、フロート0はcriticalになる", () => {
    const tasks = [
      { id: "A", name: "A", parentId: null, order: 0, startDate: "2024-01-09", duration: 3, predecessors: [] },
      { id: "B", name: "B", parentId: null, order: 1, duration: 2, predecessors: [{ id: "A", type: "FS", lag: 0 }] },
    ];
    const { result, projectEnd } = runCPM(tasks, cal, "2024-01-09", []);
    expect(result.get("A").schedStart).toBe("2024-01-09");
    expect(result.get("A").schedFinish).toBe("2024-01-11"); // 火水木の3稼働日
    expect(result.get("B").schedStart).toBe("2024-01-12"); // 木の翌稼働日=金
    expect(result.get("B").schedFinish).toBe("2024-01-15"); // 金+月の2稼働日
    expect(result.get("A").critical).toBe(true);
    expect(result.get("B").critical).toBe(true);
    expect(projectEnd).toBe("2024-01-15");
  });

  it("respectManualPins=true（既定）では開始日入力済みタスクは依存関係より手入力日を優先する", () => {
    const tasks = [
      { id: "X", name: "X", parentId: null, order: 0, startDate: "2024-01-09", duration: 2, predecessors: [] },
      // 依存関係上は 2024-01-11 が最短だが、手入力の 2024-01-10 をそのまま使う
      { id: "Y", name: "Y", parentId: null, order: 1, startDate: "2024-01-10", duration: 2, predecessors: [{ id: "X", type: "FS", lag: 0 }] },
    ];
    const { result } = runCPM(tasks, cal, "2024-01-09", [], { respectManualPins: true });
    expect(result.get("Y").schedStart).toBe("2024-01-10");
  });

  it("respectManualPins=false（自動スケジューリング実行）では手入力日を無視し依存関係で再計算する", () => {
    const tasks = [
      { id: "X", name: "X", parentId: null, order: 0, startDate: "2024-01-09", duration: 2, predecessors: [] },
      { id: "Y", name: "Y", parentId: null, order: 1, startDate: "2024-01-10", duration: 2, predecessors: [{ id: "X", type: "FS", lag: 0 }] },
    ];
    const { result } = runCPM(tasks, cal, "2024-01-09", [], { respectManualPins: false });
    expect(result.get("Y").schedStart).toBe("2024-01-11");
  });

  it("進捗率が入力済みのタスクはrespectManualPins=falseでも開始日を固定する", () => {
    const tasks = [
      { id: "X", name: "X", parentId: null, order: 0, startDate: "2024-01-09", duration: 2, predecessors: [] },
      {
        id: "Y", name: "Y", parentId: null, order: 1, startDate: "2024-01-10", duration: 2, progress: 50,
        predecessors: [{ id: "X", type: "FS", lag: 0 }],
      },
    ];
    const { result } = runCPM(tasks, cal, "2024-01-09", [], { respectManualPins: false });
    expect(result.get("Y").schedStart).toBe("2024-01-10");
  });

  it("固定マイルストーン自身はLS/LFで表示し、その手前のタスクはES/EFのまま変化しない", () => {
    const tasks = [
      { id: "C", name: "C", parentId: null, order: 0, duration: 5, predecessors: [] },
      {
        id: "M", name: "M", parentId: null, order: 1, duration: 0, milestone: true, milestoneMode: "fixed",
        fixedDate: "2024-01-31", predecessors: [{ id: "C", type: "FS", lag: 0 }],
      },
    ];
    const { result } = runCPM(tasks, cal, "2024-01-09", []);
    const c = result.get("C");
    const m = result.get("M");
    // Cの表示スケジュールはES/EFのまま（固定マイルストーンに引っ張られて後ろ倒しにならない）
    expect(c.schedStart).toBe(c.ES);
    expect(c.schedFinish).toBe(c.EF);
    expect(c.ES).toBe("2024-01-09");
    // Cはフロートを持つ（固定マイルストーンまで余裕がある）ため非クリティカル
    expect(c.float).toBeGreaterThan(0);
    expect(c.critical).toBe(false);
    // Mはgoverned=true、表示は固定期日ベースのLS/LF
    expect(m.governed).toBe(true);
    expect(m.schedStart).toBe("2024-01-31");
    expect(m.schedFinish).toBe("2024-01-31");
  });

  it("スプリントの開始日は依存関係より前倒しの計算結果を後ろ倒しにする下限としてのみ働く", () => {
    const tasks = [
      { id: "A", name: "A", parentId: null, order: 0, startDate: "2024-01-09", duration: 1, predecessors: [], sprintIds: ["sp1"] },
    ];
    const sprints = [{ id: "sp1", name: "S1", startDate: "2024-01-16", endDate: "2024-01-31", order: 0 }];
    const { result } = runCPM(tasks, cal, "2024-01-09", sprints, { respectManualPins: false });
    // 依存が無く本来は2024-01-09開始だが、スプリント開始日2024-01-16まで後ろ倒しされる
    expect(result.get("A").schedStart).toBe("2024-01-16");
  });
});

describe("rollupSummaries", () => {
  it("グループの表示期間・critical・進捗を子タスクから積み上げる", () => {
    const tasks = [
      { id: "g", name: "G", parentId: null, order: 0 },
      { id: "c1", name: "C1", parentId: "g", order: 0 },
      { id: "c2", name: "C2", parentId: "g", order: 1 },
    ];
    const result = new Map([
      ["c1", { schedStart: "2024-01-10", schedFinish: "2024-01-12", critical: false, progress: 40 }],
      ["c2", { schedStart: "2024-01-08", schedFinish: "2024-01-20", critical: true, progress: 60 }],
    ]);
    rollupSummaries(tasks, result);
    const g = result.get("g");
    expect(g.schedStart).toBe("2024-01-08");
    expect(g.schedFinish).toBe("2024-01-20");
    expect(g.critical).toBe(true);
    expect(g.progress).toBe(50);
    expect(g.isSummary).toBe(true);
  });
});

describe("levelResources", () => {
  it.each([
    ["週次", 1, 20],
    ["月次", 5, 1],
  ])("%s上限で探索上限内に割り当てきれない場合は探索開始日からの連続配置に戻して警告する", (label, weeklyCapacity, monthlyCapacity) => {
    const tasks = [
      { id: "T", name: "大きなタスク", parentId: null, order: 0, startDate: "2024-01-09", duration: 500, assigneeId: "r1", predecessors: [] },
    ];
    const resources = [{ id: "r1", name: "担当者1", weeklyCapacity, monthlyCapacity }];
    const { result } = runCPM(tasks, cal, "2024-01-09", []);
    const { placed, warnings, allocations } = levelResources(tasks, result, resources, cal, []);
    expect(placed.T).toEqual({ start: "2024-01-09", finish: cal.endFromStart("2024-01-09", 500) });
    expect(allocations.T.overCapacity).toBe(true);
    expect(allocations.T.alloc).toEqual(dailyLoads(cal, "2024-01-09", 500));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toEqual({
      code: "capacity-exceeded",
      taskId: "T",
      params: {
        taskName: "大きなタスク", resourceName: "担当者1", duration: 500,
        dailyCapacity: 1, weeklyCapacity, monthlyCapacity, searchWorkdays: 2000, start: "2024-01-09",
      },
    });
    // 文言は lib では組み立てず、メッセージカタログから作る（日本語は従来どおり）
    const text = formatLevelWarning(createAppTranslator("ja"), warnings[0]);
    expect(text).toContain("「大きなタスク」（担当者: 担当者1、工数: 500人日）");
    expect(text).toContain(label);
    expect(text).toContain("（探索上限: 2,000稼働日）。開始日を2024/01/09とし");
    expect(text).toContain("稼働上限を超過");
  });

  it("割当不成立のタスクの負荷と終了日を、他タスクの平準化・依存関係に反映する", () => {
    const tasks = [
      { id: "A", name: "A", parentId: null, order: 0, startDate: "2024-01-09", duration: 500, assigneeId: "r1", predecessors: [] },
      { id: "B", name: "B", parentId: null, order: 1, startDate: "2024-01-09", duration: 1, assigneeId: "r1", predecessors: [] },
      { id: "C", name: "C", parentId: null, order: 2, duration: 1, predecessors: [{ id: "A", type: "FS", lag: 0 }] },
    ];
    const resources = [{ id: "r1", name: "R1", weeklyCapacity: 1, monthlyCapacity: 20 }];
    const { result } = runCPM(tasks, cal, "2024-01-09", []);
    const { placed, warnings } = levelResources(tasks, result, resources, cal, []);
    const aFinish = cal.endFromStart("2024-01-09", 500);
    expect(placed.A.finish).toBe(aFinish);
    // A の連続配置（上限超過のまま登録）と同じ週には B を割り当てられない
    expect(placed.B.start > aFinish).toBe(true);
    expect(weekKey(placed.B.start) > weekKey(aFinish)).toBe(true);
    expect(placed.C.start).toBe(cal.shift(aFinish, 1));
    expect(warnings).toHaveLength(1);
  });

  it("割当不成立時も依存関係・手入力開始日・スプリントの下限を守る", () => {
    const tasks = [
      { id: "A", name: "A", parentId: null, order: 0, startDate: "2024-01-09", duration: 5, predecessors: [] },
      { id: "B", name: "B", parentId: null, order: 1, startDate: "2024-01-18", duration: 500, assigneeId: "r1", sprintIds: ["s"], predecessors: [{ id: "A", type: "FS", lag: 0 }] },
    ];
    const resources = [{ id: "r1", name: "R1", weeklyCapacity: 1, monthlyCapacity: 20 }];
    const sprints = [{ id: "s", startDate: "2024-01-22", endDate: "2024-02-09" }];
    const { result } = runCPM(tasks, cal, "2024-01-09", sprints);
    const { placed, warnings } = levelResources(tasks, result, resources, cal, sprints);
    expect(placed.B.start).toBe("2024-01-22");
    expect(warnings).toHaveLength(1);
  });

  it("週次上限に達した週の残りを非割当日として翌週へ延長する（Issue #30 の想定例）", () => {
    // 2024-01-15(月)開始・工数3人日・週次上限2人日: 月・火に2人日、翌月曜に1人日
    const tasks = [
      { id: "T", name: "T", parentId: null, order: 0, startDate: "2024-01-15", duration: 3, assigneeId: "r1", predecessors: [] },
    ];
    const resources = [{ id: "r1", name: "R1", weeklyCapacity: 2, monthlyCapacity: 20 }];
    const { result } = runCPM(tasks, cal, "2024-01-15", []);
    const { placed, warnings, allocations } = levelResources(tasks, result, resources, cal, []);
    expect(placed.T).toEqual({ start: "2024-01-15", finish: "2024-01-22" });
    expect(allocations.T.alloc).toEqual([
      { date: "2024-01-15", load: 1 },
      { date: "2024-01-16", load: 1 },
      { date: "2024-01-22", load: 1 },
    ]);
    // 水〜金は週次上限による非割当。土日は非稼働日なので idle には含めない（カレンダーから求める）
    expect(allocations.T.idle).toEqual([
      { date: "2024-01-17", reason: "weekly" },
      { date: "2024-01-18", reason: "weekly" },
      { date: "2024-01-19", reason: "weekly" },
    ]);
    expect(warnings).toEqual([]);
  });

  it("従来は配置できなかった、どの連続期間でも週次上限を超えるタスクも週をまたいで割り当てる", () => {
    const tasks = [
      { id: "T", name: "T", parentId: null, order: 0, startDate: "2024-01-09", duration: 10, assigneeId: "r1", predecessors: [] },
    ];
    const resources = [{ id: "r1", name: "R1", weeklyCapacity: 2, monthlyCapacity: 20 }];
    const { result } = runCPM(tasks, cal, "2024-01-09", []);
    const { placed, warnings, allocations } = levelResources(tasks, result, resources, cal, []);
    expect(warnings).toEqual([]);
    expect(allocations.T.alloc.map(a => a.date)).toEqual([
      "2024-01-09", "2024-01-10", "2024-01-15", "2024-01-16", "2024-01-22",
      "2024-01-23", "2024-01-29", "2024-01-30", "2024-02-05", "2024-02-06",
    ]);
    expect(placed.T).toEqual({ start: "2024-01-09", finish: "2024-02-06" });
  });

  it("日別割当の合計は工数と一致し、同じ担当者の複数タスクの合計は日次・週次・月次上限を超えない", () => {
    const tasks = [
      { id: "A", name: "A", parentId: null, order: 0, startDate: "2024-01-09", duration: 3.3, assigneeId: "r1", predecessors: [] },
      { id: "B", name: "B", parentId: null, order: 1, startDate: "2024-01-10", duration: 4.75, assigneeId: "r1", predecessors: [] },
      { id: "C", name: "C", parentId: null, order: 2, duration: 2.5, assigneeId: "r1", predecessors: [{ id: "A", type: "SS", lag: 1 }] },
      { id: "D", name: "D", parentId: null, order: 3, startDate: "2024-01-09", duration: 6, assigneeId: "r1", progress: 10, predecessors: [] },
    ];
    const resources = [{ id: "r1", name: "R1", weeklyCapacity: 2.5, monthlyCapacity: 9 }];
    const { result } = runCPM(tasks, cal, "2024-01-09", []);
    const { allocations, warnings } = levelResources(tasks, result, resources, cal, []);
    expect(warnings).toEqual([]);
    const day = {}, week = {}, month = {};
    tasks.forEach(t => {
      const sum = allocations[t.id].alloc.reduce((acc, a) => acc + a.load, 0);
      expect(sum).toBeCloseTo(t.duration, 9);
      allocations[t.id].alloc.forEach(({ date, load }) => {
        day[date] = (day[date] || 0) + load;
        week[weekKey(date)] = (week[weekKey(date)] || 0) + load;
        month[monthKey(date)] = (month[monthKey(date)] || 0) + load;
      });
    });
    Object.values(day).forEach(v => expect(v).toBeLessThanOrEqual(1 + 1e-9));
    Object.values(week).forEach(v => expect(v).toBeLessThanOrEqual(2.5 + 1e-9));
    Object.values(month).forEach(v => expect(v).toBeLessThanOrEqual(9 + 1e-9));
  });

  it("休日指定・稼働日指定を日別割当に反映する", () => {
    const calEx = makeCalendar(buildHolidayMap(2024, 2024), [
      { date: "2024-01-16", type: "holiday", name: "創立記念日" },
      { date: "2024-01-20", type: "workday", name: "休日出勤" },
    ]);
    const tasks = [
      { id: "T", name: "T", parentId: null, order: 0, startDate: "2024-01-15", duration: 6, assigneeId: "r1", predecessors: [] },
    ];
    const resources = [{ id: "r1", name: "R1", weeklyCapacity: 0, monthlyCapacity: 0 }];
    const { result } = runCPM(tasks, calEx, "2024-01-15", []);
    const { allocations } = levelResources(tasks, result, resources, calEx, []);
    // 1/16（休日指定）は飛ばし、1/20（土曜の稼働日指定）には割り当てる
    expect(allocations.T.alloc.map(a => a.date)).toEqual([
      "2024-01-15", "2024-01-17", "2024-01-18", "2024-01-19", "2024-01-20", "2024-01-22",
    ]);
    expect(allocations.T.idle).toEqual([]);
  });

  it("他タスクで埋まっている日は日次上限による非割当として、そのタスクを記録する", () => {
    const tasks = [
      { id: "T1", name: "T1", parentId: null, order: 0, startDate: "2024-01-17", duration: 2, assigneeId: "r1", predecessors: [] },
      { id: "T2", name: "T2", parentId: null, order: 1, startDate: "2024-01-15", duration: 4, assigneeId: "r1", predecessors: [] },
    ];
    const resources = [{ id: "r1", name: "R1", weeklyCapacity: 5, monthlyCapacity: 20 }];
    const { result } = runCPM(tasks, cal, "2024-01-15", []);
    const { placed, allocations } = levelResources(tasks, result, resources, cal, []);
    expect(placed.T1).toEqual({ start: "2024-01-17", finish: "2024-01-18" });
    expect(placed.T2).toEqual({ start: "2024-01-15", finish: "2024-01-22" });
    expect(allocations.T2.alloc.map(a => a.date)).toEqual(["2024-01-15", "2024-01-16", "2024-01-19", "2024-01-22"]);
    expect(allocations.T2.idle).toEqual([
      { date: "2024-01-17", reason: "daily", taskIds: ["T1"] },
      { date: "2024-01-18", reason: "daily", taskIds: ["T1"] },
    ]);
  });

  it("着手済みタスクは開始日を固定したまま稼働上限内に割り当て、同じ日に二重に割り当てない", () => {
    // 同じフロートなら WBS 順で X が先に確定する。着手済みの Y は開始日 1/15 のまま、空いている日に割り当てる。
    const tasks = [
      { id: "X", name: "X", parentId: null, order: 0, startDate: "2024-01-15", duration: 2, assigneeId: "r1", predecessors: [] },
      { id: "Y", name: "Y", parentId: null, order: 1, startDate: "2024-01-15", duration: 2, assigneeId: "r1", progress: 50, predecessors: [] },
    ];
    const resources = [{ id: "r1", name: "R1", weeklyCapacity: 5, monthlyCapacity: 20 }];
    const { result } = runCPM(tasks, cal, "2024-01-15", []);
    const { placed, allocations } = levelResources(tasks, result, resources, cal, []);
    expect(placed.X).toEqual({ start: "2024-01-15", finish: "2024-01-16" });
    expect(placed.Y).toEqual({ start: "2024-01-15", finish: "2024-01-18" });
    expect(allocations.Y.alloc.map(a => a.date)).toEqual(["2024-01-17", "2024-01-18"]);
    expect(allocations.Y.idle).toEqual([
      { date: "2024-01-15", reason: "daily", taskIds: ["X"] },
      { date: "2024-01-16", reason: "daily", taskIds: ["X"] },
    ]);
  });

  it("担当者未設定・工数0のタスクは稼働上限を見ずに連続配置する", () => {
    const tasks = [
      { id: "U", name: "U", parentId: null, order: 0, startDate: "2024-01-15", duration: 3, predecessors: [] },
      { id: "M", name: "M", parentId: null, order: 1, duration: 0, milestone: true, predecessors: [{ id: "U", type: "FS", lag: 0 }] },
    ];
    const { result } = runCPM(tasks, cal, "2024-01-15", []);
    const { placed, allocations } = levelResources(tasks, result, [], cal, []);
    expect(placed.U).toEqual({ start: "2024-01-15", finish: "2024-01-17" });
    expect(allocations.U).toEqual({ alloc: dailyLoads(cal, "2024-01-15", 3), idle: [] });
    expect(allocations.M).toBeUndefined();
  });

  it("同じ担当者・同じ希望日のタスクは1日1件までに直列化される", () => {
    const tasks = [
      { id: "T1", name: "T1", parentId: null, order: 0, startDate: "2024-01-09", duration: 3, assigneeId: "r1", predecessors: [] },
      { id: "T2", name: "T2", parentId: null, order: 1, startDate: "2024-01-09", duration: 3, assigneeId: "r1", predecessors: [] },
    ];
    const resources = [{ id: "r1", name: "R1", weeklyCapacity: 5, monthlyCapacity: 20 }];
    const { result: cpmResult } = runCPM(tasks, cal, "2024-01-09", []);
    const { placed, warnings } = levelResources(tasks, cpmResult, resources, cal, []);
    expect(placed.T1.start).toBe("2024-01-09");
    // T1がJan9-11を占有するため、T2はJan12(金)まで押し出される
    expect(placed.T2.start).toBe("2024-01-12");
    expect(warnings).toEqual([]);
  });

  it("進捗率が入力済みのタスクは平準化の対象外で現在の開始日に固定される", () => {
    const tasks = [
      { id: "T1", name: "T1", parentId: null, order: 0, startDate: "2024-01-09", duration: 3, assigneeId: "r1", progress: 30, predecessors: [] },
      { id: "T2", name: "T2", parentId: null, order: 1, startDate: "2024-01-09", duration: 3, assigneeId: "r1", predecessors: [] },
    ];
    const resources = [{ id: "r1", name: "R1", weeklyCapacity: 5, monthlyCapacity: 20 }];
    const { result: cpmResult } = runCPM(tasks, cal, "2024-01-09", []);
    const { placed } = levelResources(tasks, cpmResult, resources, cal, []);
    expect(placed.T1.start).toBe("2024-01-09"); // 進捗済みなので動かない
    expect(placed.T2.start).toBe("2024-01-12"); // T1の稼働をリソース使用量として尊重し押し出される
  });

  it("先行タスクを持つタスクでも手入力の開始日を後ろ倒しのみの下限として尊重する", () => {
    const tasks = [
      { id: "A", name: "A", parentId: null, order: 0, startDate: "2024-01-09", duration: 3, assigneeId: "r1", predecessors: [] },
      { id: "B", name: "B", parentId: null, order: 1, startDate: "2024-01-22", duration: 2, assigneeId: "r1", predecessors: [{ id: "A", type: "FS", lag: 0 }] },
    ];
    const resources = [{ id: "r1", name: "R1", weeklyCapacity: 5, monthlyCapacity: 20 }];
    const { result: cpmResult } = runCPM(tasks, cal, "2024-01-09", []);
    const { placed } = levelResources(tasks, cpmResult, resources, cal, []);
    // 依存関係だけならAの直後(1/12〜)に置けるが、手入力の開始日1/22まで後ろ倒しされる
    expect(placed.B.start).toBe("2024-01-22");
  });

  it("手入力の開始日が依存関係の候補日より前でも前倒しはしない（後ろ倒しのみ）", () => {
    const tasks = [
      { id: "A", name: "A", parentId: null, order: 0, startDate: "2024-01-09", duration: 5, assigneeId: "r1", predecessors: [] },
      { id: "B", name: "B", parentId: null, order: 1, startDate: "2024-01-10", duration: 2, assigneeId: "r2", predecessors: [{ id: "A", type: "FS", lag: 0 }] },
    ];
    const resources = [
      { id: "r1", name: "R1", weeklyCapacity: 5, monthlyCapacity: 20 },
      { id: "r2", name: "R2", weeklyCapacity: 5, monthlyCapacity: 20 },
    ];
    const { result: cpmResult } = runCPM(tasks, cal, "2024-01-09", []);
    const { placed } = levelResources(tasks, cpmResult, resources, cal, []);
    // Aは1/9〜1/15。Bの手入力開始日1/10は依存関係の候補日より前なので無視され、Aの直後になる
    expect(placed.B.start).toBe("2024-01-16");
  });

  it("固定マイルストーンの期日超過は警告に含めない（dependencyIssues.js の fixed-milestone-overrun に一本化）", () => {
    const tasks = [
      { id: "T1", name: "T1", parentId: null, order: 0, startDate: "2024-01-09", duration: 10, assigneeId: "r1", predecessors: [] },
      {
        id: "M", name: "M", parentId: null, order: 1, duration: 0, milestone: true, milestoneMode: "fixed",
        fixedDate: "2024-01-10", predecessors: [{ id: "T1", type: "FS", lag: 0 }],
      },
    ];
    const resources = [{ id: "r1", name: "R1", weeklyCapacity: 5, monthlyCapacity: 20 }];
    const { result: cpmResult } = runCPM(tasks, cal, "2024-01-09", []);
    const { placed, warnings } = levelResources(tasks, cpmResult, resources, cal, []);
    expect(placed.M.finish > "2024-01-10").toBe(true);
    expect(warnings).toEqual([]);
  });
});

describe("autoScheduleStartDates", () => {
  const resources = [{ id: "r1", name: "R1", weeklyCapacity: 5, monthlyCapacity: 20 }];

  it("平準化OFFでは respectManualPins:false の CPM 最短日を返す", () => {
    const tasks = [
      { id: "A", name: "A", parentId: null, order: 0, startDate: "2024-01-09", duration: 2, predecessors: [] },
      { id: "B", name: "B", parentId: null, order: 1, startDate: "2024-01-30", duration: 2, predecessors: [{ id: "A", type: "FS", lag: 0 }] },
    ];
    const map = autoScheduleStartDates(tasks, cal, "2024-01-09", [], resources, { leveling: false });
    expect(map.get("A")).toBe("2024-01-09");
    expect(map.get("B")).toBe("2024-01-11"); // 手入力の1/30を無視しAの直後へ
  });

  it("平準化ONでは平準化後の配置日を返す（＝書き戻し後に着手済みにしても表示が動かない）", () => {
    // r1 が T1・T2 を掛け持ち。CPM 上は両方 1/9 開始だが、平準化で T2 は 1/12 へ。
    const tasks = [
      { id: "T1", name: "T1", parentId: null, order: 0, startDate: "2024-01-09", duration: 3, assigneeId: "r1", predecessors: [] },
      { id: "T2", name: "T2", parentId: null, order: 1, startDate: "2024-01-09", duration: 3, assigneeId: "r1", predecessors: [] },
    ];
    const map = autoScheduleStartDates(tasks, cal, "2024-01-09", [], resources, { leveling: true });
    expect(map.get("T1")).toBe("2024-01-09");
    expect(map.get("T2")).toBe("2024-01-12");

    // 書き戻し後、T2 を着手済み（progress>0）にしても平準化表示は 1/12 のまま
    const written = tasks.map(t => ({ ...t, startDate: map.get(t.id) }));
    const progressed = written.map(t => (t.id === "T2" ? { ...t, progress: 20 } : t));
    const { result: cpmResult } = runCPM(progressed, cal, "2024-01-09", []);
    const { placed } = levelResources(progressed, cpmResult, resources, cal, []);
    expect(placed.T2.start).toBe("2024-01-12");
  });

  it("平準化ONで容量を分け合うタスクも、書き戻し後に着手済みにして表示が動かない（着手済みも通常の優先順で確定）", () => {
    // A は別担当者の X（2日）の後続で余裕0。B は A と同じ担当者で余裕のあるタスク。
    // B は A の割当日（1/17〜1/19）を避けて 1/15・1/16・1/22 に割り当てられる。
    const res = [
      { id: "r1", name: "R1", weeklyCapacity: 5, monthlyCapacity: 20 },
      { id: "r2", name: "R2", weeklyCapacity: 5, monthlyCapacity: 20 },
    ];
    const tasks = [
      { id: "X", name: "X", parentId: null, order: 0, duration: 2, assigneeId: "r2", predecessors: [] },
      { id: "A", name: "A", parentId: null, order: 1, duration: 3, assigneeId: "r1", predecessors: [{ id: "X", type: "FS", lag: 0 }] },
      { id: "B", name: "B", parentId: null, order: 2, duration: 3, assigneeId: "r1", predecessors: [] },
    ];
    const map = autoScheduleStartDates(tasks, cal, "2024-01-15", [], res, { leveling: true });
    const written = tasks.map(t => ({ ...t, startDate: map.get(t.id) }));
    const levelOf = (ts) => {
      const { result } = runCPM(ts, cal, "2024-01-15", []);
      return levelResources(ts, result, res, cal, []);
    };
    const before = levelOf(written);
    expect(before.placed.A).toEqual({ start: "2024-01-17", finish: "2024-01-19" });
    expect(before.placed.B).toEqual({ start: "2024-01-15", finish: "2024-01-22" });

    const after = levelOf(written.map(t => (t.id === "B" ? { ...t, progress: 20 } : t)));
    expect(after.placed).toEqual(before.placed);
    expect(after.allocations.B.alloc).toEqual(before.allocations.B.alloc);
  });

  it("平準化ONでは書き戻した状態の表示と一致するまで書き戻しを繰り返す", () => {
    // 1回の書き戻しでは T2 を 1/22 とするが、書き戻し後の表示ではフロート順が入れ替わり
    // T0 が先に翌週の容量（週3人日）を使うため、T2 は 1/29 と表示される。書き戻しもそれに揃える。
    const res = [{ id: "r1", name: "R1", weeklyCapacity: 3, monthlyCapacity: 20 }];
    const tasks = [
      { id: "T0", name: "T0", parentId: null, order: 0, duration: 3, assigneeId: "r1", predecessors: [] },
      { id: "T1", name: "T1", parentId: null, order: 1, duration: 3, assigneeId: "r1", predecessors: [] },
      { id: "T2", name: "T2", parentId: null, order: 2, duration: 1, assigneeId: "r1", predecessors: [{ id: "T1", type: "FS", lag: 0 }] },
    ];
    const map = autoScheduleStartDates(tasks, cal, "2024-01-15", [], res, { leveling: true });
    expect(Object.fromEntries(map)).toEqual({ T0: "2024-01-23", T1: "2024-01-15", T2: "2024-01-29" });

    const written = tasks.map(t => ({ ...t, startDate: map.get(t.id) }));
    const { result } = runCPM(written, cal, deriveProjectStart(written), []);
    const { placed } = levelResources(written, result, res, cal, []);
    tasks.forEach(t => expect(placed[t.id].start).toBe(map.get(t.id)));
  });

  it("computeAutoSchedule は、書き戻しと表示の一致を上限回数内に確認できなかった場合に converged: false を返す", () => {
    // 上の「一致するまで書き戻しを繰り返す」と同じデータ。1回目の確認で T2 が動くため、1回で打ち切ると未確認になる。
    const res = [{ id: "r1", name: "R1", weeklyCapacity: 3, monthlyCapacity: 20 }];
    const tasks = [
      { id: "T0", name: "T0", parentId: null, order: 0, duration: 3, assigneeId: "r1", predecessors: [] },
      { id: "T1", name: "T1", parentId: null, order: 1, duration: 3, assigneeId: "r1", predecessors: [] },
      { id: "T2", name: "T2", parentId: null, order: 2, duration: 1, assigneeId: "r1", predecessors: [{ id: "T1", type: "FS", lag: 0 }] },
    ];
    const ok = computeAutoSchedule(tasks, cal, "2024-01-15", [], res, { leveling: true });
    expect(ok.converged).toBe(true);
    expect(ok.startDates.get("T2")).toBe("2024-01-29");
    const capped = computeAutoSchedule(tasks, cal, "2024-01-15", [], res, { leveling: true, maxIterations: 1 });
    expect(capped.converged).toBe(false);
    // 平準化OFFは反復しないため常に一致扱い
    expect(computeAutoSchedule(tasks, cal, "2024-01-15", [], res, { leveling: false }).converged).toBe(true);
  });

  it("グループは対象外", () => {
    const tasks = [
      { id: "G", name: "G", parentId: null, order: 0, predecessors: [] },
      { id: "L", name: "L", parentId: "G", order: 0, startDate: "2024-01-09", duration: 2, predecessors: [] },
    ];
    const map = autoScheduleStartDates(tasks, cal, "2024-01-09", [], resources, { leveling: false });
    expect(map.has("G")).toBe(false);
    expect(map.get("L")).toBe("2024-01-09");
  });

  it("平準化OFFでも、余裕のある固定マイルストーンの後続タスクはマイルストーンの表示日（期日）より後に書き戻す", () => {
    // C が長いため M（期日 1/31）には余裕があり、M の ES は 1/12・表示日（LS）は 1/31 になる。
    // CPM の ES だけで書き戻すと B が 1/15 になり、表示上 M より前に開始してしまう。
    const tasks = [
      { id: "C", name: "C", parentId: null, order: 0, startDate: "2024-01-09", duration: 30, predecessors: [] },
      { id: "A", name: "A", parentId: null, order: 1, startDate: "2024-01-09", duration: 3, predecessors: [] },
      {
        id: "M", name: "M", parentId: null, order: 2, duration: 0, milestone: true, milestoneMode: "fixed",
        fixedDate: "2024-01-31", predecessors: [{ id: "A", type: "FS", lag: 0 }],
      },
      { id: "B", name: "B", parentId: null, order: 3, duration: 2, predecessors: [{ id: "M", type: "FS", lag: 0 }] },
    ];
    const map = autoScheduleStartDates(tasks, cal, "2024-01-09", [], resources, { leveling: false });
    expect(map.get("M")).toBe("2024-01-31"); // 固定マイルストーン自身は従来どおり LS
    expect(map.get("B")).toBe("2024-02-01");
    expect(map.get("A")).toBe("2024-01-09"); // それ以外は従来どおり最短
  });

  it("平準化OFFでは固定マイルストーンの期日超過時も、書き戻す自身の日付は LS（期日）のまま", () => {
    const tasks = [
      { id: "T1", name: "T1", parentId: null, order: 0, startDate: "2024-01-09", duration: 10, predecessors: [] },
      {
        id: "M", name: "M", parentId: null, order: 1, duration: 0, milestone: true, milestoneMode: "fixed",
        fixedDate: "2024-01-10", predecessors: [{ id: "T1", type: "FS", lag: 0 }],
      },
      { id: "B", name: "B", parentId: null, order: 2, duration: 1, predecessors: [{ id: "M", type: "FS", lag: 0 }] },
    ];
    const map = autoScheduleStartDates(tasks, cal, "2024-01-09", [], resources, { leveling: false });
    expect(map.get("M")).toBe("2024-01-10");
    expect(map.get("B")).toBe("2024-01-24"); // T1 終了（1/22）→ M 最早日 1/23 → B は 1/24
  });
});

describe("buildDisplaySchedule", () => {
  const res = [{ id: "r1", name: "R1", weeklyCapacity: 2, monthlyCapacity: 20 }];
  const tasks = [
    { id: "G", name: "G", parentId: null, order: 0, predecessors: [] },
    { id: "T", name: "T", parentId: "G", order: 0, startDate: "2024-01-15", duration: 3, assigneeId: "r1", predecessors: [] },
    { id: "M", name: "M", parentId: "G", order: 1, duration: 0, milestone: true, predecessors: [{ id: "T", type: "FS", lag: 0 }] },
  ];

  it("平準化OFFでは CPM の日程に連続配分の日別割当を付け、CPM の結果自体は書き換えない", () => {
    const { result } = runCPM(tasks, cal, "2024-01-15", []);
    const { schedule, levelWarnings } = buildDisplaySchedule(tasks, result, res, cal, [], { leveling: false });
    expect(levelWarnings).toEqual([]);
    expect(schedule.get("T").schedFinish).toBe("2024-01-17");
    expect(schedule.get("T").allocation).toEqual({ alloc: dailyLoads(cal, "2024-01-15", 3), idle: [] });
    expect(schedule.get("M").allocation).toBeUndefined();
    expect(schedule.get("G").allocation).toBeUndefined();
    expect(result.get("T").allocation).toBeUndefined();
  });

  it("平準化ONでは延長後の日程と日別割当を使い、後続タスクとサマリーにも反映する", () => {
    const { result } = runCPM(tasks, cal, "2024-01-15", []);
    const { schedule, levelWarnings } = buildDisplaySchedule(tasks, result, res, cal, [], { leveling: true });
    expect(levelWarnings).toEqual([]);
    expect(schedule.get("T")).toMatchObject({ schedStart: "2024-01-15", schedFinish: "2024-01-22" });
    expect(schedule.get("T").allocation.alloc.map(a => a.date)).toEqual(["2024-01-15", "2024-01-16", "2024-01-22"]);
    expect(schedule.get("M").schedStart).toBe("2024-01-23");
    expect(schedule.get("G")).toMatchObject({ schedStart: "2024-01-15", schedFinish: "2024-01-23", isSummary: true });
    expect(result.get("T").schedFinish).toBe("2024-01-17");
  });
});

describe("earliestSprintFloor", () => {
  const sprintById = {
    sp1: { id: "sp1", startDate: "2024-01-10" },
    sp2: { id: "sp2", startDate: "2024-01-05" },
    sp3: { id: "sp3", startDate: "" },
  };
  it("複数スプリントのうち最も早い開始日を返す", () => {
    expect(earliestSprintFloor(["sp1", "sp2"], sprintById, cal)).toBe("2024-01-05");
  });
  it("開始日未設定のスプリントは無視する", () => {
    expect(earliestSprintFloor(["sp3"], sprintById, cal)).toBe(null);
  });
  it("スプリント未指定はnull", () => {
    expect(earliestSprintFloor(undefined, sprintById, cal)).toBe(null);
  });
});

describe("dailyLoads", () => {
  it("端数のある工数は最終稼働日にのみ端数を割り当てる", () => {
    const loads = dailyLoads(cal, "2024-01-09", 2.5);
    expect(loads).toEqual([
      { date: "2024-01-09", load: 1 },
      { date: "2024-01-10", load: 1 },
      { date: "2024-01-11", load: 0.5 },
    ]);
  });
  it("duration<=0は空配列", () => {
    expect(dailyLoads(cal, "2024-01-09", 0)).toEqual([]);
  });
});

describe("topoOrder", () => {
  it("依存関係に沿った位相順序を返す", () => {
    const order = topoOrder(["a", "b", "c"], { b: [{ id: "a" }], c: [{ id: "b" }] });
    expect(order).toEqual(["a", "b", "c"]);
  });
  it("循環がある場合でも全IDを漏らさずフォールバックで返す", () => {
    const order = topoOrder(["a", "b"], { a: [{ id: "b" }], b: [{ id: "a" }] });
    expect(new Set(order)).toEqual(new Set(["a", "b"]));
  });
});

describe("deriveProjectStart", () => {
  it("開始日を持つタスクのうち最も早い日付を返す", () => {
    const tasks = [
      { id: "a", startDate: "2024-03-01" },
      { id: "b", startDate: "2024-02-15" },
      { id: "c" },
    ];
    expect(deriveProjectStart(tasks, "2024-01-01")).toBe("2024-02-15");
  });
  it("開始日を持つタスクが無い場合は fallback を返す", () => {
    expect(deriveProjectStart([{ id: "a" }, { id: "b" }], "2024-01-01")).toBe("2024-01-01");
  });
  it("空配列・未定義でも fallback を返す", () => {
    expect(deriveProjectStart([], "2024-01-01")).toBe("2024-01-01");
    expect(deriveProjectStart(undefined, "2024-01-01")).toBe("2024-01-01");
  });
});
