import { describe, it, expect } from "vitest";
import {
  PROJECT_JSON_SCHEMA,
  PROJECT_SCHEMA_VERSION,
  buildProjectExport,
  normalizeImportedProject,
  normalizeProjectVersions,
  escapeMermaidText,
  toMermaidId,
  generateMermaidGantt,
} from "./exportUtils.js";

describe("PROJECT_JSON_SCHEMA", () => {
  it("現行エクスポートの必須トップレベル項目を定義している", () => {
    expect(PROJECT_JSON_SCHEMA.required).toEqual([
      "schemaVersion",
      "exportedAt",
      "tasks",
      "resources",
      "sprints",
      "versions",
    ]);
    expect(PROJECT_JSON_SCHEMA.$defs.task.required).toEqual(["id", "name", "parentId", "order"]);
    expect(PROJECT_JSON_SCHEMA.$defs.resource.required).toEqual(["id", "name", "weeklyCapacity", "monthlyCapacity"]);
    expect(PROJECT_JSON_SCHEMA.$defs.sprint.required).toEqual(["id", "name", "startDate", "endDate", "order"]);
  });

  it("calendarException を $defs に定義し、type の enum を持つ（required には含めない）", () => {
    expect(PROJECT_JSON_SCHEMA.$defs.calendarException.required).toEqual(["date", "type"]);
    expect(PROJECT_JSON_SCHEMA.$defs.calendarException.properties.type.enum).toEqual(["holiday", "workday"]);
    expect(PROJECT_JSON_SCHEMA.required).not.toContain("calendarExceptions");
  });
});

