import { describe, it, expect } from "vitest";
import { createTaskHistory, taskHistoryReducer, TASK_HISTORY_LIMIT, canUndoTasks, canRedoTasks } from "./history.js";

describe("taskHistoryReducer", () => {
  it("配列形式と関数形式の更新をUndo/Redoできる", () => {
    const initial = [{ id: "t1", name: "A" }];
    let state = createTaskHistory(initial);
    state = taskHistoryReducer(state, { type: "set", value: [{ id: "t1", name: "B" }] });
    state = taskHistoryReducer(state, { type: "set", value: prev => [...prev, { id: "t2", name: "C" }] });

    expect(state.present.map(t => t.name)).toEqual(["B", "C"]);
    state = taskHistoryReducer(state, { type: "undo" });
    expect(state.present.map(t => t.name)).toEqual(["B"]);
    state = taskHistoryReducer(state, { type: "undo" });
    expect(state.present).toBe(initial);
    state = taskHistoryReducer(state, { type: "redo" });
    expect(state.present.map(t => t.name)).toEqual(["B"]);
  });

  it("Undo後の新規編集でRedo履歴を破棄する", () => {
    let state = createTaskHistory([{ id: "t1", name: "A" }]);
    state = taskHistoryReducer(state, { type: "set", value: [{ id: "t1", name: "B" }] });
    state = taskHistoryReducer(state, { type: "undo" });
    state = taskHistoryReducer(state, { type: "set", value: [{ id: "t1", name: "C" }] });
    expect(state.future).toEqual([]);
    expect(taskHistoryReducer(state, { type: "redo" })).toBe(state);
  });

  it("同じ参照だけで構成される実質的なno-op更新は履歴に積まない", () => {
    const tasks = [{ id: "t1", name: "A" }];
    const state = createTaskHistory(tasks);
    const next = taskHistoryReducer(state, { type: "set", value: prev => prev.map(t => t) });
    expect(next).toBe(state);
  });

  it("resetで履歴を消去し、保持件数を上限内に収める", () => {
    let state = createTaskHistory([{ id: "t", name: "0" }]);
    for (let i = 1; i <= TASK_HISTORY_LIMIT + 5; i++) {
      state = taskHistoryReducer(state, { type: "set", value: [{ id: "t", name: String(i) }] });
    }
    expect(state.past).toHaveLength(TASK_HISTORY_LIMIT);
    state = taskHistoryReducer(state, { type: "reset", value: [{ id: "new", name: "N" }] });
    expect(state).toEqual({ past: [], present: [{ id: "new", name: "N" }], future: [] });
  });
});

const rename = name => tasks => tasks.map(task => task.id === "t1" ? { ...task, name } : task);
const edit = (state, name, key = "t1:name") => taskHistoryReducer(state, { type: "edit", key, value: rename(name) });
const commit = state => taskHistoryReducer(state, { type: "commit" });

