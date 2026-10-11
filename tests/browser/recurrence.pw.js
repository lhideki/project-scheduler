import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const leaf = (id, name, order, extra = {}) => ({ id, name, parentId: null, order, startDate: "2026-10-12", duration: 1, assigneeId: "r", progress: 0, sprintIds: [], predecessors: [], ...extra });
const fixture = (recurring = false) => ({
  schemaVersion: 1, projectName: "Recurring operations", tasks: [
    leaf("series", "Daily review", 0, recurring ? { recurrence: { frequency: "daily", interval: 1, endDate: "2026-10-14" } } : {}),
    leaf("delivery", "Delivery", 1),
  ], resources: [{ id: "r", name: "Engineer", weeklyCapacity: 2, monthlyCapacity: 10 }],
  sprints: [], calendarExceptions: [{ date: "2026-10-12", type: "holiday", name: "Calendar exception" }], levelingOn: false,
});
const cell = (page, id, column) => page.locator(`[data-wbs-cell="${id}:${column}"]`);
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem("pm_project")));
const series = async page => (await stored(page)).tasks.find(task => task.id === "series");
const bars = page => page.locator('[data-series-id="series"][data-occurrence-date]');
const dialog = page => page.getByRole("dialog", { name: "Daily review", exact: true });
const rule = page => page.locator('[data-recurrence-editor="rule"]');
const occurrence = page => page.locator('[data-recurrence-editor="occurrence"]');
async function boot(page, data = fixture()) {
  await page.addInitScript(data => {
    if (!localStorage.getItem("recurrence-fixture")) {
      localStorage.setItem("pm_project", JSON.stringify(data));
      localStorage.setItem("pm_versions", "[]");
      localStorage.setItem("pm_ui_locale", JSON.stringify("en"));
      localStorage.setItem("recurrence-fixture", "true");
    }
  }, data);
  await page.goto("/project_scheduler.html");
  await cell(page, "series", "name").waitFor();
}
async function openDetail(page) {
  await cell(page, "series", "name").click();
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await dialog(page).waitFor();
}
async function closeDetail(page) { await dialog(page).getByRole("button", { name: "Close", exact: true }).last().click(); }
async function evidence(page, testInfo, name, fullPage = true) {
  await expect(page.getByTestId("save-status")).toHaveText(/^(Saved in this browser|このブラウザに保存済み)$/);
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage });
  await testInfo.attach(name, { path, contentType: "image/png" });
}
async function exportJSON(page) {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("menuitem", { name: "Export JSON", exact: true }).click();
  return JSON.parse(await readFile(await (await download).path(), "utf8"));
}
const errors = new WeakMap();
test.beforeEach(async ({ page }) => { errors.set(page, []); page.on("pageerror", error => errors.get(page).push(error.message)); });
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

