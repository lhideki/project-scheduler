import React, { useState, useMemo } from "react";
import { Save, RotateCcw, Trash2, ArrowLeftRight } from "lucide-react";
import { toISO, parseISO } from "../lib/calendar.js";
import { makeDateScale } from "../dom/pointerDrag.js";
import { IconBtn } from "./IconBtn.jsx";
import { useI18n } from "./I18nProvider.jsx";

/* =========================================================================================
   12. バージョン管理・比較ビュー
   ========================================================================================= */
export function VersionsView({ versions, onSave, onDelete, onRename, onRestore, resources }) {
  const { t, fmtDate, fmtDateTime } = useI18n();
  const [checked, setChecked] = useState([]);
  const [name, setName] = useState("");

  function toggle(id) { setChecked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); }

  const selected = versions.filter(v => checked.includes(v.id));
  const allTaskIds = useMemo(() => {
    const map = new Map();
    selected.forEach(v => v.tasks.forEach(x => { if (!map.has(x.id)) map.set(x.id, x.name); }));
    return Array.from(map.entries());
  }, [selected]);

  const { minDate, maxDate } = useMemo(() => {
    let mn = null, mx = null;
    selected.forEach(v => v.tasks.forEach(x => {
      if (!x.schedStart) return;
      if (!mn || x.schedStart < mn) mn = x.schedStart;
      if (!mx || x.schedFinish > mx) mx = x.schedFinish;
    }));
    return { minDate: mn || toISO(new Date()), maxDate: mx || toISO(new Date()) };
  }, [selected]);

  const dayWidth = 8;
  const totalDays = Math.max(1, Math.round((parseISO(maxDate) - parseISO(minDate)) / 86400000) + 3);
  const chartWidth = totalDays * dayWidth;
  const xOf = makeDateScale(minDate, dayWidth);
  const colors = ["#6366F1", "#F59E0B", "#10B981", "#EC4899", "#0EA5E9", "#8B5CF6"];

  return (
    <div className="h-full overflow-auto p-4 space-y-5">
      <div className="flex items-center gap-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder={t("versions.namePlaceholder")} aria-label={t("versions.nameLabel")} className="text-xs border border-slate-200 rounded px-2 py-1.5 w-56" />
        <IconBtn icon={Save} label={t("versions.save")} onClick={() => { onSave(name || t("versions.defaultName", { n: versions.length + 1 })); setName(""); }} small />
      </div>

      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="w-8" />
              <th className="text-left px-3 py-2 font-medium">{t("versions.columns.name")}</th>
              <th className="text-left px-3 py-2 font-medium">{t("versions.columns.savedAt")}</th>
              <th className="text-left px-3 py-2 font-medium">{t("versions.columns.taskCount")}</th>
              <th className="text-left px-3 py-2 font-medium">{t("versions.columns.finish")}</th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {versions.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400 py-6">{t("versions.empty")}</td></tr>}
            {versions.map(v => {
              const end = v.tasks.reduce((mx, x) => (x.schedFinish && x.schedFinish > mx ? x.schedFinish : mx), "");
              return (
                <tr key={v.id} className="border-t border-slate-100">
                  <td className="px-2 py-1.5"><input type="checkbox" checked={checked.includes(v.id)} onChange={() => toggle(v.id)} aria-label={t("versions.compareCheck", { name: v.name })} /></td>
                  <td className="px-3 py-1.5">
                    <input
                      value={v.name}
                      onChange={e => onRename(v.id, e.target.value)}
                      title={t("versions.renameTitle")}
                      className="bg-transparent outline-none w-full rounded px-1 py-0.5 -mx-1 hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-indigo-300"
                    />
                  </td>
                  <td className="px-3 py-1.5 font-mono text-slate-500">{fmtDateTime(v.createdAt)}</td>
                  <td className="px-3 py-1.5 font-mono">{v.tasks.length}</td>
                  <td className="px-3 py-1.5 font-mono">{fmtDate(end)}</td>
                  <td className="px-1">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onRestore(v.id)}
                        disabled={!v.hasFullSnapshot}
                        title={v.hasFullSnapshot ? t("versions.restoreTitle") : t("versions.restoreUnsupportedTitle")}
                        aria-label={v.hasFullSnapshot ? t("versions.restoreTitle") : t("versions.restoreUnsupportedTitle")}
                        className={v.hasFullSnapshot ? "text-slate-300 hover:text-indigo-600" : "text-slate-200 cursor-not-allowed"}
                      >
                        <RotateCcw size={13} />
                      </button>
                      <button onClick={() => onDelete(v.id)} title={t("common.delete")} aria-label={t("common.delete")} className="text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1"><ArrowLeftRight size={14} />{t("versions.compare")}</h3>
            {selected.map((v, i) => (
              <span key={v.id} className="flex items-center gap-1 text-[11px] text-slate-500">
                <span style={{ width: 10, height: 10, background: colors[i % colors.length], display: "inline-block", borderRadius: 2 }} />{v.name}
              </span>
            ))}
          </div>
          <div className="border border-slate-200 rounded-lg overflow-auto">
            <div style={{ width: chartWidth + 220 }}>
              {allTaskIds.map(([id, name]) => (
                <div key={id} className="flex items-center border-b border-slate-50" style={{ height: 26 }}>
                  <div style={{ width: 220 }} className="text-[11px] text-slate-600 truncate px-2 flex-shrink-0">{name}</div>
                  <svg width={chartWidth} height={26}>
                    {selected.map((v, vi) => {
                      const vt = v.tasks.find(x => x.id === id);
                      if (!vt || !vt.schedStart) return null;
                      const x1 = xOf(vt.schedStart), x2 = xOf(vt.schedFinish) + dayWidth;
                      const y = 4 + vi * 6;
                      return <rect key={v.id} x={x1} y={y} width={Math.max(2, x2 - x1)} height={4} fill={colors[vi % colors.length]} opacity={0.9} rx={1} />;
                    })}
                  </svg>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
