/** Names are display metadata, never storage keys, file paths, or identifiers.
 * Keep internal whitespace and Unicode intact; an empty value means unnamed.
 * External data must pass projectValidation before reaching this helper.
 */
export function normalizeProjectName(value = "") {
  if (typeof value !== "string") throw new TypeError("invalid_project_name");
  return value.trim();
}
