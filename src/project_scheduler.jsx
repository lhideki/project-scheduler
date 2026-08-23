import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Plus, Trash2, ChevronRight, ChevronDown, Save, Play, ZoomIn, ZoomOut,
  X, AlertTriangle, Check, Clock, GitBranch, Users, Table2,
  History, ArrowLeftRight, Info, Diamond, Download, Upload, GripVertical, LayoutGrid, RotateCcw, Zap,
  CalendarRange, Copy, Flame,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell
} from "recharts";

/* =========================================================================================
   0. データ形状（JSDoc型定義）
   実行時の検証は行わない（TypeScript化はしない）。IDEの補完・型チェックの参考用。
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

/**
 * @typedef {Object} Task
 * WBSのフラット配列内の1要素。グループ（親タスク）専用のフィールドは無く、
 * 他のタスクから parentId で参照されているかどうかだけでグループ／リーフを判定する（isGroupId 参照）。
 * @property {string} id
 * @property {string} name
 * @property {string|null} parentId - 親タスクのID。ルート直下は null
 * @property {number} order - 同じ親の兄弟内での表示順
 * @property {string} [startDate] - 開始日（YYYY-MM-DD）。手入力またはCPM/平準化による書き戻し
 * @property {number} [duration] - 工数（人日、小数可）。マイルストーンは常に0
 * @property {string|null} [assigneeId] - 担当リソースのID
 * @property {string[]} [sprintIds] - 紐付けるスプリントのID一覧（複数可、グループには設定しない）
 * @property {number} [progress] - 進捗率（0〜100）。>0 は着手済み扱いで自動スケジューリング対象外
 * @property {Dependency[]} [predecessors] - 先行タスク一覧（グループに設定すると配下リーフに伝播する）
 * @property {boolean} [milestone] - マイルストーンかどうか
 * @property {"flexible"|"fixed"} [milestoneMode] - flexible=依存関係から順算 / fixed=期日から逆算
 * @property {string} [fixedDate] - milestoneMode "fixed" の場合の固定期日
 * @property {number} [savedDuration] - マイルストーン化する前の工数の退避値（トグルで復元用）
 * @property {string} [notes] - メモ（詳細パネルでのみ編集）
 * @property {number} [diagX] - ネットワーク図でのドラッグ後のx座標（未指定なら自動レイアウト）
 * @property {number} [diagY] - ネットワーク図でのドラッグ後のy座標
 */

/**
 * @typedef {Object} Resource
 * @property {string} id
 * @property {string} name
 * @property {number} weeklyCapacity - 週次の稼働上限（人日/週）
 * @property {number} monthlyCapacity - 月次の稼働上限（人日/月）
 */

/**
 * @typedef {Object} Sprint
 * @property {string} id
 * @property {string} name
 * @property {string} [theme]
 * @property {string} startDate - YYYY-MM-DD
 * @property {string} endDate - YYYY-MM-DD
 * @property {number} order
 */

/**
 * @typedef {Object} ScheduleEntry
 * runCPM/levelResources/rollupSummaries が taskId ごとに返すスケジュール計算結果（schedule Map の値）。
 * @property {string} [ES] - 最早開始日（リーフのみ有効。グループはロールアップ後のmin開始日）
 * @property {string} [EF] - 最早終了日
 * @property {string} [LS] - 最遅開始日
 * @property {string} [LF] - 最遅終了日
 * @property {number} float - フロート（稼働日数）。グループは常に0
 * @property {boolean} critical - クリティカルパス上かどうか（float<=0）。グループは配下いずれかがcriticalならtrue
 * @property {boolean} [governed] - 固定マイルストーンの逆算（LS/LF）を表示スケジュールに使っているか
 * @property {string} schedStart - 表示用の開始日
 * @property {string} schedFinish - 表示用の終了日
 * @property {number} progress - 進捗率（グループは配下の単純平均）
 * @property {boolean} [isSummary] - グループ（サマリー行）のロールアップ結果かどうか
 */

/**
 * @typedef {Object} Version
 * バージョン管理タブで保存されるスナップショット。
 * @property {string} id
 * @property {string} name
 * @property {number} createdAt - Date.now()
 * @property {boolean} hasWbsInfo - WBS番号での比較に対応しているか（旧形式はfalse相当）
 * @property {boolean} hasFullSnapshot - rawTasks等によるフル復元に対応しているか
 * @property {Array<Object>} tasks - 表示・比較用の軽量スナップショット（WBS番号・schedStart等）
 * @property {Task[]} [rawTasks] - 復元用のフルスナップショット
 * @property {Resource[]} [rawResources]
 * @property {Sprint[]} [rawSprints]
 */

/**
 * @typedef {Object} Calendar
 * makeCalendar() が返す、稼働日カレンダー（土日・祝日を除外）に基づく日付計算関数群。
 * @property {(d: Date) => boolean} isWorkday
 * @property {(s: string) => boolean} isWorkdayStr
 * @property {(s: string) => string} snapForward - 稼働日でなければ次の稼働日まで進める
 * @property {(s: string) => string} snapBackward - 稼働日でなければ前の稼働日まで戻す
 * @property {(s: string, n: number) => string} shift - 稼働日ベースでn日シフト（負値可）
 * @property {(startStr: string, duration: number) => string} endFromStart
 * @property {(finishStr: string, duration: number) => string} startFromEnd
 * @property {(aStr: string, bStr: string) => number} workdaysBetween - 稼働日数の差（符号あり）
 * @property {Map<string,string>} holidayMap - 日付(YYYY-MM-DD) -> 祝日名
 */

/* =========================================================================================
   1. カレンダー / 日付ユーティリティ（日本の祝日を考慮した稼働日計算）
   ========================================================================================= */

function toISO(d) { return d.toISOString().slice(0, 10); }
function parseISO(s) { return new Date(s + "T00:00:00Z"); }
const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

function vernalEquinoxDay(year) {
  return Math.floor(20.8431 + 0.242194 * (year - 1980)) - Math.floor((year - 1980) / 4);
}
function autumnalEquinoxDay(year) {
  return Math.floor(23.2488 + 0.242194 * (year - 1980)) - Math.floor((year - 1980) / 4);
}
function nthMonday(year, month, n) {
  const d = new Date(Date.UTC(year, month - 1, 1));
  const dow = d.getUTCDay();
  const firstMonday = 1 + ((8 - dow) % 7);
  return new Date(Date.UTC(year, month - 1, firstMonday + (n - 1) * 7));
}
function baseHolidaysOfYear(year) {
  const list = [];
  const add = (m, d, name) => list.push({ date: toISO(new Date(Date.UTC(year, m - 1, d))), name });
  add(1, 1, "元日");
  list.push({ date: toISO(nthMonday(year, 1, 2)), name: "成人の日" });
  add(2, 11, "建国記念の日");
  add(2, 23, "天皇誕生日");
  add(3, vernalEquinoxDay(year), "春分の日");
  add(4, 29, "昭和の日");
  add(5, 3, "憲法記念日");
  add(5, 4, "みどりの日");
  add(5, 5, "こどもの日");
  list.push({ date: toISO(nthMonday(year, 7, 3)), name: "海の日" });
  add(8, 11, "山の日");
  list.push({ date: toISO(nthMonday(year, 9, 3)), name: "敬老の日" });
  add(9, autumnalEquinoxDay(year), "秋分の日");
  list.push({ date: toISO(nthMonday(year, 10, 2)), name: "スポーツの日" });
  add(11, 3, "文化の日");
  add(11, 23, "勤労感謝の日");
  return list;
}
/** startYear〜endYear（前後1年余裕込み）の祝日マップ date->name を構築。
 *  国民の休日（祝日に挟まれた平日）・振替休日（日曜の祝日の振替）を反映する。 */
function buildHolidayMap(startYear, endYear) {
  const map = new Map();
  for (let y = startYear - 1; y <= endYear + 1; y++) {
    baseHolidaysOfYear(y).forEach(h => map.set(h.date, h.name));
  }
  // 国民の休日
  let added = true, guard = 0;
  while (added && guard < 5) {
    added = false; guard++;
    for (const dateStr of Array.from(map.keys())) {
      const d = parseISO(dateStr);
      const next = new Date(d); next.setUTCDate(d.getUTCDate() + 1);
      const nextStr = toISO(next);
      const nn = new Date(d); nn.setUTCDate(d.getUTCDate() + 2);
      if (!map.has(nextStr) && map.has(toISO(nn))) {
        const dow = next.getUTCDay();
        if (dow !== 0 && dow !== 6) { map.set(nextStr, "国民の休日"); added = true; }
      }
    }
  }
  // 振替休日（各起点日につき一度だけ処理し、連鎖的な誤加算を防ぐ）
  const substituted = new Set();
  added = true; guard = 0;
  while (added && guard < 10) {
    added = false; guard++;
    for (const dateStr of Array.from(map.keys())) {
      const name = map.get(dateStr);
      if (name === "振替休日" || substituted.has(dateStr)) continue;
      const d = parseISO(dateStr);
      if (d.getUTCDay() === 0) {
        substituted.add(dateStr);
        let cursor = new Date(d);
        do { cursor.setUTCDate(cursor.getUTCDate() + 1); } while (map.has(toISO(cursor)));
        map.set(toISO(cursor), "振替休日");
        added = true;
      }
    }
  }
  return map;
}

/**
 * holidayMap を束ねた稼働日カレンダー（土日・祝日を除外）を作る。
 * @param {Map<string,string>} holidayMap - 日付(YYYY-MM-DD) -> 祝日名
 * @returns {Calendar}
 */
function makeCalendar(holidayMap) {
  function isWorkday(d) {
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) return false;
    if (holidayMap.has(toISO(d))) return false;
    return true;
  }
  function isWorkdayStr(s) { return isWorkday(parseISO(s)); }
  function snapForward(s) { const d = parseISO(s); while (!isWorkday(d)) d.setUTCDate(d.getUTCDate() + 1); return toISO(d); }
  function snapBackward(s) { const d = parseISO(s); while (!isWorkday(d)) d.setUTCDate(d.getUTCDate() - 1); return toISO(d); }
  function shift(s, n) {
    if (n === 0) return s;
    const d = parseISO(s);
    const step = n > 0 ? 1 : -1;
    let remaining = Math.abs(n);
    while (remaining > 0) { d.setUTCDate(d.getUTCDate() + step); if (isWorkday(d)) remaining--; }
    return toISO(d);
  }
  function endFromStart(startStr, duration) {
    if (duration <= 0) return snapForward(startStr);
    const totalDays = Math.max(1, Math.ceil(duration - 1e-9));
    const d = parseISO(snapForward(startStr));
    let count = 1;
    while (count < totalDays) { d.setUTCDate(d.getUTCDate() + 1); if (isWorkday(d)) count++; }
    return toISO(d);
  }
  function startFromEnd(finishStr, duration) {
    if (duration <= 0) return snapBackward(finishStr);
    const totalDays = Math.max(1, Math.ceil(duration - 1e-9));
    const d = parseISO(snapBackward(finishStr));
    let count = 1;
    while (count < totalDays) { d.setUTCDate(d.getUTCDate() - 1); if (isWorkday(d)) count++; }
    return toISO(d);
  }
  function workdaysBetween(aStr, bStr) {
    let a = parseISO(aStr), b = parseISO(bStr);
    if (a.getTime() === b.getTime()) return 0;
    const sign = b > a ? 1 : -1;
    let cnt = 0; const d = new Date(a);
    while (d.getTime() !== b.getTime()) { d.setUTCDate(d.getUTCDate() + sign); if (isWorkday(d)) cnt += sign; }
    return cnt;
  }
  return { isWorkday, isWorkdayStr, snapForward, snapBackward, shift, endFromStart, startFromEnd, workdaysBetween, holidayMap };
}

function weekKey(dateStr) {
  const d = parseISO(dateStr);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  const monday = new Date(d); monday.setUTCDate(d.getUTCDate() - dow);
  return toISO(monday);
}
function monthKey(dateStr) { return dateStr.slice(0, 7); }
function fmtJP(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${y}/${m}/${d}`;
}
// 月日のみの短い表記（バージョン比較の基準行など、表示幅が限られる箇所で使用）。
function fmtMD(dateStr) {
  if (!dateStr) return "";
  const [, m, d] = dateStr.split("-");
  return `${m}/${d}`;
}

/* =========================================================================================
   2. 依存関係の文字列パーサ（MS Project 風ショートハンド： 3FS+2, 5SS-1 など）
   ========================================================================================= */
const DEP_RE = /^\s*(\d+(?:\.\d+)*)\s*(FS|SS|FF|SF)?\s*([+-]\s*\d+)?\s*$/i;

function parseDepString(str, noToId) {
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
function dedupeDeps(deps) {
  const map = new Map();
  deps.forEach(d => map.set(d.id, d));
  return Array.from(map.values());
}
/** 依存関係の「型＋ラグ」部分だけの短いラベルを作る（例: "FS+1", "SS-2", "FF"）。
 *  WBS番号を含めた完全な表記（DepInput欄の表示用）は formatDeps を使う。 */
function formatDepLabel(dep) {
  return `${dep.type}${dep.lag ? (dep.lag > 0 ? "+" + dep.lag : dep.lag) : ""}`;
}
function formatDeps(deps, idToNo) {
  if (!deps || !deps.length) return "";
  return deps
    .filter(d => idToNo[d.id] != null)
    .map(d => `${idToNo[d.id]}${formatDepLabel(d)}`)
    .join(", ");
}

/* =========================================================================================
   3. WBS ツリー・ヘルパー
   ========================================================================================= */
let uidCounter = 1;
function uid(prefix) { return `${prefix}_${(uidCounter++).toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }

/**
 * 旧形式（単一スプリントの `sprintId`）で保存されたタスク配列を、現行の `sprintIds`（配列）形式に変換する。
 * `sprintIds` が既に存在するタスクはそのまま通す。localStorageからの読み込み・バージョン復元・JSONインポートの
 * 3箇所すべてで通す必要がある（後方互換のため。新形式のみを正とする設計に統一はしない）。
 * @param {Task[]} tasks
 * @returns {Task[]}
 */
function migrateSprintIds(tasks) {
  return (tasks || []).map(t => {
    if (Array.isArray(t.sprintIds)) return t;
    if (t.sprintId) { const { sprintId, ...rest } = t; return { ...rest, sprintIds: [sprintId] }; }
    return t;
  });
}

/** id が「グループ（配下に子タスクを持つ親タスク）」かどうかを判定する。
 *  グループ専用のエンティティは存在せず、他のタスクから parentId で参照されているかだけで判定する。
 * @param {Task[]} tasks
 * @param {string} id
 * @returns {boolean} */
function isGroupId(tasks, id) { return tasks.some(t => t.parentId === id); }

/**
 * WBS階層（parentId）をアウトライン順に展開し、階層情報を付与したフラット配列にする。
 * 折りたたまれたグループの配下は結果に含めない。
 * @param {Task[]} tasks
 * @param {Set<string>} collapsed - 折りたたみ中のグループIDの集合
 * @returns {Array<Task & {level: number, wbsNo: string, hasChildren: boolean, taskNo: number}>}
 */
function buildFlatList(tasks, collapsed) {
  const byParent = new Map();
  tasks.forEach(t => {
    const key = t.parentId || "__root__";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(t);
  });
  for (const arr of byParent.values()) arr.sort((a, b) => a.order - b.order);

  const flat = [];
  function walk(parentKey, level, wbsPrefix) {
    const children = byParent.get(parentKey) || [];
    children.forEach((t, idx) => {
      const wbsNo = wbsPrefix ? `${wbsPrefix}.${idx + 1}` : `${idx + 1}`;
      const hasChildren = (byParent.get(t.id) || []).length > 0;
      flat.push({ ...t, level, wbsNo, hasChildren });
      if (hasChildren && !collapsed.has(t.id)) walk(t.id, level + 1, wbsNo);
    });
  }
  walk("__root__", 0, "");
  flat.forEach((t, i) => (t.taskNo = i + 1));
  return flat;
}

function allDescendantIds(tasks, rootId) {
  const out = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    tasks.forEach(t => { if (t.parentId === id) { out.push(t.id); stack.push(t.id); } });
  }
  return out;
}

/* =========================================================================================
   4. スケジューリング・エンジン（CPM: 4種の依存関係 + リード/ラグ、固定マイルストーンからの逆算、
      クリティカルパス判定）と、リソース平準化のヒューリスティック（優先度付き Serial SGS）
   ------------------------------------------------------------------------------------------
   依存関係のみを満たす最早/最遅日程は「先行制約下での完了時刻最小化」という線形計画問題の
   双対（最長経路問題）を topological order で 1 パス解くことで厳密に求まる（CPM ⇔ LP 双対）。
   一方、資源上限を同時に満たす最適化（RCPSP）はNP困難で、ブラウザ内で真の整数計画法ソルバーを
   持たずに厳密解を出すのは非現実的なため、フロートが小さいタスクを優先する Serial Schedule
   Generation Scheme（優先度付き貪欲法）で近似する。
   ========================================================================================= */

/**
 * 先行タスクの確定日程から、依存関係（type/lag）を満たす後続タスクの最早開始日候補を1つ求める
 * （フォワードパス用）。
 * @param {Calendar} cal
 * @param {Dependency} dep
 * @param {{start: string, finish: string}} predDates - 先行タスクの開始日・終了日
 * @param {number} succDuration - 後続タスクの工数（人日）
 * @returns {{start: string}}
 */
function candidateFromDep(cal, dep, predDates, succDuration) {
  const { type, lag } = dep;
  if (type === "FS") return { start: cal.shift(predDates.finish, 1 + lag) };
  if (type === "SS") return { start: cal.shift(predDates.start, lag) };
  if (type === "FF") {
    const f = cal.shift(predDates.finish, lag);
    return { start: succDuration <= 0 ? f : cal.startFromEnd(f, succDuration) };
  }
  // SF
  const f = cal.shift(predDates.start, lag);
  return { start: succDuration <= 0 ? f : cal.startFromEnd(f, succDuration) };
}

/**
 * 後続タスクの最遅日程から、依存関係（type/lag）を満たす先行タスクの最遅終了日候補を1つ求める
 * （バックワードパス用）。
 * @param {Calendar} cal
 * @param {Dependency} dep
 * @param {{start: string, finish: string}} succLateDates - 後続タスクのLS/LF
 * @param {number} predDuration - 先行タスクの工数（人日）
 * @returns {{finish: string}}
 */
function candidateForPredFromSucc(cal, dep, succLateDates, predDuration) {
  const { type, lag } = dep;
  if (type === "FS") return { finish: cal.shift(succLateDates.start, -(1 + lag)) };
  if (type === "SS") {
    const s = cal.shift(succLateDates.start, -lag);
    return { finish: predDuration <= 0 ? s : cal.endFromStart(s, predDuration) };
  }
  if (type === "FF") return { finish: cal.shift(succLateDates.finish, -lag) };
  // SF
  const s = cal.shift(succLateDates.finish, -lag);
  return { finish: predDuration <= 0 ? s : cal.endFromStart(s, predDuration) };
}

/** 工数（人日、小数可）を開始日からの各稼働日へ配分する。
 *  満日を1.0人日、端数が残る最終日のみ端数分を割り当てる（例: 2.5人日 → 1.0 / 1.0 / 0.5）。
 *  これにより、日付は常に整数日単位（カレンダー粒度）のまま、稼働負荷だけ小数で扱える。 */
function dailyLoads(cal, startStr, duration) {
  if (duration <= 0) return [];
  const totalDays = Math.max(1, Math.ceil(duration - 1e-9));
  const fullDays = Math.floor(duration + 1e-9);
  const remainder = duration - fullDays;
  const loadFor = (dayIndex) => (dayIndex === totalDays && remainder > 1e-9) ? remainder : 1;
  const d = parseISO(cal.snapForward(startStr));
  const loads = [{ date: toISO(d), load: loadFor(1) }];
  let count = 1;
  while (count < totalDays) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (cal.isWorkday(d)) { count++; loads.push({ date: toISO(d), load: loadFor(count) }); }
  }
  return loads;
}

function topoOrder(ids, edgesByTo) {
  const indeg = {}; ids.forEach(id => (indeg[id] = 0));
  const out = {}; ids.forEach(id => (out[id] = []));
  ids.forEach(id => (edgesByTo[id] || []).forEach(d => {
    if (indeg[d.id] === undefined) return;
    out[d.id].push(id); indeg[id]++;
  }));
  const q = ids.filter(id => indeg[id] === 0);
  const order = [];
  const seen = new Set();
  while (q.length) {
    const n = q.shift();
    if (seen.has(n)) continue;
    seen.add(n); order.push(n);
    (out[n] || []).forEach(m => { indeg[m]--; if (indeg[m] === 0) q.push(m); });
  }
  // サイクル等で漏れたタスクは末尾に追加（安全側フォールバック）
  ids.forEach(id => { if (!seen.has(id)) order.push(id); });
  return order;
}

/** タスクの祖先グループ（親・祖父母…）を配列で返す。 */
function ancestorChain(byId, id) {
  const out = [];
  let cur = byId[id];
  while (cur && cur.parentId) { cur = byId[cur.parentId]; if (cur) out.push(cur); }
  return out;
}
/** リーフタスクの「実効的な先行タスク」一覧を返す：自分自身の先行タスクに加え、
 *  祖先グループ（親・祖父母…）に設定された先行タスクも合成する。
 *  グループのレベルで設定した依存関係は、その配下の全リーフタスクへ自動的に伝播する。
 *  自分自身や自分の祖先を参照している場合は循環になるため除外する。
 * @param {Record<string, Task>} byId - タスクID -> Task
 * @param {Task} leaf
 * @returns {Dependency[]}
 */
