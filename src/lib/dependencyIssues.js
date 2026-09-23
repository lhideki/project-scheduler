/* =========================================================================================
   依存関係の矛盾検出（循環参照・開始日との矛盾・固定マイルストーンの期日超過・存在しない先行タスク）
   ------------------------------------------------------------------------------------------
   アプリ（App.jsx の WBS表・ガントチャート・ヘッダーの一覧）と Skill CLI（validate / recalc / plan）が
   同じ判定を使うための共通ロジック。日程の自動修正は行わない（修正は「自動スケジューリング実行」で行う）。

   開始日との矛盾・期日超過は「画面に表示しているスケジュール（schedule Map）」の上で、各依存関係の
   条件を candidateFromDep（CPM のフォワードパスと同じ計算）で評価し直して判定する。
   CPM・平準化の計算そのものには手を入れないため、表示とのずれが生じない。
   ========================================================================================= */

import { fmtJP } from "./calendar.js";
import { buildFlatList, effectivePredecessors } from "./taskTree.js";
import { formatDepLabel } from "./deps.js";
import { candidateFromDep } from "./scheduling.js";

/** 依存関係の矛盾の種別。 */
export const DEPENDENCY_ISSUE_CODES = Object.freeze({
  cycle: "dependency-cycle",
  missing: "predecessor-missing",
  violation: "dependency-violation",
  overrun: "fixed-milestone-overrun",
});

/** 種別の表示ラベル（WBS表のツールチップ・ヘッダーの一覧ダイアログ用）。 */
export const DEPENDENCY_ISSUE_LABELS = Object.freeze({
  [DEPENDENCY_ISSUE_CODES.cycle]: "循環参照",
  [DEPENDENCY_ISSUE_CODES.missing]: "存在しない先行タスク",
  [DEPENDENCY_ISSUE_CODES.violation]: "開始日との矛盾",
  [DEPENDENCY_ISSUE_CODES.overrun]: "固定期日の超過",
});

/** スケジュール（表示日程）を使って判定する種別。CLI の validate で、スケジュール計算の結果から追加する。 */
export const SCHEDULE_DEPENDENCY_ISSUE_CODES = Object.freeze([
  DEPENDENCY_ISSUE_CODES.violation,
  DEPENDENCY_ISSUE_CODES.overrun,
]);

const CODE_ORDER = [
  DEPENDENCY_ISSUE_CODES.cycle,
  DEPENDENCY_ISSUE_CODES.missing,
  DEPENDENCY_ISSUE_CODES.violation,
  DEPENDENCY_ISSUE_CODES.overrun,
];

/**
 * @typedef {Object} DependencyIssue
 * @property {"dependency-cycle"|"predecessor-missing"|"dependency-violation"|"fixed-milestone-overrun"} code
 * @property {"error"|"warning"} severity - 循環・存在しない先行は error、日程の矛盾は warning
 * @property {string[]} ids - 警告を表示するタスクのID（循環はその循環に含まれる全タスク、それ以外は1件）
 * @property {string} message - 表示用メッセージ（循環以外は、対象タスク自身の名前を含まない）
 * @property {string} [predecessorId] - 原因となった先行タスクのID（循環以外）
 * @property {string[]} [path] - 循環の経路（先頭と末尾が同じID）
 * @property {string} [requiredDate] - 依存関係の条件を満たすのに必要な日付（開始日との矛盾・期日超過）
 * @property {string} [actualDate] - 表示中の日付（開始日との矛盾・期日超過）
 */

function taskName(task, id) {
  if (!task) return id;
  return task.name && task.name.trim() ? task.name : "（無題のタスク）";
}

function isFixedMilestone(t) {
  return !!(t && t.milestone && t.milestoneMode === "fixed");
}

/** 他タスクから parentId で参照されているID（＝グループ）の集合。isGroupId をタスクごとに呼ぶと O(n^2) になるため1回だけ作る。 */
function collectGroupIds(tasks) {
  const ids = new Set();
  tasks.forEach(t => { if (t.parentId != null) ids.add(t.parentId); });
  return ids;
}

/** WBS表示順（全展開）の順位。表示順に並べるため・循環の経路を決定的に選ぶために使う。 */
function wbsRankOf(tasks) {
  const rank = new Map();
  buildFlatList(tasks, new Set()).forEach((t, i) => rank.set(t.id, i));
  // 親子関係が壊れていて buildFlatList に現れないタスクは、配列順で末尾に並べる。
  tasks.forEach((t, i) => { if (!rank.has(t.id)) rank.set(t.id, tasks.length + i); });
  return rank;
}

/**
 * 存在しないIDを先行タスクとして参照している依存関係を列挙する（グループに設定された先行タスクも対象）。
 * 自分自身への依存は対象外（CLI の self-dependency で扱う）。
 * @param {import("./taskTree.js").Task[]} tasks
 * @returns {{taskId: string, predecessorId: string}[]}
 */
