import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const fixture = (levelingOn = true) => ({
  schemaVersion: 1,
  tasks: [
    { id: "design", name: "Design", parentId: null, order: 0, startDate: "2026-10-01", duration: 2, assigneeId: "r1", sprintIds: ["s1"], predecessors: [] },
    { id: "build", name: "Build", parentId: null, order: 1, startDate: "2026-10-01", duration: 2, assigneeId: "r1", sprintIds: ["s1"], predecessors: [] },
    { id: "test", name: "Test", parentId: null, order: 2, startDate: "2026-10-01", duration: 1, assigneeId: null, sprintIds: [], predecessors: [{ id: "build", type: "FS", lag: 0 }] },
  ],
  resources: [{ id: "r1", name: "Engineer", weeklyCapacity: 2, monthlyCapacity: 20 }],
  sprints: [{ id: "s1", name: "October", startDate: "2026-10-01", endDate: "2026-10-30", order: 0 }],
  versions: [], levelingOn,
  calendarExceptions: [{ date: "2026-10-07", type: "holiday", name: "Test holiday" }],
});
const cell = (page, task, column = "name") => page.locator(`[data-wbs-cell="${task}:${column}"]`);
const undo = page => page.getByRole("button", { name: "Undo", exact: true }).click();
const redo = page => page.getByRole("button", { name: "Redo", exact: true }).click();
const saved = page => expect(page.getByTestId("save-status")).toHaveText("Saved in this browser");
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem("pm_project")));
const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  errors.set(page, []);
  page.on("pageerror", error => errors.get(page).push(error.message));
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });
async function boot(page, data = fixture()) {
  await page.addInitScript(data => {
    if (!localStorage.getItem("undo-fixture")) {
      const { versions, ...plan } = data;
      localStorage.setItem("pm_project", JSON.stringify(plan));
      localStorage.setItem("pm_versions", JSON.stringify(versions));
      localStorage.setItem("pm_ui_locale", JSON.stringify("en"));
      localStorage.setItem("undo-fixture", "true");
    }
  }, data);
  await page.goto("/project_scheduler.html");
  await saved(page);
}
async function snapshot(page, name) {
  await page.getByRole("button", { name: /^Versions/ }).click();
  await page.getByRole("textbox", { name: "Version name", exact: true }).fill(name);
  await page.getByRole("button", { name: "Save current schedule", exact: true }).click();
  await saved(page);
}
async function exportJSON(page) {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("menuitem", { name: "Export JSON", exact: true }).click();
  return JSON.parse(await readFile(await (await download).path(), "utf8"));
}
async function evidence(page, testInfo, name) {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: "image/png" });
}
async function restore(page, name, accept = true) {
  const row = page.getByRole("row").filter({ has: page.locator(`input[value="${name}"]`) });
  await row.getByRole("button", { name: /^Restore/ }).click();
  await page.getByRole("button", { name: accept ? "Restore" : "Cancel", exact: true }).click();
  await saved(page);
}

test("continuous cell input, same-cell re-edit and separate cells undo as committed operations", async ({ page }, testInfo) => {
  await boot(page);
  await cell(page, "design").press("End");
  await cell(page, "design").pressSequentially(" revised");
  await cell(page, "design").press("Enter");
  await expect(cell(page, "build")).toBeFocused();
  await undo(page);
  await expect(cell(page, "design")).toHaveValue("Design");
  await redo(page);
  await expect(cell(page, "design")).toHaveValue("Design revised");
  await evidence(page, testInfo, "48-cell-edit-redo.png");
  await cell(page, "design").press("End");
  await cell(page, "design").pressSequentially(" again");
  await cell(page, "build").fill("Build second");
  await cell(page, "build").blur();
  await undo(page);
  await expect(cell(page, "build")).toHaveValue("Build");
  await expect(cell(page, "design")).toHaveValue("Design revised again");
  await undo(page);
  await expect(cell(page, "design")).toHaveValue("Design revised");
  await undo(page);
  await expect(cell(page, "design")).toHaveValue("Design");
});

test("native input undo never consumes a previously committed task operation", async ({ page }) => {
  await boot(page);
  await cell(page, "design").fill("Committed design");
  await cell(page, "build").press("End");
  await cell(page, "build").pressSequentially(" local");
  await cell(page, "build").press("Control+z");
  await expect(cell(page, "build")).toHaveValue("Build");
  await expect(cell(page, "design")).toHaveValue("Committed design");
  await cell(page, "build").blur();
  await undo(page);
  await expect(cell(page, "design")).toHaveValue("Design");
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
});

