import { describe, it, expect } from "vitest";
import {
  buildHolidayMap, makeCalendar, weekKey, monthKey, fmtJP, fmtMD, cal_addDaysISO,
  isWeekend, isWeekendStr, normalizeCalendarExceptions, parseISO,
} from "./calendar.js";

describe("isWeekend / isWeekendStr", () => {
  it("土日を true、平日を false と判定する", () => {
    expect(isWeekendStr("2024-01-06")).toBe(true);  // 土
    expect(isWeekendStr("2024-01-07")).toBe(true);  // 日
    expect(isWeekendStr("2024-01-09")).toBe(false); // 火
    expect(isWeekend(parseISO("2024-01-08"))).toBe(false); // 月（祝日だが曜日判定のみ）
  });
});

describe("normalizeCalendarExceptions", () => {
  it("date 欠落・未知の type の要素を捨てる", () => {
    const { list } = normalizeCalendarExceptions([
      { type: "holiday" },
      { date: "2026-05-01", type: "party" },
      { date: "2026-05-02", type: "workday" },
    ]);
    expect(list).toEqual([{ date: "2026-05-02", type: "workday", name: "" }]);
  });

  it("name を文字列へ丸め、forcedWorkdays / extraHolidays マップを構築する（入力順を保持）", () => {
    const { list, forcedWorkdays, extraHolidays } = normalizeCalendarExceptions([
      { date: "2026-05-01", type: "holiday", name: "創立記念日" },
      { date: "2026-05-02", type: "workday" },
      { date: "2026-05-03", type: "holiday", name: 123 },
    ]);
    expect(list.map(e => e.date)).toEqual(["2026-05-01", "2026-05-02", "2026-05-03"]);
    expect(extraHolidays.get("2026-05-01")).toBe("創立記念日");
    expect(extraHolidays.get("2026-05-03")).toBe("");
    expect(forcedWorkdays.get("2026-05-02")).toBe("");
  });

  it("配列以外の入力は空の結果を返す", () => {
    const { list, forcedWorkdays, extraHolidays } = normalizeCalendarExceptions(undefined);
    expect(list).toEqual([]);
    expect(forcedWorkdays.size).toBe(0);
    expect(extraHolidays.size).toBe(0);
  });
});

describe("buildHolidayMap", () => {
  const map = buildHolidayMap(2024, 2026);

  it("固定日の祝日を含む", () => {
    expect(map.get("2024-01-01")).toBe("元日");
  });

  it("ハッピーマンデー（n番目の月曜）を正しく計算する", () => {
    // 2024年の成人の日は1月8日（第2月曜）
    expect(map.get("2024-01-08")).toBe("成人の日");
  });

  it("秋分の日を年ごとの近似式で計算する", () => {
    expect(map.get("2024-09-22")).toBe("秋分の日");
  });

  it("日曜の祝日は振替休日を翌平日に生成する", () => {
    // 2024年2月11日（建国記念の日）は日曜 → 2月12日が振替休日
    expect(map.get("2024-02-11")).toBe("建国記念の日");
    expect(map.get("2024-02-12")).toBe("振替休日");
  });

  it("祝日に挟まれた平日を国民の休日にする", () => {
    // 2026年: 敬老の日(9/21・月)と秋分の日(9/23・水)の間の9/22(火)
    expect(map.get("2026-09-21")).toBe("敬老の日");
    expect(map.get("2026-09-23")).toBe("秋分の日");
    expect(map.get("2026-09-22")).toBe("国民の休日");
  });
});

describe("makeCalendar", () => {
  const cal = makeCalendar(buildHolidayMap(2024, 2026));

  it("土日・祝日を非稼働日と判定する", () => {
    expect(cal.isWorkdayStr("2024-01-01")).toBe(false); // 元日(月)
    expect(cal.isWorkdayStr("2024-01-06")).toBe(false); // 土曜
    expect(cal.isWorkdayStr("2024-01-09")).toBe(true); // 平日
  });

  it("snapForward/snapBackwardは非稼働日を最寄りの稼働日にスナップする", () => {
    expect(cal.snapForward("2024-01-06")).toBe("2024-01-09"); // 土→翌週火(月祝明け)
    expect(cal.snapBackward("2024-01-08")).toBe("2024-01-05"); // 成人の日(月)→前金曜
  });

  it("shiftは稼働日ベースでnステップ進む（土日祝をスキップ）", () => {
    // 2024-01-05(金)から稼働日で+1 → 週明け1/9(火、1/8は祝日)
    expect(cal.shift("2024-01-05", 1)).toBe("2024-01-09");
    expect(cal.shift("2024-01-09", -1)).toBe("2024-01-05");
    expect(cal.shift("2024-01-09", 0)).toBe("2024-01-09");
  });

  it("endFromStart/startFromEndはduration日数ぶんの稼働日区間を返す", () => {
    // 2024-01-09(火)から3人日 → 火水木の3稼働日、終了日は木(1/11)
    expect(cal.endFromStart("2024-01-09", 3)).toBe("2024-01-11");
    expect(cal.startFromEnd("2024-01-11", 3)).toBe("2024-01-09");
    // duration<=0は開始日（の稼働日スナップ）をそのまま終了日とする
    expect(cal.endFromStart("2024-01-09", 0)).toBe("2024-01-09");
  });

  it("workdaysBetweenは符号付きの稼働日数差を返す", () => {
    expect(cal.workdaysBetween("2024-01-09", "2024-01-11")).toBe(2);
    expect(cal.workdaysBetween("2024-01-11", "2024-01-09")).toBe(-2);
    expect(cal.workdaysBetween("2024-01-09", "2024-01-09")).toBe(0);
  });
});

