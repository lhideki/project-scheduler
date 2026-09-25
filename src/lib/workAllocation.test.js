import { describe, it, expect } from "vitest";
import { buildHolidayMap, makeCalendar } from "./calendar.js";
import {
  dailyLoads, createCapacityLedger, allocateWork, commitAllocation,
  consecutiveDateRuns, idleSegments, allocationProgressPoint, ALLOCATION_SEARCH_WORKDAYS,
} from "./workAllocation.js";

// 2024-01-15(月)〜2024-02-09 は土日以外の非稼働日が無い期間。
const cal = makeCalendar(buildHolidayMap(2024, 2024));
const res = (weeklyCapacity, monthlyCapacity) => ({ id: "r1", name: "R1", weeklyCapacity, monthlyCapacity });

describe("allocateWork", () => {
  it("早い日から日次・週次・月次の残りの最小値を割り当てる", () => {
    const r = allocateWork(createCapacityLedger(), res(2, 20), cal, "2024-01-15", 3);
    expect(r.ok).toBe(true);
    expect(r.alloc).toEqual([
      { date: "2024-01-15", load: 1 },
      { date: "2024-01-16", load: 1 },
      { date: "2024-01-22", load: 1 },
    ]);
    expect(r.idle.map(d => d.reason)).toEqual(["weekly", "weekly", "weekly"]);
  });

  it("小数の上限では1人日未満の日が生じ、その理由を limitedBy に記録する", () => {
    const r = allocateWork(createCapacityLedger(), res(2.5, 20), cal, "2024-01-15", 3);
    expect(r.alloc).toEqual([
      { date: "2024-01-15", load: 1 },
      { date: "2024-01-16", load: 1 },
      { date: "2024-01-17", load: 0.5, limitedBy: "weekly" },
      { date: "2024-01-22", load: 0.5 },
    ]);
    expect(r.alloc.reduce((s, a) => s + a.load, 0)).toBe(3);
  });

  it("月次上限に達した月の残りは monthly の非割当になる", () => {
    const r = allocateWork(createCapacityLedger(), res(0, 2), cal, "2024-01-30", 3);
    expect(r.alloc.map(a => a.date)).toEqual(["2024-01-30", "2024-01-31", "2024-02-01"]);
    const r2 = allocateWork(createCapacityLedger(), res(0, 2), cal, "2024-01-29", 3);
    expect(r2.alloc.map(a => a.date)).toEqual(["2024-01-29", "2024-01-30", "2024-02-01"]);
    expect(r2.idle).toEqual([{ date: "2024-01-31", reason: "monthly" }]);
  });

  it("上限値0・未設定は上限なし（日次1人日のみ）として扱う", () => {
    const r = allocateWork(createCapacityLedger(), res(0, undefined), cal, "2024-01-15", 6);
    expect(r.alloc.map(a => a.date)).toEqual(dailyLoads(cal, "2024-01-15", 6).map(a => a.date));
    expect(r.idle).toEqual([]);
  });

  it("台帳に登録済みの割当を差し引き、その日を埋めているタスクを記録する", () => {
    const ledger = createCapacityLedger();
    commitAllocation(ledger, "r1", "A", [{ date: "2024-01-15", load: 1 }, { date: "2024-01-16", load: 0.5 }]);
    const r = allocateWork(ledger, res(5, 20), cal, "2024-01-15", 2, { pinned: true });
    expect(r.alloc).toEqual([
      { date: "2024-01-16", load: 0.5, limitedBy: "daily" },
      { date: "2024-01-17", load: 1 },
      { date: "2024-01-18", load: 0.5 },
    ]);
    expect(r.idle).toEqual([{ date: "2024-01-15", reason: "daily", taskIds: ["A"] }]);
  });

  it("開始日を固定しない場合は、最初に割り当てた日より前の非割当日を記録しない", () => {
    const ledger = createCapacityLedger();
    commitAllocation(ledger, "r1", "A", [{ date: "2024-01-15", load: 1 }]);
    const r = allocateWork(ledger, res(5, 20), cal, "2024-01-15", 1);
    expect(r.alloc).toEqual([{ date: "2024-01-16", load: 1 }]);
    expect(r.idle).toEqual([]);
  });

  it("探索上限の稼働日数内に割り当てきれない場合は ok=false を返す", () => {
    const r = allocateWork(createCapacityLedger(), res(1, 20), cal, "2024-01-15", ALLOCATION_SEARCH_WORKDAYS);
    expect(r.ok).toBe(false);
  });

  it("0.01人日未満の工数も割当が空にならない", () => {
    const r = allocateWork(createCapacityLedger(), res(5, 20), cal, "2024-01-15", 0.001);
    expect(r.ok).toBe(true);
    expect(r.alloc).toEqual([{ date: "2024-01-15", load: 0.001 }]);
  });
});

