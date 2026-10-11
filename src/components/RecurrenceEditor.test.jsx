import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IntlProvider } from "use-intl";
import { it, expect } from "vitest";
import { RecurrenceEditor } from "./RecurrenceEditor.jsx";
import { OccurrenceEditor } from "./OccurrenceEditor.jsx";
import { TaskDetailModal } from "./TaskDetailModal.jsx";
import { InazumaLine } from "./InazumaLine.jsx";
import { GanttDeps } from "./GanttDeps.jsx";
import { NetworkView } from "./NetworkView.jsx";
import { WBSGanttView } from "./WBSGanttView.jsx";
import { MESSAGES, FORMATS, TIME_ZONE } from "../lib/i18n.js";
import { generateOccurrences } from "../lib/recurrence.js";
import { makeCalendar } from "../lib/calendar.js";
import { runCPM, buildDisplaySchedule } from "../lib/scheduling.js";
import { DEFAULT_WBS_COLS } from "../constants.js";

const noop = () => {};
const task = {
  id: "s", name: "Daily review", wbsNo: "1", order: 0, parentId: null,
  startDate: "2026-10-12", duration: 1, progress: 0, predecessors: [],
  recurrence: { frequency: "daily", interval: 1, endDate: "2026-10-14" },
  occurrenceOverrides: {
    "2026-10-13": { startDate: "2026-10-17", endDate: "2026-10-18" },
    "2026-11-01": { startDate: "2026-11-02" },
  },
};
const target = {
  id: "t", name: "Delivery", parentId: null, order: 1, startDate: "2026-10-15", duration: 1,
  predecessors: [{ id: "s", occurrenceDate: "2026-10-13", type: "FS", lag: 0 }],
};
const tasks = [task, target];
const cal = makeCalendar(new Map());
const cpm = runCPM(tasks, cal, task.startDate, []);
const { schedule } = buildDisplaySchedule(tasks, cpm.result, [], cal, []);
const mappings = { idToNo: { s: "1", t: "2" }, noToId: { 1: "s", 2: "t" } };
function render(child, locale = "en") {
  return renderToStaticMarkup(<IntlProvider locale={locale} messages={MESSAGES[locale]} formats={FORMATS[locale]} timeZone={TIME_ZONE}>{child}</IntlProvider>);
}

it("shows finite recurrence counts, dormant overrides and shared effort in both locales", () => {
  for (const locale of ["en", "ja"]) {
    const html = render(<RecurrenceEditor task={task} schedule={schedule.get("s")} {...mappings} onUpdate={noop} />, locale);
    expect(html).toContain("2026-10-13");
    expect(html).toContain(locale === "en" ? "every 1: 3 occurrences" : "3回");
    expect(html).toContain(locale === "en" ? "calendar dates" : "カレンダー日付");
    expect(html).toContain(locale === "en" ? "1 saved occurrence changes" : "個別変更が1件");
    const edit = render(<OccurrenceEditor task={task} occurrence={generateOccurrences(task).occurrences[1]} {...mappings} onUpdate={noop} onClose={noop} />, locale);
    expect(edit).toContain("2026-10-17");
    expect(edit).toContain("2026-10-13");
    expect(edit).toContain(locale === "en" ? "effort and assignee come from the series" : "工数と担当者はシリーズから引き継ぎ");
    expect(edit).toContain(locale === "en" ? "Inherits series predecessors" : "シリーズの先行タスクを引き継ぐ");
  }
});

