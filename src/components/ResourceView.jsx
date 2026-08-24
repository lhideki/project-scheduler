import React, { useState, useEffect, useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell
} from "recharts";
import { uid } from "../lib/taskTree.js";
import { weekKey } from "../lib/calendar.js";
import { dailyLoads } from "../lib/scheduling.js";
import { IconBtn } from "./IconBtn.jsx";

/* =========================================================================================
   10. リソース ビュー
   ========================================================================================= */
export function ResourceView({ resources, setResources, tasks, schedule, cal, requestConfirm }) {
  const [selRes, setSelRes] = useState(resources[0]?.id || null);
  useEffect(() => { if (!resources.find(r => r.id === selRes)) setSelRes(resources[0]?.id || null); }, [resources]);

  function update(id, patch) { setResources(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r))); }
  function add() { const id = uid("res"); setResources(prev => [...prev, { id, name: "新規担当者", weeklyCapacity: 5, monthlyCapacity: 20 }]); setSelRes(id); }
  function remove(id) {
    requestConfirm("この担当者を削除しますか？（タスクの担当は未割当になります）", () => {
      setResources(prev => prev.filter(r => r.id !== id));
    }, "削除する");
  }

  const weeklyData = useMemo(() => {
    if (!selRes) return [];
    const usage = {};
    tasks.filter(t => t.assigneeId === selRes).forEach(t => {
      const s = schedule.get(t.id);
      if (!s || !s.schedStart || t.duration <= 0) return;
      dailyLoads(cal, s.schedStart, t.duration).forEach(({ date, load }) => {
        const wk = weekKey(date);
        usage[wk] = (usage[wk] || 0) + load;
      });
    });
    const weeks = Object.keys(usage).sort();
    const cap = resources.find(r => r.id === selRes)?.weeklyCapacity || 0;
    return weeks.map(w => ({ week: w.slice(5), days: Math.round(usage[w] * 100) / 100, cap, over: usage[w] > cap + 1e-9 }));
  }, [selRes, tasks, schedule, resources, cal]);

  const capVal = resources.find(r => r.id === selRes)?.weeklyCapacity || 0;

  return (
    <div className="h-full overflow-auto p-4 space-y-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-700">担当者と稼働上限</h3>
          <IconBtn icon={Plus} label="担当者を追加" onClick={add} small />
        </div>
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">名前</th>
                <th className="text-left px-3 py-2 font-medium">週次上限（日/週）</th>
                <th className="text-left px-3 py-2 font-medium">月次上限（日/月）</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {resources.map(r => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-3 py-1.5"><input value={r.name} onChange={e => update(r.id, { name: e.target.value })} className="bg-transparent outline-none w-full" /></td>
                  <td className="px-3 py-1.5"><input type="number" min={0} max={7} value={r.weeklyCapacity} onChange={e => update(r.id, { weeklyCapacity: parseFloat(e.target.value || "0") })} className="bg-transparent outline-none w-20 font-mono" /></td>
                  <td className="px-3 py-1.5"><input type="number" min={0} value={r.monthlyCapacity} onChange={e => update(r.id, { monthlyCapacity: parseFloat(e.target.value || "0") })} className="bg-transparent outline-none w-20 font-mono" /></td>
                  <td className="px-1"><button onClick={() => remove(r.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-semibold text-slate-700">週次の稼働負荷</h3>
          <select value={selRes || ""} onChange={e => setSelRes(e.target.value)} className="text-xs border border-slate-200 rounded px-2 py-1">
            {resources.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="border border-slate-200 rounded-lg p-3" style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip formatter={(v) => [`${v} 日`, "割当日数"]} labelFormatter={l => `週: ${l}`} />
              <ReferenceLine y={capVal} stroke="#DC2626" strokeDasharray="4 3" label={{ value: "上限", position: "right", fontSize: 10, fill: "#DC2626" }} />
              <Bar dataKey="days" radius={[3, 3, 0, 0]}>
                {weeklyData.map((d, i) => <Cell key={i} fill={d.over ? "#DC2626" : "#6366F1"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">赤い破線は週次稼働上限。バーが上限を超える週は平準化スケジューリングの対象になります。</p>
      </div>
    </div>
  );
}
