// README.en.md から README.md を生成する（src/lib/readme.js）。README.md は手で編集しないこと。
import { readFile, writeFile } from "node:fs/promises";
import { buildDefaultReadme } from "../src/lib/readme.js";

const srcPath = new URL("../README.en.md", import.meta.url);
const outPath = new URL("../README.md", import.meta.url);

const content = buildDefaultReadme(await readFile(srcPath, "utf8"));
await writeFile(outPath, content, "utf8");
console.log("README.md を README.en.md から生成しました");
