import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Plus, Trash2, ChevronRight, ChevronDown, Save, ZoomIn, ZoomOut,
  AlertTriangle, ArrowLeftRight, Info, Diamond, GripVertical, Zap, Flame,
  Undo2, Redo2, Copy, ClipboardPaste,
} from "lucide-react";
import { toISO, parseISO, fmtJP, cal_addDaysISO, isWeekend } from "../lib/calendar.js";
import { uid, buildFlatList, allDescendantIds } from "../lib/taskTree.js";
import { sprintColorForId } from "../lib/sprints.js";
import { copyTextToClipboard } from "../lib/exportUtils.js";
import {
  WBS_EDITABLE_COLUMNS, taskCellText, taskCellPatch, taskRowText, taskRowPatch, copiedTaskRowPatch,
} from "../lib/wbsEditing.js";
import { startPointerDrag, svgPointFromRef, makeDateScale } from "../dom/pointerDrag.js";
import { axisTier, buildTimeAxis, stepDayWidth, MIN_DAY_WIDTH, MAX_DAY_WIDTH } from "../lib/timeAxis.js";
import {
  ROW_H, ROW_H_BASE, GANTT_HEADER_H, DEFAULT_WBS_COLS, MIN_WBS_COL_WIDTHS,
} from "../constants.js";
import { IconBtn } from "./IconBtn.jsx";
import { ColResizeHandle } from "./ColResizeHandle.jsx";
import { SprintMultiSelect } from "./SprintMultiSelect.jsx";
import { DepInput } from "./DepInput.jsx";
import { GanttDeps } from "./GanttDeps.jsx";
import { InazumaLine } from "./InazumaLine.jsx";
import { TaskDetailModal } from "./TaskDetailModal.jsx";

/* =========================================================================================
   8. WBS + ガントチャート ビュー
   ========================================================================================= */

