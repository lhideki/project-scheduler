import { normalizeProjectName } from "./projectName.js";
import { buildFlatList } from "./taskTree.js";
import { MESSAGES, DEFAULT_LOCALE } from "./i18n.js";
import { hasFullVersionSnapshot } from "./versionSnapshot.js";

import { PROJECT_SCHEMA_VERSION, validateProjectData, analyzeIntegrity, isBlockingProjectIssue } from "./projectValidation.js";

export { PROJECT_SCHEMA_VERSION } from "./projectValidation.js";

export const PROJECT_JSON_SCHEMA = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://lhideki.github.io/project-scheduler/schema/project-export-v1.json",
  title: "Project Scheduler export",
  description: "Project Scheduler の「書き出し」「読み込み」で使うJSON形式です。",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "exportedAt", "tasks", "resources", "sprints", "versions"],
  properties: {
    schemaVersion: { type: "integer", const: PROJECT_SCHEMA_VERSION, description: "保存フォーマットのスキーマバージョン" },
    exportedAt: { type: "string", format: "date-time", description: "エクスポート日時（ISO 8601）" },
    projectName: { type: "string", default: "", description: "表示用のプロジェクト名（任意）。前後の空白を除き、未設定・空白のみは空文字列として保持します。翻訳された既定表示名は保存しません。ID・保存先・ファイル名ではなく、日程バージョンの復元対象外です。" },
    tasks: { type: "array", description: "タスク一覧", items: { $ref: "#/$defs/task" } },
    resources: { type: "array", description: "担当者一覧", items: { $ref: "#/$defs/resource" } },
    sprints: { type: "array", description: "スプリント一覧", items: { $ref: "#/$defs/sprint" } },
    versions: { type: "array", description: "保存済みバージョン一覧", items: { $ref: "#/$defs/version" } },
    levelingOn: { type: "boolean", default: false, description: "リソース平準化の有効/無効（旧形式のJSONには存在せず、その場合は false 扱い）" },
    calendarExceptions: {
      type: "array",
      description: "非稼働日カレンダーの例外（休日・稼働日の上書き指定）。旧形式のJSONには存在せず、その場合は空配列扱い。",
      items: { $ref: "#/$defs/calendarException" },
    },
  },
  $defs: {
    calendarException: {
      type: "object",
      description: "非稼働日カレンダーの例外です。土日・日本の祝日の計算結果に対する上書き指定です。",
      additionalProperties: false,
      required: ["date", "type"],
      properties: {
        date: { type: "string", format: "date", description: "対象日（YYYY-MM-DD）" },
        type: {
          type: "string",
          enum: ["holiday", "workday"],
          description: "holiday（休日）: 平日を非稼働日にする / workday（稼働日）: 土日・祝日・休日指定を稼働日にする（最優先）",
        },
        name: { type: "string", description: "表示用ラベル（任意）" },
      },
    },
    dependency: {
      type: "object",
      description: "先行タスクを表すオブジェクトです。",
      additionalProperties: false,
      required: ["id", "type", "lag"],
      properties: {
        id: { type: "string", description: "先行タスクID。繰り返しシリーズの場合、occurrenceDate未指定は有限の計算対象期間全体への依存です。" },
        occurrenceDate: { type: "string", format: "date", description: "特定回の元の日付（YYYY-MM-DD）。日程修正後もこの識別子を変更しません。" },
        type: { type: "string", enum: ["FS", "SS", "FF", "SF"], description: "依存関係の種類" },
        lag: { type: "number", description: "リード/ラグ日数" },
      },
    },
    recurrence: {
      type: "object", additionalProperties: false, required: ["frequency", "interval"],
      description: "通常の末端タスクに設定する繰り返し規則。task.startDateが必須の起点。各回は暦日で固定し、自動スケジューリング・休日補正の対象外です。",
      properties: {
        frequency: { type: "string", enum: ["daily", "weekly", "monthly"], description: "日・週・月単位" },
        interval: { type: "integer", minimum: 1, maximum: 365, description: "間隔。1=毎回、2=隔日・隔週・隔月" },
        weekdays: { type: "array", uniqueItems: true, minItems: 1, items: { type: "integer", minimum: 0, maximum: 6 }, description: "週単位の対象曜日（0=日、1=月…6=土）。省略時は開始日の曜日。週の起点は開始日を含む月曜日です。" },
        monthDay: { type: "string", enum: ["day", "start", "end"], description: "月単位の日付。day=開始日と同じ日（存在しない月は月末）、start=暦月初、end=暦月末。開始日より前は生成しません。" },
        endDate: { type: "string", format: "date", description: "繰り返し終了日（その日を含む）。開始日以上で任意。元の予定日を基準に判定します。" },
        calculationEndDate: { type: "string", format: "date", description: "終了日なしの有限計算期間。省略時は開始日の1周年の前日。現在日付・表示範囲には依存しません。開始日から最大3,660暦日・1シリーズ最大2,000回で打ち切りを警告します。" },
      },
    },
    occurrenceOverride: {
      type: "object", additionalProperties: false,
      description: "元の予定日をキーとする個別修正。規則変更で対象外になった修正は保持し、別の回へ付け替えません。",
      properties: {
        startDate: { type: "string", format: "date", description: "この回のみの固定開始日" },
        endDate: { type: "string", format: "date", description: "この回のみの固定終了日（開始日以上、両端を含む、最大3,660暦日）" },
        predecessors: { type: "array", items: { $ref: "#/$defs/dependency" }, description: "この回の先行タスク。省略時はシリーズ共通、指定時は共通設定を置き換えます。空配列は依存なし。" },
      },
    },
    task: {
      type: "object",
      description: "WBS上のタスクです。階層は parentId で表現します。",
      allOf: [{ if: { required: ["recurrence"] }, then: { required: ["startDate"], properties: { milestone: { const: false }, duration: { maximum: 3660 } } } }],
      additionalProperties: true,
      required: ["id", "name", "parentId", "order"],
      properties: {
        id: { type: "string", not: { pattern: "^@recurrence:" }, description: "タスクID。内部生成用の@recurrence:接頭辞は使用できません。" },
        name: { type: "string", description: "タスク名" },
        parentId: { type: ["string", "null"], description: "親タスクID。ルート直下は null" },
        order: { type: "number", description: "同じ親配下での表示順" },
        startDate: { type: "string", format: "date", description: "開始日（YYYY-MM-DD）" },
        duration: { type: "number", description: "工数。マイルストーンは通常0。繰り返しでは各回の工数で、既定期間は切り上げ日数の暦日（最大3,660日）です。" },
        recurrence: { $ref: "#/$defs/recurrence", description: "繰り返し規則（任意）。通常の末端タスクのみ。" },
        occurrenceOverrides: { type: "object", propertyNames: { format: "date" }, additionalProperties: { $ref: "#/$defs/occurrenceOverride" }, description: "各回の元の予定日をキーとする修正情報。日程を変えてもキーは不変です。" },
        assigneeId: { type: ["string", "null"], description: "担当者ID" },
        sprintIds: { type: "array", description: "紐付けるスプリントID一覧", items: { type: "string" } },
        predecessors: { type: "array", description: "先行タスク一覧", items: { $ref: "#/$defs/dependency" } },
        progress: { type: "number", description: "進捗率（0〜100）" },
        milestone: { type: "boolean", description: "マイルストーンかどうか" },
        milestoneMode: { type: "string", enum: ["flexible", "fixed"], description: "柔軟/固定モード" },
        fixedDate: { type: "string", format: "date", description: "固定マイルストーンの日付（YYYY-MM-DD）" },
        savedDuration: { type: "number", description: "マイルストーン化前の工数退避値" },
        notes: { type: "string", description: "詳細メモ" },
        diagX: { type: "number", description: "ネットワーク図の手動X座標" },
        diagY: { type: "number", description: "ネットワーク図の手動Y座標" },
      },
    },
    resource: {
      type: "object",
      description: "担当者リソースです。",
      additionalProperties: false,
      required: ["id", "name", "weeklyCapacity", "monthlyCapacity"],
      properties: {
        id: { type: "string", description: "担当者ID" },
        name: { type: "string", description: "表示名" },
        weeklyCapacity: { type: "number", description: "週次稼働上限" },
        monthlyCapacity: { type: "number", description: "月次稼働上限" },
      },
    },
    sprint: {
      type: "object",
      description: "スプリント定義です。",
      additionalProperties: false,
      required: ["id", "name", "startDate", "endDate", "order"],
      properties: {
        id: { type: "string", description: "スプリントID" },
        name: { type: "string", description: "スプリント名" },
        theme: { type: "string", description: "テーマ" },
        startDate: { type: "string", format: "date", description: "開始日（YYYY-MM-DD）" },
        endDate: { type: "string", format: "date", description: "終了日（YYYY-MM-DD）" },
        order: { type: "number", description: "表示順" },
      },
    },
    occurrenceSnapshot: {
      type: "object", required: ["occurrenceDate", "schedStart", "schedFinish"],
      properties: {
        occurrenceDate: { type: "string", format: "date", description: "識別用の元の予定日" },
        schedStart: { type: "string", format: "date", description: "保存時点の開始日" },
        schedFinish: { type: "string", format: "date", description: "保存時点の終了日" },
      },
    },
    versionTask: {
      type: "object",
      description: "バージョン比較表示用のタスクスナップショットです。",
      additionalProperties: true,
      required: ["id", "name", "level", "wbsNo", "hasChildren", "critical", "milestone", "assigneeId", "progress"],
      properties: {
        id: { type: "string", description: "タスクID" },
        name: { type: "string", description: "タスク名" },
        level: { type: "number", description: "WBS階層レベル" },
        wbsNo: { type: "string", description: "WBS番号" },
        hasChildren: { type: "boolean", description: "子タスクの有無" },
        occurrences: { type: "array", items: { $ref: "#/$defs/occurrenceSnapshot" }, description: "繰り返し各回の比較表示用日程（任意）" },
        schedStart: { type: "string", format: "date", description: "計算後開始日（YYYY-MM-DD）" },
        schedFinish: { type: "string", format: "date", description: "計算後終了日（YYYY-MM-DD）" },
        critical: { type: "boolean", description: "クリティカルかどうか" },
        milestone: { type: "boolean", description: "マイルストーンかどうか" },
        duration: { type: ["number", "null"], description: "保存時点の工数" },
        assigneeId: { type: ["string", "null"], description: "担当者ID" },
        progress: { type: "number", description: "進捗率" },
      },
    },
    version: {
      type: "object",
      description: "比較表示用スナップショットと復元用完全スナップショットを持つ保存済みバージョンです。",
      additionalProperties: true,
      required: ["id", "name", "createdAt", "tasks", "hasWbsInfo", "hasFullSnapshot"],
      properties: {
        id: { type: "string", description: "バージョンID" },
        name: { type: "string", description: "バージョン名" },
        createdAt: { type: "number", description: "保存時刻（Unixミリ秒）" },
        tasks: { type: "array", description: "比較表示用のタスク配列", items: { $ref: "#/$defs/versionTask" } },
        hasWbsInfo: { type: "boolean", description: "WBS比較用情報を含むか" },
        rawTasks: { type: "array", description: "復元用の完全な tasks", items: { $ref: "#/$defs/task" } },
        rawResources: { type: "array", description: "復元用の完全な resources", items: { $ref: "#/$defs/resource" } },
        rawSprints: { type: "array", description: "復元用の完全な sprints", items: { $ref: "#/$defs/sprint" } },
        rawCalendarExceptions: { type: "array", description: "復元用の完全な calendarExceptions（この項目が無い古いスナップショットは復元時に空配列扱い）", items: { $ref: "#/$defs/calendarException" } },
        rawLevelingOn: { type: "boolean", description: "保存時のリソース平準化条件。この項目が無い古いスナップショットは元の条件が不明なため、復元時の現在値を維持する（日程の完全な再現は保証しない）。" },
        hasFullSnapshot: { type: "boolean", description: "復元に必要な raw*（rawTasks/rawResources/rawSprints）が揃っているか" },
      },
    },
  },
});

