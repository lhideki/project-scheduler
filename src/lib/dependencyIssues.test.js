import { describe, it, expect } from "vitest";
import { buildHolidayMap, makeCalendar } from "./calendar.js";
import { runCPM, levelResources, rollupSummaries, autoScheduleStartDates } from "./scheduling.js";
import {
  findMissingPredecessors, findSelfDependencies, findDependencyCycles, detectDependencyIssues, detectScheduleDependencyIssues,
  groupDependencyIssuesByTask, DEPENDENCY_ISSUE_CODES,
} from "./dependencyIssues.js";
import { createAppTranslator, formatDependencyIssueMessage } from "./i18n.js";

// lib は文言を組み立てず code + params を返す。日本語の表示文言が従来どおりであることは
// メッセージカタログ（src/messages/ja.json）で生成して確認する。
const tJa = createAppTranslator("ja");
const jaMessage = issue => formatDependencyIssueMessage(tJa, issue);

// 2024-01-09(火)〜2024-02-09の間は土日以外の非稼働日が無い期間なので、
// 日付計算の期待値を単純な曜日カウントで検証できる（scheduling.test.js と同じ前提）。
const cal = makeCalendar(buildHolidayMap(2024, 2024));
const PROJECT_START = "2024-01-09";

const task = (o) => ({ parentId: null, order: 0, duration: 1, predecessors: [], ...o, name: o.name ?? o.id });
const fs = (id, lag = 0) => ({ id, type: "FS", lag });

/** App.jsx の cpm / schedule useMemo と同じ手順で表示スケジュールを作る。 */
function displaySchedule(tasks, { leveling = false, resources = [], sprints = [] } = {}) {
  const cpm = runCPM(tasks, cal, PROJECT_START, sprints);
  if (!leveling) return cpm.result;
  const { placed } = levelResources(tasks, cpm.result, resources, cal, sprints);
  const merged = new Map(cpm.result);
  for (const [id, dates] of Object.entries(placed)) {
    merged.set(id, { ...merged.get(id), schedStart: dates.start, schedFinish: dates.finish });
  }
  rollupSummaries(tasks, merged);
  return merged;
}
const detect = (tasks, opts) => detectDependencyIssues(tasks, displaySchedule(tasks, opts), cal);
const codesOf = (issues) => issues.map(i => `${i.code}:${i.ids.join(",")}`);

describe("findMissingPredecessors", () => {
  it("存在しないIDを参照する先行タスクを、グループに設定されたものも含めて列挙する", () => {
    const tasks = [
      task({ id: "G" , predecessors: [fs("gone-1")] }),
      task({ id: "A", parentId: "G", predecessors: [fs("gone-2"), fs("B")] }),
      task({ id: "B" }),
    ];
    expect(findMissingPredecessors(tasks)).toEqual([
      { taskId: "G", predecessorId: "gone-1" },
      { taskId: "A", predecessorId: "gone-2" },
    ]);
  });

  it("自分自身への依存は対象外（findSelfDependencies で扱う）", () => {
    expect(findMissingPredecessors([task({ id: "A", predecessors: [fs("A")] })])).toEqual([]);
  });
});

describe("findSelfDependencies", () => {
  it("自分自身を先行タスクにしているタスク・グループを列挙する", () => {
    const tasks = [
      task({ id: "G", predecessors: [fs("G")] }),
      task({ id: "A", parentId: "G", predecessors: [fs("B"), fs("A")] }),
      task({ id: "B" }),
    ];
    expect(findSelfDependencies(tasks)).toEqual([{ taskId: "G" }, { taskId: "A" }]);
  });

  it("エンジンが無視するため findDependencyCycles では検出されない（別途検出が必要）", () => {
    expect(findDependencyCycles([task({ id: "A", predecessors: [fs("A")] })])).toEqual([]);
  });
});

