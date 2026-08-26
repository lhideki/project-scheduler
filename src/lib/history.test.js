import { describe, it, expect } from "vitest";
import { createTaskHistory, taskHistoryReducer, TASK_HISTORY_LIMIT } from "./history.js";

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