function cloneJSON(value) {
  return JSON.parse(JSON.stringify(value));
}

function rejectInvalidProject(issues) {
  if (!issues.some(isBlockingProjectIssue)) return;
  const error = new Error("invalid_project_json");
  error.issues = issues;
  throw error;
}

function cloneVersionSnapshots(versions) {
  return cloneJSON(versions).map(version => {
    // Export is also an emergency backup. Preserve invalid entries so the user can
    // save their current data and repair it, rather than failing or silently dropping it.
    if (!version || typeof version !== "object" || Array.isArray(version)) return version;
    return {
      ...version,
      hasFullSnapshot: hasFullVersionSnapshot(version),
    };
  });
}

export function normalizeProjectVersions(versions, options = {}) {
  const issues = analyzeIntegrity({ versions }, options);
  if (!Array.isArray(versions) && !issues.length) {
    issues.push({ severity: "error", code: "versions-invalid", path: "versions", messageKey: "projectValidation.array", params: {} });
  }
  rejectInvalidProject(issues);
  return cloneVersionSnapshots(versions);
}

/** 現行の正規化済みJSONエクスポートデータを組み立てる。 */
export function buildProjectExport(tasks, resources, sprints = [], versions = [], levelingOn = false, calendarExceptions = [], projectName = "") {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    projectName: normalizeProjectName(projectName),
    tasks: cloneJSON(Array.isArray(tasks) ? tasks : []),
    resources: cloneJSON(Array.isArray(resources) ? resources : []),
    sprints: cloneJSON(Array.isArray(sprints) ? sprints : []),
    versions: cloneVersionSnapshots(Array.isArray(versions) ? versions : []),
    levelingOn: !!levelingOn,
    calendarExceptions: cloneJSON(Array.isArray(calendarExceptions) ? calendarExceptions : []),
  };
}

