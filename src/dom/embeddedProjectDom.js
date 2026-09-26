import {
  EMBEDDED_PROJECT_SCRIPT_ID, EMBEDDED_PROJECT_SCRIPT_TYPE,
  serializeEmbeddedProject, parseEmbeddedProject,
} from "../lib/embeddedProject.js";
import { removeLocalizedPageMarkers } from "./localizedPageDom.js";

/**
 * 現在の document に「共有用HTML」の埋め込みデータがあれば読み取って検証する。
 *
 * - 要素なし               → null（通常のローカル起動）
 * - 要素あり・解析に成功    → { ok: true, data }
 * - 要素あり・解析に失敗    → { ok: false }
 */
export function readEmbeddedProject(doc) {
  const d = doc || (typeof document !== "undefined" ? document : null);
  if (!d) return null;
  const el = d.getElementById(EMBEDDED_PROJECT_SCRIPT_ID);
  if (!el) return null;
  try {
    return { ok: true, data: parseEmbeddedProject(el.textContent || "") };
  } catch (e) {
    return { ok: false };
  }
}

/**
 * 現在ロード済みのHTMLをベースに、指定したプロジェクトデータを埋め込んだ
 * 自己完結HTML文字列を生成する。
 *
 * - #root の描画結果（Reactがマウントした内容）は取り除く
 * - 既存の埋め込みデータ（共有HTMLからの再書き出し時）があれば置き換える
 * - Live Demo の言語別ページ（/ja/・/en/）の言語の固定と hreflang のリンクは取り除く
 *   （共有用HTMLは配布用HTMLと同じく、開いた人の言語で表示する）
 *
 * 埋め込み <script> は <head> の末尾へ置く。バンドルの <script>（body内）より前に
 * 解析されている必要があるため（アプリ起動時に getElementById で読み取る）。
 */
export function buildSharedHtml(projectExport, doc) {
  const d = doc || document;
  const html = d.documentElement.cloneNode(true);

  const root = html.querySelector("#root");
  if (root) root.innerHTML = "";

  const prev = html.querySelector("#" + EMBEDDED_PROJECT_SCRIPT_ID);
  if (prev) prev.remove();

  removeLocalizedPageMarkers(html);

  const script = d.createElement("script");
  script.type = EMBEDDED_PROJECT_SCRIPT_TYPE;
  script.id = EMBEDDED_PROJECT_SCRIPT_ID;
  script.textContent = serializeEmbeddedProject(projectExport);
  (html.querySelector("head") || html.querySelector("body") || html).appendChild(script);

  return "<!doctype html>\n" + html.outerHTML + "\n";
}
