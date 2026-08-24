import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { LayoutGrid, Trash2, X } from "lucide-react";
import { buildFlatList } from "../lib/taskTree.js";
import { formatDepLabel } from "../lib/deps.js";
import { fmtJP } from "../lib/calendar.js";
import { startPointerDrag, svgPointFromRef } from "../dom/pointerDrag.js";
import { DEP_TYPES } from "../constants.js";
import { IconBtn } from "./IconBtn.jsx";

/* =========================================================================================
   9. ネットワーク図（依存関係図）ビュー
   ========================================================================================= */
const NETWORK_PALETTE = ["#6366F1", "#F59E0B", "#10B981", "#EC4899", "#0EA5E9", "#8B5CF6", "#EF4444", "#14B8A6"];

export function NetworkView({ tasks, setTasks, schedule, selectedId, setSelectedId }) {
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
