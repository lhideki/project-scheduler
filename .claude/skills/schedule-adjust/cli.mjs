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
  let minYear = Infinity, maxYear = -Infinity;
  for (const key of holidayMap.keys()) {
    const y = Number(key.slice(0, 4));
    if (y < minYear) minYear = y;
    if (y > maxYear) maxYear = y;
  }
  const extraYearHolidays = /* @__PURE__ */ new Map();
  function nationalHolidayName(iso) {
    const name = holidayMap.get(iso);
    if (name !== void 0 || holidayMap.size === 0) return name;
    const y = Number(iso.slice(0, 4));
    if (y >= minYear && y <= maxYear) return void 0;
    let yearMap = extraYearHolidays.get(y);
    if (!yearMap) {
      yearMap = /* @__PURE__ */ new Map();
      for (const [date, n] of buildHolidayMap(y, y)) if (date.startsWith(`${y}-`)) yearMap.set(date, n);
      extraYearHolidays.set(y, yearMap);
    }
    return yearMap.get(iso);
  }
  function isWorkday(d) {
    const iso = toISO(d);
    if (forcedWorkdays.has(iso)) return true;
    if (isWeekend(d)) return false;
    if (nationalHolidayName(iso) !== void 0) return false;
    if (extraHolidays.has(iso)) return false;
    return true;
  }
  function holidayName(s) {
    if (forcedWorkdays.has(s)) return null;
    if (extraHolidays.has(s)) return extraHolidays.get(s) || "";
    return nationalHolidayName(s) || null;
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
function cal_addDaysISO(iso, n) {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
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
  const seen = /* @__PURE__ */ new Set([id]);
  let cur = byId[id];
  while (cur && cur.parentId && !seen.has(cur.parentId)) {
    seen.add(cur.parentId);
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

// src/lib/workAllocation.js
var ALLOCATION_UNITS_PER_DAY = 1e6;
var DAILY_CAPACITY = 1;
var ALLOCATION_SEARCH_WORKDAYS = 2e3;
var toUnits = (days) => Math.round(days * ALLOCATION_UNITS_PER_DAY);
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
function createCapacityLedger() {
  return { usage: /* @__PURE__ */ new Map() };
}
function usageOf(ledger, assigneeId) {
  let u = ledger.usage.get(assigneeId);
  if (!u) {
    u = { day: /* @__PURE__ */ new Map(), week: /* @__PURE__ */ new Map(), month: /* @__PURE__ */ new Map(), owners: /* @__PURE__ */ new Map() };
    ledger.usage.set(assigneeId, u);
  }
  return u;
}
function capUnits(capacity) {
  return capacity ? toUnits(capacity) : Infinity;
}
function allocateWork(ledger, resource, cal, startStr, duration, opts = {}) {
  const pinned = !!opts.pinned;
  const u = usageOf(ledger, resource.id);
  const weekCap = capUnits(resource.weeklyCapacity);
  const monthCap = capUnits(resource.monthlyCapacity);
  const dayCap = toUnits(DAILY_CAPACITY);
  const selfWeek = /* @__PURE__ */ new Map(), selfMonth = /* @__PURE__ */ new Map();
  let remaining = Math.max(1, toUnits(duration));
  const alloc = [], idle = [];
  let d = cal.snapForward(startStr);
  let scanned = 0;
  for (let guard = 0; remaining > 0 && scanned < ALLOCATION_SEARCH_WORKDAYS && guard < ALLOCATION_SEARCH_WORKDAYS * 7; guard++) {
    if (cal.isWorkdayStr(d)) {
      scanned++;
      const wk = weekKey(d), mo = monthKey(d);
      const dayFree = dayCap - (u.day.get(d) || 0);
      const weekFree = weekCap - (u.week.get(wk) || 0) - (selfWeek.get(wk) || 0);
      const monthFree = monthCap - (u.month.get(mo) || 0) - (selfMonth.get(mo) || 0);
      const units = Math.min(remaining, dayFree, weekFree, monthFree);
      if (units > 0) {
        remaining -= units;
        selfWeek.set(wk, (selfWeek.get(wk) || 0) + units);
        selfMonth.set(mo, (selfMonth.get(mo) || 0) + units);
        const entry = { date: d, load: units / ALLOCATION_UNITS_PER_DAY };
        if (remaining > 0 && units < dayCap) entry.limitedBy = units === dayFree ? "daily" : units === weekFree ? "weekly" : "monthly";
        alloc.push(entry);
      } else if (alloc.length || pinned) {
        const reason = dayFree <= 0 ? "daily" : weekFree <= 0 ? "weekly" : "monthly";
        const day = { date: d, reason };
        if (reason === "daily") day.taskIds = [...u.owners.get(d) || []];
        idle.push(day);
      }
    }
    d = cal_addDaysISO(d, 1);
  }
  return { ok: remaining <= 0, alloc, idle };
}
function commitAllocation(ledger, assigneeId, taskId, alloc) {
  const u = usageOf(ledger, assigneeId);
  alloc.forEach(({ date, load }) => {
    const units = toUnits(load);
    if (units <= 0) return;
    const wk = weekKey(date), mo = monthKey(date);
    u.day.set(date, (u.day.get(date) || 0) + units);
    u.week.set(wk, (u.week.get(wk) || 0) + units);
    u.month.set(mo, (u.month.get(mo) || 0) + units);
    const owners = u.owners.get(date) || [];
    if (!owners.includes(taskId)) u.owners.set(date, [...owners, taskId]);
  });
}
function idleSegments(idle, alloc) {
  const allocDates = (alloc || []).map((a) => a.date);
  const segments = [];
  (idle || []).forEach((day) => {
    const last = segments[segments.length - 1];
    const allocatedBetween = last && allocDates.some((date) => date > last.end && date < day.date);
    if (last && last.reason === day.reason && !allocatedBetween) {
      last.end = day.date;
      last.days++;
      (day.taskIds || []).forEach((id) => {
        if (!last.taskIds.includes(id)) last.taskIds.push(id);
      });
    } else {
      segments.push({ start: day.date, end: day.date, days: 1, reason: day.reason, taskIds: [...day.taskIds || []] });
    }
  });
  return segments;
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
  const ledger = createCapacityLedger();
  const placed = {};
  const allocations = {};
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
  const usesCapacity = (task) => !!(task.assigneeId && task.duration > 0 && resById[task.assigneeId]);
  function placeContiguous(task, start) {
    placed[task.id] = { start, finish: task.duration <= 0 ? start : cal.endFromStart(start, task.duration) };
    if (task.duration > 0) allocations[task.id] = { alloc: dailyLoads(cal, start, task.duration), idle: [] };
  }
  function placeWithCapacity(task, start, pinned) {
    const resource = resById[task.assigneeId];
    const r = allocateWork(ledger, resource, cal, start, task.duration, { pinned });
    if (r.ok) {
      commitAllocation(ledger, resource.id, task.id, r.alloc);
      placed[task.id] = { start: pinned ? start : r.alloc[0].date, finish: r.alloc[r.alloc.length - 1].date };
      allocations[task.id] = { alloc: r.alloc, idle: r.idle };
      return;
    }
    const alloc = dailyLoads(cal, start, task.duration);
    commitAllocation(ledger, resource.id, task.id, alloc);
    placed[task.id] = { start, finish: cal.endFromStart(start, task.duration) };
    allocations[task.id] = { alloc, idle: [], overCapacity: true };
    warnings.push({
      code: "capacity-exceeded",
      taskId: task.id,
      params: {
        taskName: task.name,
        resourceName: resource.name,
        duration: task.duration,
        dailyCapacity: DAILY_CAPACITY,
        weeklyCapacity: resource.weeklyCapacity || 0,
        monthlyCapacity: resource.monthlyCapacity || 0,
        searchWorkdays: ALLOCATION_SEARCH_WORKDAYS,
        start
      }
    });
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
      if (usesCapacity(task)) placeWithCapacity(task, start2, true);
      else placeContiguous(task, start2);
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
    if (task.startDate) {
      const manualFloor = cal.snapForward(task.startDate);
      if (minStart === null || manualFloor > minStart) minStart = manualFloor;
    }
    if (minStart === null) {
      minStart = cpmResult.get(id)?.ES || cal.snapForward(toISO(/* @__PURE__ */ new Date()));
    }
    const sprintFloor = earliestSprintFloor(task.sprintIds, sprintById, cal);
    if (sprintFloor && sprintFloor > minStart) minStart = sprintFloor;
    const start = cal.snapForward(minStart);
    if (usesCapacity(task)) placeWithCapacity(task, start, false);
    else placeContiguous(task, start);
    remaining.delete(id);
  }
  return { placed, warnings, allocations };
}
function buildDisplaySchedule(tasks, cpmResult, resources, cal, sprints, opts = {}) {
  const schedule = new Map(cpmResult);
  if (!opts.leveling) {
    tasks.forEach((t) => {
      const s = schedule.get(t.id);
      if (!s || s.isSummary || !s.schedStart || !(t.duration > 0)) return;
      schedule.set(t.id, { ...s, allocation: { alloc: dailyLoads(cal, s.schedStart, t.duration), idle: [] } });
    });
    return { schedule, levelWarnings: [] };
  }
  const { placed, warnings, allocations } = levelResources(tasks, cpmResult, resources || [], cal, sprints);
  for (const [id, dates] of Object.entries(placed)) {
    const prev = schedule.get(id) || {};
    const next = { ...prev, schedStart: dates.start, schedFinish: dates.finish };
    if (allocations[id]) next.allocation = allocations[id];
    else delete next.allocation;
    schedule.set(id, next);
  }
  rollupSummaries(tasks, schedule);
  return { schedule, levelWarnings: warnings };
}
var AUTO_SCHEDULE_MAX_ITERATIONS = 20;
function computeAutoSchedule(tasks, cal, projectStart, sprints, resources, opts = {}) {
  const auto = runCPM(tasks, cal, projectStart, sprints, { respectManualPins: false });
  const out = /* @__PURE__ */ new Map();
  tasks.forEach((t) => {
    if (isGroupId(tasks, t.id)) return;
    const s = auto.result.get(t.id);
    if (s && s.schedStart && !s.isSummary) out.set(t.id, s.schedStart);
  });
  const interim = tasks.map((t) => out.has(t.id) ? { ...t, startDate: out.get(t.id) } : t);
  const { placed } = levelResources(interim, auto.result, opts.leveling ? resources || [] : [], cal, sprints);
  const byId = {};
  tasks.forEach((t) => byId[t.id] = t);
  Object.entries(placed).forEach(([id, dates]) => {
    const t = byId[id];
    if (!opts.leveling && t && t.milestone && t.milestoneMode === "fixed") return;
    if (dates && dates.start) out.set(id, dates.start);
  });
  let converged = true;
  if (opts.leveling) {
    converged = false;
    const maxIterations = opts.maxIterations ?? AUTO_SCHEDULE_MAX_ITERATIONS;
    for (let iter = 0; iter < maxIterations; iter++) {
      const written = tasks.map((t) => out.has(t.id) ? { ...t, startDate: out.get(t.id) } : t);
      const displayStart = deriveProjectStart(written, projectStart);
      const display = runCPM(written, cal, displayStart, sprints);
      const { placed: shown } = levelResources(written, display.result, resources || [], cal, sprints);
      let changed = false;
      Object.entries(shown).forEach(([id, dates]) => {
        if (!out.has(id) || !dates || !dates.start || dates.start === out.get(id)) return;
        out.set(id, dates.start);
        changed = true;
      });
      if (!changed) {
        converged = true;
        break;
      }
    }
  }
  return { startDates: out, converged };
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
      reasons.push({ code: "start-before-sprint", params: { start: s.schedStart, sprintStart: rangeStart } });
    }
    if (s.schedFinish > rangeEnd) {
      reasons.push({ code: "finish-after-sprint", params: { finish: s.schedFinish, sprintEnd: rangeEnd } });
    }
    if (!reasons.length) return;
    if (s.governed) {
      reasons.push({ code: "governed-by-fixed-milestone", params: {} });
    }
    const sprintNames = sps.map((sp) => sp.name || sp.theme || null);
    out.push({ taskId: t.id, name: t.name, wbsNo: wbsNoById[t.id] || "", sprintNames, reasons });
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

// src/lib/deps.js
function formatDepLabel(dep) {
  return `${dep.type}${dep.lag ? dep.lag > 0 ? "+" + dep.lag : dep.lag : ""}`;
}

// src/lib/dependencyIssues.js
var DEPENDENCY_ISSUE_CODES = Object.freeze({
  cycle: "dependency-cycle",
  self: "self-dependency",
  missing: "predecessor-missing",
  violation: "dependency-violation",
  overrun: "fixed-milestone-overrun"
});
var SCHEDULE_DEPENDENCY_ISSUE_CODES = Object.freeze([
  DEPENDENCY_ISSUE_CODES.violation,
  DEPENDENCY_ISSUE_CODES.overrun
]);
var CODE_ORDER = [
  DEPENDENCY_ISSUE_CODES.cycle,
  DEPENDENCY_ISSUE_CODES.self,
  DEPENDENCY_ISSUE_CODES.missing,
  DEPENDENCY_ISSUE_CODES.violation,
  DEPENDENCY_ISSUE_CODES.overrun
];
function taskName(task, id) {
  if (!task) return id;
  return task.name && task.name.trim() ? task.name : null;
}
function isFixedMilestone(t) {
  return !!(t && t.milestone && t.milestoneMode === "fixed");
}
function collectGroupIds(tasks) {
  const ids = /* @__PURE__ */ new Set();
  tasks.forEach((t) => {
    if (t.parentId != null) ids.add(t.parentId);
  });
  return ids;
}
function wbsRankOf(tasks) {
  const rank = /* @__PURE__ */ new Map();
  buildFlatList(tasks, /* @__PURE__ */ new Set()).forEach((t, i) => rank.set(t.id, i));
  tasks.forEach((t, i) => {
    if (!rank.has(t.id)) rank.set(t.id, tasks.length + i);
  });
  return rank;
}
function findSelfDependencies(tasks) {
  const out = [];
  tasks.forEach((t) => {
    if ((t.predecessors || []).some((p) => p && p.id === t.id)) out.push({ taskId: t.id });
  });
  return out;
}
function findMissingPredecessors(tasks) {
  const ids = new Set(tasks.map((t) => t.id));
  const out = [];
  tasks.forEach((t) => {
    (t.predecessors || []).forEach((p) => {
      if (!p || p.id === t.id) return;
      if (!ids.has(p.id)) out.push({ taskId: t.id, predecessorId: p.id });
    });
  });
  return out;
}
function findDependencyCycles(tasks) {
  const byId = {};
  tasks.forEach((t) => {
    if (!(t.id in byId)) byId[t.id] = t;
  });
  const groupIds = collectGroupIds(tasks);
  const rank = wbsRankOf(tasks);
  const byRank = (a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0);
  const nodes = Object.keys(byId).sort(byRank);
  const adj = new Map(nodes.map((id) => [id, /* @__PURE__ */ new Map()]));
  const addEdge = (from, to, kind) => {
    if (!adj.has(from) || !adj.has(to)) return;
    const out = adj.get(from);
    if (!out.has(to) || kind === "dependency") out.set(to, kind);
  };
  nodes.forEach((id) => {
    const t = byId[id];
    if (!groupIds.has(id)) {
      effectivePredecessors(byId, t).forEach((dep) => addEdge(dep.id, id, "dependency"));
    }
    if (t.parentId != null && t.parentId !== id) addEdge(id, t.parentId, "member");
  });
  const succOf = (id) => [...adj.get(id).keys()].sort(byRank);
  const index = /* @__PURE__ */ new Map(), low = /* @__PURE__ */ new Map(), onStack = /* @__PURE__ */ new Set();
  const stack = [];
  const components = [];
  let counter = 0;
  nodes.forEach((root) => {
    if (index.has(root)) return;
    const work = [{ id: root, succs: succOf(root), i: 0 }];
    index.set(root, counter);
    low.set(root, counter);
    counter++;
    stack.push(root);
    onStack.add(root);
    while (work.length) {
      const frame = work[work.length - 1];
      if (frame.i < frame.succs.length) {
        const next = frame.succs[frame.i++];
        if (!index.has(next)) {
          index.set(next, counter);
          low.set(next, counter);
          counter++;
          stack.push(next);
          onStack.add(next);
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
        do {
          x = stack.pop();
          onStack.delete(x);
          comp.push(x);
        } while (x !== frame.id);
        components.push(comp);
      }
    }
  });
  const cycles = [];
  components.forEach((comp) => {
    if (comp.length < 2) return;
    const members = new Set(comp);
    const hasDependencyEdge = comp.some((from) => [...adj.get(from)].some(([to, kind]) => kind === "dependency" && members.has(to)));
    if (!hasDependencyEdge) return;
    const ids = [...comp].sort(byRank);
    const start = ids[0];
    const prev = /* @__PURE__ */ new Map();
    const queue = [start];
    const visited = /* @__PURE__ */ new Set([start]);
    let last = null;
    while (queue.length && last === null) {
      const cur = queue.shift();
      for (const next of succOf(cur)) {
        if (!members.has(next)) continue;
        if (next === start) {
          last = cur;
          break;
        }
        if (visited.has(next)) continue;
        visited.add(next);
        prev.set(next, cur);
        queue.push(next);
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
function cycleParams(cycle, byId) {
  return {
    route: cycle.path.map((id) => ({ id, name: taskName(byId[id], id) })),
    memberEdges: cycle.memberEdges.map(([child, parent]) => ({
      childId: child,
      childName: taskName(byId[child], child),
      parentId: parent,
      parentName: taskName(byId[parent], parent)
    }))
  };
}
function violationParams(cal, dep, predName, predDates, required, sched) {
  const label = formatDepLabel(dep);
  if (dep.type === "FF" || dep.type === "SF") {
    const base = dep.type === "FF" ? predDates.finish : predDates.start;
    const requiredFinish = cal.shift(base, dep.lag);
    return { side: "finish", predName, label, required: requiredFinish, actual: sched.schedFinish };
  }
  return { side: "start", predName, label, required, actual: sched.schedStart };
}
function detectScheduleDependencyIssues(tasks, schedule, cal, opts = {}) {
  const excludeIds = opts.excludeIds || /* @__PURE__ */ new Set();
  const byId = {};
  tasks.forEach((t) => {
    if (!(t.id in byId)) byId[t.id] = t;
  });
  const groupIds = collectGroupIds(tasks);
  const issues = [];
  tasks.forEach((t) => {
    if (byId[t.id] !== t) return;
    if (groupIds.has(t.id) || excludeIds.has(t.id)) return;
    const s = schedule.get(t.id);
    if (!s || !s.schedStart || !s.schedFinish) return;
    const checks = [];
    effectivePredecessors(byId, t).forEach((dep) => {
      if (!byId[dep.id] || excludeIds.has(dep.id)) return;
      const p = schedule.get(dep.id);
      if (!p || !p.schedStart || !p.schedFinish) return;
      const predDates = { start: p.schedStart, finish: p.schedFinish };
      const required = candidateFromDep(cal, dep, predDates, t.duration).start;
      checks.push({ dep, predDates, required });
    });
    if (isFixedMilestone(t) && t.fixedDate) {
      const binding = checks.reduce((best, c) => !best || c.required > best.required ? c : best, null);
      const earliest = binding ? binding.required : null;
      if (earliest && earliest > t.fixedDate) {
        issues.push({
          code: DEPENDENCY_ISSUE_CODES.overrun,
          severity: "warning",
          ids: [t.id],
          predecessorId: binding.dep.id,
          requiredDate: earliest,
          actualDate: s.schedFinish,
          params: { predName: taskName(byId[binding.dep.id], binding.dep.id), earliest, fixedDate: t.fixedDate }
        });
        return;
      }
      if (s.schedFinish > t.fixedDate) {
        issues.push({
          code: DEPENDENCY_ISSUE_CODES.overrun,
          severity: "warning",
          ids: [t.id],
          actualDate: s.schedFinish,
          params: { actual: s.schedFinish, fixedDate: t.fixedDate }
        });
        return;
      }
    }
    if ((t.progress || 0) > 0) return;
    checks.forEach(({ dep, predDates, required }) => {
      if (s.schedStart >= required) return;
      issues.push({
        code: DEPENDENCY_ISSUE_CODES.violation,
        severity: "warning",
        ids: [t.id],
        predecessorId: dep.id,
        requiredDate: required,
        actualDate: s.schedStart,
        params: violationParams(cal, dep, taskName(byId[dep.id], dep.id), predDates, required, s)
      });
    });
  });
  return issues;
}
function detectDependencyIssues(tasks, schedule = null, cal = null) {
  const list = tasks || [];
  const byId = {};
  list.forEach((t) => {
    if (!(t.id in byId)) byId[t.id] = t;
  });
  const issues = [];
  const cycles = findDependencyCycles(list);
  const inCycle = /* @__PURE__ */ new Set();
  cycles.forEach((cycle) => {
    cycle.ids.forEach((id) => inCycle.add(id));
    issues.push({
      code: DEPENDENCY_ISSUE_CODES.cycle,
      severity: "error",
      ids: cycle.ids,
      path: cycle.path,
      params: cycleParams(cycle, byId)
    });
  });
  findSelfDependencies(list).forEach(({ taskId }) => {
    issues.push({
      code: DEPENDENCY_ISSUE_CODES.self,
      severity: "error",
      ids: [taskId],
      predecessorId: taskId,
      params: {}
    });
  });
  findMissingPredecessors(list).forEach(({ taskId, predecessorId }) => {
    issues.push({
      code: DEPENDENCY_ISSUE_CODES.missing,
      severity: "error",
      ids: [taskId],
      predecessorId,
      params: { predecessorId }
    });
  });
  if (schedule && cal) {
    issues.push(...detectScheduleDependencyIssues(list, schedule, cal, { excludeIds: inCycle }));
  }
  const rank = wbsRankOf(list);
  return issues.map((issue, i) => ({ issue, i })).sort((a, b) => {
    const ra = rank.get(a.issue.ids[0]) ?? 0, rb = rank.get(b.issue.ids[0]) ?? 0;
    if (ra !== rb) return ra - rb;
    const ca = CODE_ORDER.indexOf(a.issue.code), cb = CODE_ORDER.indexOf(b.issue.code);
    if (ca !== cb) return ca - cb;
    return a.i - b.i;
  }).map((x) => x.issue);
}

// node_modules/@formatjs/fast-memoize/index.js
function memoize(fn, options) {
  const cache = options && options.cache ? options.cache : cacheDefault;
  const serializer = options && options.serializer ? options.serializer : serializerDefault;
  return (options && options.strategy ? options.strategy : strategyDefault)(fn, {
    cache,
    serializer
  });
}
function isPrimitive(value) {
  return value == null || typeof value === "number" || typeof value === "boolean";
}
function monadic(fn, cache, serializer, arg) {
  const cacheKey = isPrimitive(arg) ? arg : serializer(arg);
  let computedValue = cache.get(cacheKey);
  if (typeof computedValue === "undefined") {
    computedValue = fn.call(this, arg);
    cache.set(cacheKey, computedValue);
  }
  return computedValue;
}
function variadic(fn, cache, serializer) {
  const args = Array.prototype.slice.call(arguments, 3);
  const cacheKey = serializer(args);
  let computedValue = cache.get(cacheKey);
  if (typeof computedValue === "undefined") {
    computedValue = fn.apply(this, args);
    cache.set(cacheKey, computedValue);
  }
  return computedValue;
}
function assemble(fn, context, strategy, cache, serialize) {
  return strategy.bind(context, fn, cache, serialize);
}
function strategyDefault(fn, options) {
  const strategy = fn.length === 1 ? monadic : variadic;
  return assemble(fn, this, strategy, options.cache.create(), options.serializer);
}
function strategyVariadic(fn, options) {
  return assemble(fn, this, variadic, options.cache.create(), options.serializer);
}
function strategyMonadic(fn, options) {
  return assemble(fn, this, monadic, options.cache.create(), options.serializer);
}
var serializerDefault = function() {
  return JSON.stringify(arguments);
};
var ObjectWithoutPrototypeCache = class {
  constructor() {
    this.cache = /* @__PURE__ */ Object.create(null);
  }
  get(key) {
    return this.cache[key];
  }
  set(key, value) {
    this.cache[key] = value;
  }
};
var cacheDefault = { create: function create() {
  return new ObjectWithoutPrototypeCache();
} };
var strategies = {
  variadic: strategyVariadic,
  monadic: strategyMonadic
};

// node_modules/intl-messageformat/node_modules/@formatjs/icu-skeleton-parser/index.js
var DATE_TIME_REGEX = /(?:[Eec]{1,6}|G{1,5}|[Qq]{1,5}|(?:[yYur]+|U{1,5})|[ML]{1,5}|d{1,2}|D{1,3}|F{1}|[abB]{1,5}|[hkHK]{1,2}|w{1,2}|W{1}|m{1,2}|s{1,2}|[zZOvVxX]{1,4})(?=([^']*'[^']*')*[^']*$)/g;
function parseDateTimeSkeleton(skeleton) {
  const result = {};
  skeleton.replace(DATE_TIME_REGEX, (match) => {
    const len = match.length;
    switch (match[0]) {
      case "G":
        result.era = len === 4 ? "long" : len === 5 ? "narrow" : "short";
        break;
      case "y":
        result.year = len === 2 ? "2-digit" : "numeric";
        break;
      case "Y":
      case "u":
      case "U":
      case "r":
        throw new RangeError("`Y/u/U/r` (year) patterns are not supported, use `y` instead");
      case "q":
      case "Q":
        throw new RangeError("`q/Q` (quarter) patterns are not supported");
      case "M":
      case "L":
        result.month = [
          "numeric",
          "2-digit",
          "short",
          "long",
          "narrow"
        ][len - 1];
        break;
      case "w":
      case "W":
        throw new RangeError("`w/W` (week) patterns are not supported");
      case "d":
        result.day = ["numeric", "2-digit"][len - 1];
        break;
      case "D":
      case "F":
      case "g":
        throw new RangeError("`D/F/g` (day) patterns are not supported, use `d` instead");
      case "E":
        result.weekday = len === 4 ? "long" : len === 5 ? "narrow" : "short";
        break;
      case "e":
        if (len < 4) throw new RangeError("`e..eee` (weekday) patterns are not supported");
        result.weekday = [
          "short",
          "long",
          "narrow",
          "short"
        ][len - 3];
        break;
      case "c":
        if (len < 4) throw new RangeError("`c..ccc` (weekday) patterns are not supported");
        result.weekday = [
          "short",
          "long",
          "narrow",
          "short"
        ][len - 3];
        break;
      case "a":
        result.hour12 = true;
        break;
      case "b":
      case "B":
        throw new RangeError("`b/B` (period) patterns are not supported, use `a` instead");
      case "h":
        result.hourCycle = "h12";
        result.hour = ["numeric", "2-digit"][len - 1];
        break;
      case "H":
        result.hourCycle = "h23";
        result.hour = ["numeric", "2-digit"][len - 1];
        break;
      case "K":
        result.hourCycle = "h11";
        result.hour = ["numeric", "2-digit"][len - 1];
        break;
      case "k":
        result.hourCycle = "h24";
        result.hour = ["numeric", "2-digit"][len - 1];
        break;
      case "j":
      case "J":
      case "C":
        throw new RangeError("`j/J/C` (hour) patterns are not supported, use `h/H/K/k` instead");
      case "m":
        result.minute = ["numeric", "2-digit"][len - 1];
        break;
      case "s":
        result.second = ["numeric", "2-digit"][len - 1];
        break;
      case "S":
      case "A":
        throw new RangeError("`S/A` (second) patterns are not supported, use `s` instead");
      case "z":
        result.timeZoneName = len < 4 ? "short" : "long";
        break;
      case "Z":
      case "O":
      case "v":
      case "V":
      case "X":
      case "x":
        throw new RangeError("`Z/O/v/V/X/x` (timeZone) patterns are not supported, use `z` instead");
    }
    return "";
  });
  return result;
}
var WHITE_SPACE_REGEX = /[\t-\r \x85\u200E\u200F\u2028\u2029]/i;
function parseNumberSkeletonFromString(skeleton) {
  if (skeleton.length === 0) throw new Error("Number skeleton cannot be empty");
  const stringTokens = skeleton.split(WHITE_SPACE_REGEX).filter((x) => x.length > 0);
  const tokens = [];
  for (const stringToken of stringTokens) {
    let stemAndOptions = stringToken.split("/");
    if (stemAndOptions.length === 0) throw new Error("Invalid number skeleton");
    const [stem, ...options] = stemAndOptions;
    for (const option of options) if (option.length === 0) throw new Error("Invalid number skeleton");
    tokens.push({
      stem,
      options
    });
  }
  return tokens;
}
function icuUnitToEcma(unit) {
  return unit.replace(/^(.*?)-/, "");
}
var FRACTION_PRECISION_REGEX = /^\.(?:(0+)(\*)?|(#+)|(0+)(#+))$/g;
var SIGNIFICANT_PRECISION_REGEX = /^(@+)?(\+|#+)?[rs]?$/g;
var INTEGER_WIDTH_REGEX = /(\*)(0+)|(#+)(0+)|(0+)/g;
var CONCISE_INTEGER_WIDTH_REGEX = /^(0+)$/;
function parseSignificantPrecision(str) {
  const result = {};
  if (str[str.length - 1] === "r") result.roundingPriority = "morePrecision";
  else if (str[str.length - 1] === "s") result.roundingPriority = "lessPrecision";
  str.replace(SIGNIFICANT_PRECISION_REGEX, function(_, g1, g2) {
    if (typeof g2 !== "string") {
      result.minimumSignificantDigits = g1.length;
      result.maximumSignificantDigits = g1.length;
    } else if (g2 === "+") result.minimumSignificantDigits = g1.length;
    else if (g1[0] === "#") result.maximumSignificantDigits = g1.length;
    else {
      result.minimumSignificantDigits = g1.length;
      result.maximumSignificantDigits = g1.length + (typeof g2 === "string" ? g2.length : 0);
    }
    return "";
  });
  return result;
}
function parseSign(str) {
  switch (str) {
    case "sign-auto":
      return { signDisplay: "auto" };
    case "sign-accounting":
    case "()":
      return { currencySign: "accounting" };
    case "sign-always":
    case "+!":
      return { signDisplay: "always" };
    case "sign-accounting-always":
    case "()!":
      return {
        signDisplay: "always",
        currencySign: "accounting"
      };
    case "sign-except-zero":
    case "+?":
      return { signDisplay: "exceptZero" };
    case "sign-accounting-except-zero":
    case "()?":
      return {
        signDisplay: "exceptZero",
        currencySign: "accounting"
      };
    case "sign-never":
    case "+_":
      return { signDisplay: "never" };
  }
}
function parseConciseScientificAndEngineeringStem(stem) {
  let result;
  if (stem[0] === "E" && stem[1] === "E") {
    result = { notation: "engineering" };
    stem = stem.slice(2);
  } else if (stem[0] === "E") {
    result = { notation: "scientific" };
    stem = stem.slice(1);
  }
  if (result) {
    const signDisplay = stem.slice(0, 2);
    if (signDisplay === "+!") {
      result.signDisplay = "always";
      stem = stem.slice(2);
    } else if (signDisplay === "+?") {
      result.signDisplay = "exceptZero";
      stem = stem.slice(2);
    }
    if (!CONCISE_INTEGER_WIDTH_REGEX.test(stem)) throw new Error("Malformed concise eng/scientific notation");
    result.minimumIntegerDigits = stem.length;
  }
  return result;
}
function parseNotationOptions(opt) {
  const result = {};
  const signOpts = parseSign(opt);
  if (signOpts) return signOpts;
  return result;
}
function parseNumberSkeleton(tokens) {
  let result = {};
  for (const token of tokens) {
    switch (token.stem) {
      case "percent":
      case "%":
        result.style = "percent";
        continue;
      case "%x100":
        result.style = "percent";
        result.scale = 100;
        continue;
      case "currency":
        result.style = "currency";
        result.currency = token.options[0];
        continue;
      case "group-off":
      case ",_":
        result.useGrouping = false;
        continue;
      case "precision-integer":
      case ".":
        result.maximumFractionDigits = 0;
        continue;
      case "measure-unit":
      case "unit":
        result.style = "unit";
        result.unit = icuUnitToEcma(token.options[0]);
        continue;
      case "compact-short":
      case "K":
        result.notation = "compact";
        result.compactDisplay = "short";
        continue;
      case "compact-long":
      case "KK":
        result.notation = "compact";
        result.compactDisplay = "long";
        continue;
      case "scientific":
        result = {
          ...result,
          notation: "scientific",
          ...token.options.reduce((all, opt) => ({
            ...all,
            ...parseNotationOptions(opt)
          }), {})
        };
        continue;
      case "engineering":
        result = {
          ...result,
          notation: "engineering",
          ...token.options.reduce((all, opt) => ({
            ...all,
            ...parseNotationOptions(opt)
          }), {})
        };
        continue;
      case "notation-simple":
        result.notation = "standard";
        continue;
      case "unit-width-narrow":
        result.currencyDisplay = "narrowSymbol";
        result.unitDisplay = "narrow";
        continue;
      case "unit-width-short":
        result.currencyDisplay = "code";
        result.unitDisplay = "short";
        continue;
      case "unit-width-full-name":
        result.currencyDisplay = "name";
        result.unitDisplay = "long";
        continue;
      case "unit-width-iso-code":
        result.currencyDisplay = "symbol";
        continue;
      case "scale":
        result.scale = parseFloat(token.options[0]);
        continue;
      case "rounding-mode-floor":
        result.roundingMode = "floor";
        continue;
      case "rounding-mode-ceiling":
        result.roundingMode = "ceil";
        continue;
      case "rounding-mode-down":
        result.roundingMode = "trunc";
        continue;
      case "rounding-mode-up":
        result.roundingMode = "expand";
        continue;
      case "rounding-mode-half-even":
        result.roundingMode = "halfEven";
        continue;
      case "rounding-mode-half-down":
        result.roundingMode = "halfTrunc";
        continue;
      case "rounding-mode-half-up":
        result.roundingMode = "halfExpand";
        continue;
      case "integer-width":
        if (token.options.length > 1) throw new RangeError("integer-width stems only accept a single optional option");
        token.options[0].replace(INTEGER_WIDTH_REGEX, function(_, g1, g2, g3, g4, g5) {
          if (g1) result.minimumIntegerDigits = g2.length;
          else if (g3 && g4) throw new Error("We currently do not support maximum integer digits");
          else if (g5) throw new Error("We currently do not support exact integer digits");
          return "";
        });
        continue;
    }
    if (CONCISE_INTEGER_WIDTH_REGEX.test(token.stem)) {
      result.minimumIntegerDigits = token.stem.length;
      continue;
    }
    if (FRACTION_PRECISION_REGEX.test(token.stem)) {
      if (token.options.length > 1) throw new RangeError("Fraction-precision stems only accept a single optional option");
      token.stem.replace(FRACTION_PRECISION_REGEX, function(_, g1, g2, g3, g4, g5) {
        if (g2 === "*") result.minimumFractionDigits = g1.length;
        else if (g3 && g3[0] === "#") result.maximumFractionDigits = g3.length;
        else if (g4 && g5) {
          result.minimumFractionDigits = g4.length;
          result.maximumFractionDigits = g4.length + g5.length;
        } else {
          result.minimumFractionDigits = g1.length;
          result.maximumFractionDigits = g1.length;
        }
        return "";
      });
      const opt = token.options[0];
      if (opt === "w") result = {
        ...result,
        trailingZeroDisplay: "stripIfInteger"
      };
      else if (opt) result = {
        ...result,
        ...parseSignificantPrecision(opt)
      };
      continue;
    }
    if (SIGNIFICANT_PRECISION_REGEX.test(token.stem)) {
      result = {
        ...result,
        ...parseSignificantPrecision(token.stem)
      };
      continue;
    }
    const signOpts = parseSign(token.stem);
    if (signOpts) result = {
      ...result,
      ...signOpts
    };
    const conciseScientificAndEngineeringOpts = parseConciseScientificAndEngineeringStem(token.stem);
    if (conciseScientificAndEngineeringOpts) result = {
      ...result,
      ...conciseScientificAndEngineeringOpts
    };
  }
  return result;
}

// node_modules/intl-messageformat/node_modules/@formatjs/icu-messageformat-parser/index.js
var ErrorKind = /* @__PURE__ */ (function(ErrorKind2) {
  ErrorKind2[ErrorKind2["EXPECT_ARGUMENT_CLOSING_BRACE"] = 1] = "EXPECT_ARGUMENT_CLOSING_BRACE";
  ErrorKind2[ErrorKind2["EMPTY_ARGUMENT"] = 2] = "EMPTY_ARGUMENT";
  ErrorKind2[ErrorKind2["MALFORMED_ARGUMENT"] = 3] = "MALFORMED_ARGUMENT";
  ErrorKind2[ErrorKind2["EXPECT_ARGUMENT_TYPE"] = 4] = "EXPECT_ARGUMENT_TYPE";
  ErrorKind2[ErrorKind2["INVALID_ARGUMENT_TYPE"] = 5] = "INVALID_ARGUMENT_TYPE";
  ErrorKind2[ErrorKind2["EXPECT_ARGUMENT_STYLE"] = 6] = "EXPECT_ARGUMENT_STYLE";
  ErrorKind2[ErrorKind2["INVALID_NUMBER_SKELETON"] = 7] = "INVALID_NUMBER_SKELETON";
  ErrorKind2[ErrorKind2["INVALID_DATE_TIME_SKELETON"] = 8] = "INVALID_DATE_TIME_SKELETON";
  ErrorKind2[ErrorKind2["EXPECT_NUMBER_SKELETON"] = 9] = "EXPECT_NUMBER_SKELETON";
  ErrorKind2[ErrorKind2["EXPECT_DATE_TIME_SKELETON"] = 10] = "EXPECT_DATE_TIME_SKELETON";
  ErrorKind2[ErrorKind2["UNCLOSED_QUOTE_IN_ARGUMENT_STYLE"] = 11] = "UNCLOSED_QUOTE_IN_ARGUMENT_STYLE";
  ErrorKind2[ErrorKind2["EXPECT_SELECT_ARGUMENT_OPTIONS"] = 12] = "EXPECT_SELECT_ARGUMENT_OPTIONS";
  ErrorKind2[ErrorKind2["EXPECT_PLURAL_ARGUMENT_OFFSET_VALUE"] = 13] = "EXPECT_PLURAL_ARGUMENT_OFFSET_VALUE";
  ErrorKind2[ErrorKind2["INVALID_PLURAL_ARGUMENT_OFFSET_VALUE"] = 14] = "INVALID_PLURAL_ARGUMENT_OFFSET_VALUE";
  ErrorKind2[ErrorKind2["EXPECT_SELECT_ARGUMENT_SELECTOR"] = 15] = "EXPECT_SELECT_ARGUMENT_SELECTOR";
  ErrorKind2[ErrorKind2["EXPECT_PLURAL_ARGUMENT_SELECTOR"] = 16] = "EXPECT_PLURAL_ARGUMENT_SELECTOR";
  ErrorKind2[ErrorKind2["EXPECT_SELECT_ARGUMENT_SELECTOR_FRAGMENT"] = 17] = "EXPECT_SELECT_ARGUMENT_SELECTOR_FRAGMENT";
  ErrorKind2[ErrorKind2["EXPECT_PLURAL_ARGUMENT_SELECTOR_FRAGMENT"] = 18] = "EXPECT_PLURAL_ARGUMENT_SELECTOR_FRAGMENT";
  ErrorKind2[ErrorKind2["INVALID_PLURAL_ARGUMENT_SELECTOR"] = 19] = "INVALID_PLURAL_ARGUMENT_SELECTOR";
  ErrorKind2[ErrorKind2["DUPLICATE_PLURAL_ARGUMENT_SELECTOR"] = 20] = "DUPLICATE_PLURAL_ARGUMENT_SELECTOR";
  ErrorKind2[ErrorKind2["DUPLICATE_SELECT_ARGUMENT_SELECTOR"] = 21] = "DUPLICATE_SELECT_ARGUMENT_SELECTOR";
  ErrorKind2[ErrorKind2["MISSING_OTHER_CLAUSE"] = 22] = "MISSING_OTHER_CLAUSE";
  ErrorKind2[ErrorKind2["INVALID_TAG"] = 23] = "INVALID_TAG";
  ErrorKind2[ErrorKind2["INVALID_TAG_NAME"] = 25] = "INVALID_TAG_NAME";
  ErrorKind2[ErrorKind2["UNMATCHED_CLOSING_TAG"] = 26] = "UNMATCHED_CLOSING_TAG";
  ErrorKind2[ErrorKind2["UNCLOSED_TAG"] = 27] = "UNCLOSED_TAG";
  return ErrorKind2;
})({});
function isLiteralElement(el) {
  return el.type === 0;
}
function isArgumentElement(el) {
  return el.type === 1;
}
function isNumberElement(el) {
  return el.type === 2;
}
function isDateElement(el) {
  return el.type === 3;
}
function isTimeElement(el) {
  return el.type === 4;
}
function isSelectElement(el) {
  return el.type === 5;
}
function isPluralElement(el) {
  return el.type === 6;
}
function isPoundElement(el) {
  return el.type === 7;
}
function isTagElement(el) {
  return el.type === 8;
}
function isNumberSkeleton(el) {
  return !!(el && typeof el === "object" && el.type === 0);
}
function isDateTimeSkeleton(el) {
  return !!(el && typeof el === "object" && el.type === 1);
}
var SPACE_SEPARATOR_REGEX = /[ \xA0\u1680\u2000-\u200A\u202F\u205F\u3000]/;
var timeData = {
  "001": ["H", "h"],
  "419": [
    "h",
    "H",
    "hB",
    "hb"
  ],
  "AC": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "AD": ["H", "hB"],
  "AE": [
    "h",
    "hB",
    "hb",
    "H"
  ],
  "AF": [
    "H",
    "hb",
    "hB",
    "h"
  ],
  "AG": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "AI": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "AL": [
    "h",
    "H",
    "hB"
  ],
  "AM": ["H", "hB"],
  "AO": ["H", "hB"],
  "AR": [
    "h",
    "H",
    "hB",
    "hb"
  ],
  "AS": ["h", "H"],
  "AT": ["H", "hB"],
  "AU": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "AW": ["H", "hB"],
  "AX": ["H"],
  "AZ": [
    "H",
    "hB",
    "h"
  ],
  "BA": [
    "H",
    "hB",
    "h"
  ],
  "BB": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "BD": [
    "h",
    "hB",
    "H"
  ],
  "BE": ["H", "hB"],
  "BF": ["H", "hB"],
  "BG": [
    "H",
    "hB",
    "h"
  ],
  "BH": [
    "h",
    "hB",
    "hb",
    "H"
  ],
  "BI": ["H", "h"],
  "BJ": ["H", "hB"],
  "BL": ["H", "hB"],
  "BM": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "BN": [
    "hb",
    "hB",
    "h",
    "H"
  ],
  "BO": [
    "h",
    "H",
    "hB",
    "hb"
  ],
  "BQ": ["H"],
  "BR": ["H", "hB"],
  "BS": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "BT": ["h", "H"],
  "BW": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "BY": ["H", "h"],
  "BZ": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "CA": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "CC": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "CD": ["hB", "H"],
  "CF": [
    "H",
    "h",
    "hB"
  ],
  "CG": ["H", "hB"],
  "CH": [
    "H",
    "hB",
    "h"
  ],
  "CI": ["H", "hB"],
  "CK": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "CL": [
    "h",
    "H",
    "hB",
    "hb"
  ],
  "CM": [
    "H",
    "h",
    "hB"
  ],
  "CN": [
    "H",
    "hB",
    "hb",
    "h"
  ],
  "CO": [
    "h",
    "H",
    "hB",
    "hb"
  ],
  "CP": ["H"],
  "CR": [
    "h",
    "H",
    "hB",
    "hb"
  ],
  "CU": [
    "h",
    "H",
    "hB",
    "hb"
  ],
  "CV": ["H", "hB"],
  "CW": ["H", "hB"],
  "CX": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "CY": [
    "h",
    "H",
    "hb",
    "hB"
  ],
  "CZ": ["H"],
  "DE": ["H", "hB"],
  "DG": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "DJ": ["h", "H"],
  "DK": ["H"],
  "DM": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "DO": [
    "h",
    "H",
    "hB",
    "hb"
  ],
  "DZ": [
    "h",
    "hB",
    "hb",
    "H"
  ],
  "EA": [
    "H",
    "h",
    "hB",
    "hb"
  ],
  "EC": [
    "h",
    "H",
    "hB",
    "hb"
  ],
  "EE": ["H", "hB"],
  "EG": [
    "h",
    "hB",
    "hb",
    "H"
  ],
  "EH": [
    "h",
    "hB",
    "hb",
    "H"
  ],
  "ER": ["h", "H"],
  "ES": [
    "H",
    "hB",
    "h",
    "hb"
  ],
  "ET": [
    "hB",
    "hb",
    "h",
    "H"
  ],
  "FI": ["H"],
  "FJ": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "FK": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "FM": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "FO": ["H", "h"],
  "FR": ["H", "hB"],
  "GA": ["H", "hB"],
  "GB": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "GD": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "GE": [
    "H",
    "hB",
    "h"
  ],
  "GF": ["H", "hB"],
  "GG": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "GH": ["h", "H"],
  "GI": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "GL": ["H", "h"],
  "GM": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "GN": ["H", "hB"],
  "GP": ["H", "hB"],
  "GQ": [
    "H",
    "hB",
    "h",
    "hb"
  ],
  "GR": [
    "h",
    "H",
    "hb",
    "hB"
  ],
  "GS": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "GT": [
    "h",
    "H",
    "hB",
    "hb"
  ],
  "GU": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "GW": ["H", "hB"],
  "GY": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "HK": [
    "h",
    "hB",
    "hb",
    "H"
  ],
  "HN": [
    "h",
    "H",
    "hB",
    "hb"
  ],
  "HR": ["H", "hB"],
  "HU": ["H", "h"],
  "IC": [
    "H",
    "h",
    "hB",
    "hb"
  ],
  "ID": ["H"],
  "IE": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "IL": ["H", "hB"],
  "IM": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "IN": ["h", "H"],
  "IO": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "IQ": [
    "h",
    "hB",
    "hb",
    "H"
  ],
  "IR": ["hB", "H"],
  "IS": ["H"],
  "IT": ["H", "hB"],
  "JE": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "JM": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "JO": [
    "h",
    "hB",
    "hb",
    "H"
  ],
  "JP": [
    "H",
    "K",
    "h"
  ],
  "KE": [
    "hB",
    "hb",
    "H",
    "h"
  ],
  "KG": [
    "H",
    "h",
    "hB",
    "hb"
  ],
  "KH": [
    "hB",
    "h",
    "H",
    "hb"
  ],
  "KI": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "KM": [
    "H",
    "h",
    "hB",
    "hb"
  ],
  "KN": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "KP": [
    "h",
    "H",
    "hB",
    "hb"
  ],
  "KR": [
    "h",
    "H",
    "hB",
    "hb"
  ],
  "KW": [
    "h",
    "hB",
    "hb",
    "H"
  ],
  "KY": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "KZ": ["H", "hB"],
  "LA": [
    "H",
    "hb",
    "hB",
    "h"
  ],
  "LB": [
    "h",
    "hB",
    "hb",
    "H"
  ],
  "LC": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "LI": [
    "H",
    "hB",
    "h"
  ],
  "LK": [
    "H",
    "h",
    "hB",
    "hb"
  ],
  "LR": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "LS": ["h", "H"],
  "LT": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "LU": [
    "H",
    "h",
    "hB"
  ],
  "LV": [
    "H",
    "hB",
    "hb",
    "h"
  ],
  "LY": [
    "h",
    "hB",
    "hb",
    "H"
  ],
  "MA": [
    "H",
    "h",
    "hB",
    "hb"
  ],
  "MC": ["H", "hB"],
  "MD": ["H", "hB"],
  "ME": [
    "H",
    "hB",
    "h"
  ],
  "MF": ["H", "hB"],
  "MG": ["H", "h"],
  "MH": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "MK": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "ML": ["H"],
  "MM": [
    "hB",
    "hb",
    "H",
    "h"
  ],
  "MN": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "MO": [
    "h",
    "hB",
    "hb",
    "H"
  ],
  "MP": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "MQ": ["H", "hB"],
  "MR": [
    "h",
    "hB",
    "hb",
    "H"
  ],
  "MS": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "MT": ["H", "h"],
  "MU": ["H", "h"],
  "MV": ["H", "h"],
  "MW": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "MX": [
    "h",
    "H",
    "hB",
    "hb"
  ],
  "MY": [
    "hb",
    "hB",
    "h",
    "H"
  ],
  "MZ": ["H", "hB"],
  "NA": [
    "h",
    "H",
    "hB",
    "hb"
  ],
  "NC": ["H", "hB"],
  "NE": ["H"],
  "NF": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "NG": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "NI": [
    "h",
    "H",
    "hB",
    "hb"
  ],
  "NL": ["H", "hB"],
  "NO": ["H", "h"],
  "NP": [
    "H",
    "h",
    "hB"
  ],
  "NR": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "NU": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "NZ": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "OM": [
    "h",
    "hB",
    "hb",
    "H"
  ],
  "PA": [
    "h",
    "H",
    "hB",
    "hb"
  ],
  "PE": [
    "h",
    "H",
    "hB",
    "hb"
  ],
  "PF": [
    "H",
    "h",
    "hB"
  ],
  "PG": ["h", "H"],
  "PH": [
    "h",
    "hB",
    "hb",
    "H"
  ],
  "PK": [
    "h",
    "hB",
    "H"
  ],
  "PL": ["H", "h"],
  "PM": ["H", "hB"],
  "PN": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "PR": [
    "h",
    "H",
    "hB",
    "hb"
  ],
  "PS": [
    "h",
    "hB",
    "hb",
    "H"
  ],
  "PT": ["H", "hB"],
  "PW": ["h", "H"],
  "PY": [
    "h",
    "H",
    "hB",
    "hb"
  ],
  "QA": [
    "h",
    "hB",
    "hb",
    "H"
  ],
  "RE": ["H", "hB"],
  "RO": ["H", "hB"],
  "RS": [
    "H",
    "hB",
    "h"
  ],
  "RU": ["H"],
  "RW": ["H", "h"],
  "SA": [
    "h",
    "hB",
    "hb",
    "H"
  ],
  "SB": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "SC": [
    "H",
    "h",
    "hB"
  ],
  "SD": [
    "h",
    "hB",
    "hb",
    "H"
  ],
  "SE": ["H"],
  "SG": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "SH": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "SI": ["H", "hB"],
  "SJ": ["H"],
  "SK": ["H"],
  "SL": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "SM": [
    "H",
    "h",
    "hB"
  ],
  "SN": [
    "H",
    "h",
    "hB"
  ],
  "SO": ["h", "H"],
  "SR": ["H", "hB"],
  "SS": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "ST": ["H", "hB"],
  "SV": [
    "h",
    "H",
    "hB",
    "hb"
  ],
  "SX": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "SY": [
    "h",
    "hB",
    "hb",
    "H"
  ],
  "SZ": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "TA": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "TC": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "TD": [
    "h",
    "H",
    "hB"
  ],
  "TF": [
    "H",
    "h",
    "hB"
  ],
  "TG": ["H", "hB"],
  "TH": ["H", "h"],
  "TJ": ["H", "h"],
  "TL": [
    "H",
    "hB",
    "hb",
    "h"
  ],
  "TM": ["H", "h"],
  "TN": [
    "h",
    "hB",
    "hb",
    "H"
  ],
  "TO": ["h", "H"],
  "TR": ["H", "hB"],
  "TT": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "TW": [
    "hB",
    "hb",
    "h",
    "H"
  ],
  "TZ": [
    "hB",
    "hb",
    "H",
    "h"
  ],
  "UA": [
    "H",
    "hB",
    "h"
  ],
  "UG": [
    "hB",
    "hb",
    "H",
    "h"
  ],
  "UM": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "US": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "UY": [
    "h",
    "H",
    "hB",
    "hb"
  ],
  "UZ": [
    "H",
    "hB",
    "h"
  ],
  "VA": [
    "H",
    "h",
    "hB"
  ],
  "VC": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "VE": [
    "h",
    "H",
    "hB",
    "hb"
  ],
  "VG": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "VI": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "VN": ["H", "h"],
  "VU": ["h", "H"],
  "WF": ["H", "hB"],
  "WS": ["h", "H"],
  "XK": [
    "H",
    "hB",
    "h"
  ],
  "YE": [
    "h",
    "hB",
    "hb",
    "H"
  ],
  "YT": ["H", "hB"],
  "ZA": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "ZM": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "ZW": ["H", "h"],
  "af-ZA": [
    "H",
    "h",
    "hB",
    "hb"
  ],
  "ar-001": [
    "h",
    "hB",
    "hb",
    "H"
  ],
  "ca-ES": [
    "H",
    "h",
    "hB"
  ],
  "en-001": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "en-HK": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "en-IL": [
    "H",
    "h",
    "hb",
    "hB"
  ],
  "en-MY": [
    "h",
    "hb",
    "H",
    "hB"
  ],
  "es-BR": [
    "H",
    "h",
    "hB",
    "hb"
  ],
  "es-ES": [
    "H",
    "h",
    "hB",
    "hb"
  ],
  "es-GQ": [
    "H",
    "h",
    "hB",
    "hb"
  ],
  "fr-CA": [
    "H",
    "h",
    "hB"
  ],
  "gl-ES": [
    "H",
    "h",
    "hB"
  ],
  "gu-IN": [
    "hB",
    "hb",
    "h",
    "H"
  ],
  "hi-IN": [
    "hB",
    "h",
    "H"
  ],
  "it-CH": [
    "H",
    "h",
    "hB"
  ],
  "it-IT": [
    "H",
    "h",
    "hB"
  ],
  "kn-IN": [
    "hB",
    "h",
    "H"
  ],
  "ku-SY": ["H", "hB"],
  "ml-IN": [
    "hB",
    "h",
    "H"
  ],
  "mr-IN": [
    "hB",
    "hb",
    "h",
    "H"
  ],
  "pa-IN": [
    "hB",
    "hb",
    "h",
    "H"
  ],
  "ta-IN": [
    "hB",
    "h",
    "hb",
    "H"
  ],
  "te-IN": [
    "hB",
    "h",
    "H"
  ],
  "zu-ZA": [
    "H",
    "hB",
    "hb",
    "h"
  ]
};
function getBestPattern(skeleton, locale) {
  let skeletonCopy = "";
  for (let patternPos = 0; patternPos < skeleton.length; patternPos++) {
    const patternChar = skeleton.charAt(patternPos);
    if (patternChar === "j") {
      let extraLength = 0;
      while (patternPos + 1 < skeleton.length && skeleton.charAt(patternPos + 1) === patternChar) {
        extraLength++;
        patternPos++;
      }
      let hourLen = 1 + (extraLength & 1);
      let dayPeriodLen = extraLength < 2 ? 1 : 3 + (extraLength >> 1);
      let dayPeriodChar = "a";
      let hourChar = getDefaultHourSymbolFromLocale(locale);
      if (hourChar == "H" || hourChar == "k") dayPeriodLen = 0;
      while (dayPeriodLen-- > 0) skeletonCopy += dayPeriodChar;
      while (hourLen-- > 0) skeletonCopy = hourChar + skeletonCopy;
    } else if (patternChar === "J") skeletonCopy += "H";
    else skeletonCopy += patternChar;
  }
  return skeletonCopy;
}
function getDefaultHourSymbolFromLocale(locale) {
  let hourCycle = locale.hourCycle;
  if (hourCycle === void 0) {
    const localeWithHourCycles = locale;
    hourCycle = localeWithHourCycles.getHourCycles?.()[0] ?? localeWithHourCycles.hourCycles?.[0];
  }
  if (hourCycle) switch (hourCycle) {
    case "h24":
      return "k";
    case "h23":
      return "H";
    case "h12":
      return "h";
    case "h11":
      return "K";
    default:
      throw new Error("Invalid hourCycle");
  }
  const languageTag = locale.language;
  let regionTag;
  if (languageTag !== "root") regionTag = locale.maximize().region;
  return (timeData[`${languageTag}-${regionTag}`] || timeData[regionTag || ""] || timeData[languageTag || ""] || timeData[`${languageTag}-001`] || timeData["001"])[0].charAt(0);
}
var SPACE_SEPARATOR_START_REGEX = new RegExp(`^${SPACE_SEPARATOR_REGEX.source}*`);
var SPACE_SEPARATOR_END_REGEX = new RegExp(`${SPACE_SEPARATOR_REGEX.source}*$`);
function createLocation(start, end) {
  return {
    start,
    end
  };
}
var hasNativeFromEntries = !!Object.fromEntries;
var hasTrimStart = !!String.prototype.trimStart;
var hasTrimEnd = !!String.prototype.trimEnd;
var fromEntries = hasNativeFromEntries ? Object.fromEntries : function fromEntries2(entries) {
  const obj = {};
  for (const [k, v] of entries) obj[k] = v;
  return obj;
};
var trimStart = hasTrimStart ? function trimStart2(s) {
  return s.trimStart();
} : function trimStart3(s) {
  return s.replace(SPACE_SEPARATOR_START_REGEX, "");
};
var trimEnd = hasTrimEnd ? function trimEnd2(s) {
  return s.trimEnd();
} : function trimEnd3(s) {
  return s.replace(SPACE_SEPARATOR_END_REGEX, "");
};
var IDENTIFIER_PREFIX_RE = new RegExp("([^\\p{White_Space}\\p{Pattern_Syntax}]*)", "yu");
function matchIdentifierAtIndex(s, index) {
  IDENTIFIER_PREFIX_RE.lastIndex = index;
  return IDENTIFIER_PREFIX_RE.exec(s)[1] ?? "";
}
function plainTopLevelEndPosition(message) {
  if (message.length === 0) return null;
  let line = 1;
  let column = 1;
  for (let offset = 0; offset < message.length; ) {
    const code = message.charCodeAt(offset);
    switch (code) {
      case 35:
      case 39:
      case 60:
      case 123:
      case 125:
        return null;
    }
    if (code === 10) {
      line++;
      column = 1;
      offset++;
    } else {
      column++;
      if (code >= 55296 && code <= 56319 && offset + 1 < message.length) {
        const next = message.charCodeAt(offset + 1);
        offset += next >= 56320 && next <= 57343 ? 2 : 1;
      } else offset++;
    }
  }
  return {
    offset: message.length,
    line,
    column
  };
}
var Parser = class {
  constructor(message, options = {}) {
    this.message = message;
    this.position = {
      offset: 0,
      line: 1,
      column: 1
    };
    this.ignoreTag = !!options.ignoreTag;
    this.locale = options.locale;
    this.requiresOtherClause = !!options.requiresOtherClause;
    this.shouldParseSkeletons = !!options.shouldParseSkeletons;
  }
  parse() {
    if (this.offset() !== 0) throw Error("parser can only be used once");
    if (this.message.length > 0) {
      const firstCode = this.message.charCodeAt(0);
      if (firstCode !== 35 && firstCode !== 39 && firstCode !== 60 && firstCode !== 123 && firstCode !== 125) {
        const plainEndPosition = plainTopLevelEndPosition(this.message);
        if (plainEndPosition) {
          const start = this.clonePosition();
          this.position = plainEndPosition;
          return {
            val: [{
              type: 0,
              value: this.message,
              location: createLocation(start, this.clonePosition())
            }],
            err: null
          };
        }
      }
    }
    return this.parseMessage(0, "", false);
  }
  parseMessage(nestingLevel, parentArgType, expectingCloseTag) {
    let elements = [];
    while (!this.isEOF()) {
      const char = this.char();
      if (char === 123) {
        const result = this.parseArgument(nestingLevel, expectingCloseTag);
        if (result.err) return result;
        elements.push(result.val);
      } else if (char === 125 && nestingLevel > 0) break;
      else if (char === 35 && (parentArgType === "plural" || parentArgType === "selectordinal")) {
        const position = this.clonePosition();
        this.bump();
        elements.push({
          type: 7,
          location: createLocation(position, this.clonePosition())
        });
      } else if (char === 60 && !this.ignoreTag && this.peek() === 47) {
        if (expectingCloseTag) break;
        else return this.error(26, createLocation(this.clonePosition(), this.clonePosition()));
      } else if (char === 60 && !this.ignoreTag && _isAlpha(this.peek() || 0)) {
        const result = this.parseTag(nestingLevel, parentArgType);
        if (result.err) return result;
        elements.push(result.val);
      } else {
        const result = this.parseLiteral(nestingLevel, parentArgType);
        if (result.err) return result;
        elements.push(result.val);
      }
    }
    return {
      val: elements,
      err: null
    };
  }
  /**
  * A tag name must start with an ASCII lower/upper case letter. The grammar is based on the
  * [custom element name][] except that a dash is NOT always mandatory and uppercase letters
  * are accepted:
  *
  * ```
  * tag ::= "<" tagName (whitespace)* "/>" | "<" tagName (whitespace)* ">" message "</" tagName (whitespace)* ">"
  * tagName ::= [a-z] (PENChar)*
  * PENChar ::=
  *     "-" | "." | [0-9] | "_" | [a-z] | [A-Z] | #xB7 | [#xC0-#xD6] | [#xD8-#xF6] | [#xF8-#x37D] |
  *     [#x37F-#x1FFF] | [#x200C-#x200D] | [#x203F-#x2040] | [#x2070-#x218F] | [#x2C00-#x2FEF] |
  *     [#x3001-#xD7FF] | [#xF900-#xFDCF] | [#xFDF0-#xFFFD] | [#x10000-#xEFFFF]
  * ```
  *
  * [custom element name]: https://html.spec.whatwg.org/multipage/custom-elements.html#valid-custom-element-name
  * NOTE: We're a bit more lax here since HTML technically does not allow uppercase HTML element but we do
  * since other tag-based engines like React allow it
  */
  parseTag(nestingLevel, parentArgType) {
    const startPosition = this.clonePosition();
    this.bump();
    const tagName = this.parseTagName();
    this.bumpSpace();
    if (this.bumpIf("/>")) return {
      val: {
        type: 0,
        value: `<${tagName}/>`,
        location: createLocation(startPosition, this.clonePosition())
      },
      err: null
    };
    else if (this.bumpIf(">")) {
      const childrenResult = this.parseMessage(nestingLevel + 1, parentArgType, true);
      if (childrenResult.err) return childrenResult;
      const children = childrenResult.val;
      const endTagStartPosition = this.clonePosition();
      if (this.bumpIf("</")) {
        if (this.isEOF() || !_isAlpha(this.char())) return this.error(23, createLocation(endTagStartPosition, this.clonePosition()));
        const closingTagNameStartPosition = this.clonePosition();
        if (tagName !== this.parseTagName()) return this.error(26, createLocation(closingTagNameStartPosition, this.clonePosition()));
        this.bumpSpace();
        if (!this.bumpIf(">")) return this.error(23, createLocation(endTagStartPosition, this.clonePosition()));
        return {
          val: {
            type: 8,
            value: tagName,
            children,
            location: createLocation(startPosition, this.clonePosition())
          },
          err: null
        };
      } else return this.error(27, createLocation(startPosition, this.clonePosition()));
    } else return this.error(23, createLocation(startPosition, this.clonePosition()));
  }
  /**
  * This method assumes that the caller has peeked ahead for the first tag character.
  */
  parseTagName() {
    const startOffset = this.offset();
    this.bump();
    while (!this.isEOF() && _isPotentialElementNameChar(this.char())) this.bump();
    return this.message.slice(startOffset, this.offset());
  }
  parseLiteral(nestingLevel, parentArgType) {
    const start = this.clonePosition();
    let value = "";
    while (true) {
      const parseQuoteResult = this.tryParseQuote(parentArgType);
      if (parseQuoteResult) {
        value += parseQuoteResult;
        continue;
      }
      const parseUnquotedResult = this.tryParseUnquoted(nestingLevel, parentArgType);
      if (parseUnquotedResult) {
        value += parseUnquotedResult;
        continue;
      }
      const parseLeftAngleResult = this.tryParseLeftAngleBracket();
      if (parseLeftAngleResult) {
        value += parseLeftAngleResult;
        continue;
      }
      break;
    }
    const location = createLocation(start, this.clonePosition());
    return {
      val: {
        type: 0,
        value,
        location
      },
      err: null
    };
  }
  tryParseLeftAngleBracket() {
    if (!this.isEOF() && this.char() === 60 && (this.ignoreTag || !_isAlphaOrSlash(this.peek() || 0))) {
      this.bump();
      return "<";
    }
    return null;
  }
  /**
  * Starting with ICU 4.8, an ASCII apostrophe only starts quoted text if it immediately precedes
  * a character that requires quoting (that is, "only where needed"), and works the same in
  * nested messages as on the top level of the pattern. The new behavior is otherwise compatible.
  */
  tryParseQuote(parentArgType) {
    if (this.isEOF() || this.char() !== 39) return null;
    switch (this.peek()) {
      case 39:
        this.bump();
        this.bump();
        return "'";
      case 123:
      case 60:
      case 62:
      case 125:
        break;
      case 35:
        if (parentArgType === "plural" || parentArgType === "selectordinal") break;
        return null;
      default:
        return null;
    }
    this.bump();
    const codePoints = [this.char()];
    this.bump();
    while (!this.isEOF()) {
      const ch = this.char();
      if (ch === 39) {
        if (this.peek() === 39) {
          codePoints.push(39);
          this.bump();
        } else {
          this.bump();
          break;
        }
      } else codePoints.push(ch);
      this.bump();
    }
    return String.fromCodePoint(...codePoints);
  }
  tryParseUnquoted(nestingLevel, parentArgType) {
    if (this.isEOF()) return null;
    const ch = this.char();
    if (ch === 60 || ch === 123 || ch === 35 && (parentArgType === "plural" || parentArgType === "selectordinal") || ch === 125 && nestingLevel > 0) return null;
    else {
      this.bump();
      return String.fromCodePoint(ch);
    }
  }
  parseArgument(nestingLevel, expectingCloseTag) {
    const openingBracePosition = this.clonePosition();
    this.bump();
    this.bumpSpace();
    if (this.isEOF()) return this.error(1, createLocation(openingBracePosition, this.clonePosition()));
    if (this.char() === 125) {
      this.bump();
      return this.error(2, createLocation(openingBracePosition, this.clonePosition()));
    }
    let value = this.parseIdentifierIfPossible().value;
    if (!value) return this.error(3, createLocation(openingBracePosition, this.clonePosition()));
    this.bumpSpace();
    if (this.isEOF()) return this.error(1, createLocation(openingBracePosition, this.clonePosition()));
    switch (this.char()) {
      case 125:
        this.bump();
        return {
          val: {
            type: 1,
            value,
            location: createLocation(openingBracePosition, this.clonePosition())
          },
          err: null
        };
      case 44:
        this.bump();
        this.bumpSpace();
        if (this.isEOF()) return this.error(1, createLocation(openingBracePosition, this.clonePosition()));
        return this.parseArgumentOptions(nestingLevel, expectingCloseTag, value, openingBracePosition);
      default:
        return this.error(3, createLocation(openingBracePosition, this.clonePosition()));
    }
  }
  /**
  * Advance the parser until the end of the identifier, if it is currently on
  * an identifier character. Return an empty string otherwise.
  */
  parseIdentifierIfPossible() {
    const startingPosition = this.clonePosition();
    const startOffset = this.offset();
    const value = matchIdentifierAtIndex(this.message, startOffset);
    const endOffset = startOffset + value.length;
    this.bumpTo(endOffset);
    return {
      value,
      location: createLocation(startingPosition, this.clonePosition())
    };
  }
  parseArgumentOptions(nestingLevel, expectingCloseTag, value, openingBracePosition) {
    let typeStartPosition = this.clonePosition();
    let argType = this.parseIdentifierIfPossible().value;
    let typeEndPosition = this.clonePosition();
    switch (argType) {
      case "":
        return this.error(4, createLocation(typeStartPosition, typeEndPosition));
      case "number":
      case "date":
      case "time": {
        this.bumpSpace();
        let styleAndLocation = null;
        if (this.bumpIf(",")) {
          this.bumpSpace();
          const styleStartPosition = this.clonePosition();
          const result = this.parseSimpleArgStyleIfPossible();
          if (result.err) return result;
          const style = trimEnd(result.val);
          if (style.length === 0) return this.error(6, createLocation(this.clonePosition(), this.clonePosition()));
          styleAndLocation = {
            style,
            styleLocation: createLocation(styleStartPosition, this.clonePosition())
          };
        }
        const argCloseResult = this.tryParseArgumentClose(openingBracePosition);
        if (argCloseResult.err) return argCloseResult;
        const location = createLocation(openingBracePosition, this.clonePosition());
        if (styleAndLocation && styleAndLocation.style.startsWith("::")) {
          let skeleton = trimStart(styleAndLocation.style.slice(2));
          if (argType === "number") {
            const result = this.parseNumberSkeletonFromString(skeleton, styleAndLocation.styleLocation);
            if (result.err) return result;
            return {
              val: {
                type: 2,
                value,
                location,
                style: result.val
              },
              err: null
            };
          } else {
            if (skeleton.length === 0) return this.error(10, location);
            let dateTimePattern = skeleton;
            if (this.locale) dateTimePattern = getBestPattern(skeleton, this.locale);
            const style = {
              type: 1,
              pattern: dateTimePattern,
              location: styleAndLocation.styleLocation,
              parsedOptions: this.shouldParseSkeletons ? parseDateTimeSkeleton(dateTimePattern) : {}
            };
            return {
              val: {
                type: argType === "date" ? 3 : 4,
                value,
                location,
                style
              },
              err: null
            };
          }
        }
        return {
          val: {
            type: argType === "number" ? 2 : argType === "date" ? 3 : 4,
            value,
            location,
            style: styleAndLocation?.style ?? null
          },
          err: null
        };
      }
      case "plural":
      case "selectordinal":
      case "select": {
        const typeEndPosition2 = this.clonePosition();
        this.bumpSpace();
        if (!this.bumpIf(",")) return this.error(12, createLocation(typeEndPosition2, { ...typeEndPosition2 }));
        this.bumpSpace();
        let identifierAndLocation = this.parseIdentifierIfPossible();
        let pluralOffset = 0;
        if (argType !== "select" && identifierAndLocation.value === "offset") {
          if (!this.bumpIf(":")) return this.error(13, createLocation(this.clonePosition(), this.clonePosition()));
          this.bumpSpace();
          const result = this.tryParseDecimalInteger(13, 14);
          if (result.err) return result;
          this.bumpSpace();
          identifierAndLocation = this.parseIdentifierIfPossible();
          pluralOffset = result.val;
        }
        const optionsResult = this.tryParsePluralOrSelectOptions(nestingLevel, argType, expectingCloseTag, identifierAndLocation);
        if (optionsResult.err) return optionsResult;
        const argCloseResult = this.tryParseArgumentClose(openingBracePosition);
        if (argCloseResult.err) return argCloseResult;
        const location = createLocation(openingBracePosition, this.clonePosition());
        if (argType === "select") return {
          val: {
            type: 5,
            value,
            options: fromEntries(optionsResult.val),
            location
          },
          err: null
        };
        else return {
          val: {
            type: 6,
            value,
            options: fromEntries(optionsResult.val),
            offset: pluralOffset,
            pluralType: argType === "plural" ? "cardinal" : "ordinal",
            location
          },
          err: null
        };
      }
      default:
        return this.error(5, createLocation(typeStartPosition, typeEndPosition));
    }
  }
  tryParseArgumentClose(openingBracePosition) {
    if (this.isEOF() || this.char() !== 125) return this.error(1, createLocation(openingBracePosition, this.clonePosition()));
    this.bump();
    return {
      val: true,
      err: null
    };
  }
  /**
  * See: https://github.com/unicode-org/icu/blob/af7ed1f6d2298013dc303628438ec4abe1f16479/icu4c/source/common/messagepattern.cpp#L659
  */
  parseSimpleArgStyleIfPossible() {
    let nestedBraces = 0;
    const startPosition = this.clonePosition();
    while (!this.isEOF()) switch (this.char()) {
      case 39: {
        this.bump();
        let apostrophePosition = this.clonePosition();
        if (!this.bumpUntil("'")) return this.error(11, createLocation(apostrophePosition, this.clonePosition()));
        this.bump();
        break;
      }
      case 123:
        nestedBraces += 1;
        this.bump();
        break;
      case 125:
        if (nestedBraces > 0) nestedBraces -= 1;
        else return {
          val: this.message.slice(startPosition.offset, this.offset()),
          err: null
        };
        break;
      default:
        this.bump();
    }
    return {
      val: this.message.slice(startPosition.offset, this.offset()),
      err: null
    };
  }
  parseNumberSkeletonFromString(skeleton, location) {
    let tokens = [];
    try {
      tokens = parseNumberSkeletonFromString(skeleton);
    } catch {
      return this.error(7, location);
    }
    return {
      val: {
        type: 0,
        tokens,
        location,
        parsedOptions: this.shouldParseSkeletons ? parseNumberSkeleton(tokens) : {}
      },
      err: null
    };
  }
  /**
  * @param nesting_level The current nesting level of messages.
  *     This can be positive when parsing message fragment in select or plural argument options.
  * @param parent_arg_type The parent argument's type.
  * @param parsed_first_identifier If provided, this is the first identifier-like selector of
  *     the argument. It is a by-product of a previous parsing attempt.
  * @param expecting_close_tag If true, this message is directly or indirectly nested inside
  *     between a pair of opening and closing tags. The nested message will not parse beyond
  *     the closing tag boundary.
  */
  tryParsePluralOrSelectOptions(nestingLevel, parentArgType, expectCloseTag, parsedFirstIdentifier) {
    let hasOtherClause = false;
    const options = [];
    const parsedSelectors = /* @__PURE__ */ new Set();
    let { value: selector, location: selectorLocation } = parsedFirstIdentifier;
    while (true) {
      if (selector.length === 0) {
        const startPosition = this.clonePosition();
        if (parentArgType !== "select" && this.bumpIf("=")) {
          const result = this.tryParseDecimalInteger(16, 19);
          if (result.err) return result;
          selectorLocation = createLocation(startPosition, this.clonePosition());
          selector = this.message.slice(startPosition.offset, this.offset());
        } else break;
      }
      if (parsedSelectors.has(selector)) return this.error(parentArgType === "select" ? 21 : 20, selectorLocation);
      if (selector === "other") hasOtherClause = true;
      this.bumpSpace();
      const openingBracePosition = this.clonePosition();
      if (!this.bumpIf("{")) return this.error(parentArgType === "select" ? 17 : 18, createLocation(this.clonePosition(), this.clonePosition()));
      const fragmentResult = this.parseMessage(nestingLevel + 1, parentArgType, expectCloseTag);
      if (fragmentResult.err) return fragmentResult;
      const argCloseResult = this.tryParseArgumentClose(openingBracePosition);
      if (argCloseResult.err) return argCloseResult;
      options.push([selector, {
        value: fragmentResult.val,
        location: createLocation(openingBracePosition, this.clonePosition())
      }]);
      parsedSelectors.add(selector);
      this.bumpSpace();
      ({ value: selector, location: selectorLocation } = this.parseIdentifierIfPossible());
    }
    if (options.length === 0) return this.error(parentArgType === "select" ? 15 : 16, createLocation(this.clonePosition(), this.clonePosition()));
    if (this.requiresOtherClause && !hasOtherClause) return this.error(22, createLocation(this.clonePosition(), this.clonePosition()));
    return {
      val: options,
      err: null
    };
  }
  tryParseDecimalInteger(expectNumberError, invalidNumberError) {
    let sign = 1;
    const startingPosition = this.clonePosition();
    if (this.bumpIf("+")) {
    } else if (this.bumpIf("-")) sign = -1;
    let hasDigits = false;
    let decimal = 0;
    while (!this.isEOF()) {
      const ch = this.char();
      if (ch >= 48 && ch <= 57) {
        hasDigits = true;
        decimal = decimal * 10 + (ch - 48);
        this.bump();
      } else break;
    }
    const location = createLocation(startingPosition, this.clonePosition());
    if (!hasDigits) return this.error(expectNumberError, location);
    decimal *= sign;
    if (!Number.isSafeInteger(decimal)) return this.error(invalidNumberError, location);
    return {
      val: decimal,
      err: null
    };
  }
  offset() {
    return this.position.offset;
  }
  isEOF() {
    return this.offset() === this.message.length;
  }
  clonePosition() {
    return {
      offset: this.position.offset,
      line: this.position.line,
      column: this.position.column
    };
  }
  /**
  * Return the code point at the current position of the parser.
  * Throws if the index is out of bound.
  */
  char() {
    const offset = this.position.offset;
    if (offset >= this.message.length) throw Error("out of bound");
    const code = this.message.codePointAt(offset);
    if (code === void 0) throw Error(`Offset ${offset} is at invalid UTF-16 code unit boundary`);
    return code;
  }
  error(kind, location) {
    return {
      val: null,
      err: {
        kind,
        message: this.message,
        location
      }
    };
  }
  /** Bump the parser to the next UTF-16 code unit. */
  bump() {
    if (this.isEOF()) return;
    const code = this.char();
    if (code === 10) {
      this.position.line += 1;
      this.position.column = 1;
      this.position.offset += 1;
    } else {
      this.position.column += 1;
      this.position.offset += code < 65536 ? 1 : 2;
    }
  }
  /**
  * If the substring starting at the current position of the parser has
  * the given prefix, then bump the parser to the character immediately
  * following the prefix and return true. Otherwise, don't bump the parser
  * and return false.
  */
  bumpIf(prefix) {
    if (this.message.startsWith(prefix, this.offset())) {
      for (let i = 0; i < prefix.length; i++) this.bump();
      return true;
    }
    return false;
  }
  /**
  * Bump the parser until the pattern character is found and return `true`.
  * Otherwise bump to the end of the file and return `false`.
  */
  bumpUntil(pattern) {
    const currentOffset = this.offset();
    const index = this.message.indexOf(pattern, currentOffset);
    if (index >= 0) {
      this.bumpTo(index);
      return true;
    } else {
      this.bumpTo(this.message.length);
      return false;
    }
  }
  /**
  * Bump the parser to the target offset.
  * If target offset is beyond the end of the input, bump the parser to the end of the input.
  */
  bumpTo(targetOffset) {
    if (this.offset() > targetOffset) throw Error(`targetOffset ${targetOffset} must be greater than or equal to the current offset ${this.offset()}`);
    targetOffset = Math.min(targetOffset, this.message.length);
    while (true) {
      const offset = this.offset();
      if (offset === targetOffset) break;
      if (offset > targetOffset) throw Error(`targetOffset ${targetOffset} is at invalid UTF-16 code unit boundary`);
      this.bump();
      if (this.isEOF()) break;
    }
  }
  /** advance the parser through all whitespace to the next non-whitespace code unit. */
  bumpSpace() {
    while (!this.isEOF() && _isWhiteSpace(this.char())) this.bump();
  }
  /**
  * Peek at the *next* Unicode codepoint in the input without advancing the parser.
  * If the input has been exhausted, then this returns null.
  */
  peek() {
    if (this.isEOF()) return null;
    const code = this.char();
    const offset = this.offset();
    return this.message.charCodeAt(offset + (code >= 65536 ? 2 : 1)) ?? null;
  }
};
function _isAlpha(codepoint) {
  return codepoint >= 97 && codepoint <= 122 || codepoint >= 65 && codepoint <= 90;
}
function _isAlphaOrSlash(codepoint) {
  return _isAlpha(codepoint) || codepoint === 47;
}
function _isPotentialElementNameChar(c) {
  return c === 45 || c === 46 || c >= 48 && c <= 57 || c === 95 || c >= 97 && c <= 122 || c >= 65 && c <= 90 || c == 183 || c >= 192 && c <= 214 || c >= 216 && c <= 246 || c >= 248 && c <= 893 || c >= 895 && c <= 8191 || c >= 8204 && c <= 8205 || c >= 8255 && c <= 8256 || c >= 8304 && c <= 8591 || c >= 11264 && c <= 12271 || c >= 12289 && c <= 55295 || c >= 63744 && c <= 64975 || c >= 65008 && c <= 65533 || c >= 65536 && c <= 983039;
}
function _isWhiteSpace(c) {
  return c >= 9 && c <= 13 || c === 32 || c === 133 || c >= 8206 && c <= 8207 || c === 8232 || c === 8233;
}
function pruneLocation(els) {
  els.forEach((el) => {
    delete el.location;
    if (isSelectElement(el) || isPluralElement(el)) for (const k in el.options) {
      delete el.options[k].location;
      pruneLocation(el.options[k].value);
    }
    else if (isNumberElement(el) && isNumberSkeleton(el.style)) delete el.style.location;
    else if ((isDateElement(el) || isTimeElement(el)) && isDateTimeSkeleton(el.style)) delete el.style.location;
    else if (isTagElement(el)) pruneLocation(el.children);
  });
}
function parse(message, opts = {}) {
  opts = {
    shouldParseSkeletons: true,
    requiresOtherClause: true,
    ...opts
  };
  const result = new Parser(message, opts).parse();
  if (result.err) {
    const error = SyntaxError(ErrorKind[result.err.kind]);
    error.location = result.err.location;
    error.originalMessage = result.err.message;
    throw error;
  }
  if (!opts?.captureLocation) pruneLocation(result.val);
  return result.val;
}

// node_modules/intl-messageformat/index.js
var FormatError = class extends Error {
  constructor(msg, code, originalMessage) {
    super(msg);
    this.code = code;
    this.originalMessage = originalMessage;
  }
  toString() {
    return `[formatjs Error: ${this.code}] ${this.message}`;
  }
};
var InvalidValueError = class extends FormatError {
  constructor(variableId, value, options, originalMessage) {
    super(`Invalid values for "${variableId}": "${value}". Options are "${Object.keys(options).join('", "')}"`, "INVALID_VALUE", originalMessage);
  }
};
var InvalidValueTypeError = class extends FormatError {
  constructor(value, type, originalMessage) {
    super(`Value for "${value}" must be of type ${type}`, "INVALID_VALUE", originalMessage);
  }
};
var MissingValueError = class extends FormatError {
  constructor(variableId, originalMessage) {
    super(`The intl string context variable "${variableId}" was not provided to the string "${originalMessage}"`, "MISSING_VALUE", originalMessage);
  }
};
function mergeLiteral(parts) {
  if (parts.length < 2) return parts;
  return parts.reduce((all, part) => {
    const lastPart = all[all.length - 1];
    if (!lastPart || lastPart.type !== 0 || part.type !== 0) all.push(part);
    else lastPart.value += part.value;
    return all;
  }, []);
}
function isFormatXMLElementFn(el) {
  return typeof el === "function";
}
function formatToParts(els, locales, formatters, formats, values, currentPluralValue, originalMessage) {
  if (els.length === 1 && isLiteralElement(els[0])) return [{
    type: 0,
    value: els[0].value
  }];
  const result = [];
  for (const el of els) {
    if (isLiteralElement(el)) {
      result.push({
        type: 0,
        value: el.value
      });
      continue;
    }
    if (isPoundElement(el)) {
      if (typeof currentPluralValue === "number") result.push({
        type: 0,
        value: formatters.getNumberFormat(locales).format(currentPluralValue)
      });
      continue;
    }
    const { value: varName } = el;
    if (!(values && varName in values)) throw new MissingValueError(varName, originalMessage);
    let value = values[varName];
    if (isArgumentElement(el)) {
      if (!value || typeof value === "string" || typeof value === "number" || typeof value === "bigint") value = typeof value === "string" || typeof value === "number" || typeof value === "bigint" ? String(value) : "";
      result.push({
        type: typeof value === "string" ? 0 : 1,
        value
      });
      continue;
    }
    if (isDateElement(el)) {
      const style = typeof el.style === "string" ? formats.date[el.style] : isDateTimeSkeleton(el.style) ? el.style.parsedOptions : void 0;
      result.push({
        type: 0,
        value: formatters.getDateTimeFormat(locales, style).format(value)
      });
      continue;
    }
    if (isTimeElement(el)) {
      const style = typeof el.style === "string" ? formats.time[el.style] : isDateTimeSkeleton(el.style) ? el.style.parsedOptions : formats.time.medium;
      result.push({
        type: 0,
        value: formatters.getDateTimeFormat(locales, style).format(value)
      });
      continue;
    }
    if (isNumberElement(el)) {
      const style = typeof el.style === "string" ? formats.number[el.style] : isNumberSkeleton(el.style) ? el.style.parsedOptions : void 0;
      if (style && style.scale) {
        const scale = style.scale || 1;
        if (typeof value === "bigint") {
          if (!Number.isInteger(scale)) throw new TypeError(`Cannot apply fractional scale ${scale} to bigint value. Scale must be an integer when formatting bigint.`);
          value = value * BigInt(scale);
        } else value = value * scale;
      }
      result.push({
        type: 0,
        value: formatters.getNumberFormat(locales, style).format(value)
      });
      continue;
    }
    if (isTagElement(el)) {
      const { children, value: value2 } = el;
      const formatFn = values[value2];
      if (!isFormatXMLElementFn(formatFn)) throw new InvalidValueTypeError(value2, "function", originalMessage);
      let chunks = formatFn(formatToParts(children, locales, formatters, formats, values, currentPluralValue).map((p) => p.value));
      if (!Array.isArray(chunks)) chunks = [chunks];
      result.push(...chunks.map((c) => {
        return {
          type: typeof c === "string" ? 0 : 1,
          value: c
        };
      }));
    }
    if (isSelectElement(el)) {
      const key = value;
      const opt = (Object.prototype.hasOwnProperty.call(el.options, key) ? el.options[key] : void 0) || el.options.other;
      if (!opt) throw new InvalidValueError(el.value, value, Object.keys(el.options), originalMessage);
      result.push(...formatToParts(opt.value, locales, formatters, formats, values));
      continue;
    }
    if (isPluralElement(el)) {
      const exactKey = `=${value}`;
      let opt = Object.prototype.hasOwnProperty.call(el.options, exactKey) ? el.options[exactKey] : void 0;
      if (!opt) {
        if (!Intl.PluralRules) throw new FormatError(`Intl.PluralRules is not available in this environment.
Try polyfilling it using "@formatjs/intl-pluralrules"
`, "MISSING_INTL_API", originalMessage);
        const numericValue2 = typeof value === "bigint" ? Number(value) : value;
        const rule = formatters.getPluralRules(locales, { type: el.pluralType }).select(numericValue2 - (el.offset || 0));
        opt = (Object.prototype.hasOwnProperty.call(el.options, rule) ? el.options[rule] : void 0) || el.options.other;
      }
      if (!opt) throw new InvalidValueError(el.value, value, Object.keys(el.options), originalMessage);
      const numericValue = typeof value === "bigint" ? Number(value) : value;
      result.push(...formatToParts(opt.value, locales, formatters, formats, values, numericValue - (el.offset || 0)));
      continue;
    }
  }
  return mergeLiteral(result);
}
function mergeConfig(c1, c2) {
  if (!c2) return c1;
  return {
    ...c1,
    ...c2,
    ...Object.keys(c1).reduce((all, k) => {
      all[k] = {
        ...c1[k],
        ...c2[k]
      };
      return all;
    }, {})
  };
}
function mergeConfigs(defaultConfig, configs) {
  if (!configs) return defaultConfig;
  return Object.keys(defaultConfig).reduce((all, k) => {
    all[k] = mergeConfig(defaultConfig[k], configs[k]);
    return all;
  }, { ...defaultConfig });
}
function createFastMemoizeCache(store) {
  return { create() {
    return {
      get(key) {
        return store[key];
      },
      set(key, value) {
        store[key] = value;
      }
    };
  } };
}
function createDefaultFormatters(cache = {
  number: {},
  dateTime: {},
  pluralRules: {}
}) {
  return {
    getNumberFormat: memoize((...args) => new Intl.NumberFormat(...args), {
      cache: createFastMemoizeCache(cache.number),
      strategy: strategies.variadic
    }),
    getDateTimeFormat: memoize((...args) => new Intl.DateTimeFormat(...args), {
      cache: createFastMemoizeCache(cache.dateTime),
      strategy: strategies.variadic
    }),
    getPluralRules: memoize((...args) => new Intl.PluralRules(...args), {
      cache: createFastMemoizeCache(cache.pluralRules),
      strategy: strategies.variadic
    })
  };
}
var IntlMessageFormat = class IntlMessageFormat2 {
  constructor(message, locales = IntlMessageFormat2.defaultLocale, overrideFormats, opts) {
    this.formatterCache = {
      number: {},
      dateTime: {},
      pluralRules: {}
    };
    this.format = (values) => {
      const parts = this.formatToParts(values);
      if (parts.length === 1) return parts[0].value;
      const result = parts.reduce((all, part) => {
        if (!all.length || part.type !== 0 || typeof all[all.length - 1] !== "string") all.push(part.value);
        else all[all.length - 1] += part.value;
        return all;
      }, []);
      if (result.length <= 1) return result[0] || "";
      return result;
    };
    this.formatToParts = (values) => formatToParts(this.ast, this.locales, this.formatters, this.formats, values, void 0, this.message);
    this.resolvedOptions = () => ({ locale: this.resolvedLocale?.toString() || Intl.NumberFormat.supportedLocalesOf(this.locales)[0] });
    this.getAst = () => this.ast;
    this.locales = locales;
    this.resolvedLocale = IntlMessageFormat2.resolveLocale(locales);
    if (typeof message === "string") {
      this.message = message;
      if (!IntlMessageFormat2.__parse) throw new TypeError("IntlMessageFormat.__parse must be set to process `message` of type `string`");
      const { ...parseOpts } = opts || {};
      this.ast = IntlMessageFormat2.__parse(message, {
        ...parseOpts,
        locale: this.resolvedLocale
      });
    } else this.ast = message;
    if (!Array.isArray(this.ast)) throw new TypeError("A message must be provided as a String or AST.");
    this.formats = mergeConfigs(IntlMessageFormat2.formats, overrideFormats);
    this.formatters = opts && opts.formatters || createDefaultFormatters(this.formatterCache);
  }
  static {
    this.memoizedDefaultLocale = null;
  }
  static get defaultLocale() {
    if (!IntlMessageFormat2.memoizedDefaultLocale) IntlMessageFormat2.memoizedDefaultLocale = new Intl.NumberFormat().resolvedOptions().locale;
    return IntlMessageFormat2.memoizedDefaultLocale;
  }
  static {
    this.resolveLocale = (locales) => {
      if (typeof Intl.Locale === "undefined") return;
      const supportedLocales = Intl.NumberFormat.supportedLocalesOf(locales);
      if (supportedLocales.length > 0) return new Intl.Locale(supportedLocales[0]);
      return new Intl.Locale(typeof locales === "string" ? locales : locales[0]);
    };
  }
  static {
    this.__parse = parse;
  }
  static {
    this.formats = {
      number: {
        integer: { maximumFractionDigits: 0 },
        currency: { style: "currency" },
        percent: { style: "percent" }
      },
      date: {
        short: {
          month: "numeric",
          day: "numeric",
          year: "2-digit"
        },
        medium: {
          month: "short",
          day: "numeric",
          year: "numeric"
        },
        long: {
          month: "long",
          day: "numeric",
          year: "numeric"
        },
        full: {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric"
        }
      },
      time: {
        short: {
          hour: "numeric",
          minute: "numeric"
        },
        medium: {
          hour: "numeric",
          minute: "numeric",
          second: "numeric"
        },
        long: {
          hour: "numeric",
          minute: "numeric",
          second: "numeric",
          timeZoneName: "short"
        },
        full: {
          hour: "numeric",
          minute: "numeric",
          second: "numeric",
          timeZoneName: "short"
        }
      }
    };
  }
};

// src/messages/ja.json
var ja_default = {
  common: {
    close: "\u9589\u3058\u308B",
    cancel: "\u30AD\u30E3\u30F3\u30BB\u30EB",
    delete: "\u524A\u9664",
    deleteConfirm: "\u524A\u9664\u3059\u308B",
    untitledTask: "\uFF08\u7121\u984C\u306E\u30BF\u30B9\u30AF\uFF09",
    untitledSprint: "\uFF08\u7121\u984C\u306E\u30B9\u30D7\u30EA\u30F3\u30C8\uFF09",
    listSeparator: "\u3001",
    bullet: "\u30FB",
    done: "\u5B8C\u4E86",
    notDone: "\u672A\u5B8C\u4E86"
  },
  header: {
    import: "\u8AAD\u307F\u8FBC\u307F",
    export: "\u66F8\u304D\u51FA\u3057",
    exportJson: "JSON\u66F8\u304D\u51FA\u3057",
    exportSharedHtml: "\u5171\u6709\u7528HTML\u66F8\u304D\u51FA\u3057",
    copyMermaid: "Mermaid\u30B3\u30D4\u30FC",
    copyPng: "PNG\u3068\u3057\u3066\u30B3\u30D4\u30FC\uFF08\u8868\u793A\u7BC4\u56F2\uFF09",
    leveling: "\u30EA\u30BD\u30FC\u30B9\u5E73\u6E96\u5316\u3092\u6709\u52B9\u306B\u3059\u308B",
    runScheduling: "\u81EA\u52D5\u30B9\u30B1\u30B8\u30E5\u30FC\u30EA\u30F3\u30B0\u5B9F\u884C",
    sprintConflictsTitle: "\u30B9\u30D7\u30EA\u30F3\u30C8\u306E\u671F\u9593\u3068\u77DB\u76FE\u3057\u3066\u3044\u308B\u30BF\u30B9\u30AF\u304C{count}\u4EF6\u3042\u308A\u307E\u3059\uFF08\u30AF\u30EA\u30C3\u30AF\u3067\u8A73\u7D30\u3092\u8868\u793A\uFF09",
    dependencyIssuesTitle: "\u4F9D\u5B58\u95A2\u4FC2\u306B\u77DB\u76FE\u304C\u3042\u308A\u307E\u3059\uFF08{count}\u4EF6\u3002\u30AF\u30EA\u30C3\u30AF\u3067\u8A73\u7D30\u3092\u8868\u793A\uFF09",
    dependencyIssuesButton: "\u4F9D\u5B58\u95A2\u4FC2\u306E\u77DB\u76FE {count}",
    projectEnd: "\u5B8C\u4E86\u4E88\u5B9A {date}",
    critical: "\u30AF\u30EA\u30C6\u30A3\u30AB\u30EB {count}",
    language: "\u8868\u793A\u8A00\u8A9E",
    languageName: {
      ja: "\u65E5\u672C\u8A9E",
      en: "English"
    }
  },
  tabs: {
    gantt: "WBS / \u30AC\u30F3\u30C8",
    network: "\u30CD\u30C3\u30C8\u30EF\u30FC\u30AF\u56F3",
    resource: "\u30EA\u30BD\u30FC\u30B9",
    sprints: "\u30B9\u30D7\u30EA\u30F3\u30C8",
    calendar: "\u30AB\u30EC\u30F3\u30C0\u30FC\u7DE8\u96C6",
    versions: "\u30D0\u30FC\u30B8\u30E7\u30F3"
  },
  linked: {
    fileInputLabel: "\u9023\u643AJSON\u30D5\u30A1\u30A4\u30EB",
    loading: "\u9023\u643AJSON\u3092\u78BA\u8A8D\u3057\u3066\u3044\u307E\u3059...",
    selectionRequired: "query\u3067\u6307\u5B9A\u3055\u308C\u305FJSON\u3092\u521D\u56DE\u3060\u3051\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
    permissionRequired: "\u95A2\u9023\u4ED8\u3051\u6E08\u307FJSON\u3078\u306E\u30A2\u30AF\u30BB\u30B9\u3092\u518D\u8A31\u53EF\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
    error: "\u9023\u643AJSON\u3092\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3067\u3057\u305F: {message}",
    errors: {
      invalidFormat: "\u30D5\u30A1\u30A4\u30EB\u5F62\u5F0F\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093",
      parseFailed: "JSON\u3092\u89E3\u6790\u3067\u304D\u307E\u305B\u3093",
      readFailed: "\u95A2\u9023\u4ED8\u3051\u305F\u30D5\u30A1\u30A4\u30EB\u3092\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093",
      pickFailed: "\u30D5\u30A1\u30A4\u30EB\u9078\u629E\u3092\u958B\u59CB\u3067\u304D\u307E\u305B\u3093"
    },
    loaded: "<file>{fileName}</file>\u3092\u8868\u793A\u3057\u3066\u3044\u307E\u3059\u3002\u3053\u306E\u753B\u9762\u3067\u306E\u5909\u66F4\u306F\u81EA\u52D5\u4FDD\u5B58\u3055\u308C\u307E\u305B\u3093\u3002",
    loadedWithDate: "<file>{fileName}</file>\uFF08\u6700\u7D42\u66F4\u65B0 {lastModified}\uFF09\u3092\u8868\u793A\u3057\u3066\u3044\u307E\u3059\u3002\u3053\u306E\u753B\u9762\u3067\u306E\u5909\u66F4\u306F\u81EA\u52D5\u4FDD\u5B58\u3055\u308C\u307E\u305B\u3093\u3002",
    key: "\u95A2\u9023\u4ED8\u3051\u30AD\u30FC:",
    notPersistent: "\uFF08\u3053\u306E\u30D6\u30E9\u30A6\u30B6\u3067\u306F\u6B21\u56DE\u3082\u30D5\u30A1\u30A4\u30EB\u9078\u629E\u304C\u5FC5\u8981\u3067\u3059\uFF09",
    reload: "\u6700\u65B0\u7248\u3092\u518D\u8AAD\u8FBC",
    selectOther: "\u5225\u306EJSON\u3092\u9078\u629E",
    allowAccess: "\u30A2\u30AF\u30BB\u30B9\u3092\u8A31\u53EF",
    reselect: "JSON\u3092\u9078\u3073\u76F4\u3059",
    select: "JSON\u3092\u9078\u629E"
  },
  embedded: {
    banner: "<b>{exportedAt}</b> \u306B\u66F8\u304D\u51FA\u3055\u308C\u305F\u30B9\u30B1\u30B8\u30E5\u30FC\u30EB\u3092\u8868\u793A\u4E2D\u3067\u3059\u3002\u3053\u306E\u753B\u9762\u3067\u306E\u5909\u66F4\u306F\u3053\u306EHTML\u30D5\u30A1\u30A4\u30EB\u306B\u306F\u4FDD\u5B58\u3055\u308C\u307E\u305B\u3093\uFF08\u518D\u8AAD\u307F\u8FBC\u307F\u3059\u308B\u3068\u66F8\u304D\u51FA\u3057\u6642\u70B9\u306E\u72B6\u614B\u306B\u623B\u308A\u307E\u3059\uFF09\u3002",
    loadFailed: "\u3053\u306EHTML\u306B\u57CB\u3081\u8FBC\u307E\u308C\u305F\u30B9\u30B1\u30B8\u30E5\u30FC\u30EB\u30C7\u30FC\u30BF\u3092\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3067\u3057\u305F\u3002"
  },
  toast: {
    linkSaveFailed: "JSON\u306F\u8AAD\u307F\u8FBC\u307F\u307E\u3057\u305F\u304C\u3001\u95A2\u9023\u4ED8\u3051\u3092\u30D6\u30E9\u30A6\u30B6\u306B\u4FDD\u5B58\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F",
    linkedReloaded: "\u9023\u643AJSON\u3092\u518D\u8AAD\u307F\u8FBC\u307F\u3057\u307E\u3057\u305F",
    scheduleNotConverged: "\u958B\u59CB\u65E5\u3092\u518D\u8A08\u7B97\u3057\u307E\u3057\u305F\u304C\u3001\u4E00\u90E8\u306E\u30BF\u30B9\u30AF\u3067\u8868\u793A\u3068\u958B\u59CB\u65E5\u304C\u4E00\u81F4\u3057\u3066\u3044\u306A\u3044\u53EF\u80FD\u6027\u304C\u3042\u308A\u307E\u3059\u3002\u3082\u3046\u4E00\u5EA6\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044",
    scheduledWithLeveling: "\u4F9D\u5B58\u95A2\u4FC2\u3068\u30EA\u30BD\u30FC\u30B9\u5E73\u6E96\u5316\u306B\u57FA\u3065\u304D\u958B\u59CB\u65E5\u3092\u518D\u8A08\u7B97\u3057\u307E\u3057\u305F",
    scheduled: "\u4F9D\u5B58\u95A2\u4FC2\u306B\u57FA\u3065\u304D\u518D\u30B9\u30B1\u30B8\u30E5\u30FC\u30EA\u30F3\u30B0\u3057\u307E\u3057\u305F",
    versionSaved: "\u30D0\u30FC\u30B8\u30E7\u30F3\u300C{name}\u300D\u3092\u4FDD\u5B58\u3057\u307E\u3057\u305F",
    versionRestoreUnsupported: "\u3053\u306E\u30D0\u30FC\u30B8\u30E7\u30F3\u306F\u5FA9\u5143\u306B\u5BFE\u5FDC\u3057\u3066\u3044\u307E\u305B\u3093\uFF08\u53E4\u3044\u5F62\u5F0F\u3067\u4FDD\u5B58\u3055\u308C\u3066\u3044\u307E\u3059\uFF09",
    versionRestored: "\u30D0\u30FC\u30B8\u30E7\u30F3\u300C{name}\u300D\u306E\u72B6\u614B\u306B\u623B\u3057\u307E\u3057\u305F",
    exportedJson: "\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u3092JSON\u30D5\u30A1\u30A4\u30EB\u306B\u66F8\u304D\u51FA\u3057\u307E\u3057\u305F",
    exportedSharedHtml: "\u5171\u6709\u7528HTML\u3092\u66F8\u304D\u51FA\u3057\u307E\u3057\u305F\uFF08\u3053\u306E\u30D5\u30A1\u30A4\u30EB\u3092\u958B\u304F\u3068\u66F8\u304D\u51FA\u3057\u6642\u70B9\u306E\u30B9\u30B1\u30B8\u30E5\u30FC\u30EB\u304C\u8868\u793A\u3055\u308C\u307E\u3059\uFF09",
    exportSharedHtmlFailed: "\u5171\u6709\u7528HTML\u306E\u66F8\u304D\u51FA\u3057\u306B\u5931\u6557\u3057\u307E\u3057\u305F",
    mermaidCopied: "Mermaid\u8A18\u6CD5\u306E\u30AC\u30F3\u30C8\u30C1\u30E3\u30FC\u30C8\u3092\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u306B\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F",
    copyFailed: "\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u3078\u306E\u30B3\u30D4\u30FC\u306B\u5931\u6557\u3057\u307E\u3057\u305F",
    pngNeedsGantt: "WBS / \u30AC\u30F3\u30C8\u753B\u9762\u3092\u8868\u793A\u3057\u3066\u304B\u3089\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044",
    pngCopied: "\u30AC\u30F3\u30C8\u30C1\u30E3\u30FC\u30C8\uFF08\u8868\u793A\u7BC4\u56F2\uFF09\u3092PNG\u3068\u3057\u3066\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u306B\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F",
    pngDownloaded: "\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u3078\u306E\u753B\u50CF\u30B3\u30D4\u30FC\u306B\u5BFE\u5FDC\u3057\u3066\u3044\u306A\u3044\u305F\u3081\u3001PNG\u30D5\u30A1\u30A4\u30EB\u3092\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3057\u307E\u3057\u305F",
    pngFailed: "PNG\u306E\u30B3\u30D4\u30FC\u306B\u5931\u6557\u3057\u307E\u3057\u305F: {message}",
    importFailedFormat: "\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557\u3057\u307E\u3057\u305F\uFF08\u30D5\u30A1\u30A4\u30EB\u5F62\u5F0F\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093\uFF09",
    importFailedParse: "\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557\u3057\u307E\u3057\u305F\uFF08JSON\u3092\u89E3\u6790\u3067\u304D\u307E\u305B\u3093\uFF09",
    imported: "JSON\u30D5\u30A1\u30A4\u30EB\u304B\u3089\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u3092\u8AAD\u307F\u8FBC\u307F\u307E\u3057\u305F"
  },
  pngErrors: {
    "gantt-dom-missing": "\u30AC\u30F3\u30C8\u753B\u9762\u306EDOM\u69CB\u9020\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F",
    "svg-image-failed": "\u30AC\u30F3\u30C8\u753B\u9762\u306ESVG\u753B\u50CF\u5316\u306B\u5931\u6557\u3057\u307E\u3057\u305F",
    "png-encode-failed": "PNG\u306E\u751F\u6210\u306B\u5931\u6557\u3057\u307E\u3057\u305F"
  },
  confirm: {
    defaultLabel: "\u5B9F\u884C\u3059\u308B",
    restoreVersion: "\u73FE\u5728\u306E\u5185\u5BB9\u3092\u7834\u68C4\u3057\u3001\u30D0\u30FC\u30B8\u30E7\u30F3\u300C{name}\u300D\uFF08{createdAt}\uFF09\u306E\u72B6\u614B\u306B\u623B\u3057\u307E\u3059\u3002\u3088\u308D\u3057\u3044\u3067\u3059\u304B\uFF1F",
    restoreLabel: "\u5143\u306B\u623B\u3059",
    import: "\u73FE\u5728\u306E\u30BF\u30B9\u30AF\u30FB\u62C5\u5F53\u8005\u3092\u3001\u8AAD\u307F\u8FBC\u3093\u3060\u5185\u5BB9\u3067\u7F6E\u304D\u63DB\u3048\u307E\u3059\u3002\u3088\u308D\u3057\u3044\u3067\u3059\u304B\uFF1F",
    importLabel: "\u8AAD\u307F\u8FBC\u3080"
  },
  mermaid: {
    title: "\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u30B9\u30B1\u30B8\u30E5\u30FC\u30EB",
    untitled: "\uFF08\u7121\u984C\uFF09"
  },
  sprintConflicts: {
    title: "\u30B9\u30D7\u30EA\u30F3\u30C8\u3068\u306E\u77DB\u76FE\uFF08{count}\u4EF6\uFF09",
    description: "\u4F9D\u5B58\u95A2\u4FC2\u3084\u56FA\u5B9A\u30DE\u30A4\u30EB\u30B9\u30C8\u30FC\u30F3\u306E\u65E5\u7A0B\u304C\u512A\u5148\u3055\u308C\u308B\u305F\u3081\u3001\u5272\u308A\u5F53\u3066\u3089\u308C\u305F\u30B9\u30D7\u30EA\u30F3\u30C8\u306E\u671F\u9593\u5185\u306B\u53CE\u307E\u3089\u306A\u304B\u3063\u305F\u30BF\u30B9\u30AF\u3067\u3059\u3002",
    sprintNames: "\uFF08{names}\uFF09",
    reason: {
      startBeforeSprint: "\u958B\u59CB\u65E5\uFF08{start, date, ymd}\uFF09\u304C\u30B9\u30D7\u30EA\u30F3\u30C8\u958B\u59CB\u65E5\uFF08{sprintStart, date, ymd}\uFF09\u3088\u308A\u524D\u306B\u306A\u3063\u3066\u3044\u307E\u3059",
      finishAfterSprint: "\u7D42\u4E86\u65E5\uFF08{finish, date, ymd}\uFF09\u304C\u30B9\u30D7\u30EA\u30F3\u30C8\u7D42\u4E86\u65E5\uFF08{sprintEnd, date, ymd}\uFF09\u3092\u8D85\u3048\u3066\u3044\u307E\u3059",
      governed: "\u56FA\u5B9A\u30DE\u30A4\u30EB\u30B9\u30C8\u30FC\u30F3\u306E\u671F\u65E5\u304C\u512A\u5148\u3055\u308C\u3066\u3044\u308B\u305F\u3081\u3001\u30B9\u30D7\u30EA\u30F3\u30C8\u671F\u9593\u5185\u306B\u53CE\u307E\u308A\u307E\u305B\u3093"
    }
  },
  dependencyIssues: {
    label: {
      "dependency-cycle": "\u5FAA\u74B0\u53C2\u7167",
      "self-dependency": "\u5FAA\u74B0\u53C2\u7167\uFF08\u81EA\u5DF1\u4F9D\u5B58\uFF09",
      "predecessor-missing": "\u5B58\u5728\u3057\u306A\u3044\u5148\u884C\u30BF\u30B9\u30AF",
      "dependency-violation": "\u958B\u59CB\u65E5\u3068\u306E\u77DB\u76FE",
      "fixed-milestone-overrun": "\u56FA\u5B9A\u671F\u65E5\u306E\u8D85\u904E"
    },
    dialogTitle: "\u4F9D\u5B58\u95A2\u4FC2\u306E\u77DB\u76FE\uFF08{count}\u4EF6\uFF09",
    dialogDescription: "\u65E5\u7A0B\u306F\u81EA\u52D5\u3067\u306F\u4FEE\u6B63\u3055\u308C\u307E\u305B\u3093\u3002\u958B\u59CB\u65E5\u3068\u306E\u77DB\u76FE\u306F\u300C\u81EA\u52D5\u30B9\u30B1\u30B8\u30E5\u30FC\u30EA\u30F3\u30B0\u5B9F\u884C\u300D\u3067\u89E3\u6D88\u3067\u304D\u307E\u3059\u3002\u5FAA\u74B0\u53C2\u7167\u30FB\u5B58\u5728\u3057\u306A\u3044\u5148\u884C\u30BF\u30B9\u30AF\u306F\u3001\u5148\u884C\u30BF\u30B9\u30AF\u6B04\u3092\u4FEE\u6B63\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u9805\u76EE\u3092\u30AF\u30EA\u30C3\u30AF\u3059\u308B\u3068\u8A72\u5F53\u30BF\u30B9\u30AF\u3092\u8868\u793A\u3057\u307E\u3059\u3002",
    cycleTargets: "{count}\u4EF6\u306E\u30BF\u30B9\u30AF\u30FB\u30B0\u30EB\u30FC\u30D7",
    rowIconLabel: "\u4F9D\u5B58\u95A2\u4FC2\u306E\u77DB\u76FE\uFF08{count}\u4EF6\uFF09",
    hiddenInGroup: "\u914D\u4E0B\u306E\u30BF\u30B9\u30AF\u306B\u4F9D\u5B58\u95A2\u4FC2\u306E\u77DB\u76FE\u304C{count}\u4EF6\u3042\u308A\u307E\u3059\uFF08\u30B0\u30EB\u30FC\u30D7\u3092\u5C55\u958B\u3059\u308B\u3068\u78BA\u8A8D\u3067\u304D\u307E\u3059\uFF09",
    quoted: "\u300C{name}\u300D",
    arrow: "\u2192",
    cycleMemberNote: "\u300C{child}\u300D\u306F\u30B0\u30EB\u30FC\u30D7\u300C{parent}\u300D\u306E\u914D\u4E0B",
    message: {
      cycle: "\u5FAA\u74B0\u53C2\u7167: {route}",
      cycleWithNotes: "\u5FAA\u74B0\u53C2\u7167: {route}\uFF08{notes}\uFF09",
      self: "\u81EA\u5206\u81EA\u8EAB\u3092\u5148\u884C\u30BF\u30B9\u30AF\u306B\u3057\u3066\u3044\u307E\u3059\uFF08\u3053\u306E\u4F9D\u5B58\u95A2\u4FC2\u306F\u8A08\u7B97\u306B\u4F7F\u308F\u308C\u3066\u3044\u307E\u305B\u3093\uFF09",
      missing: "\u5148\u884C\u30BF\u30B9\u30AF\u300C{predecessorId}\u300D\u304C\u5B58\u5728\u3057\u307E\u305B\u3093\uFF08\u524A\u9664\u6E08\u307F\u306E\u30BF\u30B9\u30AF\u3092\u53C2\u7167\u3057\u3066\u3044\u308B\u305F\u3081\u3001\u3053\u306E\u4F9D\u5B58\u95A2\u4FC2\u306F\u8A08\u7B97\u306B\u4F7F\u308F\u308C\u3066\u3044\u307E\u305B\u3093\uFF09",
      violationStart: "\u5148\u884C\u300C{predName}\u300D\uFF08{label}\uFF09\u306E\u6761\u4EF6\u3067\u306F {required, date, ymd} \u4EE5\u964D\u306B\u958B\u59CB\u3059\u308B\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059\u304C\u3001{actual, date, ymd} \u306B\u958B\u59CB\u3057\u3066\u3044\u307E\u3059",
      violationFinish: "\u5148\u884C\u300C{predName}\u300D\uFF08{label}\uFF09\u306E\u6761\u4EF6\u3067\u306F {required, date, ymd} \u4EE5\u964D\u306B\u7D42\u4E86\u3059\u308B\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059\u304C\u3001{actual, date, ymd} \u306B\u7D42\u4E86\u3057\u3066\u3044\u307E\u3059",
      overrunEarliest: "\u5148\u884C\u300C{predName}\u300D\u304B\u3089\u6C42\u3081\u305F\u6700\u65E9\u65E5\uFF08{earliest, date, ymd}\uFF09\u304C\u56FA\u5B9A\u671F\u65E5\uFF08{fixedDate, date, ymd}\uFF09\u3092\u8D85\u904E\u3057\u3066\u3044\u307E\u3059",
      overrunDisplay: "\u8868\u793A\u4E2D\u306E\u65E5\u7A0B\uFF08{actual, date, ymd}\uFF09\u304C\u56FA\u5B9A\u671F\u65E5\uFF08{fixedDate, date, ymd}\uFF09\u3092\u8D85\u904E\u3057\u3066\u3044\u307E\u3059"
    },
    tooltipLine: "{label}: {message}"
  },
  levelWarnings: {
    limit: {
      daily: "\u65E5\u6B21{value}\u4EBA\u65E5",
      weekly: "\u9031\u6B21{value}\u4EBA\u65E5",
      monthly: "\u6708\u6B21{value}\u4EBA\u65E5"
    },
    limitSeparator: "\u30FB",
    capacityExceeded: "\u300C{taskName}\u300D\uFF08\u62C5\u5F53\u8005: {resourceName}\u3001\u5DE5\u6570: {duration}\u4EBA\u65E5\uFF09\u306F\u3001{limits}\u306E\u7A3C\u50CD\u4E0A\u9650\u5185\u3067\u5272\u308A\u5F53\u3066\u304D\u308C\u307E\u305B\u3093\u3067\u3057\u305F\uFF08\u63A2\u7D22\u4E0A\u9650: {searchWorkdays, number}\u7A3C\u50CD\u65E5\uFF09\u3002\u958B\u59CB\u65E5\u3092{start, date, ymd}\u3068\u3057\u3001\u9023\u7D9A\u3059\u308B\u7A3C\u50CD\u65E5\u306B\u914D\u7F6E\u3057\u3066\u3044\u307E\u3059\u304C\u3001\u7A3C\u50CD\u4E0A\u9650\u3092\u8D85\u904E\u3057\u3066\u3044\u307E\u3059\u3002\u5DE5\u6570\u307E\u305F\u306F\u7A3C\u50CD\u4E0A\u9650\u306E\u898B\u76F4\u3057\u304C\u5FC5\u8981\u3067\u3059\u3002"
  },
  taskDetail: {
    groupBadge: "\uFF08\u30B0\u30EB\u30FC\u30D7\uFF09",
    name: "\u30BF\u30B9\u30AF\u540D",
    kind: "\u7A2E\u5225",
    kindMilestone: "\u30DE\u30A4\u30EB\u30B9\u30C8\u30FC\u30F3\uFF08\u30AF\u30EA\u30C3\u30AF\u3067\u30BF\u30B9\u30AF\u306B\u5909\u66F4\uFF09",
    kindTask: "\u30BF\u30B9\u30AF\uFF08\u30AF\u30EA\u30C3\u30AF\u3067\u30DE\u30A4\u30EB\u30B9\u30C8\u30FC\u30F3\u306B\u5909\u66F4\uFF09",
    dueDate: "\u671F\u65E5",
    mode: "\u30E2\u30FC\u30C9",
    modeFlexible: "\u67D4\u8EDF\uFF08\u9806\u7B97\uFF09",
    modeFixed: "\u56FA\u5B9A\uFF08\u671F\u65E5\u304B\u3089\u9006\u7B97\uFF09",
    startDate: "\u958B\u59CB\u65E5",
    duration: "\u5DE5\u6570\uFF08\u4EBA\u65E5\uFF09",
    assignee: "\u62C5\u5F53\u8005",
    unassigned: "\u672A\u5272\u5F53",
    sprints: "\u30B9\u30D7\u30EA\u30F3\u30C8\uFF08\u8907\u6570\u9078\u629E\u53EF\uFF09",
    noSprints: "\u30B9\u30D7\u30EA\u30F3\u30C8\u304C\u767B\u9332\u3055\u308C\u3066\u3044\u307E\u305B\u3093",
    sprintRange: "\uFF08{start}\u301C{end}\uFF09",
    progress: "\u9032\u6357\u7387",
    progressSummaryNote: "\u3000\u203B\u914D\u4E0B\u30BF\u30B9\u30AF\u306E\u5E73\u5747\u3092\u81EA\u52D5\u8868\u793A\uFF08\u7DE8\u96C6\u4E0D\u53EF\uFF09",
    completed: "\u5B8C\u4E86\u6E08\u307F",
    predecessors: "\u5148\u884C\u30BF\u30B9\u30AF\uFF08WBS\u756A\u53F7[\u578B][\xB1\u9045\u5EF6] \u4F8B: 1.2FS+1\uFF09",
    predecessorsSummaryNote: "\u3000\u203B\u914D\u4E0B\u306E\u5168\u30BF\u30B9\u30AF\u306B\u9069\u7528\u3055\u308C\u307E\u3059",
    successors: "\u5F8C\u7D9A\u30BF\u30B9\u30AF",
    schedStart: "\u958B\u59CB",
    schedFinish: "\u7D42\u4E86",
    float: "\u30D5\u30ED\u30FC\u30C8",
    floatDays: "{days} \u65E5",
    floatDaysCritical: "{days} \u65E5\uFF08\u30AF\u30EA\u30C6\u30A3\u30AB\u30EB\uFF09",
    governed: "\u9006\u7B97\u5BFE\u8C61",
    governedDescription: "\u56FA\u5B9A\u30DE\u30A4\u30EB\u30B9\u30C8\u30FC\u30F3\u306E\u671F\u65E5\u304B\u3089\u9006\u7B97\u3055\u308C\u3066\u3044\u307E\u3059",
    notes: "\u30E1\u30E2",
    notesPlaceholder: "\u3053\u306E\u30BF\u30B9\u30AF\u306B\u95A2\u3059\u308B\u30E1\u30E2\u3092\u5165\u529B"
  },
  wbs: {
    depsPlaceholder: "\u4F8B: 1.2FS+1",
    colResizeTitle: "\u30C9\u30E9\u30C3\u30B0\u3067\u5217\u5E45\u3092\u5909\u66F4\uFF08\u30C0\u30D6\u30EB\u30AF\u30EA\u30C3\u30AF\u3067\u65E2\u5B9A\u5E45\u306B\u623B\u3059\uFF09",
    sprintSelectTitle: "\u7D10\u4ED8\u3051\u308B\u30B9\u30D7\u30EA\u30F3\u30C8",
    noSprints: "\u30B9\u30D7\u30EA\u30F3\u30C8\u304C\u3042\u308A\u307E\u305B\u3093",
    milestoneMode: {
      fixed: "\u56FA\u5B9A",
      flexible: "\u67D4\u8EDF"
    },
    newTaskName: "\u65B0\u898F\u30BF\u30B9\u30AF",
    newMilestoneName: "\u65B0\u898F\u30DE\u30A4\u30EB\u30B9\u30C8\u30FC\u30F3",
    newTaskPlaceholder: "\u65B0\u3057\u3044\u30BF\u30B9\u30AF\u3092\u8FFD\u52A0\u3057\u3066 Enter",
    confirmDelete: "\u300C{name}\u300D\u3092\u524A\u9664\u3057\u307E\u3059\u3002\u5B50\u30BF\u30B9\u30AF\u304C\u3042\u308B\u5834\u5408\u306F\u307E\u3068\u3081\u3066\u524A\u9664\u3055\u308C\u307E\u3059\u3002\u3088\u308D\u3057\u3044\u3067\u3059\u304B\uFF1F",
    paneResizeTitle: "\u30C9\u30E9\u30C3\u30B0\u3067\u30DA\u30A4\u30F3\u5E45\u3092\u8ABF\u6574\uFF08\u30C0\u30D6\u30EB\u30AF\u30EA\u30C3\u30AF\u3067\u81EA\u52D5\u5E45\u306B\u623B\u3059\uFF09",
    toast: {
      rowCopied: "\u884C\u3092\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u306B\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F",
      cellCopied: "\u30BB\u30EB\u3092\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u306B\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F",
      nothingToPaste: "\u8CBC\u308A\u4ED8\u3051\u3067\u304D\u308B\u5024\u304C\u3042\u308A\u307E\u305B\u3093",
      pastedPartially: "\u4E92\u63DB\u6027\u306E\u306A\u3044\u30BB\u30EB\u3092\u9664\u3044\u3066\u8CBC\u308A\u4ED8\u3051\u307E\u3057\u305F",
      rowPasted: "\u884C\u3092\u8CBC\u308A\u4ED8\u3051\u307E\u3057\u305F",
      cellPasted: "\u30BB\u30EB\u3092\u8CBC\u308A\u4ED8\u3051\u307E\u3057\u305F"
    },
    toolbar: {
      task: "\u30BF\u30B9\u30AF",
      milestone: "\u30DE\u30A4\u30EB\u30B9\u30C8\u30FC\u30F3",
      indent: "\u30A4\u30F3\u30C7\u30F3\u30C8",
      outdent: "\u30A2\u30A6\u30C8\u30C7\u30F3\u30C8",
      details: "\u8A73\u7D30",
      copy: "\u30B3\u30D4\u30FC",
      paste: "\u8CBC\u308A\u4ED8\u3051",
      undo: "\u5143\u306B\u623B\u3059",
      redo: "\u3084\u308A\u76F4\u3059",
      saveVersion: "\u30D0\u30FC\u30B8\u30E7\u30F3\u3092\u4FDD\u5B58"
    },
    compare: {
      title: "\u6307\u5B9A\u3057\u305F\u30D0\u30FC\u30B8\u30E7\u30F3\u3092WBS\u756A\u53F7\u3067\u7A81\u304D\u5408\u308F\u305B\u3001\u5404\u30BF\u30B9\u30AF\u306E\u4E0B\u306B\u57FA\u6E96\u30D0\u30FC\u30B8\u30E7\u30F3\u306E\u884C\u3092\u91CD\u306D\u3066\u8868\u793A\u3057\u307E\u3059",
      none: "\u6BD4\u8F03\u3057\u306A\u3044",
      unsupported: "\u975E\u5BFE\u5FDC",
      unsupportedTitle: "\u3053\u306E\u30D0\u30FC\u30B8\u30E7\u30F3\u306FWBS\u756A\u53F7\u3092\u4FDD\u5B58\u3057\u3066\u3044\u306A\u3044\u305F\u3081\u6BD4\u8F03\u3067\u304D\u307E\u305B\u3093\uFF08\u518D\u4FDD\u5B58\u3059\u308B\u3068\u6BD4\u8F03\u3067\u304D\u308B\u3088\u3046\u306B\u306A\u308A\u307E\u3059\uFF09",
      newTask: "\u65B0\u898F",
      newTaskTitle: "\u57FA\u6E96\u30D0\u30FC\u30B8\u30E7\u30F3\u306B\u306F\u5B58\u5728\u3057\u306A\u3044\u30BF\u30B9\u30AF\u3067\u3059",
      baselineTitle: "\u57FA\u6E96: {name}",
      notInBaseline: "\uFF08\u57FA\u6E96\u306B\u306A\u3057\uFF09",
      later: "\u73FE\u5728\u306F\u57FA\u6E96\u3088\u308A{days}\u65E5\u9045\u3044",
      earlier: "\u73FE\u5728\u306F\u57FA\u6E96\u3088\u308A{days}\u65E5\u65E9\u3044",
      same: "\u57FA\u6E96\u3068\u540C\u3058\u7D42\u4E86\u65E5"
    },
    columns: {
      wbsTitle: "WBS\u756A\u53F7\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u884C\u3092\u9078\u3073\u3001\u30B3\u30D4\u30FC\uFF0F\u8CBC\u308A\u4ED8\u3051\u3067\u304D\u307E\u3059",
      name: "\u30BF\u30B9\u30AF\u540D",
      start: "\u958B\u59CB\u65E5",
      duration: "\u5DE5\u6570",
      durationTitle: "\u5DE5\u6570\uFF08\u4EBA\u65E5\uFF09\u3002\u5C0F\u6570\u53EF\uFF08\u4F8B: 0.5, 2.5\uFF09",
      finish: "\u7D42\u4E86\u65E5",
      assignee: "\u62C5\u5F53",
      assigneeTitle: "\u901A\u5E38\u30BF\u30B9\u30AF\u306F\u62C5\u5F53\u8005\u3001\u30DE\u30A4\u30EB\u30B9\u30C8\u30FC\u30F3\u306F\u56FA\u5B9A/\u67D4\u8EDF\u3092\u9078\u629E",
      sprint: "\u30B9\u30D7\u30EA\u30F3\u30C8",
      sprintTitle: "\u7D10\u4ED8\u3051\u308B\u30B9\u30D7\u30EA\u30F3\u30C8\uFF08\u30B0\u30EB\u30FC\u30D7\u306B\u306F\u8A2D\u5B9A\u3067\u304D\u307E\u305B\u3093\uFF09",
      progress: "\u9032\u6357",
      progressTitle: "\u9032\u6357\u7387\uFF08%\uFF09\u3002\u30B0\u30EB\u30FC\u30D7\u306F\u305D\u306E\u914D\u4E0B\u30BF\u30B9\u30AF\u306E\u9032\u6357\u7387\u306E\u5E73\u5747\u3092\u81EA\u52D5\u8868\u793A\u3057\u307E\u3059",
      deps: "\u5148\u884C",
      depsTitle: "WBS\u756A\u53F7\u3067\u6307\u5B9A\u3057\u307E\u3059\uFF08\u4F8B: 1.2FS+1\uFF09\u3002\u30B0\u30EB\u30FC\u30D7\u306E\u884C\u306B\u8A2D\u5B9A\u3059\u308B\u3068\u914D\u4E0B\u306E\u5168\u30BF\u30B9\u30AF\u306B\u9069\u7528\u3055\u308C\u307E\u3059"
    },
    row: {
      dragTitle: "\u30C9\u30E9\u30C3\u30B0\u3067\u4E26\u3079\u66FF\u3048",
      selectTitle: "\u884C\u3092\u9078\u629E\uFF08\u30B3\u30D4\u30FC\uFF0F\u8CBC\u308A\u4ED8\u3051\u5BFE\u8C61\uFF09",
      toTask: "\u30AF\u30EA\u30C3\u30AF\u3067\u30BF\u30B9\u30AF\u306B\u5909\u66F4",
      toMilestone: "\u30AF\u30EA\u30C3\u30AF\u3067\u30DE\u30A4\u30EB\u30B9\u30C8\u30FC\u30F3\u306B\u5909\u66F4",
      openDetails: "\u8A73\u7D30\u3092\u958B\u304F",
      durationTitle: "\u4EBA\u65E5\uFF08\u5C0F\u6570\u53EF\uFF09",
      milestoneModeTitle: "\u56FA\u5B9A\uFF1A\u671F\u65E5\u304B\u3089\u9006\u7B97\u3057\u3066\u30B9\u30B1\u30B8\u30E5\u30FC\u30EB / \u67D4\u8EDF\uFF1A\u4F9D\u5B58\u95A2\u4FC2\u304B\u3089\u9806\u7B97",
      doneCheckTitle: "\u5B8C\u4E86\u30C1\u30A7\u30C3\u30AF\uFF08\u672A\u30C1\u30A7\u30C3\u30AF\uFF1A0% / \u30C1\u30A7\u30C3\u30AF\u6E08\u307F\uFF1A100%\uFF09",
      progressTitle: "\u9032\u6357\u7387\uFF08%\uFF09"
    }
  },
  gantt: {
    toolbar: {
      inazuma: "\u7A32\u59BB\u7DDA",
      baseDate: "\u9032\u6357\u57FA\u6E96\u65E5\uFF08\u7A32\u59BB\u7DDA\u30FB\u4ECA\u65E5\u306E\u7E26\u7DDA\u306E\u57FA\u6E96\uFF09",
      resetBaseDateTitle: "\u672C\u65E5\u306B\u623B\u3059",
      today: "\u4ECA\u65E5",
      criticalPath: "\u30AF\u30EA\u30C6\u30A3\u30AB\u30EB\u30D1\u30B9",
      zoomOut: "\u30BA\u30FC\u30E0\u30A2\u30A6\u30C8\uFF08\u65E5\u2192\u9031\u2192\u6708\u3078\u7E2E\u7D04\uFF09",
      zoomIn: "\u30BA\u30FC\u30E0\u30A4\u30F3"
    },
    sprintBandLabel: "{name}\u30FB{theme}",
    fixedMilestoneSuffix: " (\u56FA\u5B9A {date})",
    idle: {
      weekly: "\u9031\u6B21\u4E0A\u9650\uFF08{value}\u4EBA\u65E5/\u9031\uFF09\u306B\u5230\u9054",
      monthly: "\u6708\u6B21\u4E0A\u9650\uFF08{value}\u4EBA\u65E5/\u6708\uFF09\u306B\u5230\u9054",
      taskName: "\u300C{name}\u300D",
      nameSeparator: "",
      namesAndMore: "{names}\u307B\u304B{count}\u4EF6",
      daily: "\u4ED6\u30BF\u30B9\u30AF{names}\u306B\u5272\u5F53\u6E08\u307F\uFF08\u65E5\u6B21{value}\u4EBA\u65E5\uFF09"
    },
    tooltip: {
      period: "{start} \u301C {finish}",
      range: "{start}\u301C{end}",
      fixedMilestone: "\u56FA\u5B9A\u30DE\u30A4\u30EB\u30B9\u30C8\u30FC\u30F3\uFF08\u671F\u65E5 {date}\uFF09",
      flexibleMilestone: "\u67D4\u8EDF\u30DE\u30A4\u30EB\u30B9\u30C8\u30FC\u30F3",
      assignee: "\u62C5\u5F53: {name}",
      effortProgress: "\u5DE5\u6570 {duration}\u4EBA\u65E5 \u30FB \u9032\u6357 {progress}%",
      includesNonWorkdays: "\u3053\u306E\u671F\u9593\u306B\u975E\u7A3C\u50CD\u65E5\u3092\u542B\u307F\u307E\u3059",
      sprints: "\u30B9\u30D7\u30EA\u30F3\u30C8: {names}",
      sprintSeparator: "\u30FB",
      float: "\u4F59\u88D5 {days}\u65E5",
      floatCritical: "\u4F59\u88D5 {days}\u65E5\uFF08\u30AF\u30EA\u30C6\u30A3\u30AB\u30EB\uFF09",
      idleDays: "\u7A3C\u50CD\u4E0A\u9650\u306B\u3088\u308A\u5272\u5F53\u306E\u306A\u3044\u7A3C\u50CD\u65E5: {idle}\u65E5\uFF08\u5272\u5F53 {allocated}\u65E5\uFF09",
      moreSegments: "\u307B\u304B{count}\u533A\u9593",
      partialDay: "{date}\uFF08{load}\u4EBA\u65E5\uFF09",
      partial: "\u4E00\u90E8\u306E\u307F\u5272\u5F53: {days}",
      partialMore: "\u4E00\u90E8\u306E\u307F\u5272\u5F53: {days} \u307B\u304B{count}\u65E5",
      overCapacity: "\u7A3C\u50CD\u4E0A\u9650\u5185\u306B\u5272\u308A\u5F53\u3066\u304D\u308C\u305A\u3001\u4E0A\u9650\u3092\u8D85\u904E\u3057\u3066\u3044\u307E\u3059",
      ariaSeparator: "\u3002"
    }
  },
  calendar: {
    weekdaySuffix: "\uFF08{weekday}\uFF09",
    exceptions: {
      title: "\u975E\u7A3C\u50CD\u65E5\u30AB\u30EC\u30F3\u30C0\u30FC",
      add: "\u4F8B\u5916\u65E5\u3092\u8FFD\u52A0",
      thisRow: "\u3053\u306E\u884C",
      confirmDeleteHoliday: "{date} \u306E\u4F11\u65E5\u6307\u5B9A\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F",
      confirmDeleteWorkday: "{date} \u306E\u7A3C\u50CD\u65E5\u6307\u5B9A\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F",
      columns: {
        date: "\u65E5\u4ED8",
        type: "\u7A2E\u5225",
        name: "\u540D\u79F0"
      },
      empty: "\u4F8B\u5916\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093\uFF08\u571F\u65E5\uFF0B\u65E5\u672C\u306E\u795D\u65E5\u3067\u8A08\u7B97\u3057\u307E\u3059\uFF09",
      invalidType: "\uFF08\u4E0D\u6B63\u306A\u7A2E\u5225\uFF09",
      type: {
        holiday: "\u4F11\u65E5",
        workday: "\u7A3C\u50CD\u65E5"
      },
      placeholder: {
        holiday: "\u4F8B: \u5275\u7ACB\u8A18\u5FF5\u65E5",
        workday: "\u4F8B: \u4F11\u65E5\u51FA\u52E4"
      },
      hint: {
        noDate: "\u65E5\u4ED8\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044",
        invalidType: "\u7A2E\u5225\u304C\u4E0D\u6B63\u3067\u3059\uFF08\u3053\u306E\u884C\u306F\u30B9\u30B1\u30B8\u30E5\u30FC\u30EB\u306B\u53CD\u6620\u3055\u308C\u307E\u305B\u3093\u3002\u7A2E\u5225\u3092\u9078\u3073\u76F4\u3057\u3066\u304F\u3060\u3055\u3044\uFF09",
        duplicate: "\u540C\u3058\u65E5\u4ED8\u306E\u884C\u304C\u8907\u6570\u3042\u308A\u307E\u3059\uFF08\u7A3C\u50CD\u65E5\u304C\u512A\u5148\u3055\u308C\u307E\u3059\uFF09",
        alreadyWeekend: "\u3053\u306E\u65E5\u306F\u5143\u3005\u571F\u65E5\u3067\u3059\uFF08\u6307\u5B9A\u306F\u4E0D\u8981\uFF09",
        alreadyHoliday: "\u3053\u306E\u65E5\u306F\u5143\u3005\u795D\u65E5\u3067\u3059\uFF08\u6307\u5B9A\u306F\u4E0D\u8981\uFF09",
        alreadyWorkday: "\u3053\u306E\u65E5\u306F\u5143\u3005\u7A3C\u50CD\u65E5\u3067\u3059\uFF08\u6307\u5B9A\u306F\u4E0D\u8981\uFF09"
      },
      note: "\u512A\u5148\u9806\u4F4D: \u7A3C\u50CD\u65E5 \uFF1E \u4F11\u65E5 \uFF1E \u65E5\u672C\u306E\u795D\u65E5 \uFF1E \u571F\u65E5\u3002 \u300C\u7A3C\u50CD\u65E5\u300D\u306F\u571F\u65E5\u30FB\u795D\u65E5\u3067\u3082\u305D\u306E\u65E5\u3092\u7A3C\u50CD\u65E5\u3068\u3057\u3066\u6271\u3044\u3001\u300C\u4F11\u65E5\u300D\u306F\u5E73\u65E5\u3092\u975E\u7A3C\u50CD\u65E5\u306B\u3057\u307E\u3059\u3002\u3053\u3053\u3067\u306E\u5909\u66F4\u306FCPM\u30FB\u30EA\u30BD\u30FC\u30B9\u5E73\u6E96\u5316\u30FB\u5B8C\u4E86\u4E88\u5B9A\u65E5\u306B\u53CD\u6620\u3055\u308C\u307E\u3059\u3002",
      recent: "\u76F4\u8FD1\u306E\u4F8B\u5916: {items}",
      recentHoliday: "(\u4F11)",
      recentWorkday: "(\u7A3C\u50CD)"
    },
    upcoming: {
      title: "\u4ECA\u5F8C\u306E\u795D\u65E5\uFF08\u81EA\u52D5\u8A08\u7B97\u30FB\u7DE8\u96C6\u4E0D\u53EF\uFF09",
      empty: "\u76F4\u8FD1\u306B\u81EA\u52D5\u8A08\u7B97\u306E\u795D\u65E5\u306F\u3042\u308A\u307E\u305B\u3093\u3002",
      note: "\u65E5\u672C\u306E\u795D\u65E5\uFF08\u632F\u66FF\u4F11\u65E5\u30FB\u56FD\u6C11\u306E\u4F11\u65E5\u3092\u542B\u3080\uFF09\u306F\u81EA\u52D5\u3067\u975E\u7A3C\u50CD\u65E5\u3068\u3057\u3066\u6271\u308F\u308C\u307E\u3059\u3002 \u3053\u3053\u306B\u7121\u3044\u4F11\u65E5\uFF08\u4F1A\u793E\u72EC\u81EA\u306E\u4F11\u65E5\u306A\u3069\uFF09\u3084\u3001\u571F\u65E5\u30FB\u795D\u65E5\u306B\u7A3C\u50CD\u3059\u308B\u65E5\u3060\u3051\u3092\u4E0A\u306E\u8868\u3067\u8FFD\u52A0\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
    }
  },
  sprints: {
    title: "\u30B9\u30D7\u30EA\u30F3\u30C8\u4E00\u89A7",
    add: "\u30B9\u30D7\u30EA\u30F3\u30C8\u3092\u8FFD\u52A0",
    confirmDelete: "\u3053\u306E\u30B9\u30D7\u30EA\u30F3\u30C8\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F\uFF08\u7D10\u4ED8\u3044\u3066\u3044\u305F\u30BF\u30B9\u30AF\u306F\u672A\u5272\u5F53\u306B\u306A\u308A\u307E\u3059\uFF09",
    overlapWarning: "\u671F\u9593\u304C\u91CD\u306A\u3063\u3066\u3044\u308B\u30B9\u30D7\u30EA\u30F3\u30C8\u304C\u3042\u308A\u307E\u3059\u3002\u4FDD\u5B58\u306F\u3067\u304D\u307E\u3059\u304C\u3001\u5185\u5BB9\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
    columns: {
      name: "\u540D\u79F0",
      theme: "\u30C6\u30FC\u30DE",
      start: "\u958B\u59CB\u65E5",
      end: "\u7D42\u4E86\u65E5",
      taskCount: "\u30BF\u30B9\u30AF\u6570"
    },
    empty: "\u30B9\u30D7\u30EA\u30F3\u30C8\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093",
    themePlaceholder: "\u3053\u306E\u30B9\u30D7\u30EA\u30F3\u30C8\u306E\u30C6\u30FC\u30DE\uFF08\u4EFB\u610F\uFF09",
    invalidRange: "\u7D42\u4E86\u65E5\u304C\u958B\u59CB\u65E5\u3088\u308A\u524D\u306B\u306A\u3063\u3066\u3044\u307E\u3059",
    overlapping: "\u4ED6\u306E\u30B9\u30D7\u30EA\u30F3\u30C8\u3068\u671F\u9593\u304C\u91CD\u306A\u3063\u3066\u3044\u307E\u3059",
    taskCount: "{count}\u4EF6",
    note: "\u958B\u59CB\u65E5\u30FB\u7D42\u4E86\u65E5\u306F\u81EA\u7531\u306B\u5165\u529B\u3067\u304D\u307E\u3059\uFF08\u76EE\u5B89\u306F1\u9031\u9593\uFF09\u3002\u30B0\u30EB\u30FC\u30D7\uFF08\u30B5\u30DE\u30EA\u30FC\u30BF\u30B9\u30AF\uFF09\u306B\u306F\u30B9\u30D7\u30EA\u30F3\u30C8\u3092\u8A2D\u5B9A\u3067\u304D\u307E\u305B\u3093\u3002",
    timeline: "\u30B9\u30D7\u30EA\u30F3\u30C8 \u30BF\u30A4\u30E0\u30E9\u30A4\u30F3"
  },
  resources: {
    newName: "\u65B0\u898F\u62C5\u5F53\u8005",
    confirmDelete: "\u3053\u306E\u62C5\u5F53\u8005\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F\uFF08\u30BF\u30B9\u30AF\u306E\u62C5\u5F53\u306F\u672A\u5272\u5F53\u306B\u306A\u308A\u307E\u3059\uFF09",
    title: "\u62C5\u5F53\u8005\u3068\u7A3C\u50CD\u4E0A\u9650",
    add: "\u62C5\u5F53\u8005\u3092\u8FFD\u52A0",
    columns: {
      name: "\u540D\u524D",
      capacityTitle: "0 \u306F\u4E0A\u9650\u306A\u3057\uFF081\u65E51\u4EBA\u65E5\u306E\u4E0A\u9650\u306E\u307F\u9069\u7528\uFF09",
      weekly: "\u9031\u6B21\u4E0A\u9650\uFF08\u65E5/\u9031\u30010=\u4E0A\u9650\u306A\u3057\uFF09",
      monthly: "\u6708\u6B21\u4E0A\u9650\uFF08\u65E5/\u6708\u30010=\u4E0A\u9650\u306A\u3057\uFF09"
    },
    weeklyLoad: "\u9031\u6B21\u306E\u7A3C\u50CD\u8CA0\u8377",
    selectAssignee: "\u62C5\u5F53\u8005",
    chart: {
      value: "{value} \u4EBA\u65E5",
      series: "\u5272\u5F53\u5DE5\u6570",
      week: "\u9031: {week}",
      limit: "\u4E0A\u9650"
    },
    note: "\u8D64\u3044\u7834\u7DDA\u306F\u9031\u6B21\u7A3C\u50CD\u4E0A\u9650\uFF080\u306F\u4E0A\u9650\u306A\u3057\uFF09\u3002\u30AC\u30F3\u30C8\u306E\u65E5\u7A0B\u3068\u540C\u3058\u65E5\u5225\u5272\u5F53\u3092\u96C6\u8A08\u3057\u3066\u3044\u307E\u3059\u3002\u30EA\u30BD\u30FC\u30B9\u5E73\u6E96\u5316\u3092ON\u306B\u3059\u308B\u3068\u3001\u4E0A\u9650\u306B\u53CE\u307E\u308B\u3088\u3046\u5DE5\u6570\u3092\u65E9\u3044\u65E5\u304B\u3089\u5272\u308A\u5F53\u3066\u3001\u4E0A\u9650\u306B\u9054\u3057\u305F\u65E5\u3092\u631F\u3093\u3067\u30BF\u30B9\u30AF\u306E\u671F\u9593\u3092\u5EF6\u9577\u3057\u307E\u3059\u3002"
  },
  versions: {
    defaultName: "\u30D0\u30FC\u30B8\u30E7\u30F3 {n}",
    namePlaceholder: "\u30D0\u30FC\u30B8\u30E7\u30F3\u540D\uFF08\u4F8B: \u521D\u671F\u8A08\u753B\uFF09",
    nameLabel: "\u30D0\u30FC\u30B8\u30E7\u30F3\u540D",
    save: "\u73FE\u5728\u306E\u30B9\u30B1\u30B8\u30E5\u30FC\u30EB\u3092\u4FDD\u5B58",
    columns: {
      name: "\u540D\u524D",
      savedAt: "\u4FDD\u5B58\u65E5\u6642",
      taskCount: "\u30BF\u30B9\u30AF\u6570",
      finish: "\u5B8C\u4E86\u4E88\u5B9A"
    },
    empty: "\u4FDD\u5B58\u3055\u308C\u305F\u30D0\u30FC\u30B8\u30E7\u30F3\u306F\u3042\u308A\u307E\u305B\u3093",
    compareCheck: "\u300C{name}\u300D\u3092\u6BD4\u8F03\u3059\u308B",
    renameTitle: "\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u30D0\u30FC\u30B8\u30E7\u30F3\u540D\u3092\u5909\u66F4",
    restoreTitle: "\u73FE\u5728\u306E\u30BF\u30B9\u30AF\u30FB\u62C5\u5F53\u8005\u3092\u3053\u306E\u30D0\u30FC\u30B8\u30E7\u30F3\u306E\u72B6\u614B\u306B\u623B\u3057\u307E\u3059",
    restoreUnsupportedTitle: "\u53E4\u3044\u5F62\u5F0F\u3067\u4FDD\u5B58\u3055\u308C\u305F\u30D0\u30FC\u30B8\u30E7\u30F3\u306E\u305F\u3081\u5FA9\u5143\u3067\u304D\u307E\u305B\u3093",
    compare: "\u30D0\u30FC\u30B8\u30E7\u30F3\u6BD4\u8F03"
  },
  network: {
    tidy: "\u6574\u9813\u8868\u793A",
    group: "\u30B0\u30EB\u30FC\u30D7\uFF08\u914D\u4E0B {count}\u4EF6\uFF09",
    fixedMilestone: "\u56FA\u5B9A\u30DE\u30A4\u30EB\u30B9\u30C8\u30FC\u30F3",
    milestone: "\u30DE\u30A4\u30EB\u30B9\u30C8\u30FC\u30F3",
    float: "\u30D5\u30ED\u30FC\u30C8 {days}\u65E5",
    lagTitle: "\u30E9\u30B0\uFF08workday\uFF09",
    removeEdge: "\u4F9D\u5B58\u95A2\u4FC2\u3092\u524A\u9664"
  }
};

// src/messages/en.json
var en_default = {
  common: {
    close: "Close",
    cancel: "Cancel",
    delete: "Delete",
    deleteConfirm: "Delete",
    untitledTask: "(untitled task)",
    untitledSprint: "(untitled sprint)",
    listSeparator: ", ",
    bullet: "\u2022 ",
    done: "Done",
    notDone: "Not done"
  },
  header: {
    import: "Import",
    export: "Export",
    exportJson: "Export JSON",
    exportSharedHtml: "Export shareable HTML",
    copyMermaid: "Copy as Mermaid",
    copyPng: "Copy as PNG (visible area)",
    leveling: "Enable resource leveling",
    runScheduling: "Run auto-scheduling",
    sprintConflictsTitle: "{count, plural, one {# task conflicts} other {# tasks conflict}} with sprint periods (click for details)",
    dependencyIssuesTitle: "There {count, plural, one {is # dependency issue} other {are # dependency issues}} (click for details)",
    dependencyIssuesButton: "Dependency issues {count}",
    projectEnd: "Finish {date}",
    critical: "Critical {count}",
    language: "Display language",
    languageName: {
      ja: "\u65E5\u672C\u8A9E",
      en: "English"
    }
  },
  tabs: {
    gantt: "WBS / Gantt",
    network: "Network",
    resource: "Resources",
    sprints: "Sprints",
    calendar: "Calendar",
    versions: "Versions"
  },
  linked: {
    fileInputLabel: "Linked JSON file",
    loading: "Checking the linked JSON...",
    selectionRequired: "Select the JSON specified in the query (only the first time).",
    permissionRequired: "Allow access to the linked JSON again.",
    error: "Could not load the linked JSON: {message}",
    errors: {
      invalidFormat: "The file format is invalid",
      parseFailed: "The JSON could not be parsed",
      readFailed: "The linked file could not be read",
      pickFailed: "The file picker could not be opened"
    },
    loaded: "Showing <file>{fileName}</file>. Changes on this screen are not saved automatically.",
    loadedWithDate: "Showing <file>{fileName}</file> (last modified {lastModified}). Changes on this screen are not saved automatically.",
    key: "Link key:",
    notPersistent: " (you will need to select the file again next time in this browser)",
    reload: "Reload latest",
    selectOther: "Select another JSON",
    allowAccess: "Allow access",
    reselect: "Select JSON again",
    select: "Select JSON"
  },
  embedded: {
    banner: "Showing the schedule exported on <b>{exportedAt}</b>. Changes on this screen are not saved to this HTML file (reloading restores the exported state).",
    loadFailed: "Could not load the schedule data embedded in this HTML."
  },
  toast: {
    linkSaveFailed: "The JSON was loaded, but the link could not be saved in this browser",
    linkedReloaded: "Reloaded the linked JSON",
    scheduleNotConverged: "Start dates were recalculated, but some tasks may not match the displayed schedule. Please run it again",
    scheduledWithLeveling: "Recalculated start dates based on dependencies and resource leveling",
    scheduled: "Rescheduled based on dependencies",
    versionSaved: 'Saved version "{name}"',
    versionRestoreUnsupported: "This version cannot be restored (it was saved in an old format)",
    versionRestored: 'Restored version "{name}"',
    exportedJson: "Exported the project to a JSON file",
    exportedSharedHtml: "Exported a shareable HTML file (opening it shows the schedule as of the export)",
    exportSharedHtmlFailed: "Failed to export the shareable HTML",
    mermaidCopied: "Copied the Gantt chart in Mermaid syntax to the clipboard",
    copyFailed: "Failed to copy to the clipboard",
    pngNeedsGantt: "Open the WBS / Gantt view first",
    pngCopied: "Copied the Gantt chart (visible area) to the clipboard as PNG",
    pngDownloaded: "Copying images to the clipboard is not supported, so the PNG file was downloaded",
    pngFailed: "Failed to copy as PNG: {message}",
    importFailedFormat: "Import failed (the file format is invalid)",
    importFailedParse: "Import failed (the JSON could not be parsed)",
    imported: "Imported the project from the JSON file"
  },
  pngErrors: {
    "gantt-dom-missing": "Could not read the structure of the Gantt view",
    "svg-image-failed": "Failed to render the Gantt view as an SVG image",
    "png-encode-failed": "Failed to generate the PNG"
  },
  confirm: {
    defaultLabel: "Run",
    restoreVersion: 'Discard the current contents and restore version "{name}" ({createdAt})?',
    restoreLabel: "Restore",
    import: "Replace the current tasks and assignees with the imported contents?",
    importLabel: "Import"
  },
  mermaid: {
    title: "Project schedule",
    untitled: "(untitled)"
  },
  sprintConflicts: {
    title: "Sprint conflicts ({count})",
    description: "These tasks do not fit within their assigned sprints because dependency and fixed milestone dates take precedence.",
    sprintNames: "({names})",
    reason: {
      startBeforeSprint: "The start date ({start, date, ymd}) is before the sprint start date ({sprintStart, date, ymd})",
      finishAfterSprint: "The finish date ({finish, date, ymd}) is after the sprint end date ({sprintEnd, date, ymd})",
      governed: "It cannot fit within the sprint because a fixed milestone's due date takes precedence"
    }
  },
  dependencyIssues: {
    label: {
      "dependency-cycle": "Circular dependency",
      "self-dependency": "Circular dependency (self)",
      "predecessor-missing": "Missing predecessor",
      "dependency-violation": "Start date conflict",
      "fixed-milestone-overrun": "Fixed date overrun"
    },
    dialogTitle: "Dependency issues ({count})",
    dialogDescription: 'Dates are not corrected automatically. Start date conflicts can be resolved with "Run auto-scheduling". For circular dependencies and missing predecessors, fix the predecessors field. Click an item to show the task.',
    cycleTargets: "{count, plural, one {# task or group} other {# tasks and groups}}",
    rowIconLabel: "Dependency issues ({count})",
    hiddenInGroup: "{count, plural, one {# dependency issue} other {# dependency issues}} in tasks under this group (expand the group to see them)",
    quoted: '"{name}"',
    arrow: " \u2192 ",
    cycleMemberNote: '"{child}" is in group "{parent}"',
    message: {
      cycle: "Circular dependency: {route}",
      cycleWithNotes: "Circular dependency: {route} ({notes})",
      self: "The task is its own predecessor (this dependency is not used in the calculation)",
      missing: 'Predecessor "{predecessorId}" does not exist (it refers to a deleted task, so this dependency is not used in the calculation)',
      violationStart: 'Predecessor "{predName}" ({label}) requires a start on or after {required, date, ymd}, but the task starts on {actual, date, ymd}',
      violationFinish: 'Predecessor "{predName}" ({label}) requires a finish on or after {required, date, ymd}, but the task finishes on {actual, date, ymd}',
      overrunEarliest: 'The earliest date from predecessor "{predName}" ({earliest, date, ymd}) is after the fixed date ({fixedDate, date, ymd})',
      overrunDisplay: "The displayed date ({actual, date, ymd}) is after the fixed date ({fixedDate, date, ymd})"
    },
    tooltipLine: "{label}: {message}"
  },
  levelWarnings: {
    limit: {
      daily: "{value, plural, one {# person-day} other {# person-days}} daily",
      weekly: "{value, plural, one {# person-day} other {# person-days}} weekly",
      monthly: "{value, plural, one {# person-day} other {# person-days}} monthly"
    },
    limitSeparator: ", ",
    capacityExceeded: '"{taskName}" (assignee: {resourceName}, effort: {duration} person-days) could not be allocated within the capacity limits ({limits}; search limit: {searchWorkdays, number} workdays). It is placed on consecutive workdays starting {start, date, ymd} and exceeds the capacity limits. Review the effort or the capacity limits.'
  },
  taskDetail: {
    groupBadge: "(group)",
    name: "Task name",
    kind: "Type",
    kindMilestone: "Milestone (click to change to a task)",
    kindTask: "Task (click to change to a milestone)",
    dueDate: "Due date",
    mode: "Mode",
    modeFlexible: "Flexible (forward)",
    modeFixed: "Fixed (backward from due date)",
    startDate: "Start date",
    duration: "Effort (person-days)",
    assignee: "Assignee",
    unassigned: "Unassigned",
    sprints: "Sprints (multiple allowed)",
    noSprints: "No sprints have been created",
    sprintRange: " ({start} \u2013 {end})",
    progress: "Progress",
    progressSummaryNote: " \u2014 average of child tasks (read-only)",
    completed: "Completed",
    predecessors: "Predecessors (WBS no.[type][\xB1lag], e.g. 1.2FS+1)",
    predecessorsSummaryNote: " \u2014 applies to all child tasks",
    successors: "Successors",
    schedStart: "Start",
    schedFinish: "Finish",
    float: "Float",
    floatDays: "{days} d",
    floatDaysCritical: "{days} d (critical)",
    governed: "Backward",
    governedDescription: "Scheduled backward from a fixed milestone's due date",
    notes: "Notes",
    notesPlaceholder: "Enter notes about this task"
  },
  wbs: {
    depsPlaceholder: "e.g. 1.2FS+1",
    colResizeTitle: "Drag to resize the column (double-click to reset)",
    sprintSelectTitle: "Sprints to link",
    noSprints: "No sprints",
    milestoneMode: {
      fixed: "Fixed",
      flexible: "Flexible"
    },
    newTaskName: "New task",
    newMilestoneName: "New milestone",
    newTaskPlaceholder: "Type a new task and press Enter",
    confirmDelete: 'Delete "{name}"? Its child tasks, if any, will also be deleted.',
    paneResizeTitle: "Drag to resize the pane (double-click to reset to auto width)",
    toast: {
      rowCopied: "Copied the row to the clipboard",
      cellCopied: "Copied the cell to the clipboard",
      nothingToPaste: "Nothing to paste",
      pastedPartially: "Pasted, skipping incompatible cells",
      rowPasted: "Pasted the row",
      cellPasted: "Pasted the cell"
    },
    toolbar: {
      task: "Task",
      milestone: "Milestone",
      indent: "Indent",
      outdent: "Outdent",
      details: "Details",
      copy: "Copy",
      paste: "Paste",
      undo: "Undo",
      redo: "Redo",
      saveVersion: "Save version"
    },
    compare: {
      title: "Match the selected version by WBS number and show its row under each task as a baseline",
      none: "No comparison",
      unsupported: "Unsupported",
      unsupportedTitle: "This version cannot be compared because it has no WBS numbers (save it again to enable comparison)",
      newTask: "New",
      newTaskTitle: "This task does not exist in the baseline version",
      baselineTitle: "Baseline: {name}",
      notInBaseline: "(not in baseline)",
      later: "{days, plural, one {# day} other {# days}} later than the baseline",
      earlier: "{days, plural, one {# day} other {# days}} earlier than the baseline",
      same: "Same finish date as the baseline"
    },
    columns: {
      wbsTitle: "Click a WBS number to select the row for copy/paste",
      name: "Task name",
      start: "Start",
      duration: "Effort",
      durationTitle: "Effort (person-days). Decimals allowed (e.g. 0.5, 2.5)",
      finish: "Finish",
      assignee: "Assignee",
      assigneeTitle: "Assignee for tasks; fixed/flexible for milestones",
      sprint: "Sprint",
      sprintTitle: "Linked sprints (not available for groups)",
      progress: "Progress",
      progressTitle: "Progress (%). Groups show the average of their child tasks",
      deps: "Pred.",
      depsTitle: "Specify by WBS number (e.g. 1.2FS+1). Set on a group row to apply to all its child tasks"
    },
    row: {
      dragTitle: "Drag to reorder",
      selectTitle: "Select the row (for copy/paste)",
      toTask: "Click to change to a task",
      toMilestone: "Click to change to a milestone",
      openDetails: "Open details",
      durationTitle: "Person-days (decimals allowed)",
      milestoneModeTitle: "Fixed: schedule backward from the due date / Flexible: schedule forward from dependencies",
      doneCheckTitle: "Done (unchecked: 0% / checked: 100%)",
      progressTitle: "Progress (%)"
    }
  },
  gantt: {
    toolbar: {
      inazuma: "Progress line",
      baseDate: "Status date (for the progress line and the today line)",
      resetBaseDateTitle: "Reset to today",
      today: "Today",
      criticalPath: "Critical path",
      zoomOut: "Zoom out (day \u2192 week \u2192 month)",
      zoomIn: "Zoom in"
    },
    sprintBandLabel: "{name} \xB7 {theme}",
    fixedMilestoneSuffix: " (fixed {date})",
    idle: {
      weekly: "weekly limit reached ({value} person-days/week)",
      monthly: "monthly limit reached ({value} person-days/month)",
      taskName: '"{name}"',
      nameSeparator: ", ",
      namesAndMore: "{names} and {count} more",
      daily: "allocated to other tasks {names} ({value} person-day daily)"
    },
    tooltip: {
      period: "{start} \u2013 {finish}",
      range: "{start}\u2013{end}",
      fixedMilestone: "Fixed milestone (due {date})",
      flexibleMilestone: "Flexible milestone",
      assignee: "Assignee: {name}",
      effortProgress: "Effort {duration} person-days \xB7 Progress {progress}%",
      includesNonWorkdays: "This period includes non-working days",
      sprints: "Sprints: {names}",
      sprintSeparator: ", ",
      float: "Float {days}d",
      floatCritical: "Float {days}d (critical)",
      idleDays: "Workdays without allocation due to capacity limits: {idle} (allocated: {allocated})",
      moreSegments: "{count, plural, one {# more period} other {# more periods}}",
      partialDay: "{date} ({load} person-days)",
      partial: "Partially allocated: {days}",
      partialMore: "Partially allocated: {days} and {count, plural, one {# more day} other {# more days}}",
      overCapacity: "Could not be allocated within the capacity limits and exceeds them",
      ariaSeparator: ". "
    }
  },
  calendar: {
    weekdaySuffix: " ({weekday})",
    exceptions: {
      title: "Non-working day calendar",
      add: "Add exception",
      thisRow: "this row",
      confirmDeleteHoliday: "Delete the holiday on {date}?",
      confirmDeleteWorkday: "Delete the working day on {date}?",
      columns: {
        date: "Date",
        type: "Type",
        name: "Name"
      },
      empty: "No exceptions yet (weekends and Japanese public holidays are used)",
      invalidType: "(invalid type)",
      type: {
        holiday: "Holiday",
        workday: "Working day"
      },
      placeholder: {
        holiday: "e.g. Foundation Day",
        workday: "e.g. Weekend work"
      },
      hint: {
        noDate: "Enter a date",
        invalidType: "Invalid type (this row is not applied to the schedule; select the type again)",
        duplicate: "There are multiple rows for the same date (working day takes precedence)",
        alreadyWeekend: "This date is already a weekend (no need to specify)",
        alreadyHoliday: "This date is already a public holiday (no need to specify)",
        alreadyWorkday: "This date is already a working day (no need to specify)"
      },
      note: 'Priority: working day > holiday > Japanese public holiday > weekend. A "working day" makes the date a working day even on weekends and public holidays, and a "holiday" makes a weekday a non-working day. Changes here apply to CPM, resource leveling and the planned finish date.',
      recent: "Upcoming exceptions: {items}",
      recentHoliday: " (holiday)",
      recentWorkday: " (working)"
    },
    upcoming: {
      title: "Upcoming public holidays (calculated automatically, read-only)",
      empty: "No upcoming calculated public holidays.",
      note: "Japanese public holidays (including substitute and citizens' holidays) are treated as non-working days automatically. Add only other holidays (such as company holidays) and working days on weekends or public holidays in the table above."
    }
  },
  sprints: {
    title: "Sprints",
    add: "Add sprint",
    confirmDelete: "Delete this sprint? (Linked tasks will be unassigned from it)",
    overlapWarning: "Some sprints overlap. They can be saved, but please check them.",
    columns: {
      name: "Name",
      theme: "Theme",
      start: "Start",
      end: "End",
      taskCount: "Tasks"
    },
    empty: "No sprints yet",
    themePlaceholder: "Theme of this sprint (optional)",
    invalidRange: "The end date is before the start date",
    overlapping: "Overlaps with another sprint",
    taskCount: "{count}",
    note: "Start and end dates can be set freely (about one week is typical). Sprints cannot be set on groups (summary tasks).",
    timeline: "Sprint timeline"
  },
  resources: {
    newName: "New assignee",
    confirmDelete: "Delete this assignee? (Their tasks will become unassigned)",
    title: "Assignees and capacity limits",
    add: "Add assignee",
    columns: {
      name: "Name",
      capacityTitle: "0 means no limit (only the 1 person-day per day limit applies)",
      weekly: "Weekly limit (days/week, 0 = none)",
      monthly: "Monthly limit (days/month, 0 = none)"
    },
    weeklyLoad: "Weekly workload",
    selectAssignee: "Assignee",
    chart: {
      value: "{value} person-days",
      series: "Allocated effort",
      week: "Week: {week}",
      limit: "Limit"
    },
    note: "The red dashed line is the weekly capacity limit (0 = none). The chart sums the same daily allocations as the Gantt chart. With resource leveling on, effort is allocated from the earliest days within the limits, and tasks are extended across days where the limit is reached."
  },
  versions: {
    defaultName: "Version {n}",
    namePlaceholder: "Version name (e.g. Initial plan)",
    nameLabel: "Version name",
    save: "Save current schedule",
    columns: {
      name: "Name",
      savedAt: "Saved at",
      taskCount: "Tasks",
      finish: "Planned finish"
    },
    empty: "No saved versions",
    compareCheck: 'Compare "{name}"',
    renameTitle: "Click to rename the version",
    restoreTitle: "Restore the current tasks and assignees to this version",
    restoreUnsupportedTitle: "This version was saved in an old format and cannot be restored",
    compare: "Version comparison"
  },
  network: {
    tidy: "Auto layout",
    group: "Group ({count, plural, one {# task} other {# tasks}})",
    fixedMilestone: "Fixed milestone",
    milestone: "Milestone",
    float: "Float {days}d",
    lagTitle: "Lag (workdays)",
    removeEdge: "Remove dependency"
  }
};

// src/lib/i18n.js
var LOCALES = Object.freeze(["ja", "en"]);
var DEFAULT_LOCALE = "ja";
var MESSAGES = Object.freeze({ ja: ja_default, en: en_default });
var TIME_ZONE = "UTC";
function localTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || void 0;
  } catch (e) {
    return void 0;
  }
}
function buildFormats(locale) {
  const tz = localTimeZone();
  const common = {
    // 表の列など幅が限られる箇所の日付（日本語は ymd と同じ「2026/09/26」、英語は「09/26/2026」）
    ymdNumeric: { year: "numeric", month: "2-digit", day: "2-digit" },
    // 保存日時など（日本語は従来の toLocaleString("ja-JP") と同じ「2026/9/26 9:41:30」）
    dateTime: { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: tz },
    // 共有用HTMLの書き出し日時（日本語は「2026/09/26 09:41」）
    dateTimeShort: { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: tz }
  };
  if (locale === "ja") {
    return {
      dateTime: {
        ymd: { year: "numeric", month: "2-digit", day: "2-digit" },
        md: { month: "2-digit", day: "2-digit" },
        weekday: { weekday: "short" },
        weekdayNarrow: { weekday: "short" },
        month: { month: "short" },
        ...common
      }
    };
  }
  return {
    dateTime: {
      ymd: { year: "numeric", month: "short", day: "numeric" },
      md: { month: "short", day: "numeric" },
      weekday: { weekday: "short" },
      weekdayNarrow: { weekday: "narrow" },
      month: { month: "short" },
      ...common
    }
  };
}
var FORMATS = Object.freeze(Object.fromEntries(LOCALES.map((l) => [l, buildFormats(l)])));
function normalizeLocale(value) {
  return LOCALES.includes(value) ? value : null;
}
function toMessageFormatFormats(formats) {
  const withZone = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, { timeZone: TIME_ZONE, ...v }]));
  return {
    date: withZone({ ...IntlMessageFormat.formats.date, ...formats.dateTime }),
    time: withZone({ ...IntlMessageFormat.formats.time, ...formats.dateTime }),
    number: { ...formats.number || {} }
  };
}
function lookup(messages, key) {
  return key.split(".").reduce((obj, k) => obj == null ? void 0 : obj[k], messages);
}
function createAppTranslator(locale = DEFAULT_LOCALE) {
  const l = normalizeLocale(locale) || DEFAULT_LOCALE;
  const messages = MESSAGES[l];
  const formats = toMessageFormatFormats(FORMATS[l]);
  const cache = /* @__PURE__ */ new Map();
  function t(key, values) {
    const message = lookup(messages, key);
    if (typeof message !== "string") return key;
    let mf = cache.get(key);
    if (!mf) {
      mf = new IntlMessageFormat(message, l, formats);
      cache.set(key, mf);
    }
    const out = mf.format(values);
    return Array.isArray(out) ? out.join("") : String(out);
  }
  t.has = (key) => typeof lookup(messages, key) === "string";
  return t;
}
function dateArg(iso) {
  return iso ? parseISO(iso) : null;
}
function taskNameText(t, name) {
  return name == null || name === "" ? t("common.untitledTask") : name;
}
function formatDependencyIssueMessage(t, issue) {
  const p = issue.params || {};
  const name = (n) => taskNameText(t, n);
  switch (issue.code) {
    case "dependency-cycle": {
      const route = (p.route || []).map((r) => t("dependencyIssues.quoted", { name: name(r.name) })).join(t("dependencyIssues.arrow"));
      const notes = (p.memberEdges || []).map((e) => t("dependencyIssues.cycleMemberNote", { child: name(e.childName), parent: name(e.parentName) }));
      return notes.length ? t("dependencyIssues.message.cycleWithNotes", { route, notes: notes.join(t("common.listSeparator")) }) : t("dependencyIssues.message.cycle", { route });
    }
    case "self-dependency":
      return t("dependencyIssues.message.self");
    case "predecessor-missing":
      return t("dependencyIssues.message.missing", { predecessorId: p.predecessorId });
    case "dependency-violation":
      return t(p.side === "finish" ? "dependencyIssues.message.violationFinish" : "dependencyIssues.message.violationStart", {
        predName: name(p.predName),
        label: p.label,
        required: dateArg(p.required),
        actual: dateArg(p.actual)
      });
    case "fixed-milestone-overrun":
      return p.predName !== void 0 ? t("dependencyIssues.message.overrunEarliest", { predName: name(p.predName), earliest: dateArg(p.earliest), fixedDate: dateArg(p.fixedDate) }) : t("dependencyIssues.message.overrunDisplay", { actual: dateArg(p.actual), fixedDate: dateArg(p.fixedDate) });
    default:
      return issue.code;
  }
}
function formatSprintConflictReason(t, reason) {
  const p = reason.params || {};
  switch (reason.code) {
    case "start-before-sprint":
      return t("sprintConflicts.reason.startBeforeSprint", { start: dateArg(p.start), sprintStart: dateArg(p.sprintStart) });
    case "finish-after-sprint":
      return t("sprintConflicts.reason.finishAfterSprint", { finish: dateArg(p.finish), sprintEnd: dateArg(p.sprintEnd) });
    case "governed-by-fixed-milestone":
      return t("sprintConflicts.reason.governed");
    default:
      return reason.code;
  }
}
function formatSprintConflictSprintNames(t, conflict) {
  return (conflict.sprintNames || []).map((n) => n == null || n === "" ? t("common.untitledSprint") : n).join(t("common.listSeparator"));
}
function formatLevelWarning(t, warning) {
  const p = warning.params || {};
  if (warning.code !== "capacity-exceeded") return warning.code;
  const limits = [t("levelWarnings.limit.daily", { value: p.dailyCapacity })];
  if (p.weeklyCapacity) limits.push(t("levelWarnings.limit.weekly", { value: p.weeklyCapacity }));
  if (p.monthlyCapacity) limits.push(t("levelWarnings.limit.monthly", { value: p.monthlyCapacity }));
  return t("levelWarnings.capacityExceeded", {
    taskName: p.taskName ?? "",
    resourceName: p.resourceName ?? "",
    duration: p.duration,
    limits: limits.join(t("levelWarnings.limitSeparator")),
    searchWorkdays: p.searchWorkdays,
    start: dateArg(p.start)
  });
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
var DEFAULT_MERMAID_LABELS = MESSAGES[DEFAULT_LOCALE].mermaid;

// src/agent/cli.js
var tJa = createAppTranslator("ja");
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
  const display = buildDisplaySchedule(tasks, cpm.result, resources, cal, sprints, { leveling });
  const { schedule } = display;
  const levelWarnings = display.levelWarnings.map((w) => formatLevelWarning(tJa, w));
  let projectEnd = cpm.projectEnd;
  schedule.forEach((v) => {
    if (v.schedFinish && v.schedFinish > projectEnd) projectEnd = v.schedFinish;
  });
  const sprintConflicts = detectSprintConflicts(tasks, sprints, schedule).map(formatSprintConflict);
  const dependencyIssues = detectDependencyIssues(tasks, schedule, cal).map((issue) => formatDependencyIssue(issue, tasks));
  return { projectStart, cal, cpm, schedule, projectEnd, leveling, levelWarnings, sprintConflicts, dependencyIssues };
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
function formatDependencyIssue(issue, tasks) {
  const { code, severity, ids, params, ...detail } = issue;
  const subject = code === "dependency-cycle" ? "" : `\u300C${nameOf(tasks, ids[0])}\u300D: `;
  return { severity, code, ids, message: `${subject}${formatDependencyIssueMessage(tJa, issue)}`, ...detail };
}
function formatSprintConflict(conflict) {
  const { taskId, name, wbsNo, reasons } = conflict;
  return {
    taskId,
    name,
    wbsNo,
    sprintName: formatSprintConflictSprintNames(tJa, conflict),
    reasons: reasons.map((r) => formatSprintConflictReason(tJa, r))
  };
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
    if ((t.predecessors || []).length && isGroupId(tasks, t.id)) {
      issues.push({ severity: "warning", code: "group-has-predecessors", ids: [t.id], message: `\u30B0\u30EB\u30FC\u30D7\u300C${t.name}\u300D\u306B\u5148\u884C\u30BF\u30B9\u30AF\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u3059\uFF08\u4F9D\u5B58\u306F\u30EA\u30FC\u30D5\u30BF\u30B9\u30AF\u306B\u4ED8\u3051\u3066\u304F\u3060\u3055\u3044\uFF09` });
    }
  }
  for (const issue of detectDependencyIssues(tasks)) {
    issues.push(formatDependencyIssue(issue, tasks));
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
function applyAutoSchedule(data, projectStart, cal, opts = {}) {
  const { startDates, converged } = computeAutoSchedule(
    data.tasks,
    cal,
    projectStart,
    data.sprints || [],
    data.resources || [],
    { leveling: !!opts.leveling }
  );
  const changed = [];
  const tasks = data.tasks.map((t) => {
    if (isGroupId(data.tasks, t.id) || !startDates.has(t.id)) return t;
    const to = startDates.get(t.id);
    if (t.startDate !== to) changed.push({ id: t.id, from: t.startDate ?? null, to });
    return { ...t, startDate: to };
  });
  return { tasks, changed, converged };
}
function tryComputeSchedule(data, opts) {
  try {
    return { ok: true, result: computeSchedule(data, opts) };
  } catch (e) {
    return { ok: false, error: `\u30B9\u30B1\u30B8\u30E5\u30FC\u30EB\u8A08\u7B97\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${String(e && e.message || e)}` };
  }
}
var SCHEDULE_BLOCKING_CODES = /* @__PURE__ */ new Set(["duplicate-task-id", "parent-cycle"]);
function validateProject(data, opts = {}) {
  const leveling = opts.leveling === void 0 ? !!data.levelingOn : !!opts.leveling;
  const issues = analyzeIntegrity(data);
  let scheduleChecks;
  const blocking = checkFieldShapes(data).find((i) => i.severity === "error") || issues.find((i) => i.severity === "error" && SCHEDULE_BLOCKING_CODES.has(i.code));
  if (blocking) {
    scheduleChecks = { performed: false, leveling, reason: `\u6574\u5408\u6027\u30A8\u30E9\u30FC\uFF08${blocking.code}\uFF09\u304C\u3042\u308B\u305F\u3081\u3001\u65E5\u7A0B\u306B\u95A2\u3059\u308B\u4F9D\u5B58\u95A2\u4FC2\u306E\u691C\u67FB\u3092\u884C\u3044\u307E\u305B\u3093\u3067\u3057\u305F` };
  } else {
    const computed = tryComputeSchedule(data, { respectManualPins: true, leveling });
    if (computed.ok) {
      const scheduleCodes = new Set(SCHEDULE_DEPENDENCY_ISSUE_CODES);
      issues.push(...computed.result.dependencyIssues.filter((i) => scheduleCodes.has(i.code)));
      scheduleChecks = { performed: true, leveling };
    } else {
      scheduleChecks = { performed: false, leveling, reason: computed.error };
    }
  }
  return { valid: !issues.some((i) => i.severity === "error"), issues, scheduleChecks };
}
function cmdValidate(positional, opts) {
  const [path] = positional;
  if (!path) fail("\u4F7F\u3044\u65B9: validate <file> [--leveling on|off|auto]");
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
  const leveling = resolveLeveling(opts.leveling, data);
  const { valid, issues, scheduleChecks } = validateProject(data, { leveling });
  emit({
    command: "validate",
    file: path,
    valid,
    schemaValid: true,
    scheduleChecks,
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
    dependencyIssues: r.dependencyIssues,
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
  let rescheduleConverged = null;
  if (reschedule) {
    const editedProjectStart = deriveProjectStart(edited.tasks, toISO(/* @__PURE__ */ new Date()));
    const editedCal = makeProjectCalendar(editedProjectStart, edited.calendarExceptions || []);
    const applied = applyAutoSchedule(edited, editedProjectStart, editedCal, { leveling: afterLeveling });
    proposedTasks = applied.tasks;
    startDateChanges = applied.changed;
    rescheduleConverged = applied.converged;
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
      // --reschedule 時のみ。false なら書き戻した開始日と表示（平準化後の配置日）の一致を確認できていない
      rescheduleConverged,
      newlyCritical,
      noLongerCritical,
      snapshotName
    },
    startDateChanges,
    scheduleChanges,
    sprintConflicts: { before: before.sprintConflicts, after: after.sprintConflicts },
    levelWarnings: { before: before.levelWarnings, after: after.levelWarnings },
    dependencyIssues: { before: before.dependencyIssues, after: after.dependencyIssues },
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
    predecessors,
    // 日別割当（平準化ONでは担当者の稼働上限に合わせて延長した割当、OFFでは開始日からの連続配分）。
    // idleSegments は期間内で稼働上限により割当がなかった稼働日の区間と理由（daily=他タスクで埋まっている）。
    allocation: s.allocation ? {
      allocatedDays: s.allocation.alloc.length,
      days: s.allocation.alloc,
      idleSegments: idleSegments(s.allocation.idle, s.allocation.alloc).map((seg) => ({
        ...seg,
        taskNames: seg.taskIds.map((id) => nameOf(data.tasks, id))
      })),
      overCapacity: !!s.allocation.overCapacity
    } : null,
    dependencyIssues: r.dependencyIssues.filter((i) => i.ids.includes(taskId))
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
        "  validate <file> [--leveling on|off|auto]",
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
  findParentCycles,
  scheduleRows,
  validateProject
};
