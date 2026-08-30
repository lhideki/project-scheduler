import { buildFlatList } from "./taskTree.js";

export const PROJECT_SCHEMA_VERSION = 1;

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
        id: { type: "string", description: "先行タスクID" },
        type: { type: "string", enum: ["FS", "SS", "FF", "SF"], description: "依存関係の種類" },
        lag: { type: "number", description: "リード/ラグ日数" },
      },
    },
    task: {
      type: "object",
      description: "WBS上のタスクです。階層は parentId で表現します。",
      additionalProperties: true,
      required: ["id", "name", "parentId", "order"],
      properties: {
        id: { type: "string", description: "タスクID" },
        name: { type: "string", description: "タスク名" },
        parentId: { type: ["string", "null"], description: "親タスクID。ルート直下は null" },
        order: { type: "number", description: "同じ親配下での表示順" },
        startDate: { type: "string", format: "date", description: "開始日（YYYY-MM-DD）" },
        duration: { type: "number", description: "工数。マイルストーンは通常 0" },
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
        hasFullSnapshot: { type: "boolean", description: "復元に必要な raw*（rawTasks/rawResources/rawSprints）が揃っているか" },
      },
    },
  },
});

function cloneJSON(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function normalizeProjectVersions(versions) {
  if (!Array.isArray(versions) || versions.some(v => !isObject(v))) {
    throw new Error("invalid_project_json");
  }
  return cloneJSON(versions).map(version => ({
    ...version,
    hasFullSnapshot: Array.isArray(version.rawTasks) && Array.isArray(version.rawResources) && Array.isArray(version.rawSprints),
  }));
}

/** 現行の正規化済みJSONエクスポートデータを組み立てる。 */
export function buildProjectExport(tasks, resources, sprints = [], versions = [], levelingOn = false, calendarExceptions = []) {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    tasks: cloneJSON(Array.isArray(tasks) ? tasks : []),
    resources: cloneJSON(Array.isArray(resources) ? resources : []),
    sprints: cloneJSON(Array.isArray(sprints) ? sprints : []),
    versions: normalizeProjectVersions(versions),
    levelingOn: !!levelingOn,
    calendarExceptions: cloneJSON(Array.isArray(calendarExceptions) ? calendarExceptions : []),
  };
}

/**
 * JSONインポートで受け取ったデータを検証・正規化する。
 * 現行スキーマのみ受け付け、旧形式へのフォールバックは行わない。
 */
export function normalizeImportedProject(data) {
  if (
    !isObject(data)
    || data.schemaVersion !== PROJECT_SCHEMA_VERSION
    || typeof data.exportedAt !== "string"
    || !Array.isArray(data.tasks)
    || !Array.isArray(data.resources)
    || !Array.isArray(data.sprints)
    || !Array.isArray(data.versions)
    // calendarExceptions は任意だが、キーが存在する場合は配列でなければ不正とみなす
    // （黙って [] に丸めるとカレンダー設定を失ったまま読み込めてしまうため）。
    || (data.calendarExceptions !== undefined && !Array.isArray(data.calendarExceptions))
  ) {
    throw new Error("invalid_project_json");
  }
  return {
    schemaVersion: data.schemaVersion,
    exportedAt: data.exportedAt,
    tasks: cloneJSON(data.tasks),
    resources: cloneJSON(data.resources),
    sprints: cloneJSON(data.sprints),
    versions: normalizeProjectVersions(data.versions),
    // 旧形式のJSON（levelingOn未対応）を読み込んだ場合は false にフォールバックする。
    levelingOn: typeof data.levelingOn === "boolean" ? data.levelingOn : false,
    // 旧形式のJSON（calendarExceptions キーなし）のみ空配列にフォールバックする。
    calendarExceptions: Array.isArray(data.calendarExceptions) ? cloneJSON(data.calendarExceptions) : [],
  };
}

/** JSON を生成しブラウザのダウンロードとしてトリガーする（プロジェクトのエクスポート用） */
export function downloadJSON(filename, dataObj) {
  const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  if (!ok) throw new Error("execCommand('copy') に失敗しました");
}

/** Mermaid のタスク名として問題になる記号（コロン・カンマ・改行）を除去する */
export function escapeMermaidText(str) {
  return String(str ?? "").replace(/[:,\n]/g, " ").replace(/\s+/g, " ").trim() || "（無題）";
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
 */
export function generateMermaidGantt(tasks, schedule) {
  const flatAll = buildFlatList(tasks, new Set());
  const lines = ["gantt", "    title プロジェクトスケジュール", "    dateFormat YYYY-MM-DD", "    excludes weekends"];
  const usedIds = new Set();
  flatAll.forEach(t => {
    if (t.hasChildren) {
      lines.push(`    section ${escapeMermaidText(t.name)}`);
      return;
    }
    const s = schedule.get(t.id);
    if (!s || !s.schedStart || !s.schedFinish) return;
    let id = toMermaidId(`t${t.wbsNo || t.id}`);
    if (usedIds.has(id)) {
      let i = 2;
      while (usedIds.has(`${id}_${i}`)) i++;
      id = `${id}_${i}`;
    }
    usedIds.add(id);
    const tags = [];
    if (t.milestone) tags.push("milestone");
    if (s.critical) tags.push("crit");
    if ((t.progress || 0) >= 100) tags.push("done");
    else if ((t.progress || 0) > 0) tags.push("active");
    const tagStr = tags.length ? `${tags.join(", ")}, ` : "";
    const name = escapeMermaidText(t.name);
    const endField = t.milestone ? "0d" : s.schedFinish;
    lines.push(`    ${name} :${tagStr}${id}, ${s.schedStart}, ${endField}`);
  });
  return lines.join("\n");
}
