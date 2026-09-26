/* =========================================================================================
   多言語対応（i18n）の共通設定
   ------------------------------------------------------------------------------------------
   UI の文言は src/messages/<locale>.json（next-intl 形式のメッセージカタログ・ICU MessageFormat）に置き、
   React 側は use-intl の IntlProvider / useTranslations、React 以外（CLI・テスト）は同じカタログから
   createAppTranslator で翻訳関数を作る（カタログを二重管理しない）。

   このモジュールは React に依存しない。use-intl の createTranslator（use-intl/core）はリッチテキスト対応のため
   react を import しており、src/lib/ から使うと React に依存する（CLI のバンドルにも React が入る）ため、
   use-intl が内部で使っている ICU MessageFormat の実装（intl-messageformat）を同じ設定（名前付き書式・
   タイムゾーン）で直接使う。use-intl の翻訳結果と一致することは i18n.test.js で全キーについて確認している。

   src/lib/ の他のモジュールは表示用の文字列を組み立てず、コードとパラメータを返す。
   それを文言にする関数（formatDependencyIssueMessage など）はここに集め、App と CLI の両方から使う。
   ========================================================================================= */

import { IntlMessageFormat } from "intl-messageformat";
import ja from "../messages/ja.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import { parseISO } from "./calendar.js";

/** 対応言語（先頭が既定）。 */
export const LOCALES = Object.freeze(["ja", "en"]);
export const DEFAULT_LOCALE = "ja";
/** 選択した表示言語を保存する window.storage のキー（pm_project とは別。Project JSON には含めない）。 */
export const UI_LOCALE_STORAGE_KEY = "pm_ui_locale";

/** 言語ごとのメッセージカタログ。 */
export const MESSAGES = Object.freeze({ ja, en });

/**
 * 日付（YYYY-MM-DD）は UTC の0時として扱うため、既定のタイムゾーンは UTC にする。
 * 保存日時など「時刻」を表示する書式（dateTime・dateTimeShort）だけは、実行環境のタイムゾーンで表示する。
 */
export const TIME_ZONE = "UTC";

function localTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined; } catch (e) { return undefined; }
}

/**
 * 名前付きの書式（メッセージ内の {date, date, ymd} や useFormatter().dateTime(date, "ymd") で使う）。
 * 日本語は従来の表示（2026/09/26・09/26・土・9月）と同じ結果になる指定にしている。
 */
function buildFormats(locale) {
  const tz = localTimeZone();
  const common = {
    // 表の列など幅が限られる箇所の日付（日本語は ymd と同じ「2026/09/26」、英語は「09/26/2026」）
    ymdNumeric: { year: "numeric", month: "2-digit", day: "2-digit" },
    // 保存日時など（日本語は従来の toLocaleString("ja-JP") と同じ「2026/9/26 9:41:30」）
    dateTime: { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: tz },
    // 共有用HTMLの書き出し日時（日本語は「2026/09/26 09:41」）
    dateTimeShort: { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: tz },
  };
  if (locale === "ja") {
    return {
      dateTime: {
        ymd: { year: "numeric", month: "2-digit", day: "2-digit" },
        md: { month: "2-digit", day: "2-digit" },
        weekday: { weekday: "short" },
        weekdayNarrow: { weekday: "short" },
        month: { month: "short" },
        ...common,
      },
    };
  }
  return {
    dateTime: {
      ymd: { year: "numeric", month: "short", day: "numeric" },
      md: { month: "short", day: "numeric" },
      weekday: { weekday: "short" },
      weekdayNarrow: { weekday: "narrow" },
      month: { month: "short" },
      ...common,
    },
  };
}

/** 言語ごとの名前付き書式。IntlProvider の formats にも同じものを渡す。 */
export const FORMATS = Object.freeze(Object.fromEntries(LOCALES.map(l => [l, buildFormats(l)])));

