import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PNG } from "pngjs";

// Synthetic data only. The PNG observer records the production SVG and the
// production canvas result; it does not replace rasterization or canvas APIs.
const NOW = "2026-10-12T12:00:00.000Z";
const DATES = ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"];
const NAME = "Weekly review";
const labels = {
  en: { details: "Details", close: "Close", complete: "Mark complete", skip: "Skip", restore: "Restore", skipped: "Skipped", export: "Export", png: "Copy as PNG (visible area)" },
  ja: { details: "詳細", close: "閉じる", complete: "完了にする", skip: "スキップ", restore: "戻す", skipped: "スキップ", export: "書き出し", png: "PNGとしてコピー（表示範囲）" },
};
const leaf = (id, name, order, extra = {}) => ({
  id, name, parentId: null, order, startDate: DATES[0], duration: 2,
  assigneeId: "r", progress: 0, sprintIds: [], predecessors: [], ...extra,
});
const fixture = (extra = {}) => ({
  schemaVersion: 1, exportedAt: NOW, projectName: "Occurrence progress acceptance",
  tasks: [leaf("series", NAME, 0, { recurrence: { frequency: "weekly", interval: 1, weekdays: [1], endDate: DATES[3] }, ...extra }), leaf("delivery", "Delivery", 1)],
  resources: [{ id: "r", name: "Synthetic engineer", weeklyCapacity: 5, monthlyCapacity: 20 }],
  sprints: [], calendarExceptions: [], levelingOn: false, versions: [],
});
const mixedFixture = () => fixture({ occurrenceOverrides: {
  [DATES[0]]: { progress: 100 }, [DATES[1]]: { progress: 50 },
  [DATES[2]]: { progress: 50, skipped: true }, [DATES[3]]: { progress: 0 },
} });
const cell = (page, id, column) => page.locator(`[data-wbs-cell="${id}:${column}"]`);
const panel = page => page.getByRole("dialog", { name: NAME, exact: true });
const row = (page, date) => panel(page).locator(`[data-occurrence-row="${date}"]`);
const progress = (page, date, locale = "en") => row(page, date).getByLabel(locale === "ja" ? `${date}の進捗` : `Progress for ${date}`, { exact: true });
const bar = (page, date) => page.locator(`[data-series-id="series"][data-occurrence-date="${date}"]`);
const bars = page => page.locator('[data-series-id="series"][data-occurrence-date]');
const occurrenceEditor = page => page.locator('[data-recurrence-editor="occurrence"]');
const ruleEditor = page => page.locator('[data-recurrence-editor="rule"]');
const saved = page => expect(page.getByTestId("save-status")).toHaveText(/^(Saved in this browser|このブラウザに保存済み)$/);
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem("pm_project")));
const series = async page => (await stored(page)).tasks.find(task => task.id === "series");
const overrides = async page => (await series(page)).occurrenceOverrides || {};
const versions = page => page.evaluate(() => JSON.parse(localStorage.getItem("pm_versions")));
const pane = page => page.locator("div.overflow-auto.flex-1.bg-white");
const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  errors.set(page, []);
  page.on("pageerror", error => errors.get(page).push(error.message));
  await page.clock.setFixedTime(new Date(NOW));
});
test.afterEach(async ({ page }) => { expect(errors.get(page), "No uncaught browser errors").toEqual([]); });

