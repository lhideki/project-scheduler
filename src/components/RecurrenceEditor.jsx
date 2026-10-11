import React, { useState } from "react";
import { defaultCalculationEndDate, generateOccurrences, isRecurringTask, isISODate, MAX_RECURRENCE_SPAN_DAYS } from "../lib/recurrence.js";
import { useI18n } from "./I18nProvider.jsx";
import { OccurrenceEditor } from "./OccurrenceEditor.jsx";

const inputClass = "w-full min-w-0 border border-slate-200 rounded-md px-2.5 py-1.5 text-xs outline-hidden focus:border-indigo-400";
const buttonClass = "border border-slate-200 rounded-md px-3 py-1.5 text-xs hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-400";

/** A recurrence is a single transaction. Incomplete date input never updates raw tasks. */
export function RecurrenceEditor({ task, schedule, idToNo, noToId, onUpdate, initialOccurrenceDate }) {
  const { t, fmtDate, fmtWeekday } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(initialOccurrenceDate || null);
  const recurring = isRecurringTask(task);
  const generated = recurring ? generateOccurrences(task) : null;
  const occurrences = generated?.occurrences || [];
  const activeDates = new Set(occurrences.map(o => o.occurrenceDate));
  const dormantCount = Object.keys(task.occurrenceOverrides || {}).filter(date => !activeDates.has(date)).length;
  const selectedOccurrence = occurrences.find(o => o.occurrenceDate === selectedDate);
  function begin() {
    const rule = task.recurrence || {};
    setDraft({ enabled: true, startDate: task.startDate || "", frequency: rule.frequency || "weekly", interval: String(rule.interval || 1), weekdays: rule.weekdays?.length ? [...rule.weekdays] : [isISODate(task.startDate) ? new Date(task.startDate).getUTCDay() : 1], monthDay: rule.monthDay || "day", horizonIsCustom: !!rule.calculationEndDate, endDate: rule.endDate || "", calculationEndDate: rule.calculationEndDate || (isISODate(task.startDate) ? defaultCalculationEndDate(task.startDate) : "") });
    setError(null);
    setEditing(true);
  }
  function change(patch) { setDraft(current => ({ ...current, ...patch })); setError(null); }
  function save() {
    if (!draft.enabled) {
      onUpdate({ recurrence: undefined });
      setEditing(false);
      setSelectedDate(null);
      return;
    }
    if (!isISODate(draft.startDate)) { setError("startRequired"); return; }
    if (!Number.isSafeInteger(Number(draft.interval)) || Number(draft.interval) < 1 || Number(draft.interval) > 365) { setError("intervalInvalid"); return; }
    if (task.duration > MAX_RECURRENCE_SPAN_DAYS) { setError("spanInvalid"); return; }
    if (draft.frequency === "weekly" && !draft.weekdays.length) { setError("weekdaysRequired"); return; }
    if (draft.endDate && (!isISODate(draft.endDate) || draft.endDate < draft.startDate)) { setError("endInvalid"); return; }
    if (!draft.endDate && (!isISODate(draft.calculationEndDate) || draft.calculationEndDate < draft.startDate)) { setError("horizonInvalid"); return; }
    const recurrence = { frequency: draft.frequency, interval: Number(draft.interval) };
    if (draft.frequency === "weekly") recurrence.weekdays = [...draft.weekdays].sort((a, b) => a - b);
    if (draft.frequency === "monthly") recurrence.monthDay = draft.monthDay;
    if (draft.endDate) recurrence.endDate = draft.endDate;
    else recurrence.calculationEndDate = draft.calculationEndDate;
    // Keep original-date overrides, including dormant ones. Never retarget an exception by index.
    onUpdate({ startDate: draft.startDate, recurrence });
    setEditing(false);
    setSelectedDate(null);
  }
  return (
    <section className="border border-indigo-100 rounded-lg p-3 space-y-3" aria-label={t("recurrence.title")}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-indigo-700">{t("recurrence.title")}</h3>
        {!editing && <button type="button" className={buttonClass} onClick={begin}>{t(recurring ? "recurrence.editRule" : "recurrence.addRule")}</button>}
      </div>
      {!editing && !recurring && <p className="text-xs text-slate-500">{t("recurrence.notRepeating")}</p>}
      {editing && draft && (
        <div className="space-y-3" data-recurrence-editor="rule">
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.enabled} onChange={e => change({ enabled: e.target.checked })} />{t("recurrence.enabled")}</label>
          {draft.enabled && <>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-slate-600">{t("recurrence.origin")}<input type="date" aria-label={t("recurrence.origin")} className={inputClass} value={draft.startDate} onChange={e => { const startDate = e.target.value; change({ startDate, ...(!draft.horizonIsCustom && isISODate(startDate) ? { calculationEndDate: defaultCalculationEndDate(startDate) } : {}) }); }} /></label>
              <label className="text-xs text-slate-600">{t("recurrence.frequency")}<select className={inputClass} aria-label={t("recurrence.frequency")} value={draft.frequency} onChange={e => change({ frequency: e.target.value })}>{["daily", "weekly", "monthly"].map(f => <option key={f} value={f}>{t(`recurrence.${f}`)}</option>)}</select></label>
              <label className="text-xs text-slate-600">{t("recurrence.interval")}<input type="number" min={1} max={365} step={1} aria-label={t("recurrence.interval")} className={inputClass} value={draft.interval} onChange={e => change({ interval: e.target.value })} /></label>
              <label className="text-xs text-slate-600">{t("recurrence.end")}<input type="date" aria-label={t("recurrence.end")} min={draft.startDate || undefined} className={inputClass} value={draft.endDate} onChange={e => change({ endDate: e.target.value })} /></label>
            </div>
            {draft.frequency === "weekly" && <fieldset><legend className="text-xs text-slate-600 mb-1">{t("recurrence.weekdays")}</legend><div className="flex flex-wrap gap-2">{[1, 2, 3, 4, 5, 6, 0].map(day => <label key={day} className="flex items-center gap-1 text-xs border border-slate-200 rounded-md p-1.5"><input type="checkbox" checked={draft.weekdays.includes(day)} onChange={e => change({ weekdays: e.target.checked ? [...draft.weekdays, day] : draft.weekdays.filter(d => d !== day) })} />{fmtWeekday(`2026-06-${String(7 + day).padStart(2, "0")}`)}</label>)}</div><p className="text-[11px] text-slate-500 mt-1">{t("recurrence.weekAnchor")}</p></fieldset>}
            {draft.frequency === "monthly" && <label className="block text-xs text-slate-600">{t("recurrence.monthMode")}<select className={inputClass} aria-label={t("recurrence.monthMode")} value={draft.monthDay} onChange={e => change({ monthDay: e.target.value })}>{["day", "start", "end"].map(mode => <option key={mode} value={mode}>{t(`recurrence.month${mode[0].toUpperCase() + mode.slice(1)}`)}</option>)}</select></label>}
            {!draft.endDate && <label className="block text-xs text-slate-600">{t("recurrence.horizon")}<input type="date" aria-label={t("recurrence.horizon")} min={draft.startDate || undefined} className={inputClass} value={draft.calculationEndDate} onChange={e => change({ calculationEndDate: e.target.value, horizonIsCustom: true })} /><span className="block mt-1 text-[11px] text-slate-500">{t("recurrence.horizonNote")}</span></label>}
            <p className="text-[11px] text-slate-500">{t("recurrence.boundsNote")}</p>
            <p className="text-[11px] text-slate-500">{t("recurrence.safetyBounds")}</p>
          </>}
          <p className="text-[11px] text-amber-700">{t("recurrence.preserveOverrides")}</p>
          {error && <p role="alert" className="text-xs text-red-700">{t(`recurrence.errors.${error}`)}</p>}
          <div className="flex justify-end gap-2"><button type="button" className={buttonClass} onClick={() => { setEditing(false); setError(null); }}>{t("common.cancel")}</button><button type="button" className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-md px-3 py-1.5 text-xs" onClick={save}>{t("recurrence.saveRule")}</button></div>
        </div>
      )}
      {recurring && !editing && <>
        <p className="text-xs text-slate-700">{t("recurrence.summary", { frequency: t(`recurrence.${task.recurrence.frequency}`), interval: task.recurrence.interval, count: occurrences.length })}</p>
        <p className="text-[11px] text-slate-500">{t("recurrence.calculatedThrough", { date: fmtDate(generated.calculationEndDate) })}</p>
        <p className="text-[11px] text-amber-700">{t("recurrence.fixedDatesNote")}</p>
        {generated.truncated && <p role="alert" className="text-xs text-red-700">{t("recurrence.truncated")}</p>}
        {dormantCount > 0 && <p className="text-[11px] text-amber-700">{t("recurrence.dormantOverrides", { count: dormantCount })}</p>}
        <div className="max-h-44 overflow-auto border border-slate-200 rounded-md divide-y divide-slate-100" aria-label={t("recurrence.occurrences")}>
          {occurrences.map(o => <button key={o.id} type="button" className="flex w-full justify-between gap-2 text-left px-2 py-2 text-xs hover:bg-indigo-50 focus-visible:bg-indigo-50" onClick={() => setSelectedDate(o.occurrenceDate)}><span className="font-mono">{o.occurrenceDate}</span><span className="text-slate-500">{task.occurrenceOverrides?.[o.occurrenceDate] ? t("recurrence.overridden") : t("recurrence.editOccurrence")}</span></button>)}
          {!occurrences.length && <p className="p-2 text-xs text-slate-500">{t("recurrence.noOccurrences")}</p>}
        </div>
        {selectedOccurrence && <OccurrenceEditor key={`${task.id}:${selectedDate}`} task={task} occurrence={selectedOccurrence} idToNo={idToNo} noToId={noToId} onUpdate={onUpdate} onClose={() => setSelectedDate(null)} />}
      </>}
    </section>
  );
}