test("no-op confirmations retain redo; a new committed edit discards it", async ({ page }) => {
  await boot(page);
  await cell(page, "design").fill("Changed");
  await undo(page);
  await cell(page, "design").focus();
  await cell(page, "design").blur();
  await expect(page.getByRole("button", { name: "Redo", exact: true })).toBeEnabled();
  await cell(page, "design").fill("Temporary");
  await cell(page, "design").fill("Design");
  await cell(page, "design").blur();
  await expect(page.getByRole("button", { name: "Redo", exact: true })).toBeEnabled();
  await cell(page, "design").fill("New branch");
  await cell(page, "design").blur();
  await expect(page.getByRole("button", { name: "Redo", exact: true })).toBeDisabled();
});

test("IME composition does not trigger Enter, navigation, indent or app Undo", async ({ page }) => {
  await boot(page);
  const input = cell(page, "design");
  await input.focus();
  await input.dispatchEvent("compositionstart", { data: "設" });
  await input.fill("設計中");
  // Synthetic IME lifecycle verifies app handlers, not an operating-system candidate window.
  // Dispatch keys without native defaults; a real IME owns Tab/arrows while composing.
  for (const key of ["Enter", "ArrowDown", "Tab", "z"]) {
    await input.dispatchEvent("keydown", { key, isComposing: true, keyCode: 229, ctrlKey: key === "z" });
  }
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("設計中");
  await input.dispatchEvent("compositionend", { data: "設計中" });
  await input.press("Enter");
  await expect(cell(page, "build")).toBeFocused();
  await undo(page);
  await expect(input).toHaveValue("Design");
});

test("paste, indent, row reorder and scheduling remain separate reversible operations", async ({ page }) => {
  await boot(page, fixture(false));
  await cell(page, "build").fill("Typed build");
  await cell(page, "build").evaluate(input => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", "Pasted build");
    input.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }));
  });
  await expect(cell(page, "build")).toHaveValue("Pasted build");
  await undo(page);
  await expect(cell(page, "build")).toHaveValue("Typed build");
  await undo(page);
  await expect(cell(page, "build")).toHaveValue("Build");
  await cell(page, "build").press("Tab");
  await saved(page);
  await expect.poll(async () => (await stored(page)).tasks.find(task => task.id === "build").parentId).toBe("design");
  await undo(page);
  await saved(page);
  await expect.poll(async () => (await stored(page)).tasks.find(task => task.id === "build").parentId).toBeNull();
  await redo(page); await undo(page);
  const grips = page.getByTitle("Drag to reorder");
  const first = await grips.first().boundingBox();
  const last = await grips.last().boundingBox();
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(last.x + last.width / 2, last.y + last.height + 10, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("[data-wbs-row-id]").first()).toHaveAttribute("data-wbs-row-id", "build");
  await undo(page);
  await expect(page.locator("[data-wbs-row-id]").first()).toHaveAttribute("data-wbs-row-id", "design");
  await redo(page); await undo(page);
  await page.getByRole("button", { name: "Run auto-scheduling", exact: true }).click();
  await saved(page);
  // A previous Saved badge can still be visible before the latest autosave effect runs.
  // Wait for the intended persisted value before reading the complete schedule.
  await expect.poll(async () => (await stored(page)).tasks.find(task => task.id === "test").startDate).not.toBe("2026-10-01");
  const scheduled = (await stored(page)).tasks;
  await page.keyboard.press("Control+z"); // header focus, outside a text input
  await saved(page);
  await expect.poll(async () => (await stored(page)).tasks.find(task => task.id === "test").startDate).toBe("2026-10-01");
  await redo(page); await saved(page);
  await expect.poll(async () => (await stored(page)).tasks).toEqual(scheduled);
});