/**
 * JSONインポートで受け取ったデータを検証・正規化する。
 * 現行スキーマのみ受け付け、旧形式へのフォールバックは行わない。
 */
export function normalizeImportedProject(data, options = {}) {
  rejectInvalidProject(validateProjectData(data, options));
  return {
    schemaVersion: data.schemaVersion,
    exportedAt: data.exportedAt,
    projectName: normalizeProjectName(data.projectName),
    tasks: cloneJSON(data.tasks),
    resources: cloneJSON(data.resources),
    sprints: cloneJSON(data.sprints),
    versions: cloneVersionSnapshots(data.versions),
    levelingOn: data.levelingOn === undefined ? false : data.levelingOn,
    calendarExceptions: data.calendarExceptions === undefined ? [] : cloneJSON(data.calendarExceptions),
  };
}

/** Prepare the complete next project before touching application state.
 * Imported version IDs win; local-only versions remain. An empty imported list
 * keeps the existing order, matching the original import behavior.
 */
export function prepareProjectImport(raw, currentVersions = [], { mergeVersions = true } = {}) {
  // Incoming data must always pass strict external validation first. Existing local
  // snapshots may contain the narrow editing states supported by local restoration.
  const data = normalizeImportedProject(raw);
  const localOptions = { allowEditingValues: true };
  if (mergeVersions) {
    const current = normalizeProjectVersions(currentVersions, localOptions);
    if (data.versions.length) {
      const versions = new Map(current.map(version => [version.id, version]));
      data.versions.forEach(version => versions.set(version.id, version));
      data.versions = normalizeProjectVersions([...versions.values()], localOptions).sort((a, b) => b.createdAt - a.createdAt);
    } else {
      data.versions = current;
    }
  }
  const issues = validateProjectData(data, localOptions);
  rejectInvalidProject(issues);
  return { data, issues };
}