describe("findDependencyCycles", () => {
  it("循環が無ければ空", () => {
    const tasks = [task({ id: "A" }), task({ id: "B", predecessors: [fs("A")] }), task({ id: "C", predecessors: [fs("B")] })];
    expect(findDependencyCycles(tasks)).toEqual([]);
  });

  it("相互依存を1件の循環として返す（経路は先頭と末尾が同じ）", () => {
    const tasks = [task({ id: "a", predecessors: [fs("b")] }), task({ id: "b", predecessors: [fs("a")] })];
    const cycles = findDependencyCycles(tasks);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].ids).toEqual(["a", "b"]);
    expect(cycles[0].path).toEqual(["a", "b", "a"]);
    expect(cycles[0].memberEdges).toEqual([]);
  });

  it("グループを介した循環（AがグループGに依存し、G配下のBがAに依存）を検出する", () => {
    const tasks = [
      task({ id: "A", order: 0, predecessors: [fs("G")] }),
      task({ id: "G", order: 1 }),
      task({ id: "B", parentId: "G", order: 0, predecessors: [fs("A")] }),
      task({ id: "C", parentId: "G", order: 1 }),
    ];
    const cycles = findDependencyCycles(tasks);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].ids).toEqual(["A", "G", "B"]);
    expect(cycles[0].path).toEqual(["A", "B", "G", "A"]);
    expect(cycles[0].memberEdges).toEqual([["B", "G"]]);
  });

  it("グループに設定した先行タスクを介した循環（グループ同士の相互依存）を検出する", () => {
    const tasks = [
      task({ id: "G1", order: 0, predecessors: [fs("G2")] }),
      task({ id: "a", parentId: "G1" }),
      task({ id: "G2", order: 1, predecessors: [fs("G1")] }),
      task({ id: "b", parentId: "G2" }),
    ];
    const cycles = findDependencyCycles(tasks);
    expect(cycles).toHaveLength(1);
    expect(new Set(cycles[0].ids)).toEqual(new Set(["G1", "a", "G2", "b"]));
  });

  it("エンジンが無視する依存（祖先グループへの依存・グループの先行タスクが自身の配下）は循環にしない", () => {
    const tasks = [
      task({ id: "G", predecessors: [fs("P")] }),
      task({ id: "P", parentId: "G", order: 0 }),
      task({ id: "Q", parentId: "G", order: 1, predecessors: [fs("G")] }),
    ];
    expect(findDependencyCycles(tasks)).toEqual([]);
  });

  it("親子関係だけの循環は依存関係の循環として扱わない（無限ループもしない）", () => {
    const tasks = [
      task({ id: "a", parentId: "b" }),
      task({ id: "b", parentId: "a" }),
      task({ id: "leaf", parentId: "a" }),
    ];
    expect(findDependencyCycles(tasks)).toEqual([]);
  });
});

