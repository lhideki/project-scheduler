/* =========================================================================================
   Live Demo（GitHub Pages）の言語別ページ
   ------------------------------------------------------------------------------------------
   配布用の project_scheduler.html（言語は自動判定）から、Pages に置く3つのページを作る（scripts/build-pages.mjs）。

   | ページ   | パス                        | 表示言語                                   |
   | -------- | --------------------------- | ------------------------------------------ |
   | Default  | <base>/                     | 保存済みの選択 → ブラウザの言語（従来どおり） |
   | Ja / En  | <base>/ja/ ・ <base>/en/    | ページの言語で起動（保存済みの選択より優先） |

   言語を固定するページには <meta name="project-scheduler-locale" content="ja"> を入れ、<html lang> もその言語にする。
   3ページとも <head> に hreflang 付きの <link rel="alternate">（Default は x-default）を入れる。
   言語を固定したページでヘッダーから言語を切り替えたときは、その場で表示を切り替え、URL を切り替え先の言語の
   ページに置き換える（switchedPageUrl。再読み込みやブックマークでも選んだ言語で開くため）。
   ========================================================================================= */

import { LOCALES, normalizeLocale } from "./i18n.js";

/** ページの表示言語を固定する <meta> の name。 */
export const PAGE_LOCALE_META_NAME = "project-scheduler-locale";

/** Live Demo の公開URL（Default のページ）。ビルド時に PAGES_BASE_URL で上書きできる。 */
export const DEFAULT_PAGES_BASE_URL = "https://lhideki.github.io/project-scheduler/";

/** 公開URLを検証し、末尾を "/" にそろえる（http/https 以外・不正な URL は例外）。 */
export function normalizePagesBaseUrl(value) {
  const url = new URL(String(value || ""));
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Pages の公開URLは http(s) で指定してください: ${value}`);
  }
  url.search = "";
  url.hash = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.href;
}

/** 言語のページのURL。locale が null なら Default のページ。 */
export function localizedPageUrl(baseUrl, locale) {
  const base = normalizePagesBaseUrl(baseUrl);
  if (locale == null) return base;
  const l = normalizeLocale(locale);
  if (!l) throw new Error(`対応していない言語です: ${locale}`);
  return new URL(`${l}/`, base).href;
}

/** hreflang の相互リンク（Default を x-default とし、対応言語の順に並べる）。 */
export function localizedPageAlternates(baseUrl) {
  return [
    { hreflang: "x-default", href: localizedPageUrl(baseUrl, null) },
    ...LOCALES.map(l => ({ hreflang: l, href: localizedPageUrl(baseUrl, l) })),
  ];
}

function escapeAttr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * 配布用HTMLから Pages のページを作る。locale を指定すると、そのページの表示言語を固定する。
 * 差し込む要素は <meta charset> の直後に置く（<style> のCSS・<script> のバンドルより前）。
 */
export function buildLocalizedPageHtml(html, { baseUrl, locale = null }) {
  const l = locale == null ? null : normalizeLocale(locale);
  if (locale != null && !l) throw new Error(`対応していない言語です: ${locale}`);

  const charset = /<meta\s+charset\s*=\s*["']?[\w-]+["']?\s*\/?>/i.exec(html);
  if (!charset) throw new Error("<meta charset> が見つかりません");
  const htmlTag = /<html\b[^>]*>/i.exec(html);
  if (!htmlTag || htmlTag.index > charset.index) throw new Error("<html> が見つかりません");

  const lines = [];
  if (l) lines.push(`<meta name="${PAGE_LOCALE_META_NAME}" content="${l}">`);
  localizedPageAlternates(baseUrl).forEach(({ hreflang, href }) => {
    lines.push(`<link rel="alternate" hreflang="${hreflang}" href="${escapeAttr(href)}">`);
  });

  const insertAt = charset.index + charset[0].length;
  let out = html.slice(0, insertAt) + "\n" + lines.join("\n") + html.slice(insertAt);
  if (l) {
    const tag = htmlTag[0];
    const nextTag = /\slang\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i.test(tag)
      ? tag.replace(/\slang\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, ` lang="${l}"`)
      : tag.replace(/^<html\b/i, `<html lang="${l}"`);
    out = out.slice(0, htmlTag.index) + nextTag + out.slice(htmlTag.index + tag.length);
  }
  return out;
}

/**
 * 言語を固定したページで表示言語を切り替えたときの、切り替え先のページのURL。
 * 現在のURLのクエリ（?schedule= など）とハッシュは引き継ぐ。
 * 切り替え先が別オリジン（ダウンロードしたページをローカルで開いた場合など）・現在と同じURLなら null（URL を変えない）。
 */
export function switchedPageUrl(currentUrl, alternateHref) {
  if (!alternateHref) return null;
  let current;
  let next;
  try {
    current = new URL(currentUrl);
    next = new URL(alternateHref, current);
  } catch (e) {
    return null;
  }
  if (next.origin !== current.origin || current.origin === "null") return null;
  next.search = current.search;
  next.hash = current.hash;
  return next.href === current.href ? null : next.href;
}