for (const leveling of [true, false]) {
  test(`restore returns every raw input and leveling=${leveling}, then resets Undo/Redo`, async ({ page }, testInfo) => {
    const initial = fixture(leveling);
    await boot(page, initial);
    await snapshot(page, "Saved conditions");
    const before = (await exportJSON(page)).versions[0];
    expect(before.rawLevelingOn).toBe(leveling);
    await page.getByLabel("Enable resource leveling").setChecked(!leveling);
    await page.getByRole("button", { name: "Resources", exact: true }).click();
    await page.locator('input[type="number"]').first().fill("5");
    await page.getByRole("button", { name: /^Sprints/ }).click();
    await page.locator('input[type="date"]').first().fill("2026-10-05");
    await page.getByRole("button", { name: /^Calendar/ }).click();
    await page.locator('input[value="Test holiday"]').fill("Changed holiday");
    await page.getByRole("button", { name: "WBS / Gantt", exact: true }).click();
    await cell(page, "design").fill("Changed design");
    await page.getByRole("button", { name: /^Versions/ }).click();
    await restore(page, "Saved conditions", false);
    expect((await exportJSON(page)).tasks[0].name).toBe("Changed design");
    await restore(page, "Saved conditions");
    const restored = await exportJSON(page);
    for (const key of ["tasks", "resources", "sprints", "calendarExceptions", "levelingOn"]) expect(restored[key]).toEqual(initial[key]);
    await snapshot(page, "Restored conditions");
    expect((await exportJSON(page)).versions[0].tasks).toEqual(before.tasks);
    await page.getByRole("button", { name: "WBS / Gantt", exact: true }).click();
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Redo", exact: true })).toBeDisabled();
    await evidence(page, testInfo, `48-restored-leveling-${leveling}.png`);
    await page.reload(); await saved(page);
    expect((await exportJSON(page)).levelingOn).toBe(leveling);
  });
}

test("legacy snapshot keeps current leveling with a warning and comparison-only versions cannot restore", async ({ page }) => {
  const initial = fixture(true);
  initial.versions = [
    { id: "legacy", name: "Legacy", createdAt: 1, tasks: [], hasFullSnapshot: true, rawTasks: initial.tasks, rawResources: initial.resources, rawSprints: initial.sprints },
    { id: "compare", name: "Compare only", createdAt: 2, tasks: [], hasFullSnapshot: false },
  ];
  await boot(page, initial);
  await page.getByRole("button", { name: /^Versions/ }).click();
  const legacy = page.getByRole("row").filter({ has: page.locator('input[value="Legacy"]') });
  await legacy.getByRole("button", { name: /^Restore/ }).click();
  await expect(page.getByText(/This older version did not record resource leveling/)).toBeVisible();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  expect((await exportJSON(page)).levelingOn).toBe(true);
  await expect(page.getByRole("row").filter({ has: page.locator('input[value="Compare only"]') }).getByRole("button", { name: /cannot be restored/ })).toBeDisabled();
});

test("numeric and dependency cells commit on Enter without no-op history", async ({ page }) => {
  await boot(page);
  await cell(page, "design", "duration").fill("12");
  await cell(page, "design", "duration").press("Enter");
  await cell(page, "design", "duration").fill("15");
  await cell(page, "design", "duration").press("Enter");
  await undo(page);
  await expect(cell(page, "design", "duration")).toHaveValue("12");
  await undo(page);
  await expect(cell(page, "design", "duration")).toHaveValue("2");
  await cell(page, "build", "predecessors").fill("1FS");
  await cell(page, "build", "predecessors").press("Enter");
  await saved(page);
  await expect.poll(async () => (await stored(page)).tasks.find(task => task.id === "build").predecessors).toEqual([{ id: "design", type: "FS", lag: 0 }]);
  await cell(page, "build", "predecessors").focus();
  await cell(page, "build", "predecessors").press("Enter");
  await undo(page); await saved(page);
  await expect.poll(async () => (await stored(page)).tasks.find(task => task.id === "build").predecessors).toEqual([]);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
});

test("detail name and multiline notes commit independently, including Escape dismissal", async ({ page }) => {
  await boot(page);
  await cell(page, "design").focus();
  await page.getByRole("button", { name: "Details", exact: true }).click();
  const name = page.locator(".max-w-lg").locator("input").first();
  await name.press("End");
  await name.pressSequentially(" detail");
  await name.press("Enter");
  const notes = page.getByPlaceholder("Enter notes about this task");
  await notes.pressSequentially("Line one");
  await notes.press("Enter");
  await notes.pressSequentially("Line two");
  await notes.press("Escape");
  await expect(notes).toHaveCount(0);
  await undo(page); await saved(page);
  await expect.poll(async () => (await stored(page)).tasks[0].name).toBe("Design detail");
  await expect.poll(async () => (await stored(page)).tasks[0].notes).toBeUndefined();
  await undo(page);
  await expect(cell(page, "design")).toHaveValue("Design");
});