/** 対応言語ならその値を、そうでなければ null を返す（保存値の検証用）。 */
export function normalizeLocale(value) {
  return LOCALES.includes(value) ? value : null;
}

/** ブラウザの言語（navigator.language）から初期表示の言語を決める（ja* なら日本語、それ以外は英語）。 */
export function detectLocale(languageTag) {
  return /^ja(\b|-|_|$)/i.test(String(languageTag || "")) ? "ja" : "en";
}

/**
 * 起動時の表示言語。ページで固定した言語（Live Demo の /ja/・/en/。src/lib/localizedPages.js）→
 * 保存済みの選択（pm_ui_locale）→ ブラウザの言語の順に決める。
 */
export function resolveInitialLocale({ pageLocale, savedLocale, browserLanguage } = {}) {
  return normalizeLocale(pageLocale) || normalizeLocale(savedLocale) || detectLocale(browserLanguage);
}

/**
 * FORMATS（use-intl 形式の dateTime/number）を intl-messageformat の形式（date/time/number）に変換する。
 * use-intl の convertFormatsToIntlMessageFormat と同じく、タイムゾーンを指定していない日付書式には TIME_ZONE を補う。
 */
function toMessageFormatFormats(formats) {
  const withZone = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, { timeZone: TIME_ZONE, ...v }]));
  return {
    date: withZone({ ...IntlMessageFormat.formats.date, ...formats.dateTime }),
    time: withZone({ ...IntlMessageFormat.formats.time, ...formats.dateTime }),
    number: { ...(formats.number || {}) },
  };
}

function lookup(messages, key) {
  return key.split(".").reduce((obj, k) => (obj == null ? undefined : obj[k]), messages);
}

/**
 * React 以外（CLI・テスト）から使う翻訳関数。App 側の useTranslations() と同じカタログ・書式で、
 * t(key, values)・t.has(key) の同じ呼び出し方ができる（下の format* 関数は両方から使う）。
 * 見つからないキーはキーそのものを返す（use-intl の既定のフォールバックと同じ）。
 */
export function createAppTranslator(locale = DEFAULT_LOCALE) {
  const l = normalizeLocale(locale) || DEFAULT_LOCALE;
  const messages = MESSAGES[l];
  const formats = toMessageFormatFormats(FORMATS[l]);
  const cache = new Map();
  function t(key, values) {
    const message = lookup(messages, key);
    if (typeof message !== "string") return key;
    let mf = cache.get(key);
    if (!mf) {
      mf = new IntlMessageFormat(message, l, formats);
      cache.set(key, mf);
    }
    const out = mf.format(values);
    return Array.isArray(out) ? out.join("") : String(out);
  }
  t.has = key => typeof lookup(messages, key) === "string";
  return t;
}

/** YYYY-MM-DD をメッセージの日付引数（Date）にする。空値は null。 */
export function dateArg(iso) {
  return iso ? parseISO(iso) : null;
}

/** "a.b.c" 形式のキーで、全言語のカタログの値を集める（貼り付け時にどちらの言語の表記も受け付けるため）。 */
export function catalogValues(key) {
  return LOCALES.map(l => key.split(".").reduce((obj, k) => (obj == null ? undefined : obj[k]), MESSAGES[l]))
    .filter(v => typeof v === "string");
}

/* -------------------------------------------------------------------------------------------
   src/lib/ が返すコード＋パラメータを文言にする（App・CLI 共通）
   ------------------------------------------------------------------------------------------- */

/** タスク名（空なら「（無題のタスク）」）。lib 側は名前が空のとき null を返す。 */
export function taskNameText(t, name) {
  return name == null || name === "" ? t("common.untitledTask") : name;
}

/**
 * 依存関係の矛盾（src/lib/dependencyIssues.js の DependencyIssue）の表示用メッセージ。
 * 循環以外は対象タスク自身の名前を含まない（WBS表の行ツールチップ・一覧ダイアログで行に並べて表示するため）。
 */