async function boot(page, data = fixture(), locale = "en") {
  await page.addInitScript(({ data, locale }) => {
    if (!localStorage.getItem("occurrence-progress-fixture")) {
      const { versions, ...project } = data;
      localStorage.setItem("pm_project", JSON.stringify(project));
      localStorage.setItem("pm_versions", JSON.stringify(versions));
      localStorage.setItem("pm_ui_locale", JSON.stringify(locale));
      localStorage.setItem("occurrence-progress-fixture", "true");
    }
    window.__occurrencePngSvgs = [];
    window.__occurrencePngClipboard = [];
    const createObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => {
      if (blob.type.startsWith("image/svg+xml")) window.__occurrencePngSvgs.push(blob.text());
      return createObjectURL(blob);
    };
    Object.defineProperty(window, "ClipboardItem", { configurable: true, value: class {
      constructor(items) { this.items = items; this.types = Object.keys(items); }
      async getType(type) { return this.items[type]; }
    } });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      async write(items) {
        for (const item of items) {
          const blob = await item.getType("image/png");
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
          window.__occurrencePngClipboard.push({ type: blob.type, types: item.types, dataUrl });
        }
      },
    } });
  }, { data, locale });
  await page.goto("/project_scheduler.html");
  await saved(page);
  await expect(cell(page, "series", "name")).toHaveValue(NAME);
}
async function openDetail(page, locale = "en") {
  await cell(page, "series", "name").click();
  await page.getByRole("button", { name: labels[locale].details, exact: true }).click();
  await panel(page).waitFor();
}
async function closeDetail(page, locale = "en") {
  await panel(page).getByRole("button", { name: labels[locale].close, exact: true }).first().click();
  await expect(panel(page)).toHaveCount(0);
}
async function editProgress(page, date, value, commit = "Enter", locale = "en") {
  const input = progress(page, date, locale);
  await input.fill(String(value));
  if (commit === "blur") await input.blur();
  else await input.press(commit);
  await expect.poll(async () => (await overrides(page))[date]?.progress).toBe(value);
}
async function changeRule(page, edits) {
  await panel(page).getByRole("button", { name: "Edit recurrence", exact: true }).click();
  for (const [name, value] of Object.entries(edits)) await ruleEditor(page).getByLabel(name, { exact: true }).fill(value);
  await ruleEditor(page).getByRole("button", { name: "Save recurrence", exact: true }).click();
  await expect(ruleEditor(page)).toHaveCount(0);
}
async function screenshot(page, testInfo, name) {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(name, { path, contentType: "image/png" });
}
async function download(page, name) {
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
  const file = await event;
  expect(await file.failure()).toBeNull();
  return readFile(await file.path());
}
async function exportJSON(page) { return JSON.parse((await download(page, "Export JSON")).toString("utf8")); }
async function paste(target, text) {
  await target.focus();
  return target.evaluate((element, text) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", text);
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  }, text);
}

test("progress edits affect only their original occurrence, commit once, and survive redo and reload", async ({ page }) => {
  await boot(page);
  await expect(bars(page)).toHaveCount(4);
  await openDetail(page);
  await editProgress(page, DATES[0], 100);
  await editProgress(page, DATES[1], 50, "blur");
  for (const date of DATES.slice(2)) await expect(progress(page, date)).toHaveValue("0");
  expect(await overrides(page)).toEqual({ [DATES[0]]: { progress: 100 }, [DATES[1]]: { progress: 50 } });
  expect((await series(page)).progress).toBe(0);
  await closeDetail(page);
  await expect(cell(page, "series", "progress")).toHaveAttribute("readonly", "");
  await expect(cell(page, "series", "progress")).toHaveValue("38");
  await expect(bar(page, DATES[0])).toHaveAttribute("data-progress", "100");
  await expect(bar(page, DATES[1])).toHaveAttribute("data-progress", "50");
  await expect(bar(page, DATES[2])).toHaveAttribute("data-progress", "0");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => overrides(page)).toEqual({ [DATES[0]]: { progress: 100 } });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => overrides(page)).toEqual({});
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await saved(page);
  const before = await series(page);
  await page.reload();
  await expect(bars(page)).toHaveCount(4);
  expect(await series(page)).toEqual(before);
  expect((await series(page)).progress).toBe(0);
});

test("invalid and canceled progress drafts never persist or create Undo entries", async ({ page }) => {
  await boot(page);
  await openDetail(page);
  const before = await series(page);
  const input = progress(page, DATES[1]);
  for (const value of ["101", "-1", ""]) {
    await input.fill(value);
    await input.press("Enter");
    await expect(panel(page).getByRole("alert")).toBeVisible();
    expect(await series(page)).toEqual(before);
    await input.press("Escape");
    await expect(panel(page)).toBeVisible();
    await expect(input).toHaveValue("0");
  }
  await input.fill("75");
  await input.press("Escape");
  await expect(input).toHaveValue("0");
  await closeDetail(page);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  await page.reload();
  await openDetail(page);
  await expect(progress(page, DATES[1])).toHaveValue("0");
  expect(await series(page)).toEqual(before);
});

