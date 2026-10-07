import { test, expect } from "@playwright/test";

const fixture = projectName => ({
  schemaVersion: 1, exportedAt: "2026-10-06T12:00:00.000Z", projectName,
  tasks: [{ id: "a", name: "Design", parentId: null, order: 0, startDate: "2026-10-01", duration: 2, predecessors: [] }],
  resources: [], sprints: [], versions: [], levelingOn: false, calendarExceptions: [],
});
const dependency = page => page.locator('[data-wbs-cell="a:predecessors"]');
const upload = (page, data) => page.locator('input[type="file"][aria-label="Import"]').setInputFiles({
  name: "replacement.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)),
});
async function dirtyDependency(page) {
  await dependency(page).fill("99FS");
  await dependency(page).press("Tab");
  await expect(dependency(page)).toHaveAttribute("aria-invalid", "true");
}
async function cleanDependency(page) {
  await expect(dependency(page)).toHaveValue("");
  await expect(dependency(page)).not.toHaveAttribute("aria-invalid");
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
}

test("cancelled or invalid imports keep dependency drafts; a replacement clears drafts even with identical task data", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(data => {
    localStorage.setItem("pm_project", JSON.stringify(data));
    localStorage.setItem("pm_versions", "[]");
    localStorage.setItem("pm_ui_locale", JSON.stringify("en"));
  }, fixture("First plan"));
  await page.goto("/project_scheduler.html");
  await expect(page.getByTestId("save-status")).toHaveText("Saved in this browser");
  await dirtyDependency(page);
  await upload(page, fixture("Cancelled plan"));
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dependency(page)).toHaveValue("99FS");
  await upload(page, { ...fixture("Invalid plan"), projectName: 12 });
  await expect(page.getByRole("alert").filter({ hasText: "projectName" })).toBeVisible();
  await expect(dependency(page)).toHaveValue("99FS");
  await upload(page, fixture("Replacement plan"));
  await page.getByRole("button", { name: "Import", exact: true }).last().click();
  await expect(page.getByTestId("project-name")).toHaveText("Replacement plan");
  await cleanDependency(page);
  await expect(page.getByTestId("save-status")).toHaveText("Saved in this browser");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pm_project")).tasks[0].predecessors)).toEqual([]);
  expect(errors).toEqual([]);
});

test("linked reload clears same-ID dependency drafts without saving into the local project", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(({ local, linked }) => {
    localStorage.setItem("pm_project", JSON.stringify(local));
    localStorage.setItem("pm_versions", "[]");
    localStorage.setItem("pm_ui_locale", JSON.stringify("en"));
    window.showOpenFilePicker = async () => {
      const directory = await navigator.storage.getDirectory();
      const handle = await directory.getFileHandle("integration-linked.json", { create: true });
      const stream = await handle.createWritable();
      await stream.write(JSON.stringify(linked)); await stream.close();
      window.__integrationLinkedHandle = handle;
      return [handle];
    };
  }, { local: fixture("Local plan"), linked: fixture("Linked plan") });
  await page.goto("/project_scheduler.html?schedule=integration-draft-reset");
  await page.getByRole("button", { name: "Select JSON", exact: true }).click();
  await expect(page.getByTestId("project-name")).toHaveText("Linked plan");
  await dirtyDependency(page);
  await page.evaluate(async data => {
    const stream = await window.__integrationLinkedHandle.createWritable();
    await stream.write(JSON.stringify(data)); await stream.close();
  }, fixture("Reloaded linked plan"));
  await page.getByRole("button", { name: "Reload latest", exact: true }).click();
  await expect(page.getByTestId("project-name")).toHaveText("Reloaded linked plan");
  await cleanDependency(page);
  await expect(page.getByTestId("save-status")).toContainText("Automatic saving is off");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pm_project")).projectName)).toBe("Local plan");
  expect(errors).toEqual([]);
});

test("a slow JSON read preserves version additions, renames and deletions made before confirmation", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const current = fixture("Current plan");
  current.versions = [
    { id: "keep", name: "Keep version", createdAt: 2, tasks: [] },
    { id: "remove", name: "Remove version", createdAt: 1, tasks: [] },
  ];
  await page.addInitScript(data => {
    const { versions, ...project } = data;
    localStorage.setItem("pm_project", JSON.stringify(project));
    localStorage.setItem("pm_versions", JSON.stringify(versions));
    localStorage.setItem("pm_ui_locale", JSON.stringify("en"));
    const read = File.prototype.text;
    File.prototype.text = async function () {
      const text = await read.call(this);
      if (this.name === "slow.json") await new Promise(resolve => { window.__releaseImport = resolve; });
      return text;
    };
  }, current);
  await page.goto("/project_scheduler.html");
  await expect(page.getByTestId("save-status")).toHaveText("Saved in this browser");
  await page.locator('input[type="file"][aria-label="Import"]').setInputFiles({
    name: "slow.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture("Imported plan"))),
  });
  await page.waitForFunction(() => typeof window.__releaseImport === "function");
  await page.getByRole("button", { name: /^Versions/ }).click();
  await page.locator('input[value="Keep version"]').fill("Renamed while reading");
  await page.getByRole("row").filter({ has: page.locator('input[value="Remove version"]') }).getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("textbox", { name: "Version name", exact: true }).fill("Added while reading");
  await page.getByRole("button", { name: "Save current schedule", exact: true }).click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved in this browser");
  await page.evaluate(() => window.__releaseImport());
  await page.getByRole("button", { name: "Import", exact: true }).last().click();
  await expect(page.getByTestId("project-name")).toHaveText("Imported plan");
  await expect(page.getByTestId("save-status")).toHaveText("Saved in this browser");
  const names = await page.evaluate(() => JSON.parse(localStorage.getItem("pm_versions")).map(version => version.name));
  expect(names).toEqual(["Added while reading", "Renamed while reading"]);
  expect(errors).toEqual([]);
});
