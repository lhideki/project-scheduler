import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { generateOccurrences, expandRecurringTasks, occurrenceId, occurrenceLoads, defaultCalculationEndDate, addCalendarDays, isISODate, MAX_RECURRENCE_OCCURRENCES } from "./recurrence.js";

const series = (changes = {}) => ({ id: "series", name: "Review", parentId: null, order: 0, startDate: "2024-01-31", duration: 2, predecessors: [], recurrence: { frequency: "monthly", interval: 1, endDate: "2024-05-31" }, ...changes });
const dates = task => generateOccurrences(task).occurrences.map(o => o.occurrenceDate);

describe("calendar recurrences", () => {
  it("clamps monthly dates without drifting after February, including leap years", () => {
    expect(dates(series())).toEqual(["2024-01-31", "2024-02-29", "2024-03-31", "2024-04-30", "2024-05-31"]);
    expect(dates(series({ startDate: "2023-01-31", recurrence: { frequency: "monthly", interval: 2, endDate: "2023-07-31" } }))).toEqual(["2023-01-31", "2023-03-31", "2023-05-31", "2023-07-31"]);
  });
  it("supports explicit month start/end without occurrences before the origin", () => {
    expect(dates(series({ recurrence: { frequency: "monthly", interval: 1, monthDay: "start", endDate: "2024-04-01" } }))).toEqual(["2024-02-01", "2024-03-01", "2024-04-01"]);
    expect(dates(series({ startDate: "2024-02-10", recurrence: { frequency: "monthly", interval: 1, monthDay: "end", endDate: "2024-04-30" } }))).toEqual(["2024-02-29", "2024-03-31", "2024-04-30"]);
  });
  it("anchors weekly intervals on Monday and supports multiple weekdays after origin", () => {
    const task = series({ startDate: "2024-01-10", recurrence: { frequency: "weekly", interval: 2, weekdays: [1, 3, 5], endDate: "2024-02-09" } });
    expect(dates(task)).toEqual(["2024-01-10", "2024-01-12", "2024-01-22", "2024-01-24", "2024-01-26", "2024-02-05", "2024-02-07", "2024-02-09"]);
    expect(dates(series({ startDate: "2024-01-14", recurrence: { frequency: "weekly", interval: 2, endDate: "2024-02-15" } }))).toEqual(["2024-01-14", "2024-01-28", "2024-02-11"]);
  });
  it("uses inclusive daily intervals and a fixed default horizon even for ancient origins", () => {
    expect(dates(series({ startDate: "2024-02-27", recurrence: { frequency: "daily", interval: 2, endDate: "2024-03-02" } }))).toEqual(["2024-02-27", "2024-02-29", "2024-03-02"]);
    expect(defaultCalculationEndDate("2024-02-29")).toBe("2025-02-28");
    const generated = generateOccurrences(series({ startDate: "1900-01-01", recurrence: { frequency: "daily", interval: 1 } }));
    expect(generated.calculationEndDate).toBe("1900-12-31");
    expect(generated.occurrences).toHaveLength(365);
    expect(generated.truncated).toBe(false);
  });
  it("uses explicit end ahead of an endless calculation horizon and reports the hard bound", () => {
    const generated = generateOccurrences(series({ startDate: "1000-01-01", recurrence: { frequency: "daily", interval: 1, endDate: "9999-12-31" } }));
    expect(generated.occurrences).toHaveLength(MAX_RECURRENCE_OCCURRENCES);
    expect(generated.truncated).toBe(true);
    expect(generated.requestedCalculationEndDate).toBe("9999-12-31");
    expect(generated.calculationEndDate).toBe(generated.occurrences.at(-1).occurrenceDate);
    expect(dates(series({ recurrence: { frequency: "monthly", interval: 1, endDate: "2024-05-31", calculationEndDate: "2024-03-31" } }))).toHaveLength(5);
  });
  it("keeps identity and dormant exceptions; override dependencies replace series defaults", () => {
    const task = series({ predecessors: [{ id: "A", type: "FS", lag: 0 }], occurrenceOverrides: {
      "2024-02-29": { startDate: "2024-03-02", endDate: "2024-03-05", predecessors: [] },
      "2024-02-15": { startDate: "2024-03-20" },
    } });
    const original = structuredClone(task);
    const generated = generateOccurrences(task);
    const second = generated.occurrences[1];
    expect(second).toMatchObject({ id: occurrenceId("series", "2024-02-29"), occurrenceDate: "2024-02-29", startDate: "2024-03-02", endDate: "2024-03-05", predecessors: [] });
    expect(generated.occurrences[0].predecessors).toEqual(task.predecessors);
    expect(occurrenceLoads(second)).toEqual(["2024-03-02", "2024-03-03", "2024-03-04", "2024-03-05"].map(date => ({ date, load: 0.5 })));
    expect(task).toEqual(original);
    expect(generated.occurrences.some(o => o.occurrenceDate === "2024-02-15")).toBe(false);
  });
  it("uses collision-safe tuple IDs and idempotent pure expansion", () => {
    expect(occurrenceId('a","2024-01-01', "2024-02-01")).not.toBe(occurrenceId("a", '2024-01-01","2024-02-01'));
    const tasks = [series(), { id: "after", predecessors: [{ id: "series", occurrenceDate: "2024-02-29", type: "FS", lag: 0 }] }];
    const before = structuredClone(tasks);
    const expanded = expandRecurringTasks(tasks);
    expect(expandRecurringTasks(expanded)).toEqual(expanded);
    expect(expanded.find(t => t.id === "after").predecessors[0].id).toBe(occurrenceId("series", "2024-02-29"));
    expect(tasks).toEqual(before);
  });
  it("bounds sparse long-horizon rules and reports actual/requested horizons", () => {
    const generated = generateOccurrences(series({ recurrence: { frequency: "monthly", interval: 365, endDate: "9999-12-31" } }));
    expect(generated.truncated).toBe(true);
    expect(generated.truncationReasons).toContain("calendar-horizon-limit");
    expect(generated.calculationEndDate).toBe("2034-02-06");
    expect(generated.occurrences).toHaveLength(1);
  });
  it("guards huge fixed spans before allocating and reports synthetic ID collisions", () => {
    expect(generateOccurrences(series({ occurrenceOverrides: { "2024-01-31": { startDate: "9999-01-01" } } })).invalidReason).toBe("occurrence-move-exceeded");
    expect(generateOccurrences(series({ duration: 1000000 })).invalidReason).toBe("recurrence-span-exceeded");
    expect(generateOccurrences(series({ occurrenceOverrides: { "2024-01-31": { endDate: "9999-12-31" } } })).invalidReason).toBe("occurrence-span-exceeded");
    const collision = expandRecurringTasks([series(), { id: occurrenceId("series", "2024-01-31"), name: "Ordinary" }]);
    expect(collision.filter(t => t.id === occurrenceId("series", "2024-01-31"))).toHaveLength(1);
    expect(collision[0].recurrenceMetadata.invalidReason).toBe("occurrence-id-collision");
  });
  it("rejects invalid inputs explicitly and validates real dates", () => {
    expect(isISODate("2023-02-29")).toBe(false);
    expect(isISODate("2024-02-29")).toBe(true);
    expect(generateOccurrences(series({ recurrence: { frequency: "daily", interval: 0 } })).invalidReason).toBe("invalid-recurrence");
  });
});

