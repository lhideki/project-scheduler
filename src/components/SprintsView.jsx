import React, { useMemo } from "react";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { uid } from "../lib/taskTree.js";
import { toISO, parseISO, cal_addDaysISO, fmtMD } from "../lib/calendar.js";
import { computeOverlappingSprintIds, sprintColorForId } from "../lib/sprints.js";
import { makeDateScale } from "../dom/pointerDrag.js";
import { IconBtn } from "./IconBtn.jsx";

/* =========================================================================================
   11. スプリント ビュー
   ========================================================================================= */
export function SprintsView({ sprints, setSprints, tasks, requestConfirm }) {
  function update(id, patch) { setSprints(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s))); }
  function add() {
    const id = uid("sprint");
    const today = toISO(new Date());
    setSprints(prev => [
      ...prev,
      { id, name: `Sprint ${prev.length + 1}`, theme: "", startDate: today, endDate: cal_addDaysISO(today, 6), order: prev.length },
    ]);
  }
  function remove(id) {
    requestConfirm("このスプリントを削除しますか？（紐付いていたタスクは未割当になります）", () => {
      setSprints(prev => prev.filter(s => s.id !== id));
    }, "削除する");
  }

  const taskCountOf = useMemo(() => {
    const m = new Map();
    tasks.forEach(t => (t.sprintIds || []).forEach(id => m.set(id, (m.get(id) || 0) + 1)));
    return m;
  }, [tasks]);

  const overlapIds = useMemo(() => computeOverlappingSprintIds(sprints), [sprints]);

  // タイムライン表示用のスケール（全スプリントの最短開始日〜最長終了日を1本の軸にする）。
  const { minDate, maxDate } = useMemo(() => {
    const withDates = sprints.filter(s => s.startDate && s.endDate);
    if (!withDates.length) return { minDate: null, maxDate: null };
    let mn = withDates[0].startDate, mx = withDates[0].endDate;
    withDates.forEach(s => { if (s.startDate < mn) mn = s.startDate; if (s.endDate > mx) mx = s.endDate; });
    return { minDate: mn, maxDate: mx };
  }, [sprints]);
  const dayWidth = 10;
  const totalDays = minDate ? Math.max(1, Math.round((parseISO(maxDate) - parseISO(minDate)) / 86400000) + 1) : 0;
  const timelineWidth = totalDays * dayWidth;
  const xOf = makeDateScale(minDate, dayWidth);

  return (
    <div className="h-full overflow-auto p-4 space-y-6">
      {overlapIds.size > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 rounded-lg flex items-center gap-2">
          <AlertTriangle size={13} className="flex-shrink-0" />
          期間が重なっているスプリントがあります。保存はできますが、内容を確認してください。
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-700">スプリント一覧</h3>
          <IconBtn icon={Plus} label="スプリントを追加" onClick={add} small />
        </div>
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium w-32">名称</th>
                <th className="text-left px-3 py-2 font-medium">テーマ</th>
                <th className="text-left px-3 py-2 font-medium w-32">開始日</th>
                <th className="text-left px-3 py-2 font-medium w-32">終了日</th>
                <th className="text-left px-3 py-2 font-medium w-20">タスク数</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {sprints.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400 py-6">スプリントはまだありません</td></tr>}
              {sprints.map(sp => {
                const overlapping = overlapIds.has(sp.id);
                const invalidRange = sp.startDate && sp.endDate && sp.startDate > sp.endDate;
                return (
                  <tr key={sp.id} className={"border-t border-slate-100" + (overlapping || invalidRange ? " bg-amber-50/60" : "")}>
                    <td className="px-3 py-1.5">
                      <input value={sp.name} onChange={e => update(sp.id, { name: e.target.value })}
                        className="bg-transparent outline-none w-full font-medium" />
                    </td>
                    <td className="px-3 py-1.5">
                      <input value={sp.theme || ""} onChange={e => update(sp.id, { theme: e.target.value })}
                        placeholder="このスプリントのテーマ（任意）"
                        className="bg-transparent outline-none w-full placeholder-slate-300" />
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="date" value={sp.startDate || ""} onChange={e => update(sp.id, { startDate: e.target.value })}
                        className="bg-transparent outline-none w-full font-mono" />
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1">
                        <input type="date" value={sp.endDate || ""} onChange={e => update(sp.id, { endDate: e.target.value })}
                          className="bg-transparent outline-none w-full font-mono" />
                        {(overlapping || invalidRange) && (
                          <span title={invalidRange ? "終了日が開始日より前になっています" : "他のスプリントと期間が重なっています"}>
                            <AlertTriangle size={12} className="text-amber-500 flex-shrink-0" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-slate-500">{taskCountOf.get(sp.id) || 0}件</td>
                    <td className="px-1"><button onClick={() => remove(sp.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={13} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">開始日・終了日は自由に入力できます（目安は1週間）。グループ（サマリータスク）にはスプリントを設定できません。</p>
      </div>

      {sprints.length > 0 && minDate && (
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">スプリント タイムライン</h3>
          <div className="border border-slate-200 rounded-lg p-3 overflow-x-auto">
            <div style={{ marginLeft: 100, width: timelineWidth, display: "flex", justifyContent: "space-between" }} className="text-[9px] font-mono text-slate-400 pb-1 border-b border-slate-100 mb-1">
              <span>{fmtMD(minDate)}</span>
              <span>{fmtMD(maxDate)}</span>
            </div>
            {sprints.map(sp => {
              if (!sp.startDate || !sp.endDate || sp.startDate > sp.endDate) return null;
              const c = sprintColorForId(sp.id);
              const x = xOf(sp.startDate), w = Math.max(2, xOf(sp.endDate) + dayWidth - x);
              return (
                <div key={sp.id} className="flex items-center" style={{ height: 26 }}>
                  <div style={{ width: 100, color: c.text }} className="text-[11px] flex-shrink-0 truncate font-medium">{sp.name}</div>
                  <div style={{ position: "relative", width: timelineWidth, height: 18, background: "#F8FAFC", borderRadius: 4, flexShrink: 0 }}>
                    <div title={sp.theme || sp.name} style={{ position: "absolute", left: x, width: w, top: 0, height: 18, background: c.band, border: `1px solid ${c.tagBorder}`, borderRadius: 4 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