export function findMissingPredecessors(tasks) {
  const ids = new Set(tasks.map(t => t.id));
  const out = [];
  tasks.forEach(t => {
    (t.predecessors || []).forEach(p => {
      if (!p || p.id === t.id) return;
      if (!ids.has(p.id)) out.push({ taskId: t.id, predecessorId: p.id });
    });
  });
  return out;
}

/**
 * 依存関係の循環を検出する。グループを介した循環（タスクAがグループGに依存し、G配下のタスクBがAに
 * 依存している等）も対象にする。
 *
 * スケジューリング・エンジン（runCPM）と同じ解釈でグラフを作る:
 * - 依存辺（dependency）: リーフごとに effectivePredecessors（祖先グループの先行タスクを合成し、
 *   自分自身・祖先への参照を除いたもの）から「先行 → リーフ」を張る。先行がグループの場合はグループのノードから張る。
 * - 所属辺（member）: 「子 → 親グループ」を張る（グループの日程は配下タスクのロールアップで決まるため）。
 * このグラフの強連結成分のうち、依存辺を1本以上含むものを1件の循環として返す
 * （所属辺だけの循環＝親子関係の循環は、依存関係の循環としては扱わない）。
 *
 * @param {import("./taskTree.js").Task[]} tasks
 * @returns {{ids: string[], path: string[], memberEdges: [string, string][]}[]}
 *   ids: 循環に含まれるタスク（WBS表示順）、path: 代表的な循環経路（先頭と末尾が同じID）、
 *   memberEdges: path のうち所属辺（[子, 親グループ]）の一覧
 */
export function findDependencyCycles(tasks) {
  const byId = {};
  tasks.forEach(t => { if (!(t.id in byId)) byId[t.id] = t; });
  const groupIds = collectGroupIds(tasks);
  const rank = wbsRankOf(tasks);
  const byRank = (a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0);

  const nodes = Object.keys(byId).sort(byRank);
  /** @type {Map<string, Map<string, "dependency"|"member">>} */
  const adj = new Map(nodes.map(id => [id, new Map()]));
  const addEdge = (from, to, kind) => {
    if (!adj.has(from) || !adj.has(to)) return;
    const out = adj.get(from);
    // 同じ2点間に依存辺と所属辺が両方ある場合は依存辺を優先する（循環判定に依存辺が必要なため）。
    if (!out.has(to) || kind === "dependency") out.set(to, kind);
  };
  nodes.forEach(id => {
    const t = byId[id];
    if (!groupIds.has(id)) {
      effectivePredecessors(byId, t).forEach(dep => addEdge(dep.id, id, "dependency"));
    }
    if (t.parentId != null && t.parentId !== id) addEdge(id, t.parentId, "member");
  });
  const succOf = id => [...adj.get(id).keys()].sort(byRank);

  // Tarjan の強連結成分分解（深い依存チェーンでもスタックが溢れないよう反復で実装）。
  const index = new Map(), low = new Map(), onStack = new Set();
  const stack = [];
  const components = [];
  let counter = 0;
  nodes.forEach(root => {
    if (index.has(root)) return;
    const work = [{ id: root, succs: succOf(root), i: 0 }];
    index.set(root, counter); low.set(root, counter); counter++;
    stack.push(root); onStack.add(root);
    while (work.length) {
      const frame = work[work.length - 1];
      if (frame.i < frame.succs.length) {
        const next = frame.succs[frame.i++];
        if (!index.has(next)) {
          index.set(next, counter); low.set(next, counter); counter++;
          stack.push(next); onStack.add(next);
          work.push({ id: next, succs: succOf(next), i: 0 });
        } else if (onStack.has(next)) {
          low.set(frame.id, Math.min(low.get(frame.id), index.get(next)));
        }
        continue;
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1];
        low.set(parent.id, Math.min(low.get(parent.id), low.get(frame.id)));
      }
      if (low.get(frame.id) === index.get(frame.id)) {
        const comp = [];
        let x;
        do { x = stack.pop(); onStack.delete(x); comp.push(x); } while (x !== frame.id);
        components.push(comp);
      }
    }
  });

  const cycles = [];
  components.forEach(comp => {
    if (comp.length < 2) return;
    const members = new Set(comp);
    const hasDependencyEdge = comp.some(from => [...adj.get(from)].some(([to, kind]) => kind === "dependency" && members.has(to)));
    if (!hasDependencyEdge) return;
    const ids = [...comp].sort(byRank);
    // 代表経路: WBS表示順で先頭のメンバーから、成分内だけを辿って自分に戻る最短経路（BFS）。
    const start = ids[0];
    const prev = new Map();
    const queue = [start];
    const visited = new Set([start]);
    let last = null;
    while (queue.length && last === null) {
      const cur = queue.shift();
      for (const next of succOf(cur)) {
        if (!members.has(next)) continue;
        if (next === start) { last = cur; break; }
        if (visited.has(next)) continue;
        visited.add(next); prev.set(next, cur); queue.push(next);
      }
    }
    const path = [start];
    for (let cur = last; cur !== null && cur !== start; cur = prev.get(cur) ?? null) path.splice(1, 0, cur);
    path.push(start);
    const memberEdges = [];
    for (let i = 0; i < path.length - 1; i++) {
      if (adj.get(path[i]).get(path[i + 1]) === "member") memberEdges.push([path[i], path[i + 1]]);
    }
    cycles.push({ ids, path, memberEdges });
  });
  cycles.sort((a, b) => byRank(a.ids[0], b.ids[0]));
  return cycles;
}

