import { toISO, parseISO, weekKey, monthKey, fmtJP } from "./calendar.js";
import { isGroupId, buildFlatList, effectivePredecessors } from "./taskTree.js";

/* =========================================================================================
   スケジューリング・エンジン（CPM: 4種の依存関係 + リード/ラグ、固定マイルストーンからの逆算、
   クリティカルパス判定）と、リソース平準化のヒューリスティック（優先度付き Serial SGS）
   ------------------------------------------------------------------------------------------
   依存関係のみを満たす最早/最遅日程は「先行制約下での完了時刻最小化」という線形計画問題の
   双対（最長経路問題）を topological order で 1 パス解くことで厳密に求まる（CPM ⇔ LP 双対）。
   一方、資源上限を同時に満たす最適化（RCPSP）はNP困難で、ブラウザ内で真の整数計画法ソルバーを
   持たずに厳密解を出すのは非現実的なため、フロートが小さいタスクを優先する Serial Schedule
   Generation Scheme（優先度付き貪欲法）で近似する。
   ========================================================================================= */

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
 * 先行タスクの確定日程から、依存関係（type/lag）を満たす後続タスクの最早開始日候補を1つ求める
 * （フォワードパス用）。
 * @param {import("./calendar.js").Calendar} cal
 * @param {import("./deps.js").Dependency} dep
 * @param {{start: string, finish: string}} predDates - 先行タスクの開始日・終了日
 * @param {number} succDuration - 後続タスクの工数（人日）
 * @returns {{start: string}}
 */
export function candidateFromDep(cal, dep, predDates, succDuration) {
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
 * @param {import("./calendar.js").Calendar} cal
 * @param {import("./deps.js").Dependency} dep
 * @param {{start: string, finish: string}} succLateDates - 後続タスクのLS/LF
 * @param {number} predDuration - 先行タスクの工数（人日）
 * @returns {{finish: string}}
 */
export function candidateForPredFromSucc(cal, dep, succLateDates, predDuration) {
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

export function topoOrder(ids, edgesByTo) {
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

/**
 * プロジェクト全体の開始日を、開始日が入力されている全タスクのうち最も早い日付として求める。
 * 開始日を持つタスクが1つも無い場合は fallback（未指定なら実行時の当日）を返す。
 * runCPM / levelResources に projectStart を渡す前段の共通ロジック（App と CLI で共有する）。
 * @param {import("./taskTree.js").Task[]} tasks
 * @param {string} [fallback] - 開始日を持つタスクが無い場合に返す日付（YYYY-MM-DD）
 * @returns {string} YYYY-MM-DD
 */
export function deriveProjectStart(tasks, fallback) {
  const dates = (tasks || []).filter(t => t && t.startDate).map(t => t.startDate);
  if (dates.length) return dates.reduce((a, b) => (a < b ? a : b));
  return fallback || toISO(new Date());
}

/**
 * タスクに紐付く複数スプリントのうち、最も早い開始日（稼働日補正済み）を「希望開始日の下限」として返す。
 * 紐付くスプリントが無い／いずれも開始日未設定の場合は null。runCPM・levelResources で共通利用する。
 * @param {string[]|undefined} sprintIds
 * @param {Record<string, import("./taskTree.js").Sprint>} sprintById
 * @param {import("./calendar.js").Calendar} cal
 * @returns {string|null}
 */
export function earliestSprintFloor(sprintIds, sprintById, cal) {
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
 * @param {import("./taskTree.js").Task[]} tasks
 * @param {import("./calendar.js").Calendar} cal
 * @param {string} projectStart - プロジェクト全体の開始日（YYYY-MM-DD）
 * @param {import("./taskTree.js").Sprint[]} sprints
 * @param {{respectManualPins?: boolean}} [opts]
 * @returns {{result: Map<string, ScheduleEntry>, projectEnd: string}}
 */
export function runCPM(tasks, cal, projectStart, sprints, opts = {}) {
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
 * @param {import("./taskTree.js").Task[]} tasks
 * @param {Map<string, ScheduleEntry>} result - リーフの結果が入った状態で渡す。グループの結果を追加・上書きする
 * @returns {Map<string, ScheduleEntry>} 引数の result と同一の参照
 */
export function rollupSummaries(tasks, result) {
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
 * @param {import("./taskTree.js").Task[]} tasks
 * @param {Map<string, ScheduleEntry>} cpmResult - runCPM の計算結果（フロートの優先度付けに使う）
 * @param {import("./taskTree.js").Resource[]} resources
 * @param {import("./calendar.js").Calendar} cal
 * @param {import("./taskTree.js").Sprint[]} sprints
 * @returns {{placed: Record<string, {start: string, finish: string}>, warnings: string[]}}
 */
export function levelResources(tasks, cpmResult, resources, cal, sprints) {
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
