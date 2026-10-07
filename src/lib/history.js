export const TASK_HISTORY_LIMIT = 100;

export function createTaskHistory(tasks) {
  return { past: [], present: tasks, future: [] };
}

// Task data is JSON-shaped. Compare changed records by value, including dependencies and
// sprint arrays, so typing back the original value or re-parsing a cell is a genuine no-op.
function sameValue(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameValue(a[key], b[key]));
}

function commitEdit(state) {
  if (!state.edit) return state;
  const { edit, ...committed } = state;
  if (sameValue(edit.before, state.present)) return { ...committed, present: edit.before };
  return {
    past: [...state.past, edit.before].slice(-TASK_HISTORY_LIMIT),
    present: state.present,
    future: [],
  };
}

export function canUndoTasks(state) {
  return state.past.length > 0 || !!(state.edit && !sameValue(state.edit.before, state.present));
}

export function canRedoTasks(state) {
  return state.future.length > 0 && !(state.edit && !sameValue(state.edit.before, state.present));
}

/**
 * set is one complete operation (paste, tree edit, scheduling). edit keeps live values
 * for display/autosave but groups changes until commit, another cell, or a complete operation.
 * A committed edit, not a keystroke, consumes one of the latest TASK_HISTORY_LIMIT entries.
 */
export function taskHistoryReducer(state, action) {
  switch (action.type) {
    case "edit": {
      const current = state.edit?.key === action.key ? state : commitEdit(state);
      const next = typeof action.value === "function" ? action.value(current.present) : action.value;
      if (!Array.isArray(next) || sameValue(current.present, next)) return current;
      return {
        ...current,
        present: next,
        edit: current.edit || { key: action.key, before: current.present },
      };
    }
    case "commit":
      return commitEdit(state);
    case "set": {
      const current = commitEdit(state);
      const next = typeof action.value === "function" ? action.value(current.present) : action.value;
      if (!Array.isArray(next) || sameValue(current.present, next)) return current;
      return {
        past: [...current.past, current.present].slice(-TASK_HISTORY_LIMIT),
        present: next,
        future: [],
      };
    }
    case "reset":
      return createTaskHistory(Array.isArray(action.value) ? action.value : []);
    case "undo": {
      const current = commitEdit(state);
      if (!current.past.length) return current;
      const previous = current.past[current.past.length - 1];
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future],
      };
    }
    case "redo": {
      const current = commitEdit(state);
      if (!current.future.length) return current;
      const next = current.future[0];
      return {
        past: [...current.past, current.present].slice(-TASK_HISTORY_LIMIT),
        present: next,
        future: current.future.slice(1),
      };
    }
    default:
      return state;
  }
}
