import { test, expect } from "@playwright/test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Keep the local day different from UTC to protect the existing UTC date convention.
test.use({ timezoneId: "America/Los_Angeles" });
const NOW = "2026-10-08T01:30:00.000Z";
const UTC_DATE = "2026-10-08";
const fixture = (projectName = "") => ({
  schemaVersion: 1, exportedAt: "2026-10-06T12:00:00.000Z", projectName,
  tasks: [
    { id: "design", name: "Design", parentId: null, order: 0, startDate: "2026-10-01", duration: 2, assigneeId: "r1", sprintIds: ["s1"], predecessors: [] },
    { id: "build", name: "Build", parentId: null, order: 1, startDate: "2026-10-05", duration: 3, assigneeId: "r1", sprintIds: ["s1"], predecessors: [{ id: "design", type: "FS", lag: 0 }] },
  ],
  resources: [{ id: "r1", name: "Test engineer", weeklyCapacity: 5, monthlyCapacity: 20 }],
  sprints: [{ id: "s1", name: "October sprint", startDate: "2026-10-01", endDate: "2026-10-30", order: 0 }],
  versions: [], levelingOn: true,
  calendarExceptions: [{ date: "2026-10-07", type: "holiday", name: "Test holiday" }],
});

const errors = new WeakMap();
const filenames = new WeakMap();
test.beforeEach(async ({ page }) => {
  errors.set(page, []);
  filenames.set(page, []);
  page.on("pageerror", error => errors.get(page).push(error.message));
  page.on("download", download => filenames.get(page).push(download.suggestedFilename()));
  await page.clock.setFixedTime(new Date(NOW));
});
test.afterEach(async ({ page }, testInfo) => {
  expect(errors.get(page), "No uncaught browser errors").toEqual([]);
  await testInfo.attach("actual-download-filenames.json", {
    body: Buffer.from(JSON.stringify(filenames.get(page), null, 2)), contentType: "application/json",
  });
});

