import { describe, it, expect } from "vitest";
import {
  buildHolidayMap, makeCalendar, weekKey, monthKey, fmtJP, fmtMD, cal_addDaysISO,
} from "./calendar.js";

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
