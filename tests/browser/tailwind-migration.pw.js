import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

// Two full single-file app snapshots make traces unnecessarily large. Keep real
// before/after/diff PNGs, computed reports and failure context instead.
test.use({ trace: "off", actionTimeout: 10_000 });

// A live rendering of the immutable v3 build avoids OS/font-dependent golden
// screenshots and cannot accidentally bless the candidate via --update-snapshots.
const BASELINE_COMMIT = "e029cc66e2e806e01c040780ebc7e70c5b360384";
const BASELINE_SHA256 = "da7be2493ba179390844ecfce414b46b6587a901b2d7400d7014c64944bbbe7c";
const NOW = "2026-10-08T12:00:00.000Z";
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const baselineBytes = gunzipSync(await readFile(new URL("./fixtures/tailwind-v3-e029cc66.html.gz", import.meta.url)));
if (sha256(baselineBytes) !== BASELINE_SHA256) throw new Error("The immutable Tailwind v3 baseline checksum does not match");

function projectFixture() {
  const tasks = [
    { id: "group", name: "October release", parentId: null, order: 0 },
    { id: "design", name: "Design", parentId: "group", order: 0, startDate: "2026-10-01", duration: 2, progress: 50, assigneeId: "r1", sprintIds: ["s1"], predecessors: [], notes: "Review the responsive layouts and keyboard focus." },
    { id: "build", name: "Build and verify", parentId: "group", order: 1, startDate: "2026-10-05", duration: 4, progress: 25, assigneeId: "r2", sprintIds: ["s1", "s2"], predecessors: [{ id: "design", type: "FS", lag: 0 }] },
    { id: "review", name: "Final review", parentId: "group", order: 2, startDate: "2026-10-13", duration: 2, progress: 0, assigneeId: "r1", sprintIds: ["s2"], predecessors: [{ id: "build", type: "FS", lag: 0 }] },
    { id: "release", name: "Release", parentId: null, order: 1, startDate: "2026-10-16", fixedDate: "2026-10-16", duration: 0, milestone: true, milestoneMode: "fixed", progress: 0, predecessors: [{ id: "review", type: "FS", lag: 0 }] },
  ];
  const resources = [
    { id: "r1", name: "Alex Designer", weeklyCapacity: 5, monthlyCapacity: 20 },
    { id: "r2", name: "Sam Engineer", weeklyCapacity: 4, monthlyCapacity: 16 },
  ];
  const sprints = [
    { id: "s1", name: "Sprint Alpha", theme: "Design and build", startDate: "2026-10-01", endDate: "2026-10-09", order: 0 },
    { id: "s2", name: "Sprint Beta", theme: "Verify and release", startDate: "2026-10-08", endDate: "2026-10-23", order: 1 },
  ];
  const calendarExceptions = [
    { date: "2026-10-07", type: "holiday", name: "Team day" },
    { date: "2026-10-10", type: "workday", name: "Release support" },
  ];
  const snapshotTasks = tasks.map((task, index) => ({
    id: task.id, name: task.name, wbsNo: String(index + 1), level: task.parentId ? 1 : 0,
    hasChildren: task.id === "group", milestone: !!task.milestone, assigneeId: task.assigneeId || null,
    schedStart: task.startDate || "2026-10-01", schedFinish: task.fixedDate || "2026-10-15",
    progress: task.progress || 0, duration: task.duration || 0, critical: task.id === "build",
  }));
  return {
    schemaVersion: 1, exportedAt: NOW, projectName: "October release plan",
    tasks, resources, sprints, calendarExceptions, levelingOn: false,
    versions: [
      { id: "v1", name: "Approved baseline", createdAt: Date.parse("2026-10-01T09:00:00Z"), tasks: snapshotTasks, hasWbsInfo: true, hasFullSnapshot: true, rawTasks: tasks, rawResources: resources, rawSprints: sprints, rawCalendarExceptions: calendarExceptions, rawLevelingOn: false },
      { id: "v2", name: "Earlier comparison", createdAt: Date.parse("2026-09-30T09:00:00Z"), tasks: snapshotTasks.map(task => ({ ...task, schedFinish: "2026-10-16" })), hasWbsInfo: true, hasFullSnapshot: false },
    ],
  };
}

