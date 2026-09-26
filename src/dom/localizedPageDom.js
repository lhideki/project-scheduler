import { normalizeLocale } from "../lib/i18n.js";
import { PAGE_LOCALE_META_NAME, switchedPageUrl } from "../lib/localizedPages.js";

/* =========================================================================================
   Live Demo の言語別ページ（src/lib/localizedPages.js）の、ブラウザ側の処理
   ========================================================================================= */

function currentDocument(doc) {
  return doc || (typeof document !== "undefined" ? document : null);
}

/** ページで固定した表示言語（/ja/・/en/ のページ）。固定していなければ null。 */
export function readPageLocale(doc) {
  const d = currentDocument(doc);
  if (!d) return null;
  const meta = d.querySelector(`meta[name="${PAGE_LOCALE_META_NAME}"]`);
  return meta ? normalizeLocale(meta.getAttribute("content")) : null;
}

/**
 * 言語を固定したページで表示言語を切り替えたとき、URL を切り替え先の言語のページに置き換える（再読み込みしない）。
 * 切り替え先のページは hreflang の <link rel="alternate"> から求める。別オリジンなら何もしない。
 */
export function replaceUrlWithLocalizedPage(locale, doc, win) {
  const d = currentDocument(doc);
  const w = win || (typeof window !== "undefined" ? window : null);
  if (!d || !w || !w.history || typeof w.history.replaceState !== "function") return false;
  const link = d.querySelector(`link[rel="alternate"][hreflang="${locale}"]`);
  const next = switchedPageUrl(w.location.href, link && link.getAttribute("href"));
  if (!next) return false;
  try {
    w.history.replaceState(w.history.state, "", next);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 共有用HTMLに書き出すとき、Live Demo の言語別ページの印（言語の固定と hreflang の相互リンク）を取り除く。
 * 共有用HTMLは配布用の project_scheduler.html と同じく、開いた人の言語で表示する。
 */
export function removeLocalizedPageMarkers(root) {
  root.querySelectorAll(`meta[name="${PAGE_LOCALE_META_NAME}"], link[rel="alternate"][hreflang]`)
    .forEach(el => {
      // build-pages.mjs が要素ごとに入れた改行も取り除く
      const prev = el.previousSibling;
      if (prev && prev.nodeType === 3 && !prev.textContent.trim()) prev.remove();
      el.remove();
    });
}