/** 循環の表示用メッセージ（例: 循環参照: 「A」→「B」→「G」→「A」（「B」はグループ「G」の配下））。 */
function cycleMessage(cycle, byId) {
  const nameOf = id => `「${taskName(byId[id], id)}」`;
  const route = cycle.path.map(nameOf).join("→");
  const notes = cycle.memberEdges.map(([child, parent]) => `${nameOf(child)}はグループ${nameOf(parent)}の配下`);
  return `循環参照: ${route}${notes.length ? `（${notes.join("、")}）` : ""}`;
}

/** 開始日との矛盾の表示用メッセージ。FS/SS は開始日、FF/SF は終了日で条件を説明する。 */
function violationMessage(cal, dep, predName, predDates, required, sched) {
  const label = formatDepLabel(dep);
  if (dep.type === "FF" || dep.type === "SF") {
    const base = dep.type === "FF" ? predDates.finish : predDates.start;
    const requiredFinish = cal.shift(base, dep.lag);
    return `先行「${predName}」（${label}）の条件では ${fmtJP(requiredFinish)} 以降に終了する必要がありますが、${fmtJP(sched.schedFinish)} に終了しています`;
  }
  return `先行「${predName}」（${label}）の条件では ${fmtJP(required)} 以降に開始する必要がありますが、${fmtJP(sched.schedStart)} に開始しています`;
}

/**
 * 表示スケジュールを使って、開始日との矛盾（dependency-violation）と固定マイルストーンの期日超過
 * （fixed-milestone-overrun）を判定する。
 *
 * - 開始日との矛盾: 各リーフの実効的な先行タスク（effectivePredecessors）ごとに、先行タスクの表示日程から
 *   candidateFromDep で必要な開始日を求め、表示中の開始日がそれより前なら矛盾とする。
 *   先行がグループの場合は、そのグループのロールアップ済みの表示日程を使う。
 *   着手済み（progress > 0）のタスクは実績として日付を固定する仕様のため対象外。
 * - 期日超過: 固定マイルストーンについて、先行タスクから求めた最早日または表示中の日程が fixedDate より後なら
 *   期日超過とする（平準化 ON/OFF に関わらず判定する）。期日超過のときは同じタスクの開始日との矛盾を重ねて出さない。
 * - 循環に含まれるタスク（excludeIds）は、日付が確定しないため対象外。存在しない先行タスクは無視する。
 *
 * @param {import("./taskTree.js").Task[]} tasks
 * @param {Map<string, import("./scheduling.js").ScheduleEntry>} schedule - 表示スケジュール（平準化ON時は平準化後）
 * @param {import("./calendar.js").Calendar} cal
 * @param {{excludeIds?: Set<string>}} [opts]
 * @returns {DependencyIssue[]}
 */
