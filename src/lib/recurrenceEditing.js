function overridePatch(task, originalDate, override) {
  const overrides = task.occurrenceOverrides || {};
  const next = { ...overrides };
  if (Object.keys(override).length) next[originalDate] = override;
  else delete next[originalDate];
  return JSON.stringify(next) === JSON.stringify(overrides) ? null : { occurrenceOverrides: next };
}

/**
 * Convert a validated occurrence draft to a minimal raw-task patch. Generated
 * dates keep their original inherited/explicit shape for dependency-only edits.
 * Date edits pin the complete displayed range so the saved span matches the UI.
 * Callers omit date fields until the user edits a date, allowing untouched inputs
 * to follow newly generated props while the editor remains open.
 * An omitted predecessors edit preserves the original array. An explicit
 * undefined predecessors edit restores inheritance from the series.
 */
export function buildOccurrenceOverridePatch(task, occurrence, edits) {
  const overrides = task.occurrenceOverrides || {};
  const originalDate = occurrence.occurrenceDate;
  const original = overrides[originalDate] || {};
  const override = { ...original };
  const startDate = edits.startDate ?? occurrence.startDate;
  const endDate = edits.endDate ?? occurrence.endDate;
  if (startDate !== occurrence.startDate || endDate !== occurrence.endDate) {
    override.startDate = startDate;
    override.endDate = endDate;
  }
  if (Object.hasOwn(edits, "predecessors")) {
    if (edits.predecessors === undefined) delete override.predecessors;
    else override.predecessors = edits.predecessors;
  }
  return overridePatch(task, originalDate, override);
}

/** Change one original-date identity without pinning dates or replacing other fields.
 * Skipping retains progress; restoring resumes exactly that saved/inherited value.
 * Invalid drafts and effective no-ops do not create history entries. */
export function buildOccurrenceProgressPatch(task, occurrenceDate, edits) {
  if (Object.hasOwn(edits, "progress") && (!Number.isFinite(edits.progress) || edits.progress < 0 || edits.progress > 100)) return null;
  if (Object.hasOwn(edits, "skipped") && typeof edits.skipped !== "boolean") return null;
  const original = task.occurrenceOverrides?.[occurrenceDate] || {};
  const override = { ...original };
  if (Object.hasOwn(edits, "progress") && edits.progress !== (original.progress ?? task.progress ?? 0)) override.progress = edits.progress;
  if (Object.hasOwn(edits, "skipped") && edits.skipped !== (original.skipped === true)) override.skipped = edits.skipped;
  return overridePatch(task, occurrenceDate, override);
}

/** Reset scheduling exceptions only. Progress, skip state and extensions survive. */
export function buildOccurrenceScheduleResetPatch(task, occurrenceDate) {
  const override = { ...task.occurrenceOverrides?.[occurrenceDate] };
  delete override.startDate;
  delete override.endDate;
  delete override.predecessors;
  return overridePatch(task, occurrenceDate, override);
}
