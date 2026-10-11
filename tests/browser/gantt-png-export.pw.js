import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";

// Synthetic fixtures only. The SVG capture observes the production rasterizer;
// the clipboard mock records its real PNG rather than substituting an image.
const NOW = "2026-10-12T12:00:00.000Z";
const HEADER_H = 64;
const ROW_H = 30;
const COMPARE_STRIDE = 52;
const leaf = (id, name, order, extra = {}) => ({
  id, name, parentId: null, order, startDate: "2026-10-12", duration: 2,
  assigneeId: "r", progress: 0, sprintIds: [], predecessors: [], ...extra,
});
const project = tasks => ({
  schemaVersion: 1, exportedAt: NOW, projectName: "PNG task list",
  tasks, resources: [{ id: "r", name: "Synthetic engineer", weeklyCapacity: 5, monthlyCapacity: 20 }],
  sprints: [], calendarExceptions: [], levelingOn: false, versions: [],
});
function hierarchyFixture() {
  const tasks = [leaf("root", "Release", 0)];
  for (let depth = 1; depth <= 8; depth++) {
    tasks.push(leaf(`level-${depth}`, `Level ${depth}`, 0, { parentId: depth === 1 ? "root" : `level-${depth - 1}` }));
  }
  tasks.push(leaf("deep-leaf", "日本語の長いタスク名🌸".repeat(24), 0, { parentId: "level-8" }));
  tasks.push(leaf("escaped", 'QA & <ready> "done"', 1, { parentId: "root" }));
  tasks.push(leaf("delivery", "Delivery", 1));
  tasks.push(leaf("milestone", "Ship", 2, { duration: 0, milestone: true, milestoneMode: "flexible" }));
  tasks.push(leaf("japanese-a", "顧客管理画面の新規登録と変更処理の入力項目を最終確認甲", 3));
  tasks.push(leaf("japanese-b", "顧客管理画面の新規登録と変更処理の入力項目を最終確認乙", 4));
  return project(tasks);
}
function recurringFixture() {
  return project([
    leaf("group", "Operations", 0),
    leaf("series", "Daily review", 0, { parentId: "group", duration: 1, recurrence: { frequency: "daily", interval: 1, endDate: "2026-10-14" } }),
    leaf("delivery", "Delivery", 1, { parentId: "group" }),
    leaf("milestone", "Launch", 1, { duration: 0, milestone: true, milestoneMode: "flexible" }),
  ]);
}

const labels = {
  en: { export: "Export", png: "Copy as PNG (visible area)", header: "Task name" },
  ja: { export: "書き出し", png: "PNGとしてコピー（表示範囲）", header: "タスク名" },
};
const errors = new WeakMap();
const downloads = new WeakMap();
test.beforeEach(async ({ page }) => {
  errors.set(page, []);
  downloads.set(page, []);
  page.on("pageerror", error => errors.get(page).push(error.message));
  page.on("download", download => downloads.get(page).push(download.suggestedFilename()));
  await page.clock.setFixedTime(new Date(NOW));
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page), "No uncaught browser errors").toEqual([]);
});

