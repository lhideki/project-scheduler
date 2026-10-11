import React, { useEffect, useRef, useState } from "react";
import { buildOccurrenceProgressPatch } from "../lib/recurrenceEditing.js";
import { useI18n } from "./I18nProvider.jsx";

/** A local numeric draft commits on blur/Enter; Escape discards it. Actions are one edit. */
export function OccurrenceProgressRow({ task, occurrence, selected, onSelect, onUpdate }) {
  const { t, fmtDate, fmtWeekday } = useI18n();
  const rowRef = useRef(null);
  const [draft, setDraft] = useState(null);
  const [invalid, setInvalid] = useState(false);
  const date = occurrence.occurrenceDate;
  const progress = occurrence.progress || 0;
  const skipped = occurrence.skipped === true;
  useEffect(() => { if (selected) rowRef.current?.scrollIntoView?.({ block: "nearest" }); }, [selected]);
  function apply(edits) {
    const patch = buildOccurrenceProgressPatch(task, date, edits);
    if (patch) onUpdate(patch);
    setDraft(null);
    setInvalid(false);
  }
  function commit() {
    if (draft === null || skipped) return;
    const value = Number(draft);
    if (!draft.trim() || !Number.isFinite(value) || value < 0 || value > 100) { setInvalid(true); return; }
    apply({ progress: Math.round(value) });
  }
  const buttonClass = "border border-slate-200 bg-white rounded-md px-2.5 py-1.5 text-[11px] whitespace-nowrap hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-400";
  return <div ref={rowRef} data-occurrence-row={date} data-selected={selected || undefined} data-skipped={skipped || undefined}
    className={"grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_6rem_13rem] items-center gap-x-3 gap-y-2 px-3 py-2.5 text-xs border-l-2 " + (skipped ? "bg-slate-100 text-slate-500 " : selected ? "bg-indigo-50 " : "bg-white ") + (selected ? "border-indigo-400" : "border-transparent")}>
    <div className="min-w-0">
      <button type="button" className="text-left font-mono hover:underline focus-visible:ring-2 focus-visible:ring-indigo-400 rounded" onClick={onSelect} aria-label={date} aria-pressed={selected}>
        {fmtDate(occurrence.startDate)} <span className="font-sans text-[10px] text-slate-400">({fmtWeekday(occurrence.startDate)})</span>
      </button>
      <div className="flex flex-wrap items-center gap-2 mt-1">
        {selected && <span className="rounded bg-indigo-100 text-indigo-700 px-1.5 py-0.5 text-[10px]">{t("recurrence.selected")}</span>}
        {skipped && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px]">{t("recurrence.skipped")}</span>}
        <button type="button" className="text-[10px] text-slate-500 hover:text-indigo-700 hover:underline" onClick={onSelect}>{t("recurrence.editDates")}</button>
      </div>
      {occurrence.startDate !== date && <p className="mt-1 text-[10px] text-slate-400">{t("recurrence.originalDate", { date })}</p>}
    </div>
    <div className="justify-self-end sm:justify-self-start">
      <div className="flex items-center gap-1">
        <input type={skipped ? "text" : "number"} min={0} max={100} step={1} disabled={skipped}
          aria-label={t("recurrence.progressFor", { date })} aria-invalid={invalid || undefined}
          value={skipped ? "—" : draft ?? progress}
          onChange={e => { setDraft(e.target.value); setInvalid(false); }} onBlur={commit}
          onKeyDown={e => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setDraft(null); setInvalid(false); }
            if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); commit(); }
          }}
          className="w-16 min-w-0 border border-slate-200 rounded-md px-2 py-1.5 text-right font-mono outline-hidden focus:border-indigo-400 disabled:bg-slate-200 disabled:text-slate-400" />
        {!skipped && <span className="text-[10px] text-slate-400">%</span>}
      </div>
      {invalid && <p role="alert" className="mt-1 text-[10px] text-red-700">{t("recurrence.errors.progressInvalid")}</p>}
    </div>
    <div className="col-span-2 sm:col-span-1 flex items-center justify-end gap-2">
      {skipped ? <button type="button" className={buttonClass} onClick={() => apply({ skipped: false })}>{t("recurrence.restore")}</button> : <>
        {progress >= 100 ? <span className="text-emerald-700 mr-auto sm:mr-0">✓ {t("recurrence.completed")}</span> : <button type="button" className={buttonClass} onClick={() => apply({ progress: 100 })}>{t("recurrence.markComplete")}</button>}
        <button type="button" className={buttonClass} onClick={() => apply({ skipped: true })}>{t("recurrence.skip")}</button>
      </>}
    </div>
  </div>;
}
