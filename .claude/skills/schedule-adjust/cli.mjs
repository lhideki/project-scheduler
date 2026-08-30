#!/usr/bin/env node
// ============================================================================
// GENERATED FILE — do not edit.
// `npm run build:agent` が src/agent/cli.js（と src/lib/）からバンドルします。
// ============================================================================

// src/agent/cli.js
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// src/lib/calendar.js
function toISO(d) {
  return d.toISOString().slice(0, 10);
}
function parseISO(s) {
  return /* @__PURE__ */ new Date(s + "T00:00:00Z");
}
function isWeekend(d) {
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}
function vernalEquinoxDay(year) {
  return Math.floor(20.8431 + 0.242194 * (year - 1980)) - Math.floor((year - 1980) / 4);
}
function autumnalEquinoxDay(year) {
  return Math.floor(23.2488 + 0.242194 * (year - 1980)) - Math.floor((year - 1980) / 4);
}
function nthMonday(year, month, n) {
  const d = new Date(Date.UTC(year, month - 1, 1));
  const dow = d.getUTCDay();
  const firstMonday = 1 + (8 - dow) % 7;
  return new Date(Date.UTC(year, month - 1, firstMonday + (n - 1) * 7));
}
function baseHolidaysOfYear(year) {
  const list = [];
  const add = (m, d, name) => list.push({ date: toISO(new Date(Date.UTC(year, m - 1, d))), name });
  add(1, 1, "\u5143\u65E5");
  list.push({ date: toISO(nthMonday(year, 1, 2)), name: "\u6210\u4EBA\u306E\u65E5" });
  add(2, 11, "\u5EFA\u56FD\u8A18\u5FF5\u306E\u65E5");
  add(2, 23, "\u5929\u7687\u8A95\u751F\u65E5");
  add(3, vernalEquinoxDay(year), "\u6625\u5206\u306E\u65E5");
  add(4, 29, "\u662D\u548C\u306E\u65E5");
  add(5, 3, "\u61B2\u6CD5\u8A18\u5FF5\u65E5");
  add(5, 4, "\u307F\u3069\u308A\u306E\u65E5");
  add(5, 5, "\u3053\u3069\u3082\u306E\u65E5");
  list.push({ date: toISO(nthMonday(year, 7, 3)), name: "\u6D77\u306E\u65E5" });
  add(8, 11, "\u5C71\u306E\u65E5");
  list.push({ date: toISO(nthMonday(year, 9, 3)), name: "\u656C\u8001\u306E\u65E5" });
  add(9, autumnalEquinoxDay(year), "\u79CB\u5206\u306E\u65E5");
  list.push({ date: toISO(nthMonday(year, 10, 2)), name: "\u30B9\u30DD\u30FC\u30C4\u306E\u65E5" });
  add(11, 3, "\u6587\u5316\u306E\u65E5");
  add(11, 23, "\u52E4\u52B4\u611F\u8B1D\u306E\u65E5");
  return list;
}
function buildHolidayMap(startYear, endYear) {
  const map = /* @__PURE__ */ new Map();
  for (let y = startYear - 1; y <= endYear + 1; y++) {
    baseHolidaysOfYear(y).forEach((h) => map.set(h.date, h.name));
  }
  let added = true, guard = 0;
  while (added && guard < 5) {
    added = false;
    guard++;
    for (const dateStr of Array.from(map.keys())) {
      const d = parseISO(dateStr);
      const next = new Date(d);
      next.setUTCDate(d.getUTCDate() + 1);
      const nextStr = toISO(next);
      const nn = new Date(d);
      nn.setUTCDate(d.getUTCDate() + 2);
      if (!map.has(nextStr) && map.has(toISO(nn))) {
        const dow = next.getUTCDay();
        if (dow !== 0 && dow !== 6) {
          map.set(nextStr, "\u56FD\u6C11\u306E\u4F11\u65E5");
          added = true;
        }
      }
    }
  }
  const substituted = /* @__PURE__ */ new Set();
  added = true;
  guard = 0;
  while (added && guard < 10) {
    added = false;
    guard++;
    for (const dateStr of Array.from(map.keys())) {
      const name = map.get(dateStr);
      if (name === "\u632F\u66FF\u4F11\u65E5" || substituted.has(dateStr)) continue;
      const d = parseISO(dateStr);
      if (d.getUTCDay() === 0) {
        substituted.add(dateStr);
        let cursor = new Date(d);
        do {
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        } while (map.has(toISO(cursor)));
        map.set(toISO(cursor), "\u632F\u66FF\u4F11\u65E5");
        added = true;
      }
    }
  }
  return map;
}
function normalizeCalendarExceptions(exceptions) {
  const forcedWorkdays = /* @__PURE__ */ new Map();
  const extraHolidays = /* @__PURE__ */ new Map();
  const list = [];
  for (const e of Array.isArray(exceptions) ? exceptions : []) {
    if (!e || typeof e.date !== "string" || !e.date) continue;
    if (e.type !== "workday" && e.type !== "holiday") continue;
    const name = typeof e.name === "string" ? e.name : "";
    list.push({ date: e.date, type: e.type, name });
    (e.type === "workday" ? forcedWorkdays : extraHolidays).set(e.date, name);
  }
  return { list, forcedWorkdays, extraHolidays };
}
function makeCalendar(holidayMap, exceptions = []) {
  const { list: normalizedExceptions, forcedWorkdays, extraHolidays } = normalizeCalendarExceptions(exceptions);
  function isWorkday(d) {
    const iso = toISO(d);
    if (forcedWorkdays.has(iso)) return true;
    if (isWeekend(d)) return false;
    if (holidayMap.has(iso)) return false;
    if (extraHolidays.has(iso)) return false;
    return true;
  }
  function holidayName(s) {
    if (forcedWorkdays.has(s)) return null;
    if (extraHolidays.has(s)) return extraHolidays.get(s) || "\u4F11\u65E5";
    return holidayMap.get(s) || null;
  }
  function isWorkdayStr(s) {
    return isWorkday(parseISO(s));
  }
  function snapForward(s) {
    const d = parseISO(s);
    while (!isWorkday(d)) d.setUTCDate(d.getUTCDate() + 1);
    return toISO(d);
  }
  function snapBackward(s) {
    const d = parseISO(s);
    while (!isWorkday(d)) d.setUTCDate(d.getUTCDate() - 1);
    return toISO(d);
  }
  function shift(s, n) {
    if (n === 0) return s;
    const d = parseISO(s);
    const step = n > 0 ? 1 : -1;
    let remaining = Math.abs(n);
    while (remaining > 0) {
      d.setUTCDate(d.getUTCDate() + step);
      if (isWorkday(d)) remaining--;
    }
    return toISO(d);
  }
  function endFromStart(startStr, duration) {
    if (duration <= 0) return snapForward(startStr);
    const totalDays = Math.max(1, Math.ceil(duration - 1e-9));
    const d = parseISO(snapForward(startStr));
    let count = 1;
    while (count < totalDays) {
      d.setUTCDate(d.getUTCDate() + 1);
      if (isWorkday(d)) count++;
    }
    return toISO(d);
  }
  function startFromEnd(finishStr, duration) {
    if (duration <= 0) return snapBackward(finishStr);
    const totalDays = Math.max(1, Math.ceil(duration - 1e-9));
    const d = parseISO(snapBackward(finishStr));
    let count = 1;
    while (count < totalDays) {
      d.setUTCDate(d.getUTCDate() - 1);
      if (isWorkday(d)) count++;
    }
    return toISO(d);
  }
  function workdaysBetween(aStr, bStr) {
    let a = parseISO(aStr), b = parseISO(bStr);
    if (a.getTime() === b.getTime()) return 0;
    const sign = b > a ? 1 : -1;
    let cnt = 0;
    const d = new Date(a);
    while (d.getTime() !== b.getTime()) {
      d.setUTCDate(d.getUTCDate() + sign);
      if (isWorkday(d)) cnt += sign;
    }
    return cnt;
  }
  return { isWorkday, isWorkdayStr, snapForward, snapBackward, shift, endFromStart, startFromEnd, workdaysBetween, holidayName, holidayMap, exceptions: normalizedExceptions };
}
function weekKey(dateStr) {
  const d = parseISO(dateStr);
  const dow = (d.getUTCDay() + 6) % 7;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - dow);
  return toISO(monday);
}
function monthKey(dateStr) {
  return dateStr.slice(0, 7);
}
function fmtJP(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${y}/${m}/${d}`;
}

// src/lib/taskTree.js
function isGroupId(tasks, id) {
  return tasks.some((t) => t.parentId === id);
}
function buildFlatList(tasks, collapsed) {
  const byParent = /* @__PURE__ */ new Map();
  tasks.forEach((t) => {
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
  flat.forEach((t, i) => t.taskNo = i + 1);
  return flat;
}
function ancestorChain(byId, id) {
  const out = [];
  let cur = byId[id];
  while (cur && cur.parentId) {
    cur = byId[cur.parentId];
    if (cur) out.push(cur);
  }
  return out;
}
function effectivePredecessors(byId, leaf) {
  const chain = [leaf, ...ancestorChain(byId, leaf.id)];
  const chainIds = new Set(chain.map((x) => x.id));
  const merged = chain.flatMap((x) => x.predecessors || []);
  return merged.filter((dep) => !chainIds.has(dep.id));
}

// src/lib/scheduling.js
function candidateFromDep(cal, dep, predDates, succDuration) {
  const { type, lag } = dep;
  if (type === "FS") return { start: cal.shift(predDates.finish, 1 + lag) };
  if (type === "SS") return { start: cal.shift(predDates.start, lag) };
  if (type === "FF") {
    const f2 = cal.shift(predDates.finish, lag);
    return { start: succDuration <= 0 ? f2 : cal.startFromEnd(f2, succDuration) };
  }
  const f = cal.shift(predDates.start, lag);
  return { start: succDuration <= 0 ? f : cal.startFromEnd(f, succDuration) };
}
function candidateForPredFromSucc(cal, dep, succLateDates, predDuration) {
  const { type, lag } = dep;
  if (type === "FS") return { finish: cal.shift(succLateDates.start, -(1 + lag)) };
  if (type === "SS") {
    const s2 = cal.shift(succLateDates.start, -lag);
    return { finish: predDuration <= 0 ? s2 : cal.endFromStart(s2, predDuration) };
  }
  if (type === "FF") return { finish: cal.shift(succLateDates.finish, -lag) };
  const s = cal.shift(succLateDates.finish, -lag);
  return { finish: predDuration <= 0 ? s : cal.endFromStart(s, predDuration) };
}
function dailyLoads(cal, startStr, duration) {
  if (duration <= 0) return [];
  const totalDays = Math.max(1, Math.ceil(duration - 1e-9));
  const fullDays = Math.floor(duration + 1e-9);
  const remainder = duration - fullDays;
  const loadFor = (dayIndex) => dayIndex === totalDays && remainder > 1e-9 ? remainder : 1;
  const d = parseISO(cal.snapForward(startStr));
  const loads = [{ date: toISO(d), load: loadFor(1) }];
  let count = 1;
  while (count < totalDays) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (cal.isWorkday(d)) {
      count++;
      loads.push({ date: toISO(d), load: loadFor(count) });
    }
  }
  return loads;
}
function topoOrder(ids, edgesByTo) {
  const indeg = {};
  ids.forEach((id) => indeg[id] = 0);
  const out = {};
  ids.forEach((id) => out[id] = []);
  ids.forEach((id) => (edgesByTo[id] || []).forEach((d) => {
    if (indeg[d.id] === void 0) return;
    out[d.id].push(id);
    indeg[id]++;
  }));
  const q = ids.filter((id) => indeg[id] === 0);
  const order = [];
  const seen = /* @__PURE__ */ new Set();
  while (q.length) {
    const n = q.shift();
    if (seen.has(n)) continue;
    seen.add(n);
    order.push(n);
    (out[n] || []).forEach((m) => {
      indeg[m]--;
      if (indeg[m] === 0) q.push(m);
    });
  }
  ids.forEach((id) => {
    if (!seen.has(id)) order.push(id);
  });
  return order;
}
function deriveProjectStart(tasks, fallback) {
  const dates = (tasks || []).filter((t) => t && t.startDate).map((t) => t.startDate);
  if (dates.length) return dates.reduce((a, b) => a < b ? a : b);
  return fallback || toISO(/* @__PURE__ */ new Date());
}
function earliestSprintFloor(sprintIds, sprintById, cal) {
  let floor = null;
  (sprintIds || []).forEach((id) => {
    const sp = sprintById[id];
    if (!sp || !sp.startDate) return;
    const f = cal.snapForward(sp.startDate);
    if (floor === null || f < floor) floor = f;
  });
  return floor;
}
function runCPM(tasks, cal, projectStart, sprints, opts = {}) {
  const respectManualPins = opts.respectManualPins !== false;
  const leaves = tasks.filter((t) => !isGroupId(tasks, t.id));
  const leafIds = leaves.map((t) => t.id);
  const byId = {};
  tasks.forEach((t) => byId[t.id] = t);
  const sprintById = {};
  (sprints || []).forEach((s) => sprintById[s.id] = s);
  const effPredsOf = {};
  leaves.forEach((t) => {
    effPredsOf[t.id] = effectivePredecessors(byId, t);
  });
  function computeGroupRollup(leafDates) {
    const rolled = /* @__PURE__ */ new Map();
    function rec(id) {
      const children = tasks.filter((t) => t.parentId === id);
      let min = null, max = null;
      children.forEach((c) => {
        const r2 = isGroupId(tasks, c.id) ? rec(c.id) : leafDates.get(c.id);
        if (!r2 || !r2.start) return;
        if (min === null || r2.start < min) min = r2.start;
        if (max === null || r2.finish > max) max = r2.finish;
      });
      const r = { start: min, finish: max };
      rolled.set(id, r);
      return r;
    }
    tasks.filter((t) => isGroupId(tasks, t.id)).forEach((t) => {
      if (!rolled.has(t.id)) rec(t.id);
    });
    return rolled;
  }
  function forwardPass(groupRollup2) {
    const predsOf2 = {};
    leafIds.forEach((id) => predsOf2[id] = []);
    const succsOf2 = {};
    leafIds.forEach((id) => succsOf2[id] = []);
    leaves.forEach((t) => {
      effPredsOf[t.id].forEach((dep) => {
        if (predsOf2[dep.id]) {
          predsOf2[t.id].push({ from: dep.id, type: dep.type, lag: dep.lag });
          succsOf2[dep.id].push({ to: t.id, type: dep.type, lag: dep.lag });
        } else if (groupRollup2 && isGroupId(tasks, dep.id) && groupRollup2.get(dep.id)?.start) {
          predsOf2[t.id].push({ from: dep.id, type: dep.type, lag: dep.lag, groupDates: groupRollup2.get(dep.id) });
        }
      });
    });
    const edgesByTo = {};
    leafIds.forEach((id) => edgesByTo[id] = predsOf2[id].filter((d) => !d.groupDates).map((d) => ({ id: d.from })));
    const order2 = topoOrder(leafIds, edgesByTo);
    const ES2 = {}, EF2 = {};
    order2.forEach((id) => {
      const t = byId[id];
      const preds = predsOf2[id];
      let best = null;
      preds.forEach((dep) => {
        const predDates = dep.groupDates || { start: ES2[dep.from], finish: EF2[dep.from] };
        if (!predDates.start) return;
        const cand = candidateFromDep(cal, dep, predDates, t.duration);
        if (best === null || cand.start > best) best = cand.start;
      });
      let start;
      const hasProgress = (t.progress || 0) > 0;
      if ((respectManualPins || hasProgress) && t.startDate) {
        start = cal.snapForward(t.startDate);
      } else {
        start = best !== null ? best : cal.snapForward(t.startDate || projectStart);
      }
      const sprintFloor = earliestSprintFloor(t.sprintIds, sprintById, cal);
      if (sprintFloor && sprintFloor > start) start = sprintFloor;
      ES2[id] = start;
      EF2[id] = t.duration <= 0 ? start : cal.endFromStart(start, t.duration);
    });
    return { ES: ES2, EF: EF2, order: order2, predsOf: predsOf2, succsOf: succsOf2 };
  }
  let passResult = forwardPass(null);
  let groupRollup = computeGroupRollup(new Map(leafIds.map((id) => [id, { start: passResult.ES[id], finish: passResult.EF[id] }])));
  const MAX_GROUP_DEP_ITERATIONS = 12;
  for (let iter = 0; iter < MAX_GROUP_DEP_ITERATIONS; iter++) {
    const next = forwardPass(groupRollup);
    const stable = leafIds.every((id) => passResult.ES[id] === next.ES[id] && passResult.EF[id] === next.EF[id]);
    passResult = next;
    if (stable) break;
    groupRollup = computeGroupRollup(new Map(leafIds.map((id) => [id, { start: next.ES[id], finish: next.EF[id] }])));
  }
  const { ES, EF, order, predsOf, succsOf } = passResult;
  const projectEnd = leafIds.reduce((mx, id) => EF[id] > mx ? EF[id] : mx, projectStart);
  const LS = {}, LF = {};
  [...order].reverse().forEach((id) => {
    const t = byId[id];
    const succs = succsOf[id];
    let finish;
    if (succs.length === 0) {
      finish = t.milestone && t.milestoneMode === "fixed" && t.fixedDate ? t.fixedDate : projectEnd;
    } else {
      let best = null;
      succs.forEach((dep) => {
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
  const fixedMilestoneIds = new Set(leaves.filter((t) => t.milestone && t.milestoneMode === "fixed").map((t) => t.id));
  const result = /* @__PURE__ */ new Map();
  leafIds.forEach((id) => {
    const float = cal.workdaysBetween(ES[id], LS[id]);
    const t = byId[id];
    const useBackward = fixedMilestoneIds.has(id);
    result.set(id, {
      ES: ES[id],
      EF: EF[id],
      LS: LS[id],
      LF: LF[id],
      float,
      critical: float <= 0,
      governed: useBackward,
      schedStart: useBackward ? LS[id] : ES[id],
      schedFinish: useBackward ? LF[id] : EF[id],
      progress: typeof t.progress === "number" ? t.progress : 0
    });
  });
  rollupSummaries(tasks, result);
  return { result, projectEnd };
}
function rollupSummaries(tasks, result) {
  const summaries = tasks.filter((t) => isGroupId(tasks, t.id));
  function rollup(id) {
    const children = tasks.filter((t) => t.parentId === id);
    let min = null, max = null, anyCritical = false, progressSum = 0, progressCount = 0;
    children.forEach((c) => {
      const r2 = isGroupId(tasks, c.id) ? rollup(c.id) : result.get(c.id);
      if (!r2) return;
      if (min === null || r2.schedStart < min) min = r2.schedStart;
      if (max === null || r2.schedFinish > max) max = r2.schedFinish;
      if (r2.critical) anyCritical = true;
      if (typeof r2.progress === "number") {
        progressSum += r2.progress;
        progressCount++;
      }
    });
    const progress = progressCount ? Math.round(progressSum / progressCount) : 0;
    const r = { ES: min, EF: max, LS: min, LF: max, float: 0, critical: anyCritical, governed: false, schedStart: min, schedFinish: max, isSummary: true, progress };
    result.set(id, r);
    return r;
  }
  tasks.filter((t) => !t.parentId).forEach((t) => {
    if (isGroupId(tasks, t.id)) rollup(t.id);
  });
  summaries.forEach((t) => {
    if (!result.has(t.id)) rollup(t.id);
  });
  return result;
}
function levelResources(tasks, cpmResult, resources, cal, sprints) {
  const leaves = tasks.filter((t) => !isGroupId(tasks, t.id));
  const byId = {};
  tasks.forEach((t) => byId[t.id] = t);
  const leafIdSet = new Set(leaves.map((t) => t.id));
  const sprintById = {};
  (sprints || []).forEach((s) => sprintById[s.id] = s);
  const leafPredsOf = {}, groupPredsOf = {};
  leaves.forEach((t) => {
    const eff = effectivePredecessors(byId, t);
    leafPredsOf[t.id] = eff.filter((d) => leafIdSet.has(d.id)).map((d) => ({ from: d.id, type: d.type, lag: d.lag }));
    groupPredsOf[t.id] = eff.filter((d) => isGroupId(tasks, d.id)).map((d) => ({ from: d.id, type: d.type, lag: d.lag }));
  });
  const groupLeavesCache = {};
  function descendantLeavesOf(groupId) {
    if (groupLeavesCache[groupId]) return groupLeavesCache[groupId];
    const out = [];
    const stack = [groupId];
    while (stack.length) {
      const id = stack.pop();
      tasks.forEach((t) => {
        if (t.parentId !== id) return;
        if (leafIdSet.has(t.id)) out.push(t.id);
        else stack.push(t.id);
      });
    }
    groupLeavesCache[groupId] = out;
    return out;
  }
  const wbsOrder = {};
  buildFlatList(tasks, /* @__PURE__ */ new Set()).forEach((t) => {
    wbsOrder[t.id] = t.taskNo;
  });
  const resById = {};
  resources.forEach((r) => resById[r.id] = r);
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
  const remaining = new Set(leaves.map((t) => t.id));
  const warnings = [];
  function isReady(id) {
    if (!leafPredsOf[id].every((d) => placed[d.from])) return false;
    return groupPredsOf[id].every((dep) => descendantLeavesOf(dep.from).every((leafId) => placed[leafId]));
  }
  function groupRollupFromPlaced(groupId) {
    let min = null, max = null;
    descendantLeavesOf(groupId).forEach((id) => {
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
    if (ready.length === 0) ready = [...remaining];
    ready.sort((a, b) => {
      const fa = cpmResult.get(a)?.float ?? 0, fb = cpmResult.get(b)?.float ?? 0;
      if (fa !== fb) return fa - fb;
      const wa = wbsOrder[a] ?? 999999, wb = wbsOrder[b] ?? 999999;
      return wa - wb;
    });
    const id = ready[0];
    const task = byId[id];
    const hasProgress = (task.progress || 0) > 0;
    if (hasProgress && task.startDate) {
      const start2 = cal.snapForward(task.startDate);
      const finish = task.duration <= 0 ? start2 : cal.endFromStart(start2, task.duration);
      if (task.assigneeId && task.duration > 0 && resById[task.assigneeId]) commit(task.assigneeId, start2, task.duration);
      placed[id] = { start: start2, finish };
      remaining.delete(id);
      continue;
    }
    let minStart = null;
    leafPredsOf[id].forEach((dep) => {
      const p = placed[dep.from];
      if (!p) return;
      const cand = candidateFromDep(cal, dep, p, task.duration);
      if (minStart === null || cand.start > minStart) minStart = cand.start;
    });
    groupPredsOf[id].forEach((dep) => {
      const g = groupRollupFromPlaced(dep.from);
      if (!g.start) return;
      const cand = candidateFromDep(cal, dep, g, task.duration);
      if (minStart === null || cand.start > minStart) minStart = cand.start;
    });
    if (minStart === null) {
      minStart = task.startDate ? cal.snapForward(task.startDate) : cpmResult.get(id)?.ES || cal.snapForward(toISO(/* @__PURE__ */ new Date()));
    }
    const sprintFloor = earliestSprintFloor(task.sprintIds, sprintById, cal);
    if (sprintFloor && sprintFloor > minStart) minStart = sprintFloor;
    let start = cal.snapForward(minStart);
    if (task.assigneeId && task.duration > 0 && resById[task.assigneeId]) {
      let guard = 0;
      while (guard < 2e3) {
        guard++;
        if (spanCheck(task.assigneeId, start, task.duration)) {
          commit(task.assigneeId, start, task.duration);
          placed[id] = { start, finish: cal.endFromStart(start, task.duration) };
          break;
        }
        start = cal.shift(start, 1);
      }
      if (!placed[id]) {
        const finish = cal.endFromStart(start, task.duration);
        placed[id] = { start, finish };
      }
    } else {
      const finish = task.duration <= 0 ? start : cal.endFromStart(start, task.duration);
      placed[id] = { start, finish };
    }
    remaining.delete(id);
  }
  leaves.forEach((t) => {
    if (t.milestone && t.milestoneMode === "fixed" && t.fixedDate && placed[t.id]) {
      if (placed[t.id].finish > t.fixedDate) {
        warnings.push(`\u300C${t.name}\u300D\u306E\u5E73\u6E96\u5316\u5F8C\u306E\u65E5\u7A0B\uFF08${fmtJP(placed[t.id].finish)}\uFF09\u304C\u56FA\u5B9A\u671F\u65E5\uFF08${fmtJP(t.fixedDate)}\uFF09\u3092\u8D85\u904E\u3057\u3066\u3044\u307E\u3059`);
      }
    }
  });
  return { placed, warnings };
}

// src/lib/sprints.js
function detectSprintConflicts(tasks, sprints, schedule) {
  if (!sprints || !sprints.length) return [];
  const sprintById = {};
  sprints.forEach((s) => sprintById[s.id] = s);
  const wbsNoById = {};
  buildFlatList(tasks, /* @__PURE__ */ new Set()).forEach((t) => wbsNoById[t.id] = t.wbsNo);
  const groupIds = /* @__PURE__ */ new Set();
  tasks.forEach((t) => {
    if (t.parentId != null) groupIds.add(t.parentId);
  });
  const out = [];
  tasks.forEach((t) => {
    const ids = t.sprintIds || [];
    if (!ids.length) return;
    if (groupIds.has(t.id)) return;
    const sps = ids.map((id) => sprintById[id]).filter((sp) => sp && sp.startDate && sp.endDate);
    if (!sps.length) return;
    const rangeStart = sps.reduce((mn, sp) => sp.startDate < mn ? sp.startDate : mn, sps[0].startDate);
    const rangeEnd = sps.reduce((mx, sp) => sp.endDate > mx ? sp.endDate : mx, sps[0].endDate);
    const s = schedule.get(t.id);
    if (!s || !s.schedStart || !s.schedFinish) return;
    const reasons = [];
    if (s.schedStart < rangeStart) {
      reasons.push(`\u958B\u59CB\u65E5\uFF08${fmtJP(s.schedStart)}\uFF09\u304C\u30B9\u30D7\u30EA\u30F3\u30C8\u958B\u59CB\u65E5\uFF08${fmtJP(rangeStart)}\uFF09\u3088\u308A\u524D\u306B\u306A\u3063\u3066\u3044\u307E\u3059`);
    }
    if (s.schedFinish > rangeEnd) {
      reasons.push(`\u7D42\u4E86\u65E5\uFF08${fmtJP(s.schedFinish)}\uFF09\u304C\u30B9\u30D7\u30EA\u30F3\u30C8\u7D42\u4E86\u65E5\uFF08${fmtJP(rangeEnd)}\uFF09\u3092\u8D85\u3048\u3066\u3044\u307E\u3059`);
    }
    if (!reasons.length) return;
    if (s.governed) {
      reasons.push("\u56FA\u5B9A\u30DE\u30A4\u30EB\u30B9\u30C8\u30FC\u30F3\u306E\u671F\u65E5\u304C\u512A\u5148\u3055\u308C\u3066\u3044\u308B\u305F\u3081\u3001\u30B9\u30D7\u30EA\u30F3\u30C8\u671F\u9593\u5185\u306B\u53CE\u307E\u308A\u307E\u305B\u3093");
    }
    const sprintName = sps.map((sp) => sp.name || sp.theme || "\uFF08\u7121\u984C\u306E\u30B9\u30D7\u30EA\u30F3\u30C8\uFF09").join("\u3001");
    out.push({ taskId: t.id, name: t.name, wbsNo: wbsNoById[t.id] || "", sprintName, reasons });
  });
  out.sort((a, b) => (a.wbsNo || "").localeCompare(b.wbsNo || "", void 0, { numeric: true }));
  return out;
}
function computeOverlappingSprintIds(sprints) {
  const ids = /* @__PURE__ */ new Set();
  const valid = sprints.filter((s) => s.startDate && s.endDate && s.startDate <= s.endDate);
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      const a = valid[i], b = valid[j];
      if (a.startDate <= b.endDate && b.startDate <= a.endDate) {
        ids.add(a.id);
        ids.add(b.id);
      }
    }
  }
  return ids;
}

// src/lib/exportUtils.js
var PROJECT_SCHEMA_VERSION = 1;
var PROJECT_JSON_SCHEMA = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://lhideki.github.io/project-scheduler/schema/project-export-v1.json",
  title: "Project Scheduler export",
  description: "Project Scheduler \u306E\u300C\u66F8\u304D\u51FA\u3057\u300D\u300C\u8AAD\u307F\u8FBC\u307F\u300D\u3067\u4F7F\u3046JSON\u5F62\u5F0F\u3067\u3059\u3002",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "exportedAt", "tasks", "resources", "sprints", "versions"],
  properties: {
    schemaVersion: { type: "integer", const: PROJECT_SCHEMA_VERSION, description: "\u4FDD\u5B58\u30D5\u30A9\u30FC\u30DE\u30C3\u30C8\u306E\u30B9\u30AD\u30FC\u30DE\u30D0\u30FC\u30B8\u30E7\u30F3" },
    exportedAt: { type: "string", format: "date-time", description: "\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8\u65E5\u6642\uFF08ISO 8601\uFF09" },
    tasks: { type: "array", description: "\u30BF\u30B9\u30AF\u4E00\u89A7", items: { $ref: "#/$defs/task" } },
    resources: { type: "array", description: "\u62C5\u5F53\u8005\u4E00\u89A7", items: { $ref: "#/$defs/resource" } },
    sprints: { type: "array", description: "\u30B9\u30D7\u30EA\u30F3\u30C8\u4E00\u89A7", items: { $ref: "#/$defs/sprint" } },
    versions: { type: "array", description: "\u4FDD\u5B58\u6E08\u307F\u30D0\u30FC\u30B8\u30E7\u30F3\u4E00\u89A7", items: { $ref: "#/$defs/version" } },
    levelingOn: { type: "boolean", default: false, description: "\u30EA\u30BD\u30FC\u30B9\u5E73\u6E96\u5316\u306E\u6709\u52B9/\u7121\u52B9\uFF08\u65E7\u5F62\u5F0F\u306EJSON\u306B\u306F\u5B58\u5728\u305B\u305A\u3001\u305D\u306E\u5834\u5408\u306F false \u6271\u3044\uFF09" },
    calendarExceptions: {
      type: "array",
      description: "\u975E\u7A3C\u50CD\u65E5\u30AB\u30EC\u30F3\u30C0\u30FC\u306E\u4F8B\u5916\uFF08\u4F11\u65E5\u30FB\u7A3C\u50CD\u65E5\u306E\u4E0A\u66F8\u304D\u6307\u5B9A\uFF09\u3002\u65E7\u5F62\u5F0F\u306EJSON\u306B\u306F\u5B58\u5728\u305B\u305A\u3001\u305D\u306E\u5834\u5408\u306F\u7A7A\u914D\u5217\u6271\u3044\u3002",
      items: { $ref: "#/$defs/calendarException" }
    }
  },
  $defs: {
    calendarException: {
      type: "object",
      description: "\u975E\u7A3C\u50CD\u65E5\u30AB\u30EC\u30F3\u30C0\u30FC\u306E\u4F8B\u5916\u3067\u3059\u3002\u571F\u65E5\u30FB\u65E5\u672C\u306E\u795D\u65E5\u306E\u8A08\u7B97\u7D50\u679C\u306B\u5BFE\u3059\u308B\u4E0A\u66F8\u304D\u6307\u5B9A\u3067\u3059\u3002",
      additionalProperties: false,
      required: ["date", "type"],
      properties: {
        date: { type: "string", format: "date", description: "\u5BFE\u8C61\u65E5\uFF08YYYY-MM-DD\uFF09" },
        type: {
          type: "string",
          enum: ["holiday", "workday"],
          description: "holiday\uFF08\u4F11\u65E5\uFF09: \u5E73\u65E5\u3092\u975E\u7A3C\u50CD\u65E5\u306B\u3059\u308B / workday\uFF08\u7A3C\u50CD\u65E5\uFF09: \u571F\u65E5\u30FB\u795D\u65E5\u30FB\u4F11\u65E5\u6307\u5B9A\u3092\u7A3C\u50CD\u65E5\u306B\u3059\u308B\uFF08\u6700\u512A\u5148\uFF09"
        },
        name: { type: "string", description: "\u8868\u793A\u7528\u30E9\u30D9\u30EB\uFF08\u4EFB\u610F\uFF09" }
      }
    },
    dependency: {
      type: "object",
      description: "\u5148\u884C\u30BF\u30B9\u30AF\u3092\u8868\u3059\u30AA\u30D6\u30B8\u30A7\u30AF\u30C8\u3067\u3059\u3002",
      additionalProperties: false,
      required: ["id", "type", "lag"],
      properties: {
        id: { type: "string", description: "\u5148\u884C\u30BF\u30B9\u30AFID" },
        type: { type: "string", enum: ["FS", "SS", "FF", "SF"], description: "\u4F9D\u5B58\u95A2\u4FC2\u306E\u7A2E\u985E" },
        lag: { type: "number", description: "\u30EA\u30FC\u30C9/\u30E9\u30B0\u65E5\u6570" }
      }
    },
    task: {
      type: "object",
      description: "WBS\u4E0A\u306E\u30BF\u30B9\u30AF\u3067\u3059\u3002\u968E\u5C64\u306F parentId \u3067\u8868\u73FE\u3057\u307E\u3059\u3002",
      additionalProperties: true,
      required: ["id", "name", "parentId", "order"],
      properties: {
        id: { type: "string", description: "\u30BF\u30B9\u30AFID" },
        name: { type: "string", description: "\u30BF\u30B9\u30AF\u540D" },
        parentId: { type: ["string", "null"], description: "\u89AA\u30BF\u30B9\u30AFID\u3002\u30EB\u30FC\u30C8\u76F4\u4E0B\u306F null" },
        order: { type: "number", description: "\u540C\u3058\u89AA\u914D\u4E0B\u3067\u306E\u8868\u793A\u9806" },
        startDate: { type: "string", format: "date", description: "\u958B\u59CB\u65E5\uFF08YYYY-MM-DD\uFF09" },
        duration: { type: "number", description: "\u5DE5\u6570\u3002\u30DE\u30A4\u30EB\u30B9\u30C8\u30FC\u30F3\u306F\u901A\u5E38 0" },
        assigneeId: { type: ["string", "null"], description: "\u62C5\u5F53\u8005ID" },
        sprintIds: { type: "array", description: "\u7D10\u4ED8\u3051\u308B\u30B9\u30D7\u30EA\u30F3\u30C8ID\u4E00\u89A7", items: { type: "string" } },
        predecessors: { type: "array", description: "\u5148\u884C\u30BF\u30B9\u30AF\u4E00\u89A7", items: { $ref: "#/$defs/dependency" } },
        progress: { type: "number", description: "\u9032\u6357\u7387\uFF080\u301C100\uFF09" },
        milestone: { type: "boolean", description: "\u30DE\u30A4\u30EB\u30B9\u30C8\u30FC\u30F3\u304B\u3069\u3046\u304B" },
        milestoneMode: { type: "string", enum: ["flexible", "fixed"], description: "\u67D4\u8EDF/\u56FA\u5B9A\u30E2\u30FC\u30C9" },
        fixedDate: { type: "string", format: "date", description: "\u56FA\u5B9A\u30DE\u30A4\u30EB\u30B9\u30C8\u30FC\u30F3\u306E\u65E5\u4ED8\uFF08YYYY-MM-DD\uFF09" },
        savedDuration: { type: "number", description: "\u30DE\u30A4\u30EB\u30B9\u30C8\u30FC\u30F3\u5316\u524D\u306E\u5DE5\u6570\u9000\u907F\u5024" },
        notes: { type: "string", description: "\u8A73\u7D30\u30E1\u30E2" },
        diagX: { type: "number", description: "\u30CD\u30C3\u30C8\u30EF\u30FC\u30AF\u56F3\u306E\u624B\u52D5X\u5EA7\u6A19" },
        diagY: { type: "number", description: "\u30CD\u30C3\u30C8\u30EF\u30FC\u30AF\u56F3\u306E\u624B\u52D5Y\u5EA7\u6A19" }
      }
    },
    resource: {
      type: "object",
      description: "\u62C5\u5F53\u8005\u30EA\u30BD\u30FC\u30B9\u3067\u3059\u3002",
      additionalProperties: false,
      required: ["id", "name", "weeklyCapacity", "monthlyCapacity"],
      properties: {
        id: { type: "string", description: "\u62C5\u5F53\u8005ID" },
        name: { type: "string", description: "\u8868\u793A\u540D" },
        weeklyCapacity: { type: "number", description: "\u9031\u6B21\u7A3C\u50CD\u4E0A\u9650" },
        monthlyCapacity: { type: "number", description: "\u6708\u6B21\u7A3C\u50CD\u4E0A\u9650" }
      }
    },
    sprint: {
      type: "object",
      description: "\u30B9\u30D7\u30EA\u30F3\u30C8\u5B9A\u7FA9\u3067\u3059\u3002",
      additionalProperties: false,
      required: ["id", "name", "startDate", "endDate", "order"],
      properties: {
        id: { type: "string", description: "\u30B9\u30D7\u30EA\u30F3\u30C8ID" },
        name: { type: "string", description: "\u30B9\u30D7\u30EA\u30F3\u30C8\u540D" },
        theme: { type: "string", description: "\u30C6\u30FC\u30DE" },
        startDate: { type: "string", format: "date", description: "\u958B\u59CB\u65E5\uFF08YYYY-MM-DD\uFF09" },
        endDate: { type: "string", format: "date", description: "\u7D42\u4E86\u65E5\uFF08YYYY-MM-DD\uFF09" },
        order: { type: "number", description: "\u8868\u793A\u9806" }
      }
    },
    versionTask: {
      type: "object",
      description: "\u30D0\u30FC\u30B8\u30E7\u30F3\u6BD4\u8F03\u8868\u793A\u7528\u306E\u30BF\u30B9\u30AF\u30B9\u30CA\u30C3\u30D7\u30B7\u30E7\u30C3\u30C8\u3067\u3059\u3002",
      additionalProperties: true,
      required: ["id", "name", "level", "wbsNo", "hasChildren", "critical", "milestone", "assigneeId", "progress"],
      properties: {
        id: { type: "string", description: "\u30BF\u30B9\u30AFID" },
        name: { type: "string", description: "\u30BF\u30B9\u30AF\u540D" },
        level: { type: "number", description: "WBS\u968E\u5C64\u30EC\u30D9\u30EB" },
        wbsNo: { type: "string", description: "WBS\u756A\u53F7" },
        hasChildren: { type: "boolean", description: "\u5B50\u30BF\u30B9\u30AF\u306E\u6709\u7121" },
        schedStart: { type: "string", format: "date", description: "\u8A08\u7B97\u5F8C\u958B\u59CB\u65E5\uFF08YYYY-MM-DD\uFF09" },
        schedFinish: { type: "string", format: "date", description: "\u8A08\u7B97\u5F8C\u7D42\u4E86\u65E5\uFF08YYYY-MM-DD\uFF09" },
        critical: { type: "boolean", description: "\u30AF\u30EA\u30C6\u30A3\u30AB\u30EB\u304B\u3069\u3046\u304B" },
        milestone: { type: "boolean", description: "\u30DE\u30A4\u30EB\u30B9\u30C8\u30FC\u30F3\u304B\u3069\u3046\u304B" },
        duration: { type: ["number", "null"], description: "\u4FDD\u5B58\u6642\u70B9\u306E\u5DE5\u6570" },
        assigneeId: { type: ["string", "null"], description: "\u62C5\u5F53\u8005ID" },
        progress: { type: "number", description: "\u9032\u6357\u7387" }
      }
    },
    version: {
      type: "object",
      description: "\u6BD4\u8F03\u8868\u793A\u7528\u30B9\u30CA\u30C3\u30D7\u30B7\u30E7\u30C3\u30C8\u3068\u5FA9\u5143\u7528\u5B8C\u5168\u30B9\u30CA\u30C3\u30D7\u30B7\u30E7\u30C3\u30C8\u3092\u6301\u3064\u4FDD\u5B58\u6E08\u307F\u30D0\u30FC\u30B8\u30E7\u30F3\u3067\u3059\u3002",
      additionalProperties: true,
      required: ["id", "name", "createdAt", "tasks", "hasWbsInfo", "hasFullSnapshot"],
      properties: {
        id: { type: "string", description: "\u30D0\u30FC\u30B8\u30E7\u30F3ID" },
        name: { type: "string", description: "\u30D0\u30FC\u30B8\u30E7\u30F3\u540D" },
        createdAt: { type: "number", description: "\u4FDD\u5B58\u6642\u523B\uFF08Unix\u30DF\u30EA\u79D2\uFF09" },
        tasks: { type: "array", description: "\u6BD4\u8F03\u8868\u793A\u7528\u306E\u30BF\u30B9\u30AF\u914D\u5217", items: { $ref: "#/$defs/versionTask" } },
        hasWbsInfo: { type: "boolean", description: "WBS\u6BD4\u8F03\u7528\u60C5\u5831\u3092\u542B\u3080\u304B" },
        rawTasks: { type: "array", description: "\u5FA9\u5143\u7528\u306E\u5B8C\u5168\u306A tasks", items: { $ref: "#/$defs/task" } },
        rawResources: { type: "array", description: "\u5FA9\u5143\u7528\u306E\u5B8C\u5168\u306A resources", items: { $ref: "#/$defs/resource" } },
        rawSprints: { type: "array", description: "\u5FA9\u5143\u7528\u306E\u5B8C\u5168\u306A sprints", items: { $ref: "#/$defs/sprint" } },
        rawCalendarExceptions: { type: "array", description: "\u5FA9\u5143\u7528\u306E\u5B8C\u5168\u306A calendarExceptions\uFF08\u3053\u306E\u9805\u76EE\u304C\u7121\u3044\u53E4\u3044\u30B9\u30CA\u30C3\u30D7\u30B7\u30E7\u30C3\u30C8\u306F\u5FA9\u5143\u6642\u306B\u7A7A\u914D\u5217\u6271\u3044\uFF09", items: { $ref: "#/$defs/calendarException" } },
        hasFullSnapshot: { type: "boolean", description: "\u5FA9\u5143\u306B\u5FC5\u8981\u306A raw*\uFF08rawTasks/rawResources/rawSprints\uFF09\u304C\u63C3\u3063\u3066\u3044\u308B\u304B" }
      }
    }
  }
});
function cloneJSON(value) {
  return JSON.parse(JSON.stringify(value));
}
function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function normalizeProjectVersions(versions) {
  if (!Array.isArray(versions) || versions.some((v) => !isObject(v))) {
    throw new Error("invalid_project_json");
  }
  return cloneJSON(versions).map((version) => ({
    ...version,
    hasFullSnapshot: Array.isArray(version.rawTasks) && Array.isArray(version.rawResources) && Array.isArray(version.rawSprints)
  }));
}
function normalizeImportedProject(data) {
  if (!isObject(data) || data.schemaVersion !== PROJECT_SCHEMA_VERSION || typeof data.exportedAt !== "string" || !Array.isArray(data.tasks) || !Array.isArray(data.resources) || !Array.isArray(data.sprints) || !Array.isArray(data.versions) || data.calendarExceptions !== void 0 && !Array.isArray(data.calendarExceptions)) {
    throw new Error("invalid_project_json");
  }
  return {
    schemaVersion: data.schemaVersion,
    exportedAt: data.exportedAt,
    tasks: cloneJSON(data.tasks),
    resources: cloneJSON(data.resources),
    sprints: cloneJSON(data.sprints),
    versions: normalizeProjectVersions(data.versions),
    // 旧形式のJSON（levelingOn未対応）を読み込んだ場合は false にフォールバックする。
    levelingOn: typeof data.levelingOn === "boolean" ? data.levelingOn : false,
    // 旧形式のJSON（calendarExceptions キーなし）のみ空配列にフォールバックする。
    calendarExceptions: Array.isArray(data.calendarExceptions) ? cloneJSON(data.calendarExceptions) : []
  };
}

// src/agent/cli.js
function fail(message, extra = {}) {
  process.stdout.write(JSON.stringify({ ok: false, error: message, ...extra }, null, 2) + "\n");
  process.exit(1);
}
function emit(obj) {
  process.stdout.write(JSON.stringify({ ok: true, ...obj }, null, 2) + "\n");
}
function readProjectFile(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    fail(`\u30D5\u30A1\u30A4\u30EB\u3092\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093: ${path}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    fail(`JSON\u3068\u3057\u3066\u89E3\u91C8\u3067\u304D\u307E\u305B\u3093: ${path}`, { detail: String(e && e.message || e) });
  }
  return parsed;
}
function normalizeOrFail(raw, path) {
  try {
    return normalizeImportedProject(raw);
  } catch (e) {
    if (e && e.message === "invalid_project_json") {
      fail(`\u4FDD\u5B58\u30D5\u30A9\u30FC\u30DE\u30C3\u30C8\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093\uFF08schemaVersion:1 \u3068\u5FC5\u9808\u9805\u76EE\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\uFF09: ${path}`);
    }
    fail(`\u4FDD\u5B58\u30D5\u30A9\u30FC\u30DE\u30C3\u30C8\u3092\u6B63\u898F\u5316\u3067\u304D\u307E\u305B\u3093: ${path}`, { detail: String(e && e.message || e) });
  }
}
function parseArgs(argv) {
  const positional = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === void 0 || next.startsWith("--")) {
        opts[key] = true;
      } else {
        opts[key] = next;
        i++;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, opts };
}
function resolveLeveling(optValue, data) {
  const v = optValue === void 0 ? "auto" : String(optValue).toLowerCase();
  if (v === "on") return true;
  if (v === "off") return false;
  if (v === "auto") return !!data.levelingOn;
  fail(`--leveling \u306F on / off / auto \u306E\u3044\u305A\u308C\u304B\u3092\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\uFF08\u6307\u5B9A\u5024: ${optValue}\uFF09`);
}
function makeProjectCalendar(projectStart, calendarExceptions = []) {
  const y = Number(projectStart.slice(0, 4));
  return makeCalendar(buildHolidayMap(y - 1, y + 6), calendarExceptions);
}
function computeSchedule(data, opts = {}) {
  const respectManualPins = opts.respectManualPins !== false;
  const leveling = !!opts.leveling;
  const tasks = data.tasks || [];
  const resources = data.resources || [];
  const sprints = data.sprints || [];
  const calendarExceptions = data.calendarExceptions || [];
  const projectStart = deriveProjectStart(tasks, toISO(/* @__PURE__ */ new Date()));
  const cal = makeProjectCalendar(projectStart, calendarExceptions);
  const cpm = runCPM(tasks, cal, projectStart, sprints, { respectManualPins });
  let schedule = cpm.result;
  let levelWarnings = [];
  if (leveling) {
    const { placed, warnings } = levelResources(tasks, cpm.result, resources, cal, sprints);
    const merged = new Map(cpm.result);
    for (const [id, dates] of Object.entries(placed)) {
      const prev = merged.get(id) || {};
      merged.set(id, { ...prev, schedStart: dates.start, schedFinish: dates.finish });
    }
    rollupSummaries(tasks, merged);
    schedule = merged;
    levelWarnings = warnings;
  }
  let projectEnd = cpm.projectEnd;
  schedule.forEach((v) => {
    if (v.schedFinish && v.schedFinish > projectEnd) projectEnd = v.schedFinish;
  });
  const sprintConflicts = detectSprintConflicts(tasks, sprints, schedule);
  return { projectStart, cal, cpm, schedule, projectEnd, leveling, levelWarnings, sprintConflicts };
}
function scheduleRows(data, schedule) {
  return buildFlatList(data.tasks, /* @__PURE__ */ new Set()).map((t) => {
    const s = schedule.get(t.id) || {};
    return {
      id: t.id,
      wbsNo: t.wbsNo,
      name: t.name,
      level: t.level,
      isGroup: t.hasChildren,
      assigneeId: t.assigneeId || null,
      milestone: !!t.milestone,
      milestoneMode: t.milestone ? t.milestoneMode || "flexible" : void 0,
      duration: typeof t.duration === "number" ? t.duration : void 0,
      progress: typeof s.progress === "number" ? s.progress : t.progress || 0,
      schedStart: s.schedStart ?? null,
      schedFinish: s.schedFinish ?? null,
      critical: !!s.critical,
      float: typeof s.float === "number" ? s.float : null,
      governed: !!s.governed
    };
  });
}
function nameOf(tasks, id) {
  const t = tasks.find((x) => x.id === id);
  return t ? t.name : id;
}
var ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isISODate(v) {
  if (typeof v !== "string" || !ISO_DATE_RE.test(v)) return false;
  const d = /* @__PURE__ */ new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && v === d.toISOString().slice(0, 10);
}
function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}
function checkFieldShapes(data) {
  const issues = [];
  const label = (t, i) => `\u30BF\u30B9\u30AF#${i + 1}${t && t.name ? `\u300C${t.name}\u300D` : t && t.id ? `\uFF08id: ${t.id}\uFF09` : ""}`;
  const DEP_TYPES = /* @__PURE__ */ new Set(["FS", "SS", "FF", "SF"]);
  (data.tasks || []).forEach((t, i) => {
    if (typeof t !== "object" || t === null) {
      issues.push({ severity: "error", code: "task-not-object", message: `\u30BF\u30B9\u30AF#${i + 1} \u304C\u30AA\u30D6\u30B8\u30A7\u30AF\u30C8\u3067\u306F\u3042\u308A\u307E\u305B\u3093` });
      return;
    }
    if (typeof t.id !== "string" || !t.id) {
      issues.push({ severity: "error", code: "task-id-invalid", message: `${label(t, i)} \u306E id \u304C\u6587\u5B57\u5217\u3067\u306F\u3042\u308A\u307E\u305B\u3093` });
    }
    if (t.parentId != null && typeof t.parentId !== "string") {
      issues.push({ severity: "error", code: "task-parentId-invalid", ids: [t.id], message: `${label(t, i)} \u306E parentId \u304C\u6587\u5B57\u5217\u3067\u3082 null \u3067\u3082\u3042\u308A\u307E\u305B\u3093` });
    }
    if (t.startDate != null && !isISODate(t.startDate)) {
      issues.push({ severity: "error", code: "task-startDate-invalid", ids: [t.id], message: `${label(t, i)} \u306E startDate\u300C${t.startDate}\u300D\u304C YYYY-MM-DD \u5F62\u5F0F\u3067\u306F\u3042\u308A\u307E\u305B\u3093` });
    }
    if (t.fixedDate != null && !isISODate(t.fixedDate)) {
      issues.push({ severity: "error", code: "task-fixedDate-invalid", ids: [t.id], message: `${label(t, i)} \u306E fixedDate\u300C${t.fixedDate}\u300D\u304C YYYY-MM-DD \u5F62\u5F0F\u3067\u306F\u3042\u308A\u307E\u305B\u3093` });
    }
    if (t.duration != null && !isFiniteNumber(t.duration)) {
      issues.push({ severity: "error", code: "task-duration-invalid", ids: [t.id], message: `${label(t, i)} \u306E duration \u304C\u6570\u5024\u3067\u306F\u3042\u308A\u307E\u305B\u3093` });
    }
    if (t.progress != null && !isFiniteNumber(t.progress)) {
      issues.push({ severity: "error", code: "task-progress-invalid", ids: [t.id], message: `${label(t, i)} \u306E progress \u304C\u6570\u5024\u3067\u306F\u3042\u308A\u307E\u305B\u3093` });
    }
    if (t.sprintIds != null && !Array.isArray(t.sprintIds)) {
      issues.push({ severity: "error", code: "task-sprintIds-invalid", ids: [t.id], message: `${label(t, i)} \u306E sprintIds \u304C\u914D\u5217\u3067\u306F\u3042\u308A\u307E\u305B\u3093` });
    }
    if (t.predecessors != null && !Array.isArray(t.predecessors)) {
      issues.push({ severity: "error", code: "task-predecessors-invalid", ids: [t.id], message: `${label(t, i)} \u306E predecessors \u304C\u914D\u5217\u3067\u306F\u3042\u308A\u307E\u305B\u3093` });
    } else {
      (t.predecessors || []).forEach((p, j) => {
        if (typeof p !== "object" || p === null || typeof p.id !== "string" || !p.id) {
          issues.push({ severity: "error", code: "dependency-id-invalid", ids: [t.id], message: `${label(t, i)} \u306E\u5148\u884C\u30BF\u30B9\u30AF#${j + 1} \u306B id \u304C\u3042\u308A\u307E\u305B\u3093` });
        }
        if (!DEP_TYPES.has(p && p.type)) {
          issues.push({ severity: "error", code: "dependency-type-invalid", ids: [t.id], message: `${label(t, i)} \u306E\u5148\u884C\u30BF\u30B9\u30AF#${j + 1} \u306E type\u300C${p && p.type}\u300D\u304C FS/SS/FF/SF \u3067\u306F\u3042\u308A\u307E\u305B\u3093` });
        }
        if (p && p.lag != null && !isFiniteNumber(p.lag)) {
          issues.push({ severity: "error", code: "dependency-lag-invalid", ids: [t.id], message: `${label(t, i)} \u306E\u5148\u884C\u30BF\u30B9\u30AF#${j + 1} \u306E lag \u304C\u6570\u5024\u3067\u306F\u3042\u308A\u307E\u305B\u3093` });
        }
      });
    }
  });
  (data.resources || []).forEach((r, i) => {
    if (typeof r !== "object" || r === null || typeof r.id !== "string" || !r.id) {
      issues.push({ severity: "error", code: "resource-id-invalid", message: `\u30EA\u30BD\u30FC\u30B9#${i + 1} \u306E id \u304C\u6587\u5B57\u5217\u3067\u306F\u3042\u308A\u307E\u305B\u3093` });
    }
    if (r && r.weeklyCapacity != null && !isFiniteNumber(r.weeklyCapacity)) {
      issues.push({ severity: "error", code: "resource-weeklyCapacity-invalid", message: `\u30EA\u30BD\u30FC\u30B9#${i + 1} \u306E weeklyCapacity \u304C\u6570\u5024\u3067\u306F\u3042\u308A\u307E\u305B\u3093` });
    }
    if (r && r.monthlyCapacity != null && !isFiniteNumber(r.monthlyCapacity)) {
      issues.push({ severity: "error", code: "resource-monthlyCapacity-invalid", message: `\u30EA\u30BD\u30FC\u30B9#${i + 1} \u306E monthlyCapacity \u304C\u6570\u5024\u3067\u306F\u3042\u308A\u307E\u305B\u3093` });
    }
  });
  (data.sprints || []).forEach((s, i) => {
    if (typeof s !== "object" || s === null || typeof s.id !== "string" || !s.id) {
      issues.push({ severity: "error", code: "sprint-id-invalid", message: `\u30B9\u30D7\u30EA\u30F3\u30C8#${i + 1} \u306E id \u304C\u6587\u5B57\u5217\u3067\u306F\u3042\u308A\u307E\u305B\u3093` });
    }
    if (s && s.startDate != null && !isISODate(s.startDate)) {
      issues.push({ severity: "error", code: "sprint-startDate-invalid", message: `\u30B9\u30D7\u30EA\u30F3\u30C8#${i + 1} \u306E startDate\u300C${s.startDate}\u300D\u304C YYYY-MM-DD \u5F62\u5F0F\u3067\u306F\u3042\u308A\u307E\u305B\u3093` });
    }
    if (s && s.endDate != null && !isISODate(s.endDate)) {
      issues.push({ severity: "error", code: "sprint-endDate-invalid", message: `\u30B9\u30D7\u30EA\u30F3\u30C8#${i + 1} \u306E endDate\u300C${s.endDate}\u300D\u304C YYYY-MM-DD \u5F62\u5F0F\u3067\u306F\u3042\u308A\u307E\u305B\u3093` });
    }
  });
  if (data.calendarExceptions != null && !Array.isArray(data.calendarExceptions)) {
    issues.push({ severity: "error", code: "calendarExceptions-invalid", message: "calendarExceptions \u304C\u914D\u5217\u3067\u306F\u3042\u308A\u307E\u305B\u3093" });
  } else {
    (data.calendarExceptions || []).forEach((e, i) => {
      if (typeof e !== "object" || e === null) {
        issues.push({ severity: "error", code: "calendar-exception-not-object", message: `\u30AB\u30EC\u30F3\u30C0\u30FC\u4F8B\u5916#${i + 1} \u304C\u30AA\u30D6\u30B8\u30A7\u30AF\u30C8\u3067\u306F\u3042\u308A\u307E\u305B\u3093` });
        return;
      }
      if (!isISODate(e.date)) {
        issues.push({ severity: "error", code: "calendar-exception-date-invalid", message: `\u30AB\u30EC\u30F3\u30C0\u30FC\u4F8B\u5916#${i + 1} \u306E date\u300C${e.date}\u300D\u304C YYYY-MM-DD \u5F62\u5F0F\u3067\u306F\u3042\u308A\u307E\u305B\u3093` });
      }
      if (e.type !== "holiday" && e.type !== "workday") {
        issues.push({ severity: "error", code: "calendar-exception-type-invalid", message: `\u30AB\u30EC\u30F3\u30C0\u30FC\u4F8B\u5916#${i + 1} \u306E type\u300C${e.type}\u300D\u304C holiday / workday \u3067\u306F\u3042\u308A\u307E\u305B\u3093` });
      }
    });
  }
  return issues;
}
function findParentCycles(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const cycles = [];
  const reportedKeys = /* @__PURE__ */ new Set();
  const settled = /* @__PURE__ */ new Set();
  for (const start of tasks) {
    if (settled.has(start.id)) continue;
    const path = [];
    const inPath = /* @__PURE__ */ new Set();
    let cur = start;
    let hitCycle = false;
    while (cur && cur.parentId != null) {
      if (inPath.has(cur.id)) {
        const cyc = path.slice(path.indexOf(cur.id));
        const key = [...cyc].sort().join("\0");
        if (!reportedKeys.has(key)) {
          reportedKeys.add(key);
          cycles.push(cyc);
        }
        hitCycle = true;
        break;
      }
      path.push(cur.id);
      inPath.add(cur.id);
      cur = byId.get(cur.parentId);
    }
    if (!hitCycle) path.forEach((id) => settled.add(id));
  }
  return cycles;
}
function findDependencyCycles(tasks) {
  const adj = new Map(tasks.map((t) => [t.id, []]));
  for (const t of tasks) {
    for (const p of t.predecessors || []) {
      if (adj.has(p.id)) adj.get(p.id).push(t.id);
    }
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(tasks.map((t) => [t.id, WHITE]));
  const stack = [];
  const cycles = [];
  const dfs = (u) => {
    color.set(u, GRAY);
    stack.push(u);
    for (const v of adj.get(u) || []) {
      if (color.get(v) === GRAY) {
        const i = stack.indexOf(v);
        if (i >= 0) cycles.push(stack.slice(i).concat(v));
      } else if (color.get(v) === WHITE) {
        dfs(v);
      }
    }
    stack.pop();
    color.set(u, BLACK);
  };
  for (const t of tasks) if (color.get(t.id) === WHITE) dfs(t.id);
  return cycles;
}
function analyzeIntegrity(data) {
  const tasks = data.tasks || [];
  const shapeIssues = checkFieldShapes(data);
  if (shapeIssues.some((i) => i.severity === "error")) return shapeIssues;
  const issues = [...shapeIssues];
  const seen = /* @__PURE__ */ new Set();
  const dup = /* @__PURE__ */ new Set();
  for (const t of tasks) {
    if (seen.has(t.id)) dup.add(t.id);
    seen.add(t.id);
  }
  for (const id of dup) {
    issues.push({ severity: "error", code: "duplicate-task-id", ids: [id], message: `\u30BF\u30B9\u30AFID\u300C${id}\u300D\u304C\u91CD\u8907\u3057\u3066\u3044\u307E\u3059` });
  }
  for (const cyc of findParentCycles(tasks)) {
    issues.push({
      severity: "error",
      code: "parent-cycle",
      ids: cyc,
      message: `\u89AA\u5B50\u95A2\u4FC2\u304C\u5FAA\u74B0\u3057\u3066\u3044\u307E\u3059: ${cyc.map((id) => nameOf(tasks, id)).join(" \u2192 ")}`
    });
  }
  const taskIds = seen;
  const resIds = new Set((data.resources || []).map((r) => r.id));
  const sprintIds = new Set((data.sprints || []).map((s) => s.id));
  for (const t of tasks) {
    if (t.parentId != null && !taskIds.has(t.parentId)) {
      issues.push({ severity: "error", code: "parent-missing", ids: [t.id], message: `\u300C${t.name}\u300D\u306E\u89AA\u30BF\u30B9\u30AF\u300C${t.parentId}\u300D\u304C\u5B58\u5728\u3057\u307E\u305B\u3093` });
    }
    if (t.assigneeId && !resIds.has(t.assigneeId)) {
      issues.push({ severity: "warning", code: "assignee-missing", ids: [t.id], message: `\u300C${t.name}\u300D\u306E\u62C5\u5F53\u8005\u300C${t.assigneeId}\u300D\u304C\u5B58\u5728\u3057\u307E\u305B\u3093` });
    }
    for (const sid of t.sprintIds || []) {
      if (!sprintIds.has(sid)) {
        issues.push({ severity: "warning", code: "sprint-missing", ids: [t.id], message: `\u300C${t.name}\u300D\u306E\u30B9\u30D7\u30EA\u30F3\u30C8\u53C2\u7167\u300C${sid}\u300D\u304C\u5B58\u5728\u3057\u307E\u305B\u3093` });
      }
    }
    for (const p of t.predecessors || []) {
      if (p.id === t.id) {
        issues.push({ severity: "error", code: "self-dependency", ids: [t.id], message: `\u300C${t.name}\u300D\u304C\u81EA\u5206\u81EA\u8EAB\u306B\u4F9D\u5B58\u3057\u3066\u3044\u307E\u3059` });
      } else if (!taskIds.has(p.id)) {
        issues.push({ severity: "error", code: "predecessor-missing", ids: [t.id], message: `\u300C${t.name}\u300D\u306E\u5148\u884C\u30BF\u30B9\u30AF\u300C${p.id}\u300D\u304C\u5B58\u5728\u3057\u307E\u305B\u3093` });
      }
    }
    if ((t.predecessors || []).length && isGroupId(tasks, t.id)) {
      issues.push({ severity: "warning", code: "group-has-predecessors", ids: [t.id], message: `\u30B0\u30EB\u30FC\u30D7\u300C${t.name}\u300D\u306B\u5148\u884C\u30BF\u30B9\u30AF\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u3059\uFF08\u4F9D\u5B58\u306F\u30EA\u30FC\u30D5\u30BF\u30B9\u30AF\u306B\u4ED8\u3051\u3066\u304F\u3060\u3055\u3044\uFF09` });
    }
  }
  for (const cyc of findDependencyCycles(tasks)) {
    issues.push({
      severity: "error",
      code: "dependency-cycle",
      ids: cyc,
      message: `\u5FAA\u74B0\u4F9D\u5B58: ${cyc.map((id) => nameOf(tasks, id)).join(" \u2192 ")}`
    });
  }
  const overlaps = computeOverlappingSprintIds(data.sprints || []);
  if (overlaps.size) {
    issues.push({ severity: "warning", code: "sprint-overlap", ids: [...overlaps], message: `\u671F\u9593\u304C\u91CD\u8907\u3057\u3066\u3044\u308B\u30B9\u30D7\u30EA\u30F3\u30C8\u304C\u3042\u308A\u307E\u3059: ${[...overlaps].join(", ")}` });
  }
  const exByDate = /* @__PURE__ */ new Map();
  for (const e of data.calendarExceptions || []) {
    if (!e || typeof e.date !== "string") continue;
    if (!exByDate.has(e.date)) exByDate.set(e.date, /* @__PURE__ */ new Set());
    exByDate.get(e.date).add(e.type);
  }
  for (const [date, types] of exByDate) {
    if (types.has("holiday") && types.has("workday")) {
      issues.push({ severity: "warning", code: "calendar-exception-conflict", message: `${date} \u306B\u4F11\u65E5\u3068\u7A3C\u50CD\u65E5\u306E\u4E21\u65B9\u304C\u6307\u5B9A\u3055\u308C\u3066\u3044\u307E\u3059\uFF08\u7A3C\u50CD\u65E5\u304C\u512A\u5148\u3055\u308C\u307E\u3059\uFF09` });
    }
  }
  return issues;
}
function buildVersionSnapshot(data, schedule, name) {
  const flatAll = buildFlatList(data.tasks, /* @__PURE__ */ new Set());
  const tasks = flatAll.map((t) => {
    const s = schedule.get(t.id) || {};
    return {
      id: t.id,
      name: t.name,
      level: t.level,
      wbsNo: t.wbsNo,
      hasChildren: t.hasChildren,
      schedStart: s.schedStart,
      schedFinish: s.schedFinish,
      critical: !!s.critical,
      milestone: !!t.milestone,
      duration: typeof t.duration === "number" ? t.duration : null,
      assigneeId: t.assigneeId || null,
      progress: typeof s.progress === "number" ? s.progress : 0
    };
  });
  return {
    id: `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    createdAt: Date.now(),
    tasks,
    hasWbsInfo: true,
    rawTasks: JSON.parse(JSON.stringify(data.tasks)),
    rawResources: JSON.parse(JSON.stringify(data.resources || [])),
    rawSprints: JSON.parse(JSON.stringify(data.sprints || [])),
    rawCalendarExceptions: JSON.parse(JSON.stringify(data.calendarExceptions || [])),
    hasFullSnapshot: true
  };
}
function applyAutoSchedule(data, projectStart, cal) {
  const auto = runCPM(data.tasks, cal, projectStart, data.sprints || [], { respectManualPins: false });
  const changed = [];
  const tasks = data.tasks.map((t) => {
    if (isGroupId(data.tasks, t.id)) return t;
    const s = auto.result.get(t.id);
    if (!s || !s.schedStart || s.isSummary) return t;
    if (t.startDate !== s.schedStart) changed.push({ id: t.id, from: t.startDate ?? null, to: s.schedStart });
    return { ...t, startDate: s.schedStart };
  });
  return { tasks, changed };
}
function tryComputeSchedule(data, opts) {
  try {
    return { ok: true, result: computeSchedule(data, opts) };
  } catch (e) {
    return { ok: false, error: `\u30B9\u30B1\u30B8\u30E5\u30FC\u30EB\u8A08\u7B97\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${String(e && e.message || e)}` };
  }
}
function cmdValidate(positional) {
  const [path] = positional;
  if (!path) fail("\u4F7F\u3044\u65B9: validate <file>");
  const raw = readProjectFile(path);
  let data;
  try {
    data = normalizeImportedProject(raw);
  } catch (e) {
    const schemaError = e && e.message === "invalid_project_json";
    return emit({
      command: "validate",
      file: path,
      valid: false,
      schemaValid: false,
      issues: [{
        severity: "error",
        code: schemaError ? "schema" : "normalize",
        message: schemaError ? "\u4FDD\u5B58\u30D5\u30A9\u30FC\u30DE\u30C3\u30C8\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093\uFF08schemaVersion:1 \u3068\u5FC5\u9808\u30C8\u30C3\u30D7\u30EC\u30D9\u30EB\u9805\u76EE tasks/resources/sprints/versions/exportedAt \u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\uFF09" : String(e && e.message || e)
      }]
    });
  }
  const issues = analyzeIntegrity(data);
  const hasError = issues.some((i) => i.severity === "error");
  emit({
    command: "validate",
    file: path,
    valid: !hasError,
    schemaValid: true,
    counts: {
      tasks: data.tasks.length,
      resources: data.resources.length,
      sprints: data.sprints.length,
      versions: data.versions.length
    },
    issues
  });
}
function cmdRecalc(positional, opts) {
  const [path] = positional;
  if (!path) fail("\u4F7F\u3044\u65B9: recalc <file> [--leveling on|off|auto]");
  const data = normalizeOrFail(readProjectFile(path), path);
  const integrity = analyzeIntegrity(data);
  const leveling = resolveLeveling(opts.leveling, data);
  const computed = tryComputeSchedule(data, { respectManualPins: true, leveling });
  if (!computed.ok) {
    return emit({ command: "recalc", file: path, computeFailed: true, error: computed.error, integrityIssues: integrity });
  }
  const r = computed.result;
  emit({
    command: "recalc",
    file: path,
    conditions: {
      leveling,
      levelingSource: opts.leveling === void 0 || String(opts.leveling).toLowerCase() === "auto" ? "json" : "override",
      projectStart: r.projectStart,
      respectManualPins: true
    },
    projectEnd: r.projectEnd,
    tasks: scheduleRows(data, r.schedule),
    sprintConflicts: r.sprintConflicts,
    levelWarnings: r.levelWarnings,
    integrityIssues: integrity
  });
}
function cmdPlan(positional, opts) {
  const [originalPath, editedPath] = positional;
  if (!originalPath || !editedPath) {
    fail("\u4F7F\u3044\u65B9: plan <original.json> <edited.json> [--reschedule] [--leveling on|off|auto]");
  }
  const original = normalizeOrFail(readProjectFile(originalPath), originalPath);
  const edited = normalizeOrFail(readProjectFile(editedPath), editedPath);
  const integrity = analyzeIntegrity(edited);
  if (integrity.some((i) => i.severity === "error")) {
    return emit({
      command: "plan",
      original: originalPath,
      edited: editedPath,
      blocked: true,
      reason: "\u7DE8\u96C6\u5F8C\u30C7\u30FC\u30BF\u306B\u6574\u5408\u6027\u30A8\u30E9\u30FC\u304C\u3042\u308A\u307E\u3059\u3002\u4FEE\u6B63\u3057\u3066\u304B\u3089\u518D\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      integrityIssues: integrity
    });
  }
  const reschedule = !!opts.reschedule;
  const beforeLeveling = !!original.levelingOn;
  const afterLeveling = resolveLeveling(opts.leveling, edited);
  const beforeComputed = tryComputeSchedule(original, { respectManualPins: true, leveling: beforeLeveling });
  if (!beforeComputed.ok) {
    return emit({ command: "plan", original: originalPath, edited: editedPath, blocked: true, reason: beforeComputed.error, integrityIssues: analyzeIntegrity(original) });
  }
  const before = beforeComputed.result;
  let proposedTasks = edited.tasks;
  let startDateChanges = [];
  if (reschedule) {
    const editedProjectStart = deriveProjectStart(edited.tasks, toISO(/* @__PURE__ */ new Date()));
    const editedCal = makeProjectCalendar(editedProjectStart, edited.calendarExceptions || []);
    const applied = applyAutoSchedule(edited, editedProjectStart, editedCal);
    proposedTasks = applied.tasks;
    startDateChanges = applied.changed;
  }
  const snapshotName = `AI\u8ABF\u6574\u524D ${(/* @__PURE__ */ new Date()).toISOString().slice(0, 16).replace("T", " ")}`;
  const proposed = {
    ...edited,
    tasks: proposedTasks,
    levelingOn: afterLeveling,
    versions: [buildVersionSnapshot(original, before.schedule, snapshotName), ...edited.versions],
    exportedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const afterComputed = tryComputeSchedule(proposed, { respectManualPins: true, leveling: afterLeveling });
  if (!afterComputed.ok) {
    return emit({ command: "plan", original: originalPath, edited: editedPath, blocked: true, reason: afterComputed.error, integrityIssues: integrity });
  }
  const after = afterComputed.result;
  const leveling = afterLeveling;
  const beforeRows = scheduleRows(original, before.schedule);
  const afterRows = scheduleRows(proposed, after.schedule);
  const beforeById = new Map(beforeRows.map((r) => [r.id, r]));
  const afterIds = new Set(afterRows.map((r) => r.id));
  const scheduleChanges = [];
  for (const a of afterRows) {
    const b = beforeById.get(a.id);
    if (!b) {
      scheduleChanges.push({ id: a.id, wbsNo: a.wbsNo, name: a.name, kind: "added", schedStart: a.schedStart, schedFinish: a.schedFinish, critical: a.critical });
      continue;
    }
    const startChanged = b.schedStart !== a.schedStart;
    const finishChanged = b.schedFinish !== a.schedFinish;
    const critChanged = b.critical !== a.critical;
    if (!startChanged && !finishChanged && !critChanged) continue;
    let shiftWorkdays;
    if (startChanged && b.schedStart && a.schedStart) {
      shiftWorkdays = after.cal.workdaysBetween(b.schedStart, a.schedStart);
    }
    scheduleChanges.push({
      id: a.id,
      wbsNo: a.wbsNo,
      name: a.name,
      kind: "changed",
      ...startChanged ? { schedStart: { from: b.schedStart, to: a.schedStart } } : {},
      ...finishChanged ? { schedFinish: { from: b.schedFinish, to: a.schedFinish } } : {},
      ...critChanged ? { critical: { from: b.critical, to: a.critical } } : {},
      ...shiftWorkdays !== void 0 ? { shiftWorkdays } : {}
    });
  }
  for (const b of beforeRows) {
    if (!afterIds.has(b.id)) scheduleChanges.push({ id: b.id, wbsNo: b.wbsNo, name: b.name, kind: "removed" });
  }
  const newlyCritical = scheduleChanges.filter((c) => c.critical && c.critical.from === false && c.critical.to === true).map((c) => ({ id: c.id, wbsNo: c.wbsNo, name: c.name }));
  const noLongerCritical = scheduleChanges.filter((c) => c.critical && c.critical.from === true && c.critical.to === false).map((c) => ({ id: c.id, wbsNo: c.wbsNo, name: c.name }));
  emit({
    command: "plan",
    original: originalPath,
    edited: editedPath,
    blocked: false,
    conditions: {
      mode: reschedule ? "reschedule" : "adjust",
      leveling,
      levelingSource: opts.leveling === void 0 || String(opts.leveling).toLowerCase() === "auto" ? "json" : "override",
      levelingChanged: beforeLeveling !== afterLeveling,
      projectStart: after.projectStart
    },
    summary: {
      projectEnd: { from: before.projectEnd, to: after.projectEnd },
      tasksWithChangedSchedule: scheduleChanges.filter((c) => c.kind === "changed").length,
      startDateWritebacks: startDateChanges.length,
      newlyCritical,
      noLongerCritical,
      snapshotName
    },
    startDateChanges,
    scheduleChanges,
    sprintConflicts: { before: before.sprintConflicts, after: after.sprintConflicts },
    levelWarnings: { before: before.levelWarnings, after: after.levelWarnings },
    integrityIssues: integrity,
    proposed
  });
}
function cmdExplain(positional, opts) {
  const [path] = positional;
  const taskId = opts.task;
  if (!path || !taskId) fail("\u4F7F\u3044\u65B9: explain <file> --task <taskId> [--leveling on|off|auto]");
  const data = normalizeOrFail(readProjectFile(path), path);
  const task = data.tasks.find((t) => t.id === taskId);
  if (!task) fail(`\u30BF\u30B9\u30AF\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093: ${taskId}`);
  const leveling = resolveLeveling(opts.leveling, data);
  const computed = tryComputeSchedule(data, { respectManualPins: true, leveling });
  if (!computed.ok) {
    return emit({ command: "explain", file: path, computeFailed: true, error: computed.error, integrityIssues: analyzeIntegrity(data) });
  }
  const r = computed.result;
  const s = r.schedule.get(taskId) || {};
  const byId = {};
  data.tasks.forEach((t) => byId[t.id] = t);
  const sprintById = {};
  (data.sprints || []).forEach((sp) => sprintById[sp.id] = sp);
  let predecessors = [];
  if (!isGroupId(data.tasks, taskId)) {
    predecessors = effectivePredecessors(byId, task).map((dep) => {
      const ps = r.schedule.get(dep.id) || {};
      let candidate = null;
      if (ps.schedStart && ps.schedFinish) {
        candidate = candidateFromDep(r.cal, dep, { start: ps.schedStart, finish: ps.schedFinish }, task.duration || 0).start;
      }
      return {
        id: dep.id,
        name: nameOf(data.tasks, dep.id),
        type: dep.type,
        lag: dep.lag,
        predFinish: ps.schedFinish ?? null,
        impliedStart: candidate
      };
    });
  }
  const bindingPred = predecessors.reduce((best, p) => {
    if (!p.impliedStart) return best;
    if (!best || p.impliedStart > best.impliedStart) return p;
    return best;
  }, null);
  const sprintFloor = earliestSprintFloor(task.sprintIds, sprintById, r.cal);
  const isPinned = (task.progress || 0) > 0 || !!task.startDate;
  const sprintFloorApplied = !!(sprintFloor && s.schedStart && sprintFloor === s.schedStart && !isPinned && (!bindingPred || !bindingPred.impliedStart || sprintFloor > bindingPred.impliedStart));
  emit({
    command: "explain",
    file: path,
    task: {
      id: task.id,
      name: task.name,
      duration: task.duration ?? null,
      startDate: task.startDate ?? null,
      progress: task.progress || 0,
      milestone: !!task.milestone,
      milestoneMode: task.milestone ? task.milestoneMode || "flexible" : null,
      fixedDate: task.fixedDate ?? null,
      sprintIds: task.sprintIds || []
    },
    conditions: { leveling, projectStart: r.projectStart },
    schedule: {
      ES: s.ES ?? null,
      EF: s.EF ?? null,
      LS: s.LS ?? null,
      LF: s.LF ?? null,
      schedStart: s.schedStart ?? null,
      schedFinish: s.schedFinish ?? null,
      float: typeof s.float === "number" ? s.float : null,
      critical: !!s.critical,
      governed: !!s.governed
    },
    drivers: {
      pinned: isPinned,
      pinnedReason: (task.progress || 0) > 0 ? "\u9032\u6357\u7387\u304C\u5165\u529B\u6E08\u307F\uFF08\u7740\u624B\u6E08\u307F\uFF09\u306E\u305F\u3081\u958B\u59CB\u65E5\u306B\u56FA\u5B9A" : task.startDate ? "\u958B\u59CB\u65E5\u304C\u624B\u5165\u529B\u3055\u308C\u3066\u3044\u308B\u305F\u3081\u901A\u5E38\u8868\u793A\u3067\u306F\u56FA\u5B9A\uFF08\u81EA\u52D5\u30B9\u30B1\u30B8\u30E5\u30FC\u30EA\u30F3\u30B0\u5B9F\u884C\u3067\u306F\u7121\u8996\uFF09" : null,
      bindingPredecessor: bindingPred ? { id: bindingPred.id, name: bindingPred.name, impliedStart: bindingPred.impliedStart } : null,
      sprintFloor,
      sprintFloorApplied,
      fixedMilestoneBackward: !!(task.milestone && task.milestoneMode === "fixed")
    },
    predecessors
  });
}
function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, opts } = parseArgs(rest);
  switch (command) {
    case "validate":
      return cmdValidate(positional, opts);
    case "recalc":
      return cmdRecalc(positional, opts);
    case "plan":
      return cmdPlan(positional, opts);
    case "explain":
      return cmdExplain(positional, opts);
    case void 0:
    case "--help":
    case "help":
      process.stdout.write([
        "Project Scheduler \u2014 \u30B9\u30B1\u30B8\u30E5\u30FC\u30EB\u8ABF\u6574CLI",
        "",
        "  validate <file>",
        "  recalc   <file> [--leveling on|off|auto]",
        "  plan     <original.json> <edited.json> [--reschedule] [--leveling on|off|auto]",
        "  explain  <file> --task <taskId> [--leveling on|off|auto]",
        "",
        "\u51FA\u529B\u306F\u69CB\u9020\u5316JSON\u3002\u3053\u306ECLI\u306FJSON\u30D5\u30A1\u30A4\u30EB\u3092\u66F8\u304D\u63DB\u3048\u307E\u305B\u3093\u3002",
        ""
      ].join("\n"));
      process.exit(command === void 0 ? 1 : 0);
      break;
    default:
      fail(`\u4E0D\u660E\u306A\u30B3\u30DE\u30F3\u30C9: ${command}`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
export {
  analyzeIntegrity,
  applyAutoSchedule,
  buildVersionSnapshot,
  checkFieldShapes,
  computeSchedule,
  findDependencyCycles,
  findParentCycles,
  scheduleRows
};