test("Skip retains 50 percent for Restore, Mark complete is independent, and each button is one Undo action", async ({ page }) => {
  await boot(page);
  await openDetail(page);
  await editProgress(page, DATES[1], 50);
  await editProgress(page, DATES[1], 50); // An effective no-op must not add history.
  const beforeSkip = await overrides(page);
  await row(page, DATES[1]).getByRole("button", { name: "Skip", exact: true }).click();
  await expect(progress(page, DATES[1])).toBeDisabled();
  await expect(progress(page, DATES[1])).toHaveValue("—");
  await expect.poll(async () => (await overrides(page))[DATES[1]]).toEqual({ progress: 50, skipped: true });
  await expect(row(page, DATES[1]).getByRole("button", { name: "Mark complete", exact: true })).toHaveCount(0);
  const skipped = await overrides(page);
  await row(page, DATES[1]).getByRole("button", { name: "Restore", exact: true }).click();
  await expect(progress(page, DATES[1])).toBeEnabled();
  await expect(progress(page, DATES[1])).toHaveValue("50");
  await expect.poll(async () => !!(await overrides(page))[DATES[1]]?.skipped).toBe(false);
  const restored = await overrides(page);
  await row(page, DATES[3]).getByRole("button", { name: "Mark complete", exact: true }).click();
  await expect(progress(page, DATES[3])).toHaveValue("100");
  await expect(progress(page, DATES[1])).toHaveValue("50");
  await closeDetail(page);
  for (const expected of [restored, skipped, beforeSkip, {}]) {
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => overrides(page)).toEqual(expected);
  }
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  for (let index = 0; index < 4; index++) await page.getByRole("button", { name: "Redo", exact: true }).click();
  await saved(page);
  const final = await series(page);
  await page.reload();
  await openDetail(page);
  await expect(progress(page, DATES[1])).toHaveValue("50");
  await expect(progress(page, DATES[3])).toHaveValue("100");
  expect(await series(page)).toEqual(final);
});

