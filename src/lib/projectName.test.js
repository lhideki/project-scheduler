import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { normalizeProjectName } from "./projectName.js";
import { buildProjectExport, normalizeImportedProject, prepareProjectImport, PROJECT_JSON_SCHEMA } from "./exportUtils.js";
import { validateProjectData } from "./projectValidation.js";
import { normalizeStoredProject } from "./storedProject.js";
import { parseEmbeddedProject, serializeEmbeddedProject } from "./embeddedProject.js";
import { buildVersionSnapshot, computeSchedule, validateProject } from "../agent/cli.js";
import { createAppTranslator } from "./i18n.js";

const project = (projectName = "") => buildProjectExport([], [], [], [], false, [], projectName);
const specialName = '日本語 & "記号" </script><script>globalThis.injected=true</script> ' + "長い名前🌸".repeat(300);

describe("project name metadata", () => {
  it("is optional schema-v1 display metadata, separate from version names", () => {
    expect(PROJECT_JSON_SCHEMA.properties.projectName).toMatchObject({ type: "string", default: "" });
    expect(PROJECT_JSON_SCHEMA.required).not.toContain("projectName");
    expect(PROJECT_JSON_SCHEMA.$defs.version.properties).not.toHaveProperty("projectName");
    expect(PROJECT_JSON_SCHEMA.$defs.version.properties).not.toHaveProperty("rawProjectName");
  });
  it.each([undefined, "", " \t\n　 "])("treats %j as unnamed, never using a translated display label", value => {
    expect(normalizeProjectName(value)).toBe("");
    const raw = project();
    delete raw.projectName;
    if (value !== undefined) raw.projectName = value;
    expect(normalizeImportedProject(raw).projectName).toBe("");
    expect(buildProjectExport([], [], [], [], false, [], value).projectName).toBe("");
    expect(createAppTranslator("ja")("projectName.untitled")).toBe("無題のプロジェクト");
    expect(createAppTranslator("en")("projectName.untitled")).toBe("Untitled project");
  });
  it("trims only boundary whitespace and keeps Unicode, internal spaces and punctuation", () => {
    const name = "日本語  プロジェクト\t🌸 & <plan>";
    expect(normalizeProjectName(`  ${name}　`)).toBe(name);
  });
  it("preserves a long untrusted-looking name through JSON, local storage and embedded round trips", () => {
    const data = project(` ${specialName} `);
    expect(data.projectName).toBe(specialName);
    expect(normalizeImportedProject(JSON.parse(JSON.stringify(data)))).toEqual(data);
    expect(normalizeStoredProject(data, []).projectName).toBe(specialName);
    const embedded = serializeEmbeddedProject(data);
    expect(embedded).not.toContain("<");
    expect(parseEmbeddedProject(embedded)).toEqual(data);
    expect(parseEmbeddedProject(serializeEmbeddedProject(parseEmbeddedProject(embedded)))).toEqual(data);
  });
  it.each([null, 1, false, [], {}, ["name"]])("rejects wrong name type %j consistently before state replacement", projectName => {
    const data = { ...project(), projectName };
    const original = JSON.stringify(data);
    const common = validateProjectData(data);
    expect(common).toContainEqual(expect.objectContaining({ severity: "error", code: "projectName-invalid", path: "projectName" }));
    expect(validateProject(data).issues).toContainEqual(expect.objectContaining({ code: "projectName-invalid", path: "projectName" }));
    for (const normalize of [normalizeImportedProject, value => normalizeStoredProject(value, []), value => prepareProjectImport(value), value => parseEmbeddedProject(JSON.stringify(value))]) {
      expect(() => normalize(data)).toThrow("invalid_project_json");
    }
    expect(JSON.stringify(data)).toBe(original);
    expect(() => normalizeProjectName(projectName)).toThrow("invalid_project_name");
  });
  it("resets an old imported plan to unnamed without taking a version name", () => {
    const old = project(); delete old.projectName;
    const versions = [{ id: "v", name: "Version title, not project title", createdAt: 1, tasks: [] }];
    expect(prepareProjectImport(old, versions).data.projectName).toBe("");
    expect(normalizeStoredProject({ tasks: [] }, versions).projectName).toBe("");
  });
  it("renaming leaves calculated schedules and schedule snapshots unchanged", () => {
    const data = { ...project("Before"), tasks: [{ id: "t", name: "Task", parentId: null, order: 0, startDate: "2026-10-01", duration: 3 }] };
    const before = computeSchedule(data);
    const after = computeSchedule({ ...data, projectName: specialName });
    expect(after.schedule).toEqual(before.schedule);
    expect(after.projectEnd).toBe(before.projectEnd);
    const version = buildVersionSnapshot(data, before.schedule, "Version title");
    expect(version).not.toHaveProperty("projectName");
    expect(version).not.toHaveProperty("rawProjectName");
    expect(version.name).toBe("Version title");
  });
});

describe("CLI project name preservation", () => {
  const directories = [];
  afterEach(() => directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })));
  function plan(edited, extra = []) {
    const directory = mkdtempSync(join(tmpdir(), "scheduler-project-name-")); directories.push(directory);
    const paths = [join(directory, "original.json"), join(directory, "edited.json")];
    const texts = [JSON.stringify(project("Original name")), JSON.stringify(edited)];
    paths.forEach((path, index) => writeFileSync(path, texts[index]));
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("../agent/cli.js", import.meta.url)), "plan", ...paths, ...extra], { encoding: "utf8" });
    expect(result.stderr).toBe("");
    paths.forEach((path, index) => expect(readFileSync(path, "utf8")).toBe(texts[index]));
    return { status: result.status, report: JSON.parse(result.stdout) };
  }
  it.each([[], ["--reschedule"]])("keeps the edited name in proposed output with %j", extra => {
    const { status, report } = plan({ ...project(), projectName: ` ${specialName} ` }, extra);
    expect(status).toBe(0);
    expect(report.proposed.projectName).toBe(specialName);
    expect(report.proposed.tasks).toEqual([]);
    expect(report.proposed.versions[0]).not.toHaveProperty("projectName");
    expect(normalizeImportedProject(report.proposed).projectName).toBe(specialName);
  });
  it("does not retain the original name when the edited plan omits or clears it", () => {
    const old = project(); delete old.projectName;
    expect(plan(old).report.proposed.projectName).toBe("");
    expect(plan({ ...project(), projectName: "　 " }).report.proposed.projectName).toBe("");
  });
  it("refuses invalid name data before producing proposed JSON", () => {
    const { status, report } = plan({ ...project(), projectName: {} });
    expect(status).toBe(1);
    expect(report.ok).toBe(false);
    expect(report).not.toHaveProperty("proposed");
    expect(report.issues).toContainEqual(expect.objectContaining({ code: "projectName-invalid", path: "projectName" }));
  });
});
