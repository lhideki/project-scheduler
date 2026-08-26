import { formatDeps, parseDepString } from "./deps.js";

export const WBS_EDITABLE_COLUMNS = [
  "name", "startDate", "duration", "assignee", "sprint", "progress", "predecessors",
];

function validISODate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return date.toISOString().slice(0, 10) === value;
}

function emptyMark(value) {
  return value === "" || value === "—" || value === "-";
}

export function taskCellText(task, column, context) {
  const { resources = [], sprints = [], idToNo = {}, schedule } = context;
  switch (column) {
    case "name": return task.name || "";
    case "startDate": {
      if (!task.milestone) return task.startDate || "";
      if (task.milestoneMode === "fixed") return task.fixedDate || "";
      return schedule?.get(task.id)?.schedStart || task.startDate || "";
    }
    case "duration": return task.milestone ? "" : String(task.duration ?? "");
    case "assignee": {
      if (task.milestone) return task.milestoneMode === "fixed" ? "固定" : "柔軟";
      return resources.find(r => r.id === task.assigneeId)?.name || "";
    }
    case "sprint": return sprints.filter(sp => (task.sprintIds || []).includes(sp.id)).map(sp => sp.name).join(", ");
    case "progress": return String(task.progress || 0);
    case "predecessors": return formatDeps(task.predecessors, idToNo);
    default: return "";
  }
}

/** クリップボード上の1セルを、対象タスクに適用できるpatchへ変換する。 */
export function taskCellPatch(task, column, rawText, context) {
  const { resources = [], sprints = [], noToId = {}, hasChildren = false } = context;
  const text = String(rawText ?? "").trim();
  switch (column) {
    case "name":
      return { ok: true, patch: { name: text } };
    case "startDate":
      if (hasChildren || (!emptyMark(text) && !validISODate(text))) return { ok: false, patch: {} };
      return task.milestone
        ? { ok: true, patch: { fixedDate: emptyMark(text) ? "" : text, startDate: emptyMark(text) ? "" : text } }
        : { ok: true, patch: { startDate: emptyMark(text) ? "" : text } };
    case "duration": {
      if (hasChildren || task.milestone) return { ok: false, patch: {} };
      const value = Number(text);
      if (emptyMark(text) || !Number.isFinite(value) || value < 0) return { ok: false, patch: {} };
      return { ok: true, patch: { duration: Math.round(value * 100) / 100 } };
    }
    case "assignee": {
      if (hasChildren) return { ok: false, patch: {} };
      if (task.milestone) {
        const normalized = text.toLowerCase();
        if (["固定", "fixed"].includes(normalized)) return { ok: true, patch: { milestoneMode: "fixed" } };
        if (["柔軟", "flexible", ""].includes(normalized) || emptyMark(text)) return { ok: true, patch: { milestoneMode: "flexible" } };
        return { ok: false, patch: {} };
      }
      if (emptyMark(text)) return { ok: true, patch: { assigneeId: null } };
      const resource = resources.find(r => r.id === text || r.name === text);
      return resource ? { ok: true, patch: { assigneeId: resource.id } } : { ok: false, patch: {} };
    }
    case "sprint": {
      if (hasChildren) return { ok: false, patch: {} };
      if (emptyMark(text)) return { ok: true, patch: { sprintIds: [] } };
      const tokens = text.split(/\s*[,、;]\s*/).filter(Boolean);
      const resolved = tokens.map(token => sprints.find(sp => sp.id === token || sp.name === token)?.id);
      if (resolved.some(id => !id)) return { ok: false, patch: {} };
      return { ok: true, patch: { sprintIds: [...new Set(resolved)] } };
    }
    case "progress": {
      if (hasChildren) return { ok: false, patch: {} };
      const normalized = text.toLowerCase();
      if (task.milestone && ["完了", "済", "true", "yes"].includes(normalized)) return { ok: true, patch: { progress: 100 } };
      if (task.milestone && ["未完了", "false", "no", ""].includes(normalized)) return { ok: true, patch: { progress: 0 } };
      const value = Number(text.replace(/%$/, ""));
      if (!Number.isFinite(value) || value < 0 || value > 100) return { ok: false, patch: {} };
      return { ok: true, patch: { progress: Math.round(value) } };
    }
    case "predecessors": {
      if (emptyMark(text)) return { ok: true, patch: { predecessors: [] } };
      const predecessors = parseDepString(text, noToId).filter(dep => dep.id !== task.id);
      return predecessors.length ? { ok: true, patch: { predecessors } } : { ok: false, patch: {} };
    }
    default:
      return { ok: false, patch: {} };
  }
}

export function taskRowText(task, context) {
  return WBS_EDITABLE_COLUMNS.map(column => taskCellText(task, column, context)).join("\t");
}

/** TSVの1行を対象タスクへ貼り付ける。互換性のないセルがあればerrorsへ列名を返す。 */
export function taskRowPatch(task, text, context) {
  const values = String(text ?? "").replace(/\r/g, "").split("\n")[0].split("\t");
  const patch = {};
  const errors = [];
  WBS_EDITABLE_COLUMNS.forEach((column, index) => {
    if (index >= values.length) return;
    const parsed = taskCellPatch(task, column, values[index], context);
    if (parsed.ok) Object.assign(patch, parsed.patch);
    else errors.push(column);
  });
  return { patch, errors };
}

/** アプリ内の行コピーでは型を保ったまま貼り付け、ID・階層・行順などの構造情報は変更しない。 */
export function copiedTaskRowPatch(source, target, targetHasChildren, sourceHasChildren = false) {
  const patch = {
    name: source.name || "",
    predecessors: (source.predecessors || []).filter(dep => dep.id !== target.id).map(dep => ({ ...dep })),
  };
  if (targetHasChildren || sourceHasChildren) return patch;

  patch.sprintIds = [...(source.sprintIds || [])];
  patch.progress = source.progress || 0;
  const copiedStart = source.milestone && source.milestoneMode === "fixed" ? source.fixedDate : source.startDate;
  if (target.milestone) {
    patch.startDate = copiedStart || "";
    patch.fixedDate = copiedStart || "";
    if (source.milestone) patch.milestoneMode = source.milestoneMode || "flexible";
  } else {
    patch.startDate = copiedStart || "";
    if (!source.milestone) {
      patch.duration = source.duration;
      patch.assigneeId = source.assigneeId || null;
    }
  }
  return patch;
}
