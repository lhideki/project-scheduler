import { normalizeProjectName } from "./projectName.js";

// Keep room for format markers, the date and extension on common filesystems.
const MAX_STEM_BYTES = 200;
const UNSAFE_CHARACTERS = /[<>:"/\\|?*]/g;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;
const WINDOWS_DEVICE_NAME = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i;
const EXPORT_FORMATS = {
  json: { fallback: "project-scheduler", suffix: "", extension: "json" },
  html: { fallback: "project-scheduler-share", suffix: "-share", extension: "html" },
  png: { fallback: "gantt", suffix: "-gantt", extension: "png" },
};

/** Derive a download suggestion without changing the stored project name. */
export function sanitizeExportName(projectName = "") {
  const name = normalizeProjectName(projectName).replace(CONTROL_CHARACTERS, "");
  // A name made only of forbidden characters, dots or whitespace is unnamed.
  if (!name.replace(UNSAFE_CHARACTERS, "").replace(/[.\s]/g, "")) return "";

  let safe = name.replace(UNSAFE_CHARACTERS, "_").replace(/^[.\s]+|[.\s]+$/g, "");
  if (WINDOWS_DEVICE_NAME.test(safe)) safe = `_${safe}`;

  const encoder = new TextEncoder();
  let result = "";
  let bytes = 0;
  // Iterate code points so truncation never cuts a surrogate pair in half.
  for (const character of safe) {
    const length = encoder.encode(character).length;
    if (bytes + length > MAX_STEM_BYTES) break;
    result += character;
    bytes += length;
  }
  return result.replace(/[.\s]+$/g, "");
}

/** date is the caller's YYYY-MM-DD value, preserving each export's date convention. */
export function buildExportFilename(projectName, format, date) {
  if (!Object.hasOwn(EXPORT_FORMATS, format)) throw new TypeError("invalid_export_format");
  const { fallback, suffix, extension } = EXPORT_FORMATS[format];
  const name = sanitizeExportName(projectName);
  return `${name ? name + suffix : fallback}_${date}.${extension}`;
}