const scenarios = [
  {
    name: "wbs-gantt",
    async open(page) {
      await expect(page.locator('[data-wbs-cell="design:name"]')).toHaveValue("Design");
      await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
    },
  },
  {
    name: "export-menu",
    async open(page) {
      await page.getByRole("button", { name: "Export", exact: true }).click();
      await expect(page.getByRole("menuitem")).toHaveCount(4);
      await expect(page.getByRole("menuitem", { name: "Export shareable HTML", exact: true })).toBeVisible();
    },
  },
  {
    name: "rename-focused",
    async open(page) {
      await page.getByRole("button", { name: "Edit project name", exact: true }).click();
      await page.getByRole("textbox", { name: "Project name", exact: true }).fill("Release plan draft");
      await expect(page.getByRole("textbox", { name: "Project name", exact: true })).toBeFocused();
      await expect(page.getByRole("button", { name: "Apply name", exact: true })).toBeVisible();
    },
  },
  {
    name: "task-detail-modal",
    async open(page) {
      // The toolbar entry works without scrolling the WBS action column into view.
      await page.locator('[data-wbs-cell="design:name"]').click();
      await page.getByRole("button", { name: "Details", exact: true }).click();
      await expect(page.locator("textarea")).toHaveValue("Review the responsive layouts and keyboard focus.");
      await expect(page.getByRole("checkbox", { name: /Sprint Alpha/ })).toBeChecked();
    },
  },
  {
    name: "network",
    async open(page) {
      await page.getByRole("button", { name: "Network", exact: true }).click();
      await expect(page.getByRole("button", { name: "Auto layout", exact: true })).toBeVisible();
      await expect(page.locator("svg").getByText("Design", { exact: true })).toBeVisible();
      await expect(page.locator("svg").getByText("Build and verif…", { exact: true })).toBeVisible();
    },
  },
  {
    name: "dependency-issues-dialog",
    prepareProject(project) {
      return { ...project, tasks: project.tasks.map(task => ({
        ...task, sprintIds: [], progress: 0,
        startDate: task.id === "build" ? "2026-10-01" : task.id === "review" ? "2026-10-02" : task.startDate,
      })) };
    },
    async open(page) {
      // Produce two real conflicting dependency rows to exercise the stacked
      // inline buttons and space-y spacing in the dialog, not a synthetic DOM.
      await page.getByRole("button", { name: /^Dependency issues \d+$/ }).click();
      const dialog = page.getByRole("dialog", { name: /^Dependency issues/ });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("button").filter({ hasText: "Start date conflict" })).toHaveCount(2);
      await expect(page.getByTestId("save-status")).toHaveText("Saved in this browser");
    },
  },
  {
    name: "resources",
    async open(page) {
      await page.getByRole("button", { name: "Resources", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Weekly workload", exact: true })).toBeVisible();
      await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();
    },
  },
  {
    name: "confirmation-modal",
    async open(page) {
      await page.getByRole("button", { name: "Resources", exact: true }).click();
      await page.getByRole("row").filter({ has: page.locator('input[value="Alex Designer"]') }).getByRole("button", { name: "Delete", exact: true }).click();
      await expect(page.getByText("Delete this assignee? (Their tasks will become unassigned)", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
    },
  },
  {
    name: "sprints",
    async open(page) {
      await page.getByRole("button", { name: /^Sprints/ }).click();
      await expect(page.getByRole("heading", { name: "Sprint timeline", exact: true })).toBeVisible();
      await expect(page.locator('input[value="Sprint Alpha"]')).toBeVisible();
    },
  },
  {
    name: "calendar",
    async open(page) {
      await openTab(page, /^Calendar/);
      await expect(page.getByRole("heading", { name: "Non-working day calendar", exact: true })).toBeVisible();
      await expect(page.locator('input[value="Team day"]')).toBeVisible();
    },
  },
  {
    name: "versions-comparison",
    async open(page) {
      await openTab(page, /^Versions/);
      await page.getByRole("checkbox", { name: 'Compare "Approved baseline"', exact: true }).check();
      await page.getByRole("checkbox", { name: 'Compare "Earlier comparison"', exact: true }).check();
      await expect(page.getByRole("heading", { name: "Version comparison", exact: true })).toBeVisible();
    },
  },
  {
    name: "japanese-export-menu",
    async open(page) {
      await page.getByRole("combobox", { name: "Display language", exact: true }).selectOption("ja");
      await page.getByRole("button", { name: "書き出し", exact: true }).click();
      await expect(page.getByRole("menuitem")).toHaveCount(4);
    },
  },
];

async function openTab(page, name) {
  const tab = page.getByRole("button", { name });
  if (page.viewportSize().width < 600) {
    // The immutable v3 tab row already overflows on narrow screens. Exercise its
    // keyboard path to reach the last tabs without forcing a click or changing
    // layout/CSS; comparison still uses the untouched mobile rendering.
    await tab.focus();
    await expect(tab).toBeFocused();
    await tab.press("Enter");
  } else {
    await tab.click();
  }
}

async function boot(context, html, errors, blockedRequests, project) {
  // Every request is fulfilled locally or rejected. A newly introduced CDN/font
  // dependency is a test failure, rather than an unnoticed source of variance.
  await context.route("**/*", route => {
    if (route.request().url() === "http://tailwind-parity.test/project_scheduler.html") {
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    }
    blockedRequests.push(route.request().url());
    return route.abort();
  });
  await context.addInitScript(project => {
    const { versions, ...plan } = project;
    localStorage.setItem("pm_project", JSON.stringify(plan));
    localStorage.setItem("pm_versions", JSON.stringify(versions));
    localStorage.setItem("pm_ui_locale", JSON.stringify("en"));
  }, project);
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.setFixedTime(new Date(NOW));
  await page.goto("http://tailwind-parity.test/project_scheduler.html");
  await expect(page.getByTestId("save-status")).toHaveText("Saved in this browser");
  await expect(page.getByTestId("project-name")).toHaveText("October release plan");
  await page.evaluate(() => document.fonts.ready);
  return page;
}

const screenshotOptions = { fullPage: false, animations: "disabled", caret: "hide", scale: "css" };
async function stableScreenshot(page) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts.ready);
  let previous;
  let screenshot;
  let matches = 0;
  // Recharts uses requestAnimationFrame, so CSS animation suppression alone is
  // insufficient. Require three identical real captures, without masking it.
  await expect.poll(async () => {
    screenshot = await page.screenshot(screenshotOptions);
    const digest = sha256(screenshot);
    matches = digest === previous ? matches + 1 : 0;
    previous = digest;
    return matches;
  }, { timeout: 10_000, intervals: [150, 150, 150, 150], message: "The actual rendered page must settle before comparison" }).toBeGreaterThanOrEqual(2);
  return screenshot;
}

async function computedEvidence(page) {
  return page.evaluate(() => {
    const properties = [
      "display", "position", "boxSizing", "flexDirection", "flexGrow", "flexShrink", "alignItems", "justifyContent",
      "rowGap", "columnGap", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
      "marginTop", "marginRight", "marginBottom", "marginLeft", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
      "borderTopStyle", "borderRightStyle", "borderBottomStyle", "borderLeftStyle",
      "borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius", "borderBottomRightRadius",
      "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "textAlign",
      "whiteSpace", "overflowX", "overflowY", "textOverflow", "opacity", "cursor", "appearance",
      "outlineStyle", "outlineWidth", "outlineOffset",
    ];
    const colors = ["color", "backgroundColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor", "outlineColor"];
    const round = value => Math.round(value * 1000) / 1000;
    const rectOf = element => {
      const rect = element.getBoundingClientRect();
      return Object.fromEntries(["x", "y", "width", "height"].map(key => [key, round(rect[key])]));
    };
    const isRendered = element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
    };
    const spacingClasses = element => [...(element?.classList || [])].filter(name => /^space-y-/.test(name));
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const colorCache = new Map();
    function rgba(color) {
      if (!colorCache.has(color)) {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        colorCache.set(color, Array.from(context.getImageData(0, 0, 1, 1).data));
      }
      return colorCache.get(color);
    }
    const selectors = ".ps-app-root, .ps-app-root > div, button, input, select, textarea, table, thead, th, td, h3, [role=menu], [data-wbs-cell], .fixed, .fixed > div, svg";
    const elements = [...document.querySelectorAll(selectors)].filter(isRendered).map((element, index) => {
      const style = getComputedStyle(element);
      const verticalSpaceChild = spacingClasses(element.parentElement).length > 0;
      return {
        key: `${index}:${element.tagName.toLowerCase()}:${element.getAttribute("data-wbs-cell") || element.getAttribute("data-testid") || element.getAttribute("aria-label") || element.getAttribute("role") || (element.value ?? element.textContent).trim().slice(0, 70)}`,
        rect: rectOf(element),
        // v3 puts space-y on the following child's top; v4 puts it on the
        // preceding child's bottom. Compare the resulting gaps below, while
        // retaining both raw margins and every element's exact geometry.
        style: Object.fromEntries(properties.filter(property => !verticalSpaceChild || !["marginTop", "marginBottom"].includes(property)).map(property => [property, style[property]])),
        colors: Object.fromEntries(colors.map(property => [property, rgba(style[property])])),
        // Equivalent shadow lists can serialize differently in v3 and v4. Keep
        // their complete strings for diagnosis; exact pixels verify the effect.
        diagnostic: { boxShadow: style.boxShadow, backgroundImage: style.backgroundImage, rawColors: Object.fromEntries(colors.map(property => [property, style[property]])), rawVerticalMargins: { marginTop: style.marginTop, marginBottom: style.marginBottom }, verticalSpacingClasses: spacingClasses(element.parentElement) },
      };
    });
    const verticalSpacing = [...document.querySelectorAll("[class]")]
      .filter(element => spacingClasses(element).length > 0 && isRendered(element))
      .map((element, index) => {
        const children = [...element.children].filter(isRendered);
        return {
          key: `${index}:${element.tagName.toLowerCase()}:${spacingClasses(element).join(" ")}`,
          rect: rectOf(element),
          children: children.map((child, childIndex) => {
            const rect = child.getBoundingClientRect();
            const previous = children[childIndex - 1]?.getBoundingClientRect();
            return {
              tag: child.tagName.toLowerCase(), rect: rectOf(child),
              gapFromPrevious: previous ? round(rect.top - previous.bottom) : null,
            };
          }),
        };
      });
    return {
      environment: { width: innerWidth, height: innerHeight, devicePixelRatio, language: navigator.language, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, clock: new Date().toISOString(), fonts: document.fonts.status },
      document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, scrollX, scrollY },
      elements, verticalSpacing,
    };
  });
}

