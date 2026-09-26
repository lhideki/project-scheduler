import React, { useMemo } from "react";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { toISO, isWeekendStr } from "../lib/calendar.js";
import { IconBtn } from "./IconBtn.jsx";
import { useI18n } from "./I18nProvider.jsx";

/* =========================================================================================
   非稼働日カレンダー編集（カレンダービュー内に併設）
   ------------------------------------------------------------------------------------------
   土日・日本の祝日の計算結果に対する上書き（休日・稼働日）を編集する。
   計算ロジックは src/lib/calendar.js（makeCalendar）が持ち、ここはトップレベル state
   calendarExceptions の CRUD UI のみ。
   ========================================================================================= */
export function CalendarExceptionsEditor({ exceptions, setExceptions, cal, requestConfirm }) {
  const { t, fmtDate, fmtWeekday } = useI18n();
  function update(index, patch) {
    setExceptions(prev => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  }
  function add() {
    setExceptions(prev => [...prev, { date: toISO(new Date()), type: "holiday", name: "" }]);
  }
  function remove(index) {
    const target = exceptions[index];
    requestConfirm(
      t(target?.type === "workday" ? "calendar.exceptions.confirmDeleteWorkday" : "calendar.exceptions.confirmDeleteHoliday", {
        date: target?.date || t("calendar.exceptions.thisRow"),
      }),
      () => setExceptions(prev => prev.filter((_, i) => i !== index)),
      t("common.deleteConfirm")
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
    if (!e.date) return t("calendar.exceptions.hint.noDate");
    // 未知の種別（不正なJSONのインポート等）。makeCalendar 側では無視されるため、
    // 画面にも「この行は効いていない」ことを明示する。
    if (e.type !== "holiday" && e.type !== "workday") {
      return t("calendar.exceptions.hint.invalidType");
    }
    if (dupDates.has(e.date)) return t("calendar.exceptions.hint.duplicate");
    const weekend = isWeekendStr(e.date);
    const isNationalHoliday = cal.holidayMap.has(e.date);
    if (e.type === "holiday" && (weekend || isNationalHoliday)) {
      return weekend ? t("calendar.exceptions.hint.alreadyWeekend") : t("calendar.exceptions.hint.alreadyHoliday");
    }
    if (e.type === "workday" && !weekend && !isNationalHoliday) {
      return t("calendar.exceptions.hint.alreadyWorkday");
    }
    return null;
  }

  function dowLabel(dateStr) {
    if (!dateStr) return "";
    return t("calendar.weekdaySuffix", { weekday: fmtWeekday(dateStr) });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-700">{t("calendar.exceptions.title")}</h3>
        <IconBtn icon={Plus} label={t("calendar.exceptions.add")} onClick={add} small />
      </div>
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium w-40">{t("calendar.exceptions.columns.date")}</th>
              <th className="text-left px-3 py-2 font-medium w-32">{t("calendar.exceptions.columns.type")}</th>
              <th className="text-left px-3 py-2 font-medium">{t("calendar.exceptions.columns.name")}</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={4} className="text-center text-slate-400 py-6">{t("calendar.exceptions.empty")}</td></tr>
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
                    <select value={e.type === "workday" ? "workday" : e.type === "holiday" ? "holiday" : ""}
                      onChange={ev => update(index, { type: ev.target.value })}
                      className="bg-transparent outline-none">
                      {e.type !== "workday" && e.type !== "holiday" && (
                        <option value="" disabled>{t("calendar.exceptions.invalidType")}</option>
                      )}
                      <option value="holiday">{t("calendar.exceptions.type.holiday")}</option>
                      <option value="workday">{t("calendar.exceptions.type.workday")}</option>
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <input value={e.name || ""} onChange={ev => update(index, { name: ev.target.value })}
                        placeholder={e.type === "workday" ? t("calendar.exceptions.placeholder.workday") : t("calendar.exceptions.placeholder.holiday")}
                        className="bg-transparent outline-none w-full placeholder-slate-300" />
                      {hint && (
                        <span title={hint} role="img" aria-label={hint}>
                          <AlertTriangle size={12} className="text-amber-500 flex-shrink-0" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-1">
                    <button onClick={() => remove(index)} title={t("common.delete")} aria-label={t("common.delete")} className="text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400 mt-1">
        {t("calendar.exceptions.note")}
      </p>
      {rows.length > 0 && (
        <p className="text-[11px] text-slate-400 mt-0.5">
          {t("calendar.exceptions.recent", {
            items: rows.slice(0, 5)
              .map(({ e }) => `${fmtDate(e.date)}${e.type === "workday" ? t("calendar.exceptions.recentWorkday") : t("calendar.exceptions.recentHoliday")}`)
              .join(" / "),
          })}
        </p>
      )}
    </div>
  );
}