describe("makeCalendar（非稼働日カレンダーの編集）", () => {
  const holidayMap = buildHolidayMap(2024, 2026);

  it("休日指定（平日）を非稼働日にする", () => {
    const cal = makeCalendar(holidayMap, [{ date: "2024-01-10", type: "holiday", name: "創立記念日" }]);
    expect(cal.isWorkdayStr("2024-01-10")).toBe(false); // 水曜だが休日指定
    expect(cal.isWorkdayStr("2024-01-11")).toBe(true);
  });

  it("休日指定は shift / endFromStart に反映される", () => {
    const cal = makeCalendar(holidayMap, [{ date: "2024-01-10", type: "holiday", name: "創立記念日" }]);
    // 2024-01-09(火)から稼働日で+1 → 1/10は休日指定なので1/11(木)
    expect(cal.shift("2024-01-09", 1)).toBe("2024-01-11");
    // 2024-01-09(火)から3人日 → 火・木・金（水は休日指定）→ 1/12(金)
    expect(cal.endFromStart("2024-01-09", 3)).toBe("2024-01-12");
  });

  it("稼働日指定は土曜を稼働日にする", () => {
    const cal = makeCalendar(holidayMap, [{ date: "2024-01-13", type: "workday", name: "休日出勤" }]);
    expect(cal.isWorkdayStr("2024-01-13")).toBe(true); // 本来は土曜
    expect(cal.isWorkdayStr("2024-01-14")).toBe(false); // 日曜はそのまま
  });

  it("稼働日指定は国民の祝日も上書きする", () => {
    const cal = makeCalendar(holidayMap, [{ date: "2024-01-01", type: "workday", name: "元日出社" }]);
    expect(cal.isWorkdayStr("2024-01-01")).toBe(true); // 元日
  });

  it("同一日に holiday と workday がある場合は workday が勝つ", () => {
    const cal = makeCalendar(holidayMap, [
      { date: "2024-01-10", type: "holiday", name: "休日" },
      { date: "2024-01-10", type: "workday", name: "やっぱり稼働" },
    ]);
    expect(cal.isWorkdayStr("2024-01-10")).toBe(true);
  });

  it("holidayName は休日名・祝日名を返し、稼働日指定は null", () => {
    const cal = makeCalendar(holidayMap, [
      { date: "2024-01-10", type: "holiday", name: "創立記念日" },
      { date: "2024-03-21", type: "holiday", name: "" },
      { date: "2024-01-01", type: "workday", name: "元日出社" },
    ]);
    expect(cal.holidayName("2024-01-10")).toBe("創立記念日");
    expect(cal.holidayName("2024-03-21")).toBe("休日"); // 名称未入力時のフォールバック
    expect(cal.holidayName("2024-05-03")).toBe("憲法記念日"); // 国民の祝日
    expect(cal.holidayName("2024-01-01")).toBe(null); // 稼働日指定
    expect(cal.holidayName("2024-01-11")).toBe(null); // 通常の平日
  });

  it("例外を渡さない場合は従来の挙動と一致する", () => {
    const cal = makeCalendar(holidayMap);
    expect(cal.isWorkdayStr("2024-01-01")).toBe(false);
    expect(cal.isWorkdayStr("2024-01-09")).toBe(true);
    expect(cal.exceptions).toEqual([]);
  });
});

describe("日付フォーマット・週/月キー", () => {
  it("weekKeyはその週の月曜日を返す", () => {
    expect(weekKey("2024-01-10")).toBe("2024-01-08"); // 水→同週月曜
    expect(weekKey("2024-01-08")).toBe("2024-01-08"); // 月→自分自身
  });
  it("monthKeyはYYYY-MMを返す", () => {
    expect(monthKey("2024-01-10")).toBe("2024-01");
  });
  it("fmtJP/fmtMDは表示用フォーマットを返す", () => {
    expect(fmtJP("2024-01-09")).toBe("2024/01/09");
    expect(fmtMD("2024-01-09")).toBe("01/09");
    expect(fmtJP("")).toBe("");
  });
  it("cal_addDaysISOは暦日ベースでn日シフトする（稼働日は考慮しない）", () => {
    expect(cal_addDaysISO("2024-01-09", 5)).toBe("2024-01-14");
    expect(cal_addDaysISO("2024-01-09", -5)).toBe("2024-01-04");
  });
});