function differences(before, after, path = "") {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (before && after && typeof before === "object" && typeof after === "object" && Array.isArray(before) === Array.isArray(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(key => differences(before[key], after[key], path ? `${path}.${key}` : key));
  }
  return [{ path, before: before ?? null, after: after ?? null }];
}

async function pixelEvidence(page, before, after) {
  // PNGs are decoded losslessly by Chromium. No image dependency, perceptual
  // tolerance, rescaling, antialias exclusion or selected-area mask is used.
  return page.evaluate(async ({ before, after }) => {
    async function decode(base64) {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      return { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
    }
    const a = await decode(before);
    const b = await decode(after);
    const width = Math.max(a.width, b.width);
    const height = Math.max(a.height, b.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    const diff = context.createImageData(width, height);
    let changedPixels = 0;
    let changedChannels = 0;
    let absoluteChannelDifference = 0;
    let maximumChannelDifference = 0;
    const changedPixelSample = [];
    const sampleLimit = 256;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const ai = (y * a.width + x) * 4;
        const bi = (y * b.width + x) * 4;
        const di = (y * width + x) * 4;
        const aInside = x < a.width && y < a.height;
        const bInside = x < b.width && y < b.height;
        let changed = aInside !== bInside;
        for (let channel = 0; channel < 4; channel++) {
          const delta = Math.abs((aInside ? a.data[ai + channel] : 0) - (bInside ? b.data[bi + channel] : 0));
          if (delta) { changed = true; changedChannels++; }
          absoluteChannelDifference += delta;
          maximumChannelDifference = Math.max(maximumChannelDifference, delta);
        }
        if (changed) {
          changedPixels++;
          if (changedPixelSample.length < sampleLimit) changedPixelSample.push({
            x, y,
            before: aInside ? Array.from(a.data.subarray(ai, ai + 4)) : [0, 0, 0, 0],
            after: bInside ? Array.from(b.data.subarray(bi, bi + 4)) : [0, 0, 0, 0],
          });
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
          diff.data.set([255, 0, 160, 255], di);
        } else {
          const gray = aInside ? Math.round((a.data[ai] + a.data[ai + 1] + a.data[ai + 2]) / 3) : 255;
          const faded = Math.round(192 + gray * 63 / 255);
          diff.data.set([faded, faded, faded, 255], di);
        }
      }
    }
    context.putImageData(diff, 0, 0);
    return {
      before: { width: a.width, height: a.height }, after: { width: b.width, height: b.height },
      changedPixels, totalPixels: width * height, changedPixelRatio: changedPixels / (width * height),
      changedChannels, absoluteChannelDifference, maximumChannelDifference,
      changedPixelSample, changedPixelSampleComplete: changedPixels <= sampleLimit,
      boundingBox: changedPixels ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null,
      diffPng: canvas.toDataURL("image/png").split(",")[1],
    };
  }, { before: before.toString("base64"), after: after.toString("base64") });
}

const withoutDiagnostics = evidence => ({
  ...evidence, elements: evidence.elements.map(({ diagnostic, ...element }) => element),
});

for (const [device, viewport] of [["desktop", { width: 1600, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
  for (const scenario of scenarios) {
    test(`Tailwind v3 to v4: ${device} ${scenario.name}`, async ({ browser }, testInfo) => {
      test.setTimeout(60_000);
      const contextOptions = { viewport, deviceScaleFactor: 1, locale: "en-US", timezoneId: "UTC", colorScheme: "light", reducedMotion: "reduce", serviceWorkers: "block", isMobile: device === "mobile", hasTouch: device === "mobile" };
      const beforeContext = await browser.newContext(contextOptions);
      const afterContext = await browser.newContext(contextOptions);
      const contexts = [beforeContext, afterContext];
      const pages = {};
      const captured = new Set();
      const prefix = `57-${device}-${scenario.name}`;
      const browserErrors = { before: [], after: [] };
      const blockedRequests = { before: [], after: [] };
      const project = scenario.prepareProject ? scenario.prepareProject(projectFixture()) : projectFixture();
      let primaryError;
      try {
        pages.before = await boot(beforeContext, baselineBytes, browserErrors.before, blockedRequests.before, project);
        pages.after = await boot(afterContext, await readFile("project_scheduler.html"), browserErrors.after, blockedRequests.after, project);
        const screenshots = {};
        const evidence = {};
        for (const side of ["before", "after"]) {
          await scenario.open(pages[side]);
          screenshots[side] = await stableScreenshot(pages[side]);
          await testInfo.attach(`${prefix}-${side}.png`, { body: screenshots[side], contentType: "image/png" });
          captured.add(side);
          evidence[side] = await computedEvidence(pages[side]);
        }
        const { diffPng, ...pixels } = await pixelEvidence(pages.after, screenshots.before, screenshots.after);
        const styleAndGeometryDifferences = differences(withoutDiagnostics(evidence.before), withoutDiagnostics(evidence.after));
        const report = {
          baselineCommit: BASELINE_COMMIT, baselineHtmlSha256: BASELINE_SHA256,
          candidateHtmlSha256: sha256(await readFile("project_scheduler.html")),
          chromium: browser.version(), device, scenario: scenario.name, viewport, fixedTime: NOW,
          pixelPolicy: "Exact RGBA equality; zero changed pixels allowed; no masks or tolerances",
          styleNormalization: "Only direct children of a /^space-y-/ utility container compare exact visible sibling gaps and child/container rectangles instead of marginTop/marginBottom placement. Raw vertical margins remain in diagnostics. All other computed styles, geometry, and pixels remain strict.",
          pixels, styleAndGeometryDifferences, browserErrors, blockedRequests, ...evidence,
        };
        await testInfo.attach(`${prefix}-diff.png`, { body: Buffer.from(diffPng, "base64"), contentType: "image/png" });
        const reportPath = testInfo.outputPath(`${prefix}-comparison.json`);
        await writeFile(reportPath, JSON.stringify(report, null, 2));
        await testInfo.attach(`${prefix}-comparison.json`, { path: reportPath, contentType: "application/json" });
        if (pixels.changedPixels > 0) {
          // Diagnose raster variance with a genuinely independent v3 rendering.
          // This is evidence only: it never changes the candidate's zero-pixel gate.
          const controlReport = {
            baselineCommit: BASELINE_COMMIT, baselineHtmlSha256: BASELINE_SHA256,
            chromium: browser.version(), device, scenario: scenario.name, viewport, fixedTime: NOW,
            purpose: "Independent immutable-v3 versus immutable-v3 rendering control; does not relax candidate assertions",
            browserErrors: [], blockedRequests: [],
          };
          try {
            const controlContext = await browser.newContext(contextOptions);
            contexts.push(controlContext);
            pages.control = await boot(controlContext, baselineBytes, controlReport.browserErrors, controlReport.blockedRequests, project);
            await scenario.open(pages.control);
            const controlScreenshot = await stableScreenshot(pages.control);
            await testInfo.attach(`${prefix}-baseline-control.png`, { body: controlScreenshot, contentType: "image/png" });
            captured.add("control");
            const { diffPng: controlDiff, ...controlPixels } = await pixelEvidence(pages.control, screenshots.before, controlScreenshot);
            const { diffPng: candidateControlDiff, ...candidateControlPixels } = await pixelEvidence(pages.control, controlScreenshot, screenshots.after);
            const controlEvidence = await computedEvidence(pages.control);
            const controlCoordinates = new Set(controlPixels.changedPixelSample.map(pixel => `${pixel.x},${pixel.y}`));
            const overlappingSample = pixels.changedPixelSample.filter(pixel => controlCoordinates.has(`${pixel.x},${pixel.y}`));
            Object.assign(controlReport, {
              beforeToControl: controlPixels, controlToCandidate: candidateControlPixels,
              coordinateOverlap: {
                candidateChangedPixels: pixels.changedPixels, controlChangedPixels: controlPixels.changedPixels,
                complete: pixels.changedPixelSampleComplete && controlPixels.changedPixelSampleComplete,
                overlappingSampleCoordinates: overlappingSample.map(({ x, y }) => ({ x, y })),
              },
              styleAndGeometryDifferences: differences(withoutDiagnostics(evidence.before), withoutDiagnostics(controlEvidence)),
              evidence: controlEvidence,
            });
            await testInfo.attach(`${prefix}-baseline-control-diff.png`, { body: Buffer.from(controlDiff, "base64"), contentType: "image/png" });
            await testInfo.attach(`${prefix}-control-candidate-diff.png`, { body: Buffer.from(candidateControlDiff, "base64"), contentType: "image/png" });
          } catch (error) {
            controlReport.error = String(error);
          }
          const controlPath = testInfo.outputPath(`${prefix}-baseline-control.json`);
          await writeFile(controlPath, JSON.stringify(controlReport, null, 2));
          await testInfo.attach(`${prefix}-baseline-control.json`, { path: controlPath, contentType: "application/json" });
        }
        expect.soft(browserErrors, "Neither build has uncaught browser errors").toEqual({ before: [], after: [] });
        expect.soft(blockedRequests, "Both single-file builds work without external requests").toEqual({ before: [], after: [] });
        expect.soft(evidence.before.elements.length, "Exercise a populated UI, not an empty screenshot").toBeGreaterThan(20);
        const sample = styleAndGeometryDifferences.slice(0, 5).map(diff => `${diff.path}: ${JSON.stringify(diff.before).slice(0, 80)} -> ${JSON.stringify(diff.after).slice(0, 80)}`).join("; ");
        expect.soft(styleAndGeometryDifferences.length, `${styleAndGeometryDifferences.length} geometry/computed-style differences (${sample}); full values are in ${prefix}-comparison.json`).toBe(0);
        expect.soft(pixels.after, "Before and after screenshot dimensions match").toEqual(pixels.before);
        expect.soft(pixels.changedPixels, `Exact visual regression: ${pixels.changedPixels}/${pixels.totalPixels} pixels changed; see before, after, diff and comparison attachments`).toBe(0);
      } catch (error) {
        primaryError = error;
        throw error;
      } finally {
        // Keep evidence even if a selector/action fails before the normal captures.
        for (const [side, page] of Object.entries(pages)) {
          if (!captured.has(side) && !page.isClosed()) {
            try {
              await testInfo.attach(`${prefix}-${side}-interrupted.png`, { body: await page.screenshot({ ...screenshotOptions, timeout: 5_000 }), contentType: "image/png" });
            } catch { /* Preserve the original actionable failure. */ }
          }
        }
        const cleanup = await Promise.allSettled(contexts.map(context => context.close()));
        const cleanupErrors = cleanup.filter(result => result.status === "rejected").map(result => String(result.reason));
        if (cleanupErrors.length && !primaryError && testInfo.errors.length === 0) {
          throw new Error(`Context cleanup failed: ${cleanupErrors.join("; ")}`);
        }
      }
    });
  }
}