it("conserves fractional effort in ledger units while distributing fixed spans uniformly", () => {
  const alloc = occurrenceLoads({ startDate: "2024-01-12", endDate: "2024-01-14", duration: 1 });
  expect(alloc.reduce((sum, a) => sum + a.load, 0)).toBeCloseTo(1, 12);
  expect(Math.max(...alloc.map(a => a.load)) - Math.min(...alloc.map(a => a.load))).toBeLessThanOrEqual(0.00000100001);
});


it.each([
  { frequency: "daily", interval: 366 },
  { frequency: "weekly", interval: 1, endDate: "2024-01-30" },
  { frequency: "monthly", interval: 1, calculationEndDate: "2024-01-30" },
])("rejects direct recurrence input outside interval/date bounds: %j", recurrence => {
  const result = generateOccurrences(series({ recurrence }));
  expect(result.invalidReason).toBe("invalid-recurrence");
  expect(result.occurrences).toEqual([]);
  expect(result.truncated).toBe(false);
});


describe("supported ISO year boundaries", () => {
  it("terminates and preserves year 0000 weekly weekdays when the anchored Monday is in year -1", () => {
    // A subprocess timeout makes any future nontermination regression fail this test
    // without freezing Vitest's worker or the import-validation suite.
    const moduleURL = new URL("./recurrence.js", import.meta.url).href;
    const script = `import { generateOccurrences } from ${JSON.stringify(moduleURL)};
      const make = weekdays => generateOccurrences({ id: "s", startDate: "0000-01-01", duration: 1,
        recurrence: { frequency: "weekly", interval: 1, ...(weekdays ? { weekdays, endDate: "0000-01-10" } : {}) } });
      console.log(JSON.stringify([make(), make([0, 1, 6]), make([1])]));`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 5000 });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const [defaultRule, multiple, monday] = JSON.parse(result.stdout);
    expect(defaultRule.occurrences).toHaveLength(53);
    expect(defaultRule.occurrences[0].occurrenceDate).toBe("0000-01-01");
    expect(defaultRule.occurrences.at(-1).occurrenceDate).toBe("0000-12-30");
    expect(multiple.occurrences.map(o => o.occurrenceDate)).toEqual(["0000-01-01", "0000-01-02", "0000-01-03", "0000-01-08", "0000-01-09", "0000-01-10"]);
    expect(monday.occurrences.map(o => o.occurrenceDate)).toEqual(["0000-01-03", "0000-01-10"]);
  });
  it.each(["0001", "0099", "9999"])("preserves historical/final ISO year %s", year => {
    const origin = `${year}-01-01`;
    const result = generateOccurrences(series({ startDate: origin, duration: 1, recurrence: { frequency: "weekly", interval: 1, endDate: `${year}-01-15` } }));
    expect(result.occurrences.map(o => o.occurrenceDate)).toEqual([`${year}-01-01`, `${year}-01-08`, `${year}-01-15`]);
    expect(addCalendarDays(origin, 1)).toBe(`${year}-01-02`);
  });
  it("rejects invalid helper inputs and arithmetic beyond supported ISO years", () => {
    expect(addCalendarDays("0000-01-01", -1)).toBeNull();
    expect(addCalendarDays("9999-12-31", 1)).toBeNull();
    expect(addCalendarDays("0001-01-01", -1)).toBe("0000-12-31");
    for (const date of ["-000001-12", "2024-02-30", "10000-01-01", "nonsense", null]) expect(addCalendarDays(date, 1)).toBeNull();
    for (const days of [NaN, Infinity, -Infinity, 0.5, "1"]) expect(addCalendarDays("2024-01-01", days)).toBeNull();
    expect(defaultCalculationEndDate("0000-01-01")).toBe("0000-12-31");
    expect(defaultCalculationEndDate("9999-12-31")).toBe("9999-12-31");
    expect(defaultCalculationEndDate("invalid")).toBeNull();
  });
  it("terminates daily and monthly rules at both representable boundaries", () => {
    expect(dates(series({ startDate: "9999-12-30", duration: 1, recurrence: { frequency: "daily", interval: 1, endDate: "9999-12-31" } }))).toEqual(["9999-12-30", "9999-12-31"]);
    expect(dates(series({ startDate: "0000-01-31", duration: 1, recurrence: { frequency: "monthly", interval: 1, endDate: "0000-03-31" } }))).toEqual(["0000-01-31", "0000-02-29", "0000-03-31"]);
    expect(dates(series({ startDate: "9999-11-30", duration: 1, recurrence: { frequency: "monthly", interval: 1, monthDay: "end", endDate: "9999-12-31" } }))).toEqual(["9999-11-30", "9999-12-31"]);
  });
});
