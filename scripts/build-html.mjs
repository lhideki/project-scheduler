// dist/bundle.js（esbuildの出力）と dist/output.css（Tailwind CSSの出力）を、
// template.html の該当プレースホルダーに差し込み、単一の project_scheduler.html を生成する。
// npm run build:js / npm run build:css を先に実行してから呼び出すこと（npm run build が3つをまとめて実行する）。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const templatePath = resolve(root, "template.html");
const bundlePath = resolve(root, "dist/bundle.js");
const cssPath = resolve(root, "dist/output.css");
const outPath = resolve(root, "project_scheduler.html");

for (const [label, p] of [["template.html", templatePath], ["dist/bundle.js", bundlePath], ["dist/output.css", cssPath]]) {
  if (!existsSync(p)) {
    console.error(`エラー: ${label} が見つかりません（${p}）。先に npm run build:js / npm run build:css を実行してください。`);
    process.exit(1);
  }
}

const template = readFileSync(templatePath, "utf-8");
const bundleJs = readFileSync(bundlePath, "utf-8");
const outputCss = readFileSync(cssPath, "utf-8");

// 第2引数を関数にすることで、bundleJs/outputCss 内に $&, $1 等の特殊置換パターンに
// 見える文字列が含まれていても、String.prototype.replace に特殊解釈されず安全に置換できる。
const html = template
  .replace("/* __TAILWIND_CSS__ */", () => outputCss)
  .replace("/* __BUNDLE_JS__ */", () => bundleJs);

writeFileSync(outPath, html);
console.log(`project_scheduler.html を生成しました（${html.length.toLocaleString()} bytes）`);
