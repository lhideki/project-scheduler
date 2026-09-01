import { toISO, parseISO, cal_addDaysISO, buildHolidayMap, makeCalendar } from "./calendar.js";
import { uid } from "./taskTree.js";
import { runCPM, levelResources, deriveProjectStart } from "./scheduling.js";

/* =========================================================================================
   サンプルデータ
   -----------------------------------------------------------------------------------------
   起点日（base）は「今月の1日」。タスクの日程は稼働日カレンダー＋依存関係＋リソース平準化で
   決まるため、base が何曜日かによって実日程が数日ずれる。スプリント期間や固定マイルストーンの
   期日を base からの単純な暦日オフセットで決め打ちすると、月によってスプリント矛盾・平準化警告が
   出てしまう（サンプルとしては常にクリーンであってほしい）。

   そこで、いったんスプリント無しで CPM ＋リソース平準化を回して各タスクの実日程（cascade）を求め、
   その実日程を包含するようにスプリント期間と固定マイルストーンの期日を逆算する
   （＝どの月に開いても矛盾・警告が出ない自己整合なサンプルになる）。スプリント開始日は各グループの
   先頭タスクの開始日に合わせるので、スプリント開始日がフロアとして効いても実日程は動かない。
   ========================================================================================= */
export function seedData() {
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

  // --- スプリント期間・固定マイルストーン期日の逆算 --------------------------------------
  const y = parseISO(base).getUTCFullYear();
  const cal = makeCalendar(buildHolidayMap(y - 1, y + 6));
  const projectStart = deriveProjectStart(tasks, base);

  // スプリント無しで CPM ＋リソース平準化を回し、各タスクの実日程（依存関係とリソース競合だけで
  // 決まる cascade）を求める。手入力の開始日（＝全タスク base）は respectManualPins により CPM の
  // forward pass では固定扱いになり依存の連鎖が出ないため、cascade の起点には平準化後の日付
  // （placed）を使う。スプリント開始日を各タスクの cascade 開始日に合わせておけば、スプリント
  // 開始日がフロアとして効いても実日程は動かない。
  const cpm = runCPM(tasks, cal, projectStart, [], { respectManualPins: true });
  const { placed } = levelResources(tasks, cpm.result, resources, cal, []);
  const startOf = (id) => placed[id]?.start || cpm.result.get(id)?.schedStart;
  const finishOf = (id) => placed[id]?.finish || cpm.result.get(id)?.schedFinish;
  const minStart = (ids) => ids.map(startOf).filter(Boolean).reduce((a, b) => (a < b ? a : b));
  const maxFinish = (ids) => ids.map(finishOf).filter(Boolean).reduce((a, b) => (a > b ? a : b));

  // 各スプリントの窓は「そのスプリントだけに属するタスク」の実日程を必ず包含させる。
  // sp2/sp3 の両方に属する t5（詳細設計）は和集合で判定されるため、開始側は sp2 の開始、
  // 終了側は sp3 の終了で吸収する（sp3End の算出対象に t5 を含める）。
  const s1Start = minStart([t1, t2]), s1End = maxFinish([t1, t2]);
  const s2Start = minStart([t3, t4]), s2End = maxFinish([t3, t4]);
  const s3Start = minStart([m1, t6, t7]), s3End = maxFinish([m1, t6, t7, t5]);

  // スプリント同士が重複しないよう、隣接スプリントの開始日の手前でクランプする（重複警告防止）。
  const clampEnd = (end, nextStart) => {
    const cap = cal_addDaysISO(nextStart, -1);
    return end < cap ? end : cap;
  };

  const sprints = [
    { id: sp1, name: "Sprint 1", theme: "要件定義とレビュー", startDate: s1Start, endDate: clampEnd(s1End, s2Start), order: 0 },
    { id: sp2, name: "Sprint 2", theme: "基本設計・詳細設計", startDate: s2Start, endDate: clampEnd(s2End, s3Start), order: 1 },
    { id: sp3, name: "Sprint 3", theme: "設計完了・実装開始", startDate: s3Start, endDate: s3End, order: 2 },
  ];

  // 固定マイルストーン「リリース」の期日は、結合テストの実日程の後ろに数稼働日の余裕を持たせて置く
  // （平準化ONでも期日超過警告が出ないように）。
  tasks.find(t => t.id === m2).fixedDate = cal.shift(maxFinish([t7]), 3);

  // 非稼働日カレンダーの例外（休日・稼働日の上書き）。サンプルでは未設定。
  const calendarExceptions = [];
  return { tasks, resources, sprints, calendarExceptions };
}