describe("consecutiveDateRuns", () => {
  it("暦日で連続する日付を区間にまとめる", () => {
    expect(consecutiveDateRuns(["2024-01-17", "2024-01-18", "2024-01-19", "2024-01-22"])).toEqual([
      { start: "2024-01-17", end: "2024-01-19" },
      { start: "2024-01-22", end: "2024-01-22" },
    ]);
    expect(consecutiveDateRuns([])).toEqual([]);
  });
});

describe("idleSegments", () => {
  it("同じ理由の非割当日は、間に割当日が無ければ土日を挟んでも1区間にまとめる", () => {
    const alloc = [{ date: "2024-01-15", load: 1 }, { date: "2024-01-16", load: 1 }, { date: "2024-01-24", load: 1 }];
    const idle = ["2024-01-17", "2024-01-18", "2024-01-19", "2024-01-22", "2024-01-23"].map(date => ({ date, reason: "weekly" }));
    expect(idleSegments(idle, alloc)).toEqual([
      { start: "2024-01-17", end: "2024-01-23", days: 5, reason: "weekly", taskIds: [] },
    ]);
  });

  it("理由が変わるか、間に割当日を挟む場合は区間を分け、日次の区間は埋めているタスクを合算する", () => {
    const alloc = [{ date: "2024-01-17", load: 1 }];
    const idle = [
      { date: "2024-01-15", reason: "daily", taskIds: ["A"] },
      { date: "2024-01-16", reason: "daily", taskIds: ["B"] },
      { date: "2024-01-18", reason: "daily", taskIds: ["A"] },
      { date: "2024-01-19", reason: "weekly" },
    ];
    expect(idleSegments(idle, alloc)).toEqual([
      { start: "2024-01-15", end: "2024-01-16", days: 2, reason: "daily", taskIds: ["A", "B"] },
      { start: "2024-01-18", end: "2024-01-18", days: 1, reason: "daily", taskIds: ["A"] },
      { start: "2024-01-19", end: "2024-01-19", days: 1, reason: "weekly", taskIds: [] },
    ]);
  });
});

describe("allocationProgressPoint", () => {
  const alloc = [
    { date: "2024-01-15", load: 1 },
    { date: "2024-01-16", load: 1 },
    { date: "2024-01-22", load: 1 },
  ];
  it("進捗率を工数に対する割合として、割当の累積から到達位置を求める", () => {
    expect(allocationProgressPoint(alloc, 0)).toEqual({ date: "2024-01-15", dayFraction: 0 });
    expect(allocationProgressPoint(alloc, 0.5)).toEqual({ date: "2024-01-16", dayFraction: 0.5 });
    expect(allocationProgressPoint(alloc, 2 / 3)).toEqual({ date: "2024-01-16", dayFraction: 1 });
    expect(allocationProgressPoint(alloc, 1)).toEqual({ date: "2024-01-22", dayFraction: 1 });
  });
  it("1人日未満の日は、その日の割当量に対する割合で位置を求める", () => {
    const partial = [{ date: "2024-01-15", load: 0.5 }, { date: "2024-01-16", load: 0.5 }];
    expect(allocationProgressPoint(partial, 0.25)).toEqual({ date: "2024-01-15", dayFraction: 0.5 });
  });
  it("割当が無ければ null", () => {
    expect(allocationProgressPoint([], 0.5)).toBeNull();
  });
});
