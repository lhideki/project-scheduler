import { describe, it, expect } from "vitest";
import { buildHolidayMap, makeCalendar } from "./calendar.js";
import {
  runCPM, rollupSummaries, levelResources, dailyLoads, topoOrder, earliestSprintFloor,
  deriveProjectStart, autoScheduleStartDates,
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
  it.each([
    ["週次", 2, 20],
    ["月次", 5, 3],
  ])("%s上限内に配置できない場合は探索開始日に戻して警告する", (label, weeklyCapacity, monthlyCapacity) => {
    const tasks = [
      { id: "T", name: "大きなタスク", parentId: null, order: 0, startDate: "2024-01-09", duration: 10, assigneeId: "r1", predecessors: [] },
    ];
    const resources = [{ id: "r1", name: "担当者1", weeklyCapacity, monthlyCapacity }];
    const { result } = runCPM(tasks, cal, "2024-01-09", []);
    const { placed, warnings } = levelResources(tasks, result, resources, cal, []);
    expect(placed.T).toEqual({ start: "2024-01-09", finish: "2024-01-22" });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("大きなタスク");
    expect(warnings[0]).toContain("担当者1");
    expect(warnings[0]).toContain(label);
    expect(warnings[0]).toContain("稼働上限を超過");
  });

  it("配置失敗したタスクの負荷と終了日を、他タスクの平準化・依存関係に反映する", () => {
    const tasks = [
      { id: "A", name: "A", parentId: null, order: 0, startDate: "2024-01-09", duration: 10, assigneeId: "r1", predecessors: [] },
      { id: "B", name: "B", parentId: null, order: 1, startDate: "2024-01-09", duration: 1, assigneeId: "r1", predecessors: [] },
      { id: "C", name: "C", parentId: null, order: 2, duration: 1, predecessors: [{ id: "A", type: "FS", lag: 0 }] },
    ];
    const resources = [{ id: "r1", name: "R1", weeklyCapacity: 2, monthlyCapacity: 20 }];
    const { result } = runCPM(tasks, cal, "2024-01-09", []);
    const { placed, warnings } = levelResources(tasks, result, resources, cal, []);
    expect(placed.A.finish).toBe("2024-01-22");
    expect(placed.B.start).toBe("2024-01-23");
    expect(placed.C.start).toBe("2024-01-23");
    expect(warnings).toHaveLength(1);
  });

  it("配置失敗時も依存関係・手入力開始日・スプリントの下限を守る", () => {
    const tasks = [
      { id: "A", name: "A", parentId: null, order: 0, startDate: "2024-01-09", duration: 5, predecessors: [] },
      { id: "B", name: "B", parentId: null, order: 1, startDate: "2024-01-18", duration: 10, assigneeId: "r1", sprintIds: ["s"], predecessors: [{ id: "A", type: "FS", lag: 0 }] },
    ];
    const resources = [{ id: "r1", name: "R1", weeklyCapacity: 2, monthlyCapacity: 20 }];
    const sprints = [{ id: "s", startDate: "2024-01-22", endDate: "2024-02-09" }];
    const { result } = runCPM(tasks, cal, "2024-01-09", sprints);
    const { placed, warnings } = levelResources(tasks, result, resources, cal, sprints);
    expect(placed.B.start).toBe("2024-01-22");
    expect(warnings).toHaveLength(1);
  });

  it("総工数が週次上限を超えていても週をまたいで収まるタスクは配置できる", () => {
    const tasks = [
      { id: "T", name: "T", parentId: null, order: 0, startDate: "2024-01-09", duration: 4, assigneeId: "r1", predecessors: [] },
    ];
    const resources = [{ id: "r1", name: "R1", weeklyCapacity: 2, monthlyCapacity: 20 }];
    const { result } = runCPM(tasks, cal, "2024-01-09", []);
    const { placed, warnings } = levelResources(tasks, result, resources, cal, []);
    expect(placed.T).toEqual({ start: "2024-01-11", finish: "2024-01-16" });
    expect(warnings).toEqual([]);
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
