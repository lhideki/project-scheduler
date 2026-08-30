import React, { useMemo } from "react";
import { toISO, parseISO, fmtJP, WEEKDAY_JA } from "../lib/calendar.js";
import { CalendarExceptionsEditor } from "./CalendarExceptionsEditor.jsx";

/* =========================================================================================
   カレンダー編集ビュー（WBS/ガント等と同じレベルのタブ）
   ------------------------------------------------------------------------------------------
   カレンダー（休日・稼働日の上書き）の編集（CalendarExceptionsEditor）と、参考用の自動計算祝日一覧を表示する。
   計算ロジックは src/lib/calendar.js（makeCalendar）が持つ。
   ========================================================================================= */
export function CalendarView({ calendarExceptions, setCalendarExceptions, cal, requestConfirm }) {
  // 今日以降の「日本の祝日」（振替休日・国民の休日を含む自動計算分）を参考表示する。
  // スケジューラが実際に非稼働日として扱う祝日は cal.holidayMap（makeCalendar が保持、
  // projectStart 起点 -1〜+6 年）なので、それをそのまま参照する。別途祝日マップを作ると
  // 編集表の「元々祝日です」ヒント（cal.holidayMap 基準）と食い違うため。
  // 稼働日指定（type: "workday"）で上書きした日は非表示にする。
  const upcomingHolidays = useMemo(() => {
    const today = toISO(new Date());
    const forcedWorkdays = new Set(cal.exceptions.filter(e => e.type === "workday").map(e => e.date));
    return [...cal.holidayMap.entries()]
      .filter(([date]) => date >= today && !forcedWorkdays.has(date))
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, 12);
  }, [cal]);

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-3xl space-y-8">
        <CalendarExceptionsEditor
          exceptions={calendarExceptions}
          setExceptions={setCalendarExceptions}
          cal={cal}
          requestConfirm={requestConfirm}
        />

        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">今後の祝日（自動計算・編集不可）</h3>
          {upcomingHolidays.length === 0 ? (
            <p className="text-xs text-slate-400">直近に自動計算の祝日はありません。</p>
          ) : (
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
              {upcomingHolidays.map(([date, name]) => (
                <div key={date} className="flex items-center gap-3 px-3 py-1.5 text-xs">
                  <span className="font-mono text-slate-500 w-32">{fmtJP(date)}（{WEEKDAY_JA[parseISO(date).getUTCDay()]}）</span>
                  <span className="text-slate-700">{name}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-1">
            日本の祝日（振替休日・国民の休日を含む）は自動で非稼働日として扱われます。
            ここに無い休日（会社独自の休日など）や、土日・祝日に稼働する日だけを上の表で追加してください。
          </p>
        </div>
      </div>
    </div>
  );
}
