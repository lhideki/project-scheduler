import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IntlProvider } from "use-intl";
import { it, expect } from "vitest";
import { LevelWarningsBanner } from "./LevelWarningsBanner.jsx";
import { MESSAGES, FORMATS, TIME_ZONE } from "../lib/i18n.js";
import { makeCalendar } from "../lib/calendar.js";
import { runCPM, buildDisplaySchedule } from "../lib/scheduling.js";

const task = { id: "series", name: "Daily review", parentId: null, order: 0,
  startDate: "2026-10-12", duration: 1, assigneeId: "r", progress: 0, sprintIds: [], predecessors: [],
  recurrence: { frequency: "daily", interval: 1, calculationEndDate: "2027-10-11" } };
const resources = [{ id: "r", name: "Engineer", weeklyCapacity: 5, monthlyCapacity: 0 }];
const calendar = makeCalendar(new Map());
const cpm = runCPM([task], calendar, task.startDate, []);
const display = buildDisplaySchedule([task], cpm.result, resources, calendar, [], { leveling: true });
const render = (warnings, locale) => renderToStaticMarkup(<IntlProvider locale={locale} messages={MESSAGES[locale]} formats={FORMATS[locale]} timeZone={TIME_ZONE}><LevelWarningsBanner warnings={warnings} /></IntlProvider>);

it.each(["en", "ja"])("keeps all 364 warnings in a named, focusable bounded text region (%s)", locale => {
  expect(display.schedule.get(task.id).occurrences).toHaveLength(365);
  expect(display.levelWarnings).toHaveLength(364);
  const html = render(display.levelWarnings, locale);
  expect(html).toContain(`role="region" aria-label="${MESSAGES[locale].levelWarnings.regionLabel}" tabindex="0"`);
  expect(html).toContain("max-h-28 overflow-y-auto");
  const marker = locale === "en" ? "original occurrence:" : "元の発生日:";
  expect(html.split(marker)).toHaveLength(365);
  expect(html).toContain(locale === "en" ? "Oct 12, 2026" : "2026/10/12");
  expect(html).toContain(locale === "en" ? "Oct 10, 2027" : "2027/10/10");
});

it("renders no banner without warnings and keeps the existing short-warning styling", () => {
  expect(render([], "en")).toBe("");
  const html = render(display.levelWarnings.slice(0, 1), "en");
  expect(html).toContain("bg-amber-50 border-b border-amber-200 text-amber-800 text-xs px-4 py-1.5 flex items-center gap-2");
  expect(html.split("original occurrence:")).toHaveLength(2);
});
