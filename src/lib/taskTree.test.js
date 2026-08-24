import { describe, it, expect } from "vitest";
import {
  migrateSprintIds, isGroupId, buildFlatList, allDescendantIds, ancestorChain, effectivePredecessors,
} from "./taskTree.js";

function makeTasks() {
  // g1
  //   t1
  //   t2 (dep: t1)
  //     t2a (leaf, under a group that also has predecessors)
  // g2
  //   t3
  return [
    { id: "g1", name: "G1", parentId: null, order: 0 },
    { id: "t1", name: "T1", parentId: "g1", order: 0 },
    { id: "t2", name: "T2 group", parentId: "g1", order: 1, predecessors: [{ id: "t1", type: "FS", lag: 0 }] },
    { id: "t2a", name: "T2a", parentId: "t2", order: 0 },
    { id: "g2", name: "G2", parentId: null, order: 1 },
    { id: "t3", name: "T3", parentId: "g2", order: 0 },
  ];
}

describe("isGroupId", () => {
  it("子タスクを持つIDはグループと判定する", () => {
    const tasks = makeTasks();
    expect(isGroupId(tasks, "g1")).toBe(true);
    expect(isGroupId(tasks, "t2")).toBe(true); // t2aの親でもある
    expect(isGroupId(tasks, "t1")).toBe(false);
    expect(isGroupId(tasks, "t2a")).toBe(false);
  });
});

describe("buildFlatList", () => {
  it("アウトライン順にWBS番号・階層・taskNoを付与する", () => {
    const flat = buildFlatList(makeTasks(), new Set());
    expect(flat.map(t => [t.id, t.wbsNo, t.level, t.taskNo])).toEqual([
      ["g1", "1", 0, 1],
      ["t1", "1.1", 1, 2],
      ["t2", "1.2", 1, 3],
      ["t2a", "1.2.1", 2, 4],
      ["g2", "2", 0, 5],
      ["t3", "2.1", 1, 6],
    ]);
  });

  it("折りたたまれたグループの配下は除外する", () => {
    const flat = buildFlatList(makeTasks(), new Set(["t2"]));
    expect(flat.map(t => t.id)).toEqual(["g1", "t1", "t2", "g2", "t3"]);
    expect(flat.find(t => t.id === "t2").hasChildren).toBe(true);
  });

  it("同じ親内はorderでソートする", () => {
    const tasks = [
      { id: "a", name: "A", parentId: null, order: 1 },
      { id: "b", name: "B", parentId: null, order: 0 },
    ];
    expect(buildFlatList(tasks, new Set()).map(t => t.id)).toEqual(["b", "a"]);
  });
});

describe("allDescendantIds", () => {
  it("配下の全孫要素までを収集する", () => {
    const ids = allDescendantIds(makeTasks(), "g1");
    expect(new Set(ids)).toEqual(new Set(["t1", "t2", "t2a"]));
  });
  it("配下が無ければ空配列", () => {
    expect(allDescendantIds(makeTasks(), "t1")).toEqual([]);
  });
});

describe("ancestorChain", () => {
  it("親→祖父母の順で祖先を返す", () => {
    const tasks = makeTasks();
    const byId = Object.fromEntries(tasks.map(t => [t.id, t]));
    const chain = ancestorChain(byId, "t2a");
    expect(chain.map(t => t.id)).toEqual(["t2", "g1"]);
  });
  it("ルート直下タスクは空配列", () => {
    const tasks = makeTasks();
    const byId = Object.fromEntries(tasks.map(t => [t.id, t]));
    expect(ancestorChain(byId, "g1")).toEqual([]);
  });
});

describe("effectivePredecessors", () => {
  it("自身の先行タスクに加え、祖先グループの先行タスクも合成する", () => {
    const tasks = [
      { id: "g1", name: "G1", parentId: null, order: 0, predecessors: [{ id: "ext", type: "FS", lag: 0 }] },
      { id: "leaf", name: "leaf", parentId: "g1", order: 0, predecessors: [{ id: "other", type: "SS", lag: 1 }] },
    ];
    const byId = Object.fromEntries(tasks.map(t => [t.id, t]));
    const eff = effectivePredecessors(byId, tasks[1]);
    expect(eff).toEqual(expect.arrayContaining([
      { id: "other", type: "SS", lag: 1 },
      { id: "ext", type: "FS", lag: 0 },
    ]));
    expect(eff).toHaveLength(2);
  });

  it("自分自身や祖先を参照する循環依存は除外する", () => {
    const tasks = [
      { id: "g1", name: "G1", parentId: null, order: 0, predecessors: [{ id: "leaf", type: "FS", lag: 0 }] },
      { id: "leaf", name: "leaf", parentId: "g1", order: 0, predecessors: [{ id: "g1", type: "FS", lag: 0 }] },
    ];
    const byId = Object.fromEntries(tasks.map(t => [t.id, t]));
    expect(effectivePredecessors(byId, tasks[1])).toEqual([]);
  });
});

describe("migrateSprintIds", () => {
  it("旧形式のsprintIdをsprintIds配列へ変換する", () => {
    const out = migrateSprintIds([{ id: "t1", sprintId: "sp1" }]);
    expect(out).toEqual([{ id: "t1", sprintIds: ["sp1"] }]);
  });
  it("既にsprintIdsを持つタスクはそのまま通す", () => {
    const out = migrateSprintIds([{ id: "t1", sprintIds: ["sp1", "sp2"] }]);
    expect(out).toEqual([{ id: "t1", sprintIds: ["sp1", "sp2"] }]);
  });
  it("どちらも無いタスクはそのまま通す", () => {
    const out = migrateSprintIds([{ id: "t1" }]);
    expect(out).toEqual([{ id: "t1" }]);
  });
  it("未指定/空配列はそのまま空配列を返す", () => {
    expect(migrateSprintIds(undefined)).toEqual([]);
    expect(migrateSprintIds([])).toEqual([]);
  });
});
