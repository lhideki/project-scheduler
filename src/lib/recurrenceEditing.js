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
  const next = { ...overrides };
  if (Object.keys(override).length) next[originalDate] = override;
  else delete next[originalDate];
  return JSON.stringify(next) === JSON.stringify(overrides) ? null : { occurrenceOverrides: next };
}