/** テキストを Blob にしてブラウザのダウンロードとしてトリガーする。 */
export function downloadTextFile(filename, text, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** JSON を生成しブラウザのダウンロードとしてトリガーする（プロジェクトのエクスポート用） */
export function downloadJSON(filename, dataObj) {
  downloadTextFile(filename, JSON.stringify(dataObj, null, 2), "application/json");
}

/**
 * テキストをクリップボードにコピーする。file:// で開いた場合など navigator.clipboard が
 * 使えない（非セキュアコンテキスト）ケースに備え、隠しtextarea + execCommand へフォールバックする。
 */
export async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(ta);
  if (!ok) throw new Error("execCommand('copy') failed");
}

/** Mermaid のタイトル・名前が空のタスクの既定の表記（呼び出し側が表示中の言語の文言を渡さない場合。メッセージカタログの mermaid.*）。 */
const DEFAULT_MERMAID_LABELS = MESSAGES[DEFAULT_LOCALE].mermaid;

/** Mermaid のタスク名として問題になる記号（コロン・カンマ・改行）を除去する。空なら untitled（既定は「（無題）」）にする。 */
export function escapeMermaidText(str, untitled = DEFAULT_MERMAID_LABELS.untitled) {
  return String(str ?? "").replace(/[:,\n]/g, " ").replace(/\s+/g, " ").trim() || untitled;
}