describe("detectDependencyIssues: 開始日との矛盾", () => {
  it("FS: 先行タスクの終了前に開始している後続タスクを、必要な開始日つきで警告する", () => {
    const tasks = [
      task({ id: "X", name: "基本設計", startDate: "2024-01-09", duration: 2 }),
      task({ id: "Y", order: 1, startDate: "2024-01-10", duration: 2, predecessors: [fs("X")] }),
    ];
    const issues = detect(tasks);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: DEPENDENCY_ISSUE_CODES.violation, severity: "warning", ids: ["Y"], predecessorId: "X",
      requiredDate: "2024-01-11", actualDate: "2024-01-10",
    });
    expect(issues[0].params).toEqual({ side: "start", predName: "基本設計", label: "FS", required: "2024-01-11", actual: "2024-01-10" });
    expect(issues[0]).not.toHaveProperty("message");
    expect(jaMessage(issues[0])).toBe("先行「基本設計」（FS）の条件では 2024/01/11 以降に開始する必要がありますが、2024/01/10 に開始しています");
  });

  it("依存関係の条件を満たしていれば警告しない（開始日が未入力のタスクも含む）", () => {
    const tasks = [
      task({ id: "X", startDate: "2024-01-09", duration: 2 }),
      task({ id: "Y", order: 1, startDate: "2024-01-11", duration: 2, predecessors: [fs("X")] }),
      task({ id: "Z", order: 2, duration: 2, predecessors: [fs("Y")] }),
    ];
    expect(detect(tasks)).toEqual([]);
  });

  it("SS・負のラグ（リード）を考慮する", () => {
    const base = task({ id: "X", startDate: "2024-01-09", duration: 3 }); // 1/9〜1/11
    const ssOk = [base, task({ id: "Y", order: 1, startDate: "2024-01-11", predecessors: [{ id: "X", type: "SS", lag: 2 }] })];
    const ssNg = [base, task({ id: "Y", order: 1, startDate: "2024-01-10", predecessors: [{ id: "X", type: "SS", lag: 2 }] })];
    expect(detect(ssOk)).toEqual([]);
    expect(detect(ssNg).map(i => i.requiredDate)).toEqual(["2024-01-11"]);
    const leadOk = [base, task({ id: "Y", order: 1, startDate: "2024-01-11", predecessors: [fs("X", -1)] })];
    const leadNg = [base, task({ id: "Y", order: 1, startDate: "2024-01-10", predecessors: [fs("X", -1)] })];
    expect(detect(leadOk)).toEqual([]);
    expect(codesOf(detect(leadNg))).toEqual(["dependency-violation:Y"]);
  });

  it("FF/SF は終了日で条件を説明する", () => {
    const x = task({ id: "X", name: "X", startDate: "2024-01-10", duration: 3 }); // 1/10〜1/12
    const ff = detect([x, task({ id: "Y", order: 1, startDate: "2024-01-09", duration: 2, predecessors: [{ id: "X", type: "FF", lag: 0 }] })]);
    expect(ff).toHaveLength(1);
    expect(ff[0].params).toMatchObject({ side: "finish", required: "2024-01-12", actual: "2024-01-10" });
    expect(jaMessage(ff[0])).toBe("先行「X」（FF）の条件では 2024/01/12 以降に終了する必要がありますが、2024/01/10 に終了しています");
    const sf = detect([x, task({ id: "Y", order: 1, startDate: "2024-01-09", duration: 1, predecessors: [{ id: "X", type: "SF", lag: 0 }] })]);
    expect(sf).toHaveLength(1);
    expect(jaMessage(sf[0])).toContain("2024/01/10 以降に終了する必要があります");
  });

  it("着手済み（progress > 0）のタスクは開始日との矛盾として警告しない", () => {
    const tasks = [
      task({ id: "X", startDate: "2024-01-09", duration: 2 }),
      task({ id: "Y", order: 1, startDate: "2024-01-10", duration: 2, progress: 30, predecessors: [fs("X")] }),
    ];
    expect(detect(tasks)).toEqual([]);
  });

  it("グループを先行タスクにした場合は、グループのロールアップ期間で判定する", () => {
    const tasks = [
      task({ id: "G", order: 0 }),
      task({ id: "X1", parentId: "G", order: 0, startDate: "2024-01-09", duration: 2 }),
      task({ id: "X2", parentId: "G", order: 1, startDate: "2024-01-09", duration: 3 }), // 〜1/11
      task({ id: "Y", order: 1, startDate: "2024-01-11", predecessors: [fs("G")] }),
    ];
    const issues = detect(tasks);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ ids: ["Y"], predecessorId: "G", requiredDate: "2024-01-12" });
  });

  it("グループに設定した先行タスクは配下のタスクに伝播したうえで判定する", () => {
    const tasks = [
      task({ id: "X", order: 0, startDate: "2024-01-09", duration: 3 }),
      task({ id: "H", order: 1, predecessors: [fs("X")] }),
      task({ id: "Y", parentId: "H", startDate: "2024-01-10" }),
    ];
    expect(codesOf(detect(tasks))).toEqual(["dependency-violation:Y"]);
  });

  it("平準化ONの表示では手入力の開始日が下限扱いになるため、開始日との矛盾は出ない", () => {
    const tasks = [
      task({ id: "X", startDate: "2024-01-09", duration: 2 }),
      task({ id: "Y", order: 1, startDate: "2024-01-10", duration: 2, predecessors: [fs("X")] }),
    ];
    expect(detect(tasks, { leveling: true })).toEqual([]);
  });
});

