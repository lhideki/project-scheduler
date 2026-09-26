import { describe, it, expect } from "vitest";
// UI（React）側の実行環境。テストでのみ使う（src/lib/ の実行時コードは use-intl・React に依存しない）。
import { createTranslator } from "use-intl/core";
import {
  LOCALES, MESSAGES, FORMATS, TIME_ZONE, createAppTranslator, detectLocale, normalizeLocale, catalogValues, dateArg,
  formatDependencyIssueMessage, dependencyIssueLabel, formatSprintConflictReason, formatSprintConflictSprintNames,
  formatLevelWarning,
} from "./i18n.js";
import { buildHolidayMap, makeCalendar } from "./calendar.js";
import { runCPM, buildDisplaySchedule } from "./scheduling.js";
import { detectDependencyIssues } from "./dependencyIssues.js";
import { detectSprintConflicts } from "./sprints.js";

/** カタログの葉（メッセージ）を "a.b.c" のキーで列挙する。 */
function flatten(obj, prefix = "", out = {}) {
  Object.entries(obj).forEach(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, out);
    else out[key] = v;
  });
  return out;
}

/** メッセージが使う引数名（{name}・{date, date, ymd}・{count, plural, ...} の name/date/count）。 */
function argNames(message) {
  return [...new Set([...message.matchAll(/\{\s*([A-Za-z_]\w*)\s*[,}]/g)].map(m => m[1]))].sort();
}

const JAPANESE = /[぀-ヿ一-鿿！-～]/;
const ja = flatten(MESSAGES.ja);
const en = flatten(MESSAGES.en);

describe("メッセージカタログ", () => {
  it("ja.json と en.json のキーが一致している", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ja).sort());
  });

  it("すべての値が文字列で、同じキーは同じ引数を使う", () => {
    Object.keys(ja).forEach(key => {
      expect(typeof ja[key], key).toBe("string");
      expect(typeof en[key], key).toBe("string");
      expect(argNames(en[key]), key).toEqual(argNames(ja[key]));
    });
  });

  it("すべてのメッセージを use-intl（UIの実行環境）で書式化でき、createAppTranslator の結果が一致する（両言語）", () => {
    // 引数の型（{x, date, ...}・{x, number}・{x, plural, ...}・それ以外は文字列）に合わせた値を渡す。
    const valueFor = (message, name) => {
      const m = new RegExp(`\\{\\s*${name}\\s*,\\s*(\\w+)`).exec(message);
      if (!m) return `<${name}>`;
      return m[1] === "date" ? new Date(Date.UTC(2026, 8, 26)) : 2;
    };
    LOCALES.forEach(locale => {
      const errors = [];
      const intlT = createTranslator({
        locale, messages: MESSAGES[locale], formats: FORMATS[locale], timeZone: TIME_ZONE,
        onError: e => errors.push(`${locale}: ${e.message}`),
      });
      const appT = createAppTranslator(locale);
      const messages = flatten(MESSAGES[locale]);
      Object.keys(ja).forEach(key => {
        const message = messages[key];
        const args = Object.fromEntries(argNames(message).map(a => [a, valueFor(message, a)]));
        const tags = /<[a-z]+>/.test(message);
        const out = tags ? intlT.markup(key, { ...args, file: c => c, b: c => c }) : intlT(key, args);
        if (out === key || /\{|\}/.test(out)) errors.push(`${locale}:${key} -> ${out}`);
        // リッチテキスト（タグ付き）は App でしか使わないため、lib 側の一致確認はタグなしのメッセージに限る
        if (!tags) expect(appT(key, args), `${locale}:${key}`).toBe(out);
      });
      expect(errors).toEqual([]);
    });
  });

  it("createAppTranslator は見つからないキーをそのまま返し、t.has で有無を判定できる", () => {
    const t = createAppTranslator("en");
    expect(t("no.such.key")).toBe("no.such.key");
    expect(t("common")).toBe("common"); // 名前空間（オブジェクト）は文言ではない
    expect(t.has("common.close")).toBe(true);
    expect(t.has("common")).toBe(false);
    expect(createAppTranslator("xx")("common.close")).toBe("閉じる"); // 未対応の言語は既定（日本語）
  });

  it("英語カタログに日本語が残っていない（言語名「日本語」を除く）", () => {
    const leftovers = Object.entries(en)
      .filter(([key]) => key !== "header.languageName.ja")
      .filter(([, v]) => JAPANESE.test(v))
      .map(([key]) => key);
    expect(leftovers).toEqual([]);
  });

  it("catalogValues は全言語の値を集める", () => {
    expect(catalogValues("wbs.milestoneMode.fixed")).toEqual(["固定", "Fixed"]);
    expect(catalogValues("no.such.key")).toEqual([]);
  });
});

