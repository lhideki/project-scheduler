import { test, expect } from "@playwright/test";

const task = (id, order, extra = {}) => ({
  id, name: `Task ${id}`, parentId: null, order, duration: 2,
  startDate: "2026-10-06", progress: 0, predecessors: [], ...extra,
});
const cell = (page, id, column) => page.locator(`[data-wbs-cell="${id}:${column}"]`);
const rowNumber = (page, id) => page.locator(`[data-wbs-row-id="${id}"]`);
const dependency = page => cell(page, "d", "predecessors");

async function load(page, tasks) {
  await page.addInitScript(tasks => {
    localStorage.setItem("pm_project", JSON.stringify({
      tasks, resources: [], sprints: [], calendarExceptions: [], levelingOn: false,
    }));
    localStorage.setItem("pm_versions", "[]");
    localStorage.setItem("pm_ui_locale", JSON.stringify("en"));
  }, tasks);
  await page.goto("/project_scheduler.html");
  await expect(dependency(page)).toBeVisible();
}

async function invalidDraft(page, text) {
  await dependency(page).fill(text);
  await dependency(page).press("Tab");
  await expect(dependency(page)).toHaveAttribute("aria-invalid", "true");
}

async function expectSavedDeps(page, expected) {
  await expect(page.getByTestId("save-status")).toHaveText("Saved in this browser");
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem("pm_project")).tasks.find(task => task.id === "d").predecessors
  )).toEqual(expected);
}

async function reorderBefore(page, sourceId, targetId) {
  const handle = rowNumber(page, sourceId).locator("../..").getByTitle("Drag to reorder");
  await handle.scrollIntoViewIfNeeded();
  const source = await handle.boundingBox();
  const target = await rowNumber(page, targetId).boundingBox();
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2, target.y, { steps: 5 });
  await page.mouse.up();
}

const changes = [
  {
    name: "reorder", draft: "1FS, bad", expectedNo: "3", originalTargetNo: "2",
    act: async page => {
      await reorderBefore(page, "b", "a");
      await expect(rowNumber(page, "b")).toHaveText("1");
    },
    originalTarget: "a",
  },
  {
    name: "indent", draft: "2FS, bad", expectedNo: "2", originalTargetNo: "1.1",
    act: async page => {
      await cell(page, "b", "name").focus();
      await cell(page, "b", "name").press("Tab");
      await expect(rowNumber(page, "b")).toHaveText("1.1");
    },
    originalTarget: "b",
  },
  {
    name: "outdent", draft: "1.1FS, bad", expectedNo: "2", originalTargetNo: "4",
    initialParent: "a",
    act: async page => {
      await cell(page, "b", "name").focus();
      await cell(page, "b", "name").press("Shift+Tab");
      await expect(rowNumber(page, "b")).toHaveText("4");
    },
    originalTarget: "b",
  },
  {
    name: "delete", draft: "1FS, bad", expectedNo: "2",
    act: async page => {
      await rowNumber(page, "a").click();
      await page.getByRole("button", { name: "Delete", exact: true }).first().click();
      await page.getByRole("button", { name: "Cancel", exact: true }).waitFor();
      await page.getByRole("button", { name: "Delete", exact: true }).last().click();
      await expect(rowNumber(page, "a")).toHaveCount(0);
      await expect(rowNumber(page, "b")).toHaveText("1");
    },
  },
];

for (const change of changes) {
  for (const hasCommittedDeps of [false, true]) {
    test(`${change.name} discards an invalid dependency draft with ${hasCommittedDeps ? "existing" : "empty"} committed dependencies`, async ({ page }, testInfo) => {
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      const committed = hasCommittedDeps ? [{ id: "c", type: "SS", lag: 1 }] : [];
      await load(page, [task("a", 0), task("b", 1, { parentId: change.initialParent || null }), task("c", 2), task("d", 3, { predecessors: committed })]);
      await invalidDraft(page, change.draft);
      await change.act(page);
      await expect(dependency(page)).toHaveValue(hasCommittedDeps ? `${change.expectedNo}SS+1` : "");
      await expect(dependency(page)).not.toHaveAttribute("aria-invalid");
      await expect(page.getByRole("alert")).toHaveCount(0);
      // Discarding stale text must not alter committed task IDs, even if its display stayed the same.
      await dependency(page).focus();
      await dependency(page).press("Tab");
      await expectSavedDeps(page, committed);
      if (change.name === "reorder" && hasCommittedDeps) {
        await page.screenshot({ path: testInfo.outputPath("dependency-draft-cleared-after-reorder.png") });
      }
      if (change.originalTarget) {
        // A fresh edit uses the new WBS number and still reaches the intended original task.
        await dependency(page).fill(`${change.originalTargetNo}FS`);
        await dependency(page).press("Tab");
        await expectSavedDeps(page, [{ id: change.originalTarget, type: "FS", lag: 0 }]);
      }
      expect(errors).toEqual([]);
    });
  }
}

test("reordering also discards an unblurred draft instead of committing it against new WBS bindings", async ({ page }) => {
  await load(page, [task("a", 0), task("b", 1), task("c", 2), task("d", 3)]);
  await dependency(page).fill("1FS");
  // The row grip prevents focus changes, so this draft has not been committed yet.
  await reorderBefore(page, "b", "a");
  await expect(rowNumber(page, "b")).toHaveText("1");
  await expect(dependency(page)).toHaveValue("");
  await dependency(page).press("Tab");
  await expectSavedDeps(page, []);
});

test("unchanged WBS bindings preserve invalid drafts through unrelated edits, recalculation and no-op reordering", async ({ page }) => {
  const committed = [{ id: "c", type: "SS", lag: 1 }];
  await load(page, [task("a", 0), task("b", 1), task("c", 2), task("d", 3, { predecessors: committed })]);
  await invalidDraft(page, "1FS, bad");
  await cell(page, "b", "name").fill("Renamed unrelated task");
  await cell(page, "b", "duration").fill("3");
  await cell(page, "b", "duration").press("Tab");
  await page.getByRole("button", { name: "Run auto-scheduling", exact: true }).click();
  await reorderBefore(page, "a", "a");
  await expect(rowNumber(page, "a")).toHaveText("1");
  await expect(dependency(page)).toHaveValue("1FS, bad");
  await expect(dependency(page)).toHaveAttribute("aria-invalid", "true");
  await expectSavedDeps(page, committed);
  await dependency(page).fill("1FS");
  await dependency(page).press("Tab");
  await expectSavedDeps(page, [{ id: "a", type: "FS", lag: 0 }]);
});