async function boot(page, data, locale = "en", mode = "success") {
  await page.addInitScript(({ data, locale, mode }) => {
    const { versions, ...plan } = data;
    localStorage.setItem("pm_project", JSON.stringify(plan));
    localStorage.setItem("pm_versions", JSON.stringify(versions));
    localStorage.setItem("pm_ui_locale", JSON.stringify(locale));
    window.__pngMode = mode;
    window.__pngSvgs = [];
    window.__pngClipboard = [];
    const createObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => {
      if (blob.type.startsWith("image/svg+xml")) window.__pngSvgs.push(blob.text());
      return createObjectURL(blob);
    };
    Object.defineProperty(window, "ClipboardItem", { configurable: true, value: class {
      constructor(items) { this.items = items; this.types = Object.keys(items); }
      async getType(type) { return this.items[type]; }
    } });
    const clipboard = {
      async write(items) {
        for (const item of items) {
          const blob = await item.getType("image/png");
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
          window.__pngClipboard.push({ types: item.types, type: blob.type, dataUrl });
        }
        if (window.__pngMode === "rejected") throw new DOMException("Clipboard permission denied", "NotAllowedError");
      },
    };
    Object.defineProperty(navigator, "clipboard", { configurable: true, get: () => window.__pngMode === "unavailable" ? undefined : clipboard });
  }, { data, locale, mode });
  await page.goto("/project_scheduler.html");
  await expect(page.getByTestId("save-status")).toHaveText(/^(Saved in this browser|このブラウザに保存済み)$/);
  await expect(page.locator("[data-wbs-column='name']")).toHaveCount(data.tasks.length);
}
const pane = page => page.locator("div.overflow-auto.flex-1.bg-white");
const stored = page => page.evaluate(() => ({
  project: JSON.parse(localStorage.getItem("pm_project")),
  versions: JSON.parse(localStorage.getItem("pm_versions")),
}));
async function layout(page) {
  return pane(page).evaluate(el => {
    const bounds = el.getBoundingClientRect();
    return {
      width: el.clientWidth, height: el.clientHeight,
      scrollLeft: el.scrollLeft, scrollTop: el.scrollTop,
      x: bounds.x, y: bounds.y, outerWidth: bounds.width, outerHeight: bounds.height,
      dpr: window.devicePixelRatio,
      ids: [...document.querySelectorAll("[data-wbs-row-id]")].map(row => row.dataset.wbsRowId),
    };
  });
}
async function choosePng(page, locale = "en") {
  await page.getByRole("button", { name: labels[locale].export, exact: true }).click();
  await page.getByRole("menuitem", { name: labels[locale].png, exact: true }).click();
}
async function copyPng(page, locale = "en") {
  const count = await page.evaluate(() => window.__pngClipboard.length);
  await choosePng(page, locale);
  await expect.poll(() => page.evaluate(() => window.__pngClipboard.length)).toBe(count + 1);
  const captured = await page.evaluate(async () => ({
    ...window.__pngClipboard.at(-1), svg: await window.__pngSvgs.at(-1),
  }));
  expect(captured.types).toEqual(["image/png"]);
  expect(captured.type).toBe("image/png");
  return { svg: captured.svg, bytes: Buffer.from(captured.dataUrl.split(",")[1], "base64") };
}
async function downloadPng(page, mode) {
  await page.evaluate(mode => { window.__pngMode = mode; }, mode);
  const event = page.waitForEvent("download");
  await choosePng(page);
  const file = await event;
  expect(await file.failure()).toBeNull();
  expect(file.suggestedFilename()).toBe("PNG task list-gantt_2026-10-12.png");
  return {
    svg: await page.evaluate(async () => window.__pngSvgs.at(-1)),
    bytes: await readFile(await file.path()),
  };
}