it("keeps recurring series editable while guarding origin and milestone conversion", () => {
  for (const locale of ["en", "ja"]) {
    const modal = render(<TaskDetailModal task={task} schedule={schedule} tasks={tasks} resources={[]} sprints={[]} {...mappings}
      onUpdate={noop} onEdit={noop} onCommitEdit={noop} onToggleMilestone={noop} onClose={noop}
      autoScheduleHighlightIds={new Set()} taskContextRevision={0} />, locale);
    expect(modal).toContain('role="dialog"');
    expect(modal).toMatch(/readonly=""/i);
    expect(modal).toContain('disabled=""');
    const wbs = render(<WBSGanttView tasks={tasks} setTasks={noop} editTasks={noop} onCommitTaskEdit={noop} resources={[]} sprints={[]}
      cal={cal} schedule={schedule} projectEnd={cpm.projectEnd} selectedId={null} setSelectedId={noop} collapsed={new Set()} setCollapsed={noop}
      dayWidth={28} setDayWidth={noop} requestConfirm={noop} colWidths={DEFAULT_WBS_COLS} setColWidths={noop} versions={[]}
      baselineVersionId={null} setBaselineVersionId={noop} autoScheduleHighlightIds={new Set()} taskContextRevision={0} />, locale);
    expect(wbs.match(/data-occurrence-date=/g)).toHaveLength(3);
    expect(wbs).toContain('data-wbs-cell="s:duration"');
    expect(wbs).toContain('data-overridden="true"');
    expect(wbs).toContain('aria-haspopup="dialog"');
    const baseline = { id: "baseline", hasWbsInfo: true, tasks: [{ wbsNo: "1", schedStart: "2026-10-12", schedFinish: "2026-10-18", occurrences: schedule.get("s").occurrences }] };
    const comparison = render(<WBSGanttView tasks={tasks} setTasks={noop} editTasks={noop} onCommitTaskEdit={noop} resources={[]} sprints={[]}
      cal={cal} schedule={schedule} projectEnd={cpm.projectEnd} selectedId={null} setSelectedId={noop} collapsed={new Set()} setCollapsed={noop}
      dayWidth={28} setDayWidth={noop} requestConfirm={noop} colWidths={DEFAULT_WBS_COLS} setColWidths={noop} versions={[baseline]}
      baselineVersionId="baseline" setBaselineVersionId={noop} autoScheduleHighlightIds={new Set()} taskContextRevision={0} />, locale);
    expect(comparison.match(/data-baseline-occurrence=/g)).toHaveLength(3);
  }
});

it("resolves an exact original-date Gantt edge and never falls back to the series", () => {
  const renderEdges = input => render(<svg><GanttDeps flat={input} schedule={schedule} xOf={date => Number(date.slice(-2)) * 10} dayWidth={10} /></svg>);
  expect(renderEdges(tasks)).toContain('data-dependency-occurrence="2026-10-13"');
  expect(renderEdges([task, { ...target, predecessors: [{ id: "s", occurrenceDate: "2026-11-01", type: "FS", lag: 0 }] }])).not.toContain('data-dependency-occurrence=');
});

it("discloses count and calculation-period safety caps in both locales", () => {
  const limited = { ...task, recurrence: { frequency: "daily", interval: 1, calculationEndDate: "2040-01-01" } };
  for (const locale of ["en", "ja"]) {
    const html = render(<RecurrenceEditor task={limited} schedule={null} {...mappings} onUpdate={noop} />, locale);
    expect(html).toContain('role="alert"');
    expect(html).toContain("2,000");
    expect(html).toContain("3,660");
    expect(html).toContain(locale === "en" ? "Later occurrences are excluded" : "それ以降は含まれません");
  }
});


it("does not turn a recurring envelope into a misleading progress-line point", () => {
  const html = render(<svg><InazumaLine flat={[task]} schedule={schedule} xOf={date => Number(date.slice(-2)) * 10} dayWidth={10} cal={cal} baseDateISO="2026-10-15" /></svg>);
  expect(html).not.toContain("<circle");
  expect(html).not.toContain("<path");
});

