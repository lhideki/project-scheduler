import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const browserErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const errors = [];
  browserErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page), "No uncaught browser errors").toEqual([]);
});

const fixture = () => ({
  schemaVersion: 1,
  exportedAt: "2026-10-06T12:00:00.000Z",
  tasks: [
    { id: "design", name: "Design", parentId: null, order: 0, startDate: "2026-10-01", duration: 2, assigneeId: "r1", sprintIds: ["s1"], predecessors: [] },
    { id: "build", name: "Build", parentId: null, order: 1, startDate: "2026-10-05", duration: 3, assigneeId: "r1", sprintIds: ["s1"], predecessors: [{ id: "design", type: "FS", lag: 0 }] },
  ],
  resources: [{ id: "r1", name: "Test engineer", weeklyCapacity: 5, monthlyCapacity: 20 }],
  sprints: [{ id: "s1", name: "October sprint", startDate: "2026-10-01", endDate: "2026-10-30", order: 0 }],
  versions: [{ id: "v-local", name: "Existing baseline", createdAt: 1, tasks: [], hasWbsInfo: false, hasFullSnapshot: false }],
  levelingOn: true,
  calendarExceptions: [{ date: "2026-10-07", type: "holiday", name: "Test holiday" }],
});

async function boot(page, project = fixture(), options = {}) {
  await page.addInitScript(({ project, options }) => {
    if (!localStorage.getItem("qa-fixture-installed")) {
      const { versions, ...plan } = project;
      localStorage.setItem("pm_project", options.corrupt ? "{broken" : JSON.stringify(plan));
      localStorage.setItem("pm_versions", JSON.stringify(versions));
      localStorage.setItem("qa-fixture-installed", "true");
    }
    window.__saveMode = options.mode || "success";
    window.__writes = [];
    window.__pendingWrites = [];
    window.storage = {
      async get(key) { const value = localStorage.getItem(key); return value === null ? null : { value }; },
      async set(key, value) {
        if (key === "pm_ui_locale") { localStorage.setItem(key, value); return true; }
        window.__writes.push({ key, value });
        if (window.__saveMode === "false") return false;
        if (window.__saveMode === "throw") throw new Error("QuotaExceededError: simulated test storage failure");
        if (window.__saveMode === "defer") await new Promise(resolve => window.__pendingWrites.push(resolve));
        localStorage.setItem(key, value);
        return true;
      },
    };
    if (options.linked) window.showOpenFilePicker = undefined;
  }, { project, options });
  await page.goto(options.linked ? "/project_scheduler.html?schedule=qa-synthetic" : "/project_scheduler.html");
  await expect(page.getByTestId("save-status")).toBeVisible();
}
const saved = page => expect(page.getByTestId("save-status")).toHaveText("Saved in this browser");
const readStored = page => page.evaluate(() => ({ project: JSON.parse(localStorage.getItem("pm_project")), versions: JSON.parse(localStorage.getItem("pm_versions")) }));
const stripped = ({ exportedAt, schemaVersion, ...project }) => project;
async function upload(page, data, input = 'input[type="file"][aria-label="Import"]') {
  await page.locator(input).setInputFiles({ name: "qa-project.json", mimeType: "application/json", buffer: Buffer.from(typeof data === "string" ? data : JSON.stringify(data)) });
}
async function exportJSON(page, backup = false) {
  const download = page.waitForEvent("download");
  if (backup) await page.getByRole("button", { name: "Back up as JSON", exact: true }).click();
  else {
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page.getByRole("menuitem", { name: "Export JSON", exact: true }).click();
  }
  return JSON.parse(await readFile(await (await download).path(), "utf8"));
}
async function screenshot(page, testInfo, name) {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test("latest edit is pending until both serialized writes finish", async ({ page }, testInfo) => {
  await boot(page); await saved(page);
  await page.evaluate(() => { window.__saveMode = "defer"; });
  await page.locator('input[value="Design"]').fill("Design first edit");
  await expect.poll(() => page.evaluate(() => window.__pendingWrites.length)).toBe(2);
  await page.locator('input[value="Design first edit"]').fill("Design latest edit");
  await expect(page.getByTestId("save-status")).toContainText("Unsaved");
  await page.evaluate(() => window.__pendingWrites.splice(0).forEach(resolve => resolve()));
  await expect(page.getByTestId("save-status")).toContainText("Unsaved");
  await expect.poll(() => page.evaluate(() => window.__pendingWrites.length)).toBe(2);
  await page.evaluate(() => { window.__saveMode = "success"; window.__pendingWrites.splice(0).forEach(resolve => resolve()); });
  await saved(page);
  expect((await readStored(page)).project.tasks[0].name).toBe("Design latest edit");
  await screenshot(page, testInfo, "01-saved-latest-plan.png");
});

for (const mode of ["false", "throw"]) {
  test(`storage ${mode} retains edits and version, backs up JSON, and retries`, async ({ page }, testInfo) => {
    await boot(page); await saved(page);
    await page.evaluate(mode => { window.__saveMode = mode; }, mode);
    await page.locator('input[value="Design"]').fill("Unsaved design change");
    await expect(page.getByTestId("save-status")).toHaveText("Could not save");
    await page.getByRole("button", { name: /^Versions/ }).click();
    await page.getByRole("textbox", { name: "Version name", exact: true }).fill("Emergency snapshot");
    await page.getByRole("button", { name: "Save current schedule", exact: true }).click();
    await expect(page.getByText('Added version "Emergency snapshot" on this screen. Browser save is pending.')).toBeVisible();
    await expect(page.getByTestId("save-status")).toHaveText("Could not save");
    expect((await readStored(page)).versions).toHaveLength(1);
    if (mode === "false") await screenshot(page, testInfo, "02-save-failure-and-json-backup.png");
    const backup = await exportJSON(page, true);
    expect(backup.tasks[0].name).toBe("Unsaved design change");
    expect(backup.versions[0].name).toBe("Emergency snapshot");
    await page.evaluate(() => { window.__saveMode = "success"; });
    await page.getByRole("button", { name: "Retry saving", exact: true }).click();
    await saved(page);
    expect((await readStored(page)).versions).toHaveLength(2);
    await page.reload(); await saved(page);
    expect((await exportJSON(page)).tasks[0].name).toBe("Unsaved design change");
  });
}

test("invalid JSON and cancelled imports leave all plan fields and history intact", async ({ page }, testInfo) => {
  await boot(page); await saved(page);
  await page.locator('input[value="Design"]').fill("Edited original"); await saved(page);
  const before = stripped(await exportJSON(page));
  for (const malformed of [
    { ...fixture(), tasks: [null] },
    { ...fixture(), tasks: [{ ...fixture().tasks[0], startDate: "2026-02-30" }] },
    { ...fixture(), versions: [{ ...fixture().versions[0], tasks: [null] }] },
  ]) {
    await upload(page, malformed);
    await expect(page.getByRole("alert")).toContainText("The project data is invalid");
    expect(stripped(await exportJSON(page))).toEqual(before);
  }
  await upload(page, { ...fixture(), tasks: [null] });
  await expect(page.getByRole("alert")).toContainText("tasks[0]");
  await screenshot(page, testInfo, "03-invalid-json-plan-preserved.png");
  await page.getByRole("combobox", { name: "Display language" }).selectOption("ja");
  await expect(page.getByRole("alert")).toContainText("プロジェクトの内容に不正な項目があります");
  await screenshot(page, testInfo, "04-invalid-json-japanese.png");
  await page.getByRole("combobox", { name: "表示言語" }).selectOption("en");
  await upload(page, "{broken");
  await expect(page.getByRole("alert")).toContainText("The file is not valid JSON");
  expect(stripped(await exportJSON(page))).toEqual(before);
  await upload(page, { ...fixture(), tasks: [] });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(stripped(await exportJSON(page))).toEqual(before);
  // Failed/cancelled imports did not reset task undo history.
  await page.locator('input[value="Edited original"]').blur();
  await page.keyboard.press("Control+z");
  await expect(page.locator('input[value="Design"]')).toBeVisible();
});

test("a valid empty import merges versions and restores every setting after reload", async ({ page }, testInfo) => {
  await boot(page); await saved(page);
  const empty = { ...fixture(), tasks: [], resources: [{ id: "empty-resource", name: "Retained resource", weeklyCapacity: 4, monthlyCapacity: 16 }], versions: [{ id: "v-new", name: "Imported baseline", createdAt: 2, tasks: [] }], levelingOn: false };
  await upload(page, empty);
  await page.getByRole("button", { name: "Import", exact: true }).last().click();
  await saved(page);
  await page.reload(); await saved(page);
  const restored = await exportJSON(page);
  expect(restored.tasks).toEqual([]);
  expect(restored.resources).toEqual(empty.resources);
  expect(restored.sprints).toEqual(empty.sprints);
  expect(restored.calendarExceptions).toEqual(empty.calendarExceptions);
  expect(restored.levelingOn).toBe(false);
  expect(restored.versions.map(version => version.id)).toEqual(["v-new", "v-local"]);
  await screenshot(page, testInfo, "05-empty-project-restored.png");
});

test("unreadable stored data is preserved until an explicit retry confirmation", async ({ page }) => {
  await boot(page, fixture(), { corrupt: true });
  await expect(page.getByTestId("save-status")).toContainText("automatic saving paused");
  await page.waitForTimeout(1000); // prove no debounced write replaced the unreadable data
  expect(await page.evaluate(() => localStorage.getItem("pm_project"))).toBe("{broken");
  await page.getByRole("button", { name: "Retry saving", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem("pm_project"))).toBe("{broken");
  await page.getByRole("button", { name: "Retry saving", exact: true }).click();
  await page.getByRole("button", { name: "Retry saving", exact: true }).last().click();
  await saved(page);
});

test("linked JSON validates before replacement and never writes the local plan", async ({ page }) => {
  await boot(page, fixture(), { linked: true });
  await expect(page.getByTestId("save-status")).toContainText("Automatic saving is off");
  const before = await readStored(page);
  await upload(page, fixture(), 'input[aria-label="Linked JSON file"]');
  await expect(page.locator('input[value="Design"]')).toBeVisible();
  await page.locator('input[value="Design"]').fill("Linked screen edit");
  await upload(page, { ...fixture(), tasks: [null] }, 'input[aria-label="Linked JSON file"]');
  await expect(page.getByRole("alert")).toContainText("tasks[0]");
  await expect(page.locator('input[value="Linked screen edit"]')).toBeVisible();
  await page.waitForTimeout(1000);
  expect(await readStored(page)).toEqual(before);
  expect(await page.evaluate(() => window.__writes)).toEqual([]);
});

test("embedded HTML validates data and remains isolated from local storage", async ({ page }) => {
  const html = await readFile("project_scheduler.html", "utf8");
  const embedded = project => html.replace("</head>", `<script id="project-scheduler-embedded" type="application/json">${JSON.stringify(project).replace(/</g, "\\u003c")}</script></head>`);
  await page.route("**/shared-qa.html", route => route.fulfill({ contentType: "text/html", body: embedded(fixture()) }));
  await page.goto("/shared-qa.html");
  await expect(page.getByTestId("save-status")).toContainText("Automatic saving is off");
  await page.locator('input[value="Design"]').fill("Embedded edit");
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => localStorage.getItem("pm_project"))).toBeNull();
  expect((await exportJSON(page)).tasks[0].name).toBe("Embedded edit");
  await page.reload();
  await expect(page.locator('input[value="Design"]')).toBeVisible();
  await page.unroute("**/shared-qa.html");
  await page.route("**/shared-qa.html", route => route.fulfill({ contentType: "text/html", body: embedded({ ...fixture(), tasks: [null] }) }));
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("tasks[0]");
  expect(await page.locator('input[value="Design"]').count()).toBe(0);
});