describe("言語の判定", () => {
  it("navigator.language が ja* なら日本語、それ以外は英語", () => {
    expect(detectLocale("ja")).toBe("ja");
    expect(detectLocale("ja-JP")).toBe("ja");
    expect(detectLocale("JA-jp")).toBe("ja");
    expect(detectLocale("en-US")).toBe("en");
    expect(detectLocale("fr")).toBe("en");
    expect(detectLocale("jav")).toBe("en");
    expect(detectLocale("")).toBe("en");
    expect(detectLocale(undefined)).toBe("en");
  });

  it("保存値は対応言語だけを受け付ける", () => {
    expect(normalizeLocale("ja")).toBe("ja");
    expect(normalizeLocale("en")).toBe("en");
    expect(normalizeLocale("fr")).toBe(null);
    expect(normalizeLocale(null)).toBe(null);
    expect(normalizeLocale({ locale: "ja" })).toBe(null);
  });
});

describe("日付の書式", () => {
  it("日本語は従来の fmtJP と同じ YYYY/MM/DD、英語は月名つき", () => {
    expect(createAppTranslator("ja")("header.projectEnd", { date: "x" })).toBe("完了予定 x");
    expect(createAppTranslator("ja")("sprintConflicts.reason.finishAfterSprint", { finish: dateArg("2026-09-26"), sprintEnd: dateArg("2026-01-05") }))
      .toBe("終了日（2026/09/26）がスプリント終了日（2026/01/05）を超えています");
    expect(createAppTranslator("en")("sprintConflicts.reason.finishAfterSprint", { finish: dateArg("2026-09-26"), sprintEnd: dateArg("2026-01-05") }))
      .toBe("The finish date (Sep 26, 2026) is after the sprint end date (Jan 5, 2026)");
  });

  it("名前付きの書式: 日本語は従来の表示（YYYY/MM/DD・MM/DD・曜日1文字・N月）と同じ", () => {
    const fmt = (locale, iso, name) => new Intl.DateTimeFormat(locale, { ...FORMATS[locale].dateTime[name], timeZone: "UTC" }).format(dateArg(iso));
    expect(fmt("ja", "2024-01-09", "ymd")).toBe("2024/01/09");
    expect(fmt("ja", "2024-01-09", "md")).toBe("01/09");
    expect(fmt("ja", "2024-01-09", "weekday")).toBe("火");
    expect(fmt("ja", "2024-01-09", "weekdayNarrow")).toBe("火");
    expect(fmt("ja", "2024-01-09", "month")).toBe("1月");
    expect(fmt("en", "2024-01-09", "ymd")).toBe("Jan 9, 2024");
    expect(fmt("en", "2024-01-09", "md")).toBe("Jan 9");
    expect(fmt("en", "2024-01-09", "weekday")).toBe("Tue");
    expect(fmt("en", "2024-01-09", "month")).toBe("Jan");
    // 表の列用（幅が限られる箇所）: 日本語は ymd と同じ、英語は数字だけ
    expect(fmt("ja", "2024-01-09", "ymdNumeric")).toBe("2024/01/09");
    expect(fmt("en", "2024-01-09", "ymdNumeric")).toBe("01/09/2024");
  });

  it("日付は UTC として扱い、実行環境のタイムゾーンで前日にずれない", () => {
    expect(createAppTranslator("ja")("dependencyIssues.message.overrunDisplay", { actual: dateArg("2024-01-01"), fixedDate: dateArg("2023-12-31") }))
      .toBe("表示中の日程（2024/01/01）が固定期日（2023/12/31）を超過しています");
  });
});

