// src/agent/cli.js を esbuild でバンドルし、Skill から単体で実行できる
// .claude/skills/schedule-adjust/cli.mjs を生成する。
// src/lib/ は外部npm依存を持たないため、生成物は Node 標準機能だけで動く（node_modules 不要）。
// ロジックの正は src/lib/。この生成物を手で編集しないこと（次回ビルドで上書きされる）。
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const entry = resolve(root, "src/agent/cli.js");
const outdir = resolve(root, ".claude/skills/schedule-adjust");
const outfile = resolve(outdir, "cli.mjs");

mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  // 生成物はレビュー時に中身を確認できるよう minify しない（platform=node なのでサイズは問題にならない）。
  minify: false,
  legalComments: "eof",
  banner: {
    js: [
      "#!/usr/bin/env node",
      "// ============================================================================",
      "// GENERATED FILE — do not edit.",
      "// `npm run build:agent` が src/agent/cli.js（と src/lib/）からバンドルします。",
      "// ============================================================================",
    ].join("\n"),
  },
});

console.log(`.claude/skills/schedule-adjust/cli.mjs を生成しました`);
