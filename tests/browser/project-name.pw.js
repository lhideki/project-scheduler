import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const fixture = (projectName = "Initial project") => ({
  schemaVersion: 1, exportedAt: "2026-10-06T12:00:00.000Z", projectName,
  tasks: [{ id: "t1", name: "Design", parentId: null, order: 0, startDate: "2026-10-01", duration: 2 }],
  resources: [], sprints: [], versions: [], levelingOn: false, calendarExceptions: [],
});
const errors = new WeakMap();
test.beforeEach(({ page }) => { const list = []; errors.set(page, list); page.on("pageerror", error => list.push(error.message)); });
test.afterEach(({ page }) => { expect(errors.get(page)).toEqual([]); });
async function boot(page, project = fixture(), query = "") {
  await page.addInitScript(project => {
    if (!localStorage.getItem("name-fixture")) {
      const { versions, ...plan } = project;
      localStorage.setItem("pm_project", JSON.stringify(plan));
      localStorage.setItem("pm_versions", JSON.stringify(versions));
      localStorage.setItem("name-fixture", "true");
      localStorage.setItem("pm_ui_locale", JSON.stringify("en"));
    }
    window.__failNameSave = false;
    window.__planWrites = [];
    window.storage = {
      async get(key) { const value = localStorage.getItem(key); return value === null ? null : { value }; },
      async set(key, value) {
        if (key !== "pm_ui_locale") { window.__planWrites.push(key); if (window.__failNameSave) return false; }
        localStorage.setItem(key, value); return true;
      },
    };
  }, project);
  await page.goto(`/project_scheduler.html${query}`);
  await expect(page.getByTestId("save-status")).toBeVisible();
}
const saved = page => expect(page.getByTestId("save-status")).toHaveText("Saved in this browser");
async function nameIs(page, value, defaultName = "Untitled project") {
  await expect(page.getByTestId("project-name")).toHaveText(value || defaultName);
  await expect(page).toHaveTitle(`${value || defaultName} | Project Scheduler`);
}
async function rename(page, name) {
  await page.getByRole("button", { name: "Edit project name", exact: true }).click();
  await page.getByRole("textbox", { name: "Project name", exact: true }).fill(name);
  await page.getByRole("button", { name: "Apply name", exact: true }).click();
}
async function download(page, label = "Export JSON") {
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("menuitem", { name: label, exact: true }).click();
  return await readFile(await (await event).path(), "utf8");
}
const exportJSON = async page => JSON.parse(await download(page));
async function upload(page, data) {
  await page.locator('input[type="file"][aria-label="Import"]').setInputFiles({ name: "plan.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });
}
async function capture(page, testInfo, name) {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test("sets, changes and cancels names, including keyboard and IME composition", async ({ page }, testInfo) => {
  await boot(page); await saved(page);
  const before = await exportJSON(page);
  await rename(page, "  新製品リリース / Q4 & 展開　"); await saved(page);
  await nameIs(page, "新製品リリース / Q4 & 展開");
  expect((await exportJSON(page)).tasks).toEqual(before.tasks);
  for (const cancel of ["button", "Escape"]) {
    await page.getByRole("button", { name: "Edit project name", exact: true }).click();
    await page.getByRole("textbox", { name: "Project name", exact: true }).fill("Discard this draft");
    await expect(page).toHaveTitle("新製品リリース / Q4 & 展開 | Project Scheduler");
    expect((await exportJSON(page)).projectName).toBe("新製品リリース / Q4 & 展開");
    if (cancel === "button") await page.getByRole("button", { name: "Cancel name edit", exact: true }).click();
    else await page.getByRole("textbox", { name: "Project name", exact: true }).press("Escape");
    await expect(page.getByRole("button", { name: "Edit project name", exact: true })).toBeFocused();
  }
  await page.getByRole("button", { name: "Edit project name", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Project name", exact: true });
  await input.fill("日本語の確定");
  for (const composition of [{ isComposing: true, keyCode: 13 }, { isComposing: false, keyCode: 229 }]) {
    const allowed = await input.evaluate((element, composition) => element.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter", code: "Enter", bubbles: true, cancelable: true, ...composition,
    })), composition);
    expect(allowed, "IME confirmation must cancel implicit form submission").toBe(false);
    await expect(input).toBeVisible();
  }
  await input.press("Enter"); await saved(page);
  await page.reload(); await saved(page); await nameIs(page, "日本語の確定");
  await capture(page, testInfo, "49-01-project-name-saved.png");
});

test("a taskless named plan persists and the unnamed label follows the display language", async ({ page }, testInfo) => {
  await boot(page, { ...fixture(""), tasks: [] }); await saved(page);
  await nameIs(page, "");
  await rename(page, "タスク追加前の計画"); await saved(page);
  await page.reload(); await saved(page); await nameIs(page, "タスク追加前の計画");
  expect((await exportJSON(page)).tasks).toEqual([]);
  await rename(page, "　 \t "); await saved(page); await nameIs(page, "");
  expect((await exportJSON(page)).projectName).toBe("");
  await page.getByRole("combobox", { name: "Display language" }).selectOption("ja");
  await nameIs(page, "", "無題のプロジェクト");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pm_project")).projectName)).toBe("");
  await capture(page, testInfo, "49-02-unnamed-empty-project-ja.png");
});

test("JSON round trips, cancellation and invalid name types protect the current plan", async ({ page }, testInfo) => {
  await boot(page); await saved(page);
  await page.locator('input[value="Design"]').fill("Edited design"); await saved(page);
  const original = await exportJSON(page);
  for (const projectName of [null, 12, [], {}]) {
    await upload(page, { ...fixture(), projectName, tasks: [] });
    await expect(page.getByRole("alert")).toContainText("projectName");
    await nameIs(page, original.projectName);
    const { exportedAt: ignoredBefore, ...beforePlan } = original;
    const { exportedAt: ignoredAfter, ...afterPlan } = await exportJSON(page);
    expect(afterPlan).toEqual(beforePlan);
  }
  await capture(page, testInfo, "49-03-invalid-name-preserves-plan.png");
  await upload(page, fixture("Cancelled name"));
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await nameIs(page, original.projectName);
  await page.getByRole("button", { name: "Edit project name", exact: true }).focus();
  await page.keyboard.press("Control+z");
  await expect(page.locator('input[value="Design"]')).toBeVisible();
  await rename(page, "Changed name");
  await upload(page, original); await page.getByRole("button", { name: "Import", exact: true }).last().click();
  await saved(page); await nameIs(page, original.projectName);
  // A successful whole-plan import discards drafts even when the name is the same.
  await page.getByRole("button", { name: "Edit project name", exact: true }).click();
  await page.getByRole("textbox", { name: "Project name", exact: true }).fill("Stale draft");
  await upload(page, original); await page.getByRole("button", { name: "Import", exact: true }).last().click();
  await expect(page.getByRole("textbox", { name: "Project name", exact: true })).toHaveCount(0);
  const old = fixture(); delete old.projectName;
  await upload(page, old); await page.getByRole("button", { name: "Import", exact: true }).last().click();
  await nameIs(page, "");
});

test("name changes participate in save failure, emergency backup and retry", async ({ page }) => {
  await boot(page); await saved(page);
  await page.evaluate(() => { window.__failNameSave = true; });
  await rename(page, "Unsaved name");
  await expect(page.getByTestId("save-status")).toHaveText("Could not save");
  await nameIs(page, "Unsaved name");
  expect((await exportJSON(page)).projectName).toBe("Unsaved name");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pm_project")).projectName)).toBe("Initial project");
  await page.evaluate(() => { window.__failNameSave = false; });
  await page.getByRole("button", { name: "Retry saving", exact: true }).click(); await saved(page);
  await page.reload(); await saved(page); await nameIs(page, "Unsaved name");
});

test("restoring a schedule version keeps the current project name", async ({ page }) => {
  await boot(page); await saved(page);
  await page.getByRole("button", { name: /^Versions/ }).click();
  await page.getByRole("textbox", { name: "Version name", exact: true }).fill("Before rename");
  await page.getByRole("button", { name: "Save current schedule", exact: true }).click();
  await rename(page, "Current project name");
  await page.getByRole("button", { name: "Restore this version’s tasks, resources, sprints, calendar, and saved leveling setting", exact: true }).click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await nameIs(page, "Current project name");
  expect((await exportJSON(page)).versions[0]).not.toHaveProperty("projectName");
});

test("shareable HTML preserves long, markup-like names through open and re-export", async ({ page }, testInfo) => {
  await boot(page); await saved(page);
  const name = '日本語 </script><script>window.injected=true</script> & "記号" ' + "長い名前🌸".repeat(100);
  await rename(page, name); await saved(page); await nameIs(page, name);
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  await page.setViewportSize({ width: 480, height: 900 });
  const box = await page.getByTestId("project-name").boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(480);
  await capture(page, testInfo, "49-04-long-safe-name-narrow.png");
  await page.setViewportSize({ width: 1600, height: 1000 });
  const html = await download(page, "Export shareable HTML");
  const prior = await page.evaluate(() => localStorage.getItem("pm_project"));
  await page.route("**/named-share.html", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("/named-share.html"); await nameIs(page, name);
  await expect(page.getByTestId("save-status")).toContainText("Automatic saving is off");
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  expect((await exportJSON(page)).projectName).toBe(name);
  await rename(page, "Shared updated name");
  const updated = await download(page, "Export shareable HTML");
  await page.route("**/renamed-share.html", route => route.fulfill({ contentType: "text/html", body: updated }));
  await page.goto("/renamed-share.html"); await nameIs(page, "Shared updated name");
  expect((await exportJSON(page)).projectName).toBe("Shared updated name");
  await page.reload(); await nameIs(page, "Shared updated name");
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => localStorage.getItem("pm_project"))).toBe(prior);
  expect(await page.evaluate(() => window.__planWrites)).toEqual([]);
  await capture(page, testInfo, "49-05-shared-name-roundtrip.png");
});

test("linked file reload replaces the name without changing the key or local storage", async ({ page }, testInfo) => {
  // Use a real, isolated OPFS handle so IndexedDB exercises the production association path.
  await page.addInitScript(project => {
    window.showOpenFilePicker = async () => {
      const directory = await navigator.storage.getDirectory();
      const handle = await directory.getFileHandle("linked-name-fixture.json", { create: true });
      const stream = await handle.createWritable(); await stream.write(JSON.stringify(project)); await stream.close();
      window.__linkedNameHandle = handle;
      return [handle];
    };
  }, fixture("Linked first name"));
  await boot(page, fixture(), "?schedule=stable-association");
  await page.getByRole("button", { name: "Select JSON", exact: true }).click();
  await nameIs(page, "Linked first name");
  await rename(page, "Linked screen-only edit");
  expect(new URL(page.url()).searchParams.get("schedule")).toBe("stable-association");
  await page.evaluate(async project => {
    const stream = await window.__linkedNameHandle.createWritable(); await stream.write(JSON.stringify(project)); await stream.close();
  }, fixture("Linked updated name"));
  await page.getByRole("button", { name: "Reload latest", exact: true }).click();
  await nameIs(page, "Linked updated name");
  const old = fixture(); delete old.projectName;
  await page.evaluate(async project => {
    const stream = await window.__linkedNameHandle.createWritable(); await stream.write(JSON.stringify(project)); await stream.close();
  }, old);
  await page.getByRole("button", { name: "Reload latest", exact: true }).click(); await nameIs(page, "");
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pm_project")).projectName)).toBe("Initial project");
  expect(await page.evaluate(() => window.__planWrites)).toEqual([]);
  await capture(page, testInfo, "49-06-linked-name-reloaded.png");
});