test("a delayed initial storage read never exposes editable placeholder data", async ({ page }) => {
  await page.addInitScript(project => {
    window.__resolveProjectRead = null;
    window.storage = {
      async get(key) {
        if (key === "pm_project") return await new Promise(resolve => { window.__resolveProjectRead = () => resolve({ value: JSON.stringify(project) }); });
        if (key === "pm_versions") return { value: "[]" };
        return null;
      },
      async set() { return true; },
    };
  }, fixture());
  await page.goto("/project_scheduler.html");
  await expect(page.getByRole("status")).toHaveText("Loading saved project…");
  await expect(page.getByRole("button", { name: "Import", exact: true })).toHaveCount(0);
  await expect(page.locator('input')).toHaveCount(0);
  await page.evaluate(() => window.__resolveProjectRead());
  await saved(page);
  await expect(page.locator('input[value="Design"]')).toBeVisible();
});

for (const start of ["", "2026-11-02"]) {
  test(`UI-editable sprint date '${start}' and capacity survive save and reload with a version`, async ({ page }) => {
    await boot(page); await saved(page);
    await page.getByRole("button", { name: /^Sprints/ }).click();
    await page.locator('input[type="date"]').first().fill(start);
    await page.getByRole("button", { name: "Resources", exact: true }).click();
    await page.locator('input[type="number"]').first().fill("-1");
    await page.getByRole("button", { name: /^Versions/ }).click();
    await page.getByRole("textbox", { name: "Version name", exact: true }).fill("Editing snapshot");
    await page.getByRole("button", { name: "Save current schedule", exact: true }).click();
    await saved(page);
    const before = stripped(await exportJSON(page));
    expect(before.sprints[0].startDate).toBe(start);
    expect(before.resources[0].weeklyCapacity).toBe(-1);
    expect(before.versions[0].rawSprints[0].startDate).toBe(start);
    await page.reload(); await saved(page);
    expect(stripped(await exportJSON(page))).toEqual(before);
  });
}

