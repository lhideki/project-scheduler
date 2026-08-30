import { normalizeImportedProject } from "./exportUtils.js";

// 共有用HTMLへ書き出したプロジェクトデータを保持する <script> 要素の識別情報。
export const EMBEDDED_PROJECT_SCRIPT_ID = "project-scheduler-embedded";
export const EMBEDDED_PROJECT_SCRIPT_TYPE = "application/json";

/**
 * プロジェクトエクスポートJSONを、<script type="application/json"> の中身として
 * 安全に埋め込める文字列へ変換する。
 *
 * タスクメモ等に "</script>" が含まれていてもHTMLパーサがそこでスクリプトを
 * 終端しないよう、"<"（U+003C）をすべて JSON のユニコードエスケープ表記
 * （バックスラッシュ + "u003c"）へ置き換える。結果の文字列には "<" が1つも
 * 現れないため "</script>" も作れない。JSON.parse はこのエスケープを "<" に
 * 戻すため、往復しても値は一切変わらない。
 */
export function serializeEmbeddedProject(projectExport) {
  return JSON.stringify(projectExport).replace(/</g, "\\u003c");
}

/**
 * 埋め込み <script> のテキストを、検証・正規化済みのプロジェクトデータへ変換する。
 * 現行スキーマ以外は normalizeImportedProject が invalid_project_json を投げる。
 */
export function parseEmbeddedProject(text) {
  return normalizeImportedProject(JSON.parse(text));
}