it("keeps parallel shared and individual network labels distinct, deterministic and keyboard accessible", () => {
  const parallelTarget = {
    ...target, startDate: "2026-10-12", recurrence: { frequency: "daily", interval: 1, endDate: "2026-10-14" },
    predecessors: [
      { id: "s", occurrenceDate: "2026-10-12", type: "FS", lag: 0 },
      { id: "s", occurrenceDate: "2026-10-13", type: "FS", lag: 0 },
      { id: "s", type: "FS", lag: 0 },
    ],
    occurrenceOverrides: { "2026-10-13": { predecessors: [{ id: "s", occurrenceDate: "2026-10-14", type: "FS", lag: 0 }] } },
  };
  const renderNetwork = (plan, locale) => render(<NetworkView tasks={plan} setTasks={noop} schedule={schedule} selectedId={null} setSelectedId={noop} />, locale);
  for (const locale of ["en", "ja"]) {
    const html = renderNetwork([task, parallelTarget], locale);
    const labelGroups = [...html.matchAll(/<g data-network-edge="[^"]*"[\s\S]*?<\/g>/g)].map(match => match[0]);
    expect(labelGroups).toHaveLength(4);
    const rects = labelGroups.map(group => {
      expect(group).toContain('role="button"');
      expect(group).toContain('tabindex="0"');
      expect(group).toContain('data-parallel-edge="true"');
      const [, x, y, width, height] = group.match(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/);
      return { x: Number(x), y: Number(y), width: Number(width), height: Number(height) };
    });
    // Both nodes end at x=198. Labels are outside all nodes and do not overlap.
    rects.forEach(rect => expect(rect.x).toBeGreaterThan(198));
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      expect(Math.abs(rects[i].y - rects[j].y)).toBeGreaterThanOrEqual(24);
    }
    const paths = [...html.matchAll(/<path d="([^"]+)" data-network-edge-path=/g)].map(match => match[1]);
    expect(new Set(paths).size).toBe(4);
    const reordered = renderNetwork([task, { ...parallelTarget, predecessors: [...parallelTarget.predecessors].reverse() }], locale);
    expect(reordered).toBe(html);
  }
});

it("names fixed recurring reservations by series and original date in idle-day accessibility text", () => {
  const fixed = {
    ...task, startDate: "2026-10-13", assigneeId: "r", recurrence: { frequency: "daily", interval: 1, endDate: "2026-10-13" },
    occurrenceOverrides: { "2026-10-13": { startDate: "2026-10-14", endDate: "2026-10-14" } },
  };
  const ordinary = { ...target, startDate: "2026-10-12", duration: 3, assigneeId: "r", predecessors: [] };
  const plan = [fixed, ordinary];
  const resources = [{ id: "r", name: "Engineer", weeklyCapacity: 0, monthlyCapacity: 0 }];
  const calculation = runCPM(plan, cal, "2026-10-12", []);
  const display = buildDisplaySchedule(plan, calculation.result, resources, cal, [], { leveling: true });
  expect(display.schedule.get("t").allocation.idle).toEqual([{
    date: "2026-10-14", reason: "daily", taskIds: [display.schedule.get("s").occurrences[0].id],
  }]);
  for (const locale of ["en", "ja"]) {
    const html = render(<WBSGanttView tasks={plan} setTasks={noop} editTasks={noop} onCommitTaskEdit={noop} resources={resources} sprints={[]}
      cal={cal} schedule={display.schedule} projectEnd={calculation.projectEnd} selectedId={null} setSelectedId={noop} collapsed={new Set()} setCollapsed={noop}
      dayWidth={28} setDayWidth={noop} requestConfirm={noop} colWidths={DEFAULT_WBS_COLS} setColWidths={noop} versions={[]}
      baselineVersionId={null} setBaselineVersionId={noop} autoScheduleHighlightIds={new Set()} taskContextRevision={0} />, locale);
    expect(html).toContain(locale === "en" ? "Daily review (original occurrence 2026-10-13)" : "Daily review（元の発生日：2026-10-13）");
    expect(html).not.toContain("@recurrence:");
  }
});

it("keeps a single dependency between occurrences of the same series outside its node", () => {
  const withinSeries = { ...task, predecessors: [], occurrenceOverrides: {
    "2026-10-14": { predecessors: [{ id: "s", occurrenceDate: "2026-10-13", type: "FS", lag: 0 }] },
  } };
  const html = render(<NetworkView tasks={[withinSeries]} setTasks={noop} schedule={schedule} selectedId={null} setSelectedId={noop} />);
  const labels = [...html.matchAll(/<g data-network-edge="[^"]*"[\s\S]*?<\/g>/g)];
  expect(labels).toHaveLength(1);
  expect(labels[0][0]).toContain('data-source-occurrence="2026-10-13"');
  expect(labels[0][0]).toContain('data-target-occurrence="2026-10-14"');
  expect(Number(labels[0][0].match(/<rect x="([^"]+)"/)[1])).toBeGreaterThan(198);
  expect(labels[0][0]).toContain('role="button"');
});