function effectivePredecessors(byId, leaf) {
  const chain = [leaf, ...ancestorChain(byId, leaf.id)];
  const chainIds = new Set(chain.map(x => x.id));
  const merged = chain.flatMap(x => x.predecessors || []);
  return merged.filter(dep => !chainIds.has(dep.id));
}

/**
 * タスクに紐付く複数スプリントのうち、最も早い開始日（稼働日補正済み）を「希望開始日の下限」として返す。
 * 紐付くスプリントが無い／いずれも開始日未設定の場合は null。runCPM・levelResources で共通利用する。
 * @param {string[]|undefined} sprintIds
 * @param {Record<string, Sprint>} sprintById
 * @param {Calendar} cal
 * @returns {string|null}
 */
function earliestSprintFloor(sprintIds, sprintById, cal) {
  let floor = null;
  (sprintIds || []).forEach(id => {
    const sp = sprintById[id];
    if (!sp || !sp.startDate) return;
    const f = cal.snapForward(sp.startDate);
    if (floor === null || f < floor) floor = f;
  });
  return floor;
}

/**
 * tasks: フラット配列（親子とも含む）。leafのみが依存関係・工数を持つ。
 * グループ（親タスク）を先行タスクとして参照した場合は、そのグループのロールアップ区間
 * （配下タスクの最早/最遅）を使って解決する。ロールアップは配下タスクの日程が決まらないと
 * 求まらないため、(1)グループ参照を無視した素のCPM → (2)そのロールアップを使って再計算、
 * という2パスで解く（グループ同士が相互参照するような循環ケースは非対応）。
 * 戻り値: Map taskId -> { ES,EF,LS,LF,float,critical,governed,schedStart,schedFinish }
 *
 * opts.respectManualPins（既定 true）: true の場合、開始日が入力済みのタスクは、先行タスクの
 * 有無に関わらずその日付をそのままES算出の起点として使い、依存関係による自動的な後ろ倒しを行わない
 * （＝ユーザーが「自動スケジューリング実行」を押すまで、手入力した開始日をCPMが上書きしない）。
 * 「自動スケジューリング実行」自体が行う純粋な依存関係ベースの再計算では false を渡す。
 * ただし進捗率が入力済み（progress > 0）のタスクは、respectManualPins の値に関わらず常に
 * 現在の開始日をES算出の起点として固定する（＝着手済みタスクは自動スケジューリングの対象外）。
 *
 * schedStart/schedFinish（表示スケジュール）は、固定マイルストーン自身（fixedDateに固定表示
 * する必要があるタスク）だけバックワードパス（LS/LF）を使う。それ以外のタスク（固定マイルストーン
 * に辿り着く依存チェーン上の governed タスクを含む）は、モード・respectManualPins・進捗率に
 * 関わらず常にフォワードパス（ES/EF）を使う。
 * これにより、マイルストーンを柔軟⇔固定に切り替えただけでは（＝「自動スケジューリング実行」を
 * 押すまでは）、固定マイルストーン自身の日付が表示されるだけで、それ以外のタスクの表示日程は
 * 一切変化しない（依存チェーン上のタスクがバックワードパスへ「引っ張られて」後ろ倒しに見える、
 * という挙動を避けるため）。「自動スケジューリング実行」（respectManualPins=false）を押した
 * 場合も同様にES/EFを使うため、governed タスクは「マイルストーンに合わせて後ろ倒しにする」の
 * ではなく「条件を満たす直近の日程に詰める」形で書き戻される。
 *
 * @param {Task[]} tasks
 * @param {Calendar} cal
 * @param {string} projectStart - プロジェクト全体の開始日（YYYY-MM-DD）
 * @param {Sprint[]} sprints
 * @param {{respectManualPins?: boolean}} [opts]
 * @returns {{result: Map<string, ScheduleEntry>, projectEnd: string}}
 */
function runCPM(tasks, cal, projectStart, sprints, opts = {}) {
  const respectManualPins = opts.respectManualPins !== false;
  const leaves = tasks.filter(t => !isGroupId(tasks, t.id));
  const leafIds = leaves.map(t => t.id);
  const byId = {}; tasks.forEach(t => (byId[t.id] = t));
  const sprintById = {}; (sprints || []).forEach(s => (sprintById[s.id] = s));

  const effPredsOf = {};
  leaves.forEach(t => { effPredsOf[t.id] = effectivePredecessors(byId, t); });

  /** leafDates（leafId -> {start,finish}）から各グループのロールアップ区間を計算する。 */
  function computeGroupRollup(leafDates) {
    const rolled = new Map();
    function rec(id) {
      const children = tasks.filter(t => t.parentId === id);
      let min = null, max = null;
      children.forEach(c => {
        const r = isGroupId(tasks, c.id) ? rec(c.id) : leafDates.get(c.id);
        if (!r || !r.start) return;
        if (min === null || r.start < min) min = r.start;
        if (max === null || r.finish > max) max = r.finish;
      });
      const r = { start: min, finish: max };
      rolled.set(id, r);
      return r;
    }
    tasks.filter(t => isGroupId(tasks, t.id)).forEach(t => { if (!rolled.has(t.id)) rec(t.id); });
    return rolled;
  }

  /** フォワードパスを1回実行する。groupRollup が与えられれば、グループを参照する
   *  先行タスクもその区間を使って解決する（未指定ならグループ参照は無視する＝1パス目用）。 */
  function forwardPass(groupRollup) {
    const predsOf = {}; leafIds.forEach(id => (predsOf[id] = []));
    const succsOf = {}; leafIds.forEach(id => (succsOf[id] = []));
    leaves.forEach(t => {
      effPredsOf[t.id].forEach(dep => {
        if (predsOf[dep.id]) {
          predsOf[t.id].push({ from: dep.id, type: dep.type, lag: dep.lag });
          succsOf[dep.id].push({ to: t.id, type: dep.type, lag: dep.lag });
        } else if (groupRollup && isGroupId(tasks, dep.id) && groupRollup.get(dep.id)?.start) {
          predsOf[t.id].push({ from: dep.id, type: dep.type, lag: dep.lag, groupDates: groupRollup.get(dep.id) });
        }
        // 未解決のグループ参照・存在しない参照は無視
      });
    });

    const edgesByTo = {}; leafIds.forEach(id => (edgesByTo[id] = predsOf[id].filter(d => !d.groupDates).map(d => ({ id: d.from }))));
    const order = topoOrder(leafIds, edgesByTo);

    const ES = {}, EF = {};
    order.forEach(id => {
      const t = byId[id];
      const preds = predsOf[id];
      let best = null;
      preds.forEach(dep => {
        const predDates = dep.groupDates || { start: ES[dep.from], finish: EF[dep.from] };
        if (!predDates.start) return;
        const cand = candidateFromDep(cal, dep, predDates, t.duration);
        if (best === null || cand.start > best) best = cand.start;
      });
      let start;
      const hasProgress = (t.progress || 0) > 0;
      if ((respectManualPins || hasProgress) && t.startDate) {
        // 開始日が手入力されているタスク、または進捗率が入力済み（着手済み）のタスクは、
        // 先行タスクの有無に関わらずその日付を固定の起点とする（依存関係による自動的な
        // 後ろ倒しをしない）。進捗率入力済みタスクは「自動スケジューリング実行」でも上書きしない。
        start = cal.snapForward(t.startDate);
      } else {
        start = best !== null ? best : cal.snapForward(t.startDate || projectStart);
      }
      // スプリントは依存関係・固定マイルストーンより優先度が低い「希望開始日の下限」として扱う。
      // 依存関係から求めた開始日（best）がスプリント開始日より前の場合のみ、スプリント開始日まで後ろ倒しする
      // （後ろ倒しのみ・前倒しはしない）。バックワードパス（LS/LF、固定マイルストーンの逆算）には一切関与しない。
      // 複数スプリントが紐付いている場合は、そのうち最も早い開始日を下限として使う
      // （タスクは最も早く割り当てられたスプリントの開始と同時に着手できる、という扱い）。
      const sprintFloor = earliestSprintFloor(t.sprintIds, sprintById, cal);
      if (sprintFloor && sprintFloor > start) start = sprintFloor;
      ES[id] = start;
      EF[id] = t.duration <= 0 ? start : cal.endFromStart(start, t.duration);
    });
    return { ES, EF, order, predsOf, succsOf };
  }

  // グループの依存関係が連鎖する場合（グループAがグループBに依存し、グループBがグループCに依存する、等）、
  // 1回の再計算だけでは連鎖の下流に更新が伝わりきらない。安定するまで（または連鎖の深さを十分に超える
  // 回数まで）反復して求める。各反復で日程は後ろにしか動かないため、有限回で必ず収束する
  // （グループ同士が相互に参照し合う循環はこの反復では解決できない＝非対応）。
  let passResult = forwardPass(null);
  let groupRollup = computeGroupRollup(new Map(leafIds.map(id => [id, { start: passResult.ES[id], finish: passResult.EF[id] }])));
  const MAX_GROUP_DEP_ITERATIONS = 12;
  for (let iter = 0; iter < MAX_GROUP_DEP_ITERATIONS; iter++) {
    const next = forwardPass(groupRollup);
    const stable = leafIds.every(id => passResult.ES[id] === next.ES[id] && passResult.EF[id] === next.EF[id]);
    passResult = next;
    if (stable) break;
    groupRollup = computeGroupRollup(new Map(leafIds.map(id => [id, { start: next.ES[id], finish: next.EF[id] }])));
  }
  const { ES, EF, order, predsOf, succsOf } = passResult;

  const projectEnd = leafIds.reduce((mx, id) => (EF[id] > mx ? EF[id] : mx), projectStart);

  const LS = {}, LF = {};
  [...order].reverse().forEach(id => {
    const t = byId[id];
    const succs = succsOf[id];
    let finish;
    if (succs.length === 0) {
      finish = t.milestone && t.milestoneMode === "fixed" && t.fixedDate ? t.fixedDate : projectEnd;
    } else {
      let best = null;
      succs.forEach(dep => {
        if (!LS[dep.to]) return;
        const cand = candidateForPredFromSucc(cal, dep, { start: LS[dep.to], finish: LF[dep.to] }, t.duration);
        if (best === null || cand.finish < best) best = cand.finish;
      });
      if (t.milestone && t.milestoneMode === "fixed" && t.fixedDate && t.fixedDate < (best || t.fixedDate)) best = t.fixedDate;
      finish = best !== null ? best : projectEnd;
    }
    LF[id] = finish;
    LS[id] = t.duration <= 0 ? finish : cal.startFromEnd(finish, t.duration);
  });

  // 固定マイルストーン自身（fixedDateに固定表示する必要があるタスク）だけがバックワードパス
  // （LS/LF）を使う。それ以外のタスクは常にフォワードパス（ES/EF）を使う（詳細は関数先頭のコメント）。
  const fixedMilestoneIds = new Set(leaves.filter(t => t.milestone && t.milestoneMode === "fixed").map(t => t.id));
  const result = new Map();
  leafIds.forEach(id => {
    const float = cal.workdaysBetween(ES[id], LS[id]);
    const t = byId[id];
    const useBackward = fixedMilestoneIds.has(id);
    result.set(id, {
      ES: ES[id], EF: EF[id], LS: LS[id], LF: LF[id],
      float, critical: float <= 0,
      governed: useBackward,
      schedStart: useBackward ? LS[id] : ES[id],
      schedFinish: useBackward ? LF[id] : EF[id],
      progress: typeof t.progress === "number" ? t.progress : 0,
    });
  });

  rollupSummaries(tasks, result);

  return { result, projectEnd };
}

/** 各グループタスクのロールアップを result（taskId -> スケジュール結果）に書き込む。
 *  子の schedStart/schedFinish の範囲・critical有無・進捗率（子タスクの単純平均）を、
 *  リーフからグループへ再帰的に積み上げる。result にはリーフタスクの結果が事前に入っている必要があり、
 *  グループの結果はこの関数が result に追加・上書きする（副作用あり）。
 *  runCPM の通常計算・リソース平準化後の再ロールアップの両方から呼ばれる共通ロジック。
 * @param {Task[]} tasks
 * @param {Map<string, ScheduleEntry>} result - リーフの結果が入った状態で渡す。グループの結果を追加・上書きする
 * @returns {Map<string, ScheduleEntry>} 引数の result と同一の参照
 */
function rollupSummaries(tasks, result) {
  const summaries = tasks.filter(t => isGroupId(tasks, t.id));
  function rollup(id) {
    const children = tasks.filter(t => t.parentId === id);
    let min = null, max = null, anyCritical = false, progressSum = 0, progressCount = 0;
    children.forEach(c => {
      const r = isGroupId(tasks, c.id) ? rollup(c.id) : result.get(c.id);
      if (!r) return;
      if (min === null || r.schedStart < min) min = r.schedStart;
      if (max === null || r.schedFinish > max) max = r.schedFinish;
      if (r.critical) anyCritical = true;
      if (typeof r.progress === "number") { progressSum += r.progress; progressCount++; }
    });
    const progress = progressCount ? Math.round(progressSum / progressCount) : 0;
    const r = { ES: min, EF: max, LS: min, LF: max, float: 0, critical: anyCritical, governed: false, schedStart: min, schedFinish: max, isSummary: true, progress };
    result.set(id, r);
    return r;
  }
  // 深い階層でも正しく処理できるようルートのサマリーから再帰
  tasks.filter(t => !t.parentId).forEach(t => { if (isGroupId(tasks, t.id)) rollup(t.id); });
  summaries.forEach(t => { if (!result.has(t.id)) rollup(t.id); });
  return result;
}

/** リソース稼働上限を考慮した平準化（優先度付き Serial SGS）。
 *  常に「依存関係を満たす最短開始日」を基準にした前進スケジューリングで計算する
 *  （固定マイルストーンからの逆算とは同時併用しない簡易化）。
 *  進捗率が入力済み（着手済み）のタスクは平準化の対象外とし、現在の開始日に固定する。
 * @param {Task[]} tasks
 * @param {Map<string, ScheduleEntry>} cpmResult - runCPM の計算結果（フロートの優先度付けに使う）
 * @param {Resource[]} resources
 * @param {Calendar} cal
 * @param {Sprint[]} sprints
 * @returns {{placed: Record<string, {start: string, finish: string}>, warnings: string[]}}
 */
function levelResources(tasks, cpmResult, resources, cal, sprints) {
  const leaves = tasks.filter(t => !isGroupId(tasks, t.id));
  const byId = {}; tasks.forEach(t => (byId[t.id] = t));
  const leafIdSet = new Set(leaves.map(t => t.id));
  const sprintById = {}; (sprints || []).forEach(s => (sprintById[s.id] = s));

  // リーフを直接参照する先行タスクと、グループを参照する先行タスクを分けて持つ。
  // グループ参照は「そのグループ配下の全リーフが確定してから」初めて解決できるため、
  // isReady 側で待ち合わせたうえで、確定済みの配下リーフからロールアップして候補日を求める。
  const leafPredsOf = {}, groupPredsOf = {};
  leaves.forEach(t => {
    const eff = effectivePredecessors(byId, t);
    leafPredsOf[t.id] = eff.filter(d => leafIdSet.has(d.id)).map(d => ({ from: d.id, type: d.type, lag: d.lag }));
    groupPredsOf[t.id] = eff.filter(d => isGroupId(tasks, d.id)).map(d => ({ from: d.id, type: d.type, lag: d.lag }));
  });

  const groupLeavesCache = {};
  function descendantLeavesOf(groupId) {
    if (groupLeavesCache[groupId]) return groupLeavesCache[groupId];
    const out = [];
    const stack = [groupId];
    while (stack.length) {
      const id = stack.pop();
      tasks.forEach(t => {
        if (t.parentId !== id) return;
        if (leafIdSet.has(t.id)) out.push(t.id); else stack.push(t.id);
      });
    }
    groupLeavesCache[groupId] = out;
    return out;
  }

  // WBS表示順（アウトライン上での並び順）。同じフロートのタスクが競合した場合、
  // WBSの早い順（＝表示順が先のタスク）を優先して確定させるためのタイブレークに使う。
  const wbsOrder = {};
  buildFlatList(tasks, new Set()).forEach(t => { wbsOrder[t.id] = t.taskNo; });

  const resById = {}; resources.forEach(r => (resById[r.id] = r));
  const weekUsage = {}, monthUsage = {}, dayUsage = {};

  function spanCheck(assigneeId, startStr, duration) {
    const cap = resById[assigneeId];
    if (!cap) return true;
    const dayAdd = {}, weekAdd = {}, monthAdd = {};
    dailyLoads(cal, startStr, duration).forEach(({ date, load }) => {
      dayAdd[date] = (dayAdd[date] || 0) + load;
      const wk = weekKey(date), mo = monthKey(date);
      weekAdd[wk] = (weekAdd[wk] || 0) + load;
      monthAdd[mo] = (monthAdd[mo] || 0) + load;
    });
    // 1日あたりの上限は常に1.0人日（同じ担当者が同じ日に複数タスクを掛け持ちすることを防ぐ）。
    // これにより、他のタスクと同じ日に重ならないよう自動的にずらされる。
    for (const d in dayAdd) {
      const used = ((dayUsage[assigneeId] || {})[d] || 0) + dayAdd[d];
      if (used > 1 + 1e-9) return false;
    }
    for (const wk in weekAdd) {
      const used = ((weekUsage[assigneeId] || {})[wk] || 0) + weekAdd[wk];
      if (cap.weeklyCapacity && used > cap.weeklyCapacity + 1e-9) return false;
    }
    for (const mo in monthAdd) {
      const used = ((monthUsage[assigneeId] || {})[mo] || 0) + monthAdd[mo];
      if (cap.monthlyCapacity && used > cap.monthlyCapacity + 1e-9) return false;
    }
    return true;
  }
  function commit(assigneeId, startStr, duration) {
    weekUsage[assigneeId] = weekUsage[assigneeId] || {};
    monthUsage[assigneeId] = monthUsage[assigneeId] || {};
    dayUsage[assigneeId] = dayUsage[assigneeId] || {};
    dailyLoads(cal, startStr, duration).forEach(({ date, load }) => {
      dayUsage[assigneeId][date] = (dayUsage[assigneeId][date] || 0) + load;
      const wk = weekKey(date), mo = monthKey(date);
      weekUsage[assigneeId][wk] = (weekUsage[assigneeId][wk] || 0) + load;
      monthUsage[assigneeId][mo] = (monthUsage[assigneeId][mo] || 0) + load;
    });
  }

  const placed = {};
  const remaining = new Set(leaves.map(t => t.id));
  const warnings = [];

  function isReady(id) {
    if (!leafPredsOf[id].every(d => placed[d.from])) return false;
    return groupPredsOf[id].every(dep => descendantLeavesOf(dep.from).every(leafId => placed[leafId]));
  }
  function groupRollupFromPlaced(groupId) {
    let min = null, max = null;
    descendantLeavesOf(groupId).forEach(id => {
      const p = placed[id];
      if (!p) return;
      if (min === null || p.start < min) min = p.start;
      if (max === null || p.finish > max) max = p.finish;
    });
    return { start: min, finish: max };
  }

  let guardOuter = 0;
  while (remaining.size && guardOuter < leaves.length + 5) {
    guardOuter++;
    let ready = [...remaining].filter(isReady);
    if (ready.length === 0) ready = [...remaining]; // 循環時のフォールバック
    ready.sort((a, b) => {
      const fa = cpmResult.get(a)?.float ?? 0, fb = cpmResult.get(b)?.float ?? 0;
      if (fa !== fb) return fa - fb; // フロートが小さい（＝クリティカルに近い）タスクを優先
      const wa = wbsOrder[a] ?? 999999, wb = wbsOrder[b] ?? 999999;
      return wa - wb; // 同じフロートならWBSの早い順で確定させる
    });
    const id = ready[0];
    const task = byId[id];
    // 進捗率が入力済み（着手済み）のタスクは、平準化の対象外として現在の開始日に固定する
    // （依存関係・スプリント・リソース競合による調整を一切行わない。リソース使用量だけは
    // 他タスクの平準化に影響するよう commit しておく）。
    const hasProgress = (task.progress || 0) > 0;
    if (hasProgress && task.startDate) {
      const start = cal.snapForward(task.startDate);
      const finish = task.duration <= 0 ? start : cal.endFromStart(start, task.duration);
      if (task.assigneeId && task.duration > 0 && resById[task.assigneeId]) commit(task.assigneeId, start, task.duration);
      placed[id] = { start, finish };
      remaining.delete(id);
      continue;
    }
    // 先行タスクがある場合は依存関係の候補日のみを基準にする（CPMのforward passと同じ扱い）。
    // タスク自身の「開始日」欄は、先行タスクが存在しない／未解決の場合のみフロアとして使う。
    let minStart = null;
    leafPredsOf[id].forEach(dep => {
      const p = placed[dep.from];
      if (!p) return;
      const cand = candidateFromDep(cal, dep, p, task.duration);
      if (minStart === null || cand.start > minStart) minStart = cand.start;
    });
    groupPredsOf[id].forEach(dep => {
      const g = groupRollupFromPlaced(dep.from);
      if (!g.start) return;
      const cand = candidateFromDep(cal, dep, g, task.duration);
      if (minStart === null || cand.start > minStart) minStart = cand.start;
    });
    if (minStart === null) {
      minStart = task.startDate ? cal.snapForward(task.startDate) : (cpmResult.get(id)?.ES || cal.snapForward(toISO(new Date())));
    }
    // CPMと同様、スプリント開始日は依存関係より優先度の低い下限として扱う（後ろ倒しのみ）。
    // 複数スプリントが紐付いている場合は、そのうち最も早い開始日を下限として使う。
    const sprintFloor = earliestSprintFloor(task.sprintIds, sprintById, cal);
    if (sprintFloor && sprintFloor > minStart) minStart = sprintFloor;

    let start = cal.snapForward(minStart);
    if (task.assigneeId && task.duration > 0 && resById[task.assigneeId]) {
      let guard = 0;
      while (guard < 2000) {
        guard++;
        if (spanCheck(task.assigneeId, start, task.duration)) {
          commit(task.assigneeId, start, task.duration);
          placed[id] = { start, finish: cal.endFromStart(start, task.duration) };
          break;
        }
        start = cal.shift(start, 1);
      }
      if (!placed[id]) { const finish = cal.endFromStart(start, task.duration); placed[id] = { start, finish }; }
    } else {
      const finish = task.duration <= 0 ? start : cal.endFromStart(start, task.duration);
      placed[id] = { start, finish };
    }
    remaining.delete(id);
  }

  // 固定マイルストーンの期日超過チェック
  leaves.forEach(t => {
    if (t.milestone && t.milestoneMode === "fixed" && t.fixedDate && placed[t.id]) {
      if (placed[t.id].finish > t.fixedDate) {
        warnings.push(`「${t.name}」の平準化後の日程（${fmtJP(placed[t.id].finish)}）が固定期日（${fmtJP(t.fixedDate)}）を超過しています`);
      }
    }
  });

  return { placed, warnings };
}

