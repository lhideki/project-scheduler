import React, { useState, useEffect, useMemo, useRef, useReducer, useCallback } from "react";
import {
  Play, X, AlertTriangle, Check, Clock, GitBranch, Users, Table2,
  History, Download, Upload, CalendarRange, Copy,
} from "lucide-react";

import { toISO, parseISO, buildHolidayMap, makeCalendar, fmtJP } from "./lib/calendar.js";
import { uid, migrateSprintIds, isGroupId, buildFlatList } from "./lib/taskTree.js";
import { runCPM, rollupSummaries, levelResources } from "./lib/scheduling.js";
import { downloadJSON, copyTextToClipboard, generateMermaidGantt } from "./lib/exportUtils.js";
import { seedData } from "./lib/seedData.js";
import { createTaskHistory, taskHistoryReducer } from "./lib/history.js";
import { storageGet, storageSet } from "./storage.js";
import { DEFAULT_WBS_COLS } from "./constants.js";
import { IconBtn } from "./components/IconBtn.jsx";
import { Tab } from "./components/Tab.jsx";
import { WBSGanttView } from "./components/WBSGanttView.jsx";
import { NetworkView } from "./components/NetworkView.jsx";
import { ResourceView } from "./components/ResourceView.jsx";
import { SprintsView } from "./components/SprintsView.jsx";
import { VersionsView } from "./components/VersionsView.jsx";

/* =========================================================================================
   13. アプリ本体
   ========================================================================================= */
export default function App() {
  const seed = useMemo(() => seedData(), []);
  const [taskHistory, dispatchTasks] = useReducer(taskHistoryReducer, seed.tasks, createTaskHistory);
  const tasks = taskHistory.present;
  // 子コンポーネントには従来のReact setterと同じインターフェースを渡し、すべてのタスク更新を
  // 1つの履歴に集約する。初回ロードだけはUndo対象にせず、resetで履歴を空にする。
  const setTasks = useCallback(value => dispatchTasks({ type: "set", value }), []);
  const resetTasks = useCallback(value => dispatchTasks({ type: "reset", value }), []);
  const undoTasks = useCallback(() => dispatchTasks({ type: "undo" }), []);
  const redoTasks = useCallback(() => dispatchTasks({ type: "redo" }), []);
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
        resetTasks(migrateSprintIds(proj.tasks));
        setResources(proj.resources || seed.resources);
        // 旧バージョンのデータ（sprints未対応）を開いた場合は空配列にフォールバックする。
        setSprints(Array.isArray(proj.sprints) ? proj.sprints : []);
      }
      const vs = await storageGet("pm_versions");
      if (vs) setVersions(vs);
      setLoaded(true);
    })();
    // eslint-disable-next-line
  }, [resetTasks, seed.resources]);

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
            canUndo={taskHistory.past.length > 0}
            canRedo={taskHistory.future.length > 0}
            onUndo={undoTasks}
            onRedo={redoTasks}
            onNotify={showToast}
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
