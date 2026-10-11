import { ALLOCATION_UNITS_PER_DAY } from "./workAllocation.js";

/** Calendar recurrence is independent of workdays, today's date and the visible range. */
export const MAX_RECURRENCE_OCCURRENCES = 2000;
export const MAX_RECURRENCE_SPAN_DAYS = 3660;
export const MAX_RECURRENCE_CALENDAR_DAYS = 3660;
export const MAX_RECURRENCE_MOVE_DAYS = 3660;
const DAY_MS = 86400000;
const INTERNAL_KIND = Symbol("recurrence-expansion");
const RESOLVED_DEP = Symbol("recurrence-dependency");
export const isOccurrenceTask = task => task?.[INTERNAL_KIND] === "occurrence";
export const isRecurringSummaryTask = task => task?.[INTERNAL_KIND] === "series";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addCalendarDays(iso, days) {
  if (!isISODate(iso) || !Number.isInteger(days)) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return Number.isFinite(d.getTime()) && d.getUTCFullYear() >= 0 && d.getUTCFullYear() <= 9999 ? d.toISOString().slice(0, 10) : null;
}

/** One calendar year, inclusive. Leap-day origins end on February 28 next year. */
export function defaultCalculationEndDate(origin) {
  if (!isISODate(origin)) return null;
  const d = new Date(`${origin}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.getUTCFullYear() > 9999 ? "9999-12-31" : d.toISOString().slice(0, 10);
}

export function isRecurringTask(task) {
  return !!(task && task.recurrence && !isOccurrenceTask(task));
}

/** JSON tuple encoding is injective even when IDs contain delimiters or ISO dates. */
export function occurrenceId(seriesId, date) {
  return `@recurrence:${JSON.stringify([String(seriesId), date])}`;
}

function monthDate(origin, offset, mode) {
  const d = new Date(`${origin}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + offset);
  if (d.getUTCFullYear() > 9999 || !Number.isFinite(d.getTime())) return null;
  const end = new Date(d);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  d.setUTCDate(mode === "start" ? 1 : mode === "end" ? end.getUTCDate() : Math.min(day, end.getUTCDate()));
  return d.toISOString().slice(0, 10);
}

/**
 * Generate at most MAX_RECURRENCE_OCCURRENCES fixed-date instances. The horizon limits
 * original occurrence dates; moved exceptions may lie outside it and keep their identity.
 * An end-only override changes the span; a start-only override keeps the default span.
 * Invalid input is reported in invalidReason rather than silently treated as a valid series.
 */
export function generateOccurrences(task) {
  const origin = task?.startDate;
  const rule = task?.recurrence || {};
  const requestedCalculationEndDate = rule.endDate || rule.calculationEndDate || defaultCalculationEndDate(origin);
  let calculationEndDate = requestedCalculationEndDate;
  const result = { occurrences: [], calculationEndDate, requestedCalculationEndDate, truncated: false, truncationReasons: [] };
  if (!isISODate(origin) || !["daily", "weekly", "monthly"].includes(rule.frequency)
    || !Number.isInteger(rule.interval) || rule.interval < 1 || rule.interval > 365
    || !isISODate(calculationEndDate) || calculationEndDate < origin || (rule.endDate && !isISODate(rule.endDate))) {
    return { ...result, invalidReason: "invalid-recurrence" };
  }
  const maxHorizon = addCalendarDays(origin, MAX_RECURRENCE_CALENDAR_DAYS - 1) || "9999-12-31";
  if (calculationEndDate > maxHorizon) {
    calculationEndDate = maxHorizon;
    result.truncated = true;
    result.truncationReasons.push("calendar-horizon-limit");
  }
  const horizon = calculationEndDate;
  result.calculationEndDate = horizon;
  const duration = Number.isFinite(task.duration) ? Math.max(0, task.duration) : 0;
  const span = Math.max(1, Math.ceil(duration));
  if (span > MAX_RECURRENCE_SPAN_DAYS) return { ...result, invalidReason: "recurrence-span-exceeded" };
  const weekdays = rule.weekdays?.length ? [...new Set(rule.weekdays)].filter(d => Number.isInteger(d) && d >= 0 && d <= 6) : [new Date(`${origin}T00:00:00Z`).getUTCDay()];
  if (rule.frequency === "weekly" && !weekdays.length) return { ...result, invalidReason: "invalid-weekdays" };

  function append(date) {
    if (date < origin) return true;
    if (date > horizon) return false;
    if (result.occurrences.length === MAX_RECURRENCE_OCCURRENCES) {
      result.truncated = true;
      result.truncationReasons.push("occurrence-limit");
      result.calculationEndDate = result.occurrences[result.occurrences.length - 1].occurrenceDate;
      return false;
    }
    const override = task.occurrenceOverrides?.[date] || {};
    const startDate = override.startDate || date;
    const endDate = override.endDate || addCalendarDays(startDate, span - 1);
    if (!isISODate(startDate) || !isISODate(endDate) || endDate < startDate) {
      result.invalidReason = "invalid-occurrence-dates";
      return false;
    }
    if (Math.abs(Date.parse(startDate) - Date.parse(date)) / DAY_MS > MAX_RECURRENCE_MOVE_DAYS) {
      result.invalidReason = "occurrence-move-exceeded";
      return false;
    }
    if ((Date.parse(endDate) - Date.parse(startDate)) / DAY_MS + 1 > MAX_RECURRENCE_SPAN_DAYS) {
      result.invalidReason = "occurrence-span-exceeded";
      return false;
    }
    const { recurrence, occurrenceOverrides, ...base } = task;
    result.occurrences.push({
      ...base, id: occurrenceId(task.id, date), seriesId: task.id, occurrenceDate: date,
      parentId: task.id, order: result.occurrences.length, isOccurrence: true, isRecurringSummary: false, [INTERNAL_KIND]: "occurrence",
      startDate, endDate, milestone: false, milestoneMode: undefined, fixedDate: undefined,
      progress: typeof override.progress === "number" ? override.progress : (task.progress || 0),
      skipped: override.skipped === true,
      predecessors: (Array.isArray(override.predecessors) ? override.predecessors : task.predecessors || []).map(d => ({ ...d })),
    });
    return true;
  }

  if (rule.frequency === "daily") {
    for (let date = origin; date && date <= horizon; date = addCalendarDays(date, rule.interval)) if (!append(date)) break;
  } else if (rule.frequency === "weekly") {
    const originTime = Date.parse(`${origin}T00:00:00Z`);
    const horizonTime = Date.parse(`${horizon}T00:00:00Z`);
    const day = new Date(originTime).getUTCDay();
    // The anchored Monday may be in year -1 when the origin is early in year 0000.
    // Keep that intermediate value numeric; serialize only supported occurrence dates.
    const mondayTime = originTime - ((day + 6) % 7) * DAY_MS;
    const offsets = weekdays.map(d => (d + 6) % 7).sort((a, b) => a - b);
    outer: for (let week = mondayTime; week <= horizonTime; week += rule.interval * 7 * DAY_MS) {
      for (const offset of offsets) {
        const time = week + offset * DAY_MS;
        if (time < originTime) continue;
        if (time > horizonTime) break outer;
        if (!append(new Date(time).toISOString().slice(0, 10))) break outer;
      }
    }
  } else {
    for (let month = 0; ; month += rule.interval) {
      const date = monthDate(origin, month, rule.monthDay || "day");
      if (!date || !append(date)) break;
    }
  }
  return result;
}

