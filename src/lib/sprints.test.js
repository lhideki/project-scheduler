import { describe, it, expect } from "vitest";
import { sprintColorForId, computeOverlappingSprintIds, SPRINT_PALETTE } from "./sprints.js";

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