test("recurrence rule drafts cancel safely, validate, and save as one undoable edit", async ({ page }, testInfo) => {
  await boot(page);
  await openDetail(page);
  await dialog(page).getByRole("button", { name: "Add recurrence", exact: true }).click();
  await rule(page).getByLabel("Series start (required)", { exact: true }).fill("");
  await rule(page).getByRole("button", { name: "Save recurrence", exact: true }).click();
  await expect(rule(page).getByRole("alert")).toHaveText("Enter a complete, valid series start date.");
  expect((await series(page)).recurrence).toBeUndefined();
  await rule(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await closeDetail(page);
  await openDetail(page);
  await dialog(page).getByRole("button", { name: "Add recurrence", exact: true }).click();
  await expect(rule(page).getByLabel("Series start (required)", { exact: true })).toHaveValue("2026-10-12");
  await rule(page).getByLabel("Frequency", { exact: true }).selectOption("daily");
  await rule(page).getByLabel("End date (optional, inclusive)", { exact: true }).fill("2026-10-14");
  await rule(page).getByRole("button", { name: "Save recurrence", exact: true }).click();
  await expect.poll(async () => (await series(page)).recurrence).toEqual({ frequency: "daily", interval: 1, endDate: "2026-10-14" });
  await closeDetail(page);
  await expect(bars(page)).toHaveCount(3);
  await expect(cell(page, "series", "startDate")).toHaveAttribute("readonly", "");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await series(page)).recurrence).toBeUndefined();
  await expect(bars(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(bars(page)).toHaveCount(3);
  await expect.poll(async () => (await series(page)).recurrence).toEqual({ frequency: "daily", interval: 1, endDate: "2026-10-14" });
  await expect(page.getByTestId("save-status")).toHaveText("Saved in this browser");
  await evidence(page, testInfo, "60-recurring-bars-en.png");
  await page.reload();
  await expect(bars(page)).toHaveCount(3);
});

test("single-occurrence changes keep original identity through cancel, reset, export and import", async ({ page }, testInfo) => {
  await boot(page, fixture(true));
  const middle = page.locator('[data-series-id="series"][data-occurrence-date="2026-10-13"]');
  await middle.focus(); await page.keyboard.press("Enter");
  await expect(occurrence(page)).toContainText("Occurrence originally on 2026-10-13");
  await occurrence(page).getByLabel("Occurrence start", { exact: true }).fill("2026-10-17");
  await occurrence(page).getByRole("button", { name: "Save occurrence", exact: true }).click();
  await expect(occurrence(page).getByRole("alert")).toContainText("The end must be on or after the start");
  expect((await series(page)).occurrenceOverrides).toBeUndefined();
  await occurrence(page).getByLabel("Occurrence end", { exact: true }).fill("2026-10-18");
  await occurrence(page).getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await series(page)).occurrenceOverrides).toBeUndefined();
  await closeDetail(page); await middle.click();
  await expect(occurrence(page).getByLabel("Occurrence start", { exact: true })).toHaveValue("2026-10-13");
  await occurrence(page).getByLabel("Occurrence start", { exact: true }).fill("2026-10-17");
  await occurrence(page).getByLabel("Occurrence end", { exact: true }).fill("2026-10-18");
  await occurrence(page).getByLabel("This occurrence’s predecessors", { exact: true }).fill("2FS");
  await occurrence(page).getByRole("button", { name: "Save occurrence", exact: true }).click();
  await expect.poll(async () => (await series(page)).occurrenceOverrides?.["2026-10-13"]).toEqual({ startDate: "2026-10-17", endDate: "2026-10-18", predecessors: [{ id: "delivery", type: "FS", lag: 0 }] });
  await closeDetail(page);
  await expect(middle).toHaveAttribute("data-overridden", "true");
  await expect(middle).toHaveAttribute("aria-label", /original occurrence 2026-10-13.*Oct 17, 2026/);
  await expect(bars(page)).toHaveCount(3);
  await cell(page, "delivery", "predecessors").fill("1@2026-10-13FS+1");
  await cell(page, "delivery", "predecessors").blur();
  await expect.poll(async () => (await stored(page)).tasks[1].predecessors).toEqual([{ id: "series", occurrenceDate: "2026-10-13", type: "FS", lag: 1 }]);
  const exported = await exportJSON(page);
  await page.locator('input[type="file"][aria-label="Import"]').setInputFiles({ name: "recurrence-roundtrip.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(exported)) });
  await page.getByRole("button", { name: "Import", exact: true }).last().click();
  await expect.poll(async () => (await stored(page)).tasks.find(task => task.id === "series").occurrenceOverrides).toEqual(exported.tasks.find(task => task.id === "series").occurrenceOverrides);
  await expect(bars(page)).toHaveCount(3);
  await page.reload();
  await expect(middle).toHaveAttribute("data-overridden", "true");
  await middle.click();
  await evidence(page, testInfo, "60-occurrence-editor-en.png");
  await occurrence(page).getByRole("button", { name: "Reset this occurrence", exact: true }).click();
  await expect.poll(async () => (await series(page)).occurrenceOverrides).toEqual({});
  await closeDetail(page);
  await expect(middle).not.toHaveAttribute("data-overridden", "true");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(middle).toHaveAttribute("data-overridden", "true");
});

test("calendar dates and finite horizons survive recalculation, leveling and viewport changes", async ({ page }, testInfo) => {
  const data = fixture(true);
  data.tasks[0].recurrence = { frequency: "weekly", interval: 1, weekdays: [0, 1], calculationEndDate: "2026-11-02" };
  data.tasks[0].predecessors = [{ id: "delivery", type: "FS", lag: 10 }];
  await boot(page, data);
  const dates = await bars(page).evaluateAll(elements => elements.map(el => el.getAttribute("data-occurrence-date")));
  expect(dates).toContain("2026-10-18");
  expect(dates).toContain("2026-10-12");
  const before = await series(page);
  await page.getByRole("button", { name: "Run auto-scheduling", exact: true }).click();
  await expect(page.getByRole("region", { name: "Recalculation result", exact: true })).toContainText("Unresolved issues:");
  await page.getByLabel("Enable resource leveling", { exact: true }).check();
  await page.getByRole("button", { name: "Run auto-scheduling", exact: true }).click();
  expect(await bars(page).evaluateAll(elements => elements.map(el => el.getAttribute("data-occurrence-date")))).toEqual(dates);
  await page.setViewportSize({ width: 1000, height: 800 });
  const zoom = page.getByRole("button", { name: /Zoom out/i });
  if (await zoom.count()) { await zoom.click(); await zoom.click(); }
  expect(await bars(page).evaluateAll(elements => elements.map(el => el.getAttribute("data-occurrence-date")))).toEqual(dates);
  expect((await series(page)).recurrence).toEqual(before.recurrence);
  expect((await series(page)).startDate).toBe(before.startDate);
  await evidence(page, testInfo, "60-fixed-conflicts-en.png");
  await page.getByLabel("Display language", { exact: true }).selectOption("ja");
  await cell(page, "series", "name").click();
  await page.getByRole("button", { name: "詳細", exact: true }).click();
  await expect(dialog(page)).toContainText("繰り返し");
  await evidence(page, testInfo, "60-recurrence-ja.png");
});


test("date-only edits preserve inherited dependencies and dormant changes survive rule edits", async ({ page }) => {
  const data = fixture(true);
  data.tasks[0].predecessors = [{ id: "delivery", type: "FS", lag: 0 }];
  await boot(page, data);
  await page.locator('[data-series-id="series"][data-occurrence-date="2026-10-13"]').click();
  await occurrence(page).getByLabel("Occurrence start", { exact: true }).fill("2026-10-17");
  await occurrence(page).getByLabel("Occurrence end", { exact: true }).fill("2026-10-18");
  await occurrence(page).getByRole("button", { name: "Save occurrence", exact: true }).click();
  const expected = { startDate: "2026-10-17", endDate: "2026-10-18" };
  await expect.poll(async () => (await series(page)).occurrenceOverrides?.["2026-10-13"]).toEqual(expected);
  await dialog(page).getByRole("button", { name: "Edit recurrence", exact: true }).click();
  await rule(page).getByLabel("Frequency", { exact: true }).selectOption("weekly");
  await rule(page).getByRole("button", { name: "Save recurrence", exact: true }).click();
  await expect(dialog(page)).toContainText("1 saved occurrence changes are outside the current rule");
  expect((await series(page)).occurrenceOverrides["2026-10-13"]).toEqual(expected);
  await closeDetail(page);
  await expect(bars(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(bars(page)).toHaveCount(3);
  await expect(page.locator('[data-series-id="series"][data-occurrence-date="2026-10-13"]')).toHaveAttribute("data-overridden", "true");
});

test("deleting an override predecessor cleans active and dormant references without losing dates", async ({ page }) => {
  const data = fixture(true);
  const deps = [{ id: "delivery", type: "FS", lag: 0 }];
  data.tasks[0].occurrenceOverrides = {
    "2026-10-13": { startDate: "2026-10-17", endDate: "2026-10-18", predecessors: deps },
    "2026-11-01": { startDate: "2026-11-02", predecessors: deps },
  };
  await boot(page, data);
  await page.locator('[data-series-id="series"][data-occurrence-date="2026-10-13"]').click();
  await occurrence(page).getByLabel("Occurrence start", { exact: true }).fill("2026-10-16");
  await occurrence(page).getByRole("button", { name: "Save occurrence", exact: true }).click();
  await expect.poll(async () => (await series(page)).occurrenceOverrides["2026-10-13"].predecessors).toEqual(deps);
  await closeDetail(page);
  await cell(page, "delivery", "name").click();
  await page.getByRole("button", { name: "Delete", exact: true }).first().click();
  await page.getByRole("button", { name: "Delete", exact: true }).last().click();
  await expect.poll(async () => (await stored(page)).tasks.length).toBe(1);
  const expected = {
    "2026-10-13": { startDate: "2026-10-16", endDate: "2026-10-18", predecessors: [] },
    "2026-11-01": { startDate: "2026-11-02", predecessors: [] },
  };
  await expect.poll(async () => (await series(page)).occurrenceOverrides).toEqual(expected);
  await page.reload();
  await expect(bars(page)).toHaveCount(3);
  expect((await series(page)).occurrenceOverrides).toEqual(expected);
});

test("Undo discards stale occurrence drafts while the detail dialog remains open", async ({ page }) => {
  await boot(page, fixture(true));
  const middle = page.locator('[data-series-id="series"][data-occurrence-date="2026-10-13"]');
  await middle.click();
  await occurrence(page).getByLabel("Occurrence start", { exact: true }).fill("2026-10-17");
  await occurrence(page).getByLabel("Occurrence end", { exact: true }).fill("2026-10-18");
  await occurrence(page).getByRole("button", { name: "Save occurrence", exact: true }).click();
  await expect.poll(async () => (await series(page)).occurrenceOverrides?.["2026-10-13"]?.startDate).toBe("2026-10-17");
  await closeDetail(page);
  await middle.click();
  await expect(occurrence(page).getByLabel("Occurrence start", { exact: true })).toHaveValue("2026-10-17");
  await occurrence(page).getByRole("button", { name: "Save occurrence", exact: true }).focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => (await series(page)).occurrenceOverrides).toBeUndefined();
  await expect(occurrence(page).getByLabel("Occurrence start", { exact: true })).toHaveValue("2026-10-13");
  await occurrence(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await closeDetail(page);
  expect((await series(page)).occurrenceOverrides).toBeUndefined();
});

test("parallel occurrence edges remain separately selectable for edit and delete", async ({ page }, testInfo) => {
  const data = fixture(true);
  data.tasks[1].recurrence = { frequency: "daily", interval: 1, endDate: "2026-10-14" };
  data.tasks[1].predecessors = [
    { id: "series", occurrenceDate: "2026-10-12", type: "FS", lag: 0 },
    { id: "series", occurrenceDate: "2026-10-13", type: "FS", lag: 0 },
    { id: "series", type: "FS", lag: 0 },
  ];
  data.tasks[1].occurrenceOverrides = { "2026-10-13": { predecessors: [{ id: "series", occurrenceDate: "2026-10-14", type: "FS", lag: 0 }] } };
  await boot(page, data);
  await page.getByRole("button", { name: "Network", exact: true }).click();
  const edges = page.locator('[data-network-edge][data-network-from="series"][data-network-to="delivery"]');
  await expect(edges).toHaveCount(4);
  const bounds = await edges.locator("rect").evaluateAll(rects => rects.map(rect => ({ x: rect.x.baseVal.value, y: rect.y.baseVal.value, width: rect.width.baseVal.value, height: rect.height.baseVal.value })));
  for (let i = 0; i < bounds.length; i++) for (let j = i + 1; j < bounds.length; j++) {
    expect(Math.abs(bounds[i].y - bounds[j].y)).toBeGreaterThanOrEqual(24);
  }
  await evidence(page, testInfo, "60-parallel-occurrence-edges-en.png");
  const editor = page.locator("[data-network-edge-editor]");
  const first = page.locator('[data-network-edge][data-source-occurrence="2026-10-12"]:not([data-target-occurrence])');
  await first.focus(); await page.keyboard.press("Enter");
  await editor.getByLabel("Dependency type", { exact: true }).selectOption("SS");
  await expect.poll(async () => (await stored(page)).tasks[1].predecessors.find(dep => dep.occurrenceDate === "2026-10-12").type).toBe("SS");
  expect((await stored(page)).tasks[1].predecessors.find(dep => dep.occurrenceDate === "2026-10-13").type).toBe("FS");
  await editor.getByRole("button", { name: "Close", exact: true }).click();
  await page.locator('[data-network-edge][data-source-occurrence="2026-10-13"]:not([data-target-occurrence])').click();
  await editor.getByRole("button", { name: "Remove dependency", exact: true }).click();
  await expect(edges).toHaveCount(3);
  await expect.poll(async () => (await stored(page)).tasks[1].predecessors.some(dep => dep.occurrenceDate === "2026-10-13")).toBe(false);
  expect((await stored(page)).tasks[1].predecessors.some(dep => dep.occurrenceDate === "2026-10-12")).toBe(true);
  // Removing an individual target edge must not remove a shared series dependency.
  await page.locator('[data-network-edge][data-target-occurrence="2026-10-13"]').click();
  await editor.getByRole("button", { name: "Remove dependency", exact: true }).click();
  await expect.poll(async () => (await stored(page)).tasks[1].occurrenceOverrides["2026-10-13"].predecessors).toEqual([]);
  expect((await stored(page)).tasks[1].predecessors.some(dep => dep.id === "series" && !dep.occurrenceDate)).toBe(true);
});

test("leveled idle-day tooltip identifies a moved reservation by series and original date", async ({ page }, testInfo) => {
  const data = fixture(true);
  data.tasks[0].startDate = "2026-10-13";
  data.tasks[0].recurrence.endDate = "2026-10-13";
  data.tasks[0].occurrenceOverrides = { "2026-10-13": { startDate: "2026-10-14", endDate: "2026-10-14" } };
  data.tasks[1].duration = 3;
  data.resources[0].weeklyCapacity = 0;
  data.resources[0].monthlyCapacity = 0;
  data.calendarExceptions = [{ date: "2026-10-12", type: "workday" }];
  data.levelingOn = true;
  await boot(page, data);
  const bar = page.locator('[data-task-bar="delivery"]');
  await expect(bar).toHaveAttribute("aria-label", /Daily review \(original occurrence 2026-10-13\)/);
  await expect(bar).not.toHaveAttribute("aria-label", /@recurrence:/);
  await bar.hover();
  await expect(page.getByText(/Daily review \(original occurrence 2026-10-13\)/)).toBeVisible();
  await evidence(page, testInfo, "60-recurring-idle-reason-en.png");
  await page.getByLabel("Display language", { exact: true }).selectOption("ja");
  await bar.hover();
  await expect(page.getByText(/Daily review（元の発生日：2026-10-13）/)).toBeVisible();
  await expect(bar).not.toHaveAttribute("aria-label", /@recurrence:/);
});

test("a dependency between two occurrences in one series remains selectable", async ({ page }) => {
  const data = fixture(true);
  data.tasks = [data.tasks[0]];
  data.tasks[0].occurrenceOverrides = { "2026-10-14": {
    predecessors: [{ id: "series", occurrenceDate: "2026-10-13", type: "FS", lag: 0 }],
  } };
  await boot(page, data);
  await page.getByRole("button", { name: "Network", exact: true }).click();
  const edge = page.locator('[data-network-edge][data-source-occurrence="2026-10-13"][data-target-occurrence="2026-10-14"]');
  await edge.click();
  await page.locator("[data-network-edge-editor]").getByRole("button", { name: "Remove dependency", exact: true }).click();
  await expect.poll(async () => (await series(page)).occurrenceOverrides["2026-10-14"].predecessors).toEqual([]);
});

test("dependency-only saves keep inherited dates and existing one-sided date overrides", async ({ page }) => {
  const data = fixture(true);
  data.tasks[0].duration = 2;
  data.tasks[0].occurrenceOverrides = {
    "2026-10-13": { startDate: "2026-10-17" },
    "2026-10-14": { endDate: "2026-10-18" },
  };
  await boot(page, data);
  async function openDate(date) {
    await page.locator(`[data-series-id="series"][data-occurrence-date="${date}"]`).focus();
    await page.keyboard.press("Enter");
    await occurrence(page).waitFor();
  }
  await openDate("2026-10-12");
  await occurrence(page).getByRole("button", { name: "Save occurrence", exact: true }).click();
  await closeDetail(page);
  expect((await series(page)).occurrenceOverrides).toEqual(data.tasks[0].occurrenceOverrides);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();

  for (const [date, text, type] of [["2026-10-12", "2FS", "FS"], ["2026-10-13", "2SS", "SS"], ["2026-10-14", "2FF", "FF"]]) {
    await openDate(date);
    await occurrence(page).getByLabel("This occurrence’s predecessors", { exact: true }).fill(text);
    if (date === "2026-10-12") {
      // Updating effort in the same open modal regenerates the untouched date inputs.
      await dialog(page).getByRole("spinbutton", { name: "Effort (person-days)", exact: true }).fill("3");
      await dialog(page).getByRole("spinbutton", { name: "Effort (person-days)", exact: true }).blur();
      await expect(occurrence(page).getByLabel("Occurrence end", { exact: true })).toHaveValue("2026-10-14");
    }
    await occurrence(page).getByRole("button", { name: "Save occurrence", exact: true }).click();
    await expect.poll(async () => (await series(page)).occurrenceOverrides[date]).toEqual({
      ...(data.tasks[0].occurrenceOverrides[date] || {}), predecessors: [{ id: "delivery", type, lag: 0 }],
    });
    await closeDetail(page);
  }
  await cell(page, "series", "duration").fill("4");
  await cell(page, "series", "duration").blur();
  await expect.poll(async () => (await series(page)).duration).toBe(4);
  for (const [date, start, end] of [
    ["2026-10-12", "2026-10-12", "2026-10-15"],
    ["2026-10-13", "2026-10-17", "2026-10-20"],
    ["2026-10-14", "2026-10-14", "2026-10-18"],
  ]) {
    await openDate(date);
    await expect(occurrence(page).getByLabel("Occurrence start", { exact: true })).toHaveValue(start);
    await expect(occurrence(page).getByLabel("Occurrence end", { exact: true })).toHaveValue(end);
    await occurrence(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await closeDetail(page);
  }
  await expect(page.getByTestId("save-status")).toHaveText("Saved in this browser");
  await page.reload();
  await expect(bars(page)).toHaveCount(3);
  const saved = (await series(page)).occurrenceOverrides;
  expect(saved["2026-10-12"]).not.toHaveProperty("startDate");
  expect(saved["2026-10-12"]).not.toHaveProperty("endDate");
  expect(saved["2026-10-13"]).not.toHaveProperty("endDate");
  expect(saved["2026-10-14"]).not.toHaveProperty("startDate");
});

test("successor details hide dormant overrides after rule changes and disabling recurrence", async ({ page }) => {
  const data = fixture(true);
  data.tasks[0].occurrenceOverrides = {
    "2026-10-13": { startDate: "2026-10-17", predecessors: [{ id: "delivery", type: "FS", lag: 0 }] },
    "2026-11-01": { predecessors: [{ id: "delivery", type: "FS", lag: 0 }] },
  };
  await boot(page, data);
  async function checkSuccessors(active) {
    await cell(page, "delivery", "name").click();
    await page.getByRole("button", { name: "Details", exact: true }).click();
    const owner = page.getByRole("dialog", { name: "Delivery", exact: true });
    const successors = owner.locator('[data-successor-task="series"]');
    await expect(successors).toHaveCount(active ? 1 : 0);
    if (active) await expect(successors).toHaveAttribute("data-successor-occurrence", "2026-10-13");
    await owner.getByRole("button", { name: "Close", exact: true }).last().click();
  }
  await checkSuccessors(true);
  await openDetail(page);
  await dialog(page).getByRole("button", { name: "Edit recurrence", exact: true }).click();
  await rule(page).getByLabel("Frequency", { exact: true }).selectOption("weekly");
  await rule(page).getByRole("button", { name: "Save recurrence", exact: true }).click();
  await closeDetail(page);
  await checkSuccessors(false);
  await openDetail(page);
  await dialog(page).getByRole("button", { name: "Edit recurrence", exact: true }).click();
  await rule(page).getByLabel("Frequency", { exact: true }).selectOption("daily");
  await rule(page).getByRole("button", { name: "Save recurrence", exact: true }).click();
  await closeDetail(page);
  await checkSuccessors(true);
  await openDetail(page);
  await dialog(page).getByRole("button", { name: "Edit recurrence", exact: true }).click();
  await rule(page).getByLabel("Repeat this task", { exact: true }).uncheck();
  await rule(page).getByRole("button", { name: "Save recurrence", exact: true }).click();
  await closeDetail(page);
  await expect.poll(async () => (await series(page)).recurrence).toBeUndefined();
  await checkSuccessors(false);
  expect((await series(page)).occurrenceOverrides).toEqual(data.tasks[0].occurrenceOverrides);
});


test("changing one occurrence date saves the complete displayed range", async ({ page }) => {
  const data = fixture(true);
  data.tasks[0].duration = 2;
  await boot(page, data);
  const middle = page.locator('[data-series-id="series"][data-occurrence-date="2026-10-13"]');
  await middle.focus(); await page.keyboard.press("Enter");
  await expect(occurrence(page).getByLabel("Occurrence start", { exact: true })).toHaveValue("2026-10-13");
  await expect(occurrence(page).getByLabel("Occurrence end", { exact: true })).toHaveValue("2026-10-14");
  await occurrence(page).getByLabel("Occurrence start", { exact: true }).fill("2026-10-12");
  await occurrence(page).getByRole("button", { name: "Save occurrence", exact: true }).click();
  await expect.poll(async () => (await series(page)).occurrenceOverrides["2026-10-13"]).toEqual({ startDate: "2026-10-12", endDate: "2026-10-14" });
  await closeDetail(page);
  await cell(page, "series", "duration").fill("4");
  await cell(page, "series", "duration").blur();
  await expect.poll(async () => (await series(page)).duration).toBe(4);
  await middle.focus(); await page.keyboard.press("Enter");
  await expect(occurrence(page).getByLabel("Occurrence start", { exact: true })).toHaveValue("2026-10-12");
  await expect(occurrence(page).getByLabel("Occurrence end", { exact: true })).toHaveValue("2026-10-14");
});

test.describe("narrow mobile visual viewport", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("recurrence controls, scrolling and close stay in the visible viewport", async ({ page }, testInfo) => {
    await boot(page, fixture(true));
    await openDetail(page);
    const panel = dialog(page);
    async function expectContained() {
      const bounds = await panel.boundingBox();
      const visible = await page.evaluate(() => ({
        left: visualViewport.offsetLeft, top: visualViewport.offsetTop,
        width: visualViewport.width, height: visualViewport.height,
      }));
      expect(bounds.x).toBeGreaterThanOrEqual(visible.left);
      expect(bounds.y).toBeGreaterThanOrEqual(visible.top);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(visible.left + visible.width + 1);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(visible.top + visible.height + 1);
    }
    await expectContained();
    await panel.getByRole("button", { name: "Edit recurrence", exact: true }).click();
    await rule(page).getByLabel("Frequency", { exact: true }).selectOption("monthly");
    await rule(page).getByLabel("Repeat every", { exact: true }).fill("2");
    await expectContained();
    await evidence(page, testInfo, "60-mobile-recurrence-editor-en.png", false);
    await rule(page).getByRole("button", { name: "Cancel", exact: true }).click();
    // The sticky header close remains reachable even after scrolling to controls.
    const close = panel.getByRole("button", { name: "Close", exact: true }).first();
    await close.click();
    await expect(panel).toHaveCount(0);
    await openDetail(page);
    await expectContained();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    expect((await series(page)).recurrence.frequency).toBe("daily");
  });
});
