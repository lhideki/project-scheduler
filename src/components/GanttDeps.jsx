import React from "react";
import { ROW_H } from "../constants.js";
import { dependencyKey } from "../lib/deps.js";

export function GanttDeps({ flat, schedule, xOf, dayWidth, rowStride = ROW_H, showCritical = true }) {
  const rows = new Map(flat.map((task, index) => [task.id, index]));
  const paths = [];
  flat.forEach(task => {
    const seriesSchedule = schedule.get(task.id);
    const targets = seriesSchedule?.occurrences || [seriesSchedule];
    targets.forEach(target => {
      if (!target?.schedStart || !target.schedFinish) return;
      const deps = target.occurrenceDate
        ? task.occurrenceOverrides?.[target.occurrenceDate]?.predecessors ?? task.predecessors ?? []
        : task.predecessors || [];
      deps.forEach(dep => {
        if (!rows.has(dep.id)) return;
        const predecessor = schedule.get(dep.id);
        // An explicit missing occurrence is unresolved, never rebound to the series.
        const source = dep.occurrenceDate
          ? predecessor?.occurrences?.find(o => o.occurrenceDate === dep.occurrenceDate)
          : predecessor;
        if (!source?.schedStart || !source.schedFinish) return;
        const fromX = (dep.type === "FS" || dep.type === "FF") ? xOf(source.schedFinish) + dayWidth : xOf(source.schedStart);
        const toX = (dep.type === "FS" || dep.type === "SS") ? xOf(target.schedStart) : xOf(target.schedFinish) + dayWidth;
        const fromY = rows.get(dep.id) * rowStride + ROW_H / 2;
        const toY = rows.get(task.id) * rowStride + ROW_H / 2;
        const critical = showCritical && source.critical && target.critical;
        const midX = fromX + (toX > fromX ? Math.min(dayWidth, (toX - fromX) / 2) : dayWidth / 2);
        const d = `M${fromX},${fromY} L${midX},${fromY} L${midX},${toY} L${toX},${toY}`;
        paths.push(<path key={JSON.stringify([task.id, target.occurrenceDate || null, dependencyKey(dep)])} d={d} stroke={critical ? "#EF4444" : "#CBD5E1"} strokeWidth={1.2} fill="none" markerEnd="url(#arrow)" data-dependency-occurrence={dep.occurrenceDate} data-target-occurrence={target.occurrenceDate} />);
      });
    });
  });
  return <>
    <defs><marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#94A3B8" /></marker></defs>
    {paths}
  </>;
}