test("Gantt keyboard activation selects the original row and date reset keeps progress and skip", async ({ page }) => {
  await boot(page, fixture({ occurrenceOverrides: { [DATES[1]]: { progress: 50, skipped: true } } }));
  await bar(page, DATES[1]).focus();
  await page.keyboard.press("Enter");
  await expect(row(page, DATES[1])).toHaveAttribute("data-selected", "true");
  await expect(occurrenceEditor(page)).toContainText(`Occurrence originally on ${DATES[1]}`);
  await occurrenceEditor(page).getByLabel("Occurrence start", { exact: true }).fill("2026-10-14");
  await occurrenceEditor(page).getByLabel("Occurrence end", { exact: true }).fill("2026-10-15");
  await occurrenceEditor(page).getByLabel("This occurrence’s predecessors", { exact: true }).fill("2FS");
  await occurrenceEditor(page).getByRole("button", { name: "Save occurrence", exact: true }).click();
  await expect.poll(async () => (await overrides(page))[DATES[1]]).toEqual({
    progress: 50, skipped: true, startDate: "2026-10-14", endDate: "2026-10-15", predecessors: [{ id: "delivery", type: "FS", lag: 0 }],
  });
  await row(page, DATES[1]).getByRole("button", { name: DATES[1], exact: true }).click();
  await occurrenceEditor(page).getByRole("button", { name: "Reset this occurrence", exact: true }).click();
  await expect.poll(async () => (await overrides(page))[DATES[1]]).toEqual({ progress: 50, skipped: true });
  await row(page, DATES[1]).getByRole("button", { name: "Restore", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(progress(page, DATES[1])).toHaveValue("50");
  await progress(page, DATES[1]).focus();
  await page.keyboard.press("Tab");
  await expect(row(page, DATES[1]).getByRole("button", { name: "Mark complete", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(row(page, DATES[1]).getByRole("button", { name: "Skip", exact: true })).toBeFocused();
  await closeDetail(page);
  await bar(page, DATES[3]).focus();
  await page.keyboard.press("Space");
  await expect(row(page, DATES[3])).toHaveAttribute("data-selected", "true");
  await expect(occurrenceEditor(page)).toContainText(`Occurrence originally on ${DATES[3]}`);
});

test("JSON import, shared HTML and version restore retain progress/skip without writing the series average", async ({ page }) => {
  const data = mixedFixture();
  await boot(page, data);
  await page.getByRole("button", { name: /^Versions/ }).click();
  await page.getByRole("textbox", { name: "Version name", exact: true }).fill("Occurrence checkpoint");
  await page.getByRole("button", { name: "Save current schedule", exact: true }).click();
  await expect.poll(async () => (await versions(page)).length).toBe(1);
  const checkpoint = (await versions(page))[0];
  expect(checkpoint.rawTasks[0].occurrenceOverrides).toEqual(data.tasks[0].occurrenceOverrides);
  expect(checkpoint.rawTasks[0].progress).toBe(0);
  await page.getByRole("button", { name: "WBS / Gantt", exact: true }).click();
  const exported = await exportJSON(page);
  expect(exported.tasks[0].occurrenceOverrides).toEqual(data.tasks[0].occurrenceOverrides);
  expect(exported.tasks[0].progress).toBe(0);
  await openDetail(page);
  await editProgress(page, DATES[0], 25);
  await closeDetail(page);
  await page.locator('input[type="file"][aria-label="Import"]').setInputFiles({ name: "occurrence-progress.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(exported)) });
  await page.getByRole("button", { name: "Import", exact: true }).last().click();
  await expect.poll(() => overrides(page)).toEqual(data.tasks[0].occurrenceOverrides);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  await openDetail(page);
  await row(page, DATES[2]).getByRole("button", { name: "Restore", exact: true }).click();
  await closeDetail(page);
  await page.getByRole("button", { name: /^Versions/ }).click();
  const versionRow = page.getByRole("row").filter({ has: page.locator('input[value="Occurrence checkpoint"]') });
  await versionRow.getByRole("button", { name: /^Restore/ }).click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect.poll(() => overrides(page)).toEqual(data.tasks[0].occurrenceOverrides);
  await page.getByRole("button", { name: "WBS / Gantt", exact: true }).click();
  await expect(cell(page, "series", "progress")).toHaveValue("50");
  const html = (await download(page, "Export shareable HTML")).toString("utf8");
  const embedded = await page.evaluate(html => JSON.parse(new DOMParser().parseFromString(html, "text/html").getElementById("project-scheduler-embedded").textContent), html);
  expect(embedded.tasks[0].occurrenceOverrides).toEqual(data.tasks[0].occurrenceOverrides);
  expect(embedded.tasks[0].progress).toBe(0);
  const local = await stored(page);
  await page.route("**/occurrence-progress-share.html", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("/occurrence-progress-share.html");
  await expect(page.getByTestId("save-status")).toContainText("Automatic saving is off");
  await expect(bar(page, DATES[2])).toHaveAttribute("data-skipped", "true");
  await expect(cell(page, "series", "progress")).toHaveValue("50");
  expect((await exportJSON(page)).tasks).toEqual(embedded.tasks);
  expect(await stored(page)).toEqual(local);
});

test("rule and finite-horizon edits preserve dormant overrides and recompute only active progress", async ({ page }) => {
  const data = mixedFixture();
  data.tasks[0].recurrence = { frequency: "weekly", interval: 1, weekdays: [1], calculationEndDate: DATES[3] };
  await boot(page, data);
  await openDetail(page);
  await changeRule(page, { "Calculation through (inclusive)": DATES[1] });
  await expect(panel(page)).toContainText("2 saved occurrence changes are outside the current rule");
  await closeDetail(page);
  await expect(bars(page)).toHaveCount(2);
  await expect(cell(page, "series", "progress")).toHaveValue("75");
  expect(await overrides(page)).toEqual(data.tasks[0].occurrenceOverrides);
  await page.reload();
  await expect(bars(page)).toHaveCount(2);
  await openDetail(page);
  await changeRule(page, { "Calculation through (inclusive)": DATES[3], "Repeat every": "2" });
  await expect(row(page, DATES[2])).toBeVisible();
  await expect(progress(page, DATES[2])).toHaveValue("—");
  await closeDetail(page);
  await expect(bars(page)).toHaveCount(2);
  await expect(cell(page, "series", "progress")).toHaveValue("100");
  await openDetail(page);
  await changeRule(page, { "Repeat every": "1" });
  await closeDetail(page);
  await expect(bars(page)).toHaveCount(4);
  await expect(cell(page, "series", "progress")).toHaveValue("50");
  expect(await overrides(page)).toEqual(data.tasks[0].occurrenceOverrides);
  expect((await series(page)).progress).toBe(0);
});

test("legacy progress is a per-occurrence fallback, while an all-skipped series displays a dash", async ({ page }) => {
  await boot(page, fixture({ progress: 20 }));
  await openDetail(page);
  for (const date of DATES) await expect(progress(page, date)).toHaveValue("20");
  await editProgress(page, DATES[0], 0);
  await closeDetail(page);
  await expect(cell(page, "series", "progress")).toHaveValue("15");
  expect((await series(page)).progress).toBe(20);
  await openDetail(page);
  for (const date of DATES) await row(page, date).getByRole("button", { name: "Skip", exact: true }).click();
  for (const date of DATES) await expect(progress(page, date)).toHaveValue("—");
  await closeDetail(page);
  await expect(cell(page, "series", "progress")).toHaveValue("—");
  await expect(cell(page, "series", "progress")).toHaveAttribute("readonly", "");
  await expect(bars(page)).toHaveCount(4);
  await expect(page.locator('[data-series-id="series"][data-skipped="true"]')).toHaveCount(4);
  await expect(bars(page).locator("[data-occurrence-progress-fill]")).toHaveCount(0);
  expect((await series(page)).progress).toBe(20);
  await saved(page);
  await page.reload();
  await expect(cell(page, "series", "progress")).toHaveValue("—");
  await openDetail(page);
  await row(page, DATES[1]).getByRole("button", { name: "Restore", exact: true }).click();
  await expect(progress(page, DATES[1])).toHaveValue("20");
  await closeDetail(page);
  await expect(cell(page, "series", "progress")).toHaveValue("20");
});

test("a rule with no occurrences displays a dash without changing stored legacy progress", async ({ page }) => {
  await boot(page, fixture({ progress: 35, recurrence: { frequency: "weekly", interval: 1, weekdays: [2], endDate: DATES[0] } }));
  await expect(bars(page)).toHaveCount(0);
  await expect(cell(page, "series", "progress")).toHaveValue("—");
  await openDetail(page);
  await expect(panel(page).locator("[data-occurrence-row]")).toHaveCount(0);
  expect((await series(page)).progress).toBe(35);
});

test("skipping releases fixed resource load and restoring reserves the original dates again", async ({ page }) => {
  const data = fixture({ recurrence: { frequency: "weekly", interval: 1, weekdays: [1], endDate: DATES[0] } });
  data.tasks[1].duration = 1;
  data.resources[0].weeklyCapacity = 0;
  data.resources[0].monthlyCapacity = 0;
  data.levelingOn = true;
  await boot(page, data);
  const delivery = page.locator('[data-task-bar="delivery"]');
  await expect(delivery).toHaveAttribute("aria-label", /Oct 7, 2026/);
  await openDetail(page);
  await row(page, DATES[0]).getByRole("button", { name: "Skip", exact: true }).click();
  await closeDetail(page);
  await expect(delivery).toHaveAttribute("aria-label", /Oct 5, 2026/);
  await expect(bar(page, DATES[0])).toHaveAttribute("data-skipped", "true");
  await expect(bar(page, DATES[0])).toHaveAttribute("aria-label", /Oct 5, 2026 to Oct 6, 2026.*Skipped/);
  await openDetail(page);
  await row(page, DATES[0]).getByRole("button", { name: "Restore", exact: true }).click();
  await closeDetail(page);
  await expect(delivery).toHaveAttribute("aria-label", /Oct 7, 2026/);
  expect((await series(page)).startDate).toBe(DATES[0]);
});

test("a skipped predecessor remains linked and warns that its dependency is unmet", async ({ page }, testInfo) => {
  const data = mixedFixture();
  data.tasks[1].startDate = DATES[3];
  data.tasks[1].predecessors = [{ id: "series", occurrenceDate: DATES[2], type: "FS", lag: 0 }];
  await boot(page, data);
  await expect(page.locator(`[data-dependency-occurrence="${DATES[2]}"]`)).toHaveCount(1);
  await page.getByRole("button", { name: /^Dependency issues \d+$/ }).click();
  const issues = page.getByRole("dialog", { name: /^Dependency issues \(/ });
  await expect(issues).toContainText("Skipped predecessor");
  await expect(issues).toContainText("this dependency remains unmet");
  await screenshot(page, testInfo, "64-skipped-predecessor-warning-en.png");
  await issues.getByRole("button", { name: "Close", exact: true }).first().click();
  await page.getByRole("button", { name: "Network", exact: true }).click();
  await expect(page.locator(`[data-network-edge][data-network-from="series"][data-network-to="delivery"][data-source-occurrence="${DATES[2]}"]`)).toHaveCount(1);
  expect((await stored(page)).tasks[1].predecessors).toEqual(data.tasks[1].predecessors);
});

test("protected progress cell and multi-cell TSV pastes cannot replace a series average", async ({ page }) => {
  const data = mixedFixture();
  data.resources.push({ id: "other", name: "Other engineer", weeklyCapacity: 5, monthlyCapacity: 20 });
  await boot(page, data);
  const before = await stored(page);
  for (const [target, text] of [
    [cell(page, "series", "progress"), "90"],
    [cell(page, "series", "assignee"), "Other engineer\t\t90"],
    [cell(page, "series", "name"), "Changed\t2026-10-05\t2\tOther engineer\t\t90\t"],
  ]) {
    expect(await paste(target, text), "Rejected paste is consumed, including on the read-only progress cell").toBe(true);
    await expect(cell(page, "series", "progress")).toHaveValue("50");
    await expect(cell(page, "series", "name")).toHaveValue(NAME);
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
    expect(await stored(page)).toEqual(before);
  }
  await page.reload();
  await expect(cell(page, "series", "progress")).toHaveValue("50");
  expect(await stored(page)).toEqual(before);
  await cell(page, "series", "progress").focus();
  const copied = await cell(page, "series", "progress").evaluate(element => {
    const clipboardData = new DataTransfer();
    element.dispatchEvent(new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData }));
    return clipboardData.getData("text/plain");
  });
  expect(copied, "Copy reads the displayed aggregate rather than stale raw progress").toBe("50");
  expect((await series(page)).progress).toBe(0);
});

async function expectContained(page, locator) {
  const box = await locator.boundingBox();
  const visible = await page.evaluate(() => ({ x: visualViewport.offsetLeft, y: visualViewport.offsetTop, width: visualViewport.width, height: visualViewport.height }));
  expect(box.x).toBeGreaterThanOrEqual(visible.x);
  expect(box.y).toBeGreaterThanOrEqual(visible.y);
  expect(box.x + box.width).toBeLessThanOrEqual(visible.x + visible.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(visible.y + visible.height + 1);
}

// Measure the emitted production SVG in an offscreen DOM, then verify its real
// PNG pixels. Geometry assertions do not use a hand-created substitute image.
async function capturePng(page, locale) {
  const count = await page.evaluate(() => window.__occurrencePngClipboard.length);
  await page.getByRole("button", { name: labels[locale].export, exact: true }).click();
  await page.getByRole("menuitem", { name: labels[locale].png, exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__occurrencePngClipboard.length)).toBe(count + 1);
  const artifact = await page.evaluate(async () => ({ ...window.__occurrencePngClipboard.at(-1), svg: await window.__occurrencePngSvgs.at(-1) }));
  expect(artifact.type).toBe("image/png");
  expect(artifact.types).toEqual(["image/png"]);
  const metrics = await page.evaluate(markup => {
    const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
    if (parsed.querySelector("parsererror")) throw new Error("Invalid exported SVG");
    const svg = document.importNode(parsed.documentElement, true);
    svg.style.position = "fixed"; svg.style.left = "-10000px"; svg.style.top = "0";
    document.body.appendChild(svg);
    try {
      const rect = element => {
        if (!element) return null;
        const bounds = element.getBBox();
        const origin = new DOMPoint(bounds.x, bounds.y).matrixTransform(element.getScreenCTM()).matrixTransform(svg.getScreenCTM().inverse());
        return { x: origin.x, y: origin.y, width: bounds.width, height: bounds.height };
      };
      return {
        width: Number(svg.getAttribute("width")), height: Number(svg.getAttribute("height")), dpr: devicePixelRatio,
        chart: rect(svg.querySelector("[data-png-chart]")),
        taskRows: [...svg.querySelectorAll("[data-png-task-id]")].map(el => el.getAttribute("data-png-task-id")),
        patterns: [...svg.querySelectorAll("pattern")].map(el => ({ id: el.id, content: el.innerHTML })),
        forbiddenElements: svg.querySelectorAll("foreignObject,script,input,button,select,textarea").length,
        occurrences: [...svg.querySelectorAll('[data-series-id="series"][data-occurrence-date]')].map(el => ({
          date: el.getAttribute("data-occurrence-date"), skipped: el.getAttribute("data-skipped"), progress: el.getAttribute("data-progress"),
          bounds: rect(el.querySelector("rect")), fill: rect(el.querySelector("[data-occurrence-progress-fill]")),
          hatch: el.querySelector("[data-occurrence-skipped-mark]")?.getAttribute("fill"),
          text: [...el.querySelectorAll("text")].map(text => text.textContent).join(" "),
        })),
      };
    } finally { svg.remove(); }
  }, artifact.svg);
  return { svg: artifact.svg, bytes: Buffer.from(artifact.dataUrl.split(",")[1], "base64"), metrics };
}
function assertPng(artifact, locale) {
  const png = PNG.sync.read(artifact.bytes), m = artifact.metrics;
  expect(png.width).toBe(Math.round(m.width * m.dpr));
  expect(png.height).toBe(Math.round(m.height * m.dpr));
  expect(m.forbiddenElements).toBe(0);
  expect(m.taskRows).toEqual(["series", "delivery"]);
  expect(m.occurrences.map(o => o.date)).toEqual(DATES);
  const [complete, half, skipped, zero] = m.occurrences;
  expect(complete.fill.width).toBeCloseTo(complete.bounds.width, 5);
  expect(half.fill.width).toBeCloseTo(half.bounds.width / 2, 5);
  expect(zero.fill).toBeNull();
  expect(skipped.fill).toBeNull();
  expect(skipped.skipped).toBe("true");
  expect(skipped.text).toContain(labels[locale].skipped);
  expect(skipped.hatch).toMatch(/^url\(#.+\)$/);
  const patternId = skipped.hatch.slice(5, -1);
  const pattern = m.patterns.find(p => p.id === patternId);
  expect(pattern, "The exported SVG includes the referenced hatch pattern").toBeTruthy();
  expect(pattern.content).toMatch(/<(path|line)\b/);
  expect(new Set(m.occurrences.map(o => o.bounds.y)).size, "Four occurrences remain on one series row").toBe(1);
  const pixel = (x, y) => {
    const offset = (Math.floor(y * m.dpr) * png.width + Math.floor(x * m.dpr)) * 4;
    return [...png.data.subarray(offset, offset + 3)];
  };
  const delta = (a, b) => a.reduce((sum, value, index) => sum + Math.abs(value - b[index]), 0);
  for (const item of m.occurrences) {
    expect(item.bounds.x).toBeGreaterThanOrEqual(0);
    expect(item.bounds.x + item.bounds.width).toBeLessThan(m.width);
    const { x, y, width, height } = item.bounds;
    expect(delta(pixel(x + width / 2, y + height / 2), pixel(x + width / 2, y - 4)), `Decoded PNG visibly renders ${item.date}`).toBeGreaterThan(25);
  }
  const h = half.bounds;
  expect(delta(pixel(h.x + h.width * 0.25, h.y + 3), pixel(h.x + h.width * 0.75, h.y + 3)), "Real PNG has a half-width darker progress fill").toBeGreaterThan(25);
  const s = skipped.bounds;
  const stripe = [];
  for (let x = Math.ceil(s.x + 5); x < Math.floor(s.x + s.width - 5); x++) stripe.push(pixel(x, s.y + 3));
  const contrast = Math.max(...stripe.map(rgb => delta(rgb, stripe[0])));
  expect(contrast, "Real PNG has nonuniform hatch pixels away from the skip text and rounded border").toBeGreaterThan(25);
}

for (const locale of ["en", "ja"]) {
  test(`desktop ${locale} shows selected per-occurrence controls and exports real progress/skip PNG evidence`, async ({ page }, testInfo) => {
    await boot(page, mixedFixture(), locale);
    // Leave enough chart viewport for all four weekly dates, without changing
    // layout state or fixture dates merely for the exported image.
    await page.setViewportSize({ width: 1800, height: 1000 });
    await expect(cell(page, "series", "progress")).toHaveValue("50");
    await expect(page.locator('[data-wbs-row-id="series"]')).toHaveCount(1);
    await expect(bars(page)).toHaveCount(4);
    await screenshot(page, testInfo, `64-desktop-gantt-${locale}.png`);
    const before = await stored(page);
    const layout = await pane(page).evaluate(el => ({ left: el.scrollLeft, top: el.scrollTop, width: el.clientWidth, height: el.clientHeight }));
    const artifact = await capturePng(page, locale);
    assertPng(artifact, locale);
    expect(await stored(page)).toEqual(before);
    expect(await pane(page).evaluate(el => ({ left: el.scrollLeft, top: el.scrollTop, width: el.clientWidth, height: el.clientHeight }))).toEqual(layout);
    await testInfo.attach(`64-occurrence-progress-${locale}-export.png`, { body: artifact.bytes, contentType: "image/png" });
    await testInfo.attach(`64-occurrence-progress-${locale}-export.svg`, { body: Buffer.from(artifact.svg), contentType: "image/svg+xml" });
    await testInfo.attach(`64-occurrence-progress-${locale}-provenance.json`, { body: Buffer.from(JSON.stringify({
      source: "Production Export > Copy as PNG; observed SVG Blob and actual clipboard PNG Blob. No rasterizer, Image or canvas replacement.",
      fixture: mixedFixture(), locale, viewport: page.viewportSize(), metrics: artifact.metrics,
      sha256: createHash("sha256").update(artifact.bytes).digest("hex"),
    }, null, 2)), contentType: "application/json" });
    await bar(page, DATES[1]).focus();
    await page.keyboard.press("Enter");
    await expect(row(page, DATES[1])).toHaveAttribute("data-selected", "true");
    await expect(progress(page, DATES[0], locale)).toHaveValue("100");
    await expect(progress(page, DATES[1], locale)).toHaveValue("50");
    await expect(progress(page, DATES[2], locale)).toHaveValue("—");
    await expect(progress(page, DATES[2], locale)).toBeDisabled();
    await expect(progress(page, DATES[3], locale)).toHaveValue("0");
    await expect(row(page, DATES[2]).getByRole("button", { name: labels[locale].restore, exact: true })).toBeVisible();
    await row(page, DATES[1]).scrollIntoViewIfNeeded();
    await expectContained(page, panel(page));
    await screenshot(page, testInfo, `64-desktop-occurrence-controls-${locale}.png`);
  });
}

test.describe("narrow mobile per-occurrence controls", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const locale of ["en", "ja"]) {
    test(`${locale} controls fit, scroll, restore previous progress, and close`, async ({ page }, testInfo) => {
      await boot(page, mixedFixture(), locale);
      await openDetail(page, locale);
      await expectContained(page, panel(page));
      const restore = row(page, DATES[2]).getByRole("button", { name: labels[locale].restore, exact: true });
      await restore.scrollIntoViewIfNeeded();
      await expectContained(page, restore);
      await expect(progress(page, DATES[2], locale)).toHaveValue("—");
      await screenshot(page, testInfo, `64-mobile-occurrence-controls-${locale}.png`);
      await restore.click();
      await expect(progress(page, DATES[2], locale)).toHaveValue("50");
      await editProgress(page, DATES[3], 25, "Enter", locale);
      const complete = row(page, DATES[3]).getByRole("button", { name: labels[locale].complete, exact: true });
      await complete.scrollIntoViewIfNeeded();
      await expectContained(page, complete);
      await complete.click();
      await expect(progress(page, DATES[3], locale)).toHaveValue("100");
      await closeDetail(page, locale);
      await saved(page);
      await page.reload();
      await openDetail(page, locale);
      await expect(progress(page, DATES[2], locale)).toHaveValue("50");
      await expect(progress(page, DATES[3], locale)).toHaveValue("100");
      await closeDetail(page, locale);
    });
  }
});
