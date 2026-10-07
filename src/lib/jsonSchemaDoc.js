function formatLiteral(value) {
  return typeof value === "string" ? `\`${value}\`` : `\`${JSON.stringify(value)}\``;
}

function formatType(schema) {
  if (schema.const !== undefined) return formatLiteral(schema.const);
  if (Array.isArray(schema.enum)) return schema.enum.map(formatLiteral).join(" \\| ");
  if (Array.isArray(schema.type)) return schema.type.map(t => `\`${t}\``).join(" \\| ");
  if (schema.type === "array" && schema.items?.type) return `\`${schema.items.type}[]\``;
  if (schema.type === "array" && schema.items?.$ref) return `\`${schema.items.$ref.slice("#/$defs/".length)}[]\``;
  if (schema.type) return `\`${schema.type}\``;
  if (schema.$ref) return `array`;
  return "—";
}

function formatRequired(requiredSet, key) {
  return requiredSet.has(key) ? "必須" : "任意";
}

function formatDescription(prop) {
  return prop.description || "—";
}

function resolveRef(rootSchema, ref) {
  if (!ref || !ref.startsWith("#/$defs/")) return null;
  return rootSchema.$defs?.[ref.slice("#/$defs/".length)] || null;
}

function buildPropertyRows(rootSchema, objectSchema) {
  const requiredSet = new Set(objectSchema.required || []);
  return Object.entries(objectSchema.properties || {}).map(([name, prop]) => {
    const refTarget = resolveRef(rootSchema, prop.items?.$ref || prop.$ref);
    return {
      name,
      type: formatType(prop),
      required: formatRequired(requiredSet, name),
      description: formatDescription(prop),
      refTarget,
    };
  });
}

function renderTable(rows) {
  return [
    "| フィールド | 型 | 必須 | 説明 |",
    "| --- | --- | --- | --- |",
    ...rows.map(row => `| \`${row.name}\` | ${row.type} | ${row.required} | ${row.description} |`),
  ].join("\n");
}

function renderSection(rootSchema, title, objectSchema, options = {}) {
  const lines = [`## ${title}`];
  if (options.includeDescription !== false && objectSchema.description) lines.push("", objectSchema.description);
  const rows = buildPropertyRows(rootSchema, objectSchema);
  lines.push("", renderTable(rows));
  return lines.join("\n");
}

export function renderJsonSchemaMarkdown(rootSchema) {
  const taskSchema = rootSchema.$defs.task;
  const resourceSchema = rootSchema.$defs.resource;
  const sprintSchema = rootSchema.$defs.sprint;
  const versionSchema = rootSchema.$defs.version;
  const dependencySchema = rootSchema.$defs.dependency;
  const versionTaskSchema = rootSchema.$defs.versionTask;
  const calendarExceptionSchema = rootSchema.$defs.calendarException;

  return [
    "# JSON保存形式",
    "",
    "<!-- このファイルは scripts/build-json-doc.mjs により自動生成されます。直接編集しないでください。 -->",
    "",
    rootSchema.description,
    "",
    "## 方針",
    "",
    `- 現行の保存形式は \`schemaVersion: ${rootSchema.properties.schemaVersion.const}\` です`,
    "- インポートは現行形式のみ受け付けます",
    "- 異なる schemaVersion の旧形式JSONへの変換は行いません。名前など後から追加された任意項目を含まない schemaVersion: 1 JSONは受け付けます",
    "- `projectName` 対応前のHTML・CLIは未知のトップレベル項目を保持しないため、そこを通して保存・再書き出しすると名前が失われます。旧JSON Schema（additionalProperties: false）でも名前付きJSONは検証に失敗します。名前を保持するには対応版のHTML・CLIを使ってください",
    "",
    renderSection(rootSchema, "トップレベル構造", rootSchema, { includeDescription: false }),
    "",
    "```json",
    JSON.stringify({
      schemaVersion: rootSchema.properties.schemaVersion.const,
      exportedAt: "2026-08-26T00:00:00.000Z",
      projectName: "新製品リリース",
      tasks: [],
      resources: [],
      sprints: [],
      versions: [],
      calendarExceptions: [],
    }, null, 2),
    "```",
    "",
    renderSection(rootSchema, "tasks", taskSchema),
    "",
    renderSection(rootSchema, "predecessors の要素", dependencySchema),
    "",
    renderSection(rootSchema, "resources", resourceSchema),
    "",
    renderSection(rootSchema, "sprints", sprintSchema),
    "",
    renderSection(rootSchema, "versions", versionSchema),
    "",
    renderSection(rootSchema, "versions.tasks の要素", versionTaskSchema),
    "",
    renderSection(rootSchema, "calendarExceptions の要素", calendarExceptionSchema),
    "",
    "## インポート時の扱い",
    "",
    "- JSONとして解釈できない場合は読み込みに失敗します",
    `- \`schemaVersion !== ${rootSchema.properties.schemaVersion.const}\` の場合は読み込みに失敗します`,
    "- 必須トップレベル項目が欠けている場合は読み込みに失敗します",
    "- `projectName` は前後の空白を除き、未設定・空白のみを空文字列へ正規化します。文字列でない値は読み込みに失敗します。既定表示名は翻訳して表示するだけで保存しません",
    "- 名前はID・保存先・ファイル名ではありません。同名を許容し、名前を変更しても `pm_project`・`schedule` の関連付け・実ファイル名は変わりません。日程バージョンを復元しても現在の名前を維持します",
    "- `hasFullSnapshot` は `rawTasks` / `rawResources` / `rawSprints` の有無から再計算します",
    "- `levelingOn` / `calendarExceptions` が無い旧形式JSONは、それぞれ `false` / `[]` として読み込みます",
    "- `calendarExceptions` キーが存在するのに配列でない場合は読み込みに失敗します",
    "",
  ].join("\n");
}
