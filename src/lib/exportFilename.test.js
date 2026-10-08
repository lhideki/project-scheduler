import { describe, it, expect } from "vitest";
import { buildExportFilename, sanitizeExportName } from "./exportFilename.js";

describe("export filename defaults", () => {
  it.each([
    ["json", "新製品 Q4_2026-10-08.json"],
    ["html", "新製品 Q4-share_2026-10-08.html"],
    ["png", "新製品 Q4-gantt_2026-10-08.png"],
  ])("uses the project name for %s and keeps its date and extension", (format, expected) => {
    expect(buildExportFilename("  新製品 Q4　", format, "2026-10-08")).toBe(expected);
  });

  it.each([undefined, "", " \t　", "...", " ../\\:*?\"<>| ", "\u0000\u202e"])("preserves old defaults for an unusable name %j", name => {
    expect(buildExportFilename(name, "json", "2026-10-08")).toBe("project-scheduler_2026-10-08.json");
    expect(buildExportFilename(name, "html", "2026-10-08")).toBe("project-scheduler-share_2026-10-08.html");
    expect(buildExportFilename(name, "png", "2026-10-08")).toBe("gantt_2026-10-08.png");
  });

  it("only sanitizes the filename, preserving readable Unicode and internal spaces", () => {
    const name = ' ../新製品\\Q4: "計画"?*|<>\u0000\u007f\u202e . ';
    expect(sanitizeExportName(name)).toBe("_新製品_Q4_ _計画______");
    expect(name).toContain("\u0000");
    expect(sanitizeExportName("München & 東京 🌸" )).toBe("München & 東京 🌸");
    expect(sanitizeExportName("___")).toBe("___");
  });

  it.each(["CON", "con.txt", "PRN", "AUX", "NUL", "COM1", "LPT9", "COM¹", "LPT³.log"])("protects Windows device name %s", name => {
    expect(sanitizeExportName(name)).toBe(`_${name}`);
  });

  it.each(["CONSOLE", "COM0", "COM10", "LPT0", "auxiliary"])("preserves non-reserved name %s", name => {
    expect(sanitizeExportName(name)).toBe(name);
  });

  it.each(["a".repeat(1000), "日".repeat(1000), "🌸".repeat(1000), "a".repeat(198) + "🌸"])("bounds long Unicode names without truncating extensions", name => {
    const stem = sanitizeExportName(name);
    expect(new TextEncoder().encode(stem).length).toBeLessThanOrEqual(200);
    expect(stem.isWellFormed()).toBe(true);
    for (const format of ["json", "html", "png"]) {
      const filename = buildExportFilename(name, format, "2026-10-08");
      expect(new TextEncoder().encode(filename).length).toBeLessThan(255);
      expect(filename).toMatch(new RegExp(`_2026-10-08\\.${format}$`));
    }
  });

  it("removes trailing dots and spaces exposed by truncation", () => {
    expect(sanitizeExportName("a".repeat(198) + " .more")).toBe("a".repeat(198));
  });

  it("rejects unsupported formats rather than emitting an invalid extension", () => {
    for (const format of ["pdf", "__proto__", "toString"]) {
      expect(() => buildExportFilename("Name", format, "2026-10-08")).toThrow("invalid_export_format");
    }
  });
});
