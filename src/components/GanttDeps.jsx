import React from "react";
import { ROW_H } from "../constants.js";

export function GanttDeps({ flat, schedule, xOf, dayWidth, rowStride = ROW_H, showCritical = true }) {
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
