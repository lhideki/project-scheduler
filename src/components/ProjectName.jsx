import React, { useRef, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { useI18n } from "./I18nProvider.jsx";
import { normalizeProjectName } from "../lib/projectName.js";

/** Explicit Apply/Cancel keeps draft names out of autosave and exports. */
export function ProjectName({ value, displayName, onChange }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const restoreFocus = useRef(false);
  function finish(apply) {
    if (apply) onChange(normalizeProjectName(draft));
    restoreFocus.current = true;
    setEditing(false);
  }
  if (editing) return (
    <form className="flex items-center gap-1 min-w-0 max-w-full" onSubmit={event => { event.preventDefault(); finish(true); }}>
      <input
        autoFocus value={draft} onChange={event => setDraft(event.target.value)}
        aria-label={t("projectName.label")} title={t("projectName.help")}
        placeholder={t("projectName.untitled")}
        className="w-64 min-w-0 max-w-full border border-indigo-300 rounded px-1.5 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        onFocus={event => event.target.select()}
        onKeyDown={event => {
          // Enter confirms IME composition first, without committing a partial name.
          if (event.nativeEvent.isComposing || event.keyCode === 229) {
            if (event.key === "Enter") event.preventDefault();
            return;
          }
          if (event.key === "Escape") { event.preventDefault(); finish(false); }
        }}
      />
      <button type="submit" className="shrink-0 p-1 rounded text-indigo-700 hover:bg-indigo-50 focus-visible:ring-2 focus-visible:ring-indigo-500" aria-label={t("projectName.save")} title={t("projectName.save")}><Check size={16} /></button>
      <button type="button" onClick={() => finish(false)} className="shrink-0 p-1 rounded text-slate-500 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-indigo-500" aria-label={t("projectName.cancel")} title={t("projectName.cancel")}><X size={16} /></button>
    </form>
  );
  return (
    <button type="button"
      ref={element => {
        if (element && restoreFocus.current) { restoreFocus.current = false; element.focus(); }
      }}
      onClick={() => { setDraft(value); setEditing(true); }}
      aria-label={t("projectName.edit")} title={displayName}
      className="flex items-center gap-1.5 max-w-full rounded text-left hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      <span data-testid="project-name" className="block max-w-72 truncate font-semibold text-sm tracking-tight">{displayName}</span>
      <Pencil size={12} className="shrink-0 text-slate-400" aria-hidden="true" />
    </button>
  );
}
