/* =========================================================================================
   WBS ツリー・ヘルパー
   ========================================================================================= */

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
 * @property {import("./deps.js").Dependency[]} [predecessors] - 先行タスク一覧（グループに設定すると配下リーフに伝播する）
 * @property {boolean} [milestone] - マイルストーンかどうか
 * @property {"flexible"|"fixed"} [milestoneMode] - flexible=依存関係から順算 / fixed=期日から逆算
 * @property {string} [fixedDate] - milestoneMode "fixed" の場合の固定期日
 * @property {number} [savedDuration] - マイルストーン化する前の工数の退避値（トグルで復元用）
 * @property {string} [notes] - メモ（詳細パネルでのみ編集）
 * @property {number} [diagX] - ネットワーク図でのドラッグ後のx座標（未指定なら自動レイアウト）
 * @property {number} [diagY] - ネットワーク図でのドラッグ後のy座標
 */

let uidCounter = 1;
export function uid(prefix) { return `${prefix}_${(uidCounter++).toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }

/**
 * 旧形式（単一スプリントの `sprintId`）で保存されたタスク配列を、現行の `sprintIds`（配列）形式に変換する。
 * `sprintIds` が既に存在するタスクはそのまま通す。localStorageからの読み込み・バージョン復元・JSONインポートの
 * 3箇所すべてで通す必要がある（後方互換のため。新形式のみを正とする設計に統一はしない）。
 * @param {Task[]} tasks
 * @returns {Task[]}
 */
export function migrateSprintIds(tasks) {
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
export function isGroupId(tasks, id) { return tasks.some(t => t.parentId === id); }

/**
 * WBS階層（parentId）をアウトライン順に展開し、階層情報を付与したフラット配列にする。
 * 折りたたまれたグループの配下は結果に含めない。
 * @param {Task[]} tasks
 * @param {Set<string>} collapsed - 折りたたみ中のグループIDの集合
 * @returns {Array<Task & {level: number, wbsNo: string, hasChildren: boolean, taskNo: number}>}
 */
export function buildFlatList(tasks, collapsed) {
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

export function allDescendantIds(tasks, rootId) {
  const out = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    tasks.forEach(t => { if (t.parentId === id) { out.push(t.id); stack.push(t.id); } });
  }
  return out;
}

/** タスクの祖先グループ（親・祖父母…）を配列で返す。 */
export function ancestorChain(byId, id) {
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
 * @returns {import("./deps.js").Dependency[]}
 */
export function effectivePredecessors(byId, leaf) {
  const chain = [leaf, ...ancestorChain(byId, leaf.id)];
  const chainIds = new Set(chain.map(x => x.id));
  const merged = chain.flatMap(x => x.predecessors || []);
  return merged.filter(dep => !chainIds.has(dep.id));
}
