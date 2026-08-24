/* =========================================================================================
   依存関係の文字列パーサ（MS Project 風ショートハンド： 3FS+2, 5SS-1 など）
   ========================================================================================= */

/**
 * @typedef {"FS"|"SS"|"FF"|"SF"} DepType
 * 先行タスクとの関係種別（FS=Finish-to-Start, SS=Start-to-Start, FF=Finish-to-Finish, SF=Start-to-Finish）。
 */

/**
 * @typedef {Object} Dependency
 * @property {string} id - 先行タスク（またはグループ）のID
 * @property {DepType} type - 依存関係の種別
 * @property {number} lag - リード/ラグ（稼働日数、負値も可）
 */

const DEP_RE = /^\s*(\d+(?:\.\d+)*)\s*(FS|SS|FF|SF)?\s*([+-]\s*\d+)?\s*$/i;

export function parseDepString(str, noToId) {
  if (!str || !str.trim()) return [];
  const out = [];
  str.split(",").forEach(tok => {
    const m = tok.match(DEP_RE);
    if (!m) return;
    const no = m[1];
    const id = noToId[no];
    if (!id) return;
    const type = (m[2] || "FS").toUpperCase();
    const lag = m[3] ? parseInt(m[3].replace(/\s/g, ""), 10) : 0;
    out.push({ id, type, lag });
  });
  return dedupeDeps(out);
}
/** 同じ先行タスクに対する依存関係は1本に限定する（後勝ち）。
 *  2タスク間に複数本の関係が存在すると、ガント/ネットワーク図の矢印キーが衝突し、
 *  React の再描画時に内部参照が壊れる不具合につながるため、常に一意性を保証する。 */
export function dedupeDeps(deps) {
  const map = new Map();
  deps.forEach(d => map.set(d.id, d));
  return Array.from(map.values());
}
/** 依存関係の「型＋ラグ」部分だけの短いラベルを作る（例: "FS+1", "SS-2", "FF"）。
 *  WBS番号を含めた完全な表記（DepInput欄の表示用）は formatDeps を使う。 */
export function formatDepLabel(dep) {
  return `${dep.type}${dep.lag ? (dep.lag > 0 ? "+" + dep.lag : dep.lag) : ""}`;
}
export function formatDeps(deps, idToNo) {
  if (!deps || !deps.length) return "";
  return deps
    .filter(d => idToNo[d.id] != null)
    .map(d => `${idToNo[d.id]}${formatDepLabel(d)}`)
    .join(", ");
}