export function formatDependencyIssueMessage(t, issue) {
  const p = issue.params || {};
  const name = n => taskNameText(t, n);
  switch (issue.code) {
    case "dependency-cycle": {
      const route = (p.route || []).map(r => t("dependencyIssues.quoted", { name: name(r.name) })).join(t("dependencyIssues.arrow"));
      const notes = (p.memberEdges || []).map(e => t("dependencyIssues.cycleMemberNote", { child: name(e.childName), parent: name(e.parentName) }));
      return notes.length
        ? t("dependencyIssues.message.cycleWithNotes", { route, notes: notes.join(t("common.listSeparator")) })
        : t("dependencyIssues.message.cycle", { route });
    }
    case "self-dependency":
      return t("dependencyIssues.message.self");
    case "predecessor-missing":
      return t("dependencyIssues.message.missing", { predecessorId: p.predecessorId });
    case "dependency-violation":
      return t(p.side === "finish" ? "dependencyIssues.message.violationFinish" : "dependencyIssues.message.violationStart", {
        predName: name(p.predName), label: p.label, required: dateArg(p.required), actual: dateArg(p.actual),
      });
    case "fixed-milestone-overrun":
      return p.predName !== undefined
        ? t("dependencyIssues.message.overrunEarliest", { predName: name(p.predName), earliest: dateArg(p.earliest), fixedDate: dateArg(p.fixedDate) })
        : t("dependencyIssues.message.overrunDisplay", { actual: dateArg(p.actual), fixedDate: dateArg(p.fixedDate) });
    default:
      return issue.code;
  }
}

/** 依存関係の矛盾の種別ラベル（循環参照・開始日との矛盾など）。 */
export function dependencyIssueLabel(t, code) {
  const key = `dependencyIssues.label.${code}`;
  return t.has(key) ? t(key) : code;
}

/** スプリント矛盾の理由（src/lib/sprints.js の detectSprintConflicts の reasons の各要素）。 */
export function formatSprintConflictReason(t, reason) {
  const p = reason.params || {};
  switch (reason.code) {
    case "start-before-sprint":
      return t("sprintConflicts.reason.startBeforeSprint", { start: dateArg(p.start), sprintStart: dateArg(p.sprintStart) });
    case "finish-after-sprint":
      return t("sprintConflicts.reason.finishAfterSprint", { finish: dateArg(p.finish), sprintEnd: dateArg(p.sprintEnd) });
    case "governed-by-fixed-milestone":
      return t("sprintConflicts.reason.governed");
    default:
      return reason.code;
  }
}

/** スプリント矛盾の対象スプリント名（複数は列挙）。名前・テーマとも空なら「（無題のスプリント）」。 */
export function formatSprintConflictSprintNames(t, conflict) {
  return (conflict.sprintNames || [])
    .map(n => (n == null || n === "" ? t("common.untitledSprint") : n))
    .join(t("common.listSeparator"));
}

/** リソース平準化の警告（src/lib/scheduling.js の levelResources の warnings の各要素）。 */
export function formatLevelWarning(t, warning) {
  const p = warning.params || {};
  if (warning.code !== "capacity-exceeded") return warning.code;
  const limits = [t("levelWarnings.limit.daily", { value: p.dailyCapacity })];
  if (p.weeklyCapacity) limits.push(t("levelWarnings.limit.weekly", { value: p.weeklyCapacity }));
  if (p.monthlyCapacity) limits.push(t("levelWarnings.limit.monthly", { value: p.monthlyCapacity }));
  return t("levelWarnings.capacityExceeded", {
    taskName: p.taskName ?? "", resourceName: p.resourceName ?? "", duration: p.duration,
    limits: limits.join(t("levelWarnings.limitSeparator")),
    searchWorkdays: p.searchWorkdays, start: dateArg(p.start),
  });
}