describe("detectDependencyIssues: 固定マイルストーンの期日超過", () => {
  const overrunTasks = () => [
    task({ id: "T1", name: "結合テスト", startDate: "2024-01-09", duration: 10, assigneeId: "r1" }), // 〜1/22
    task({
      id: "M", order: 1, duration: 0, milestone: true, milestoneMode: "fixed", fixedDate: "2024-01-10",
      startDate: "2024-01-10", predecessors: [fs("T1")],
    }),
  ];
  const resources = [{ id: "r1", name: "R1", weeklyCapacity: 5, monthlyCapacity: 20 }];

  it("平準化OFFでも、先行タスクから求めた最早日が固定期日を超えていれば警告する", () => {
    const issues = detect(overrunTasks());
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: DEPENDENCY_ISSUE_CODES.overrun, severity: "warning", ids: ["M"], requiredDate: "2024-01-23" });
    expect(issues[0].params).toEqual({ predName: "結合テスト", earliest: "2024-01-23", fixedDate: "2024-01-10" });
    expect(jaMessage(issues[0])).toBe("先行「結合テスト」から求めた最早日（2024/01/23）が固定期日（2024/01/10）を超過しています");
  });

  it("平準化ONでも同じく警告する（平準化の警告とは二重に出さない）", () => {
    const tasks = overrunTasks();
    const issues = detect(tasks, { leveling: true, resources });
    expect(codesOf(issues)).toEqual(["fixed-milestone-overrun:M"]);
    const cpm = runCPM(tasks, cal, PROJECT_START, []);
    expect(levelResources(tasks, cpm.result, resources, cal, []).warnings).toEqual([]);
  });

  it("期日までに間に合う固定マイルストーンは警告しない", () => {
    const tasks = overrunTasks();
    tasks[1] = { ...tasks[1], fixedDate: "2024-01-31", startDate: "2024-01-31" };
    expect(detect(tasks)).toEqual([]);
    expect(detect(tasks, { leveling: true, resources })).toEqual([]);
  });
});

describe("detectDependencyIssues: 循環・存在しない先行タスク", () => {
  it("循環に含まれるタスクは循環だけを報告し、開始日との矛盾は重ねて出さない", () => {
    const tasks = [
      task({ id: "A", name: "A", startDate: "2024-01-09", duration: 2, predecessors: [fs("B")] }),
      task({ id: "B", name: "B", order: 1, startDate: "2024-01-09", duration: 2, predecessors: [fs("A")] }),
      task({ id: "C", name: "C", order: 2, startDate: "2024-01-09", predecessors: [fs("B")] }),
    ];
    const issues = detect(tasks);
    expect(codesOf(issues)).toEqual(["dependency-cycle:A,B"]);
    expect(issues[0]).toMatchObject({ severity: "error", path: ["A", "B", "A"] });
    expect(jaMessage(issues[0])).toBe("循環参照: 「A」→「B」→「A」");
  });

  it("グループを介した循環のメッセージに、所属関係を補足する", () => {
    const tasks = [
      task({ id: "A", name: "A", order: 0, predecessors: [fs("G")] }),
      task({ id: "G", name: "G", order: 1 }),
      task({ id: "B", name: "B", parentId: "G", predecessors: [fs("A")] }),
    ];
    const [issue] = detectDependencyIssues(tasks);
    expect(issue.params.memberEdges).toEqual([{ childId: "B", childName: "B", parentId: "G", parentName: "G" }]);
    expect(jaMessage(issue)).toBe("循環参照: 「A」→「B」→「G」→「A」（「B」はグループ「G」の配下）");
  });

  it("自分自身への依存（WBS表の先行欄に自分のWBS番号を入力した場合等）を error として報告する", () => {
    const tasks = [task({ id: "A", name: "A", startDate: "2024-01-09", predecessors: [fs("A")] })];
    const issues = detect(tasks);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: DEPENDENCY_ISSUE_CODES.self, severity: "error", ids: ["A"], predecessorId: "A" });
    expect(jaMessage(issues[0])).toBe("自分自身を先行タスクにしています（この依存関係は計算に使われていません）");
  });

  it("存在しない先行タスクを error として報告する（スケジュール無しでも判定できる）", () => {
    const tasks = [task({ id: "A", predecessors: [fs("deleted")] })];
    const issues = detectDependencyIssues(tasks);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: DEPENDENCY_ISSUE_CODES.missing, severity: "error", ids: ["A"], predecessorId: "deleted" });
  });

  it("スケジュールを渡さない場合は、日程に関する判定を行わない", () => {
    const tasks = [
      task({ id: "X", startDate: "2024-01-09", duration: 2 }),
      task({ id: "Y", order: 1, startDate: "2024-01-10", predecessors: [fs("X")] }),
    ];
    expect(detectDependencyIssues(tasks)).toEqual([]);
    expect(detectScheduleDependencyIssues(tasks, displaySchedule(tasks), cal)).toHaveLength(1);
  });

  it("WBS表示順・種別順（循環 → 存在しない先行 → 開始日 → 期日超過）に並べる", () => {
    const tasks = [
      task({ id: "Z", order: 1, startDate: "2024-01-09", predecessors: [fs("missing")] }),
      task({ id: "X", order: 0, startDate: "2024-01-09", duration: 3 }),
      task({ id: "Y", order: 2, startDate: "2024-01-09", predecessors: [fs("X"), fs("missing")] }),
    ];
    expect(codesOf(detect(tasks))).toEqual([
      "predecessor-missing:Z", "predecessor-missing:Y", "dependency-violation:Y",
    ]);
  });
});

