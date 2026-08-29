import { describe, it, expect } from "vitest";
import {
  sprintColorForId, computeOverlappingSprintIds, detectSprintConflicts, SPRINT_PALETTE,
} from "./sprints.js";

describe("sprintColorForId", () => {
  it("同じIDには常に同じ配色を返す", () => {
    const c1 = sprintColorForId("sprint-abc");
    const c2 = sprintColorForId("sprint-abc");
    expect(c1).toBe(c2);
  });
  it("パレットの範囲内から返す", () => {
    expect(SPRINT_PALETTE).toContain(sprintColorForId("sprint-xyz"));
  });
});

describe("computeOverlappingSprintIds", () => {
  it("期間が重なるスプリントのIDを両方とも返す", () => {
    const sprints = [
      { id: "a", startDate: "2024-01-01", endDate: "2024-01-10" },
      { id: "b", startDate: "2024-01-05", endDate: "2024-01-15" },
    ];
    expect(computeOverlappingSprintIds(sprints)).toEqual(new Set(["a", "b"]));
  });

  it("重ならないスプリントは含めない", () => {
    const sprints = [
      { id: "a", startDate: "2024-01-01", endDate: "2024-01-10" },
      { id: "b", startDate: "2024-01-11", endDate: "2024-01-20" },
    ];
    expect(computeOverlappingSprintIds(sprints)).toEqual(new Set());
  });

  it("開始日・終了日未設定や逆転した期間は判定から除外する", () => {
    const sprints = [
      { id: "a", startDate: "2024-01-05", endDate: "2024-01-10" },
      { id: "b", startDate: "", endDate: "2024-01-08" },
      { id: "c", startDate: "2024-01-09", endDate: "2024-01-01" }, // 開始>終了は不正
    ];
    expect(computeOverlappingSprintIds(sprints)).toEqual(new Set());
  });

  it("3件以上でも重なる組だけを検出する", () => {
    const sprints = [
      { id: "a", startDate: "2024-01-01", endDate: "2024-01-05" },
      { id: "b", startDate: "2024-01-10", endDate: "2024-01-15" },
      { id: "c", startDate: "2024-01-04", endDate: "2024-01-11" }, // a・bの両方と重なる
    ];
    expect(computeOverlappingSprintIds(sprints)).toEqual(new Set(["a", "b", "c"]));
  });
});

describe("detectSprintConflicts", () => {
  const sprints = [{ id: "s1", name: "S1", startDate: "2024-02-01", endDate: "2024-02-29", order: 0 }];
  const tasks = [
    { id: "t1", name: "T1", parentId: null, order: 0, sprintIds: ["s1"] },
    { id: "t2", name: "T2", parentId: null, order: 1, sprintIds: ["s1"] },
  ];

  it("スプリントが無ければ空配列を返す", () => {
    expect(detectSprintConflicts(tasks, [], new Map())).toEqual([]);
  });

  it("表示スケジュールがスプリント期間内に収まっていれば矛盾なし", () => {
    const schedule = new Map([["t1", { schedStart: "2024-02-05", schedFinish: "2024-02-10" }]]);
    expect(detectSprintConflicts(tasks, sprints, schedule)).toEqual([]);
  });

  it("開始日がスプリント開始より前・終了日がスプリント終了より後をそれぞれ検出する", () => {
    const schedule = new Map([
      ["t1", { schedStart: "2024-01-20", schedFinish: "2024-02-10" }],
      ["t2", { schedStart: "2024-02-20", schedFinish: "2024-03-10" }],
    ]);
    const out = detectSprintConflicts(tasks, sprints, schedule);
    expect(out.map(c => c.taskId)).toEqual(["t1", "t2"]);
    expect(out[0].reasons[0]).toContain("2024/01/20");
    expect(out[1].reasons[0]).toContain("2024/03/10");
  });

  it("複数スプリントが紐付く場合は期間の和集合で判定する", () => {
    const multi = [
      { id: "s1", name: "S1", startDate: "2024-02-01", endDate: "2024-02-15", order: 0 },
      { id: "s2", name: "S2", startDate: "2024-02-16", endDate: "2024-02-29", order: 1 },
    ];
    const t = [{ id: "t1", name: "T1", parentId: null, order: 0, sprintIds: ["s1", "s2"] }];
    const schedule = new Map([["t1", { schedStart: "2024-02-10", schedFinish: "2024-02-20" }]]);
    expect(detectSprintConflicts(t, multi, schedule)).toEqual([]);
  });

  it("固定マイルストーン優先（governed）の場合は補足理由を追加する", () => {
    const schedule = new Map([["t1", { schedStart: "2024-03-05", schedFinish: "2024-03-05", governed: true }]]);
    const out = detectSprintConflicts(tasks, sprints, schedule);
    expect(out[0].reasons.some(r => r.includes("固定マイルストーン"))).toBe(true);
  });

  it("グループタスク・スプリント未紐付けタスクは対象外", () => {
    const withGroup = [
      { id: "g", name: "G", parentId: null, order: 0, sprintIds: ["s1"] },
      { id: "c", name: "C", parentId: "g", order: 0 },
    ];
    const schedule = new Map([["g", { schedStart: "2024-01-01", schedFinish: "2024-05-01" }]]);
    expect(detectSprintConflicts(withGroup, sprints, schedule)).toEqual([]);
  });
});