export function WBSGanttView({
  tasks, setTasks, resources, sprints, cal, schedule, projectEnd, selectedId, setSelectedId,
  collapsed, setCollapsed, dayWidth, setDayWidth, requestConfirm,
  colWidths, setColWidths,
  versions, baselineVersionId, setBaselineVersionId,
  autoScheduleHighlightIds,
  onSaveVersion,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onNotify,
}) {
  const flat = useMemo(() => buildFlatList(tasks, collapsed), [tasks, collapsed]);
  // WBS表の列幅合計（左ペインの実表示幅）。列幅を変更するとここも連動して再計算される。
  const wbsTotalWidth = useMemo(() => Object.values(colWidths).reduce((a, b) => a + b, 0), [colWidths]);
  // 稲妻線（進捗線）の表示切り替え。予定日程（schedStart/schedFinish）自体は進捗率によって変えず、
  // 各行の「予定期間のうち進捗率ぶんの位置」を結んだ線として表示のみに反映する。
  const [showInazuma, setShowInazuma] = useState(true);
  // クリティカルパスの強調表示（WBS表の赤文字・ガントバー・依存線の赤色）の表示切り替え。
  const [showCritical, setShowCritical] = useState(true);
  // 進捗基準日の手動指定（稲妻線・今日の縦線の基準）。null のときは「本日」を意味し、
  // 実効値は下で todayISO から導出する（日付を固定値で持たないので日跨ぎでもズレない）。
  const [baseDateOverride, setBaseDateOverride] = useState(null);

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
  const cellRefs = useRef(new Map());
  const activeSelectionRef = useRef(null); // { kind: "cell", taskId, column } | { kind: "row", taskId }
  const clipboardRef = useRef(null); // アプリ内コピー時は型付きデータも保持する
  const [hasClipboard, setHasClipboard] = useState(false);
  const barsSvgRef = useRef(null);
  const pendingFocusIdRef = useRef(null);
  function isComposingEvent(e) {
    return e.nativeEvent?.isComposing || e.isComposing || e.keyCode === 229;
  }
  function cellKey(taskId, column) { return `${taskId}:${column}`; }
  function cellRefCallback(taskId, column, secondaryMap) {
    return el => {
      const key = cellKey(taskId, column);
      if (el) cellRefs.current.set(key, el); else cellRefs.current.delete(key);
      if (secondaryMap) {
        if (el) secondaryMap.current.set(taskId, el); else secondaryMap.current.delete(taskId);
      }
    };
  }
  function activateCell(taskId, column) {
    activeSelectionRef.current = { kind: "cell", taskId, column };
    setSelectedId(taskId);
  }
  function cellInputProps(taskId, column) {
    return {
      "data-wbs-cell": cellKey(taskId, column),
      "data-wbs-task-id": taskId,
      "data-wbs-column": column,
      onFocus: () => activateCell(taskId, column),
    };
  }
  function focusGridCell(taskId, column) {
    const el = cellRefs.current.get(cellKey(taskId, column));
    if (!el) return false;
    activateCell(taskId, column);
    el.focus();
    try {
      if (typeof el.select === "function" && el.tagName === "INPUT" && !["date", "checkbox"].includes(el.type)) el.select();
    } catch (err) { /* 選択範囲を持たないinputでは何もしない */ }
    el.scrollIntoView && el.scrollIntoView({ block: "nearest", inline: "nearest" });
    return true;
  }
  function moveGridFocus(taskId, column, direction) {
    const rowIndex = flat.findIndex(t => t.id === taskId);
    if (rowIndex === -1) return false;
    if (direction === "up" || direction === "down") {
      const step = direction === "up" ? -1 : 1;
      for (let i = rowIndex + step; i >= 0 && i < flat.length; i += step) {
        if (focusGridCell(flat[i].id, column)) return true;
      }
      if (direction === "down" && column === "name" && newTaskInputRef.current) {
        newTaskInputRef.current.focus();
        return true;
      }
      return false;
    }
    const columnIndex = WBS_EDITABLE_COLUMNS.indexOf(column);
    const step = direction === "left" ? -1 : 1;
    for (let i = columnIndex + step; i >= 0 && i < WBS_EDITABLE_COLUMNS.length; i += step) {
      if (focusGridCell(taskId, WBS_EDITABLE_COLUMNS[i])) return true;
    }
    return false;
  }
  function textCaretAllowsMove(e, direction) {
    const el = e.currentTarget;
    if (el.tagName !== "INPUT" || !["text", "search", "url", "tel", "email", "password"].includes(el.type)) return true;
    if (typeof el.selectionStart !== "number" || typeof el.selectionEnd !== "number") return true;
    if (el.selectionStart !== el.selectionEnd) return false;
    return direction === "left" ? el.selectionStart === 0 : el.selectionEnd === el.value.length;
  }
  // ↑↓は同じ列、←→は同じ行の隣接する編集可能セルへ移動する。
  // テキスト欄の←→は入力中のキャレット移動を優先し、先頭・末尾でのみセルをまたぐ。
  function handleGridCellKeyDown(e, taskId, column) {
    if (isComposingEvent(e)) return false;
    const directions = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
    const direction = directions[e.key];
    if (!direction) return false;
    if ((direction === "left" || direction === "right") && !textCaretAllowsMove(e, direction)) return false;
    if (!moveGridFocus(taskId, column, direction)) return false;
    e.preventDefault();
    return true;
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
  useEffect(() => {
    if (selectedId && !tasks.some(task => task.id === selectedId)) {
      activeSelectionRef.current = null;
      setSelectedId(null);
    }
  }, [tasks, selectedId, setSelectedId]);

  // 右ペイン（ガントのスクロール外枠）の表示幅。日付軸を「画面の描画領域いっぱい」まで
  // 伸ばすために使う。ウィンドウリサイズ・ペイン境界ドラッグ・左ペイン幅変更など、
  // 発火源を問わず ResizeObserver で拾える（chartWidth 側には依存しないのでループしない）。
  const [viewportWidth, setViewportWidth] = useState(0);
  useEffect(() => {
    const el = rightRef.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") { setViewportWidth(el.clientWidth); return; }
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { if (rightRef.current) setViewportWidth(rightRef.current.clientWidth); });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    setViewportWidth(el.clientWidth);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

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

  const WBS_CLIPBOARD_TYPE = "application/x-project-scheduler-wbs";
  function clipboardContextFor(taskId) {
    return {
      resources, sprints, idToNo, noToId, schedule,
      hasChildren: !!flat.find(t => t.id === taskId)?.hasChildren,
    };
  }
  function currentClipboardSelection() {
    const active = activeSelectionRef.current;
    if (active && active.taskId === selectedId) return active;
    return selectedId ? { kind: "row", taskId: selectedId } : null;
  }
  function makeClipboardPayload(selection) {
    if (!selection) return null;
    const task = tasks.find(t => t.id === selection.taskId);
    if (!task) return null;
    const context = clipboardContextFor(task.id);
    if (selection.kind === "cell") {
      const text = taskCellText(task, selection.column, context);
      return { kind: "cell", column: selection.column, text };
    }
    const snapshot = JSON.parse(JSON.stringify(task));
    snapshot.startDate = taskCellText(task, "startDate", context);
    return {
      kind: "row",
      text: taskRowText(task, context),
      task: snapshot,
      hasChildren: context.hasChildren,
    };
  }
  function hasSelectedInputText(target) {
    return target?.tagName === "INPUT" && typeof target.selectionStart === "number" &&
      target.selectionStart !== target.selectionEnd;
  }
  function handleClipboardCopy(e) {
    // 入力欄内で文字列を部分選択している場合は、ブラウザ標準のテキストコピーを優先する。
    if (hasSelectedInputText(e.target)) return;
    const payload = makeClipboardPayload(currentClipboardSelection());
    if (!payload || !e.clipboardData) return;
    e.preventDefault();
    clipboardRef.current = payload;
    setHasClipboard(true);
    e.clipboardData.setData("text/plain", payload.text);
    try { e.clipboardData.setData(WBS_CLIPBOARD_TYPE, JSON.stringify(payload)); } catch (err) { /* text/plainのみで継続 */ }
    onNotify?.(payload.kind === "row" ? "行をクリップボードにコピーしました" : "セルをクリップボードにコピーしました");
  }
  function payloadFromPasteEvent(e) {
    const custom = e.clipboardData?.getData(WBS_CLIPBOARD_TYPE);
    if (custom) {
      try { return JSON.parse(custom); } catch (err) { /* text/plainへフォールバック */ }
    }
    const text = e.clipboardData?.getData("text/plain") ?? "";
    if (clipboardRef.current?.text === text) return clipboardRef.current;
    return { kind: "text", text };
  }
  function applyClipboardPayload(payload, selection) {
    if (!payload || !selection) return false;
    const target = tasks.find(t => t.id === selection.taskId);
    if (!target) return false;
    const context = clipboardContextFor(target.id);
    let patch = {};
    let errors = [];

    if (payload.kind === "row" && payload.task) {
      patch = copiedTaskRowPatch(payload.task, target, context.hasChildren, payload.hasChildren);
    } else if (payload.kind === "cell" && selection.kind === "row") {
      const parsed = taskCellPatch(target, payload.column, payload.text, context);
      if (!parsed.ok) errors.push(payload.column);
      patch = parsed.patch;
    } else if (selection.kind === "row" || String(payload.text).includes("\t")) {
      const parsed = taskRowPatch(target, payload.text, context);
      patch = parsed.patch;
      errors = parsed.errors;
    } else {
      const column = selection.kind === "cell" ? selection.column : payload.column;
      const parsed = taskCellPatch(target, column, payload.text, context);
      if (!parsed.ok) errors.push(column);
      patch = parsed.patch;
    }
    if (!Object.keys(patch).length) {
      onNotify?.("貼り付けできる値がありません");
      return false;
    }
    updateTask(target.id, patch);
    if (errors.length) onNotify?.("互換性のないセルを除いて貼り付けました");
    else onNotify?.(payload.kind === "row" || selection.kind === "row" ? "行を貼り付けました" : "セルを貼り付けました");
    return true;
  }
  function handleClipboardPaste(e) {
    const selection = currentClipboardSelection();
    if (!selection) return;
    if (applyClipboardPayload(payloadFromPasteEvent(e), selection)) e.preventDefault();
  }
  async function copySelection() {
    const payload = makeClipboardPayload(currentClipboardSelection());
    if (!payload) return;
    clipboardRef.current = payload;
    setHasClipboard(true);
    try {
      await copyTextToClipboard(payload.text);
      onNotify?.(payload.kind === "row" ? "行をクリップボードにコピーしました" : "セルをクリップボードにコピーしました");
    } catch (err) {
      onNotify?.("クリップボードへのコピーに失敗しました");
    }
  }
  function pasteSelection() {
    if (!clipboardRef.current) return;
    applyClipboardPayload(clipboardRef.current, currentClipboardSelection());
  }
  function handleViewKeyDown(e) {
    if (isComposingEvent(e)) return;
    const modifier = e.metaKey || e.ctrlKey;
    if (!modifier || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === "z" && e.shiftKey && canRedo) {
      e.preventDefault();
      onRedo?.();
    } else if (key === "z" && canUndo) {
      e.preventDefault();
      onUndo?.();
    } else if (key === "y" && canRedo) {
      e.preventDefault();
      onRedo?.();
    }
  }

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

  // レンダーごとに1回だけ現在日付を評価してキャッシュする。
  const todayISO = toISO(new Date());
  // 進捗基準日の実効値。手動指定があればそれを、なければ本日を使う。
  const baseDateISO = baseDateOverride || todayISO;

  const minDate = useMemo(() => {
    let m = null;
    schedule.forEach(v => { if (v.schedStart && (!m || v.schedStart < m)) m = v.schedStart; });
    let start = m ? cal_addDaysISO(m, -3) : todayISO;
    // 基準日を範囲外に選んでも稲妻線・縦線が見切れないよう、チャート範囲へ含める。
    if (baseDateISO < start) start = baseDateISO;
    return start;
  }, [schedule, baseDateISO, todayISO]);
  // タスク内容から決まる本来の右端（プロジェクト終了 + 余白 + 基準日）。
  const contentMaxDate = useMemo(() => {
    let m = projectEnd || todayISO;
    let end = cal_addDaysISO(m, 7);
    if (baseDateISO > end) end = baseDateISO;
    return end;
  }, [projectEnd, baseDateISO, todayISO]);
  // 実際に日付軸・網掛け・グリッド・SVG を描画する右端。
  //  1) タスク名ラベルはバー右端の外側へ描くため、常に LABEL_MARGIN_PX ぶんの日数を足す。
  //  2) それでも右ペインの表示幅に届かない場合は、画面の描画領域いっぱいまで軸を伸ばす。
  const LABEL_MARGIN_PX = 160;
  const maxDate = useMemo(() => {
    let end = cal_addDaysISO(contentMaxDate, Math.ceil(LABEL_MARGIN_PX / dayWidth));
    if (viewportWidth > 0) {
      // floor で「表示幅を超えない最大の日数」に留め、余分な横スクロールバーを出さない。
      const viewEnd = cal_addDaysISO(minDate, Math.floor(viewportWidth / dayWidth));
      if (viewEnd > end) end = viewEnd;
    }
    return end;
  }, [contentMaxDate, minDate, viewportWidth, dayWidth]);
  const totalDays = Math.max(1, Math.round((parseISO(maxDate) - parseISO(minDate)) / 86400000));
  const chartWidth = totalDays * dayWidth;

  const xOf = makeDateScale(minDate, dayWidth);

  // 日付軸の表示粒度（day / week / month）。ズームアウトすると目盛りを週・月単位へ縮約する。
  const tier = axisTier(dayWidth);
  const axis = useMemo(
    () => buildTimeAxis({ minDate, maxDate, dayWidth, tier, cal }),
    [minDate, maxDate, dayWidth, tier, cal],
  );

  // 背景の網掛け（週末・祝日・稼働日指定）用の日別セル。month tier では日単位の網掛けをしないため生成しない。
  const dayCells = useMemo(() => {
    if (tier === "month") return [];
    const cells = [];
    // 稼働日指定（type: "workday"）の日付集合。土日・祝日でなくても、明示的に指定された日は淡色で示す。
    const forcedWorkdays = new Set(cal.exceptions.filter(e => e.type === "workday").map(e => e.date));
    let d = parseISO(minDate);
    const end = parseISO(maxDate);
    while (d <= end) {
      const iso = toISO(d);
      const weekend = isWeekend(d);
      const working = cal.isWorkdayStr(iso);
      cells.push({
        iso, x: xOf(iso),
        weekend: !working && weekend,
        holiday: !working ? (cal.holidayName(iso) || undefined) : undefined,
        // 稼働日指定で稼働扱いにした日（土日・祝日・休日指定を上書きした日を含む）
        workdayOverride: working && forcedWorkdays.has(iso),
      });
      d = new Date(d.getTime() + 86400000);
    }
    return cells;
  }, [minDate, maxDate, dayWidth, cal, tier]);

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

  return (
    <div className="flex flex-col h-full" onKeyDown={handleViewKeyDown}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-white flex-wrap">
        <IconBtn icon={Plus} label="タスク" onClick={() => addTask(false)} small />
        <IconBtn icon={Diamond} label="マイルストーン" onClick={() => addTask(true)} small />
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <IconBtn icon={ChevronRight} label="インデント" onClick={() => indentTask()} small disabled={!selectedId} />
        <IconBtn icon={ChevronDown} label="アウトデント" onClick={() => outdentTask()} small disabled={!selectedId} />
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <IconBtn icon={Trash2} label="削除" onClick={() => deleteTask()} small danger disabled={!selectedId} iconOnly />
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <IconBtn icon={Info} label="詳細" onClick={() => selectedId && setDetailId(selectedId)} small disabled={!selectedId} iconOnly />
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <IconBtn icon={Copy} label="コピー" onClick={copySelection} small disabled={!selectedId} iconOnly />
        <IconBtn icon={ClipboardPaste} label="貼り付け" onClick={pasteSelection} small disabled={!selectedId || !hasClipboard} iconOnly />
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <IconBtn icon={Undo2} label="元に戻す" onClick={onUndo} small disabled={!canUndo} iconOnly />
        <IconBtn icon={Redo2} label="やり直す" onClick={onRedo} small disabled={!canRedo} iconOnly />
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
        {showInazuma && (
          <div className="flex items-center gap-1" title="進捗基準日（稲妻線・今日の縦線の基準）">
            <input
              type="date"
              aria-label="進捗基準日（稲妻線・今日の縦線の基準）"
              value={baseDateISO}
              onChange={e => setBaseDateOverride(e.target.value || null)}
              className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white text-slate-600"
            />
            {baseDateISO !== todayISO && (
              <button
                type="button"
                onClick={() => setBaseDateOverride(null)}
                className="text-[10px] text-indigo-600 hover:underline whitespace-nowrap"
                title="本日に戻す"
              >今日</button>
            )}
          </div>
        )}
        <IconBtn icon={Flame} label="クリティカルパス" onClick={() => setShowCritical(v => !v)} small active={showCritical} />
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <IconBtn icon={Save} label="バージョンを保存" onClick={() => onSaveVersion(`バージョン ${versions.length + 1}`)} small />
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <IconBtn icon={ZoomOut} label="ズームアウト（日→週→月へ縮約）" iconOnly onClick={() => setDayWidth(w => stepDayWidth(w, -1))} small disabled={dayWidth <= MIN_DAY_WIDTH} />
        <IconBtn icon={ZoomIn} label="ズームイン" iconOnly onClick={() => setDayWidth(w => stepDayWidth(w, +1))} small disabled={dayWidth >= MAX_DAY_WIDTH} />
      </div>

      <div className="flex flex-1 min-h-0">
        {/* 左：WBS テーブル */}
        <div
          ref={leftRef}
          onScroll={onScrollLeft}
          onCopy={handleClipboardCopy}
          onPaste={handleClipboardPaste}
          className="overflow-y-auto overflow-x-auto bg-white relative"
          style={{ width: effectiveLeftWidth, flexShrink: 0 }}
        >
          {/* ペイン幅が列幅の合計より狭い場合でも列を縮めず、この内側ラッパーの幅（＝列幅の合計）を
              保ったまま、外側（leftRef）の横スクロールで見せる。 */}
          <div style={{ width: wbsTotalWidth, minWidth: "100%" }}>
          <div className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 flex text-[11px] font-medium text-slate-500" style={{ height: GANTT_HEADER_H }}>
            <div style={{ width: colWidths.grip }} className="relative flex items-end justify-center"><ColResizeHandle onResizeStart={e => startColResize(e, "grip")} onReset={e => { e.stopPropagation(); resetColWidth("grip"); }} /></div>
            <div style={{ width: colWidths.wbs }} className="relative px-2 py-2 flex items-end font-mono" title="WBS番号をクリックして行を選び、コピー／貼り付けできます">WBS<ColResizeHandle onResizeStart={e => startColResize(e, "wbs")} onReset={e => { e.stopPropagation(); resetColWidth("wbs"); }} /></div>
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
                onClick={e => {
                  setSelectedId(t.id);
                  if (!e.target.closest?.("[data-wbs-cell]")) activeSelectionRef.current = { kind: "row", taskId: t.id };
                }}
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
                <div style={{ width: colWidths.wbs }} className="px-1 font-mono text-slate-400 truncate">
                  <button
                    type="button"
                    data-wbs-row-id={t.id}
                    onFocus={() => { activeSelectionRef.current = { kind: "row", taskId: t.id }; setSelectedId(t.id); }}
                    title="行を選択（コピー／貼り付け対象）"
                    className="w-full text-left rounded px-1 outline-none focus:bg-indigo-100 focus:ring-1 focus:ring-indigo-300"
                  >
                    {t.wbsNo}
                  </button>
                </div>
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
                      ref={cellRefCallback(t.id, "name", rowInputRefs)}
                      {...cellInputProps(t.id, "name")}
                      value={t.name}
                      onChange={e => updateTask(t.id, { name: e.target.value })}
                      onKeyDown={e => {
                        if (isComposingEvent(e)) return;
                        if (e.key === "Tab") {
                          e.preventDefault();
                          if (e.shiftKey) outdentTask(t.id); else indentTask(t.id);
                          return;
                        }
                        if (handleGridCellKeyDown(e, t.id, "name")) return;
                        if (e.key === "Enter") {
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
                      className={"bg-transparent outline-none truncate w-full rounded focus:bg-indigo-100 focus:ring-1 focus:ring-indigo-300 " + (isSummary ? "font-semibold" : "")}
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
                        ref={cellRefCallback(t.id, "startDate")} {...cellInputProps(t.id, "startDate")}
                        onKeyDown={e => handleGridCellKeyDown(e, t.id, "startDate")}
                        className={"bg-transparent outline-none w-full rounded font-mono text-[11px] focus:bg-indigo-100 focus:ring-1 focus:ring-indigo-300 " + (autoScheduleHighlightIds.has(t.id) ? "font-bold" : "")} />
                    ) : (
                      <input type="date" value={t.startDate || ""} onChange={e => updateTask(t.id, { startDate: e.target.value })}
                        ref={cellRefCallback(t.id, "startDate")} {...cellInputProps(t.id, "startDate")}
                        onKeyDown={e => handleGridCellKeyDown(e, t.id, "startDate")}
                        className={"bg-transparent outline-none w-full rounded font-mono text-[11px] focus:bg-indigo-100 focus:ring-1 focus:ring-indigo-300 " + (autoScheduleHighlightIds.has(t.id) ? "font-bold" : "")} />
                    )
                  )}
                  {isSummary && <span className="font-mono text-[11px] text-slate-400">{fmtJP(sched?.schedStart)}</span>}
                </div>
                <div style={{ width: colWidths.duration }} className="px-1">
                  {!isSummary && !t.hasChildren && !t.milestone && (
                    <input type="number" min={0} step={0.5} value={t.duration} title="人日（小数可）"
                      onChange={e => updateTask(t.id, { duration: Math.max(0, Math.round(parseFloat(e.target.value || "0") * 100) / 100) })}
                      ref={cellRefCallback(t.id, "duration")} {...cellInputProps(t.id, "duration")}
                      onKeyDown={e => handleGridCellKeyDown(e, t.id, "duration")}
                      className="bg-transparent outline-none w-full rounded font-mono text-[11px] focus:bg-indigo-100 focus:ring-1 focus:ring-indigo-300" />
                  )}
                </div>
                <div style={{ width: colWidths.finish }} className="px-1 font-mono text-[11px] text-slate-500">{fmtJP(sched?.schedFinish)}</div>
                <div style={{ width: colWidths.assignee }} className="px-1">
                  {!isSummary && !t.hasChildren && (
                    t.milestone ? (
                      <select value={t.milestoneMode || "flexible"} onChange={e => updateTask(t.id, { milestoneMode: e.target.value })}
                        title="固定：期日から逆算してスケジュール / 柔軟：依存関係から順算"
                        ref={cellRefCallback(t.id, "assignee")} {...cellInputProps(t.id, "assignee")}
                        onKeyDown={e => handleGridCellKeyDown(e, t.id, "assignee")}
                        className="bg-transparent outline-none w-full rounded text-[11px] focus:bg-indigo-100 focus:ring-1 focus:ring-indigo-300">
                        <option value="flexible">柔軟</option>
                        <option value="fixed">固定</option>
                      </select>
                    ) : (
                      <select value={t.assigneeId || ""} onChange={e => updateTask(t.id, { assigneeId: e.target.value || null })}
                        ref={cellRefCallback(t.id, "assignee")} {...cellInputProps(t.id, "assignee")}
                        onKeyDown={e => handleGridCellKeyDown(e, t.id, "assignee")}
                        className="bg-transparent outline-none w-full rounded text-[11px] focus:bg-indigo-100 focus:ring-1 focus:ring-indigo-300">
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
                      inputRef={cellRefCallback(t.id, "sprint")} inputProps={cellInputProps(t.id, "sprint")}
                      onKeyDown={e => handleGridCellKeyDown(e, t.id, "sprint")} />
                  )}
                </div>
                <div style={{ width: colWidths.progress }} className="px-1">
                  {!isSummary && !t.hasChildren ? (
                    t.milestone ? (
                      <input type="checkbox" checked={(t.progress || 0) >= 100}
                        title="完了チェック（未チェック：0% / チェック済み：100%）"
                        onChange={e => updateTask(t.id, { progress: e.target.checked ? 100 : 0 })}
                        ref={cellRefCallback(t.id, "progress")} {...cellInputProps(t.id, "progress")}
                        onKeyDown={e => handleGridCellKeyDown(e, t.id, "progress")}
                        className="rounded focus:ring-2 focus:ring-indigo-300" />
                    ) : (
                      <div className="flex items-center gap-0.5">
                        <input type="number" min={0} max={100} step={5} value={t.progress || 0}
                          title="進捗率（%）"
                          onChange={e => updateTask(t.id, { progress: Math.max(0, Math.min(100, Math.round(parseFloat(e.target.value || "0")))) })}
                          ref={cellRefCallback(t.id, "progress")} {...cellInputProps(t.id, "progress")}
                          onKeyDown={e => handleGridCellKeyDown(e, t.id, "progress")}
                          className="bg-transparent outline-none w-full rounded font-mono text-[11px] focus:bg-indigo-100 focus:ring-1 focus:ring-indigo-300" />
                        <span className="text-[10px] text-slate-400 flex-shrink-0">%</span>
                      </div>
                    )
                  ) : (
                    <span className="font-mono text-[11px] text-slate-400">{isSummary ? `${sched?.progress ?? 0}%` : ""}</span>
                  )}
                </div>
                <div style={{ width: colWidths.deps }} className="px-1">
                  <DepInput deps={t.predecessors} idToNo={idToNo} noToId={noToId} onChange={d => updateTask(t.id, { predecessors: d })}
                    inputRef={cellRefCallback(t.id, "predecessors")} inputProps={cellInputProps(t.id, "predecessors")}
                    onKeyDown={e => handleGridCellKeyDown(e, t.id, "predecessors")} />
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
                {axis.major.map(b => (
                  <div key={b.key} style={{ position: "absolute", left: b.x, width: b.w }} className="px-1 border-l border-slate-200 truncate">{b.label}</div>
                ))}
              </div>
              <div className="relative text-[9px] text-slate-400" style={{ height: GANTT_HEADER_H - 36 }}>
                {axis.minor.map(m => (
                  <div
                    key={m.key}
                    style={{ position: "absolute", left: m.x, width: m.w }}
                    className={
                      (tier === "day" ? "text-center " : "text-left pl-1 border-l border-slate-200 ") +
                      "leading-tight overflow-hidden whitespace-nowrap " +
                      (m.muted ? "text-red-400" : "")
                    }
                  >
                    <div>{m.label}</div>
                    {m.sub && <div>{m.sub}</div>}
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
                {dayCells.map(c => c.workdayOverride && (
                  <rect key={`w-${c.iso}`} x={c.x} y={0} width={dayWidth} height={bodyHeight} fill="#EFF6FF" />
                ))}
                {/* 週・月へ縮約表示した粒度では、日単位の網掛けの代わりに目盛りの境界へ縦罫線を引く。 */}
                {tier !== "day" && axis.minor.map(m => m.x > 0 && (
                  <line key={`grid-${m.key}`} x1={m.x} x2={m.x} y1={0} y2={bodyHeight} stroke="#E2E8F0" strokeWidth={1} />
                ))}
                {xOf(baseDateISO) >= 0 && xOf(baseDateISO) <= chartWidth && (
                  <line x1={xOf(baseDateISO) + dayWidth / 2} x2={xOf(baseDateISO) + dayWidth / 2} y1={0} y2={bodyHeight} stroke="#DC2626" strokeDasharray="3,3" strokeWidth={1} />
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
                {showInazuma && <InazumaLine flat={flat} schedule={schedule} xOf={xOf} dayWidth={dayWidth} cal={cal} baseDateISO={baseDateISO} rowStride={rowStride} />}
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
