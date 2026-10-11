import React, { useEffect, useRef, useState } from "react";
import { buildOccurrenceOverridePatch, buildOccurrenceScheduleResetPatch } from "../lib/recurrenceEditing.js";
import { formatDeps, parseDepInput } from "../lib/deps.js";
import { isISODate, MAX_RECURRENCE_SPAN_DAYS, MAX_RECURRENCE_MOVE_DAYS } from "../lib/recurrence.js";
import { useI18n } from "./I18nProvider.jsx";

/** Local draft only: blur, Escape, cancellation and reopening cannot write an override. */
export function OccurrenceEditor({ task, occurrence, idToNo, noToId, onUpdate, onClose, autoScroll = true }) {
  const { t } = useI18n();
  const editorRef = useRef(null);
  // Until the user edits a date, follow regenerated props (for example when
  // series effort changes elsewhere in the same detail dialog). A date edit
  // captures the complete visible range, so saving cannot silently shorten it.
  const [dateDraft, setDateDraft] = useState(null);
  const startDate = dateDraft ? dateDraft.startDate : occurrence.startDate;
  const endDate = dateDraft ? dateDraft.endDate : occurrence.endDate;
  function editDate(field, value) {
    setDateDraft(previous => ({ ...(previous || { startDate: occurrence.startDate, endDate: occurrence.endDate }), [field]: value }));
    setError(null);
  }
  const [deps, setDeps] = useState(formatDeps(occurrence.predecessors || task.predecessors, idToNo));
  const [error, setError] = useState(null);
  const originalOverride = task.occurrenceOverrides?.[occurrence.occurrenceDate] || {};
  const [dependenciesDirty, setDependenciesDirty] = useState(false);
  const [inheritDeps, setInheritDeps] = useState(!Object.hasOwn(originalOverride, "predecessors"));
  const originalDate = occurrence.occurrenceDate;
  useEffect(() => { if (autoScroll) editorRef.current?.scrollIntoView?.({ block: "nearest" }); }, [autoScroll]);
  const inputClass = "w-full min-w-0 border border-slate-200 rounded-md px-2 py-1.5 text-xs outline-hidden focus:border-indigo-400";
  function save() {
    if (!isISODate(startDate) || !isISODate(endDate) || endDate < startDate) { setError("occurrenceDatesInvalid"); return; }
    if (Math.abs(Date.parse(startDate) - Date.parse(originalDate)) / 86400000 > MAX_RECURRENCE_MOVE_DAYS) { setError("moveTooFar"); return; }
    if ((Date.parse(endDate) - Date.parse(startDate)) / 86400000 + 1 > MAX_RECURRENCE_SPAN_DAYS) { setError("spanInvalid"); return; }
    const edits = dateDraft ? { startDate, endDate } : {};
    // Leave untouched dependency arrays out of the edit, including unresolved
    // references that cannot be represented by the current WBS text formatter.
    if (dependenciesDirty && inheritDeps) edits.predecessors = undefined;
    else if (dependenciesDirty) {
      const parsed = parseDepInput(deps, noToId);
      if (parsed.errors.length) { setError("dependenciesInvalid"); return; }
      const inheritedUnchanged = !Object.hasOwn(originalOverride, "predecessors") && formatDeps(parsed.deps, idToNo) === formatDeps(task.predecessors, idToNo);
      if (!inheritedUnchanged) edits.predecessors = parsed.deps;
    }
    const patch = buildOccurrenceOverridePatch(task, occurrence, edits);
    if (patch) onUpdate(patch);
    onClose();
  }
  function reset() {
    const patch = buildOccurrenceScheduleResetPatch(task, originalDate);
    if (patch) onUpdate(patch);
    onClose();
  }
  return <section ref={editorRef} className="bg-slate-50 rounded-lg border border-slate-200 p-3 space-y-3" aria-label={t("recurrence.editOccurrence")} data-recurrence-editor="occurrence">
    <h4 className="font-semibold text-xs text-slate-700">{t("recurrence.occurrenceIdentity", { date: originalDate })}</h4>
    <p className="text-[11px] text-slate-500">{t("recurrence.occurrenceNote")}</p>
    <div className="grid grid-cols-2 gap-2">
      <label className="text-xs text-slate-600">{t("recurrence.occurrenceStart")}<input type="date" className={inputClass} aria-label={t("recurrence.occurrenceStart")} value={startDate} onChange={e => editDate("startDate", e.target.value)} /></label>
      <label className="text-xs text-slate-600">{t("recurrence.occurrenceEnd")}<input type="date" className={inputClass} aria-label={t("recurrence.occurrenceEnd")} value={endDate} onChange={e => editDate("endDate", e.target.value)} /></label>
    </div>
    <label className="block text-xs text-slate-600">{t("taskDetail.predecessors")}<input className={inputClass} aria-label={t("recurrence.occurrenceDeps")} value={deps} onChange={e => { setDeps(e.target.value); setDependenciesDirty(true); setInheritDeps(false); setError(null); }} /></label>
    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500"><span>{t(inheritDeps ? "recurrence.inheritedDeps" : "recurrence.customDeps")}</span>{!inheritDeps && <button type="button" className="text-indigo-600 hover:underline" onClick={() => { setDeps(formatDeps(task.predecessors, idToNo)); setDependenciesDirty(true); setInheritDeps(true); }}>{t("recurrence.useSeriesDeps")}</button>}</div>
    <p className="text-[11px] text-slate-500">{t("recurrence.dependencyHelp")}</p>
    {error && <p role="alert" className="text-xs text-red-700">{t(`recurrence.errors.${error}`)}</p>}
    <div className="flex flex-wrap justify-end gap-2">
      {["startDate", "endDate", "predecessors"].some(field => Object.hasOwn(originalOverride, field)) && <button type="button" className="mr-auto text-xs text-red-600 hover:underline" onClick={reset}>{t("recurrence.resetOccurrence")}</button>}
      <button type="button" className="border border-slate-200 rounded-md px-3 py-1.5 text-xs hover:bg-white" onClick={onClose}>{t("common.cancel")}</button>
      <button type="button" className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-md px-3 py-1.5 text-xs" onClick={save}>{t("recurrence.saveOccurrence")}</button>
    </div>
  </section>;
}