/** Uniform effort over the complete fixed calendar span, including non-working days.
 * Skipped occurrences retain their span but consume no capacity. */
export function occurrenceLoads(task) {
  if (task.skipped || !(task.duration > 0) || !isISODate(task.startDate) || !isISODate(task.endDate)) return [];
  const days = Math.round((Date.parse(task.endDate) - Date.parse(task.startDate)) / DAY_MS) + 1;
  if (days <= 0 || days > MAX_RECURRENCE_SPAN_DAYS) return [];
  // Distribute the ledger's micro-day units as evenly as possible, preserving total
  // effort exactly rather than independently rounding every day's fractional load.
  const units = Math.max(1, Math.round(task.duration * ALLOCATION_UNITS_PER_DAY));
  const perDay = Math.floor(units / days), extra = units % days;
  return Array.from({ length: days }, (_, i) => ({ date: addCalendarDays(task.startDate, i), load: (perDay + (i < extra ? 1 : 0)) / ALLOCATION_UNITS_PER_DAY }));
}

/**
 * Pure, idempotent expansion. Stored series become internal summaries; default
 * predecessors live on occurrences so exception predecessors replace them completely.
 */
export function expandRecurringTasks(tasks = []) {
  const expanded = [];
  const rawIds = new Set(tasks.filter(t => !isOccurrenceTask(t)).map(t => t.id));
  for (const task of tasks) {
    if (!isRecurringTask(task) || isRecurringSummaryTask(task)) { expanded.push(task); continue; }
    const generated = generateOccurrences(task);
    let { occurrences, ...metadata } = generated;
    if (occurrences.some(t => rawIds.has(t.id))) {
      metadata.invalidReason = "occurrence-id-collision";
      occurrences = [];
    }
    const skippedOccurrenceCount = occurrences.filter(occurrence => occurrence.skipped).length;
    expanded.push({ ...task, isRecurringSummary: true, isOccurrence: false, [INTERNAL_KIND]: "series", recurrencePredecessors: task.predecessors || [], predecessors: [], recurrenceMetadata: {
      ...metadata, occurrenceCount: occurrences.length, skippedOccurrenceCount,
      activeOccurrenceCount: occurrences.length - skippedOccurrenceCount,
    } });
    expanded.push(...occurrences);
  }
  // Keep original IDs on dependency metadata for diagnostics, even when a referenced
  // occurrence is absent from this rule/horizon. Missing references must stay missing.
  return expanded.map(task => {
    if (!(task.predecessors || []).some(dep => dep.occurrenceDate && !dep[RESOLVED_DEP])) return task;
    return { ...task, predecessors: task.predecessors.map(dep => dep.occurrenceDate && !dep[RESOLVED_DEP]
      ? { ...dep, id: occurrenceId(dep.id, dep.occurrenceDate), occurrenceSeriesId: dep.id, [RESOLVED_DEP]: true } : dep) };
  });
}
