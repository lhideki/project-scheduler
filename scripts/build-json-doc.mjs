import { writeFile } from "node:fs/promises";
import { PROJECT_JSON_SCHEMA } from "../src/lib/exportUtils.js";
import { renderJsonSchemaMarkdown } from "../src/lib/jsonSchemaDoc.js";

const outPath = new URL("../docs/json-format.md", import.meta.url);
const content = renderJsonSchemaMarkdown(PROJECT_JSON_SCHEMA);

await writeFile(outPath, content, "utf8");
console.log("docs/json-format.md を生成しました");