describe("groupDependencyIssuesByTask", () => {
  it("循環は含まれる全タスクに割り当てる", () => {
    const tasks = [task({ id: "a", predecessors: [fs("b")] }), task({ id: "b", order: 1, predecessors: [fs("a")] })];
    const map = groupDependencyIssuesByTask(detectDependencyIssues(tasks));
    expect(map.get("a")).toHaveLength(1);
    expect(map.get("b")).toHaveLength(1);
    expect(map.get("a")[0]).toBe(map.get("b")[0]);
  });
});

describe("自動スケジューリング実行後の開始日との矛盾", () => {
  // 固定マイルストーン M（期日 1/31）の後続 B は、M の表示日（期日）より後に開始しなければならない。
  // 並行する長いタスク C があると M に余裕（フロート）が生じ、M の表示日（LS）と最早日（ES）がずれる。
  const tasks = () => [
    task({ id: "C", order: 0, startDate: "2024-01-09", duration: 30 }),
    task({ id: "A", order: 1, startDate: "2024-01-09", duration: 3 }),
    task({ id: "M", order: 2, duration: 0, milestone: true, milestoneMode: "fixed", fixedDate: "2024-01-31", predecessors: [fs("A")] }),
    task({ id: "B", order: 3, duration: 2, predecessors: [fs("M")] }),
    task({ id: "G", order: 4 }),
    task({ id: "M2", parentId: "G", order: 0, duration: 0, milestone: true, milestoneMode: "fixed", fixedDate: "2024-01-31", predecessors: [fs("A")] }),
    task({ id: "D", order: 5, duration: 1, predecessors: [fs("G")] }),
  ];

  for (const leveling of [false, true]) {
    it(`平準化${leveling ? "ON" : "OFF"}で書き戻した日程には開始日との矛盾が出ない（固定マイルストーン・それを含むグループの後続を含む）`, () => {
      const before = tasks();
      const startDates = autoScheduleStartDates(before, cal, PROJECT_START, [], [], { leveling });
      const after = before.map(t => (startDates.has(t.id) ? { ...t, startDate: startDates.get(t.id) } : t));
      expect(detect(after, { leveling })).toEqual([]);
      expect(startDates.get("B")).toBe("2024-02-01");
      expect(startDates.get("D")).toBe("2024-02-01");
    });
  }
});
