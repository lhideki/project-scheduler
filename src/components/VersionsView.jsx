import React, { useState, useMemo } from "react";
import { Save, RotateCcw, Trash2, ArrowLeftRight } from "lucide-react";
import { toISO, parseISO, fmtJP } from "../lib/calendar.js";
import { makeDateScale } from "../dom/pointerDrag.js";
import { IconBtn } from "./IconBtn.jsx";

/* =========================================================================================
   12. バージョン管理・比較ビュー
   ========================================================================================= */
export function VersionsView({ versions, onSave, onDelete, onRename, onRestore, resources }) {
  const [checked, setChecked] = useState([]);
  const [name, setName] = useState("");

  function toggle(id) { setChecked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); }

  const selected = versions.filter(v => checked.includes(v.id));
  const allTaskIds = useMemo(() => {
    const map = new Map();
    selected.forEach(v => v.tasks.forEach(t => { if (!map.has(t.id)) map.set(t.id, t.name); }));
    return Array.from(map.entries());
  }, [selected]);

  const { minDate, maxDate } = useMemo(() => {
    let mn = null, mx = null;
    selected.forEach(v => v.tasks.forEach(t => {
      if (!t.schedStart) return;
      if (!mn || t.schedStart < mn) mn = t.schedStart;
      if (!mx || t.schedFinish > mx) mx = t.schedFinish;
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
        <input value={name} onChange={e => setName(e.target.value)} placeholder="バージョン名（例: 初期計画）" className="text-xs border border-slate-200 rounded px-2 py-1.5 w-56" />
        <IconBtn icon={Save} label="現在のスケジュールを保存" onClick={() => { onSave(name || `バージョン ${versions.length + 1}`); setName(""); }} small />
      </div>

      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="w-8" />
              <th className="text-left px-3 py-2 font-medium">名前</th>
              <th className="text-left px-3 py-2 font-medium">保存日時</th>
              <th className="text-left px-3 py-2 font-medium">タスク数</th>
              <th className="text-left px-3 py-2 font-medium">完了予定</th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {versions.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400 py-6">保存されたバージョンはありません</td></tr>}
            {versions.map(v => {
              const end = v.tasks.reduce((mx, t) => (t.schedFinish && t.schedFinish > mx ? t.schedFinish : mx), "");
              return (
                <tr key={v.id} className="border-t border-slate-100">
                  <td className="px-2 py-1.5"><input type="checkbox" checked={checked.includes(v.id)} onChange={() => toggle(v.id)} /></td>
                  <td className="px-3 py-1.5">
                    <input
                      value={v.name}
                      onChange={e => onRename(v.id, e.target.value)}
                      title="クリックしてバージョン名を変更"
                      className="bg-transparent outline-none w-full rounded px-1 py-0.5 -mx-1 hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-indigo-300"
                    />
                  </td>
                  <td className="px-3 py-1.5 font-mono text-slate-500">{new Date(v.createdAt).toLocaleString("ja-JP")}</td>
                  <td className="px-3 py-1.5 font-mono">{v.tasks.length}</td>
                  <td className="px-3 py-1.5 font-mono">{fmtJP(end)}</td>
                  <td className="px-1">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onRestore(v.id)}
                        disabled={!v.hasFullSnapshot}
                        title={v.hasFullSnapshot ? "現在のタスク・担当者をこのバージョンの状態に戻します" : "古い形式で保存されたバージョンのため復元できません"}
                        className={v.hasFullSnapshot ? "text-slate-300 hover:text-indigo-600" : "text-slate-200 cursor-not-allowed"}
                      >
                        <RotateCcw size={13} />
                      </button>
                      <button onClick={() => onDelete(v.id)} title="削除" className="text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
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
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1"><ArrowLeftRight size={14} />バージョン比較</h3>
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
                      const t = v.tasks.find(x => x.id === id);
                      if (!t || !t.schedStart) return null;
                      const x1 = xOf(t.schedStart), x2 = xOf(t.schedFinish) + dayWidth;
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