/** Mermaid の task id として使える文字列に変換する（先頭は英字に揃える） */
export function toMermaidId(str) {
  const s = String(str ?? "").replace(/[^a-zA-Z0-9_]/g, "_");
  return /^[a-zA-Z]/.test(s) ? s : `t${s}`;
}

/**
 * 現在の WBS ツリーとスケジュール計算結果（CPM・固定マイルストーン・スプリント floor・
 * リソース平準化をすべて織り込んだ確定スケジュール）から Mermaid の gantt 記法テキストを生成する。
 * Mermaid 自身の依存解決（after）は使わず、schedStart/schedFinish をそのまま開始日・終了日として
 * 書き出すことで、このツールの計算結果を厳密に反映する。グループはセクション（section）として出力する。
 * labels にはタイトルと名前が空のタスクの表記を、表示中の言語の文言で渡す（省略時は日本語）。
 * @param {{title?: string, untitled?: string}} [labels]
 */
export function generateMermaidGantt(tasks, schedule, labels = {}) {
  const title = labels.title ?? DEFAULT_MERMAID_LABELS.title;
  const untitled = labels.untitled ?? DEFAULT_MERMAID_LABELS.untitled;
  const flatAll = buildFlatList(tasks, new Set());
  const lines = ["gantt", `    title ${escapeMermaidText(title, untitled)}`, "    dateFormat YYYY-MM-DD", ...(tasks.some(t => t.recurrence) ? [] : ["    excludes weekends"])];
  const usedIds = new Set();
  flatAll.forEach(t => {
    if (t.hasChildren) {
      lines.push(`    section ${escapeMermaidText(t.name, untitled)}`);
      return;
    }
    const s = schedule.get(t.id);
    if (!s || !s.schedStart || !s.schedFinish) return;
    (s.occurrences || [s]).forEach(occurrence => {
      let id = toMermaidId(`t${t.wbsNo || t.id}${occurrence.occurrenceDate ? "_" + occurrence.occurrenceDate : ""}`);
      if (usedIds.has(id)) {
        let i = 2;
        while (usedIds.has(`${id}_${i}`)) i++;
        id = `${id}_${i}`;
      }
      usedIds.add(id);
      const tags = [];
      if (t.milestone) tags.push("milestone");
      if (occurrence.critical) tags.push("crit");
      if ((t.progress || 0) >= 100) tags.push("done");
      else if ((t.progress || 0) > 0) tags.push("active");
      const tagStr = tags.length ? `${tags.join(", ")}, ` : "";
      const name = escapeMermaidText(`${t.name || untitled}${occurrence.occurrenceDate ? " [" + occurrence.occurrenceDate + "]" : ""}`, untitled);
      const endField = t.milestone ? "0d" : occurrence.schedFinish;
      lines.push(`    ${name} :${tagStr}${id}, ${occurrence.schedStart}, ${endField}`);
    });
  });
  return lines.join("\n");
}
