// project_scheduler.html（npm run build の成果物）から、GitHub Pages に置く言語別のページを _site/ に生成する。
//   _site/index.html     Default（言語は自動判定。配布用HTMLと同じ）
//   _site/ja/index.html  日本語で起動
//   _site/en/index.html  英語で起動
// 3ページとも hreflang の相互リンクを持つ。公開URLは環境変数 PAGES_BASE_URL で指定する（省略時は lhideki.github.io）。
// 差し込む内容は src/lib/localizedPages.js を参照。_site/ はコミットしない（.github/workflows/pages.yml が公開する）。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { LOCALES } from "../src/lib/i18n.js";
import { DEFAULT_PAGES_BASE_URL, buildLocalizedPageHtml, localizedPageUrl, normalizePagesBaseUrl } from "../src/lib/localizedPages.js";

const srcPath = new URL("../project_scheduler.html", import.meta.url);
const outDir = new URL("../_site/", import.meta.url);

if (!existsSync(srcPath)) {
  console.error("エラー: project_scheduler.html が見つかりません。先に npm run build を実行してください。");
  process.exit(1);
}

const baseUrl = normalizePagesBaseUrl(process.env.PAGES_BASE_URL || DEFAULT_PAGES_BASE_URL);
const html = await readFile(srcPath, "utf8");

for (const locale of [null, ...LOCALES]) {
  const dir = locale ? new URL(`${locale}/`, outDir) : outDir;
  await mkdir(dir, { recursive: true });
  await writeFile(new URL("index.html", dir), buildLocalizedPageHtml(html, { baseUrl, locale }), "utf8");
  console.log(`_site/${locale ? `${locale}/` : ""}index.html を生成しました（${localizedPageUrl(baseUrl, locale)}）`);
}
