import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DEFAULT_README_NOTICE, buildDefaultReadme } from "./readme.js";

const BASE = "https://lhideki.github.io/project-scheduler/";
const readRepoFile = name => readFileSync(new URL(`../../${name}`, import.meta.url), "utf8");

describe("buildDefaultReadme", () => {
  it("Live Demo のリンクを Default のページに向け、先頭に生成物の注記を入れる", () => {
    const en = `# Title\n\n[Live Demo](${BASE}en/) | [JSON](docs/json-format.md)\n\n| En | ${BASE}en/ |\n\n1. Open the [Live Demo](${BASE}en/).\n`;
    expect(buildDefaultReadme(en)).toBe(
      `${DEFAULT_README_NOTICE}\n\n# Title\n\n[Live Demo](${BASE}) | [JSON](docs/json-format.md)\n\n| En | ${BASE}en/ |\n\n1. Open the [Live Demo](${BASE}).\n`,
    );
  });

  it("Live Demo のリンクが無ければ例外にする（置き換え漏れに気づくため）", () => {
    expect(() => buildDefaultReadme(`[Live Demo](${BASE})`)).toThrow();
  });
});

describe("README の言語別ファイル", () => {
  const readmes = {
    "README.md": { demo: BASE },
    "README.en.md": { demo: `${BASE}en/` },
    "README.ja.md": { demo: `${BASE}ja/` },
  };

  it("README.md は README.en.md から生成した内容と一致する（npm run build:readme で更新する）", () => {
    expect(readRepoFile("README.md")).toBe(buildDefaultReadme(readRepoFile("README.en.md")));
  });

  it.each(Object.entries(readmes))("%s は3つの README に切り替えられ、Live Demo はその言語のページを指す", (name, { demo }) => {
    const text = readRepoFile(name);
    expect(text).toContain("[Default](README.md) | [English](README.en.md) | [日本語](README.ja.md)");
    const demoLinks = [...text.matchAll(/\[Live Demo\]\(([^)]*)\)/g)].map(m => m[1]);
    expect(demoLinks.length).toBeGreaterThan(0);
    demoLinks.forEach(href => expect(href).toBe(demo));
  });
});
