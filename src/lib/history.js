export const TASK_HISTORY_LIMIT = 100;

export function createTaskHistory(tasks) {
  return { past: [], present: tasks, future: [] };
}

function sameTaskList(a, b) {
  return a === b || (
    Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((task, index) => task === b[index])
  );
}

/**
 * React の setState と同じく、配列または関数形式の更新を受け取るタスク履歴 reducer。
 * 直近 TASK_HISTORY_LIMIT 回までを保持し、新規編集後は Redo 履歴を破棄する。
 */
export function taskHistoryReducer(state, action) {
  switch (action.type) {
    case "set": {
      const next = typeof action.value === "function" ? action.value(state.present) : action.value;
      if (!Array.isArray(next) || sameTaskList(state.present, next)) return state;
      return {
        past: [...state.past, state.present].slice(-TASK_HISTORY_LIMIT),
        present: next,
        future: [],
      };
    }
    case "reset":
      return createTaskHistory(Array.isArray(action.value) ? action.value : []);
    case "undo": {
      if (!state.past.length) return state;
      const previous = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    }
    case "redo": {
      if (!state.future.length) return state;
      const next = state.future[0];
      return {
        past: [...state.past, state.present].slice(-TASK_HISTORY_LIMIT),
        present: next,
        future: state.future.slice(1),
      };
    }
    default:
      return state;
  }
}