describe("buildProjectExport", () => {
  it("現行スキーマの形でエクスポートデータを組み立てる", () => {
    const tasks = [{ id: "t1", name: "Task", parentId: null, order: 0, sprintIds: ["sp1"] }];
    const resources = [{ id: "r1", name: "担当者", weeklyCapacity: 5, monthlyCapacity: 20 }];
    const sprints = [{ id: "sp1", name: "Sprint 1", startDate: "2024-01-01", endDate: "2024-01-12", order: 0 }];
    const versions = [{ id: "v1", name: "v1", createdAt: 1, tasks: [], hasWbsInfo: true, rawTasks: [], rawResources: [], rawSprints: [], hasFullSnapshot: true }];
    const out = buildProjectExport(tasks, resources, sprints, versions, true);

    expect(out.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(out.exportedAt).toMatch(/T/);
    expect(out.tasks).toEqual(tasks);
    expect(out.resources).toEqual(resources);
    expect(out.sprints).toEqual(sprints);
    expect(out.versions).toEqual(versions);
    expect(out.levelingOn).toBe(true);

    tasks[0].name = "changed";
    expect(out.tasks[0].name).toBe("Task");
  });

  it("levelingOn を省略すると false になる", () => {
    const out = buildProjectExport([], [], [], []);
    expect(out.levelingOn).toBe(false);
  });

  it("calendarExceptions を第6引数で受け取り、ディープコピーして返す", () => {
    const exceptions = [{ date: "2026-05-01", type: "holiday", name: "創立記念日" }];
    const out = buildProjectExport([], [], [], [], false, exceptions);
    expect(out.calendarExceptions).toEqual(exceptions);
    exceptions[0].name = "changed";
    expect(out.calendarExceptions[0].name).toBe("創立記念日");
  });

  it("calendarExceptions を省略すると空配列になる", () => {
    expect(buildProjectExport([], [], [], []).calendarExceptions).toEqual([]);
  });
});

describe("normalizeProjectVersions", () => {
  it("full snapshot の有無から hasFullSnapshot を再計算する", () => {
    const out = normalizeProjectVersions([{
      id: "v1",
      name: "full",
      createdAt: 1,
      tasks: [],
      hasWbsInfo: true,
      rawTasks: [{ id: "t1", name: "Task", parentId: null, order: 0, sprintIds: ["sp1"] }],
      rawResources: [],
      rawSprints: [],
    }]);
    expect(out[0].hasFullSnapshot).toBe(true);
    expect(out[0].rawTasks).toEqual([{ id: "t1", name: "Task", parentId: null, order: 0, sprintIds: ["sp1"] }]);
  });

  it("オブジェクトでない version 要素は拒否する", () => {
    expect(() => normalizeProjectVersions([null])).toThrow("invalid_project_json");
  });
});

describe("normalizeImportedProject", () => {
  it("現行形式のJSONをそのまま受け付ける", () => {
    const out = normalizeImportedProject({
      schemaVersion: PROJECT_SCHEMA_VERSION,
      exportedAt: "2026-08-26T00:00:00.000Z",
      tasks: [{ id: "t1", name: "Task", parentId: null, order: 0, sprintIds: ["sp1"] }],
      resources: [{ id: "r1", name: "担当者", weeklyCapacity: 5, monthlyCapacity: 20 }],
      sprints: [],
      versions: [],
      levelingOn: true,
    });

    expect(out.tasks).toEqual([{ id: "t1", name: "Task", parentId: null, order: 0, sprintIds: ["sp1"] }]);
    expect(out.sprints).toEqual([]);
    expect(out.versions).toEqual([]);
    expect(out.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(out.exportedAt).toBe("2026-08-26T00:00:00.000Z");
    expect(out.levelingOn).toBe(true);
  });

  it("levelingOn が無い旧形式のJSONは false にフォールバックする", () => {
    const out = normalizeImportedProject({
      schemaVersion: PROJECT_SCHEMA_VERSION,
      exportedAt: "2026-08-26T00:00:00.000Z",
      tasks: [],
      resources: [],
      sprints: [],
      versions: [],
    });
    expect(out.levelingOn).toBe(false);
  });

  it("calendarExceptions を保持し、無い旧形式は空配列にフォールバックする", () => {
    const withEx = normalizeImportedProject({
      schemaVersion: PROJECT_SCHEMA_VERSION,
      exportedAt: "2026-08-26T00:00:00.000Z",
      tasks: [], resources: [], sprints: [], versions: [],
      calendarExceptions: [{ date: "2026-05-01", type: "holiday", name: "創立記念日" }],
    });
    expect(withEx.calendarExceptions).toEqual([{ date: "2026-05-01", type: "holiday", name: "創立記念日" }]);

    const withoutEx = normalizeImportedProject({
      schemaVersion: PROJECT_SCHEMA_VERSION,
      exportedAt: "2026-08-26T00:00:00.000Z",
      tasks: [], resources: [], sprints: [], versions: [],
    });
    expect(withoutEx.calendarExceptions).toEqual([]);
  });

  it("calendarExceptions キーが存在するのに配列でない場合は拒否する（黙って [] に丸めない）", () => {
    expect(() => normalizeImportedProject({
      schemaVersion: PROJECT_SCHEMA_VERSION,
      exportedAt: "2026-08-26T00:00:00.000Z",
      tasks: [], resources: [], sprints: [], versions: [],
      calendarExceptions: {},
    })).toThrow("invalid_project_json");
  });

  it("旧形式や必須項目不足のJSONは拒否する", () => {
    expect(() => normalizeImportedProject({ tasks: [] })).toThrow("invalid_project_json");
    expect(() => normalizeImportedProject({
      tasks: [{ id: "t1", name: "Task", parentId: null, order: 0, sprintId: "sp1" }],
      resources: [{ id: "r1", name: "担当者", weeklyCapacity: 5, monthlyCapacity: 20 }],
    })).toThrow("invalid_project_json");
    expect(() => normalizeImportedProject(null)).toThrow("invalid_project_json");
  });
});

describe("escapeMermaidText", () => {
  it("コロン・カンマ・改行をスペースに置換する", () => {
    expect(escapeMermaidText("設計:詳細,実装\n完了")).toBe("設計 詳細 実装 完了");
  });
  it("連続空白は1つにまとめ、前後をtrimする", () => {
    expect(escapeMermaidText("  a   b  ")).toBe("a b");
  });
  it("空文字/未指定は（無題）にフォールバックする", () => {
    expect(escapeMermaidText("")).toBe("（無題）");
    expect(escapeMermaidText(undefined)).toBe("（無題）");
  });
});

describe("toMermaidId", () => {
  it("英数字・アンダースコア以外を_に置換する", () => {
    expect(toMermaidId("1.2/設計")).toBe("t1_2___");
  });
  it("先頭が英字でなければtを前置する", () => {
    expect(toMermaidId("1.2")).toBe("t1_2");
    expect(toMermaidId("abc")).toBe("abc");
  });
});

describe("generateMermaidGantt", () => {
  it("グループはsection、リーフはタスク行として出力する", () => {
    const tasks = [
      { id: "g1", name: "要件定義", parentId: null, order: 0 },
      { id: "t1", name: "ヒアリング", parentId: "g1", order: 0, progress: 50 },
    ];
    const schedule = new Map([
      ["t1", { schedStart: "2024-01-09", schedFinish: "2024-01-11", critical: true }],
    ]);
    const out = generateMermaidGantt(tasks, schedule);
    expect(out).toContain("section 要件定義");
    expect(out).toContain("ヒアリング :crit, active, t1_1, 2024-01-09, 2024-01-11");
  });

  it("スケジュール未確定（schedStart/schedFinish無し）のタスクは出力から除外する", () => {
    const tasks = [{ id: "t1", name: "未確定", parentId: null, order: 0 }];
    const schedule = new Map();
    const out = generateMermaidGantt(tasks, schedule);
    expect(out).not.toContain("未確定");
  });

  it("マイルストーンは終了フィールドを0dにする", () => {
    const tasks = [{ id: "m1", name: "完了", parentId: null, order: 0, milestone: true }];
    const schedule = new Map([["m1", { schedStart: "2024-01-09", schedFinish: "2024-01-09", critical: false, progress: 0 }]]);
    const out = generateMermaidGantt(tasks, schedule);
    expect(out).toContain("完了 :milestone, t1, 2024-01-09, 0d");
  });

  it("兄弟タスクにはそれぞれ異なるMermaid IDを振る", () => {
    const tasks = [
      { id: "t1", name: "A", parentId: null, order: 0 },
      { id: "t2", name: "B", parentId: null, order: 1 },
    ];
    const schedule = new Map([
      ["t1", { schedStart: "2024-01-09", schedFinish: "2024-01-10", critical: false, progress: 0 }],
      ["t2", { schedStart: "2024-01-09", schedFinish: "2024-01-10", critical: false, progress: 0 }],
    ]);
    const out = generateMermaidGantt(tasks, schedule);
    expect(out).toContain("A :t1, 2024-01-09, 2024-01-10");
    expect(out).toContain("B :t2, 2024-01-09, 2024-01-10");
  });
});