/* =========================================================================================
   5. window.storage ラッパー
   ========================================================================================= */
// このツールは利用者のローカルブラウザ上でスタンドアロンのHTMLとして動かす想定のため、
// window.storage を localStorage を使った同期的な実装で用意する（同名の永続化APIを
// 提供するホスト環境に埋め込まれた場合はそちらを優先し、上書きしない）。
if (typeof window !== "undefined" && !window.storage) {
  window.storage = {
    async get(key) {
      try {
        const v = window.localStorage.getItem(key);
        return v !== null ? { value: v } : null;
      } catch (e) {
        return null;
      }
    },
    async set(key, value) {
      try {
        window.localStorage.setItem(key, value);
        return true;
      } catch (e) {
        return false;
      }
    },
  };
}
async function storageGet(key) {
  try { const r = await window.storage.get(key, false); return r ? JSON.parse(r.value) : null; }
  catch (e) { return null; }
}
async function storageSet(key, value) {
  try { await window.storage.set(key, JSON.stringify(value), false); return true; }
  catch (e) { return false; }
}

/** JSON を生成しブラウザのダウンロードとしてトリガーする（プロジェクトのエクスポート用） */
function downloadJSON(filename, dataObj) {
  const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * テキストをクリップボードにコピーする。file:// で開いた場合など navigator.clipboard が
 * 使えない（非セキュアコンテキスト）ケースに備え、隠しtextarea + execCommand へフォールバックする。
 */
async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(ta);
  if (!ok) throw new Error("execCommand('copy') に失敗しました");
}

/** Mermaid のタスク名として問題になる記号（コロン・カンマ・改行）を除去する */
function escapeMermaidText(str) {
  return String(str ?? "").replace(/[:,\n]/g, " ").replace(/\s+/g, " ").trim() || "（無題）";
}

/** Mermaid の task id として使える文字列に変換する（先頭は英字に揃える） */
function toMermaidId(str) {
  const s = String(str ?? "").replace(/[^a-zA-Z0-9_]/g, "_");
  return /^[a-zA-Z]/.test(s) ? s : `t${s}`;
}

/**
 * 現在の WBS ツリーとスケジュール計算結果（CPM・固定マイルストーン・スプリント floor・
 * リソース平準化をすべて織り込んだ確定スケジュール）から Mermaid の gantt 記法テキストを生成する。
 * Mermaid 自身の依存解決（after）は使わず、schedStart/schedFinish をそのまま開始日・終了日として
 * 書き出すことで、このツールの計算結果を厳密に反映する。グループはセクション（section）として出力する。
 */
function generateMermaidGantt(tasks, schedule) {
  const flatAll = buildFlatList(tasks, new Set());
  const lines = ["gantt", "    title プロジェクトスケジュール", "    dateFormat YYYY-MM-DD", "    excludes weekends"];
  const usedIds = new Set();
  flatAll.forEach(t => {
    if (t.hasChildren) {
      lines.push(`    section ${escapeMermaidText(t.name)}`);
      return;
    }
    const s = schedule.get(t.id);
    if (!s || !s.schedStart || !s.schedFinish) return;
    let id = toMermaidId(`t${t.wbsNo || t.id}`);
    if (usedIds.has(id)) {
      let i = 2;
      while (usedIds.has(`${id}_${i}`)) i++;
      id = `${id}_${i}`;
    }
    usedIds.add(id);
    const tags = [];
    if (t.milestone) tags.push("milestone");
    if (s.critical) tags.push("crit");
    if ((t.progress || 0) >= 100) tags.push("done");
    else if ((t.progress || 0) > 0) tags.push("active");
    const tagStr = tags.length ? `${tags.join(", ")}, ` : "";
    const name = escapeMermaidText(t.name);
    const endField = t.milestone ? "0d" : s.schedFinish;
    lines.push(`    ${name} :${tagStr}${id}, ${s.schedStart}, ${endField}`);
  });
  return lines.join("\n");
}

/* =========================================================================================
   6. サンプルデータ
   ========================================================================================= */
function seedData() {
  const today = new Date();
  const base = toISO(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
  const r1 = uid("res"), r2 = uid("res"), r3 = uid("res");
  const g1 = uid("t"), t1 = uid("t"), t2 = uid("t"), t3 = uid("t"),
    g2 = uid("t"), t4 = uid("t"), t5 = uid("t"), m1 = uid("t"),
    g3 = uid("t"), t6 = uid("t"), t7 = uid("t"), m2 = uid("t");
  const sp1 = uid("sprint"), sp2 = uid("sprint"), sp3 = uid("sprint");

  const tasks = [
    { id: g1, name: "要件定義", parentId: null, order: 0 },
    { id: t1, name: "業務要件ヒアリング", parentId: g1, order: 0, startDate: base, duration: 5, assigneeId: r1, sprintIds: [sp1], predecessors: [] },
    { id: t2, name: "要件定義書作成", parentId: g1, order: 1, startDate: base, duration: 3, assigneeId: r2, sprintIds: [sp1], predecessors: [{ id: t1, type: "FS", lag: 0 }] },
    { id: t3, name: "要件レビュー", parentId: g1, order: 2, startDate: base, duration: 2, assigneeId: r3, sprintIds: [sp2], predecessors: [{ id: t2, type: "FS", lag: 1 }] },

    { id: g2, name: "設計", parentId: null, order: 1 },
    { id: t4, name: "基本設計", parentId: g2, order: 0, startDate: base, duration: 6, assigneeId: r2, sprintIds: [sp2], predecessors: [{ id: t3, type: "FS", lag: 0 }] },
    { id: t5, name: "詳細設計", parentId: g2, order: 1, startDate: base, duration: 5, assigneeId: r3, sprintIds: [sp2, sp3], predecessors: [{ id: t4, type: "SS", lag: 2 }] },
    { id: m1, name: "設計完了", parentId: g2, order: 2, startDate: base, duration: 0, milestone: true, milestoneMode: "flexible", sprintIds: [sp3], predecessors: [{ id: t4, type: "FS", lag: 0 }, { id: t5, type: "FS", lag: 0 }] },

    { id: g3, name: "開発・テスト", parentId: null, order: 2 },
    { id: t6, name: "実装", parentId: g3, order: 0, startDate: base, duration: 10, assigneeId: r1, sprintIds: [sp3], predecessors: [{ id: m1, type: "FS", lag: 0 }] },
    { id: t7, name: "結合テスト", parentId: g3, order: 1, startDate: base, duration: 4, assigneeId: r3, sprintIds: [sp3], predecessors: [{ id: t6, type: "FS", lag: -2 }] },
    { id: m2, name: "リリース", parentId: g3, order: 2, startDate: base, duration: 0, milestone: true, milestoneMode: "fixed", fixedDate: cal_addDaysISO(base, 55), predecessors: [{ id: t7, type: "FS", lag: 0 }] },
  ];
  const resources = [
    { id: r1, name: "佐藤", weeklyCapacity: 5, monthlyCapacity: 20 },
    { id: r2, name: "鈴木", weeklyCapacity: 5, monthlyCapacity: 20 },
    { id: r3, name: "高橋", weeklyCapacity: 4, monthlyCapacity: 16 },
  ];
  // 各スプリントの期間は、固定マイルストーン「リリース」（起点+55日）から逆算されるタスクの
  // 実際の計算済みスケジュール（governed＝依存関係・固定マイルストーン優先で後ろ倒しされた日程）を
  // 包含するように設定している（自動スケジューリングの矛盾検出で警告が出ないようにするため）。
  const sprints = [
    { id: sp1, name: "Sprint 1", theme: "要件定義とレビュー", startDate: cal_addDaysISO(base, 6), endDate: cal_addDaysISO(base, 18), order: 0 },
    { id: sp2, name: "Sprint 2", theme: "基本設計・詳細設計", startDate: cal_addDaysISO(base, 20), endDate: cal_addDaysISO(base, 32), order: 1 },
    { id: sp3, name: "Sprint 3", theme: "設計完了・実装開始", startDate: cal_addDaysISO(base, 33), endDate: cal_addDaysISO(base, 54), order: 2 },
  ];
  return { tasks, resources, sprints };
}
function cal_addDaysISO(iso, n) { const d = parseISO(iso); d.setUTCDate(d.getUTCDate() + n); return toISO(d); }

/* =========================================================================================
   7. 共通 UI パーツ
   ========================================================================================= */
function IconBtn({ icon: Icon, label, onClick, active, danger, disabled, small }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={
        "inline-flex items-center gap-1.5 rounded-md border transition-colors " +
        (small ? "px-2 py-1 text-xs " : "px-3 py-1.5 text-sm ") +
        (disabled ? "opacity-40 cursor-not-allowed border-slate-200 text-slate-400 " :
          active ? "bg-indigo-600 border-indigo-600 text-white " :
          danger ? "border-red-200 text-red-600 hover:bg-red-50 " :
          "border-slate-200 text-slate-700 hover:bg-slate-100 bg-white")
      }
    >
      {Icon && <Icon size={small ? 13 : 15} />}
      {label && <span>{label}</span>}
    </button>
  );
}

function Tab({ icon: Icon, label, active, onClick, count }) {
  return (
    <button
      onClick={onClick}
      className={
        "flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors " +
        (active ? "border-indigo-600 text-indigo-700 font-medium" : "border-transparent text-slate-500 hover:text-slate-800")
      }
    >
      <Icon size={15} />
      {label}
      {count != null && <span className="text-[10px] rounded-full bg-slate-200 text-slate-600 px-1.5 py-0.5 font-mono">{count}</span>}
    </button>
  );
}

/* =========================================================================================
   8. WBS + ガントチャート ビュー
   ========================================================================================= */
const ROW_H = 30;
// バージョン比較モード時、各タスクの下に重ねて表示する「基準バージョン行」の高さ。
// 比較モードON時は1タスクあたり ROW_H（現在行）+ ROW_H_BASE（基準行）を占有する。
const ROW_H_BASE = 22;
// ガントヘッダーの合計高さ（スプリント帯16px + 月ラベル20px + 日付・曜日28px）。
// 左（WBS表）・右（ガントチャート）のヘッダーで共通して使い、高さを一致させる。
const GANTT_HEADER_H = 64;
const DEP_TYPES = ["FS", "SS", "FF", "SF"];
// WBS表の列幅（ヘッダー行・データ行・末尾の新規タスク行の3箇所で共通して使う単一の定義元）。
// ユーザーがヘッダーの境界をドラッグして調整できるよう、実際の表示幅は App 側の state（colWidths）
// として保持し、この定数は初期値・リセット時の既定値としてのみ使う。
const DEFAULT_WBS_COLS = { grip: 20, wbs: 56, name: 190, start: 108, duration: 48, finish: 82, assignee: 64, sprint: 96, progress: 56, deps: 98, actions: 28 };
// 各列がここまでは縮められる、という下限（アイコンや最小限のラベルが表示できる幅）。
const MIN_WBS_COL_WIDTHS = { grip: 16, wbs: 32, name: 70, start: 56, duration: 40, finish: 56, assignee: 40, sprint: 50, progress: 40, deps: 50, actions: 24 };

// スプリントの配色パレット。グループ（WBS階層）の配色とは意図的に別系統にし、
// 「グループ」と「スプリント」が別軸の分類であることが一目で分かるようにしている。
const SPRINT_PALETTE = [
  { text: "#0369A1", tagBg: "#F0F9FF", tagBorder: "#BAE6FD", band: "#E0F2FE" },
  { text: "#6D28D9", tagBg: "#F5F3FF", tagBorder: "#DDD6FE", band: "#EDE9FE" },
  { text: "#BE185D", tagBg: "#FDF2F8", tagBorder: "#FBCFE8", band: "#FCE7F3" },
  { text: "#047857", tagBg: "#ECFDF5", tagBorder: "#A7F3D0", band: "#D1FAE5" },
  { text: "#B45309", tagBg: "#FFFBEB", tagBorder: "#FDE68A", band: "#FEF3C7" },
  { text: "#334155", tagBg: "#F8FAFC", tagBorder: "#CBD5E1", band: "#E2E8F0" },
];
/** スプリントIDから配色を一意に決める（一覧内の並び順が変わっても同じスプリントは同じ色になるよう、
 *  配列インデックスではなくIDのハッシュ値を使う）。 */