async function boot(page, project = fixture(), query = "") {
  await page.addInitScript(project => {
    if (!localStorage.getItem("export-filename-fixture")) {
      const { versions, ...plan } = project;
      localStorage.setItem("pm_project", JSON.stringify(plan));
      localStorage.setItem("pm_versions", JSON.stringify(versions));
      localStorage.setItem("pm_ui_locale", JSON.stringify("en"));
      localStorage.setItem("export-filename-fixture", "true");
    }
  }, project);
  await page.goto(`/project_scheduler.html${query}`);
  await expect(page.getByTestId("save-status")).toBeVisible();
}
async function rename(page, name) {
  await page.getByRole("button", { name: "Edit project name", exact: true }).click();
  await page.getByRole("textbox", { name: "Project name", exact: true }).fill(name);
  await page.getByRole("button", { name: "Apply name", exact: true }).click();
}
async function chooseExport(page, label) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("menuitem", { name: label, exact: true }).click();
}
async function download(page, label = "Export JSON") {
  const event = page.waitForEvent("download");
  await chooseExport(page, label);
  const file = await event;
  expect(await file.failure()).toBeNull();
  return { file, name: file.suggestedFilename(), bytes: await readFile(await file.path()) };
}
async function exportJSON(page, expectedName) {
  const result = await download(page);
  expect(result.name).toBe(expectedName);
  return JSON.parse(result.bytes.toString("utf8"));
}
async function exportHtml(page, expectedName) {
  const result = await download(page, "Export shareable HTML");
  expect(result.name).toBe(expectedName);
  const html = result.bytes.toString("utf8");
  const project = await page.evaluate(html => {
    const document = new DOMParser().parseFromString(html, "text/html");
    return JSON.parse(document.getElementById("project-scheduler-embedded").textContent);
  }, html);
  return { ...result, html, project };
}
async function clipboardMode(page, mode) {
  await page.addInitScript(mode => {
    window.__pngClipboard = [];
    Object.defineProperty(window, "ClipboardItem", { configurable: true, value: class {
      constructor(items) { this.items = items; this.types = Object.keys(items); }
      async getType(type) { return this.items[type]; }
    } });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: mode === "unavailable" ? undefined : {
      async write(items) {
        window.__pngClipboard.push(await Promise.all(items.map(async item => {
          const blob = await item.getType("image/png");
          return { types: item.types, type: blob.type, size: blob.size, signature: Array.from(new Uint8Array(await blob.arrayBuffer()).slice(0, 8)) };
        })));
        if (mode === "rejected") throw new DOMException("Clipboard permission denied", "NotAllowedError");
        if (mode === "deferred-rejection") await new Promise((resolve, reject) => {
          window.__releasePngWrite = () => reject(new DOMException("Clipboard permission denied", "NotAllowedError"));
        });
      },
    } });
  }, mode);
}
function expectPng(bytes) {
  expect(Array.from(bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(bytes.readUInt32BE(16), "PNG width").toBeGreaterThan(0);
  expect(bytes.readUInt32BE(20), "PNG height").toBeGreaterThan(0);
}
async function screenshot(page, testInfo, name) {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test("committed project names set JSON and HTML filenames without changing their payloads", async ({ page }, testInfo) => {
  await boot(page);
  const before = await exportJSON(page, `project-scheduler_${UTC_DATE}.json`);
  await rename(page, "  Q4 Launch  ");
  const after = await exportJSON(page, `Q4 Launch_${UTC_DATE}.json`);
  expect(after).toEqual({ ...before, projectName: "Q4 Launch" });
  expect(after.exportedAt).toBe(NOW);
  const shared = await exportHtml(page, `Q4 Launch-share_${UTC_DATE}.html`);
  expect(shared.project).toEqual(after);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await screenshot(page, testInfo, "55-01-named-project-export-menu.png");
  await page.keyboard.press("Escape");
  await page.getByRole("combobox", { name: "Display language" }).selectOption("ja");
  await page.getByRole("button", { name: "書き出し", exact: true }).click();
  await screenshot(page, testInfo, "55-01-named-project-export-menu-ja.png");
  await testInfo.attach(shared.name, { body: shared.bytes, contentType: "text/html" });
});

test("drafts and both cancellation methods keep committed filenames, and repeated renames use the newest name", async ({ page }) => {
  await clipboardMode(page, "unavailable");
  await boot(page, fixture("Committed"));
  const original = await exportJSON(page, `Committed_${UTC_DATE}.json`);
  for (const cancellation of ["button", "Escape"]) {
    await page.getByRole("button", { name: "Edit project name", exact: true }).click();
    await page.getByRole("textbox", { name: "Project name", exact: true }).fill("Uncommitted draft");
    expect(await exportJSON(page, `Committed_${UTC_DATE}.json`)).toEqual(original);
    expect((await exportHtml(page, `Committed-share_${UTC_DATE}.html`)).project).toEqual(original);
    const png = await download(page, "Copy as PNG (visible area)");
    expect(png.name).toBe(`Committed-gantt_${UTC_DATE}.png`);
    expectPng(png.bytes);
    if (cancellation === "button") await page.getByRole("button", { name: "Cancel name edit", exact: true }).click();
    else await page.getByRole("textbox", { name: "Project name", exact: true }).press("Escape");
    expect(await exportJSON(page, `Committed_${UTC_DATE}.json`)).toEqual(original);
  }
  for (const name of ["Second name", "Third name", "Final name"]) {
    await rename(page, name);
    const expected = { ...original, projectName: name };
    expect(await exportJSON(page, `${name}_${UTC_DATE}.json`)).toEqual(expected);
    expect((await exportHtml(page, `${name}-share_${UTC_DATE}.html`)).project).toEqual(expected);
    const png = await download(page, "Copy as PNG (visible area)");
    expect(png.name).toBe(`${name}-gantt_${UTC_DATE}.png`);
    expectPng(png.bytes);
  }
});

for (const [label, name] of [["unnamed", ""], ["invalid-only", '<>:"/\\|?*']]) {
  test(`${label} projects keep all three original default filenames`, async ({ page }) => {
    await clipboardMode(page, "unavailable");
    await boot(page, fixture(name));
    const data = await exportJSON(page, `project-scheduler_${UTC_DATE}.json`);
    expect(data.projectName).toBe(name);
    expect((await exportHtml(page, `project-scheduler-share_${UTC_DATE}.html`)).project).toEqual(data);
    const png = await download(page, "Copy as PNG (visible area)");
    expect(png.name).toBe(`gantt_${UTC_DATE}.png`);
    expectPng(png.bytes);
    expect(await page.evaluate(() => window.__pngClipboard)).toEqual([]);
  });
}

for (const [label, name, stem] of [
  ["Japanese and unsafe characters", '新製品/計画:Q4?<>"\\|*', "新製品_計画_Q4_______"],
  ["control characters", "名\u0001前\u007f/安全", "名前_安全"],
]) {
  test(`${label} are sanitized only in filenames`, async ({ page }) => {
    await clipboardMode(page, "unavailable");
    await boot(page, fixture(name));
    const json = await exportJSON(page, `${stem}_${UTC_DATE}.json`);
    expect(json.projectName).toBe(name);
    const shared = await exportHtml(page, `${stem}-share_${UTC_DATE}.html`);
    expect(shared.project).toEqual(json);
    const png = await download(page, "Copy as PNG (visible area)");
    expect(png.name).toBe(`${stem}-gantt_${UTC_DATE}.png`);
    expectPng(png.bytes);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pm_project")).projectName)).toBe(name);
  });
}

test("long Unicode names produce bounded filenames while keeping the complete project name", async ({ page }) => {
  const name = "新製品🌸".repeat(100);
  await clipboardMode(page, "unavailable");
  await boot(page, fixture(name));
  const json = await download(page);
  const suffix = `_${UTC_DATE}.json`;
  expect(json.name.endsWith(suffix)).toBe(true);
  const stem = json.name.slice(0, -suffix.length);
  expect(Buffer.byteLength(stem, "utf8")).toBeLessThanOrEqual(200);
  expect(Buffer.byteLength(stem, "utf8")).toBeGreaterThan(190);
  expect(name.startsWith(stem)).toBe(true);
  expect(stem).not.toContain("\ufffd");
  expect(JSON.parse(json.bytes.toString("utf8")).projectName).toBe(name);
  expect((await exportHtml(page, `${stem}-share_${UTC_DATE}.html`)).project.projectName).toBe(name);
  const png = await download(page, "Copy as PNG (visible area)");
  expect(png.name).toBe(`${stem}-gantt_${UTC_DATE}.png`);
  expectPng(png.bytes);
});

test("opening a shared HTML and re-exporting uses its current name without altering local storage", async ({ page }, testInfo) => {
  await boot(page, fixture("日本語の計画"));
  const shared = await exportHtml(page, `日本語の計画-share_${UTC_DATE}.html`);
  const originalStorage = await page.evaluate(() => localStorage.getItem("pm_project"));
  await page.route("**/filename-share.html", route => route.fulfill({ contentType: "text/html", body: shared.html }));
  await page.goto("/filename-share.html");
  await expect(page.getByTestId("project-name")).toHaveText("日本語の計画");
  await expect(page.getByTestId("save-status")).toContainText("Automatic saving is off");
  expect(await exportJSON(page, `日本語の計画_${UTC_DATE}.json`)).toEqual(shared.project);
  await rename(page, "共有/更新版");
  const updated = await exportHtml(page, `共有_更新版-share_${UTC_DATE}.html`);
  expect(updated.project).toEqual({ ...shared.project, projectName: "共有/更新版" });
  await page.route("**/filename-share-updated.html", route => route.fulfill({ contentType: "text/html", body: updated.html }));
  await page.goto("/filename-share-updated.html");
  expect(await exportJSON(page, `共有_更新版_${UTC_DATE}.json`)).toEqual(updated.project);
  expect(await page.evaluate(() => localStorage.getItem("pm_project"))).toBe(originalStorage);
  await screenshot(page, testInfo, "55-02-shared-project-reexport.png");
});

test("linked exports use the project name without renaming or overwriting the associated file", async ({ page }) => {
  const linked = fixture("Linked release");
  await page.addInitScript(project => {
    window.showOpenFilePicker = async () => {
      const directory = await navigator.storage.getDirectory();
      const handle = await directory.getFileHandle("original-linked-filename.json", { create: true });
      const stream = await handle.createWritable();
      await stream.write(JSON.stringify(project)); await stream.close();
      window.__filenameLinkedHandle = handle;
      return [handle];
    };
  }, linked);
  await boot(page, fixture("Local original"), "?schedule=filename-stable-key");
  await page.getByRole("button", { name: "Select JSON", exact: true }).click();
  await expect(page.getByTestId("project-name")).toHaveText("Linked release");
  await rename(page, "Linked renamed");
  expect((await exportJSON(page, `Linked renamed_${UTC_DATE}.json`)).projectName).toBe("Linked renamed");
  expect((await exportHtml(page, `Linked renamed-share_${UTC_DATE}.html`)).project.projectName).toBe("Linked renamed");
  expect(new URL(page.url()).searchParams.get("schedule")).toBe("filename-stable-key");
  expect(await page.evaluate(async () => ({
    name: window.__filenameLinkedHandle.name,
    data: JSON.parse(await (await window.__filenameLinkedHandle.getFile()).text()),
  }))).toEqual({ name: "original-linked-filename.json", data: linked });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pm_project")).projectName)).toBe("Local original");
  await page.getByRole("button", { name: "Reload latest", exact: true }).click();
  expect((await exportJSON(page, `Linked release_${UTC_DATE}.json`)).projectName).toBe("Linked release");
});

test("rejected PNG clipboard writes download the named image and show the existing fallback message", async ({ page }, testInfo) => {
  await clipboardMode(page, "rejected");
  await boot(page, fixture("Release plan"));
  const png = await download(page, "Copy as PNG (visible area)");
  expect(png.name).toBe(`Release plan-gantt_${UTC_DATE}.png`);
  expectPng(png.bytes);
  expect(await page.evaluate(() => window.__pngClipboard.length)).toBe(1);
  await expect(page.getByText("Copying images to the clipboard is not supported, so the PNG file was downloaded", { exact: true })).toBeVisible();
  await screenshot(page, testInfo, "55-03-png-download-fallback.png");
  await testInfo.attach(png.name, { body: png.bytes, contentType: "image/png" });
});

test("successful PNG clipboard writes still copy an image without downloading", async ({ page }) => {
  await clipboardMode(page, "success");
  await boot(page, fixture("Clipboard project"));
  await rename(page, "Renamed clipboard project");
  await chooseExport(page, "Copy as PNG (visible area)");
  await expect(page.getByText("Copied the Gantt chart (visible area) to the clipboard as PNG", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__pngClipboard)).toEqual([[{
    types: ["image/png"], type: "image/png", size: expect.any(Number), signature: [137, 80, 78, 71, 13, 10, 26, 10],
  }]]);
  expect(filenames.get(page)).toEqual([]);
});

test("a PNG pending clipboard permission keeps the filename from its original export click", async ({ page }) => {
  await clipboardMode(page, "deferred-rejection");
  await boot(page, fixture("Name at click"));
  await chooseExport(page, "Copy as PNG (visible area)");
  await page.waitForFunction(() => typeof window.__releasePngWrite === "function");
  await rename(page, "Name after click");
  const event = page.waitForEvent("download");
  await page.evaluate(() => window.__releasePngWrite());
  const first = await event;
  expect(first.suggestedFilename()).toBe(`Name at click-gantt_${UTC_DATE}.png`);
  expectPng(await readFile(await first.path()));
  expect((await exportJSON(page, `Name after click_${UTC_DATE}.json`)).projectName).toBe("Name after click");
});

test.describe("browser download filename evidence", () => {
  test("the real Downloads page shows the JSON, shared HTML and PNG filenames", async ({ playwright, baseURL, launchOptions }, testInfo) => {
    test.slow();
    const directory = await mkdtemp(join(tmpdir(), "scheduler-filename-evidence-"));
    const downloadDirectory = join(directory, "downloads");
    await mkdir(downloadDirectory);
    let context;
    try {
      // Full Chromium provides chrome://downloads; chromium-headless-shell does not.
      // A disposable regular profile keeps Downloads history isolated and available for the screenshot.
      context = await playwright.chromium.launchPersistentContext(join(directory, "profile"), {
        ...launchOptions, channel: "chromium", headless: true, acceptDownloads: true,
        baseURL, locale: "en-US", timezoneId: "America/Los_Angeles",
        viewport: { width: 1600, height: 1000 },
      });
      const app = context.pages()[0] || await context.newPage();
      const appErrors = [];
      app.on("pageerror", error => appErrors.push(error.message));
      await app.clock.setFixedTime(new Date(NOW));
      await clipboardMode(app, "unavailable");
      await boot(app, fixture("Release plan"));

      // Playwright normally uses GUIDs on disk. Let Chromium retain its natural filenames
      // so the native Downloads page is evidence of the actual user-visible file names.
      const session = await context.newCDPSession(app);
      await session.send("Browser.setDownloadBehavior", {
        behavior: "allow", downloadPath: downloadDirectory, eventsEnabled: true,
      });
      const actualNames = [];
      for (const [projectName, stem] of [["Release plan", "Release plan"], ["新製品リリース / Q4", "新製品リリース _ Q4"]]) {
        if (projectName !== "Release plan") await rename(app, projectName);
        for (const [label, expectedName] of [
          ["Export JSON", `${stem}_${UTC_DATE}.json`],
          ["Export shareable HTML", `${stem}-share_${UTC_DATE}.html`],
          ["Copy as PNG (visible area)", `${stem}-gantt_${UTC_DATE}.png`],
        ]) {
          const event = app.waitForEvent("download");
          await chooseExport(app, label);
          const file = await event;
          expect(file.suggestedFilename()).toBe(expectedName);
          expect(await file.failure()).toBeNull();
          const bytes = await readFile(join(downloadDirectory, expectedName));
          if (expectedName.endsWith(".json")) expect(JSON.parse(bytes.toString("utf8")).projectName).toBe(projectName);
          else if (expectedName.endsWith(".png")) expectPng(bytes);
          else expect(bytes.toString("utf8")).toContain('id="project-scheduler-embedded"');
          actualNames.push(expectedName);
        }
      }
      await app.getByRole("button", { name: "Export", exact: true }).click();
      await screenshot(app, testInfo, "55-04-filename-evidence-app-en.png");
      await app.keyboard.press("Escape");
      await app.getByRole("combobox", { name: "Display language" }).selectOption("ja");
      await app.getByRole("button", { name: "書き出し", exact: true }).click();
      await screenshot(app, testInfo, "55-04-filename-evidence-app-ja.png");

      const downloads = await context.newPage();
      await downloads.goto("chrome://downloads/");
      for (const name of actualNames) {
        // Text locators pierce Chromium's open shadow roots without depending on translated UI labels.
        await expect(downloads.getByText(name, { exact: true }).first()).toBeVisible();
      }
      await screenshot(downloads, testInfo, "55-05-actual-browser-download-filenames.png");
      await testInfo.attach("browser-download-filenames.json", {
        body: Buffer.from(JSON.stringify(actualNames, null, 2)), contentType: "application/json",
      });
      expect(appErrors).toEqual([]);
    } finally {
      if (context) await context.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
