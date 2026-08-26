import { describe, it, expect } from "vitest";
import {
  taskCellText, taskCellPatch, taskRowText, taskRowPatch, copiedTaskRowPatch,
} from "./wbsEditing.js";

const resources = [{ id: "r1", name: "佐藤" }, { id: "r2", name: "鈴木" }];
const sprints = [{ id: "s1", name: "Sprint 1" }, { id: "s2", name: "Sprint 2" }];
const idToNo = { p1: "1", p2: "2" };
const noToId = { "1": "p1", "2": "p2" };
const context = { resources, sprints, idToNo, noToId, hasChildren: false };

function task(overrides = {}) {
  return {
    id: "t1", name: "実装", startDate: "2026-08-26", duration: 2.5,
    assigneeId: "r1", sprintIds: ["s1", "s2"], progress: 25,
    predecessors: [{ id: "p1", type: "FS", lag: 1 }],
    ...overrides,
  };
}

describe("WBSクリップボード変換", () => {
  it("セル値を表示用テキストへ変換する", () => {
    const t = task();
    expect(taskCellText(t, "assignee", context)).toBe("佐藤");
    expect(taskCellText(t, "sprint", context)).toBe("Sprint 1, Sprint 2");
    expect(taskCellText(t, "predecessors", context)).toBe("1FS+1");
  });

  it("日付・数値・担当者・スプリント・進捗・依存関係を検証してpatch化する", () => {
    const t = task();
    expect(taskCellPatch(t, "startDate", "2026-09-01", context)).toEqual({ ok: true, patch: { startDate: "2026-09-01" } });
    expect(taskCellPatch(t, "duration", "3.75", context)).toEqual({ ok: true, patch: { duration: 3.75 } });
    expect(taskCellPatch(t, "assignee", "鈴木", context)).toEqual({ ok: true, patch: { assigneeId: "r2" } });
    expect(taskCellPatch(t, "sprint", "Sprint 2", context)).toEqual({ ok: true, patch: { sprintIds: ["s2"] } });
    expect(taskCellPatch(t, "progress", "80%", context)).toEqual({ ok: true, patch: { progress: 80 } });
    expect(taskCellPatch(t, "predecessors", "2SS-1", context)).toEqual({ ok: true, patch: { predecessors: [{ id: "p2", type: "SS", lag: -1 }] } });
  });

  it("不正な値とグループの編集不可セルを拒否する", () => {
    const t = task();
    expect(taskCellPatch(t, "startDate", "2026-02-30", context).ok).toBe(false);
    expect(taskCellPatch(t, "duration", "-1", context).ok).toBe(false);
    expect(taskCellPatch(t, "assignee", "不明", context).ok).toBe(false);
    expect(taskCellPatch(t, "progress", "101", context).ok).toBe(false);
    expect(taskCellPatch(t, "duration", "2", { ...context, hasChildren: true }).ok).toBe(false);
  });

  it("マイルストーン固有の値を扱う", () => {
    const milestone = task({ milestone: true, milestoneMode: "fixed", fixedDate: "2026-10-01", duration: 0 });
    expect(taskCellText(milestone, "startDate", context)).toBe("2026-10-01");
    expect(taskCellText(milestone, "assignee", context)).toBe("固定");
    expect(taskCellPatch(milestone, "startDate", "2026-10-02", context).patch).toEqual({ fixedDate: "2026-10-02", startDate: "2026-10-02" });
    expect(taskCellPatch(milestone, "assignee", "柔軟", context).patch).toEqual({ milestoneMode: "flexible" });
    expect(taskCellPatch(milestone, "progress", "完了", context).patch).toEqual({ progress: 100 });

    const flexible = task({ milestone: true, milestoneMode: "flexible", startDate: "2026-08-01", duration: 0 });
    const schedule = new Map([[flexible.id, { schedStart: "2026-09-15" }]]);
    expect(taskCellText(flexible, "startDate", { ...context, schedule })).toBe("2026-09-15");
  });

  it("行をTSVで往復変換する", () => {
    const source = task();
    const text = taskRowText(source, context);
    expect(text.split("\t")).toHaveLength(7);
    const result = taskRowPatch(task({ name: "old" }), text, context);
    expect(result.errors).toEqual([]);
    expect(result.patch).toMatchObject({ name: "実装", startDate: "2026-08-26", duration: 2.5, assigneeId: "r1", sprintIds: ["s1", "s2"], progress: 25 });
  });

  it("アプリ内の行貼り付けで構造を変えず、対象種別と互換性のある値だけを返す", () => {
    const source = task({ id: "source", parentId: "g1", order: 4 });
    const target = task({ id: "target", parentId: "g2", order: 1, name: "target" });
    const patch = copiedTaskRowPatch(source, target, false);
    expect(patch).not.toHaveProperty("id");
    expect(patch).not.toHaveProperty("parentId");
    expect(patch).not.toHaveProperty("order");
    expect(patch).toMatchObject({ name: "実装", duration: 2.5, assigneeId: "r1" });
  });

  it("グループ行からリーフへの貼り付けではリーフ固有の値を変更しない", () => {
    const sourceGroup = { id: "g1", name: "グループ", predecessors: [{ id: "p1", type: "FS", lag: 0 }] };
    const target = task({ id: "target", duration: 8, assigneeId: "r2" });
    expect(copiedTaskRowPatch(sourceGroup, target, false, true)).toEqual({
      name: "グループ",
      predecessors: [{ id: "p1", type: "FS", lag: 0 }],
    });
  });
});
