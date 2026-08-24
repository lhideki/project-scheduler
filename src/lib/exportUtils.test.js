import { describe, it, expect } from "vitest";
import { escapeMermaidText, toMermaidId, generateMermaidGantt } from "./exportUtils.js";

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
