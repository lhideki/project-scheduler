// Export-only layout. Never resize the live WBS or change task/plan data.
export const PNG_TASK_MIN_WIDTH = 180;
export const PNG_TASK_MAX_WIDTH = 280;
const PADDING = 12;
const ICON_WIDTH = 14;
const INDENT = 12;
const MAX_INDENT_LEVEL = 6;

const singleLine = value => String(value ?? "").replace(/\s+/gu, " ").trim();

export function ellipsizePngText(text, maxWidth, measure) {
  if (measure(text) <= maxWidth) return text;
  const suffix = "…";
  if (measure(suffix) > maxWidth) return "";
  // Keep emoji sequences and combining marks together when shortening names.
  const chars = Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), part => part.segment);
  let low = 0, high = chars.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measure(chars.slice(0, mid).join("") + suffix) <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return chars.slice(0, low).join("") + suffix;
}

export function wrapPngTaskName(text, maxWidth, measure) {
  if (measure(text) <= maxWidth) return [text];
  const chars = Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), part => part.segment);
  let low = 0, high = chars.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measure(chars.slice(0, mid).join("")) <= maxWidth) low = mid;
    else high = mid - 1;
  }
  if (!low) return [ellipsizePngText(text, maxWidth, measure)];
  // Prefer a nearby word boundary only when the remainder fits. Otherwise a
  // grapheme boundary preserves more of the name (and may avoid an ellipsis).
  let split = low;
  for (let i = low; i >= Math.ceil(low * 0.7); i--) {
    if (/\s/u.test(chars[i] || "") && measure(chars.slice(i).join("").trimStart()) <= maxWidth) { split = i; break; }
  }
  return [chars.slice(0, split).join("").trimEnd(), ellipsizePngText(chars.slice(split).join("").trimStart(), maxWidth, measure)];
}

/**
 * rows must be the same flattened, collapsed list used by the Gantt renderer.
 * measure(text, bold, size) returns a width in CSS pixels using the export font.
 */
export function layoutPngTaskList({ rows, rowStride, rowHeight, scrollTop, viewHeight, headerHeight, header, measure }) {
  const height = Math.min(viewHeight, Math.max(headerHeight, headerHeight + rows.length * rowStride - scrollTop));
  const first = Math.max(0, Math.floor(scrollTop / rowStride));
  const end = height <= headerHeight ? first : Math.min(rows.length, Math.ceil((scrollTop + height - headerHeight) / rowStride));
  const visible = rows.slice(first, end).map((row, offset) => {
    const level = Math.max(0, row.level || 0);
    // Keep enough space for the name even with unusually deep nesting. The
    // depth marker preserves information once physical indentation is capped.
    const depth = level > MAX_INDENT_LEVEL ? `↳${level + 1} ` : "";
    return {
      ...row, index: first + offset, y: (first + offset) * rowStride - scrollTop,
      nameX: PADDING + Math.min(level, MAX_INDENT_LEVEL) * INDENT + ICON_WIDTH,
      name: depth + singleLine(row.name),
      baselineName: row.baselineName === undefined ? undefined : depth + singleLine(row.baselineName),
    };
  });
  let width = PADDING * 2 + measure(header, true, 12);
  for (const row of visible) {
    width = Math.max(width, row.nameX + measure(row.name, row.hasChildren, 12) + PADDING);
    if (row.baselineName !== undefined) width = Math.max(width, row.nameX + measure(row.baselineName, false, 10) + PADDING);
  }
  width = Math.max(PNG_TASK_MIN_WIDTH, Math.min(PNG_TASK_MAX_WIDTH, Math.ceil(width)));
  return {
    width, height, header: ellipsizePngText(header, width - PADDING * 2, text => measure(text, true, 12)),
    rows: visible.map(row => {
      const lines = wrapPngTaskName(row.name, width - row.nameX - PADDING, text => measure(text, row.hasChildren, 12));
      return {
        ...row, lines, label: lines.join("\n"),
        baselineLabel: row.baselineName === undefined ? undefined : ellipsizePngText(row.baselineName, width - row.nameX - PADDING, text => measure(text, false, 10)),
        rowHeight, rowStride,
      };
    }),
  };
}
