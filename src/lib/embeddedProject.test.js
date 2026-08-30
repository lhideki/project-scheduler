import { describe, it, expect } from "vitest";
import { buildProjectExport } from "./exportUtils.js";
import { serializeEmbeddedProject, parseEmbeddedProject } from "./embeddedProject.js";

function sampleExport(overrides = {}) {
  const tasks = [
    { id: "t1", name: "設計", parentId: null, order: 0, startDate: "2026-01-05", duration: 3 },
    ...(overrides.tasks || []),
  ];
  return buildProjectExport(tasks, [], [], [], false, []);
}

describe("serializeEmbeddedProject / parseEmbeddedProject", () => {
  it("往復してプロジェクトデータが一致する", () => {
    const data = sampleExport();
    const restored = parseEmbeddedProject(serializeEmbeddedProject(data));
    expect(restored.tasks).toEqual(data.tasks);
    expect(restored.schemaVersion).toBe(data.schemaVersion);
    expect(restored.exportedAt).toBe(data.exportedAt);
  });

  it("メモに </script> や < を含んでいてもエスケープされ、往復で復元できる", () => {
    const data = sampleExport({
      tasks: [{
        id: "t2", name: "実装", parentId: null, order: 1, duration: 2,
        notes: "注意: </script><script>alert(1)</script> と a < b の比較",
      }],
    });
    const serialized = serializeEmbeddedProject(data);
    expect(serialized).not.toContain("<");
    expect(serialized).toContain("\\u003c");

    const restored = parseEmbeddedProject(serialized);
    expect(restored.tasks[1].notes).toBe("注意: </script><script>alert(1)</script> と a < b の比較");
  });

  it("不正な形式は invalid_project_json を投げる", () => {
    expect(() => parseEmbeddedProject("{}"))
      .toThrowError(/invalid_project_json/);
  });
});
