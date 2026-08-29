import { describe, it, expect } from "vitest";
import { buildHolidayMap, makeCalendar } from "./calendar.js";
import {
  runCPM, rollupSummaries, levelResources, dailyLoads, topoOrder, earliestSprintFloor,
  deriveProjectStart,
} from "./scheduling.js";

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

  it("固定マイルストーンの平準化後の日程が期日を超過すると警告を返す", () => {
    const tasks = [
      { id: "T1", name: "T1", parentId: null, order: 0, startDate: "2024-01-09", duration: 10, assigneeId: "r1", predecessors: [] },
      {
        id: "M", name: "M", parentId: null, order: 1, duration: 0, milestone: true, milestoneMode: "fixed",
        fixedDate: "2024-01-10", predecessors: [{ id: "T1", type: "FS", lag: 0 }],
      },
    ];
    const resources = [{ id: "r1", name: "R1", weeklyCapacity: 5, monthlyCapacity: 20 }];
    const { result: cpmResult } = runCPM(tasks, cal, "2024-01-09", []);
    const { warnings } = levelResources(tasks, cpmResult, resources, cal, []);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("固定期日");
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
