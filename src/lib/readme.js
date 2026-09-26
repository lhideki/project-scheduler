/* =========================================================================================
   README の言語別ファイル
   ------------------------------------------------------------------------------------------
   | ファイル       | 言語                                         | Live Demo のリンク先 |
   | -------------- | -------------------------------------------- | -------------------- |
   | README.md      | 英語（GitHub のリポジトリトップに表示される版） | Default のページ     |
   | README.en.md   | 英語                                         | /en/ のページ        |
   | README.ja.md   | 日本語                                       | /ja/ のページ        |

   README.md は README.en.md から生成する（npm run build:readme）。手で2つを同期すると内容がずれるため。
   違いは先頭の生成物の注記と、Live Demo のリンク先（[Live Demo](.../en/) → [Live Demo](.../)）だけ。
   一致していることは readme.test.js（npm run test）で確認する。
   ========================================================================================= */

import { DEFAULT_PAGES_BASE_URL, localizedPageUrl } from "./localizedPages.js";

/** README.md の先頭に入れる、生成物であることの注記（GitHub では表示されない）。 */
export const DEFAULT_README_NOTICE =
  "<!-- This file is generated from README.en.md by `npm run build:readme`. Edit README.en.md instead. -->";

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** README.en.md の内容から README.md の内容を作る。Live Demo のリンクが1つもなければ例外。 */
export function buildDefaultReadme(enReadme, { baseUrl = DEFAULT_PAGES_BASE_URL } = {}) {
  const enUrl = localizedPageUrl(baseUrl, "en");
  const defaultUrl = localizedPageUrl(baseUrl, null);
  const pattern = new RegExp(`\\[Live Demo\\]\\(${escapeRegExp(enUrl)}\\)`, "g");
  let count = 0;
  const body = String(enReadme).replace(pattern, () => {
    count += 1;
    return `[Live Demo](${defaultUrl})`;
  });
  if (count === 0) throw new Error(`README.en.md に [Live Demo](${enUrl}) のリンクがありません`);
  return `${DEFAULT_README_NOTICE}\n\n${body}`;
}
