import { buildFlatList, migrateSprintIds } from "./taskTree.js";

export const PROJECT_SCHEMA_VERSION = 1;

export const PROJECT_JSON_SCHEMA = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://lhideki.github.io/project-scheduler/schema/project-export-v1.json",
  title: "Project Scheduler export",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "exportedAt", "tasks", "resources", "sprints", "versions"],
  properties: {
    schemaVersion: { type: "integer", const: PROJECT_SCHEMA_VERSION, description: "保存フォーマットのスキーマバージョン" },
    exportedAt: { type: "string", format: "date-time", description: "エクスポート日時（ISO 8601）" },
    tasks: { type: "array", items: { $ref: "#/$defs/task" } },
    resources: { type: "array", items: { $ref: "#/$defs/resource" } },
    sprints: { type: "array", items: { $ref: "#/$defs/sprint" } },
    versions: { type: "array", items: { $ref: "#/$defs/version" } },
  },
  $defs: {
    dependency: {
      type: "object",
      additionalProperties: false,
      required: ["id", "type", "lag"],
      properties: {
        id: { type: "string" },
        type: { type: "string", enum: ["FS", "SS", "FF", "SF"] },
        lag: { type: "number" },
      },
    },
    task: {
      type: "object",
      additionalProperties: true,
      required: ["id", "name", "parentId", "order"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        parentId: { type: ["string", "null"] },
        order: { type: "number" },
        startDate: { type: "string", format: "date" },
        duration: { type: "number" },
        assigneeId: { type: ["string", "null"] },
        sprintIds: { type: "array", items: { type: "string" } },
        predecessors: { type: "array", items: { $ref: "#/$defs/dependency" } },
        progress: { type: "number" },
        milestone: { type: "boolean" },
        milestoneMode: { type: "string", enum: ["flexible", "fixed"] },
        fixedDate: { type: "string", format: "date" },
        savedDuration: { type: "number" },
        notes: { type: "string" },
        diagX: { type: "number" },
        diagY: { type: "number" },
      },
    },
    resource: {
      type: "object",
      additionalProperties: false,
      required: ["id", "name", "weeklyCapacity", "monthlyCapacity"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        weeklyCapacity: { type: "number" },
        monthlyCapacity: { type: "number" },
      },
    },
    sprint: {
      type: "object",
      additionalProperties: false,
      required: ["id", "name", "startDate", "endDate", "order"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        theme: { type: "string" },
        startDate: { type: "string", format: "date" },
        endDate: { type: "string", format: "date" },
        order: { type: "number" },
      },
    },
    versionTask: {
      type: "object",
      additionalProperties: true,
      required: ["id", "name", "level", "wbsNo", "hasChildren", "critical", "milestone", "assigneeId", "progress"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        level: { type: "number" },
        wbsNo: { type: "string" },
        hasChildren: { type: "boolean" },
        schedStart: { type: "string", format: "date" },
        schedFinish: { type: "string", format: "date" },
        critical: { type: "boolean" },
        milestone: { type: "boolean" },
        duration: { type: ["number", "null"] },
        assigneeId: { type: ["string", "null"] },
        progress: { type: "number" },
      },
    },
    version: {
      type: "object",
      additionalProperties: true,
      required: ["id", "name", "createdAt", "tasks", "hasWbsInfo", "hasFullSnapshot"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        createdAt: { type: "number" },
        tasks: { type: "array", items: { $ref: "#/$defs/versionTask" } },
        hasWbsInfo: { type: "boolean" },
        rawTasks: { type: "array", items: { $ref: "#/$defs/task" } },
        rawResources: { type: "array", items: { $ref: "#/$defs/resource" } },
        rawSprints: { type: "array", items: { $ref: "#/$defs/sprint" } },
        hasFullSnapshot: { type: "boolean" },
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

/**
 * 読み込んだ versions 配列を現行形式として扱いやすい形へ正規化する。
 * - 古い形式（フル復元用 raw* を持たないもの）は hasFullSnapshot: false に揃える
 * - rawTasks 内の旧 sprintId は現行の sprintIds 配列へ移行する
 */
export function normalizeVersionSnapshots(versions) {
  return (Array.isArray(versions) ? versions : [])
    .filter(isObject)
    .map(version => {
      const cloned = cloneJSON(version);
      const hasFullSnapshot = Array.isArray(cloned.rawTasks) && Array.isArray(cloned.rawResources) && Array.isArray(cloned.rawSprints);
      return {
        ...cloned,
        hasWbsInfo: typeof cloned.hasWbsInfo === "boolean" ? cloned.hasWbsInfo : false,
        tasks: Array.isArray(cloned.tasks) ? cloned.tasks : [],
        ...(Array.isArray(cloned.rawTasks) ? { rawTasks: migrateSprintIds(cloned.rawTasks) } : {}),
        ...(Array.isArray(cloned.rawResources) ? { rawResources: cloned.rawResources } : {}),
        ...(Array.isArray(cloned.rawSprints) ? { rawSprints: cloned.rawSprints } : {}),
        hasFullSnapshot,
      };
    });
}

/** 現行の正規化済みJSONエクスポートデータを組み立てる。 */
export function buildProjectExport(tasks, resources, sprints = [], versions = []) {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    tasks: cloneJSON(Array.isArray(tasks) ? tasks : []),
    resources: cloneJSON(Array.isArray(resources) ? resources : []),
    sprints: cloneJSON(Array.isArray(sprints) ? sprints : []),
    versions: normalizeVersionSnapshots(versions),
  };
}

/**
 * JSONインポートで受け取ったデータを検証・正規化する。
 * tasks/resources は必須。旧形式では省略され得る sprints/versions は空配列へフォールバックする。
 */
export function normalizeImportedProject(data) {
  if (!isObject(data) || !Array.isArray(data.tasks) || !Array.isArray(data.resources)) {
    throw new Error("invalid_project_json");
  }
  return {
    schemaVersion: typeof data.schemaVersion === "number" ? data.schemaVersion : null,
    exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : null,
    tasks: migrateSprintIds(cloneJSON(data.tasks)),
    resources: cloneJSON(data.resources),
    sprints: Array.isArray(data.sprints) ? cloneJSON(data.sprints) : [],
    versions: normalizeVersionSnapshots(data.versions),
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
