import { describe, expect, it } from "vitest";
import { buildFlatList } from "./taskTree.js";
import { ellipsizePngText, wrapPngTaskName, layoutPngTaskList, PNG_TASK_MAX_WIDTH, PNG_TASK_MIN_WIDTH } from "./ganttPngLayout.js";

const measure = (text, bold, size = 12) => Array.from(text).length * size / 2 + (bold ? 1 : 0);
const task = (id, extra = {}) => ({ id, name: id, level: 0, ...extra });
const layout = (rows, options = {}) => layoutPngTaskList({
  rows, rowHeight: 30, rowStride: 30, scrollTop: 0, viewHeight: 600, headerHeight: 64, header: "Task name", measure, ...options,
});

describe("PNG task-list layout", () => {
  it("keeps short lists compact and removes the new-task/unused area", () => {
    const result = layout([task("One"), task("Two")]);
    expect(result.width).toBe(PNG_TASK_MIN_WIDTH);
    expect(result.height).toBe(124);
    expect(result.rows.map(row => row.y)).toEqual([0, 30]);
    expect(layout([]).height).toBe(64);
    expect(layout([task("Hidden")], { viewHeight: 32 }).rows).toEqual([]);
  });

  it("uses exactly the scrolled visible row slice, including partial rows", () => {
    const rows = Array.from({ length: 20 }, (_, i) => task(`${i}`));
    const result = layout(rows, { scrollTop: 35, viewHeight: 135 });
    expect(result.height).toBe(135);
    expect(result.rows.map(row => [row.index, row.y])).toEqual([[1, -5], [2, 25], [3, 55]]);
    // A row beginning at the bottom edge is not visible and must not affect width.
    expect(layout(rows, { scrollTop: 30, viewHeight: 124 }).rows.map(row => row.index)).toEqual([1, 2]);
  });

  it("retains current/baseline lane geometry and includes a baseline-only visible row", () => {
    const rows = Array.from({ length: 6 }, (_, i) => task(`${i}`, { baselineName: "Saved version" }));
    const result = layout(rows, { rowStride: 52, scrollTop: 40, viewHeight: 144 });
    expect(result.rows.map(row => [row.index, row.y, row.rowStride, row.rowHeight])).toEqual([[0, -40, 52, 30], [1, 12, 52, 30], [2, 64, 52, 30]]);
    expect(result.rows[0].baselineLabel).toBe("Saved version");
  });

  it("shares collapsed order and keeps a recurring series in one row", () => {
    const tasks = [
      task("Group", { parentId: null, order: 0 }),
      task("Child", { parentId: "Group", order: 0 }),
      task("Milestone", { parentId: null, order: 1, milestone: true }),
      task("Series", { parentId: null, order: 2, recurrence: { frequency: "daily", interval: 1, endDate: "2026-11-01" } }),
    ];
    const expanded = layout(buildFlatList(tasks, new Set()));
    expect(expanded.rows.map(row => row.id)).toEqual(["Group", "Child", "Milestone", "Series"]);
    expect(expanded.rows[1].nameX - expanded.rows[0].nameX).toBe(12);
    const folded = layout(buildFlatList(tasks, new Set(["Group"])));
    expect(folded.rows.map(row => [row.id, row.y])).toEqual([["Group", 0], ["Milestone", 30], ["Series", 60]]);
  });

  it("bounds long and deeply nested labels without mutating input", () => {
    const row = Object.freeze(task("deep", { name: "調査と設計 👩‍💻 ".repeat(30), level: 50, baselineName: "A long baseline ".repeat(30) }));
    const rows = Object.freeze([row]);
    const result = layout(rows);
    expect(result.width).toBe(PNG_TASK_MAX_WIDTH);
    expect(result.rows[0].nameX).toBe(98);
    expect(result.rows[0].label.startsWith("↳51 ")).toBe(true);
    expect(result.rows[0].label.endsWith("…")).toBe(true);
    expect(result.rows[0].baselineLabel.endsWith("…")).toBe(true);
    for (const current of result.rows) {
      for (const line of current.lines) expect(measure(line, current.hasChildren, 12) + current.nameX + 12).toBeLessThanOrEqual(result.width);
    }
    expect(row.name).toBe("調査と設計 👩‍💻 ".repeat(30));
    expect(row).not.toHaveProperty("label");
  });

  it("normalizes whitespace and measures only names in the visible range", () => {
    const rows = [task("offscreen", { name: "X".repeat(1000) }), task("shown", { name: "  Name\n\twith   spaces  " })];
    const result = layout(rows, { scrollTop: 30 });
    expect(result.width).toBe(PNG_TASK_MIN_WIDTH);
    expect(result.rows[0].label).toBe("Name with spaces");
  });

  it("measures group weight and truncates a long localized heading", () => {
    const calls = [];
    const result = layout([task("group", { hasChildren: true })], {
      header: "Task heading ".repeat(100),
      measure: (text, bold, size) => { calls.push([text, bold, size]); return measure(text, bold, size); },
    });
    expect(calls).toContainEqual(["group", true, 12]);
    expect(result.width).toBe(PNG_TASK_MAX_WIDTH);
    expect(result.header.endsWith("…")).toBe(true);
  });
});

describe("PNG name ellipsis", () => {
  it("fits ordinary 30-character Japanese names on two lines without hiding their different endings", () => {
    const names = ["顧客管理システム刷新に伴うデータ移行と運用手順確認の第一工程", "顧客管理システム刷新に伴うデータ移行と運用手順確認の第二工程"];
    const result = layout(names.map(name => task(name)), { measure: text => Array.from(text).length * 12 });
    expect(result.width).toBe(280);
    for (const [index, row] of result.rows.entries()) {
      expect(row.lines).toHaveLength(2);
      expect(row.lines.join("")).toBe(names[index]);
      expect(row.label).not.toContain("…");
    }
  });

  it("wraps at a nearby word boundary and keeps emoji sequences intact", () => {
    const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const width = text => Array.from(graphemes.segment(text)).length * 10;
    expect(wrapPngTaskName("Planning the delivery", 120, width)).toEqual(["Planning the", "delivery"]);
    expect(wrapPngTaskName("👩‍💻é日本語", 30, width)).toEqual(["👩‍💻é日", "本語"]);
    expect(wrapPngTaskName("1234567 12345678901", 100, width)).toEqual(["1234567 12", "345678901"]);
  });

  it("preserves grapheme clusters and never exceeds the available width", () => {
    const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const width = text => Array.from(graphemes.segment(text)).length * 10;
    expect(ellipsizePngText("👩‍💻é日本語", 30, width)).toBe("👩‍💻é…");
    expect(ellipsizePngText("abc", 30, width)).toBe("abc");
    expect(ellipsizePngText("abc", 9, width)).toBe("");
  });
});
