import React from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { useI18n } from "./I18nProvider.jsx";
import { schedulingFeedbackStatus } from "../lib/schedulingFeedback.js";
import { dependencyIssueLabel, formatDependencyIssueMessage, formatSprintConflictReason, formatLevelWarning } from "../lib/i18n.js";

/** Persistent result of the last run, using the same post-writeback detectors as the WBS/Gantt. */
export function SchedulingResult({ result, dependencyIssues, sprintConflicts, levelWarnings, tasks, wbsNoById, onRevealTask, onDismiss }) {
  const { t } = useI18n();
  const { status, issueCount } = schedulingFeedbackStatus(result.converged, dependencyIssues, sprintConflicts, levelWarnings);
  const warning = result.error || status !== "completed";
  const taskLabel = id => `${wbsNoById.get(id) || ""} ${tasks.find(task => task.id === id)?.name || id}`.trim();
  const entries = [
    ...dependencyIssues.map(issue => ({
      taskId: issue.ids[0],
      label: `${dependencyIssueLabel(t, issue.code)}: ${issue.ids.map(taskLabel).join(t("common.listSeparator"))}`,
      reason: formatDependencyIssueMessage(t, issue),
    })),
    ...sprintConflicts.map(conflict => ({
      taskId: conflict.taskId, label: taskLabel(conflict.taskId),
      reason: conflict.reasons.map(reason => formatSprintConflictReason(t, reason)).join(t("common.listSeparator")),
    })),
    ...levelWarnings.map(issue => ({ taskId: issue.taskId, label: taskLabel(issue.taskId), reason: formatLevelWarning(t, issue) })),
  ];
  return (
    <section aria-label={t("schedulingResult.title")} className={"border-b px-4 py-2 text-xs " + (warning ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900")}>
      <div className="flex items-start gap-2">
        {warning ? <AlertTriangle size={15} className="shrink-0 mt-0.5" /> : <Check size={15} className="shrink-0 mt-0.5" />}
        <div className="flex-1" role={result.error ? "alert" : "status"}>
          <div className="font-semibold">{t(`schedulingResult.${result.error ? "error" : status}`)}</div>
          {!result.error && <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1">
            <span>{t("schedulingResult.changed", { count: result.changedCount })}</span>
            <span>{t("schedulingResult.remaining", { count: issueCount })}</span>
            <span>{t(result.levelingOn ? "schedulingResult.levelingOn" : "schedulingResult.levelingOff")}</span>
          </div>}
          {!result.error && !result.converged && <p className="mt-1">{t("toast.scheduleNotConverged")}</p>}
        </div>
        <button type="button" onClick={onDismiss} aria-label={t("schedulingResult.dismiss")} className="p-1 rounded-sm hover:bg-white/60"><X size={15} /></button>
      </div>
      {!result.error && entries.length > 0 && <details className="mt-2 ml-6">
        <summary className="cursor-pointer font-medium underline underline-offset-2">{t("schedulingResult.details")}</summary>
        <ul className="mt-2 max-h-48 overflow-y-auto space-y-2">
          {entries.map((entry, index) => <li key={index}>
            <button type="button" onClick={() => onRevealTask(entry.taskId)} className="w-full text-left rounded-sm border border-amber-200 bg-white/70 px-3 py-2 hover:bg-white">
              <span className="block font-medium">{entry.label}</span>
              <span className="block mt-1">{entry.reason}</span>
            </button>
          </li>)}
        </ul>
      </details>}
    </section>
  );
}
