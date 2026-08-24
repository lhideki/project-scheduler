import { toISO, cal_addDaysISO } from "./calendar.js";
import { uid } from "./taskTree.js";

/* =========================================================================================
   サンプルデータ
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