function sprintColorForId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return SPRINT_PALETTE[Math.abs(h) % SPRINT_PALETTE.length];
}
/** 開始日・終了日が重なっているスプリントのIDを集める（保存はできるが警告表示に使う）。 */
function computeOverlappingSprintIds(sprints) {
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
/** ポインタドラッグの共通処理（Pointer Capture + windowフォールバック）。
 *  ガントチャートのバー右端ハンドル、WBS行の並べ替え、ネットワーク図のノード移動・接続ハンドルなど、
 *  「ドラッグ中はポインタを追従し、離した位置で確定する」操作すべてで同じ骨組みを使い回す。
 *  ポインタキャプチャにより、ドラッグ中にポインタが要素やウィンドウの外（埋め込み iframe の外側など）に
 *  出てもイベントを取りこぼさない。取れなくても window 側のフォールバックで必ず後始末する。
 *
 *  onMove(ev): ドラッグ中、ポインタが動くたびに呼ばれる。
 *  onEnd(ev):  ポインタを離して正常終了した時に呼ばれる（確定処理はここで行う）。
 *  onCancel(): ポインタキャンセルやウィンドウのフォーカス喪失で中断された時に呼ばれる（確定処理は行わない）。 */
function startPointerDrag(e, { onMove, onEnd, onCancel }) {
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
function svgPointFromRef(svgRef, e) {
  const svg = svgRef.current;
  if (!svg) return { x: 0, y: 0 };
  const rect = svg.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

/** 日付文字列(YYYY-MM-DD)をタイムライン上のx座標に変換する関数を作る。
 *  ガント・スプリント・バージョン比較の各タイムラインで同じ「1日 = dayWidthピクセル」の
 *  換算式を共有するための小さなファクトリ。 */
function makeDateScale(minDateStr, dayWidth) {
  const minTime = parseISO(minDateStr).getTime();
  return function xOf(dateStr) { return Math.round((parseISO(dateStr).getTime() - minTime) / 86400000) * dayWidth; };
}

/** WBS表ヘッダーの列境界に置く、列幅調整用のドラッグハンドル。
 *  WBSGanttView のレンダーごとに再生成されない、安定したモジュールスコープのコンポーネントとして定義する
 *  （もしコンポーネント本体の中で定義すると、ドラッグ中の setState のたびに型参照が変わり、
 *  DOM ノードが再マウントされて addEventListener ベースのドラッグ状態が失われてしまうため）。 */
function ColResizeHandle({ onResizeStart, onReset }) {
  return (
    <div
      onPointerDown={onResizeStart}
      onDoubleClick={onReset}
      title="ドラッグで列幅を変更（ダブルクリックで既定幅に戻す）"
      className="absolute top-0 right-0 h-full w-1.5 -mr-0.5 cursor-col-resize hover:bg-indigo-400/60 active:bg-indigo-500/70 z-20"
      style={{ touchAction: "none" }}
    />
  );
}

function WBSGanttView({
  tasks, setTasks, resources, sprints, cal, schedule, projectEnd, selectedId, setSelectedId,
  collapsed, setCollapsed, dayWidth, setDayWidth, requestConfirm,
  colWidths, setColWidths,
  versions, baselineVersionId, setBaselineVersionId,
  autoScheduleHighlightIds,
  onSaveVersion,
}) {
  const flat = useMemo(() => buildFlatList(tasks, collapsed), [tasks, collapsed]);
  // WBS表の列幅合計（左ペインの実表示幅）。列幅を変更するとここも連動して再計算される。
  const wbsTotalWidth = useMemo(() => Object.values(colWidths).reduce((a, b) => a + b, 0), [colWidths]);
  // 稲妻線（進捗線）の表示切り替え。予定日程（schedStart/schedFinish）自体は進捗率によって変えず、
  // 各行の「予定期間のうち進捗率ぶんの位置」を結んだ線として表示のみに反映する。
  const [showInazuma, setShowInazuma] = useState(true);
  // クリティカルパスの強調表示（WBS表の赤文字・ガントバー・依存線の赤色）の表示切り替え。
  const [showCritical, setShowCritical] = useState(true);

  // --- バージョン比較（基準バージョンをWBS番号で突き合わせ、1行目=現在／2行目=基準として表示） ---
  const baselineVersion = useMemo(() => versions.find(v => v.id === baselineVersionId) || null, [versions, baselineVersionId]);
  // 旧形式（WBS番号を保存する前）のバージョンは比較対象にできない。
  const baselineUnsupported = !!baselineVersion && !baselineVersion.hasWbsInfo;
  const compareOn = !!baselineVersion && !baselineUnsupported;
  const baselineByWbsNo = useMemo(() => {
    if (!compareOn) return null;
    const m = new Map();
    baselineVersion.tasks.forEach(t => { if (t.wbsNo) m.set(t.wbsNo, t); });
    return m;
  }, [compareOn, baselineVersion]);
  // 比較モード時は「現在行(ROW_H) + 基準行(ROW_H_BASE)」の対で1タスク分の高さになる。
  // 比較モードOFF時は従来どおり1タスク=ROW_Hのまま（既存の挙動を変えない）。
  const rowStride = compareOn ? ROW_H + ROW_H_BASE : ROW_H;
  // ヘッダーセルの右端をドラッグして列幅を調整する。ダブルクリックで既定幅に戻す。
  function startColResize(e, key) {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const baseWidth = colWidths[key];
    const min = MIN_WBS_COL_WIDTHS[key] || 24;
    startPointerDrag(e, {
      onMove: (ev) => {
        const next = Math.round(baseWidth + (ev.clientX - startX));
        setColWidths(prev => ({ ...prev, [key]: Math.max(min, next) }));
      },
    });
  }
  function resetColWidth(key) {
    setColWidths(prev => ({ ...prev, [key]: DEFAULT_WBS_COLS[key] }));
  }
  // 左（WBS表）・右（ガントチャート）ペインの境界。null の間は列幅の合計（wbsTotalWidth）に
  // 自動追従し、ドラッグすると以後は指定した幅に固定される（ダブルクリックで自動追従に戻す）。
  const [paneLeftWidth, setPaneLeftWidth] = useState(null);
  const effectiveLeftWidth = paneLeftWidth != null ? paneLeftWidth : wbsTotalWidth;
  const PANE_MIN_WIDTH = 160;
  const PANE_MAX_WIDTH = 1600;
  function startPaneResize(e) {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const baseWidth = effectiveLeftWidth;
    startPointerDrag(e, {
      onMove: (ev) => {
        const next = Math.round(baseWidth + (ev.clientX - startX));
        setPaneLeftWidth(Math.max(PANE_MIN_WIDTH, Math.min(PANE_MAX_WIDTH, next)));
      },
    });
  }
  function resetPaneWidth() { setPaneLeftWidth(null); }
  const idToNo = useMemo(() => Object.fromEntries(flat.map(t => [t.id, t.wbsNo])), [flat]);
  const noToId = useMemo(() => Object.fromEntries(flat.map(t => [t.wbsNo, t.id])), [flat]);
  // 行ごとの担当者名表示（バー・基準行）で resources.find() を毎回線形探索しないよう、事前にMap化しておく。
  const resourceNameById = useMemo(() => new Map(resources.map(r => [r.id, r.name])), [resources]);
  // 末尾の「新規タスク追加」行（常にROW_H）の分だけ余分に確保し、左右ペインの高さを揃える。
  // 比較モード時は各タスクが rowStride（現在行+基準行）の高さを占有する。
  const bodyHeight = flat.length * rowStride + ROW_H;
  const [detailId, setDetailId] = useState(null);
  const [linkDrag, setLinkDrag] = useState(null); // ガントチャート上でのドラッグによる依存関係作成

  const leftRef = useRef(null);
  const rightRef = useRef(null);
  const syncing = useRef(false);
  const rowInputRefs = useRef(new Map());
  const barsSvgRef = useRef(null);
  const pendingFocusIdRef = useRef(null);
  // 列ごとの入力欄をタスクIDで参照するためのref群（↑↓キーで同じ列の前後行へ移動するために使う）。
  const dateInputRefs = useRef(new Map());
  const durationInputRefs = useRef(new Map());
  const assigneeInputRefs = useRef(new Map());
  const sprintInputRefs = useRef(new Map());
  const progressInputRefs = useRef(new Map());
  const depsInputRefs = useRef(new Map());
  function cellRefCallback(refsMap, id) {
    return el => { if (el) refsMap.current.set(id, el); else refsMap.current.delete(id); };
  }
  // ↑↓キーで同じ列の前後行（その列に入力欄がある行のみ）へフォーカスを移す。
  function moveCellFocus(refsMap, fromId, dir) {
    const idx = flat.findIndex(t => t.id === fromId);
    if (idx === -1) return;
    let i = idx;
    while (true) {
      i += dir === "up" ? -1 : 1;
      if (i < 0 || i >= flat.length) return;
      const target = flat[i];
      const el = refsMap.current.get(target.id);
      if (el) {
        setSelectedId(target.id);
        el.focus();
        el.scrollIntoView && el.scrollIntoView({ block: "nearest" });
        return;
      }
    }
  }
  function cellArrowKeyDown(refsMap, taskId) {
    return e => {
      if (e.key === "ArrowUp") { e.preventDefault(); moveCellFocus(refsMap, taskId, "up"); }
      else if (e.key === "ArrowDown") { e.preventDefault(); moveCellFocus(refsMap, taskId, "down"); }
    };
  }
  // Enterキーで新規タスクを作成した直後、その行の名前欄にフォーカスを移す
  // （addTask後の再レンダリングでrowInputRefsにDOMが登録されるのを待つ必要があるため、tasks変更後にeffectで処理する）。
  useEffect(() => {
    const id = pendingFocusIdRef.current;
    if (!id) return;
    const el = rowInputRefs.current.get(id);
    if (el) {
      el.focus();
      try { el.setSelectionRange(el.value.length, el.value.length); } catch (err) { /* no-op */ }
      el.scrollIntoView && el.scrollIntoView({ block: "nearest" });
      pendingFocusIdRef.current = null;
    }
  }, [tasks]);
  const onScrollLeft = () => { if (syncing.current) return; syncing.current = true; rightRef.current.scrollTop = leftRef.current.scrollTop; syncing.current = false; };
  const onScrollRight = () => { if (syncing.current) return; syncing.current = true; leftRef.current.scrollTop = rightRef.current.scrollTop; syncing.current = false; };

  // ガントチャートのバー右端のハンドルをドラッグして依存関係(FS)を作成する。
  // ネットワーク図のノードドラッグと同じくポインタキャプチャ＋windowフォールバックで、
  // ポインタがウィンドウ外に出てもドラッグ状態が残留しないようにする。
  function startLinkDrag(e, fromId, startX, startY) {
    e.stopPropagation();
    e.preventDefault();
    const p0 = svgPointFromRef(barsSvgRef, e);
    setLinkDrag({ fromId, x1: startX, y1: startY, x2: p0.x, y2: p0.y });
    startPointerDrag(e, {
      onMove: (ev) => {
        const p = svgPointFromRef(barsSvgRef, ev);
        setLinkDrag(prev => (prev ? { ...prev, x2: p.x, y2: p.y } : prev));
      },
      onEnd: (ev) => {
        const p = svgPointFromRef(barsSvgRef, ev);
        const rowIndex = Math.floor(p.y / rowStride);
        const targetTask = flat[rowIndex];
        if (targetTask && !targetTask.hasChildren && targetTask.id !== fromId) {
          setTasks(prev => prev.map(t => {
            if (t.id !== targetTask.id) return t;
            const already = (t.predecessors || []).some(d => d.id === fromId);
            if (already) return t; // 既存の依存関係と重複させない
            return { ...t, predecessors: [...(t.predecessors || []), { id: fromId, type: "FS", lag: 0 }] };
          }));
        }
        setLinkDrag(null);
      },
      onCancel: () => setLinkDrag(null),
    });
  }

  // ↑↓キーによるタスク間移動（前後の行へフォーカス移動）。
  function selectAndFocusRow(id) {
    setSelectedId(id);
    const el = rowInputRefs.current.get(id);
    if (el) {
      el.focus();
      try { el.setSelectionRange(el.value.length, el.value.length); } catch (err) { /* no-op */ }
      el.scrollIntoView && el.scrollIntoView({ block: "nearest" });
    }
  }
  function moveSelection(fromId, dir) {
    const idx = flat.findIndex(t => t.id === fromId);
    if (idx === -1) return;
    if (dir === "up") {
      if (idx > 0) selectAndFocusRow(flat[idx - 1].id);
    } else if (dir === "down") {
      if (idx < flat.length - 1) selectAndFocusRow(flat[idx + 1].id);
      else newTaskInputRef.current && newTaskInputRef.current.focus(); // 最終行の次は新規タスク追加欄へ
    }
  }

  function updateTask(id, patch) { setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t))); }

  // ドラッグ&ドロップによる行の入れ替え。order/parentId のみを変更し、predecessors（依存関係）は
  // タスクIDで参照されているため一切変更しない＝どの位置に移動しても依存関係は自動的に維持される。
  const [rowDrag, setRowDrag] = useState(null); // { dragId, insertIndex }

  // insertIndex（flat配列上で「この位置に挿入」を表すインデックス、0〜flat.length）から、
  // 実際に採用すべき親タスクIDと、その兄弟内での挿入位置を求める。
  function resolveDropTarget(dragId, insertIndex) {
    const dragIdx = flat.findIndex(t => t.id === dragId);
    if (dragIdx === -1) return null;
    const descendantIds = new Set(allDescendantIds(tasks, dragId));
    const dragBlockIds = new Set([dragId, ...descendantIds]);
    let blockLen = 1;
    while (dragIdx + blockLen < flat.length && dragBlockIds.has(flat[dragIdx + blockLen].id)) blockLen++;

    const withoutBlock = [...flat.slice(0, dragIdx), ...flat.slice(dragIdx + blockLen)];
    let adjIndex = insertIndex > dragIdx ? insertIndex - blockLen : insertIndex;
    adjIndex = Math.max(0, Math.min(withoutBlock.length, adjIndex));

    const before = withoutBlock[adjIndex - 1];
    const after = withoutBlock[adjIndex];
    let targetParentId;
    if (!before) targetParentId = after ? after.parentId : null;
    else if (!after) targetParentId = before.parentId;
    else if (before.parentId === after.parentId) targetParentId = before.parentId;
    else if (before.level < after.level) targetParentId = before.id; // 直前行の最初の子として入る
    else targetParentId = after.parentId; // ネストから抜けて浅い階層へ戻る

    if (dragBlockIds.has(targetParentId)) return null; // 自分自身の配下には移動できない（安全側の保険）

    let siblingInsertPos = 0;
    for (let i = 0; i < adjIndex; i++) {
      if (withoutBlock[i].parentId === targetParentId) siblingInsertPos++;
    }
    const level = targetParentId ? (flat.find(f => f.id === targetParentId)?.level ?? -1) + 1 : 0;
    return { targetParentId, siblingInsertPos, level };
  }

  function reorderTask(dragId, insertIndex) {
    const resolved = resolveDropTarget(dragId, insertIndex);
    if (!resolved) return;
    const { targetParentId, siblingInsertPos } = resolved;
    const siblings = tasks.filter(t => t.parentId === (targetParentId || null) && t.id !== dragId).sort((a, b) => a.order - b.order);
    const newSiblingIds = siblings.map(s => s.id);
    newSiblingIds.splice(siblingInsertPos, 0, dragId);
    setTasks(prev => prev.map(t => {
      const idx = newSiblingIds.indexOf(t.id);
      if (idx === -1) return t;
      return t.id === dragId ? { ...t, parentId: targetParentId, order: idx } : { ...t, order: idx };
    }));
  }

  function startRowDrag(e, dragId) {
    e.stopPropagation();
    e.preventDefault();

    function computeInsertIndex(clientY) {
      const paneEl = leftRef.current;
      if (!paneEl) return null;
      const rect = paneEl.getBoundingClientRect();
      const relY = clientY - rect.top + paneEl.scrollTop - 60; // 60 = ヘッダー行の高さ（スプリント帯 + 月/日）
      const idx = Math.round(relY / rowStride);
      return Math.max(0, Math.min(flat.length, idx));
    }

    setRowDrag({ dragId, insertIndex: computeInsertIndex(e.clientY) });
    startPointerDrag(e, {
      onMove: (ev) => {
        const idx = computeInsertIndex(ev.clientY);
        setRowDrag(prev => (prev ? { ...prev, insertIndex: idx } : prev));
      },
      onEnd: (ev) => {
        const idx = computeInsertIndex(ev.clientY);
        if (idx != null) reorderTask(dragId, idx);
        setRowDrag(null);
      },
      onCancel: () => setRowDrag(null),
    });
  }

  function toggleMilestone(id) {
    setTasks(prev => prev.map(t => {
      if (t.id !== id) return t;
      if (t.milestone) {
        // マイルストーン → 通常タスクへ（切り替え前の工数を保存していれば復元、なければ1人日）
        const restoredDuration = t.savedDuration > 0 ? t.savedDuration : 1;
        return { ...t, milestone: false, duration: restoredDuration, savedDuration: undefined };
      }
      // 通常タスク → マイルストーンへ（工数を退避し、以前の固定期日があれば復元）
      const today = toISO(new Date());
      return {
        ...t, milestone: true, duration: 0, savedDuration: t.duration,
        milestoneMode: t.milestoneMode || "flexible",
        fixedDate: t.fixedDate || t.startDate || today,
      };
    }));
  }

  function addTask(asMilestone) {
    const sel = flat.find(t => t.id === selectedId);
    const parentId = sel ? sel.parentId : null;
    const siblings = tasks.filter(t => t.parentId === parentId).sort((a, b) => a.order - b.order);
    const id = uid("t");
    const today = toISO(new Date());
    const newTask = {
      id, name: asMilestone ? "新規マイルストーン" : "新規タスク", parentId, order: 0,
      startDate: today, duration: asMilestone ? 0 : 1, assigneeId: null, progress: 0,
      milestone: !!asMilestone, milestoneMode: asMilestone ? "flexible" : undefined,
      fixedDate: asMilestone ? today : undefined, predecessors: [],
    };
    // 選択中のタスクがあれば、その直後（同じ階層の兄弟内）に挿入する。選択が無ければ末尾に追加。
    const selIndex = sel ? siblings.findIndex(s => s.id === sel.id) : -1;
    const insertAt = selIndex === -1 ? siblings.length : selIndex + 1;
    const newOrderIds = siblings.map(s => s.id);
    newOrderIds.splice(insertAt, 0, id);
    setTasks(prev => {
      const withNew = [...prev, newTask];
      return withNew.map(t => {
        const idx = newOrderIds.indexOf(t.id);
        return idx === -1 ? t : { ...t, order: idx };
      });
    });
    setSelectedId(id);
    return id;
  }
  // 常時表示の新規タスク行。ルート直下の末尾に追加し、入力欄はクリアして次の入力へ続けられる。
  const [newTaskName, setNewTaskName] = useState("");
  const newTaskInputRef = useRef(null);
  function addQuickTask() {
    const name = newTaskName.trim();
    if (!name) return;
    const rootSiblings = tasks.filter(t => !t.parentId);
    const order = rootSiblings.length ? Math.max(...rootSiblings.map(s => s.order)) + 1 : 0;
    const id = uid("t");
    const today = toISO(new Date());
    const newTask = {
      id, name, parentId: null, order,
      startDate: today, duration: 1, assigneeId: null, progress: 0,
      milestone: false, predecessors: [],
    };
    setTasks(prev => [...prev, newTask]);
    setNewTaskName("");
    newTaskInputRef.current && newTaskInputRef.current.focus();
  }
  function deleteTask(explicitId) {
    const id = explicitId || selectedId;
    if (!id) return;
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    requestConfirm(`「${t.name}」を削除します。子タスクがある場合はまとめて削除されます。よろしいですか？`, () => {
      const toRemove = new Set([id, ...allDescendantIds(tasks, id)]);
      setTasks(prev =>
        prev
          .filter(x => !toRemove.has(x.id))
          .map(x => ({ ...x, predecessors: (x.predecessors || []).filter(d => !toRemove.has(d.id)) }))
      );
      if (selectedId === id || toRemove.has(selectedId)) setSelectedId(null);
    }, "削除する");
  }
  // id を明示指定できるようにする（Tabキー操作は選択状態の更新を待たずに対象行へ直接適用するため）
  function indentTask(explicitId) {
    const id = explicitId || selectedId;
    if (!id) return;
    const idx = flat.findIndex(t => t.id === id);
    if (idx <= 0) return;
    const cur = flat[idx];
    const prevSibling = [...flat.slice(0, idx)].reverse().find(t => t.level === cur.level);
    if (!prevSibling) return;
    const newSiblings = tasks.filter(t => t.parentId === prevSibling.id);
    const order = newSiblings.length ? Math.max(...newSiblings.map(s => s.order)) + 1 : 0;
    updateTask(id, { parentId: prevSibling.id, order });
    setCollapsed(prev => { const n = new Set(prev); n.delete(prevSibling.id); return n; });
  }
  function outdentTask(explicitId) {
    const id = explicitId || selectedId;
    if (!id) return;
    const cur = flat.find(t => t.id === id);
    if (!cur || !cur.parentId) return;
    const parent = tasks.find(t => t.id === cur.parentId);
    const grandParentId = parent ? parent.parentId : null;
    const newSiblings = tasks.filter(t => t.parentId === grandParentId);
    const order = newSiblings.length ? Math.max(...newSiblings.map(s => s.order)) + 1 : 0;
    updateTask(id, { parentId: grandParentId, order });
  }

  const minDate = useMemo(() => {
    let m = null;
    schedule.forEach(v => { if (v.schedStart && (!m || v.schedStart < m)) m = v.schedStart; });
    return m ? cal_addDaysISO(m, -3) : toISO(new Date());
  }, [schedule]);
  const maxDate = useMemo(() => {
    let m = projectEnd || toISO(new Date());
    return cal_addDaysISO(m, 7);
  }, [projectEnd]);
  const totalDays = Math.max(1, Math.round((parseISO(maxDate) - parseISO(minDate)) / 86400000));
  const chartWidth = totalDays * dayWidth;

  const xOf = makeDateScale(minDate, dayWidth);

  const dayCells = useMemo(() => {
    const cells = [];
    let d = parseISO(minDate);
    const end = parseISO(maxDate);
    while (d <= end) {
      const iso = toISO(d);
      const dow = d.getUTCDay();
      cells.push({ iso, x: xOf(iso), weekend: dow === 0 || dow === 6, holiday: cal.holidayMap.get(iso), month: iso.slice(0, 7), day: d.getUTCDate(), dowLabel: WEEKDAY_JA[dow] });
      d = new Date(d.getTime() + 86400000);
    }
    return cells;
  }, [minDate, maxDate, dayWidth]);

  const monthBands = useMemo(() => {
    const bands = [];
    let cur = null;
    dayCells.forEach(c => {
      if (!cur || cur.month !== c.month) { cur = { month: c.month, x: c.x, w: dayWidth }; bands.push(cur); }
      else cur.w += dayWidth;
    });
    return bands;
  }, [dayCells, dayWidth]);

  // ガント上部に表示するスプリント帯（表示範囲外にはみ出す分はクリップする）。
  const sprintBands = useMemo(() => {
    return sprints
      .map(sp => {
        if (!sp.startDate || !sp.endDate) return null;
        const x1 = xOf(sp.startDate), x2 = xOf(sp.endDate) + dayWidth;
        const left = Math.max(0, x1), right = Math.min(chartWidth, x2);
        if (right <= left) return null;
        return { sprint: sp, x: left, w: right - left };
      })
      .filter(Boolean);
  }, [sprints, minDate, dayWidth, chartWidth]);

  const todayISO = toISO(new Date());

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-white flex-wrap">
        <IconBtn icon={Plus} label="タスク" onClick={() => addTask(false)} small />
        <IconBtn icon={Diamond} label="マイルストーン" onClick={() => addTask(true)} small />
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <IconBtn icon={ChevronRight} label="インデント" onClick={() => indentTask()} small disabled={!selectedId} />
        <IconBtn icon={ChevronDown} label="アウトデント" onClick={() => outdentTask()} small disabled={!selectedId} />
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <IconBtn icon={Trash2} label="削除" onClick={() => deleteTask()} small danger disabled={!selectedId} />
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <IconBtn icon={Info} label="詳細" onClick={() => selectedId && setDetailId(selectedId)} small disabled={!selectedId} />
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <ArrowLeftRight size={13} className="text-slate-400 flex-shrink-0" />
          <select
            value={baselineVersionId || ""}
            onChange={e => setBaselineVersionId(e.target.value || null)}
            title="指定したバージョンをWBS番号で突き合わせ、各タスクの下に基準バージョンの行を重ねて表示します"
            className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white text-slate-600 max-w-[150px]"
          >
            <option value="">比較しない</option>
            {versions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          {baselineUnsupported && (
            <span className="text-[10px] text-amber-600 flex items-center gap-0.5" title="このバージョンはWBS番号を保存していないため比較できません（再保存すると比較できるようになります）">
              <AlertTriangle size={11} />非対応
            </span>
          )}
        </div>
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <IconBtn icon={Zap} label="稲妻線" onClick={() => setShowInazuma(v => !v)} small active={showInazuma} />
        <IconBtn icon={Flame} label="クリティカルパス" onClick={() => setShowCritical(v => !v)} small active={showCritical} />
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <IconBtn icon={Save} label="バージョンを保存" onClick={() => onSaveVersion(`バージョン ${versions.length + 1}`)} small />
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <IconBtn icon={ZoomOut} onClick={() => setDayWidth(w => Math.max(6, w - 4))} small />
        <IconBtn icon={ZoomIn} onClick={() => setDayWidth(w => Math.min(40, w + 4))} small />
      </div>

      <div className="flex flex-1 min-h-0">
        {/* 左：WBS テーブル */}
        <div
          ref={leftRef}
          onScroll={onScrollLeft}
          className="overflow-y-auto overflow-x-auto bg-white relative"
          style={{ width: effectiveLeftWidth, flexShrink: 0 }}
        >
          {/* ペイン幅が列幅の合計より狭い場合でも列を縮めず、この内側ラッパーの幅（＝列幅の合計）を
              保ったまま、外側（leftRef）の横スクロールで見せる。 */}
          <div style={{ width: wbsTotalWidth, minWidth: "100%" }}>
          <div className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 flex text-[11px] font-medium text-slate-500" style={{ height: GANTT_HEADER_H }}>
            <div style={{ width: colWidths.grip }} className="relative flex items-end justify-center"><ColResizeHandle onResizeStart={e => startColResize(e, "grip")} onReset={e => { e.stopPropagation(); resetColWidth("grip"); }} /></div>
            <div style={{ width: colWidths.wbs }} className="relative px-2 py-2 flex items-end font-mono">WBS<ColResizeHandle onResizeStart={e => startColResize(e, "wbs")} onReset={e => { e.stopPropagation(); resetColWidth("wbs"); }} /></div>
            <div style={{ width: colWidths.name }} className="relative px-2 py-2 flex items-end">タスク名<ColResizeHandle onResizeStart={e => startColResize(e, "name")} onReset={e => { e.stopPropagation(); resetColWidth("name"); }} /></div>
            <div style={{ width: colWidths.start }} className="relative px-1 py-2 flex items-end">開始日<ColResizeHandle onResizeStart={e => startColResize(e, "start")} onReset={e => { e.stopPropagation(); resetColWidth("start"); }} /></div>
            <div style={{ width: colWidths.duration }} className="relative px-1 py-2 flex items-end" title="工数（人日）。小数可（例: 0.5, 2.5）">工数<ColResizeHandle onResizeStart={e => startColResize(e, "duration")} onReset={e => { e.stopPropagation(); resetColWidth("duration"); }} /></div>
            <div style={{ width: colWidths.finish }} className="relative px-1 py-2 flex items-end">終了日<ColResizeHandle onResizeStart={e => startColResize(e, "finish")} onReset={e => { e.stopPropagation(); resetColWidth("finish"); }} /></div>
            <div style={{ width: colWidths.assignee }} className="relative px-1 py-2 flex items-end" title="通常タスクは担当者、マイルストーンは固定/柔軟を選択">担当<ColResizeHandle onResizeStart={e => startColResize(e, "assignee")} onReset={e => { e.stopPropagation(); resetColWidth("assignee"); }} /></div>
            <div style={{ width: colWidths.sprint }} className="relative px-1 py-2 flex items-end" title="紐付けるスプリント（グループには設定できません）">スプリント<ColResizeHandle onResizeStart={e => startColResize(e, "sprint")} onReset={e => { e.stopPropagation(); resetColWidth("sprint"); }} /></div>
            <div style={{ width: colWidths.progress }} className="relative px-1 py-2 flex items-end" title="進捗率（%）。グループはその配下タスクの進捗率の平均を自動表示します">進捗<ColResizeHandle onResizeStart={e => startColResize(e, "progress")} onReset={e => { e.stopPropagation(); resetColWidth("progress"); }} /></div>
            <div style={{ width: colWidths.deps }} className="relative px-1 py-2 flex items-end" title="WBS番号で指定します（例: 1.2FS+1）。グループの行に設定すると配下の全タスクに適用されます">先行<ColResizeHandle onResizeStart={e => startColResize(e, "deps")} onReset={e => { e.stopPropagation(); resetColWidth("deps"); }} /></div>
            <div style={{ width: colWidths.actions }} className="relative px-1 py-2 flex items-end justify-center" title="削除"><ColResizeHandle onResizeStart={e => startColResize(e, "actions")} onReset={e => { e.stopPropagation(); resetColWidth("actions"); }} /></div>
          </div>
          {rowDrag && (() => {
            const resolved = resolveDropTarget(rowDrag.dragId, rowDrag.insertIndex);
            const level = resolved ? resolved.level : 0;
            return (
              <div
                style={{ position: "absolute", left: 20 + level * 12, right: 8, top: GANTT_HEADER_H + rowDrag.insertIndex * rowStride - 1, height: 2 }}
                className="bg-indigo-500 rounded pointer-events-none z-20"
              />
            );
          })()}
          {flat.map(t => {
            const sched = schedule.get(t.id);
            const isSelected = selectedId === t.id;
            const isSummary = sched?.isSummary;
            const isDragging = rowDrag && rowDrag.dragId === t.id;
            // バージョン比較：WBS番号で基準バージョンの該当タスクを引く（無ければ「新規」扱い）。
            const baselineRow = compareOn ? baselineByWbsNo.get(t.wbsNo) : null;
            const diffDays = (compareOn && baselineRow && sched?.schedFinish && baselineRow.schedFinish)
              ? Math.round((parseISO(sched.schedFinish) - parseISO(baselineRow.schedFinish)) / 86400000)
              : null;
            return (
              <React.Fragment key={t.id}>
              <div
                onClick={() => setSelectedId(t.id)}
                style={{ height: ROW_H, opacity: isDragging ? 0.35 : 1 }}
                className={
                  "flex items-center text-xs border-b border-slate-100 cursor-pointer " +
                  (isSelected ? "bg-indigo-50 " : "hover:bg-slate-50 ") +
                  (showCritical && sched?.critical && !isSummary ? "text-red-600 " : "text-slate-700")
                }
              >
                <div style={{ width: colWidths.grip }} className="flex items-center justify-center">
                  <span
                    onPointerDown={e => startRowDrag(e, t.id)}
                    title="ドラッグで並べ替え"
                    className="text-slate-300 hover:text-slate-500"
                    style={{ cursor: "grab", touchAction: "none" }}
                  >
                    <GripVertical size={13} />
                  </span>
                </div>
                <div style={{ width: colWidths.wbs }} className="px-2 font-mono text-slate-400 truncate">{t.wbsNo}</div>
                <div style={{ width: colWidths.name }} className="px-1 flex items-center gap-1" >
                  <span style={{ marginLeft: t.level * 12 }} className="flex items-center gap-1 truncate flex-1 min-w-0">
                    {t.hasChildren ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); setCollapsed(prev => { const n = new Set(prev); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n; }); }}
                        className="text-slate-400 hover:text-slate-700"
                      >
                        {collapsed.has(t.id) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                      </button>
                    ) : <span style={{ width: 12 }} />}
                    {!t.hasChildren && (
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleMilestone(t.id); }}
                        title={t.milestone ? "クリックでタスクに変更" : "クリックでマイルストーンに変更"}
                        className="flex-shrink-0"
                      >
                        <Diamond size={10} className={t.milestone ? "text-amber-500" : "text-slate-300 hover:text-slate-400"} fill={t.milestone ? "#F59E0B" : "none"} />
                      </button>
                    )}
                    <input
                      ref={el => { if (el) rowInputRefs.current.set(t.id, el); else rowInputRefs.current.delete(t.id); }}
                      value={t.name}
                      onChange={e => updateTask(t.id, { name: e.target.value })}
                      onFocus={() => setSelectedId(t.id)}
                      onKeyDown={e => {
                        if (e.key === "Tab") {
                          if (e.nativeEvent.isComposing || e.keyCode === 229) return; // IME入力中のTabではインデントしない
                          e.preventDefault();
                          if (e.shiftKey) outdentTask(t.id); else indentTask(t.id);
                          return;
                        }
                        if (e.key === "ArrowUp") { e.preventDefault(); moveSelection(t.id, "up"); return; }
                        if (e.key === "ArrowDown") { e.preventDefault(); moveSelection(t.id, "down"); return; }
                        if (e.key === "Enter") {
                          if (e.nativeEvent.isComposing || e.keyCode === 229) return; // IME確定のEnterでは行移動しない
                          e.preventDefault();
                          const idx = flat.findIndex(x => x.id === t.id);
                          if (idx !== -1 && idx < flat.length - 1) {
                            moveSelection(t.id, "down");
                          } else {
                            pendingFocusIdRef.current = addTask(false);
                          }
                          return;
                        }
                      }}
                      className={"bg-transparent outline-none truncate w-full " + (isSummary ? "font-semibold" : "")}
                    />
                  </span>
                  {compareOn && !baselineRow && (
                    <span className="flex-shrink-0 text-[9px] leading-none px-1 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200" title="基準バージョンには存在しないタスクです">新規</span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setDetailId(t.id); }}
                    title="詳細を開く"
                    className="flex-shrink-0 text-slate-300 hover:text-indigo-600"
                  >
                    <Info size={11} />
                  </button>
                </div>
                <div style={{ width: colWidths.start }} className="px-1">
                  {!isSummary && !t.hasChildren && (
                    t.milestone ? (
                      <input type="date" value={t.milestoneMode === "fixed" ? (t.fixedDate || "") : (sched?.schedStart || "")}
                        onChange={e => updateTask(t.id, { fixedDate: e.target.value, startDate: e.target.value })}
                        ref={cellRefCallback(dateInputRefs, t.id)} onKeyDown={cellArrowKeyDown(dateInputRefs, t.id)}
                        className={"bg-transparent outline-none w-full font-mono text-[11px] " + (autoScheduleHighlightIds.has(t.id) ? "font-bold" : "")} />
                    ) : (
                      <input type="date" value={t.startDate || ""} onChange={e => updateTask(t.id, { startDate: e.target.value })}
                        ref={cellRefCallback(dateInputRefs, t.id)} onKeyDown={cellArrowKeyDown(dateInputRefs, t.id)}
                        className={"bg-transparent outline-none w-full font-mono text-[11px] " + (autoScheduleHighlightIds.has(t.id) ? "font-bold" : "")} />
                    )
                  )}
                  {isSummary && <span className="font-mono text-[11px] text-slate-400">{fmtJP(sched?.schedStart)}</span>}
                </div>
                <div style={{ width: colWidths.duration }} className="px-1">
                  {!isSummary && !t.hasChildren && !t.milestone && (
                    <input type="number" min={0} step={0.5} value={t.duration} title="人日（小数可）"
                      onChange={e => updateTask(t.id, { duration: Math.max(0, Math.round(parseFloat(e.target.value || "0") * 100) / 100) })}
                      ref={cellRefCallback(durationInputRefs, t.id)} onKeyDown={cellArrowKeyDown(durationInputRefs, t.id)}
                      className="bg-transparent outline-none w-full font-mono text-[11px]" />
                  )}
                </div>
                <div style={{ width: colWidths.finish }} className="px-1 font-mono text-[11px] text-slate-500">{fmtJP(sched?.schedFinish)}</div>
                <div style={{ width: colWidths.assignee }} className="px-1">
                  {!isSummary && !t.hasChildren && (
                    t.milestone ? (
                      <select value={t.milestoneMode || "flexible"} onChange={e => updateTask(t.id, { milestoneMode: e.target.value })}
                        title="固定：期日から逆算してスケジュール / 柔軟：依存関係から順算"
                        ref={cellRefCallback(assigneeInputRefs, t.id)} onKeyDown={cellArrowKeyDown(assigneeInputRefs, t.id)}
                        className="bg-transparent outline-none w-full text-[11px]">
                        <option value="flexible">柔軟</option>
                        <option value="fixed">固定</option>
                      </select>
                    ) : (
                      <select value={t.assigneeId || ""} onChange={e => updateTask(t.id, { assigneeId: e.target.value || null })}
                        ref={cellRefCallback(assigneeInputRefs, t.id)} onKeyDown={cellArrowKeyDown(assigneeInputRefs, t.id)}
                        className="bg-transparent outline-none w-full text-[11px]">
                        <option value="">—</option>
                        {resources.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    )
                  )}
                </div>
                <div style={{ width: colWidths.sprint }} className="px-1">
                  {!isSummary && !t.hasChildren && (
                    <SprintMultiSelect sprintIds={t.sprintIds} sprints={sprints}
                      onChange={next => updateTask(t.id, { sprintIds: next })}
                      inputRef={cellRefCallback(sprintInputRefs, t.id)} onKeyDown={cellArrowKeyDown(sprintInputRefs, t.id)} />
                  )}
                </div>
                <div style={{ width: colWidths.progress }} className="px-1">
                  {!isSummary && !t.hasChildren ? (
                    t.milestone ? (
                      <input type="checkbox" checked={(t.progress || 0) >= 100}
                        title="完了チェック（未チェック：0% / チェック済み：100%）"
                        onChange={e => updateTask(t.id, { progress: e.target.checked ? 100 : 0 })}
                        ref={cellRefCallback(progressInputRefs, t.id)} onKeyDown={cellArrowKeyDown(progressInputRefs, t.id)} />
                    ) : (
                      <div className="flex items-center gap-0.5">
                        <input type="number" min={0} max={100} step={5} value={t.progress || 0}
                          title="進捗率（%）"
                          onChange={e => updateTask(t.id, { progress: Math.max(0, Math.min(100, Math.round(parseFloat(e.target.value || "0")))) })}
                          ref={cellRefCallback(progressInputRefs, t.id)} onKeyDown={cellArrowKeyDown(progressInputRefs, t.id)}
                          className="bg-transparent outline-none w-full font-mono text-[11px]" />
                        <span className="text-[10px] text-slate-400 flex-shrink-0">%</span>
                      </div>
                    )
                  ) : (
                    <span className="font-mono text-[11px] text-slate-400">{isSummary ? `${sched?.progress ?? 0}%` : ""}</span>
                  )}
                </div>
                <div style={{ width: colWidths.deps }} className="px-1">
                  <DepInput deps={t.predecessors} idToNo={idToNo} noToId={noToId} onChange={d => updateTask(t.id, { predecessors: d })}
                    inputRef={cellRefCallback(depsInputRefs, t.id)} onKeyDown={cellArrowKeyDown(depsInputRefs, t.id)} />
                </div>
                <div style={{ width: colWidths.actions }} className="px-1 flex items-center justify-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteTask(t.id); }}
                    title="削除"
                    className="text-slate-300 hover:text-red-500"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              {compareOn && (
                <div style={{ height: ROW_H_BASE }} className="flex items-center text-[10px] border-b border-slate-100 bg-slate-50">
                  <div style={{ width: colWidths.grip }} />
                  <div style={{ width: colWidths.wbs }} />
                  <div style={{ width: colWidths.name }} className="px-1 flex items-center gap-1.5 min-w-0">
                    <span style={{ marginLeft: t.level * 12 + 12 }} className="w-[3px] self-stretch my-0.5 rounded-sm bg-slate-300 flex-shrink-0" />
                    {baselineRow ? (
                      <span className="truncate italic text-slate-400" title={`基準: ${baselineVersion.name}`}>{baselineVersion.name}</span>
                    ) : (
                      <span className="truncate text-slate-300">（基準になし）</span>
                    )}
                  </div>
                  <div style={{ width: colWidths.start }} className="px-1 font-mono text-slate-400" title={baselineRow ? fmtJP(baselineRow.schedStart) : ""}>
                    {baselineRow ? fmtJP(baselineRow.schedStart) : ""}
                  </div>
                  <div style={{ width: colWidths.duration }} className="px-1 font-mono text-slate-400">
                    {baselineRow && !baselineRow.hasChildren && !baselineRow.milestone ? baselineRow.duration : ""}
                  </div>
                  <div style={{ width: colWidths.finish }} className="px-1 font-mono text-slate-400 flex items-center gap-1 truncate" title={baselineRow ? fmtJP(baselineRow.schedFinish) : ""}>
                    <span>{baselineRow ? fmtJP(baselineRow.schedFinish) : ""}</span>
                    {diffDays != null && diffDays !== 0 && (
                      <span
                        className={"font-sans font-medium flex-shrink-0 " + (diffDays > 0 ? "text-orange-600" : "text-emerald-600")}
                        title={diffDays > 0 ? `現在は基準より${diffDays}日遅い` : `現在は基準より${-diffDays}日早い`}
                      >
                        {diffDays > 0 ? `+${diffDays}` : `${diffDays}`}
                      </span>
                    )}
                    {diffDays === 0 && <span className="font-sans text-slate-300 flex-shrink-0" title="基準と同じ終了日">±0</span>}
                  </div>
                  <div style={{ width: colWidths.assignee }} className="px-1 text-slate-400 truncate">
                    {baselineRow && !baselineRow.hasChildren && baselineRow.assigneeId
                      ? (resourceNameById.get(baselineRow.assigneeId) || "") : ""}
                  </div>
                  <div style={{ width: colWidths.sprint }} />
                  <div style={{ width: colWidths.progress }} className="px-1 font-mono text-slate-400">
                    {baselineRow ? `${baselineRow.progress ?? 0}%` : ""}
                  </div>
                  <div style={{ width: colWidths.deps }} />
                  <div style={{ width: colWidths.actions }} />
                </div>
              )}
              </React.Fragment>
            );
          })}
          <div style={{ height: ROW_H }} className="flex items-center text-xs border-b border-slate-100">
            <div style={{ width: colWidths.grip }} />
            <div style={{ width: colWidths.wbs }} className="px-2" />
            <div style={{ width: colWidths.name }} className="px-1 flex items-center gap-1">
              <span style={{ width: 12 }} />
              <Plus size={12} className="text-slate-300 flex-shrink-0" />
              <input
                ref={newTaskInputRef}
                value={newTaskName}
                onChange={e => setNewTaskName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "ArrowUp") { e.preventDefault(); if (flat.length > 0) selectAndFocusRow(flat[flat.length - 1].id); return; }
                  if (e.key !== "Enter" || e.nativeEvent.isComposing || e.keyCode === 229) return; // IME確定のEnterでは追加しない
                  e.preventDefault();
                  addQuickTask();
                }}
                placeholder="新しいタスクを追加して Enter"
                className="flex-1 min-w-0 bg-transparent outline-none text-slate-700 placeholder-slate-400 truncate"
              />
            </div>
            <div style={{ width: colWidths.start }} />
            <div style={{ width: colWidths.duration }} />
            <div style={{ width: colWidths.finish }} />
            <div style={{ width: colWidths.assignee }} />
            <div style={{ width: colWidths.sprint }} />
            <div style={{ width: colWidths.progress }} />
            <div style={{ width: colWidths.deps }} />
            <div style={{ width: colWidths.actions }} />
          </div>
          </div>
        </div>

        {/* ペイン境界（WBS表とガントチャートの幅配分をドラッグで調整） */}
        <div
          onPointerDown={startPaneResize}
          onDoubleClick={resetPaneWidth}
          title="ドラッグでペイン幅を調整（ダブルクリックで自動幅に戻す）"
          className="w-1.5 flex-shrink-0 cursor-col-resize bg-slate-200 hover:bg-indigo-400/60 active:bg-indigo-500/70"
          style={{ touchAction: "none" }}
        />

        {/* 右：ガントチャート */}
        <div ref={rightRef} onScroll={onScrollRight} className="overflow-auto flex-1 bg-white">
          <div style={{ width: chartWidth, minWidth: "100%" }}>
            <div className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200" style={{ height: GANTT_HEADER_H }}>
              <div className="relative border-b border-slate-200" style={{ height: 16 }}>
                {sprintBands.map(({ sprint, x, w }) => {
                  const c = sprintColorForId(sprint.id);
                  return (
                    <div key={sprint.id}
                      title={sprint.theme ? `${sprint.name}・${sprint.theme}` : sprint.name}
                      style={{ position: "absolute", left: x, width: w, height: 16, background: c.band }}
                      className="flex items-center justify-center text-[9px] font-medium overflow-hidden whitespace-nowrap">
                      <span style={{ color: c.text }} className="truncate px-1">
                        {sprint.name}{sprint.theme ? `・${sprint.theme}` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="relative h-5 border-b border-slate-200 text-[10px] text-slate-500">
                {monthBands.map((b, i) => (
                  <div key={i} style={{ position: "absolute", left: b.x, width: b.w }} className="px-1 border-l border-slate-200 truncate">{b.month}</div>
                ))}
              </div>
              <div className="relative text-[9px] text-slate-400" style={{ height: GANTT_HEADER_H - 36 }}>
                {dayCells.filter((_, i) => dayWidth >= 14 || i % 2 === 0).map(c => (
                  <div
                    key={c.iso}
                    style={{ position: "absolute", left: c.x, width: dayWidth }}
                    className={"text-center leading-tight " + ((c.weekend || c.holiday) ? "text-red-400" : "")}
                  >
                    <div>{c.day}</div>
                    <div>{c.dowLabel}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              {/* 背景（スプリント帯・週末・祝日） */}
              <svg width={chartWidth} height={bodyHeight} style={{ position: "absolute", top: 0, left: 0 }}>
                {sprintBands.map(({ sprint, x, w }) => (
                  <rect key={sprint.id} x={x} y={0} width={w} height={bodyHeight} fill={sprintColorForId(sprint.id).band} opacity={0.45} />
                ))}
                {dayCells.map(c => (c.weekend || c.holiday) && (
                  <rect key={c.iso} x={c.x} y={0} width={dayWidth} height={bodyHeight} fill={c.holiday ? "#FEF3C7" : "#F1F5F9"} />
                ))}
                {xOf(todayISO) >= 0 && xOf(todayISO) <= chartWidth && (
                  <line x1={xOf(todayISO) + dayWidth / 2} x2={xOf(todayISO) + dayWidth / 2} y1={0} y2={bodyHeight} stroke="#DC2626" strokeDasharray="3,3" strokeWidth={1} />
                )}
                {flat.map((t, i) => <line key={t.id} x1={0} x2={chartWidth} y1={(i + 1) * rowStride} y2={(i + 1) * rowStride} stroke="#F1F5F9" />)}
                <GanttDeps flat={flat} schedule={schedule} xOf={xOf} dayWidth={dayWidth} rowStride={rowStride} showCritical={showCritical} />
              </svg>
              {/* バー */}
              <svg ref={barsSvgRef} width={chartWidth} height={bodyHeight} style={{ position: "relative" }}>
                {linkDrag && (() => {
                  const rowIndex = Math.max(0, Math.min(flat.length - 1, Math.floor(linkDrag.y2 / rowStride)));
                  const targetTask = flat[rowIndex];
                  if (!targetTask || targetTask.hasChildren || targetTask.id === linkDrag.fromId) return null;
                  return <rect x={0} y={rowIndex * rowStride} width={chartWidth} height={ROW_H} fill="#EEF2FF" />;
                })()}
                {flat.map((t, i) => {
                  const s = schedule.get(t.id);
                  const y = i * rowStride;
                  // バージョン比較：現在レーン（上段, 高さROW_H）の直下に基準レーン（下段, 高さROW_H_BASE）を描く。
                  const baselineRow = compareOn ? baselineByWbsNo.get(t.wbsNo) : null;
                  const baseY = y + ROW_H;
                  const baselineEl = (compareOn && baselineRow && baselineRow.schedStart) ? (() => {
                    const bx1 = xOf(baselineRow.schedStart);
                    const bx2 = xOf(baselineRow.schedFinish) + dayWidth;
                    if (baselineRow.milestone) {
                      const cx = bx1 + dayWidth / 2, cy = baseY + ROW_H_BASE / 2;
                      return <rect x={cx - 4} y={cy - 4} width={8} height={8} fill="#94A3B8" transform={`rotate(45 ${cx} ${cy})`} />;
                    }
                    if (baselineRow.hasChildren) {
                      const y2 = baseY + ROW_H_BASE / 2;
                      return <path d={`M${bx1},${y2 - 3} L${bx1},${y2 + 3} L${bx2},${y2 + 3} L${bx2},${y2 - 3}`} stroke="#94A3B8" strokeWidth={2} fill="none" />;
                    }
                    return <rect x={bx1} y={baseY + 4} width={Math.max(2, bx2 - bx1)} height={Math.max(4, ROW_H_BASE - 8)} rx={3} fill="#94A3B8" opacity={0.85} />;
                  })() : null;
                  if (!s || !s.schedStart) return baselineEl ? <React.Fragment key={t.id}>{baselineEl}</React.Fragment> : null;
                  const x1 = xOf(s.schedStart);
                  const x2 = xOf(s.schedFinish) + dayWidth;
                  const color = t.milestone ? "#F59E0B" : (showCritical && s.critical) ? "#DC2626" : s.isSummary ? "#334155" : "#6366F1";
                  const handle = (hx, hy) => (
                    <circle cx={hx} cy={hy} r={4} fill="white" stroke="#4F46E5" strokeWidth={1.5}
                      style={{ cursor: "crosshair" }}
                      onPointerDown={e => startLinkDrag(e, t.id, hx, hy)} />
                  );
                  if (t.milestone) {
                    const cx = x1 + dayWidth / 2, cy = y + ROW_H / 2;
                    return (
                      <React.Fragment key={t.id}>
                        <g>
                          <rect x={cx - 6} y={cy - 6} width={12} height={12} fill={color} transform={`rotate(45 ${cx} ${cy})`} stroke="white" strokeWidth={1} />
                          <text x={cx + 12} y={cy + 4} fontSize={10} fill="#475569">{t.name}{t.milestoneMode === "fixed" ? ` (固定 ${fmtJP(t.fixedDate)})` : ""}</text>
                          {handle(cx + 9, cy)}
                        </g>
                        {baselineEl}
                      </React.Fragment>
                    );
                  }
                  if (s.isSummary) {
                    const y2 = y + ROW_H / 2;
                    return (
                      <React.Fragment key={t.id}>
                        <g>
                          <path d={`M${x1},${y2 - 5} L${x1},${y2 + 5} L${x2},${y2 + 5} L${x2},${y2 - 5}`} stroke={color} strokeWidth={3} fill="none" />
                          <text x={x2 + 6} y={y2 + 4} fontSize={10} fontWeight={600} fill="#334155">{t.name}</text>
                        </g>
                        {baselineEl}
                      </React.Fragment>
                    );
                  }
                  const barW = Math.max(2, x2 - x1);
                  const prog = Math.max(0, Math.min(100, t.progress || 0));
                  const progW = (barW * prog) / 100;
                  return (
                    <React.Fragment key={t.id}>
                      <g>
                        <rect x={x1} y={y + 6} width={barW} height={ROW_H - 12} rx={4} fill={color} opacity={0.35} />
                        {progW > 0 && <rect x={x1} y={y + 6} width={progW} height={ROW_H - 12} rx={4} fill={color} opacity={0.95} />}
                        <text x={x2 + 6} y={y + ROW_H / 2 + 4} fontSize={10} fill="#475569">{t.name}{t.assigneeId ? ` · ${resourceNameById.get(t.assigneeId) || ""}` : ""}{prog > 0 ? ` (${prog}%)` : ""}</text>
                        {handle(x2, y + ROW_H / 2)}
                      </g>
                      {baselineEl}
                    </React.Fragment>
                  );
                })}
                {showInazuma && <InazumaLine flat={flat} schedule={schedule} xOf={xOf} dayWidth={dayWidth} cal={cal} todayISO={todayISO} rowStride={rowStride} />}
                {linkDrag && (
                  <path d={`M${linkDrag.x1},${linkDrag.y1} L${linkDrag.x2},${linkDrag.y2}`}
                    stroke="#4F46E5" strokeWidth={1.5} strokeDasharray="4,3" fill="none" markerEnd="url(#ganttLinkArrow)" />
                )}
                <defs>
                  <marker id="ganttLinkArrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                    <path d="M0,0 L7,3.5 L0,7 Z" fill="#4F46E5" />
                  </marker>
                </defs>
              </svg>
            </div>
          </div>
        </div>
      </div>
      {detailId && (
        <TaskDetailModal
          task={flat.find(f => f.id === detailId)}
          schedule={schedule}
          tasks={tasks}
          resources={resources}
          sprints={sprints}
          idToNo={idToNo}
          noToId={noToId}
          onUpdate={patch => updateTask(detailId, patch)}
          onToggleMilestone={() => toggleMilestone(detailId)}
          onClose={() => setDetailId(null)}
          autoScheduleHighlightIds={autoScheduleHighlightIds}
        />
      )}
    </div>
  );
}

/** タスク／マイルストーンの詳細パネル。テーブルの1行に収まらない情報（メモ、後続タスク、
 *  スケジュール計算結果など）をまとめて確認・編集できるモーダル。 */
function TaskDetailModal({ task, schedule, tasks, resources, sprints, idToNo, noToId, onUpdate, onToggleMilestone, onClose, autoScheduleHighlightIds }) {
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!task) return null;
  const isSummary = task.hasChildren;
  const sched = schedule.get(task.id);

  const successors = tasks
    .filter(t => (t.predecessors || []).some(d => d.id === task.id))
    .map(t => {
      const dep = (t.predecessors || []).find(d => d.id === task.id);
      return { id: t.id, name: t.name, wbsNo: idToNo[t.id] || "", label: formatDepLabel(dep) };
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-full overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-xl">
          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <span>WBS {task.wbsNo}</span>
            {task.milestone && <Diamond size={11} className="text-amber-500" fill="#F59E0B" />}
            {isSummary && <span className="text-slate-400">（グループ）</span>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">タスク名</label>
            <input value={task.name} onChange={e => onUpdate({ name: e.target.value })}
              className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>

          {!isSummary && (
            <button onClick={onToggleMilestone}
              className="w-full flex items-center justify-between bg-slate-50 hover:bg-slate-100 rounded-md px-3 py-2 transition-colors">
              <span className="text-xs text-slate-500">種別</span>
              <span className="flex items-center gap-1.5 text-xs font-medium text-indigo-600">
                {task.milestone ? <Diamond size={12} fill="#F59E0B" className="text-amber-500" /> : null}
                {task.milestone ? "マイルストーン（クリックでタスクに変更）" : "タスク（クリックでマイルストーンに変更）"}
              </span>
            </button>
          )}

          {!isSummary && task.milestone && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">期日</label>
                <input type="date" value={task.milestoneMode === "fixed" ? (task.fixedDate || "") : (sched?.schedStart || "")}
                  onChange={e => onUpdate({ fixedDate: e.target.value, startDate: e.target.value })}
                  className={"w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm font-mono outline-none focus:border-indigo-400 " + (autoScheduleHighlightIds.has(task.id) ? "font-bold" : "")} />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">モード</label>
                <select value={task.milestoneMode || "flexible"} onChange={e => onUpdate({ milestoneMode: e.target.value })}
                  className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
                  <option value="flexible">柔軟（順算）</option>
                  <option value="fixed">固定（期日から逆算）</option>
                </select>
              </div>
            </div>
          )}

          {!isSummary && !task.milestone && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">開始日</label>
                <input type="date" value={task.startDate || ""} onChange={e => onUpdate({ startDate: e.target.value })}
                  className={"w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm font-mono outline-none focus:border-indigo-400 " + (autoScheduleHighlightIds.has(task.id) ? "font-bold" : "")} />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">工数（人日）</label>
                <input type="number" min={0} step={0.5} value={task.duration}
                  onChange={e => onUpdate({ duration: Math.max(0, Math.round(parseFloat(e.target.value || "0") * 100) / 100) })}
                  className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm font-mono outline-none focus:border-indigo-400" />
              </div>
            </div>
          )}

          {!isSummary && (
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">担当者</label>
              <select value={task.assigneeId || ""} onChange={e => onUpdate({ assigneeId: e.target.value || null })}
                className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
                <option value="">未割当</option>
                {resources.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}

          {!isSummary && (
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">スプリント（複数選択可）</label>
              {sprints.length === 0 ? (
                <div className="text-xs text-slate-400">スプリントが登録されていません</div>
              ) : (
                <div className="border border-slate-200 rounded-md divide-y divide-slate-100 max-h-40 overflow-y-auto">
                  {sprints.map(sp => {
                    const checked = (task.sprintIds || []).includes(sp.id);
                    return (
                      <label key={sp.id} className="flex items-center gap-2 px-2.5 py-1.5 text-sm cursor-pointer hover:bg-slate-50">
                        <input type="checkbox" checked={checked} onChange={e => {
                          const cur = task.sprintIds || [];
                          const next = e.target.checked ? [...cur, sp.id] : cur.filter(id => id !== sp.id);
                          onUpdate({ sprintIds: next });
                        }} />
                        <span>
                          {sp.name}
                          {sp.startDate && sp.endDate && (
                            <span className="text-slate-400">（{fmtMD(sp.startDate)}〜{fmtMD(sp.endDate)}）</span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-[11px] text-slate-500 mb-1">
              {task.milestone ? "完了" : "進捗率"}
              {isSummary && <span className="text-slate-400 font-normal">　※配下タスクの平均を自動表示（編集不可）</span>}
            </label>
            {isSummary ? (
              <div className="w-full border border-slate-100 bg-slate-50 rounded-md px-2.5 py-1.5 text-sm font-mono text-slate-500">{sched?.progress ?? 0}%</div>
            ) : task.milestone ? (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={(task.progress || 0) >= 100}
                  onChange={e => onUpdate({ progress: e.target.checked ? 100 : 0 })} />
                完了済み
              </label>
            ) : (
              <div className="flex items-center gap-2">
                <input type="range" min={0} max={100} step={5} value={task.progress || 0}
                  onChange={e => onUpdate({ progress: Math.max(0, Math.min(100, parseInt(e.target.value, 10))) })}
                  className="flex-1" />
                <div className="flex items-center gap-0.5 w-16 flex-shrink-0">
                  <input type="number" min={0} max={100} step={5} value={task.progress || 0}
                    onChange={e => onUpdate({ progress: Math.max(0, Math.min(100, Math.round(parseFloat(e.target.value || "0")))) })}
                    className="w-full border border-slate-200 rounded-md px-1.5 py-1 text-sm font-mono outline-none focus:border-indigo-400" />
                  <span className="text-xs text-slate-400">%</span>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 mb-1">
              先行タスク（WBS番号[型][±遅延] 例: 1.2FS+1）
              {isSummary && <span className="text-slate-400 font-normal">　※配下の全タスクに適用されます</span>}
            </label>
            <div className="border border-slate-200 rounded-md px-2.5 py-1.5">
              <DepInput deps={task.predecessors} idToNo={idToNo} noToId={noToId} onChange={d => onUpdate({ predecessors: d })} />
            </div>
          </div>

          {successors.length > 0 && (
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">後続タスク</label>
              <div className="border border-slate-100 rounded-md divide-y divide-slate-100">
                {successors.map(s => (
                  <div key={s.id} className="flex items-center justify-between px-2.5 py-1.5 text-xs">
                    <span className="text-slate-600 truncate">{s.wbsNo} {s.name}</span>
                    <span className="font-mono text-slate-400">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-slate-50 rounded-md px-3 py-2.5 grid grid-cols-2 gap-y-1.5 gap-x-3 text-xs">
            <span className="text-slate-400">開始</span><span className="font-mono text-slate-700">{fmtJP(sched?.schedStart)}</span>
            <span className="text-slate-400">終了</span><span className="font-mono text-slate-700">{fmtJP(sched?.schedFinish)}</span>
            {!isSummary && (
              <>
                <span className="text-slate-400">フロート</span>
                <span className={"font-mono " + (sched?.critical ? "text-red-600 font-semibold" : "text-slate-700")}>
                  {sched?.float ?? "-"} 日{sched?.critical ? "（クリティカル）" : ""}
                </span>
              </>
            )}
            {!isSummary && sched?.governed && (
              <>
                <span className="text-slate-400">逆算対象</span>
                <span className="text-slate-700">固定マイルストーンの期日から逆算されています</span>
              </>
            )}
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 mb-1">メモ</label>
            <textarea value={task.notes || ""} onChange={e => onUpdate({ notes: e.target.value })} rows={3}
              placeholder="このタスクに関するメモを入力"
              className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 resize-none" />
          </div>
        </div>

        <div className="flex justify-end px-4 py-3 border-t border-slate-100">
          <IconBtn label="閉じる" onClick={onClose} small />
        </div>
      </div>
    </div>
  );
}

function DepInput({ deps, idToNo, noToId, onChange, inputRef, onKeyDown }) {
  const [text, setText] = useState(() => formatDeps(deps, idToNo));
  useEffect(() => { setText(formatDeps(deps, idToNo)); }, [deps, idToNo]);
  return (
    <input
      ref={inputRef}
      value={text}
      placeholder="例: 1.2FS+1"
      onChange={e => setText(e.target.value)}
      onBlur={() => { const parsed = parseDepString(text, noToId); onChange(parsed); setText(formatDeps(parsed, idToNo)); }}
      onKeyDown={onKeyDown}
      className="bg-transparent outline-none w-full font-mono text-[11px] border-b border-transparent focus:border-indigo-300"
    />
  );
}

/** WBS表のスプリント欄用のコンパクトな複数選択ドロップダウン（ボタン＋チェックボックス一覧）。 */
function SprintMultiSelect({ sprintIds, sprints, onChange, inputRef, onKeyDown }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDocPointerDown);
    return () => document.removeEventListener("mousedown", onDocPointerDown);
  }, [open]);
  const ids = sprintIds || [];
  const selected = sprints.filter(sp => ids.includes(sp.id));
  const label = selected.length === 0 ? "—" : selected.map(sp => sp.name).join(", ");
  function toggle(id) {
    onChange(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  }
  return (
    <div ref={wrapRef} className="relative">
      <button type="button" ref={inputRef}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(o => !o); } onKeyDown && onKeyDown(e); }}
        onClick={() => setOpen(o => !o)}
        title={selected.length ? selected.map(sp => sp.name).join("\n") : "紐付けるスプリント"}
        className="w-full text-left bg-transparent outline-none text-[11px] truncate hover:bg-slate-100 rounded px-0.5 text-slate-700">
        {label}
      </button>
      {open && (
        <div className="absolute z-30 top-full left-0 mt-1 w-44 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-lg py-1"
          onClick={e => e.stopPropagation()}>
          {sprints.length === 0 && <div className="px-2.5 py-1.5 text-[11px] text-slate-400">スプリントがありません</div>}
          {sprints.map(sp => (
            <label key={sp.id} className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] hover:bg-slate-50 cursor-pointer">
              <input type="checkbox" checked={ids.includes(sp.id)} onChange={() => toggle(sp.id)} />
              <span className="truncate">{sp.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function GanttDeps({ flat, schedule, xOf, dayWidth, rowStride = ROW_H, showCritical = true }) {
  // rowStride は比較モード時の「現在行+基準行」の合計高さ。矢印は常に現在レーン（上段, 高さROW_H）の
  // 中心を結ぶため、行の先頭Y座標(i*rowStride)にROW_H/2を足す。
  const yOf = id => { const i = flat.findIndex(t => t.id === id); return i * rowStride + ROW_H / 2; };
  const paths = [];
  flat.forEach(t => {
    (t.predecessors || []).forEach(dep => {
      const p = flat.find(f => f.id === dep.id);
      if (!p) return;
      const ps = schedule.get(p.id), ss = schedule.get(t.id);
      if (!ps || !ss || !ps.schedStart || !ss.schedStart) return;
      const fromX = (dep.type === "FS" || dep.type === "FF") ? xOf(ps.schedFinish) + dayWidth : xOf(ps.schedStart);
      const toX = (dep.type === "FS" || dep.type === "SS") ? xOf(ss.schedStart) : xOf(ss.schedFinish) + dayWidth;
      const fromY = yOf(p.id), toY = yOf(t.id);
      const critical = showCritical && ps.critical && ss.critical;
      const midX = fromX + (toX > fromX ? Math.min(dayWidth, (toX - fromX) / 2) : dayWidth / 2);
      const d = `M${fromX},${fromY} L${midX},${fromY} L${midX},${toY} L${toX},${toY}`;
      paths.push(<path key={p.id + "_" + t.id + "_" + paths.length} d={d} stroke={critical ? "#EF4444" : "#CBD5E1"} strokeWidth={1.2} fill="none" markerEnd="url(#arrow)" />);
    });
  });
  return (
    <>
      <defs>
        <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#94A3B8" />
        </marker>
      </defs>
      {paths}
    </>
  );
}

/** 稲妻線（進捗線）。一般的なイナズマ線／MS Project の進行状況線の作図ルールに合わせている。
 *
 *  1. 基準線は「今日」の縦線。線はチャート上端の今日から引き始め、各行の進捗点を順に結び、
 *     最後にチャート下端の今日へ戻る。点と点は斜めの直線で結ぶため、遅れ・進みのある行が
 *     三角形状に尖った、いわゆる「ギザギザ」の形になる。
 *  2. 各行の進捗点は「タスクバー上で進捗率が到達している位置」に打つ
 *     （0%＝バー左端、50%＝バー中央、100%＝バー右端）。位置は稼働日カレンダーで求めるため、
 *     ガントバーの進捗塗り分けの先端とちょうど一致する。今日より左に尖れば遅れ、右なら前倒し。
 *  3. 予定どおりの行は尖らせず、今日の位置を通る垂直な線にする。すなわち、完了済み（100%）の
 *     タスクは到達位置が過去でも今日まで引き上げ（凹ませない）、未着手（0%）で開始前の
 *     タスクは到達位置が未来でも今日まで引き下げる（凸らせない）。
 *  4. 展開中のグループ（サマリー）行には点を打たない。グループの進捗点は配下タスクを
 *     期間で丸めた値であり、実際の作業状況を表さないうえ、配下タスクの点と二重に山ができて
 *     かえって読みにくくなるため（MS Project も開始日が未来のサマリータスクを進行状況線から
 *     除外する）。折りたたまれているグループは配下が非表示なので、代表として点を打つ。
 *  5. マイルストーンは期間を持たないため、進捗率で按分せずマークの位置そのものを点とする。
 *
 *  予定日程（schedStart/schedFinish）そのものは進捗率によって変化させない。 */
function InazumaLine({ flat, schedule, xOf, dayWidth, cal, todayISO, rowStride = ROW_H }) {
  const todayX = xOf(todayISO) + dayWidth / 2;
  const points = [];
  flat.forEach((t, i) => {
    const s = schedule.get(t.id);
    if (!s || !s.schedStart || !s.schedFinish) return;
    // 展開中のグループ行はスキップ（次の行が自分の配下なら展開されている）
    const expandedGroup = t.hasChildren && flat[i + 1] && flat[i + 1].level > t.level;
    if (expandedGroup) return;
    const frac = Math.max(0, Math.min(100, s.progress ?? (t.progress || 0))) / 100;
    let px;
    if (t.milestone) {
      px = xOf(s.schedStart) + dayWidth / 2; // マイルストーンのマーク位置
    } else {
      // タスクが占める稼働日数（開始日・終了日を含む）を進捗率で按分した位置
      const spanDays = cal.workdaysBetween(s.schedStart, s.schedFinish) + 1;
      const completed = spanDays * frac;
      const whole = Math.floor(completed);
      px = whole >= spanDays
        ? xOf(s.schedFinish) + dayWidth // 100%：バーの右端
        : xOf(cal.shift(s.schedStart, whole)) + (completed - whole) * dayWidth;
    }
    // 予定どおりの行は尖らせない（完了済みは凹ませない／未着手は凸らせない）
    if (frac >= 1 && px < todayX) px = todayX;
    else if (frac <= 0 && px > todayX) px = todayX;
    points.push({ id: t.id, px, py: i * rowStride + ROW_H / 2 });
  });
  if (!points.length) return null;
  const bottomY = flat.length * rowStride;
  const d = [`M${todayX},0`, ...points.map(p => `L${p.px},${p.py}`), `L${todayX},${bottomY}`].join(" ");
  return (
    <g pointerEvents="none">
      <path d={d} stroke="#EAB308" strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      {points.map(p => <circle key={p.id} cx={p.px} cy={p.py} r={2.5} fill="#EAB308" />)}
    </g>
  );
}

/* =========================================================================================
   9. ネットワーク図（依存関係図）ビュー
   ========================================================================================= */
const NETWORK_PALETTE = ["#6366F1", "#F59E0B", "#10B981", "#EC4899", "#0EA5E9", "#8B5CF6", "#EF4444", "#14B8A6"];

function NetworkView({ tasks, setTasks, schedule, selectedId, setSelectedId }) {
  const byId = useMemo(() => Object.fromEntries(tasks.map(t => [t.id, t])), [tasks]);
  const hasChildrenOf = useMemo(() => {
    const s = new Set(); tasks.forEach(t => { if (t.parentId) s.add(t.parentId); }); return s;
  }, [tasks]);

  // 最上位（ルート）グループごとに色を割り当てる：配下のノードの左端に同じ色のアクセントを付け、
  // アウトライン上どの大分類に属するかを一目で分かるようにする。
  const topAncestorId = useCallback((id) => {
    let cur = byId[id];
    if (!cur) return id;
    let top = cur;
    let guard = 0;
    while (top.parentId && byId[top.parentId] && guard < 50) { top = byId[top.parentId]; guard++; }
    return top.id;
  }, [byId]);
  const rootGroups = useMemo(() => tasks.filter(t => !t.parentId), [tasks]);
  const outlineColor = useMemo(() => {
    const map = {};
    rootGroups.forEach((t, i) => { map[t.id] = NETWORK_PALETTE[i % NETWORK_PALETTE.length]; });
    return map;
  }, [rootGroups]);
  const colorFor = useCallback((id) => outlineColor[topAncestorId(id)] || "#94A3B8", [outlineColor, topAncestorId]);

  function countDescendantLeaves(id) {
    let n = 0;
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop();
      tasks.forEach(t => {
        if (t.parentId !== cur) return;
        if (hasChildrenOf.has(t.id)) stack.push(t.id); else n++;
      });
    }
    return n;
  }

  const nodeW = 168, nodeH = 56, indentW = nodeW + 40, rowGap = 26;

  // レイアウトはアウトライン（WBS階層）を主軸にする：縦位置はWBS表と同じ並び順（親グループの
  // 直後にその子が続く）、横位置はアウトライン上の階層の深さ（インデント）。依存関係は
  // グループ⇄グループ／タスク⇄タスク／グループ⇄タスクのいずれでも、この配置の上に
  // オーバーレイの矢印として描画する（依存関係の矢印は階層をまたいで自由に結ばれる）。
  const flatOutline = useMemo(() => buildFlatList(tasks, new Set()), [tasks]);
  const allNodes = flatOutline;

  const positions = useMemo(() => {
    const pos = {};
    flatOutline.forEach((t, i) => {
      pos[t.id] = t.diagX != null ? { x: t.diagX, y: t.diagY } : { x: t.level * indentW + 30, y: i * (nodeH + rowGap) + 30 };
    });
    return pos;
  }, [flatOutline]);

  const width = Math.max(700, (Math.max(0, ...flatOutline.map(t => t.level)) + 1) * indentW + 60);
  const height = Math.max(400, flatOutline.length * (nodeH + rowGap) + 60);

  // 描画領域（画面）いっぱいを使う：コンテナの実サイズをResizeObserverで追跡し、
  // ノード配置から求めた必要サイズより広ければキャンバスをその分まで広げる。
  // ウィンドウ／パネルのリサイズにも自動で追従する。
  const containerRef = useRef(null);
  const [viewSize, setViewSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        setViewSize({ w: cr.width, h: cr.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const svgWidth = Math.max(width, viewSize.w);
  const svgHeight = Math.max(height, viewSize.h - 40); // 40 = 上部の操作説明バーの高さ分

  const dragRef = useRef(null);
  const [edgeEdit, setEdgeEdit] = useState(null);
  const [linkDrag, setLinkDrag] = useState(null); // ドラッグによる依存関係作成（ガントチャートと同じ操作性）
  const svgRef = useRef(null);

  function findNodeAt(x, y) {
    for (const t of allNodes) {
      const p = positions[t.id];
      if (!p) continue;
      if (x >= p.x && x <= p.x + nodeW && y >= p.y && y <= p.y + nodeH) return t;
    }
    return null;
  }
  function startLinkDrag(e, fromId, startX, startY) {
    e.stopPropagation();
    e.preventDefault();
    const p0 = svgPointFromRef(svgRef, e);
    setLinkDrag({ fromId, x1: startX, y1: startY, x2: p0.x, y2: p0.y });
    startPointerDrag(e, {
      onMove: (ev) => {
        const p = svgPointFromRef(svgRef, ev);
        setLinkDrag(prev => (prev ? { ...prev, x2: p.x, y2: p.y } : prev));
      },
      onEnd: (ev) => {
        const p = svgPointFromRef(svgRef, ev);
        const targetTask = findNodeAt(p.x, p.y);
        if (targetTask && targetTask.id !== fromId) {
          setTasks(prev => prev.map(t => {
            if (t.id !== targetTask.id) return t;
            const already = (t.predecessors || []).some(d => d.id === fromId);
            if (already) return t; // 既存の依存関係と重複させない
            return { ...t, predecessors: [...(t.predecessors || []), { id: fromId, type: "FS", lag: 0 }] };
          }));
        }
        setLinkDrag(null);
      },
      onCancel: () => setLinkDrag(null),
    });
  }

  function onNodePointerDown(e, id) {
    e.stopPropagation();
    setSelectedId(id);
    const orig = positions[id];
    if (!orig) return; // 対象ノードの位置が取得できない場合は何もしない（不整合な状態でドラッグを開始しない）

    dragRef.current = { id, startX: e.clientX, startY: e.clientY, origX: orig.x, origY: orig.y };
    startPointerDrag(e, {
      onMove: (ev) => {
        if (!dragRef.current) return;
        const dx = ev.clientX - dragRef.current.startX, dy = ev.clientY - dragRef.current.startY;
        const dragId = dragRef.current.id, ox = dragRef.current.origX, oy = dragRef.current.origY;
        setTasks(prev => prev.map(t => (t.id === dragId ? { ...t, diagX: ox + dx, diagY: oy + dy } : t)));
      },
      onEnd: () => { dragRef.current = null; },
      onCancel: () => { dragRef.current = null; },
    });
  }

  function removeEdge(fromId, toId) {
    setTasks(prev => prev.map(t => t.id === toId ? { ...t, predecessors: (t.predecessors || []).filter(d => d.id !== fromId) } : t));
    setEdgeEdit(null);
  }
  function updateEdge(fromId, toId, patch) {
    setTasks(prev => prev.map(t => t.id === toId ? { ...t, predecessors: (t.predecessors || []).map(d => d.id === fromId ? { ...d, ...patch } : d) } : t));
  }
  // 整頓表示：ドラッグで動かした位置（diagX/diagY）をすべて解除し、WBS番号順（アウトライン）に
  // 基づく自動配置に戻す。
  function tidyLayout() {
    setTasks(prev => prev.map(t => {
      if (t.diagX == null && t.diagY == null) return t;
      const { diagX, diagY, ...rest } = t;
      return rest;
    }));
  }

  return (
    <div ref={containerRef} className="h-full overflow-auto bg-slate-50 relative">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-3 py-2 text-xs text-slate-500 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2.5 flex-wrap ml-auto">
          <IconBtn icon={LayoutGrid} label="整頓表示" onClick={tidyLayout} small />
          {rootGroups.length > 1 && rootGroups.map(g => (
            <span key={g.id} className="flex items-center gap-1 text-[11px] text-slate-500 whitespace-nowrap">
              <span style={{ width: 8, height: 8, borderRadius: 2, background: outlineColor[g.id] }} className="flex-shrink-0" />
              {g.name}
            </span>
          ))}
        </div>
      </div>
      <svg ref={svgRef} width={svgWidth} height={svgHeight} onClick={() => { setEdgeEdit(null); }}>
        <defs>
          <marker id="arrow2" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 Z" fill="#94A3B8" />
          </marker>
          <marker id="arrow2c" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 Z" fill="#EF4444" />
          </marker>
          <marker id="arrowLink" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 Z" fill="#4F46E5" />
          </marker>
        </defs>
        {/* グループ→直下の子タスクへの構造線（依存関係の矢印とは別に、アウトライン上の親子関係を表す） */}
        {allNodes.map(t => {
          if (!t.parentId) return null;
          const parentPos = positions[t.parentId], childPos = positions[t.id];
          if (!parentPos || !childPos) return null;
          const x1 = parentPos.x + 18, y1 = parentPos.y + nodeH;
          const y2 = childPos.y + nodeH / 2, x2 = childPos.x;
          return (
            <path key={"contain_" + t.id} d={`M${x1},${y1} L${x1},${y2} L${x2},${y2}`}
              stroke="#CBD5E1" strokeWidth={1.2} fill="none" strokeDasharray="3,2" />
          );
        })}
        {linkDrag && (() => {
          const targetTask = findNodeAt(linkDrag.x2, linkDrag.y2);
          if (!targetTask || targetTask.id === linkDrag.fromId) return null;
          const p = positions[targetTask.id];
          if (!p) return null;
          return <rect x={p.x} y={p.y} width={nodeW} height={nodeH} rx={8} fill="#EEF2FF" stroke="#4F46E5" strokeWidth={1.5} strokeDasharray="3,2" />;
        })()}
        {allNodes.map(t => (t.predecessors || []).map((dep, depIdx) => {
          const p = positions[dep.id], s = positions[t.id];
          if (!p || !s) return null;
          const critical = schedule.get(dep.id)?.critical && schedule.get(t.id)?.critical;
          const x1 = p.x + nodeW, y1 = p.y + nodeH / 2, x2 = s.x, y2 = s.y + nodeH / 2;
          const midX = (x1 + x2) / 2;
          const d = x2 > x1 ? `M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}` : `M${x1},${y1} C${x1 + 60},${y1} ${x2 - 60},${y2} ${x2},${y2}`;
          const label = formatDepLabel(dep);
          const lx = (x1 + x2) / 2, ly = (y1 + y2) / 2;
          return (
            <g key={dep.id + "_" + t.id + "_" + depIdx}>
              <path d={d} stroke={critical ? "#EF4444" : "#94A3B8"} strokeWidth={critical ? 1.8 : 1.3} fill="none" markerEnd={critical ? "url(#arrow2c)" : "url(#arrow2)"} />
              <g style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); setEdgeEdit({ from: dep.id, to: t.id, type: dep.type, lag: dep.lag, x: lx, y: ly }); }}>
                <rect x={lx - 18} y={ly - 9} width={36} height={16} rx={3} fill="white" stroke="#E2E8F0" />
                <text x={lx} y={ly + 3} fontSize={9.5} textAnchor="middle" fill={critical ? "#DC2626" : "#64748B"}>{label}</text>
              </g>
            </g>
          );
        }))}
        {allNodes.map(t => {
          const p = positions[t.id]; if (!p) return null;
          const s = schedule.get(t.id);
          const isSel = selectedId === t.id;
          const isGroup = hasChildrenOf.has(t.id);
          return (
            <g key={t.id} transform={`translate(${p.x},${p.y})`} onPointerDown={e => onNodePointerDown(e, t.id)} style={{ cursor: "grab", touchAction: "none" }}>
              <rect width={nodeW} height={nodeH} rx={8}
                fill={t.milestone ? "#FFFBEB" : s?.critical ? "#FEF2F2" : isGroup ? "#F8FAFC" : "white"}
                stroke={isSel ? "#4F46E5" : s?.critical ? "#EF4444" : "#CBD5E1"} strokeWidth={isSel ? 2 : 1.2}
                strokeDasharray={isGroup ? "4,2" : undefined} />
              <rect x={4} y={6} width={4} height={nodeH - 12} rx={2} fill={colorFor(t.id)} opacity={0.85} />
              <text x={16} y={20} fontSize={11.5} fontWeight={600} fill="#1E293B">{t.name.length > 15 ? t.name.slice(0, 15) + "…" : t.name}</text>
              <text x={16} y={36} fontSize={9.5} fill="#64748B">{fmtJP(s?.schedStart)} 〜 {fmtJP(s?.schedFinish)}</text>
              <text x={16} y={48} fontSize={9.5} fill={s?.critical ? "#DC2626" : "#94A3B8"}>
                {isGroup
                  ? `グループ（配下 ${countDescendantLeaves(t.id)}件）`
                  : t.milestone ? (t.milestoneMode === "fixed" ? "固定マイルストーン" : "マイルストーン") : `フロート ${s?.float ?? "-"}日`}
              </text>
              <circle cx={nodeW} cy={nodeH / 2} r={5} fill="white" stroke="#4F46E5" strokeWidth={1.5}
                style={{ cursor: "crosshair" }}
                onPointerDown={e => startLinkDrag(e, t.id, p.x + nodeW, p.y + nodeH / 2)} />
            </g>
          );
        })}
        {linkDrag && (
          <path d={`M${linkDrag.x1},${linkDrag.y1} L${linkDrag.x2},${linkDrag.y2}`}
            stroke="#4F46E5" strokeWidth={1.5} strokeDasharray="4,3" fill="none" markerEnd="url(#arrowLink)" />
        )}
      </svg>
      {edgeEdit && (
        <div style={{ position: "absolute", left: edgeEdit.x + 8, top: edgeEdit.y + 8 }} className="bg-white border border-slate-200 rounded-md shadow-lg p-2 flex items-center gap-1 z-20" onClick={e => e.stopPropagation()}>
          <select value={edgeEdit.type} onChange={e => { updateEdge(edgeEdit.from, edgeEdit.to, { type: e.target.value }); setEdgeEdit({ ...edgeEdit, type: e.target.value }); }} className="text-xs border border-slate-200 rounded px-1 py-0.5">
            {DEP_TYPES.map(dt => <option key={dt} value={dt}>{dt}</option>)}
          </select>
          <input type="number" value={edgeEdit.lag} onChange={e => { const v = parseInt(e.target.value || "0", 10); updateEdge(edgeEdit.from, edgeEdit.to, { lag: v }); setEdgeEdit({ ...edgeEdit, lag: v }); }} className="w-14 text-xs border border-slate-200 rounded px-1 py-0.5 font-mono" title="ラグ（workday）" />
          <button onClick={() => removeEdge(edgeEdit.from, edgeEdit.to)} className="text-red-500 hover:text-red-700"><Trash2 size={13} /></button>
          <button onClick={() => setEdgeEdit(null)} className="text-slate-400 hover:text-slate-700"><X size={13} /></button>
        </div>
      )}
    </div>
  );
}

/* =========================================================================================
   10. リソース ビュー
   ========================================================================================= */
function ResourceView({ resources, setResources, tasks, schedule, cal, requestConfirm }) {
  const [selRes, setSelRes] = useState(resources[0]?.id || null);
  useEffect(() => { if (!resources.find(r => r.id === selRes)) setSelRes(resources[0]?.id || null); }, [resources]);

  function update(id, patch) { setResources(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r))); }
  function add() { const id = uid("res"); setResources(prev => [...prev, { id, name: "新規担当者", weeklyCapacity: 5, monthlyCapacity: 20 }]); setSelRes(id); }
  function remove(id) {
    requestConfirm("この担当者を削除しますか？（タスクの担当は未割当になります）", () => {
      setResources(prev => prev.filter(r => r.id !== id));
    }, "削除する");
  }

  const weeklyData = useMemo(() => {
    if (!selRes) return [];
    const usage = {};
    tasks.filter(t => t.assigneeId === selRes).forEach(t => {
      const s = schedule.get(t.id);
      if (!s || !s.schedStart || t.duration <= 0) return;
      dailyLoads(cal, s.schedStart, t.duration).forEach(({ date, load }) => {
        const wk = weekKey(date);
        usage[wk] = (usage[wk] || 0) + load;
      });
    });
    const weeks = Object.keys(usage).sort();
    const cap = resources.find(r => r.id === selRes)?.weeklyCapacity || 0;
    return weeks.map(w => ({ week: w.slice(5), days: Math.round(usage[w] * 100) / 100, cap, over: usage[w] > cap + 1e-9 }));
  }, [selRes, tasks, schedule, resources, cal]);

  const capVal = resources.find(r => r.id === selRes)?.weeklyCapacity || 0;

  return (
    <div className="h-full overflow-auto p-4 space-y-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-700">担当者と稼働上限</h3>
          <IconBtn icon={Plus} label="担当者を追加" onClick={add} small />
        </div>
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">名前</th>
                <th className="text-left px-3 py-2 font-medium">週次上限（日/週）</th>
                <th className="text-left px-3 py-2 font-medium">月次上限（日/月）</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {resources.map(r => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-3 py-1.5"><input value={r.name} onChange={e => update(r.id, { name: e.target.value })} className="bg-transparent outline-none w-full" /></td>
                  <td className="px-3 py-1.5"><input type="number" min={0} max={7} value={r.weeklyCapacity} onChange={e => update(r.id, { weeklyCapacity: parseFloat(e.target.value || "0") })} className="bg-transparent outline-none w-20 font-mono" /></td>
                  <td className="px-3 py-1.5"><input type="number" min={0} value={r.monthlyCapacity} onChange={e => update(r.id, { monthlyCapacity: parseFloat(e.target.value || "0") })} className="bg-transparent outline-none w-20 font-mono" /></td>
                  <td className="px-1"><button onClick={() => remove(r.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-semibold text-slate-700">週次の稼働負荷</h3>
          <select value={selRes || ""} onChange={e => setSelRes(e.target.value)} className="text-xs border border-slate-200 rounded px-2 py-1">
            {resources.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="border border-slate-200 rounded-lg p-3" style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip formatter={(v) => [`${v} 日`, "割当日数"]} labelFormatter={l => `週: ${l}`} />
              <ReferenceLine y={capVal} stroke="#DC2626" strokeDasharray="4 3" label={{ value: "上限", position: "right", fontSize: 10, fill: "#DC2626" }} />
              <Bar dataKey="days" radius={[3, 3, 0, 0]}>
                {weeklyData.map((d, i) => <Cell key={i} fill={d.over ? "#DC2626" : "#6366F1"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">赤い破線は週次稼働上限。バーが上限を超える週は平準化スケジューリングの対象になります。</p>
      </div>
    </div>
  );
}

/* =========================================================================================
   11. スプリント ビュー
   ========================================================================================= */
function SprintsView({ sprints, setSprints, tasks, requestConfirm }) {
  function update(id, patch) { setSprints(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s))); }
  function add() {
    const id = uid("sprint");
    const today = toISO(new Date());
    setSprints(prev => [
      ...prev,
      { id, name: `Sprint ${prev.length + 1}`, theme: "", startDate: today, endDate: cal_addDaysISO(today, 6), order: prev.length },
    ]);
  }
  function remove(id) {
    requestConfirm("このスプリントを削除しますか？（紐付いていたタスクは未割当になります）", () => {
      setSprints(prev => prev.filter(s => s.id !== id));
    }, "削除する");
  }

  const taskCountOf = useMemo(() => {
    const m = new Map();
    tasks.forEach(t => (t.sprintIds || []).forEach(id => m.set(id, (m.get(id) || 0) + 1)));
    return m;
  }, [tasks]);

  const overlapIds = useMemo(() => computeOverlappingSprintIds(sprints), [sprints]);

  // タイムライン表示用のスケール（全スプリントの最短開始日〜最長終了日を1本の軸にする）。
  const { minDate, maxDate } = useMemo(() => {
    const withDates = sprints.filter(s => s.startDate && s.endDate);
    if (!withDates.length) return { minDate: null, maxDate: null };
    let mn = withDates[0].startDate, mx = withDates[0].endDate;
    withDates.forEach(s => { if (s.startDate < mn) mn = s.startDate; if (s.endDate > mx) mx = s.endDate; });
    return { minDate: mn, maxDate: mx };
  }, [sprints]);
  const dayWidth = 10;
  const totalDays = minDate ? Math.max(1, Math.round((parseISO(maxDate) - parseISO(minDate)) / 86400000) + 1) : 0;
  const timelineWidth = totalDays * dayWidth;
  const xOf = makeDateScale(minDate, dayWidth);

  return (
    <div className="h-full overflow-auto p-4 space-y-6">
      {overlapIds.size > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 rounded-lg flex items-center gap-2">
          <AlertTriangle size={13} className="flex-shrink-0" />
          期間が重なっているスプリントがあります。保存はできますが、内容を確認してください。
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-700">スプリント一覧</h3>
          <IconBtn icon={Plus} label="スプリントを追加" onClick={add} small />
        </div>
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium w-32">名称</th>
                <th className="text-left px-3 py-2 font-medium">テーマ</th>
                <th className="text-left px-3 py-2 font-medium w-32">開始日</th>
                <th className="text-left px-3 py-2 font-medium w-32">終了日</th>
                <th className="text-left px-3 py-2 font-medium w-20">タスク数</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {sprints.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400 py-6">スプリントはまだありません</td></tr>}
              {sprints.map(sp => {
                const overlapping = overlapIds.has(sp.id);
                const invalidRange = sp.startDate && sp.endDate && sp.startDate > sp.endDate;
                return (
                  <tr key={sp.id} className={"border-t border-slate-100" + (overlapping || invalidRange ? " bg-amber-50/60" : "")}>
                    <td className="px-3 py-1.5">
                      <input value={sp.name} onChange={e => update(sp.id, { name: e.target.value })}
                        className="bg-transparent outline-none w-full font-medium" />
                    </td>
                    <td className="px-3 py-1.5">
                      <input value={sp.theme || ""} onChange={e => update(sp.id, { theme: e.target.value })}
                        placeholder="このスプリントのテーマ（任意）"
                        className="bg-transparent outline-none w-full placeholder-slate-300" />
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="date" value={sp.startDate || ""} onChange={e => update(sp.id, { startDate: e.target.value })}
                        className="bg-transparent outline-none w-full font-mono" />
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1">
                        <input type="date" value={sp.endDate || ""} onChange={e => update(sp.id, { endDate: e.target.value })}
                          className="bg-transparent outline-none w-full font-mono" />
                        {(overlapping || invalidRange) && (
                          <span title={invalidRange ? "終了日が開始日より前になっています" : "他のスプリントと期間が重なっています"}>
                            <AlertTriangle size={12} className="text-amber-500 flex-shrink-0" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-slate-500">{taskCountOf.get(sp.id) || 0}件</td>
                    <td className="px-1"><button onClick={() => remove(sp.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={13} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">開始日・終了日は自由に入力できます（目安は1週間）。グループ（サマリータスク）にはスプリントを設定できません。</p>
      </div>

      {sprints.length > 0 && minDate && (
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">スプリント タイムライン</h3>
          <div className="border border-slate-200 rounded-lg p-3 overflow-x-auto">
            <div style={{ marginLeft: 100, width: timelineWidth, display: "flex", justifyContent: "space-between" }} className="text-[9px] font-mono text-slate-400 pb-1 border-b border-slate-100 mb-1">
              <span>{fmtMD(minDate)}</span>
              <span>{fmtMD(maxDate)}</span>
            </div>
            {sprints.map(sp => {
              if (!sp.startDate || !sp.endDate || sp.startDate > sp.endDate) return null;
              const c = sprintColorForId(sp.id);
              const x = xOf(sp.startDate), w = Math.max(2, xOf(sp.endDate) + dayWidth - x);
              return (
                <div key={sp.id} className="flex items-center" style={{ height: 26 }}>
                  <div style={{ width: 100, color: c.text }} className="text-[11px] flex-shrink-0 truncate font-medium">{sp.name}</div>
                  <div style={{ position: "relative", width: timelineWidth, height: 18, background: "#F8FAFC", borderRadius: 4, flexShrink: 0 }}>
                    <div title={sp.theme || sp.name} style={{ position: "absolute", left: x, width: w, top: 0, height: 18, background: c.band, border: `1px solid ${c.tagBorder}`, borderRadius: 4 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================================
   12. バージョン管理・比較ビュー
   ========================================================================================= */
function VersionsView({ versions, onSave, onDelete, onRename, onRestore, resources }) {
  const [checked, setChecked] = useState([]);
  const [name, setName] = useState("");

  function toggle(id) { setChecked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); }

  const selected = versions.filter(v => checked.includes(v.id));
  const allTaskIds = useMemo(() => {
    const map = new Map();
    selected.forEach(v => v.tasks.forEach(t => { if (!map.has(t.id)) map.set(t.id, t.name); }));
    return Array.from(map.entries());
  }, [selected]);

  const { minDate, maxDate } = useMemo(() => {
    let mn = null, mx = null;
    selected.forEach(v => v.tasks.forEach(t => {
      if (!t.schedStart) return;
      if (!mn || t.schedStart < mn) mn = t.schedStart;
      if (!mx || t.schedFinish > mx) mx = t.schedFinish;
    }));
    return { minDate: mn || toISO(new Date()), maxDate: mx || toISO(new Date()) };
  }, [selected]);

  const dayWidth = 8;
  const totalDays = Math.max(1, Math.round((parseISO(maxDate) - parseISO(minDate)) / 86400000) + 3);
  const chartWidth = totalDays * dayWidth;
  const xOf = makeDateScale(minDate, dayWidth);
  const colors = ["#6366F1", "#F59E0B", "#10B981", "#EC4899", "#0EA5E9", "#8B5CF6"];

  return (
    <div className="h-full overflow-auto p-4 space-y-5">
      <div className="flex items-center gap-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="バージョン名（例: 初期計画）" className="text-xs border border-slate-200 rounded px-2 py-1.5 w-56" />
        <IconBtn icon={Save} label="現在のスケジュールを保存" onClick={() => { onSave(name || `バージョン ${versions.length + 1}`); setName(""); }} small />
      </div>

      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="w-8" />
              <th className="text-left px-3 py-2 font-medium">名前</th>
              <th className="text-left px-3 py-2 font-medium">保存日時</th>
              <th className="text-left px-3 py-2 font-medium">タスク数</th>
              <th className="text-left px-3 py-2 font-medium">完了予定</th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {versions.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400 py-6">保存されたバージョンはありません</td></tr>}
            {versions.map(v => {
              const end = v.tasks.reduce((mx, t) => (t.schedFinish && t.schedFinish > mx ? t.schedFinish : mx), "");
              return (
                <tr key={v.id} className="border-t border-slate-100">
                  <td className="px-2 py-1.5"><input type="checkbox" checked={checked.includes(v.id)} onChange={() => toggle(v.id)} /></td>
                  <td className="px-3 py-1.5">
                    <input
                      value={v.name}
                      onChange={e => onRename(v.id, e.target.value)}
                      title="クリックしてバージョン名を変更"
                      className="bg-transparent outline-none w-full rounded px-1 py-0.5 -mx-1 hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-indigo-300"
                    />
                  </td>
                  <td className="px-3 py-1.5 font-mono text-slate-500">{new Date(v.createdAt).toLocaleString("ja-JP")}</td>
                  <td className="px-3 py-1.5 font-mono">{v.tasks.length}</td>
                  <td className="px-3 py-1.5 font-mono">{fmtJP(end)}</td>
                  <td className="px-1">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onRestore(v.id)}
                        disabled={!v.hasFullSnapshot}
                        title={v.hasFullSnapshot ? "現在のタスク・担当者をこのバージョンの状態に戻します" : "古い形式で保存されたバージョンのため復元できません"}
                        className={v.hasFullSnapshot ? "text-slate-300 hover:text-indigo-600" : "text-slate-200 cursor-not-allowed"}
                      >
                        <RotateCcw size={13} />
                      </button>
                      <button onClick={() => onDelete(v.id)} title="削除" className="text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1"><ArrowLeftRight size={14} />バージョン比較</h3>
            {selected.map((v, i) => (
              <span key={v.id} className="flex items-center gap-1 text-[11px] text-slate-500">
                <span style={{ width: 10, height: 10, background: colors[i % colors.length], display: "inline-block", borderRadius: 2 }} />{v.name}
              </span>
            ))}
          </div>
          <div className="border border-slate-200 rounded-lg overflow-auto">
            <div style={{ width: chartWidth + 220 }}>
              {allTaskIds.map(([id, name]) => (
                <div key={id} className="flex items-center border-b border-slate-50" style={{ height: 26 }}>
                  <div style={{ width: 220 }} className="text-[11px] text-slate-600 truncate px-2 flex-shrink-0">{name}</div>
                  <svg width={chartWidth} height={26}>
                    {selected.map((v, vi) => {
                      const t = v.tasks.find(x => x.id === id);
                      if (!t || !t.schedStart) return null;
                      const x1 = xOf(t.schedStart), x2 = xOf(t.schedFinish) + dayWidth;
                      const y = 4 + vi * 6;
                      return <rect key={v.id} x={x1} y={y} width={Math.max(2, x2 - x1)} height={4} fill={colors[vi % colors.length]} opacity={0.9} rx={1} />;
                    })}
                  </svg>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================================
   12. アプリ本体
   ========================================================================================= */
export default function App() {
  const seed = useMemo(() => seedData(), []);
  const [tasks, setTasks] = useState(seed.tasks);
  const [resources, setResources] = useState(seed.resources);
  const [sprints, setSprints] = useState(seed.sprints);
  const [versions, setVersions] = useState([]);
  const [tab, setTab] = useState("gantt");
  const [selectedId, setSelectedId] = useState(null);
  const [collapsed, setCollapsed] = useState(new Set());
  const [dayWidth, setDayWidth] = useState(20);
  const [colWidths, setColWidths] = useState(DEFAULT_WBS_COLS);
  // 「自動スケジューリング実行」によって開始日が実際に変化したタスクIDの集合。
  // 該当タスクの開始日欄のみボールド表示し、次に tasks/resources/sprints のいずれかが
  // 変化する操作が行われたら解除する（その変化がこの集合設定自体によるもの＝
  // runScheduling による書き戻しの場合はスキップする）。
  const [autoScheduleHighlightIds, setAutoScheduleHighlightIds] = useState(() => new Set());
  const skipHighlightClearRef = useRef(false);
  const [baselineVersionId, setBaselineVersionId] = useState(null);
  const [levelingOn, setLevelingOn] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState(null);
  const fileInputRef = useRef(null);
  const [confirmState, setConfirmState] = useState(null); // { message, confirmLabel, danger, onConfirm }
  const [sprintConflictOpen, setSprintConflictOpen] = useState(false);
  // window.confirm はアーティファクトのサンドボックス化された iframe 内では許可されず
  // 常に false を返す（＝何も起きない）ことがあるため、自前の確認モーダルを使う。
  function requestConfirm(message, onConfirm, confirmLabel = "実行する", danger = true) {
    setConfirmState({ message, onConfirm, confirmLabel, danger });
  }

  const projectStart = useMemo(() => {
    const dates = tasks.filter(t => t.startDate).map(t => t.startDate);
    return dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : toISO(new Date());
  }, [tasks]);

  const holidayMap = useMemo(() => {
    const y = parseISO(projectStart).getUTCFullYear();
    return buildHolidayMap(y - 1, y + 6);
  }, [projectStart]);
  const cal = useMemo(() => makeCalendar(holidayMap), [holidayMap]);

  const cpm = useMemo(() => runCPM(tasks, cal, projectStart, sprints), [tasks, cal, projectStart, sprints]);

  const { schedule, levelWarnings } = useMemo(() => {
    if (!levelingOn) return { schedule: cpm.result, levelWarnings: [] };
    const { placed, warnings } = levelResources(tasks, cpm.result, resources, cal, sprints);
    const merged = new Map(cpm.result);
    for (const [id, dates] of Object.entries(placed)) {
      const prev = merged.get(id) || {};
      merged.set(id, { ...prev, schedStart: dates.start, schedFinish: dates.finish });
    }
    // サマリー行の再ロールアップ（runCPM と同じロジックを共有、進捗率は子タスクの単純平均）
    rollupSummaries(tasks, merged);
    return { schedule: merged, levelWarnings: warnings };
  }, [levelingOn, cpm, tasks, resources, cal, sprints]);

  const projectEnd = useMemo(() => {
    let mx = cpm.projectEnd;
    schedule.forEach(v => { if (v.schedFinish && v.schedFinish > mx) mx = v.schedFinish; });
    return mx;
  }, [schedule, cpm]);

  // 初回ロード
  useEffect(() => {
    (async () => {
      const proj = await storageGet("pm_project");
      if (proj && proj.tasks && proj.tasks.length) {
        setTasks(migrateSprintIds(proj.tasks));
        setResources(proj.resources || seed.resources);
        // 旧バージョンのデータ（sprints未対応）を開いた場合は空配列にフォールバックする。
        setSprints(Array.isArray(proj.sprints) ? proj.sprints : []);
      }
      const vs = await storageGet("pm_versions");
      if (vs) setVersions(vs);
      setLoaded(true);
    })();
    // eslint-disable-next-line
  }, []);

  // 自動スケジューリング実行によるボールド表示は、次に何らかの編集操作が行われたら解除する。
  // runScheduling 自身が行う書き戻し（setTasks）による変化はここでスキップする。
  useEffect(() => {
    if (skipHighlightClearRef.current) {
      skipHighlightClearRef.current = false;
      return;
    }
    setAutoScheduleHighlightIds(prev => (prev.size ? new Set() : prev));
  }, [tasks, resources, sprints]);

  // 自動保存
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => { storageSet("pm_project", { tasks, resources, sprints }); }, 800);
    return () => clearTimeout(t);
  }, [tasks, resources, sprints, loaded]);

  // バージョン名の変更などによる versions の更新も自動保存する
  // （新規保存・削除は即時persistしているため、これは主に名称変更のためのデバウンス保存）。
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => { storageSet("pm_versions", versions); }, 800);
    return () => clearTimeout(t);
  }, [versions, loaded]);

  function renameVersion(id, newName) {
    setVersions(prev => prev.map(v => (v.id === id ? { ...v, name: newName } : v)));
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2600); }

  // 通常表示時（cpm useMemo）は手入力済みの開始日を固定の起点として扱い、依存関係による
  // 自動的な後ろ倒しをしない。このボタンを押したときだけ、開始日の入力有無に関わらず
  // 純粋な依存関係ベースのCPM結果を計算し、全リーフタスクの開始日にその結果を書き戻す。
  function runScheduling() {
    const auto = runCPM(tasks, cal, projectStart, sprints, { respectManualPins: false });
    const changedIds = new Set();
    setTasks(prev => prev.map(t => {
      if (isGroupId(tasks, t.id)) return t;
      const s = auto.result.get(t.id);
      if (!s || !s.schedStart || s.isSummary) return t;
      if (t.startDate !== s.schedStart) changedIds.add(t.id);
      return { ...t, startDate: s.schedStart };
    }));
    skipHighlightClearRef.current = true;
    setAutoScheduleHighlightIds(changedIds);
    showToast(levelingOn ? "リソース平準化を考慮して再スケジューリングしました" : "依存関係に基づき再スケジューリングしました");
  }

  async function saveVersion(name) {
    // WBS番号は折りたたみ状態に依存して欠番が出るため、保存時は必ず全展開の状態で採番する
    // （WBS/ガント側で指定バージョンとの比較を行う際、WBS番号で突き合わせるために必要）。
    const flatAll = buildFlatList(tasks, new Set());
    const snapshotTasks = flatAll.map(t => {
      const s = schedule.get(t.id) || {};
      return {
        id: t.id, name: t.name, level: t.level, wbsNo: t.wbsNo, hasChildren: t.hasChildren,
        schedStart: s.schedStart, schedFinish: s.schedFinish, critical: !!s.critical, milestone: !!t.milestone,
        duration: t.duration, assigneeId: t.assigneeId || null,
        progress: typeof s.progress === "number" ? s.progress : 0,
      };
    });
    const v = {
      id: uid("v"), name, createdAt: Date.now(), tasks: snapshotTasks, hasWbsInfo: true,
      // 「指定バージョンに戻す」機能のためのフル復元用スナップショット（依存関係・階層・
      // 開始日など、表示用の snapshotTasks には含まれない情報も含む生の tasks/resources）。
      rawTasks: JSON.parse(JSON.stringify(tasks)),
      rawResources: JSON.parse(JSON.stringify(resources)),
      rawSprints: JSON.parse(JSON.stringify(sprints)),
      hasFullSnapshot: true,
    };
    const next = [v, ...versions];
    setVersions(next);
    await storageSet("pm_versions", next);
    showToast(`バージョン「${name}」を保存しました`);
  }
  async function deleteVersion(id) {
    const next = versions.filter(v => v.id !== id);
    setVersions(next);
    await storageSet("pm_versions", next);
    setBaselineVersionId(prev => (prev === id ? null : prev));
  }
  function restoreVersion(id) {
    const v = versions.find(x => x.id === id);
    if (!v) return;
    if (!v.hasFullSnapshot) {
      showToast("このバージョンは復元に対応していません（古い形式で保存されています）");
      return;
    }
    requestConfirm(
      `現在の内容を破棄し、バージョン「${v.name}」（${new Date(v.createdAt).toLocaleString("ja-JP")}）の状態に戻します。よろしいですか？`,
      () => {
        setTasks(migrateSprintIds(JSON.parse(JSON.stringify(v.rawTasks))));
        setResources(JSON.parse(JSON.stringify(v.rawResources)));
        setSprints(Array.isArray(v.rawSprints) ? JSON.parse(JSON.stringify(v.rawSprints)) : []);
        setSelectedId(null);
        showToast(`バージョン「${v.name}」の状態に戻しました`);
      },
      "元に戻す",
      false
    );
  }

  function exportProject() {
    const data = { schemaVersion: 1, exportedAt: new Date().toISOString(), tasks, resources, sprints, versions };
    downloadJSON(`project-scheduler_${toISO(new Date())}.json`, data);
    showToast("プロジェクトをJSONファイルに書き出しました");
  }
  async function copyMermaidGantt() {
    const text = generateMermaidGantt(tasks, schedule);
    try {
      await copyTextToClipboard(text);
      showToast("Mermaid記法のガントチャートをクリップボードにコピーしました");
    } catch (e) {
      showToast("クリップボードへのコピーに失敗しました");
    }
  }
  function triggerImport() { fileInputRef.current && fileInputRef.current.click(); }
  async function handleImportFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // 同じファイルを続けて選択できるようリセット
    if (!file) return;
    let data;
    try {
      const text = await file.text();
      data = JSON.parse(text);
    } catch (err) {
      showToast("読み込みに失敗しました（JSONを解析できません）");
      return;
    }
    if (!data || !Array.isArray(data.tasks) || !Array.isArray(data.resources)) {
      showToast("読み込みに失敗しました（ファイル形式が正しくありません）");
      return;
    }
    requestConfirm("現在のタスク・担当者を、読み込んだ内容で置き換えます。よろしいですか？", async () => {
      setTasks(migrateSprintIds(data.tasks));
      setResources(data.resources);
      setSprints(Array.isArray(data.sprints) ? data.sprints : []);
      setSelectedId(null);
      if (Array.isArray(data.versions) && data.versions.length) {
        const merged = (() => {
          const map = new Map(versions.map(v => [v.id, v]));
          data.versions.forEach(v => map.set(v.id, v));
          return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
        })();
        setVersions(merged);
        await storageSet("pm_versions", merged);
      }
      showToast("JSONファイルからプロジェクトを読み込みました");
    }, "読み込む", false);
  }

  const criticalCount = useMemo(() => { let c = 0; schedule.forEach(v => { if (v.critical && !v.isSummary) c++; }); return c; }, [schedule]);

  // タスクに設定されたスプリントの期間と、実際に計算されたスケジュールとの矛盾を検出する。
  // 依存関係・固定マイルストーンの日程は常に優先されるため（スプリントは開始日側の下限としてのみ
  // 考慮される）、ここで見つかる矛盾は「スプリント期間に収めようとしたが、依存関係や固定マイルストーンの
  // 都合でそれが叶わなかったタスク」を意味する＝ユーザーに通知すべき内容。
  const sprintConflicts = useMemo(() => {
    if (!sprints.length) return [];
    const sprintById = {}; sprints.forEach(s => (sprintById[s.id] = s));
    const wbsNoById = {}; buildFlatList(tasks, new Set()).forEach(t => (wbsNoById[t.id] = t.wbsNo));
    const out = [];
    tasks.forEach(t => {
      const ids = t.sprintIds || [];
      if (!ids.length) return;
      if (isGroupId(tasks, t.id)) return; // グループにはスプリントを紐付けない
      // 複数スプリントが紐付いている場合は、それらの期間の和集合（最も早い開始日〜最も遅い終了日）に
      // 収まっているかを判定する（タスクが複数スプリントにまたがること自体は許容するため）。
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
  }, [tasks, sprints, schedule]);

  return (
    <div className="flex flex-col bg-slate-50 text-slate-800 ps-app-root" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <style>{`.ps-app-root { height: 100vh; height: 100dvh; width: 100%; }`}</style>
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-slate-200 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-indigo-600 flex items-center justify-center text-white"><GitBranch size={15} /></div>
          <span className="font-semibold text-sm tracking-tight">Project Scheduler</span>
        </div>
        <div className="flex-1" />
        <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleImportFile} style={{ display: "none" }} />
        <IconBtn icon={Upload} label="読み込み" onClick={triggerImport} small />
        <IconBtn icon={Download} label="書き出し" onClick={exportProject} small />
        <IconBtn icon={Copy} label="Mermaidコピー" onClick={copyMermaidGantt} small />
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <label className="flex items-center gap-1.5 text-xs text-slate-500 mr-1">
          <input type="checkbox" checked={levelingOn} onChange={e => setLevelingOn(e.target.checked)} />
          リソース平準化を有効にする
        </label>
        <IconBtn icon={Play} label="自動スケジューリング実行" onClick={runScheduling} />
        {sprintConflicts.length > 0 && (
          <button
            onClick={() => setSprintConflictOpen(true)}
            title={`スプリントの期間と矛盾しているタスクが${sprintConflicts.length}件あります（クリックで詳細を表示）`}
            className="w-6 h-6 -ml-1.5 flex items-center justify-center rounded-md text-amber-600 hover:bg-amber-50"
          >
            <AlertTriangle size={15} />
          </button>
        )}
        <div className="text-xs font-mono text-slate-500 flex items-center gap-1 border-l border-slate-200 pl-3 ml-1">
          <Clock size={13} /> 完了予定 {fmtJP(projectEnd)}
        </div>
        <div className={"text-xs font-mono flex items-center gap-1 " + (criticalCount ? "text-red-600" : "text-slate-400")}>
          <AlertTriangle size={13} /> クリティカル {criticalCount}
        </div>
      </div>

      {levelWarnings.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-xs px-4 py-1.5 flex items-center gap-2">
          <AlertTriangle size={13} className="flex-shrink-0" />
          <span>{levelWarnings.join(" / ")}</span>
        </div>
      )}

      <div className="flex bg-white border-b border-slate-200 px-3">
        <Tab icon={Table2} label="WBS / ガント" active={tab === "gantt"} onClick={() => setTab("gantt")} />
        <Tab icon={GitBranch} label="ネットワーク図" active={tab === "network"} onClick={() => setTab("network")} />
        <Tab icon={Users} label="リソース" active={tab === "resource"} onClick={() => setTab("resource")} />
        <Tab icon={CalendarRange} label="スプリント" active={tab === "sprints"} onClick={() => setTab("sprints")} count={sprints.length || null} />
        <Tab icon={History} label="バージョン" active={tab === "versions"} onClick={() => setTab("versions")} count={versions.length || null} />
      </div>

      <div className="flex-1 min-h-0">
        {tab === "gantt" && (
          <WBSGanttView
            tasks={tasks} setTasks={setTasks} resources={resources} sprints={sprints} cal={cal}
            schedule={schedule} projectEnd={projectEnd}
            selectedId={selectedId} setSelectedId={setSelectedId}
            collapsed={collapsed} setCollapsed={setCollapsed}
            dayWidth={dayWidth} setDayWidth={setDayWidth}
            colWidths={colWidths} setColWidths={setColWidths}
            versions={versions} baselineVersionId={baselineVersionId} setBaselineVersionId={setBaselineVersionId}
            requestConfirm={requestConfirm}
            autoScheduleHighlightIds={autoScheduleHighlightIds}
            onSaveVersion={saveVersion}
          />
        )}
        {tab === "network" && (
          <NetworkView tasks={tasks} setTasks={setTasks} schedule={schedule} selectedId={selectedId} setSelectedId={setSelectedId} />
        )}
        {tab === "resource" && (
          <ResourceView resources={resources} setResources={setResources} tasks={tasks} schedule={schedule} cal={cal} requestConfirm={requestConfirm} />
        )}
        {tab === "sprints" && (
          <SprintsView sprints={sprints} setSprints={setSprints} tasks={tasks} requestConfirm={requestConfirm} />
        )}
        {tab === "versions" && (
          <VersionsView versions={versions} onSave={saveVersion} onDelete={deleteVersion} onRename={renameVersion} onRestore={restoreVersion} resources={resources} />
        )}
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 bg-slate-900 text-white text-xs px-3.5 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50">
          <Check size={13} className="text-emerald-400" /> {toast}
        </div>
      )}
      {confirmState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setConfirmState(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-slate-700 mb-5 whitespace-pre-wrap">{confirmState.message}</p>
            <div className="flex justify-end gap-2">
              <IconBtn label="キャンセル" onClick={() => setConfirmState(null)} small />
              <IconBtn
                label={confirmState.confirmLabel}
                danger={confirmState.danger}
                active={!confirmState.danger}
                small
                onClick={() => { const fn = confirmState.onConfirm; setConfirmState(null); fn && fn(); }}
              />
            </div>
          </div>
        </div>
      )}
      {sprintConflictOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setSprintConflictOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-700">
                <AlertTriangle size={15} />
                スプリントとの矛盾（{sprintConflicts.length}件）
              </div>
              <button onClick={() => setSprintConflictOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto">
              <p className="text-xs text-slate-500">
                依存関係や固定マイルストーンの日程が優先されるため、割り当てられたスプリントの期間内に収まらなかったタスクです。
              </p>
              {sprintConflicts.map(c => (
                <div key={c.taskId} className="border border-amber-200 bg-amber-50 rounded-lg px-3 py-2">
                  <div className="text-xs font-medium text-slate-700">
                    {c.wbsNo && <span className="font-mono text-slate-400 mr-1">{c.wbsNo}</span>}
                    {c.name}
                    <span className="ml-1 text-slate-400 font-normal">（{c.sprintName}）</span>
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {c.reasons.map((r, i) => (
                      <li key={i} className="text-[11px] text-amber-700">・{r}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-100 flex-shrink-0">
              <IconBtn label="閉じる" onClick={() => setSprintConflictOpen(false)} small />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