describe("src/lib のコード＋パラメータの翻訳", () => {
  const tJa = createAppTranslator("ja");
  const tEn = createAppTranslator("en");
  const cal = makeCalendar(buildHolidayMap(2024, 2024));

  function scheduleOf(tasks, resources = [], sprints = [], leveling = false) {
    const cpm = runCPM(tasks, cal, "2024-01-09", sprints);
    return buildDisplaySchedule(tasks, cpm.result, resources, cal, sprints, { leveling });
  }

  it("依存関係の矛盾（全種別）を日本語・英語で表示できる", () => {
    const tasks = [
      { id: "X", name: "設計", parentId: null, order: 0, startDate: "2024-01-09", duration: 2, predecessors: [] },
      { id: "Y", name: "実装", parentId: null, order: 1, startDate: "2024-01-10", duration: 2, predecessors: [{ id: "X", type: "FS", lag: 0 }, { id: "gone", type: "FS", lag: 0 }] },
      { id: "S", name: "", parentId: null, order: 2, startDate: "2024-01-09", duration: 1, predecessors: [{ id: "S", type: "FS", lag: 0 }] },
      { id: "A", name: "A", parentId: null, order: 3, duration: 1, predecessors: [{ id: "B", type: "FS", lag: 0 }] },
      { id: "B", name: "", parentId: null, order: 4, duration: 1, predecessors: [{ id: "A", type: "FS", lag: 0 }] },
      { id: "M", name: "M", parentId: null, order: 5, milestone: true, milestoneMode: "fixed", fixedDate: "2024-01-09", startDate: "2024-01-09", duration: 0, predecessors: [{ id: "Y", type: "FS", lag: 0 }] },
    ];
    const { schedule } = scheduleOf(tasks);
    const issues = detectDependencyIssues(tasks, schedule, cal);
    const byCode = Object.fromEntries(issues.map(i => [i.code, i]));
    expect(Object.keys(byCode).sort()).toEqual([
      "dependency-cycle", "dependency-violation", "fixed-milestone-overrun", "predecessor-missing", "self-dependency",
    ]);

    expect(formatDependencyIssueMessage(tJa, byCode["dependency-cycle"])).toBe("循環参照: 「A」→「（無題のタスク）」→「A」");
    expect(formatDependencyIssueMessage(tEn, byCode["dependency-cycle"])).toBe("Circular dependency: \"A\" → \"(untitled task)\" → \"A\"");
    expect(formatDependencyIssueMessage(tJa, byCode["predecessor-missing"])).toContain("先行タスク「gone」が存在しません");
    expect(formatDependencyIssueMessage(tEn, byCode["predecessor-missing"])).toContain("Predecessor \"gone\" does not exist");
    expect(formatDependencyIssueMessage(tEn, byCode["dependency-violation"]))
      .toBe("Predecessor \"設計\" (FS) requires a start on or after Jan 11, 2024, but the task starts on Jan 10, 2024");
    expect(formatDependencyIssueMessage(tEn, byCode["fixed-milestone-overrun"])).toContain("is after the fixed date (Jan 9, 2024)");

    issues.forEach(issue => {
      const text = `${dependencyIssueLabel(tEn, issue.code)}: ${formatDependencyIssueMessage(tEn, issue)}`;
      // タスク名（ユーザー入力）以外に日本語が混ざらない
      expect(text.replace(/設計|実装/g, ""), issue.code).not.toMatch(JAPANESE);
      expect(formatDependencyIssueMessage(tJa, issue)).toMatch(JAPANESE);
    });
    expect(dependencyIssueLabel(tJa, "self-dependency")).toBe("循環参照（自己依存）");
    expect(dependencyIssueLabel(tEn, "unknown-code")).toBe("unknown-code");
  });

  it("スプリント矛盾の理由・スプリント名を翻訳できる", () => {
    const sprints = [
      { id: "s1", name: "", theme: "", startDate: "2024-01-15", endDate: "2024-01-16", order: 0 },
      { id: "s2", name: "S2", startDate: "2024-01-15", endDate: "2024-01-16", order: 1 },
    ];
    const tasks = [{ id: "t", name: "T", parentId: null, order: 0, startDate: "2024-01-09", duration: 10, sprintIds: ["s1", "s2"], predecessors: [] }];
    const conflicts = detectSprintConflicts(tasks, sprints, new Map([["t", { schedStart: "2024-01-09", schedFinish: "2024-01-22" }]]));
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].sprintNames).toEqual([null, "S2"]);
    expect(formatSprintConflictSprintNames(tJa, conflicts[0])).toBe("（無題のスプリント）、S2");
    expect(formatSprintConflictSprintNames(tEn, conflicts[0])).toBe("(untitled sprint), S2");
    expect(conflicts[0].reasons.map(r => formatSprintConflictReason(tEn, r))).toEqual([
      "The start date (Jan 9, 2024) is before the sprint start date (Jan 15, 2024)",
      "The finish date (Jan 22, 2024) is after the sprint end date (Jan 16, 2024)",
    ]);
  });

  it("リソース平準化の警告を翻訳できる（日本語は従来の文言）", () => {
    const tasks = [{ id: "T", name: "大きなタスク", parentId: null, order: 0, startDate: "2024-01-09", duration: 500, assigneeId: "r1", predecessors: [] }];
    const resources = [{ id: "r1", name: "R1", weeklyCapacity: 1, monthlyCapacity: 0 }];
    const { levelWarnings } = scheduleOf(tasks, resources, [], true);
    expect(levelWarnings).toHaveLength(1);
    expect(formatLevelWarning(tJa, levelWarnings[0])).toBe(
      "「大きなタスク」（担当者: R1、工数: 500人日）は、日次1人日・週次1人日の稼働上限内で割り当てきれませんでした（探索上限: 2,000稼働日）。"
      + "開始日を2024/01/09とし、連続する稼働日に配置していますが、稼働上限を超過しています。工数または稼働上限の見直しが必要です。"
    );
    expect(formatLevelWarning(tEn, levelWarnings[0])).toBe(
      "\"大きなタスク\" (assignee: R1, effort: 500 person-days) could not be allocated within the capacity limits "
      + "(1 person-day daily, 1 person-day weekly; search limit: 2,000 workdays). It is placed on consecutive workdays starting Jan 9, 2024 "
      + "and exceeds the capacity limits. Review the effort or the capacity limits."
    );
  });
});
