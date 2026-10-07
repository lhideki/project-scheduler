/** Prepare one atomic writeback. Use the same IDs for the count and start-date highlights. */
export function applyScheduleStartDates(tasks, startDates) {
  const groups = new Set(tasks.map(task => task.parentId).filter(id => id != null));
  const changedIds = new Set();
  const next = tasks.map(task => {
    if (groups.has(task.id) || !startDates.has(task.id) || task.startDate === startDates.get(task.id)) return task;
    changedIds.add(task.id);
    return { ...task, startDate: startDates.get(task.id) };
  });
  return { tasks: changedIds.size ? next : tasks, changedIds };
}

/** Count canonical detector results, never their per-task projections (cycles have several targets). */
export function schedulingFeedbackStatus(converged, dependencyIssues, sprintConflicts, levelWarnings) {
  const issueCount = dependencyIssues.length + sprintConflicts.length + levelWarnings.length;
  return { status: !converged ? "notConverged" : issueCount ? "unresolved" : "completed", issueCount };
}
