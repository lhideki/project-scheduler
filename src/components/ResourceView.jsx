import React, { useState, useEffect, useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell
} from "recharts";
import { uid } from "../lib/taskTree.js";
import { weekKey } from "../lib/calendar.js";
import { IconBtn } from "./IconBtn.jsx";
import { useI18n } from "./I18nProvider.jsx";

/* =========================================================================================
   10. リソース ビュー
   ========================================================================================= */
export function ResourceView({ resources, setResources, tasks, schedule, requestConfirm }) {
  const { t } = useI18n();
  const [selRes, setSelRes] = useState(resources[0]?.id || null);
  useEffect(() => { if (!resources.find(r => r.id === selRes)) setSelRes(resources[0]?.id || null); }, [resources]);

  function update(id, patch) { setResources(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r))); }
  function add() { const id = uid("res"); setResources(prev => [...prev, { id, name: t("resources.newName"), weeklyCapacity: 5, monthlyCapacity: 20 }]); setSelRes(id); }
  function remove(id) {
    requestConfirm(t("resources.confirmDelete"), () => {
      setResources(prev => prev.filter(r => r.id !== id));
    }, t("common.deleteConfirm"));
  }

  const weeklyData = useMemo(() => {
    if (!selRes) return [];
    const usage = {};
    tasks.filter(task => task.assigneeId === selRes).forEach(task => {
      const s = schedule.get(task.id);
      // ガント・日程計算と同じ日別割当（平準化ONなら稼働上限に合わせて延長した割当）だけを集計する。
      // 開始日＋工数から連続配置を計算し直すと、延長したタスクで負荷がガントとずれるため行わない。
      if (!s || !s.allocation) return;
      s.allocation.alloc.forEach(({ date, load }) => {
        const wk = weekKey(date);
        usage[wk] = (usage[wk] || 0) + load;
      });
    });
    const weeks = Object.keys(usage).sort();
    // 上限値0・未設定は「上限なし」（平準化と同じ扱い）なので、超過判定をしない
    const cap = resources.find(r => r.id === selRes)?.weeklyCapacity || 0;
    return weeks.map(w => ({ week: w.slice(5), days: Math.round(usage[w] * 100) / 100, cap, over: cap > 0 && usage[w] > cap + 1e-9 }));
  }, [selRes, tasks, schedule, resources]);

  const capVal = resources.find(r => r.id === selRes)?.weeklyCapacity || 0;

  return (
    <div className="h-full overflow-auto p-4 space-y-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-700">{t("resources.title")}</h3>
          <IconBtn icon={Plus} label={t("resources.add")} onClick={add} small />
        </div>
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">{t("resources.columns.name")}</th>
                <th className="text-left px-3 py-2 font-medium" title={t("resources.columns.capacityTitle")}>{t("resources.columns.weekly")}</th>
                <th className="text-left px-3 py-2 font-medium" title={t("resources.columns.capacityTitle")}>{t("resources.columns.monthly")}</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {resources.map(r => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-3 py-1.5"><input value={r.name} onChange={e => update(r.id, { name: e.target.value })} className="bg-transparent outline-none w-full" /></td>
                  <td className="px-3 py-1.5"><input type="number" min={0} max={7} value={r.weeklyCapacity} onChange={e => update(r.id, { weeklyCapacity: parseFloat(e.target.value || "0") })} className="bg-transparent outline-none w-20 font-mono" /></td>
                  <td className="px-3 py-1.5"><input type="number" min={0} value={r.monthlyCapacity} onChange={e => update(r.id, { monthlyCapacity: parseFloat(e.target.value || "0") })} className="bg-transparent outline-none w-20 font-mono" /></td>
                  <td className="px-1"><button onClick={() => remove(r.id)} title={t("common.delete")} aria-label={t("common.delete")} className="text-slate-300 hover:text-red-500"><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-semibold text-slate-700">{t("resources.weeklyLoad")}</h3>
          <select value={selRes || ""} aria-label={t("resources.selectAssignee")} onChange={e => setSelRes(e.target.value)} className="text-xs border border-slate-200 rounded px-2 py-1">
            {resources.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="border border-slate-200 rounded-lg p-3" style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip formatter={(v) => [t("resources.chart.value", { value: String(v) }), t("resources.chart.series")]} labelFormatter={l => t("resources.chart.week", { week: l })} />
              {capVal > 0 && <ReferenceLine y={capVal} stroke="#DC2626" strokeDasharray="4 3" label={{ value: t("resources.chart.limit"), position: "right", fontSize: 10, fill: "#DC2626" }} />}
              <Bar dataKey="days" radius={[3, 3, 0, 0]}>
                {weeklyData.map((d, i) => <Cell key={i} fill={d.over ? "#DC2626" : "#6366F1"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">{t("resources.note")}</p>
      </div>
    </div>
  );
}
