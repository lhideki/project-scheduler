import { toISO, parseISO, weekKey, monthKey, cal_addDaysISO } from "./calendar.js";

/* =========================================================================================
   工数の日別割当（リソース平準化で担当者の稼働上限に合わせてタスク期間を延長する）
   ------------------------------------------------------------------------------------------
   開始候補日から早い日順に、担当者の空き容量（日次・週次・月次の各上限の残り）の範囲で工数を
   日ごとに割り当てる。途中に割当のない稼働日を挟んでもよい（タスク途中の中断を一律に許可する）。
   容量は 100万分の1人日を1単位とする整数で管理し、日別割当の値もこの単位の整数から求める
   （台帳と日別割当の単位を揃え、浮動小数の誤差で上限判定や合計がずれないようにする。工数の入力は
   UI 上 0.01人日単位に丸められるが、JSON・CLI からはより細かい値も入りうる）。
   ========================================================================================= */

/** 容量管理の単位（1人日 = 1,000,000単位 = 100万分の1人日刻み）。 */
export const ALLOCATION_UNITS_PER_DAY = 1000000;
/** 1人が1日に割り当てられる上限（人日）。同じ担当者が同じ日に複数タスクで合計1人日を超えないようにする。 */
export const DAILY_CAPACITY = 1;
/** 1タスクの割当を探索する稼働日数の上限。これを超えても割り当てきれない場合は割当不成立とする。 */
export const ALLOCATION_SEARCH_WORKDAYS = 2000;

/**
 * @typedef {Object} DailyAllocation
 * @property {string} date - 割当日（YYYY-MM-DD、稼働日）
 * @property {number} load - その日に割り当てた工数（人日）
 * @property {"daily"|"weekly"|"monthly"} [limitedBy] - 上限により1人日未満しか割り当てられなかった日の理由
 */

/**
 * @typedef {Object} IdleDay
 * タスク期間内で、稼働日なのに担当者の稼働上限により割当がなかった日。
 * @property {string} date
 * @property {"daily"|"weekly"|"monthly"} reason - daily: 他タスクでその日の1人日が埋まっている / weekly・monthly: 週次・月次上限に到達
 * @property {string[]} [taskIds] - reason が daily のとき、その日を埋めている他タスクのID
 */

/**
 * @typedef {Object} TaskAllocation
 * 表示スケジュールのリーフに載せる日別割当（ScheduleEntry.allocation）。
 * @property {DailyAllocation[]} alloc - 日付昇順
 * @property {IdleDay[]} idle - 日付昇順（非稼働日は含まない。非稼働日はカレンダーから求める）
 * @property {boolean} [overCapacity] - 稼働上限内に割り当てきれず、連続配置に戻して上限超過のまま登録したか
 */

const toUnits = (days) => Math.round(days * ALLOCATION_UNITS_PER_DAY);

/**
 * 工数（人日、小数可）を開始日からの連続する稼働日へ配分する（稼働上限を考慮しない配置）。
 * 満日を1.0人日、端数が残る最終日のみ端数分を割り当てる（例: 2.5人日 → 1.0 / 1.0 / 0.5）。
 * 平準化OFF時の表示・担当者未設定のタスク・割当不成立時のフォールバックで使う。
 * @param {import("./calendar.js").Calendar} cal
 * @param {string} startStr
 * @param {number} duration
 * @returns {DailyAllocation[]}
 */
