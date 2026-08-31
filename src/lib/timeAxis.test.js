import { describe, it, expect } from "vitest";
import {
  DAY_WIDTH_STOPS, MIN_DAY_WIDTH, MAX_DAY_WIDTH,
  stepDayWidth, axisTier, buildTimeAxis,
} from "./timeAxis.js";
import { makeCalendar, buildHolidayMap, parseISO } from "./calendar.js";

const cal = makeCalendar(buildHolidayMap(2025, 2027), []);

describe("axisTier", () => {
  it("dayWidth の閾値で day / week / month を切り替える", () => {
    expect(axisTier(40)).toBe("day");
    expect(axisTier(16)).toBe("day");
    expect(axisTier(14)).toBe("day");
    expect(axisTier(12)).toBe("week");
    expect(axisTier(4)).toBe("week");
    expect(axisTier(3)).toBe("month");
    expect(axisTier(2)).toBe("month");
  });
});

describe("stepDayWidth", () => {
  it("ラダー上を1段ずつ移動する", () => {
    expect(stepDayWidth(20, -1)).toBe(16);
    expect(stepDayWidth(20, +1)).toBe(26);
    expect(stepDayWidth(MIN_DAY_WIDTH, -1)).toBe(MIN_DAY_WIDTH);
    expect(stepDayWidth(MAX_DAY_WIDTH, +1)).toBe(MAX_DAY_WIDTH);
  });
  it("ラダー外の値からは直近の隣接 stop へ寄せる", () => {
    expect(stepDayWidth(18, -1)).toBe(16);
    expect(stepDayWidth(18, +1)).toBe(20);
    expect(DAY_WIDTH_STOPS).toContain(20);
  });
});

describe("buildTimeAxis", () => {
  const minDate = "2026-01-15";
  const maxDate = "2026-04-10";

  it("day tier: 1日1目盛り＋曜日、x はバー位置と同じ換算", () => {
    const dayWidth = 20;
    const { tier, minor } = buildTimeAxis({ minDate, maxDate, dayWidth, tier: axisTier(dayWidth), cal });
    expect(tier).toBe("day");
    expect(minor).toHaveLength(86); // 1/15〜4/10 の日数（両端含む）
    expect(minor[0]).toMatchObject({ key: "2026-01-15", label: "15", sub: "木", x: 0, w: 20 });
    const jan17 = minor.find(m => m.key === "2026-01-17"); // 土曜
    expect(jan17.x).toBe(2 * 20);
    expect(jan17.muted).toBe(true);
    const jan16 = minor.find(m => m.key === "2026-01-16"); // 平日
    expect(jan16.muted).toBe(false);
  });

  it("week tier: 週頭（月曜）ごとの目盛り、先頭週は minDate を含む週の月曜", () => {
    const dayWidth = 8;
    const { tier, minor } = buildTimeAxis({ minDate, maxDate, dayWidth, tier: axisTier(dayWidth), cal });
    expect(tier).toBe("week");
    // 2026-01-15(木) を含む週の月曜は 2026-01-12
    expect(minor[0].key).toBe("2026-01-12");
    expect(minor[0].label).toBe("1/12");
    // 先頭週は minDate より前が範囲外なのでクリップされ x=0
    expect(minor[0].x).toBe(0);
    expect(minor[0].w).toBeLessThan(7 * dayWidth);
    // すべての目盛りが月曜始まり
    for (const m of minor) {
      expect(parseISO(m.key).getUTCDay()).toBe(1);
    }
    // 2週目以降はフル幅
    expect(minor[1].key).toBe("2026-01-19");
    expect(minor[1].w).toBe(7 * dayWidth);
  });

  it("month tier: 月初ごとの目盛りと年の帯", () => {
    const dayWidth = 3;
    const { tier, minor, major } = buildTimeAxis({ minDate, maxDate, dayWidth, tier: axisTier(dayWidth), cal });
    expect(tier).toBe("month");
    expect(minor.map(m => m.label)).toEqual(["1月", "2月", "3月", "4月"]);
    for (const m of minor) {
      expect(parseISO(m.key).getUTCDate()).toBe(1);
    }
    // 2月分の幅 = 28日 * dayWidth
    const feb = minor.find(m => m.key === "2026-02-01");
    expect(feb.w).toBe(28 * dayWidth);
    expect(major).toHaveLength(1);
    expect(major[0]).toMatchObject({ label: "2026", x: 0 });
  });

  it("day/week tier の major は YYYY-MM の月帯で、年をまたいでも連続する", () => {
    const dayWidth = 20;
    const { major } = buildTimeAxis({
      minDate: "2025-12-20", maxDate: "2026-02-05", dayWidth, tier: "day", cal,
    });
    expect(major.map(b => b.label)).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(major[0].x).toBe(0);
    // 帯は隙間なく連続する
    expect(major[1].x).toBeCloseTo(major[0].x + major[0].w);
  });

  it("端で潰れた帯（maxDate 側の余白がはみ出した断片）は、dayWidth によらず描画対象から外す", () => {
    // projectEnd + 7日 で 10/02 まで伸びるが、10月分は 1〜3日ぶんしかないので落とす。
    const monthTier = buildTimeAxis({
      minDate: "2026-08-01", maxDate: "2026-10-02", dayWidth: 3, tier: "month", cal,
    });
    expect(monthTier.minor.map(m => m.label)).toEqual(["8月", "9月"]);

    // week tier（dayWidth 12）でも、中段の月帯に "2026-10" の断片を出さない。
    const weekTier = buildTimeAxis({
      minDate: "2026-08-01", maxDate: "2026-10-02", dayWidth: 12, tier: "week", cal,
    });
    expect(weekTier.major.map(b => b.label)).toEqual(["2026-08", "2026-09"]);
  });

  it("目盛りは表示範囲 [0, spanW] にクリップされ、右端をはみ出さない", () => {
    const dayWidth = 8;
    const spanW = Math.round((parseISO(maxDate) - parseISO(minDate)) / 86400000) * dayWidth;
    const { minor, major } = buildTimeAxis({ minDate, maxDate, dayWidth, tier: "week", cal });
    for (const m of [...minor, ...major]) {
      expect(m.x).toBeGreaterThanOrEqual(0);
      expect(m.x + m.w).toBeLessThanOrEqual(spanW);
    }
  });
});
