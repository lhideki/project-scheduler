import { describe, it, expect } from "vitest";
import { applyScheduleStartDates, schedulingFeedbackStatus } from "./schedulingFeedback.js";
import { computeAutoSchedule, runCPM, buildDisplaySchedule, deriveProjectStart } from "./scheduling.js";
import { detectDependencyIssues } from "./dependencyIssues.js";
import { detectSprintConflicts } from "./sprints.js";
import { makeCalendar, buildHolidayMap } from "./calendar.js";
const cal = makeCalendar(buildHolidayMap(2024, 2024));
const leaf = (id, extra = {}) => ({ id, name: id, parentId: null, order: 0, duration: 2, startDate: "2024-01-09", predecessors: [], ...extra });

describe("scheduling feedback", () => {
  it.each([false, true])("counts the same changed leaves that are highlighted; repeated run is zero (leveling=%s)", leveling => {
    const tasks = [leaf("group"), leaf("A", { parentId: "group" }), leaf("B", { parentId: "group", order: 1, predecessors: [{ id: "A", type: "FS", lag: 0 }] })];
    const run = input => {
      const computed = computeAutoSchedule(input, cal, "2024-01-09", [], [], { leveling });
      return applyScheduleStartDates(input, computed.startDates);
    };
    const first = run(tasks);
    expect([...first.changedIds]).toEqual(["B"]);
    expect(first.tasks[0]).toBe(tasks[0]);
    const repeated = run(first.tasks);
    expect(repeated.changedIds.size).toBe(0);
    expect(repeated.tasks).toBe(first.tasks);
    expect(tasks[2].startDate).toBe("2024-01-09");
  });
  it.each([false, true])("uses canonical post-writeback issues (leveling=%s)", leveling => {
    const tasks = [
      leaf("A", { predecessors: [{ id: "B", type: "FS", lag: 0 }] }),
      leaf("B", { order: 1, predecessors: [{ id: "A", type: "FS", lag: 0 }] }),
      leaf("work", { order: 2, duration: 10, sprintIds: ["s"] }),
      leaf("due", { order: 3, milestone: true, duration: 0, milestoneMode: "fixed", fixedDate: "2024-01-10", predecessors: [{ id: "work", type: "FS", lag: 0 }] }),
    ];
    const sprints = [{ id: "s", name: "Sprint", startDate: "2024-01-09", endDate: "2024-01-10" }];
    const computed = computeAutoSchedule(tasks, cal, "2024-01-09", sprints, [], { leveling });
    const applied = applyScheduleStartDates(tasks, computed.startDates);
    const cpm = runCPM(applied.tasks, cal, deriveProjectStart(applied.tasks, "2024-01-09"), sprints);
    const display = buildDisplaySchedule(applied.tasks, cpm.result, [], cal, sprints, { leveling });
    const dependency = detectDependencyIssues(applied.tasks, display.schedule, cal);
    const conflicts = detectSprintConflicts(applied.tasks, sprints, display.schedule);
    expect(dependency.filter(issue => issue.code === "dependency-cycle")).toHaveLength(1);
    expect(dependency.some(issue => issue.code === "fixed-milestone-overrun")).toBe(true);
    expect(dependency.some(issue => issue.code === "dependency-violation" && issue.ids.includes("due"))).toBe(false);
    expect(schedulingFeedbackStatus(computed.converged, dependency, conflicts, display.levelWarnings)).toEqual({ status: "unresolved", issueCount: 3 });
  });
  it("keeps convergence distinct from unresolved constraints", () => {
    expect(schedulingFeedbackStatus(true, [], [], [])).toEqual({ status: "completed", issueCount: 0 });
    expect(schedulingFeedbackStatus(false, [], [], [])).toEqual({ status: "notConverged", issueCount: 0 });
    expect(schedulingFeedbackStatus(false, [{}], [{}], [{}])).toEqual({ status: "notConverged", issueCount: 3 });
  });
});