// Inspect the emitted artifact, not a replacement implementation. Attaching a
// copy offscreen lets Chromium measure the same native SVG text and transforms.
async function inspectSvg(page, markup) {
  return page.evaluate(markup => {
    const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
    if (parsed.querySelector("parsererror")) throw new Error(parsed.documentElement.textContent);
    const svg = document.importNode(parsed.documentElement, true);
    svg.style.position = "fixed"; svg.style.left = "-10000px"; svg.style.top = "0";
    document.body.appendChild(svg);
    try {
      const taskList = svg.querySelector("[data-png-task-list]");
      const chart = svg.querySelector("[data-png-chart]");
      if (!taskList || !chart) throw new Error("PNG must contain distinct task-list and chart viewports");
      const rect = el => ({
        x: Number(el.getAttribute("x") || 0), y: Number(el.getAttribute("y") || 0),
        width: Number(el.getAttribute("width")), height: Number(el.getAttribute("height")),
        overflow: getComputedStyle(el).overflow,
      });
      const point = (el, x, y) => {
        const p = new DOMPoint(x, y).matrixTransform(el.getScreenCTM()).matrixTransform(svg.getScreenCTM().inverse());
        return { x: p.x, y: p.y };
      };
      const rows = [...taskList.querySelectorAll("[data-png-task-id]")].map(row => {
        const name = row.querySelector("[data-png-task-name]");
        if (!name) throw new Error("Every compact task row needs one name");
        const spans = [...name.querySelectorAll("tspan")];
        const lines = (spans.length ? spans : [name]).map(line => {
          const x = line.x.baseVal.getItem(0).value;
          const y = line.y.baseVal.getItem(0).value;
          return { text: line.textContent, x, y, center: point(line, x, y), width: line.getComputedTextLength() };
        });
        return {
          id: row.getAttribute("data-png-task-id"), depth: Number(row.getAttribute("data-depth")),
          name: name.textContent, rowText: row.textContent, lines,
          center: { x: lines[0].center.x, y: (lines[0].center.y + lines.at(-1).center.y) / 2 },
          textWidth: Math.max(...lines.map(line => line.width)),
          fontWeight: getComputedStyle(name).fontWeight,
          nameCount: row.querySelectorAll("[data-png-task-name]").length,
        };
      });
      const chartSvgs = [...chart.querySelectorAll("svg")].map(rect);
      return {
        width: Number(svg.getAttribute("width")), height: Number(svg.getAttribute("height")),
        list: rect(taskList), listBody: rect(taskList.querySelector("svg")), chart: rect(chart), rows, chartSvgs,
        header: svg.querySelector("[data-png-task-header]")?.textContent,
        forbiddenElements: svg.querySelectorAll("foreignObject, input, button, select, textarea, script").length,
        editingCells: svg.querySelectorAll("[data-wbs-cell], [data-wbs-row-id]").length,
        listText: taskList.textContent,
        series: [...chart.querySelectorAll("[data-series-id][data-occurrence-date]")].map(el => ({
          id: el.getAttribute("data-series-id"), date: el.getAttribute("data-occurrence-date"),
          y: Number(el.querySelector("rect").getAttribute("y")),
        })),
        baselineOccurrences: chart.querySelectorAll("[data-baseline-occurrence]").length,
        milestoneCount: chart.querySelectorAll('rect[transform^="rotate(45"][width="12"]').length,
        ordinaryBars: [...chart.querySelectorAll("[data-task-bar]")].map(el => ({
          id: el.getAttribute("data-task-bar"), y: Number(el.querySelector(":scope > rect").getAttribute("y")),
        })),
      };
    } finally { svg.remove(); }
  }, markup);
}
function assertArtifact(artifact, before, stride = ROW_H) {
  const png = PNG.sync.read(artifact.bytes);
  expect(png.width).toBe(Math.round(artifact.metrics.width * before.dpr));
  expect(png.height).toBe(Math.round(artifact.metrics.height * before.dpr));
  const m = artifact.metrics;
  expect(m.list.width).toBeGreaterThanOrEqual(180);
  expect(m.list.width).toBeLessThanOrEqual(280);
  expect(m.width).toBe(m.list.width + before.width);
  expect(m.chart.x).toBe(m.list.width);
  expect(m.chart.width, "The visible chart must not be narrowed to fit the task list").toBe(before.width);
  expect(m.height).toBe(Math.min(before.height, HEADER_H + before.ids.length * stride - before.scrollTop));
  expect(m.forbiddenElements).toBe(0);
  expect(m.editingCells).toBe(0);
  const bodyHeight = m.height - HEADER_H;
  const expectedIds = before.ids.filter((_, index) => index * stride + stride > before.scrollTop && index * stride < before.scrollTop + bodyHeight);
  expect(m.rows.map(row => row.id)).toEqual(expectedIds);
  for (const row of m.rows) {
    const index = before.ids.indexOf(row.id);
    expect(row.nameCount).toBe(1);
    expect(row.lines.length).toBeGreaterThanOrEqual(1);
    expect(row.lines.length).toBeLessThanOrEqual(2);
    expect(row.center.y, `Current-row center for ${row.id}`).toBeCloseTo(HEADER_H + index * stride - before.scrollTop + ROW_H / 2, 5);
    expect(row.center.x).toBeGreaterThanOrEqual(0);
    expect(row.center.x + row.textWidth, `Name ${row.id} stays inside its column`).toBeLessThanOrEqual(m.list.width - 1);
    if (row.center.y > HEADER_H + 9 && row.center.y < m.height - 9) {
      let ink = 0;
      for (let y = Math.floor((row.center.y - 8) * before.dpr); y < Math.ceil((row.center.y + 8) * before.dpr); y++) {
        for (let x = Math.floor(row.center.x * before.dpr); x < Math.ceil((row.center.x + row.textWidth) * before.dpr); x++) {
          const offset = (y * png.width + x) * 4;
          if (png.data[offset] < 150 && png.data[offset + 1] < 150 && png.data[offset + 2] < 150) ink++;
        }
      }
      expect(ink, `The real PNG renders the name for ${row.id}`).toBeGreaterThan(0);
    }
  }
  return png;
}
async function capture(page, locale = "en") {
  const artifact = await copyPng(page, locale);
  artifact.metrics = await inspectSvg(page, artifact.svg);
  return artifact;
}
async function evidence(page, testInfo, stem, artifact) {
  await testInfo.attach(`${stem}-export.png`, { body: artifact.bytes, contentType: "image/png" });
  await testInfo.attach(`${stem}-export.svg`, { body: Buffer.from(artifact.svg), contentType: "image/svg+xml" });
  await testInfo.attach(`${stem}-geometry.json`, { body: Buffer.from(JSON.stringify(artifact.metrics, null, 2)), contentType: "application/json" });
  const path = testInfo.outputPath(`${stem}-ui.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(`${stem}-ui.png`, { path, contentType: "image/png" });
}

for (const locale of ["en", "ja"]) {
  test(`compact ${locale} task names preserve hierarchy, safe text and cropped native-SVG output`, async ({ page }, testInfo) => {
    const data = hierarchyFixture();
    await boot(page, data, locale);
    const before = await layout(page);
    const saved = await stored(page);
    const artifact = await capture(page, locale);
    assertArtifact(artifact, before);
    const { metrics: m } = artifact;
    expect(m.header).toBe(labels[locale].header);
    expect(m.height).toBe(HEADER_H + data.tasks.length * ROW_H);
    expect(m.rows.find(row => row.id === "escaped").name).toBe('QA & <ready> "done"');
    expect(artifact.svg).toContain("QA &amp; &lt;ready&gt;");
    expect(m.rows.find(row => row.id === "deep-leaf").name).toMatch(/(?:…|\.\.\.)$/);
    expect(m.rows.find(row => row.id === "deep-leaf").name).not.toContain("\ufffd");
    for (const id of ["japanese-a", "japanese-b"]) {
      const row = m.rows.find(row => row.id === id);
      expect(row.name, "Ordinary long Japanese names remain fully readable").toBe(data.tasks.find(task => task.id === id).name);
    }
    const chain = m.rows.filter(row => row.id === "root" || row.id.startsWith("level-") || row.id === "deep-leaf");
    expect(chain.map(row => row.depth)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (let index = 1; index <= 6; index++) expect(chain[index].center.x - chain[index - 1].center.x).toBe(12);
    // Depth keeps increasing even after visual indentation reaches its cap.
    expect(chain[8].center.x).toBe(chain[7].center.x);
    expect(chain[9].name).toMatch(/^↳10 /);
    expect(Number(chain[0].fontWeight)).toBeGreaterThanOrEqual(600);
    expect(m.milestoneCount).toBe(1);
    expect(await layout(page)).toEqual(before);
    expect(await stored(page)).toEqual(saved);
    expect(downloads.get(page)).toEqual([]);
    await evidence(page, testInfo, `62-compact-hierarchy-${locale}`, artifact);
  });
}

test("vertical and horizontal scrolling export the visible flat rows with independent clipping", async ({ page }, testInfo) => {
  const tasks = Array.from({ length: 65 }, (_, index) => leaf(`task-${index}`, index === 0 ? "Offscreen long name ".repeat(30) : `Task ${index}`, index));
  tasks.at(-1).startDate = "2027-03-01"; // Make horizontal scrolling meaningful.
  await boot(page, project(tasks));
  await pane(page).evaluate(el => { el.scrollTop = 11 * 30 + 11; el.scrollLeft = 217; });
  await expect.poll(async () => (await layout(page)).scrollTop).toBe(341);
  await expect.poll(async () => (await layout(page)).scrollLeft).toBe(217);
  const before = await layout(page);
  const saved = await stored(page);
  const artifact = await capture(page);
  const png = assertArtifact(artifact, before);
  const { metrics: m } = artifact;
  expect(m.rows[0].id).toBe("task-11");
  expect(m.rows[0].center.y).toBe(HEADER_H + 4);
  expect(m.rows.at(-1).center.y).toBeGreaterThan(m.height - ROW_H);
  expect(m.list.width, "Offscreen long names must not widen this export").toBe(180);
  expect(m.list.y).toBe(0);
  expect(m.listBody.y).toBe(HEADER_H);
  expect(m.listBody.height).toBe(m.height - HEADER_H);
  expect(m.listBody.overflow).toBe("hidden");
  expect(m.list.overflow).toBe("hidden");
  expect(m.chart.overflow).toBe("hidden");
  expect(m.chartSvgs.filter(svg => svg.x === -before.scrollLeft)).toHaveLength(3);
  expect(m.chartSvgs.filter(svg => svg.y === HEADER_H - before.scrollTop)).toHaveLength(2);
  expect(m.chartSvgs.filter(svg => svg.y === 0 && svg.height === HEADER_H)).toHaveLength(1);
  // The left margin stays white even where the horizontally scrolled chart has
  // weekend shading, bars, dependency lines and its current-day marker.
  for (let y = HEADER_H + 2; y < m.height - 2; y++) {
    if ((y - HEADER_H + before.scrollTop) % ROW_H <= 1 || (y - HEADER_H + before.scrollTop) % ROW_H >= ROW_H - 1) continue;
    const offset = (y * png.width + 4) * 4;
    expect(Array.from(png.data.subarray(offset, offset + 4))).toEqual([255, 255, 255, 255]);
  }
  expect(await layout(page)).toEqual(before);
  expect(await stored(page)).toEqual(saved);
  await evidence(page, testInfo, "62-scrolled-current-rows", artifact);

  await pane(page).evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect.poll(async () => (await layout(page)).scrollTop).toBeGreaterThan(before.scrollTop);
  const bottom = await layout(page);
  const bottomArtifact = await capture(page);
  assertArtifact(bottomArtifact, bottom);
  expect(bottomArtifact.metrics.rows.at(-1).id).toBe("task-64");
  expect(bottomArtifact.metrics.height, "The new-task row is cropped at the end of a scrolled plan").toBeLessThan(bottom.height);
  expect(await stored(page)).toEqual(saved);
  await evidence(page, testInfo, "62-scrolled-bottom-crop", bottomArtifact);
});

test("collapsing a group removes descendants and recomputes the compact width without changing tasks", async ({ page }, testInfo) => {
  const data = hierarchyFixture();
  data.tasks = data.tasks.filter(task => !task.id.startsWith("japanese-"));
  await boot(page, data);
  const saved = await stored(page);
  const expanded = await capture(page);
  expect(expanded.metrics.list.width).toBe(280);
  await page.locator('[data-wbs-cell="root:name"]').locator("..").getByRole("button").click();
  await expect(page.locator('[data-wbs-row-id="deep-leaf"]')).toHaveCount(0);
  const before = await layout(page);
  const artifact = await capture(page);
  assertArtifact(artifact, before);
  expect(artifact.metrics.rows.map(row => row.id)).toEqual(["root", "delivery", "milestone"]);
  expect(artifact.metrics.list.width).toBe(180);
  expect(artifact.metrics.listText).not.toContain("Level");
  expect(artifact.metrics.listText).not.toContain("日本語");
  expect(artifact.metrics.height).toBe(HEADER_H + 3 * ROW_H);
  expect(await stored(page)).toEqual(saved);
  await evidence(page, testInfo, "62-collapsed-hierarchy", artifact);
});

test("recurrence is one name row and comparison keeps the current and baseline lanes aligned", async ({ page }, testInfo) => {
  await boot(page, recurringFixture());
  await expect(page.locator('[data-series-id="series"][data-occurrence-date]')).toHaveCount(3);
  await page.getByRole("button", { name: "Save version", exact: true }).click();
  const comparison = page.getByRole("combobox", { name: "Match the selected version by WBS number and show its row under each task as a baseline", exact: true });
  await expect(comparison.locator("option")).toHaveCount(2);
  await comparison.selectOption({ index: 1 });
  await expect(page.locator("[data-baseline-occurrence]")).toHaveCount(3);
  await expect.poll(async () => (await stored(page)).versions.length).toBe(1);
  const saved = await stored(page);
  const before = await layout(page);
  const artifact = await capture(page);
  assertArtifact(artifact, before, COMPARE_STRIDE);
  const { metrics: m } = artifact;
  expect(m.rows.map(row => row.id)).toEqual(["group", "series", "delivery", "milestone"]);
  expect(m.rows.filter(row => row.name === "Daily review")).toHaveLength(1);
  expect(m.series.map(bar => bar.date)).toEqual(["2026-10-12", "2026-10-13", "2026-10-14"]);
  expect(m.series.map(bar => bar.y)).toEqual([COMPARE_STRIDE + 6, COMPARE_STRIDE + 6, COMPARE_STRIDE + 6]);
  expect(m.baselineOccurrences).toBe(3);
  expect(m.milestoneCount).toBe(1);
  expect(m.ordinaryBars.find(bar => bar.id === "delivery").y).toBe(2 * COMPARE_STRIDE + 6);
  expect(m.height).toBe(HEADER_H + 4 * COMPARE_STRIDE);
  expect(await layout(page)).toEqual(before);
  expect(await stored(page)).toEqual(saved);
  await evidence(page, testInfo, "62-recurring-milestone-comparison", artifact);
});

test.describe("high-DPI copy and download", () => {
  test.use({ deviceScaleFactor: 2 });
  test("clipboard rejection and unsupported clipboard download pixel-identical real PNGs", async ({ page }, testInfo) => {
    await boot(page, recurringFixture());
    const before = await layout(page);
    const saved = await stored(page);
    const copied = await capture(page);
    const decoded = assertArtifact(copied, before);
    expect(before.dpr).toBe(2);
    expect(downloads.get(page)).toEqual([]);
    for (const mode of ["rejected", "unavailable"]) {
      const fallback = await downloadPng(page, mode);
      const png = PNG.sync.read(fallback.bytes);
      expect(png.width).toBe(decoded.width);
      expect(png.height).toBe(decoded.height);
      expect(png.data.equals(decoded.data), `${mode} download pixels equal the clipboard image`).toBe(true);
      expect(fallback.bytes.equals(copied.bytes), `${mode} keeps the same encoded PNG`).toBe(true);
      await testInfo.attach(`62-${mode}-fallback.png`, { body: fallback.bytes, contentType: "image/png" });
    }
    expect(await page.evaluate(() => window.__pngClipboard.length)).toBe(2);
    expect(await layout(page)).toEqual(before);
    expect(await stored(page)).toEqual(saved);
    await evidence(page, testInfo, "62-high-dpi-copy", copied);
  });
});
