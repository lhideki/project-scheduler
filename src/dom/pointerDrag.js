import { parseISO } from "../lib/calendar.js";

/* =========================================================================================
   DOM/ブラウザAPIに依存するドラッグ・座標変換ユーティリティ
   ========================================================================================= */

/** ポインタドラッグの共通処理（Pointer Capture + windowフォールバック）。
 *  ガントチャートのバー右端ハンドル、WBS行の並べ替え、ネットワーク図のノード移動・接続ハンドルなど、
 *  「ドラッグ中はポインタを追従し、離した位置で確定する」操作すべてで同じ骨組みを使い回す。
 *  ポインタキャプチャにより、ドラッグ中にポインタが要素やウィンドウの外（埋め込み iframe の外側など）に
 *  出てもイベントを取りこぼさない。取れなくても window 側のフォールバックで必ず後始末する。
 *
 *  onMove(ev): ドラッグ中、ポインタが動くたびに呼ばれる。
 *  onEnd(ev):  ポインタを離して正常終了した時に呼ばれる（確定処理はここで行う）。
 *  onCancel(): ポインタキャンセルやウィンドウのフォーカス喪失で中断された時に呼ばれる（確定処理は行わない）。 */
export function startPointerDrag(e, { onMove, onEnd, onCancel }) {
  const target = e.currentTarget;
  const pointerId = e.pointerId;
  try { target.setPointerCapture && target.setPointerCapture(pointerId); } catch (err) { /* no-op */ }

  function teardown() {
    target.removeEventListener("pointermove", handleMove);
    target.removeEventListener("pointerup", handleEnd);
    target.removeEventListener("pointercancel", handleCancel);
    window.removeEventListener("pointerup", handleEnd);
    window.removeEventListener("blur", handleCancel);
    try { target.releasePointerCapture && target.releasePointerCapture(pointerId); } catch (err) { /* no-op */ }
  }
  function handleMove(ev) { onMove && onMove(ev); }
  function handleEnd(ev) { onEnd && onEnd(ev); teardown(); }
  function handleCancel() { onCancel && onCancel(); teardown(); }

  target.addEventListener("pointermove", handleMove);
  target.addEventListener("pointerup", handleEnd);
  target.addEventListener("pointercancel", handleCancel);
  // フォールバック：キャプチャが効かない環境や、ウィンドウ外でポインタが離された場合の保険
  window.addEventListener("pointerup", handleEnd);
  window.addEventListener("blur", handleCancel);
}

/** SVG要素の client 座標系でのポインタ位置を、その SVG のローカル座標に変換する。
 *  ガントチャートのバー端ドラッグ・ネットワーク図のノード/リンクドラッグで共通して使う。 */
export function svgPointFromRef(svgRef, e) {
  const svg = svgRef.current;
  if (!svg) return { x: 0, y: 0 };
  const rect = svg.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

/** 日付文字列(YYYY-MM-DD)をタイムライン上のx座標に変換する関数を作る。
 *  ガント・スプリント・バージョン比較の各タイムラインで同じ「1日 = dayWidthピクセル」の
 *  換算式を共有するための小さなファクトリ。 */
export function makeDateScale(minDateStr, dayWidth) {
  const minTime = parseISO(minDateStr).getTime();
  return function xOf(dateStr) { return Math.round((parseISO(dateStr).getTime() - minTime) / 86400000) * dayWidth; };
}