export function detectScheduleDependencyIssues(tasks, schedule, cal, opts = {}) {
  const excludeIds = opts.excludeIds || new Set();
  const byId = {};
  tasks.forEach(t => { if (!(t.id in byId)) byId[t.id] = t; });
  const groupIds = collectGroupIds(tasks);
  const issues = [];

  tasks.forEach(t => {
    if (byId[t.id] !== t) return; // ID重複は CLI の duplicate-task-id で扱う
    if (groupIds.has(t.id) || excludeIds.has(t.id)) return;
    const s = schedule.get(t.id);
    if (!s || !s.schedStart || !s.schedFinish) return;

    const checks = [];
    effectivePredecessors(byId, t).forEach(dep => {
      if (!byId[dep.id] || excludeIds.has(dep.id)) return;
      const p = schedule.get(dep.id);
      if (!p || !p.schedStart || !p.schedFinish) return;
      const predDates = { start: p.schedStart, finish: p.schedFinish };
      const required = candidateFromDep(cal, dep, predDates, t.duration).start;
      checks.push({ dep, predDates, required });
    });

    if (isFixedMilestone(t) && t.fixedDate) {
      const binding = checks.reduce((best, c) => (!best || c.required > best.required ? c : best), null);
      const earliest = binding ? binding.required : null;
      if (earliest && earliest > t.fixedDate) {
        issues.push({
          code: DEPENDENCY_ISSUE_CODES.overrun,
          severity: "warning",
          ids: [t.id],
          predecessorId: binding.dep.id,
          requiredDate: earliest,
          actualDate: s.schedFinish,
          message: `先行「${taskName(byId[binding.dep.id], binding.dep.id)}」から求めた最早日（${fmtJP(earliest)}）が固定期日（${fmtJP(t.fixedDate)}）を超過しています`,
        });
        return;
      }
      if (s.schedFinish > t.fixedDate) {
        issues.push({
          code: DEPENDENCY_ISSUE_CODES.overrun,
          severity: "warning",
          ids: [t.id],
          actualDate: s.schedFinish,
          message: `表示中の日程（${fmtJP(s.schedFinish)}）が固定期日（${fmtJP(t.fixedDate)}）を超過しています`,
        });
        return;
      }
    }

    if ((t.progress || 0) > 0) return; // 着手済みタスクは実績として日付を固定するため対象外
    checks.forEach(({ dep, predDates, required }) => {
      if (s.schedStart >= required) return;
      issues.push({
        code: DEPENDENCY_ISSUE_CODES.violation,
        severity: "warning",
        ids: [t.id],
        predecessorId: dep.id,
        requiredDate: required,
        actualDate: s.schedStart,
        message: violationMessage(cal, dep, taskName(byId[dep.id], dep.id), predDates, required, s),
      });
    });
  });
  return issues;
}

/**
 * 依存関係の矛盾（循環参照・存在しない先行タスク・開始日との矛盾・固定マイルストーンの期日超過）をまとめて判定する。
 * App（WBS表・ガントチャート・ヘッダーの一覧）と CLI（validate / recalc / plan）の共通の入口。
 * schedule・cal を省略した場合は、スケジュールを使わない判定（循環参照・存在しない先行タスク）だけを行う。
 *
 * @param {import("./taskTree.js").Task[]} tasks
 * @param {Map<string, import("./scheduling.js").ScheduleEntry>|null} [schedule]
 * @param {import("./calendar.js").Calendar|null} [cal]
 * @returns {DependencyIssue[]} WBS表示順・種別順に並べた一覧
 */
export function detectDependencyIssues(tasks, schedule = null, cal = null) {
  const list = tasks || [];
  const byId = {};
  list.forEach(t => { if (!(t.id in byId)) byId[t.id] = t; });
  const issues = [];

  const cycles = findDependencyCycles(list);
  const inCycle = new Set();
  cycles.forEach(cycle => {
    cycle.ids.forEach(id => inCycle.add(id));
    issues.push({
      code: DEPENDENCY_ISSUE_CODES.cycle,
      severity: "error",
      ids: cycle.ids,
      path: cycle.path,
      message: cycleMessage(cycle, byId),
    });
  });

  findMissingPredecessors(list).forEach(({ taskId, predecessorId }) => {
    issues.push({
      code: DEPENDENCY_ISSUE_CODES.missing,
      severity: "error",
      ids: [taskId],
      predecessorId,
      message: `先行タスク「${predecessorId}」が存在しません（削除済みのタスクを参照しているため、この依存関係は計算に使われていません）`,
    });
  });

  if (schedule && cal) {
    issues.push(...detectScheduleDependencyIssues(list, schedule, cal, { excludeIds: inCycle }));
  }

  const rank = wbsRankOf(list);
  return issues
    .map((issue, i) => ({ issue, i }))
    .sort((a, b) => {
      const ra = rank.get(a.issue.ids[0]) ?? 0, rb = rank.get(b.issue.ids[0]) ?? 0;
      if (ra !== rb) return ra - rb;
      const ca = CODE_ORDER.indexOf(a.issue.code), cb = CODE_ORDER.indexOf(b.issue.code);
      if (ca !== cb) return ca - cb;
      return a.i - b.i;
    })
    .map(x => x.issue);
}

/**
 * タスクIDごとに矛盾を引けるようにする（WBS表の行アイコン・ガントバーの強調・ツールチップ用）。
 * 循環は、循環に含まれる全タスクに同じ issue を割り当てる。
 * @param {DependencyIssue[]} issues
 * @returns {Map<string, DependencyIssue[]>}
 */
export function groupDependencyIssuesByTask(issues) {
  const map = new Map();
  (issues || []).forEach(issue => {
    issue.ids.forEach(id => {
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(issue);
    });
  });
  return map;
}
