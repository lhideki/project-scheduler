import React, { useMemo } from "react";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { toISO, parseISO, fmtJP, WEEKDAY_JA, isWeekendStr } from "../lib/calendar.js";
import { IconBtn } from "./IconBtn.jsx";

/* =========================================================================================
   非稼働日カレンダー編集（スプリントビュー内に併設）
   ------------------------------------------------------------------------------------------
   土日・日本の祝日の計算結果に対する上書き（休日・稼働日）を編集する。
   計算ロジックは src/lib/calendar.js（makeCalendar）が持ち、ここはトップレベル state
   calendarExceptions の CRUD UI のみ。
   ========================================================================================= */
export function CalendarExceptionsEditor({ exceptions, setExceptions, cal, requestConfirm }) {
  function update(index, patch) {
    setExceptions(prev => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  }
  function add() {
    setExceptions(prev => [...prev, { date: toISO(new Date()), type: "holiday", name: "" }]);
  }
  function remove(index) {
    const target = exceptions[index];
    requestConfirm(
      `${target?.date || "この行"} の${target?.type === "workday" ? "稼働日" : "休日"}指定を削除しますか？`,
      () => setExceptions(prev => prev.filter((_, i) => i !== index)),
      "削除する"
    );
  }

  // 表示は日付昇順。元の配列インデックスを保持して編集対象を特定する。
  const rows = useMemo(() => (
    exceptions
      .map((e, index) => ({ e, index }))
      .sort((a, b) => String(a.e.date).localeCompare(String(b.e.date)))
  ), [exceptions]);

  const dupDates = useMemo(() => {
    const seen = new Set();
    const dup = new Set();
    for (const e of exceptions) {
      if (!e.date) continue;
      if (seen.has(e.date)) dup.add(e.date);
      seen.add(e.date);
    }
    return dup;
  }, [exceptions]);

  function hintFor(e) {
    if (!e.date) return "日付を入力してください";
    if (dupDates.has(e.date)) return "同じ日付の行が複数あります（稼働日が優先されます）";
    const weekend = isWeekendStr(e.date);
    const isNationalHoliday = cal.holidayMap.has(e.date);
    if (e.type === "holiday" && (weekend || isNationalHoliday)) {
      return weekend ? "この日は元々土日です（指定は不要）" : "この日は元々祝日です（指定は不要）";
    }
    if (e.type === "workday" && !weekend && !isNationalHoliday) {
      return "この日は元々稼働日です（指定は不要）";
    }
    return null;
  }

  function dowLabel(dateStr) {
    if (!dateStr) return "";
    return `（${WEEKDAY_JA[parseISO(dateStr).getUTCDay()]}）`;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-700">非稼働日カレンダー</h3>
        <IconBtn icon={Plus} label="例外日を追加" onClick={add} small />
      </div>
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium w-40">日付</th>
              <th className="text-left px-3 py-2 font-medium w-32">種別</th>
              <th className="text-left px-3 py-2 font-medium">名称</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={4} className="text-center text-slate-400 py-6">例外はまだありません（土日＋日本の祝日で計算します）</td></tr>
            )}
            {rows.map(({ e, index }) => {
              const hint = hintFor(e);
              return (
                <tr key={index} className={"border-t border-slate-100" + (hint ? " bg-amber-50/50" : "")}>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <input type="date" value={e.date || ""} onChange={ev => update(index, { date: ev.target.value })}
                        className="bg-transparent outline-none font-mono" />
                      <span className="text-slate-400">{dowLabel(e.date)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <select value={e.type} onChange={ev => update(index, { type: ev.target.value })}
                      className="bg-transparent outline-none">
                      <option value="holiday">休日</option>
                      <option value="workday">稼働日</option>
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <input value={e.name || ""} onChange={ev => update(index, { name: ev.target.value })}
                        placeholder={e.type === "workday" ? "例: 休日出勤" : "例: 創立記念日"}
                        className="bg-transparent outline-none w-full placeholder-slate-300" />
                      {hint && (
                        <span title={hint}>
                          <AlertTriangle size={12} className="text-amber-500 flex-shrink-0" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-1">
                    <button onClick={() => remove(index)} className="text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400 mt-1">
        優先順位: 稼働日 ＞ 休日 ＞ 日本の祝日 ＞ 土日。
        「稼働日」は土日・祝日でもその日を稼働日として扱い、「休日」は平日を非稼働日にします。ここでの変更はCPM・リソース平準化・完了予定日に反映されます。
      </p>
      {rows.length > 0 && (
        <p className="text-[11px] text-slate-400 mt-0.5">
          直近の例外: {rows.slice(0, 5).map(({ e }) => `${fmtJP(e.date)}${e.type === "workday" ? "(稼働)" : "(休)"}`).join(" / ")}
        </p>
      )}
    </div>
  );
}
