/* =========================================================================================
   スプリント関連ヘルパー（配色・期間重複検出・スケジュール矛盾検出）
   ========================================================================================= */

import { fmtJP } from "./calendar.js";
import { buildFlatList } from "./taskTree.js";

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
/**
 * 最終的な表示スケジュール（schedule）が、各タスクの所属スプリント期間からはみ出していないかを判定する。
 * 複数スプリントが紐付く場合は、それらの期間の和集合（最も早い開始日〜最も遅い終了日）を基準にする
 * （タスクが複数スプリントにまたがること自体は許容するため）。App のヘッダーのアラートアイコン／
 * ダイアログ一覧、および CLI のレポートで共有する。
 * @param {import("./taskTree.js").Task[]} tasks
 * @param {Sprint[]} sprints
 * @param {Map<string, import("./scheduling.js").ScheduleEntry>} schedule
 * @returns {{taskId: string, name: string, wbsNo: string, sprintName: string, reasons: string[]}[]}
 */
export function detectSprintConflicts(tasks, sprints, schedule) {
  if (!sprints || !sprints.length) return [];
  const sprintById = {};
  sprints.forEach(s => (sprintById[s.id] = s));
  const wbsNoById = {};
  buildFlatList(tasks, new Set()).forEach(t => (wbsNoById[t.id] = t.wbsNo));
  // 他タスクから parentId 参照されているタスク＝グループ。タスクごとに isGroupId（内部で
  // tasks.some）を呼ぶと O(n^2) になるため、親ID集合を1回だけ作って線形で判定する。
  const groupIds = new Set();
  tasks.forEach(t => { if (t.parentId != null) groupIds.add(t.parentId); });
  const out = [];
  tasks.forEach(t => {
    const ids = t.sprintIds || [];
    if (!ids.length) return;
    if (groupIds.has(t.id)) return; // グループにはスプリントを紐付けない
    const sps = ids.map(id => sprintById[id]).filter(sp => sp && sp.startDate && sp.endDate);
    if (!sps.length) return; // 削除済み・未設定のスプリント参照のみの場合は対象外
    const rangeStart = sps.reduce((mn, sp) => (sp.startDate < mn ? sp.startDate : mn), sps[0].startDate);
    const rangeEnd = sps.reduce((mx, sp) => (sp.endDate > mx ? sp.endDate : mx), sps[0].endDate);
    const s = schedule.get(t.id);
    if (!s || !s.schedStart || !s.schedFinish) return;
    const reasons = [];
    if (s.schedStart < rangeStart) {
      reasons.push(`開始日（${fmtJP(s.schedStart)}）がスプリント開始日（${fmtJP(rangeStart)}）より前になっています`);
    }
    if (s.schedFinish > rangeEnd) {
      reasons.push(`終了日（${fmtJP(s.schedFinish)}）がスプリント終了日（${fmtJP(rangeEnd)}）を超えています`);
    }
    if (!reasons.length) return;
    if (s.governed) {
      reasons.push("固定マイルストーンの期日が優先されているため、スプリント期間内に収まりません");
    }
    const sprintName = sps.map(sp => sp.name || sp.theme || "（無題のスプリント）").join("、");
    out.push({ taskId: t.id, name: t.name, wbsNo: wbsNoById[t.id] || "", sprintName, reasons });
  });
  out.sort((a, b) => (a.wbsNo || "").localeCompare(b.wbsNo || "", undefined, { numeric: true }));
  return out;
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
