import { describe, expect, it } from "vitest";
import { PROJECT_JSON_SCHEMA } from "./exportUtils.js";
import { renderJsonSchemaMarkdown } from "./jsonSchemaDoc.js";

describe("renderJsonSchemaMarkdown", () => {
  it("JSON Schema から主要セクションを含む Markdown を生成する", () => {
    const out = renderJsonSchemaMarkdown(PROJECT_JSON_SCHEMA);
    expect(out).toContain("# JSON保存形式");
    expect(out).toContain("## トップレベル構造");
    expect(out).toContain("## tasks");
    expect(out).toContain("## versions");
    expect(out).toContain("| `schemaVersion` | `1` | 必須 |");
    expect(out).toContain("| `type` | `FS` \\| `SS` \\| `FF` \\| `SF` | 必須 |");
  });
});