export function dailyLoads(cal, startStr, duration) {
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

/**
 * 担当者ごとの割当済み容量（日・週・月）を保持する台帳を作る。levelResources の1回の計算ごとに1つ使う。
 * @returns {{usage: Map<string, {day: Map<string, number>, week: Map<string, number>, month: Map<string, number>, owners: Map<string, string[]>}>}}
 */
export function createCapacityLedger() {
  return { usage: new Map() };
}

function usageOf(ledger, assigneeId) {
  let u = ledger.usage.get(assigneeId);
  if (!u) {
    u = { day: new Map(), week: new Map(), month: new Map(), owners: new Map() };
    ledger.usage.set(assigneeId, u);
  }
  return u;
}

/** 上限値の単位換算。0・未設定（falsy）は「その上限を適用しない」（従来の平準化と同じ扱い）。 */
function capUnits(capacity) {
  return capacity ? toUnits(capacity) : Infinity;
}

/**
 * 開始日から早い日順に、担当者の空き容量の範囲で工数を日別に割り当てる（台帳には登録しない）。
 * 各稼働日の割当量は「残工数・日次の残り・週次の残り・月次の残り」の最小値。割当が0の稼働日は
 * その原因（日次=他タスクで埋まっている／週次／月次）を idle に記録する。pinned が false のときは
 * 最初に割り当てた日より前の日は記録しない（タスクの開始日は最初の割当日になるため）。
 * pinned が true のとき（着手済みで開始日を固定する場合）は、開始日からの非割当日を記録する。
 * @param {ReturnType<typeof createCapacityLedger>} ledger
 * @param {import("./taskTree.js").Resource} resource
 * @param {import("./calendar.js").Calendar} cal
 * @param {string} startStr - 探索開始日（非稼働日なら次の稼働日から）
 * @param {number} duration - 工数（人日）
 * @param {{pinned?: boolean}} [opts]
 * @returns {{ok: boolean, alloc: DailyAllocation[], idle: IdleDay[]}} ok: 探索上限内に全工数を割り当てられたか
 */
export function allocateWork(ledger, resource, cal, startStr, duration, opts = {}) {
  const pinned = !!opts.pinned;
  const u = usageOf(ledger, resource.id);
  const weekCap = capUnits(resource.weeklyCapacity);
  const monthCap = capUnits(resource.monthlyCapacity);
  const dayCap = toUnits(DAILY_CAPACITY);
  // このタスク自身が同じ週・月に割り当てた分（台帳へ登録する前なので別に数える）
  const selfWeek = new Map(), selfMonth = new Map();
  // 1単位未満の工数も1単位として扱い、割当が空にならないようにする
  let remaining = Math.max(1, toUnits(duration));
  const alloc = [], idle = [];
  let d = cal.snapForward(startStr);
  let scanned = 0;
  // 稼働日がまったく無いカレンダーでも無限ループしないよう、暦日数にも上限を設ける
  for (let guard = 0; remaining > 0 && scanned < ALLOCATION_SEARCH_WORKDAYS && guard < ALLOCATION_SEARCH_WORKDAYS * 7; guard++) {
    if (cal.isWorkdayStr(d)) {
      scanned++;
      const wk = weekKey(d), mo = monthKey(d);
      const dayFree = dayCap - (u.day.get(d) || 0);
      const weekFree = weekCap - (u.week.get(wk) || 0) - (selfWeek.get(wk) || 0);
      const monthFree = monthCap - (u.month.get(mo) || 0) - (selfMonth.get(mo) || 0);
      const units = Math.min(remaining, dayFree, weekFree, monthFree);
      if (units > 0) {
        remaining -= units;
        selfWeek.set(wk, (selfWeek.get(wk) || 0) + units);
        selfMonth.set(mo, (selfMonth.get(mo) || 0) + units);
        // 日別割当の値は台帳と同じ単位の整数から求める（commitAllocation で同じ量が登録される）
        const entry = { date: d, load: units / ALLOCATION_UNITS_PER_DAY };
        if (remaining > 0 && units < dayCap) entry.limitedBy = units === dayFree ? "daily" : units === weekFree ? "weekly" : "monthly";
        alloc.push(entry);
      } else if (alloc.length || pinned) {
        const reason = dayFree <= 0 ? "daily" : weekFree <= 0 ? "weekly" : "monthly";
        const day = { date: d, reason };
        if (reason === "daily") day.taskIds = [...(u.owners.get(d) || [])];
        idle.push(day);
      }
    }
    d = cal_addDaysISO(d, 1);
  }
  return { ok: remaining <= 0, alloc, idle };
}

/**
 * 日別割当を台帳に登録する（以降のタスクの割当で、この担当者の空き容量から差し引かれる）。
 * @param {ReturnType<typeof createCapacityLedger>} ledger
 * @param {string} assigneeId
 * @param {string} taskId
 * @param {DailyAllocation[]} alloc
 */
export function commitAllocation(ledger, assigneeId, taskId, alloc) {
  const u = usageOf(ledger, assigneeId);
  alloc.forEach(({ date, load }) => {
    const units = toUnits(load);
    if (units <= 0) return;
    const wk = weekKey(date), mo = monthKey(date);
    u.day.set(date, (u.day.get(date) || 0) + units);
    u.week.set(wk, (u.week.get(wk) || 0) + units);
    u.month.set(mo, (u.month.get(mo) || 0) + units);
    const owners = u.owners.get(date) || [];
    if (!owners.includes(taskId)) u.owners.set(date, [...owners, taskId]);
  });
}

/**
 * 日付昇順の日付配列を、暦日で連続する区間にまとめる（ガントの網掛けを区間ごとに描くため）。
 * @param {string[]} dates
 * @returns {{start: string, end: string}[]}
 */
export function consecutiveDateRuns(dates) {
  const runs = [];
  dates.forEach(date => {
    const last = runs[runs.length - 1];
    if (last && cal_addDaysISO(last.end, 1) === date) last.end = date;
    else runs.push({ start: date, end: date });
  });
  return runs;
}

/**
 * 非割当日を、理由が同じで間に割当日を挟まない区間にまとめる（ツールチップ表示用）。
 * 非稼働日（土日・祝日・休日）は割当の有無に関係しないため、区間の途中に挟まっていてもつなげる
 * （例: 週次上限で水〜金と翌月曜が非割当なら1区間）。reason が daily の場合は埋めているタスクIDを合算する。
 * @param {IdleDay[]} idle
 * @param {DailyAllocation[]} alloc
 * @returns {{start: string, end: string, days: number, reason: IdleDay["reason"], taskIds: string[]}[]}
 */
export function idleSegments(idle, alloc) {
  const allocDates = (alloc || []).map(a => a.date);
  const segments = [];
  (idle || []).forEach(day => {
    const last = segments[segments.length - 1];
    const allocatedBetween = last && allocDates.some(date => date > last.end && date < day.date);
    if (last && last.reason === day.reason && !allocatedBetween) {
      last.end = day.date;
      last.days++;
      (day.taskIds || []).forEach(id => { if (!last.taskIds.includes(id)) last.taskIds.push(id); });
    } else {
      segments.push({ start: day.date, end: day.date, days: 1, reason: day.reason, taskIds: [...(day.taskIds || [])] });
    }
  });
  return segments;
}

/**
 * 進捗率（工数に対する割合）が、日別割当のどの日のどこまで到達しているかを求める。
 * ガントの進捗塗りと稲妻線の進捗点を同じ位置に揃えるための共通計算。
 * @param {DailyAllocation[]} alloc
 * @param {number} fraction - 0〜1
 * @returns {{date: string, dayFraction: number}|null} - date の日の左端から dayFraction（0〜1）の位置。割当が無ければ null
 */
export function allocationProgressPoint(alloc, fraction) {
  if (!alloc || alloc.length === 0) return null;
  const f = Math.max(0, Math.min(1, fraction || 0));
  const total = alloc.reduce((sum, a) => sum + a.load, 0);
  if (f <= 0 || total <= 0) return { date: alloc[0].date, dayFraction: 0 };
  const target = total * f;
  let cum = 0;
  for (const a of alloc) {
    if (cum + a.load >= target - 1e-9) {
      return { date: a.date, dayFraction: a.load > 0 ? Math.min(1, (target - cum) / a.load) : 1 };
    }
    cum += a.load;
  }
  return { date: alloc[alloc.length - 1].date, dayFraction: 1 };
}