describe("cell edit transactions", () => {
  it("入力は即時反映し、連続入力は確定後に一度でUndo/Redoする", () => {
    const original = [{ id: "t1", name: "A" }];
    let state = createTaskHistory(original);
    for (const name of ["B", "Bu", "Build"]) state = edit(state, name);
    expect(state.present[0].name).toBe("Build");
    expect(state.past).toEqual([]);
    state = commit(state);
    expect(state.past).toEqual([original]);
    state = taskHistoryReducer(state, { type: "undo" });
    expect(state.present).toBe(original);
    state = taskHistoryReducer(state, { type: "redo" });
    expect(state.present[0].name).toBe("Build");
  });

  it("確定した同じセルの再編集と別セルへの移動を別履歴にする", () => {
    let state = createTaskHistory([{ id: "t1", name: "A", duration: 1 }]);
    state = commit(edit(state, "B"));
    state = edit(state, "C");
    state = taskHistoryReducer(state, { type: "edit", key: "t1:duration", value: tasks => tasks.map(task => ({ ...task, duration: 12 })) });
    state = commit(state);
    state = taskHistoryReducer(state, { type: "undo" });
    expect(state.present[0]).toMatchObject({ name: "C", duration: 1 });
    state = taskHistoryReducer(state, { type: "undo" });
    expect(state.present[0].name).toBe("B");
    state = taskHistoryReducer(state, { type: "undo" });
    expect(state.present[0].name).toBe("A");
  });

  it("確定なしで押したUndoも編集中の全変更を一度で戻す", () => {
    let state = edit(edit(createTaskHistory([{ id: "t1", name: "A" }]), "B"), "C");
    state = taskHistoryReducer(state, { type: "undo" });
    expect(state.present[0].name).toBe("A");
    expect(state.edit).toBeUndefined();
    expect(state.future[0][0].name).toBe("C");
  });

  it("変更なしの確定や元の値まで戻した編集は履歴を増やさずRedoを保つ", () => {
    let state = createTaskHistory([{ id: "t1", name: "A", predecessors: [] }]);
    expect(commit(state)).toBe(state);
    state = commit(edit(state, "B"));
    state = taskHistoryReducer(state, { type: "undo" });
    const original = state;
    state = commit(edit(edit(state, "C"), "A"));
    expect(state).toEqual(original);
    const parsed = taskHistoryReducer(state, { type: "set", value: tasks => tasks.map(task => ({ ...task, predecessors: [] })) });
    expect(parsed).toBe(state);
  });

  it("新規編集を確定するとRedoを破棄する", () => {
    let state = commit(edit(createTaskHistory([{ id: "t1", name: "A" }]), "B"));
    state = taskHistoryReducer(state, { type: "undo" });
    state = commit(edit(state, "C"));
    expect(state.future).toEqual([]);
    expect(taskHistoryReducer(state, { type: "redo" })).toBe(state);
  });

  it.each([
    ["paste", { name: "Pasted" }],
    ["row-move", { order: 2 }],
    ["indent", { parentId: "group" }],
    ["reschedule", { startDate: "2026-10-05" }],
  ])("%s の原子的更新は直前の入力と別々に戻せる", (operation, patch) => {
    let state = edit(createTaskHistory([{ id: "t1", name: "A", order: 0, startDate: "2026-10-01" }]), "B");
    const edited = state.present;
    state = taskHistoryReducer(state, { type: "set", value: tasks => tasks.map(task => ({ ...task, ...patch })) });
    state = taskHistoryReducer(state, { type: "undo" });
    expect(state.present).toBe(edited);
    state = taskHistoryReducer(state, { type: "undo" });
    expect(state.present[0].name).toBe("A");
  });

  it("上限はキー入力数ではなく確定した編集数で数える", () => {
    let state = createTaskHistory([{ id: "t1", name: "A" }]);
    for (let i = 0; i < TASK_HISTORY_LIMIT + 5; i++) {
      state = edit(edit(state, `${i}x`), `${i}`);
      state = commit(state);
    }
    expect(state.past).toHaveLength(TASK_HISTORY_LIMIT);
    expect(state.past[0][0].name).toBe("4");
  });

  it("resetは未確定編集も消去し、前の計画のUndo/Redoを残さない", () => {
    let state = edit(commit(edit(createTaskHistory([{ id: "t1", name: "A" }]), "B")), "C");
    state = taskHistoryReducer(state, { type: "reset", value: [{ id: "restored", name: "Saved" }] });
    expect(state).toEqual(createTaskHistory([{ id: "restored", name: "Saved" }]));
    expect(taskHistoryReducer(state, { type: "undo" })).toBe(state);
    expect(taskHistoryReducer(state, { type: "redo" })).toBe(state);
  });
});

describe("history availability", () => {
  it("未確定の変更をUndoでき、Redoは元の値に戻るまで無効になる", () => {
    let state = createTaskHistory([{ id: "t1", name: "A" }]);
    expect(canUndoTasks(state)).toBe(false);
    state = edit(state, "B");
    expect(canUndoTasks(state)).toBe(true);
    state = taskHistoryReducer(state, { type: "undo" });
    expect(canRedoTasks(state)).toBe(true);
    state = edit(state, "C");
    expect(canRedoTasks(state)).toBe(false);
    state = edit(state, "A");
    expect(canRedoTasks(state)).toBe(true);
    expect(canUndoTasks(state)).toBe(false);
  });
});
