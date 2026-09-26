import React, { useEffect } from "react";
import { X, Diamond } from "lucide-react";
import { formatDepLabel } from "../lib/deps.js";
import { IconBtn } from "./IconBtn.jsx";
import { useI18n } from "./I18nProvider.jsx";
import { DepInput } from "./DepInput.jsx";

/** タスク／マイルストーンの詳細パネル。テーブルの1行に収まらない情報（メモ、後続タスク、
 *  スケジュール計算結果など）をまとめて確認・編集できるモーダル。 */
export function TaskDetailModal({ task, schedule, tasks, resources, sprints, idToNo, noToId, onUpdate, onToggleMilestone, onClose, autoScheduleHighlightIds }) {
  const { t, fmtDate, fmtMonthDay } = useI18n();
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!task) return null;
  const isSummary = task.hasChildren;
  const sched = schedule.get(task.id);

  const successors = tasks
    .filter(x => (x.predecessors || []).some(d => d.id === task.id))
    .map(x => {
      const dep = (x.predecessors || []).find(d => d.id === task.id);
      return { id: x.id, name: x.name, wbsNo: idToNo[x.id] || "", label: formatDepLabel(dep) };
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-full overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-xl">
          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <span>WBS {task.wbsNo}</span>
            {task.milestone && <Diamond size={11} className="text-amber-500" fill="#F59E0B" />}
            {isSummary && <span className="text-slate-400">{t("taskDetail.groupBadge")}</span>}
          </div>
          <button onClick={onClose} aria-label={t("common.close")} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">{t("taskDetail.name")}</label>
            <input value={task.name} onChange={e => onUpdate({ name: e.target.value })}
              className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>

          {!isSummary && (
            <button onClick={onToggleMilestone}
              className="w-full flex items-center justify-between bg-slate-50 hover:bg-slate-100 rounded-md px-3 py-2 transition-colors">
              <span className="text-xs text-slate-500">{t("taskDetail.kind")}</span>
              <span className="flex items-center gap-1.5 text-xs font-medium text-indigo-600">
                {task.milestone ? <Diamond size={12} fill="#F59E0B" className="text-amber-500" /> : null}
                {task.milestone ? t("taskDetail.kindMilestone") : t("taskDetail.kindTask")}
              </span>
            </button>
          )}

          {!isSummary && task.milestone && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">{t("taskDetail.dueDate")}</label>
                <input type="date" value={task.milestoneMode === "fixed" ? (task.fixedDate || "") : (sched?.schedStart || "")}
                  onChange={e => onUpdate({ fixedDate: e.target.value, startDate: e.target.value })}
                  className={"w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm font-mono outline-none focus:border-indigo-400 " + (autoScheduleHighlightIds.has(task.id) ? "font-bold" : "")} />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">{t("taskDetail.mode")}</label>
                <select value={task.milestoneMode || "flexible"} onChange={e => onUpdate({ milestoneMode: e.target.value })}
                  className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
                  <option value="flexible">{t("taskDetail.modeFlexible")}</option>
                  <option value="fixed">{t("taskDetail.modeFixed")}</option>
                </select>
              </div>
            </div>
          )}

          {!isSummary && !task.milestone && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">{t("taskDetail.startDate")}</label>
                <input type="date" value={task.startDate || ""} onChange={e => onUpdate({ startDate: e.target.value })}
                  className={"w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm font-mono outline-none focus:border-indigo-400 " + (autoScheduleHighlightIds.has(task.id) ? "font-bold" : "")} />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">{t("taskDetail.duration")}</label>
                <input type="number" min={0} step={0.5} value={task.duration}
                  onChange={e => onUpdate({ duration: Math.max(0, Math.round(parseFloat(e.target.value || "0") * 100) / 100) })}
                  className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm font-mono outline-none focus:border-indigo-400" />
              </div>
            </div>
          )}

          {!isSummary && (
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">{t("taskDetail.assignee")}</label>
              <select value={task.assigneeId || ""} onChange={e => onUpdate({ assigneeId: e.target.value || null })}
                className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
                <option value="">{t("taskDetail.unassigned")}</option>
                {resources.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}

          {!isSummary && (
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">{t("taskDetail.sprints")}</label>
              {sprints.length === 0 ? (
                <div className="text-xs text-slate-400">{t("taskDetail.noSprints")}</div>
              ) : (
                <div className="border border-slate-200 rounded-md divide-y divide-slate-100 max-h-40 overflow-y-auto">
                  {sprints.map(sp => {
                    const checked = (task.sprintIds || []).includes(sp.id);
                    return (
                      <label key={sp.id} className="flex items-center gap-2 px-2.5 py-1.5 text-sm cursor-pointer hover:bg-slate-50">
                        <input type="checkbox" checked={checked} onChange={e => {
                          const cur = task.sprintIds || [];
                          const next = e.target.checked ? [...cur, sp.id] : cur.filter(id => id !== sp.id);
                          onUpdate({ sprintIds: next });
                        }} />
                        <span>
                          {sp.name}
                          {sp.startDate && sp.endDate && (
                            <span className="text-slate-400">{t("taskDetail.sprintRange", { start: fmtMonthDay(sp.startDate), end: fmtMonthDay(sp.endDate) })}</span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-[11px] text-slate-500 mb-1">
              {task.milestone ? t("common.done") : t("taskDetail.progress")}
              {isSummary && <span className="text-slate-400 font-normal">{t("taskDetail.progressSummaryNote")}</span>}
            </label>
            {isSummary ? (
              <div className="w-full border border-slate-100 bg-slate-50 rounded-md px-2.5 py-1.5 text-sm font-mono text-slate-500">{sched?.progress ?? 0}%</div>
            ) : task.milestone ? (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={(task.progress || 0) >= 100}
                  onChange={e => onUpdate({ progress: e.target.checked ? 100 : 0 })} />
                {t("taskDetail.completed")}
              </label>
            ) : (
              <div className="flex items-center gap-2">
                <input type="range" min={0} max={100} step={5} value={task.progress || 0}
                  onChange={e => onUpdate({ progress: Math.max(0, Math.min(100, parseInt(e.target.value, 10))) })}
                  className="flex-1" />
                <div className="flex items-center gap-0.5 w-16 flex-shrink-0">
                  <input type="number" min={0} max={100} step={5} value={task.progress || 0}
                    onChange={e => onUpdate({ progress: Math.max(0, Math.min(100, Math.round(parseFloat(e.target.value || "0")))) })}
                    className="w-full border border-slate-200 rounded-md px-1.5 py-1 text-sm font-mono outline-none focus:border-indigo-400" />
                  <span className="text-xs text-slate-400">%</span>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 mb-1">
              {t("taskDetail.predecessors")}
              {isSummary && <span className="text-slate-400 font-normal">{t("taskDetail.predecessorsSummaryNote")}</span>}
            </label>
            <div className="border border-slate-200 rounded-md px-2.5 py-1.5">
              <DepInput deps={task.predecessors} idToNo={idToNo} noToId={noToId} onChange={d => onUpdate({ predecessors: d })} />
            </div>
          </div>

          {successors.length > 0 && (
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">{t("taskDetail.successors")}</label>
              <div className="border border-slate-100 rounded-md divide-y divide-slate-100">
                {successors.map(s => (
                  <div key={s.id} className="flex items-center justify-between px-2.5 py-1.5 text-xs">
                    <span className="text-slate-600 truncate">{s.wbsNo} {s.name}</span>
                    <span className="font-mono text-slate-400">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-slate-50 rounded-md px-3 py-2.5 grid grid-cols-2 gap-y-1.5 gap-x-3 text-xs">
            <span className="text-slate-400">{t("taskDetail.schedStart")}</span><span className="font-mono text-slate-700">{fmtDate(sched?.schedStart)}</span>
            <span className="text-slate-400">{t("taskDetail.schedFinish")}</span><span className="font-mono text-slate-700">{fmtDate(sched?.schedFinish)}</span>
            {!isSummary && (
              <>
                <span className="text-slate-400">{t("taskDetail.float")}</span>
                <span className={"font-mono " + (sched?.critical ? "text-red-600 font-semibold" : "text-slate-700")}>
                  {t(sched?.critical ? "taskDetail.floatDaysCritical" : "taskDetail.floatDays", { days: String(sched?.float ?? "-") })}
                </span>
              </>
            )}
            {!isSummary && sched?.governed && (
              <>
                <span className="text-slate-400">{t("taskDetail.governed")}</span>
                <span className="text-slate-700">{t("taskDetail.governedDescription")}</span>
              </>
            )}
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 mb-1">{t("taskDetail.notes")}</label>
            <textarea value={task.notes || ""} onChange={e => onUpdate({ notes: e.target.value })} rows={3}
              placeholder={t("taskDetail.notesPlaceholder")}
              className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 resize-none" />
          </div>
        </div>

        <div className="flex justify-end px-4 py-3 border-t border-slate-100">
          <IconBtn label={t("common.close")} onClick={onClose} small />
        </div>
      </div>
    </div>
  );
}
