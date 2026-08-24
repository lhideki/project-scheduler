/* =========================================================================================
   スプリント関連ヘルパー（配色・期間重複検出）
   ========================================================================================= */

/**
 * @typedef {Object} Sprint
 * @property {string} id
 * @property {string} name
 * @property {string} [theme]
 * @property {string} startDate - YYYY-MM-DD
 * @property {string} endDate - YYYY-MM-DD
 * @property {number} order
 */

// スプリントの配色パレット。グループ（WBS階層）の配色とは意図的に別系統にし、
// 「グループ」と「スプリント」が別軸の分類であることが一目で分かるようにしている。
export const SPRINT_PALETTE = [
  { text: "#0369A1", tagBg: "#F0F9FF", tagBorder: "#BAE6FD", band: "#E0F2FE" },
  { text: "#6D28D9", tagBg: "#F5F3FF", tagBorder: "#DDD6FE", band: "#EDE9FE" },
  { text: "#BE185D", tagBg: "#FDF2F8", tagBorder: "#FBCFE8", band: "#FCE7F3" },
  { text: "#047857", tagBg: "#ECFDF5", tagBorder: "#A7F3D0", band: "#D1FAE5" },
  { text: "#B45309", tagBg: "#FFFBEB", tagBorder: "#FDE68A", band: "#FEF3C7" },
  { text: "#334155", tagBg: "#F8FAFC", tagBorder: "#CBD5E1", band: "#E2E8F0" },
];
/** スプリントIDから配色を一意に決める（一覧内の並び順が変わっても同じスプリントは同じ色になるよう、
 *  配列インデックスではなくIDのハッシュ値を使う）。 */
export function sprintColorForId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return SPRINT_PALETTE[Math.abs(h) % SPRINT_PALETTE.length];
}
/** 開始日・終了日が重なっているスプリントのIDを集める（保存はできるが警告表示に使う）。 */
export function computeOverlappingSprintIds(sprints) {
  const ids = new Set();
  const valid = sprints.filter(s => s.startDate && s.endDate && s.startDate <= s.endDate);
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      const a = valid[i], b = valid[j];
      if (a.startDate <= b.endDate && b.startDate <= a.endDate) { ids.add(a.id); ids.add(b.id); }
    }
  }
  return ids;
}