test("a cleared calendar date survives save and reload with its raw version snapshot", async ({ page }, testInfo) => {
  await boot(page); await saved(page);
  await page.getByRole("button", { name: /^Calendar/ }).click();
  await page.locator('input[type="date"]').fill("");
  await page.getByRole("button", { name: /^Versions/ }).click();
  await page.getByRole("textbox", { name: "Version name", exact: true }).fill("Calendar editing snapshot");
  await page.getByRole("button", { name: "Save current schedule", exact: true }).click();
  await saved(page);
  const before = stripped(await exportJSON(page));
  expect(before.calendarExceptions).toEqual([{ date: "", type: "holiday", name: "Test holiday" }]);
  expect(before.versions[0].rawCalendarExceptions).toEqual(before.calendarExceptions);
  await page.reload(); await saved(page);
  expect(stripped(await exportJSON(page))).toEqual(before);
  await page.getByRole("button", { name: /^Calendar/ }).click();
  await expect(page.locator('input[type="date"]')).toHaveValue("");
  await screenshot(page, testInfo, "06-cleared-calendar-date-restored.png");
  await page.locator('input[type="date"]').fill("2026-10-08");
  await saved(page);
  expect((await readStored(page)).project.calendarExceptions[0].date).toBe("2026-10-08");
});
