/* =========================================================================================
   カレンダー / 日付ユーティリティ（日本の祝日を考慮した稼働日計算）
   ========================================================================================= */

/**
 * @typedef {Object} Calendar
 * makeCalendar() が返す、稼働日カレンダー（土日・祝日を除外）に基づく日付計算関数群。
 * @property {(d: Date) => boolean} isWorkday
 * @property {(s: string) => boolean} isWorkdayStr
 * @property {(s: string) => string} snapForward - 稼働日でなければ次の稼働日まで進める
 * @property {(s: string) => string} snapBackward - 稼働日でなければ前の稼働日まで戻す
 * @property {(s: string, n: number) => string} shift - 稼働日ベースでn日シフト（負値可）
 * @property {(startStr: string, duration: number) => string} endFromStart
 * @property {(finishStr: string, duration: number) => string} startFromEnd
 * @property {(aStr: string, bStr: string) => number} workdaysBetween - 稼働日数の差（符号あり）
 * @property {Map<string,string>} holidayMap - 日付(YYYY-MM-DD) -> 祝日名
 */

export function toISO(d) { return d.toISOString().slice(0, 10); }
export function parseISO(s) { return new Date(s + "T00:00:00Z"); }
export const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

export function vernalEquinoxDay(year) {
  return Math.floor(20.8431 + 0.242194 * (year - 1980)) - Math.floor((year - 1980) / 4);
}
export function autumnalEquinoxDay(year) {
  return Math.floor(23.2488 + 0.242194 * (year - 1980)) - Math.floor((year - 1980) / 4);
}
export function nthMonday(year, month, n) {
  const d = new Date(Date.UTC(year, month - 1, 1));
  const dow = d.getUTCDay();
  const firstMonday = 1 + ((8 - dow) % 7);
  return new Date(Date.UTC(year, month - 1, firstMonday + (n - 1) * 7));
}
export function baseHolidaysOfYear(year) {
  const list = [];
  const add = (m, d, name) => list.push({ date: toISO(new Date(Date.UTC(year, m - 1, d))), name });
  add(1, 1, "元日");
  list.push({ date: toISO(nthMonday(year, 1, 2)), name: "成人の日" });
  add(2, 11, "建国記念の日");
  add(2, 23, "天皇誕生日");
  add(3, vernalEquinoxDay(year), "春分の日");
  add(4, 29, "昭和の日");
  add(5, 3, "憲法記念日");
  add(5, 4, "みどりの日");
  add(5, 5, "こどもの日");
  list.push({ date: toISO(nthMonday(year, 7, 3)), name: "海の日" });
  add(8, 11, "山の日");
  list.push({ date: toISO(nthMonday(year, 9, 3)), name: "敬老の日" });
  add(9, autumnalEquinoxDay(year), "秋分の日");
  list.push({ date: toISO(nthMonday(year, 10, 2)), name: "スポーツの日" });
  add(11, 3, "文化の日");
  add(11, 23, "勤労感謝の日");
  return list;
}
/** startYear〜endYear（前後1年余裕込み）の祝日マップ date->name を構築。
 *  国民の休日（祝日に挟まれた平日）・振替休日（日曜の祝日の振替）を反映する。 */
export function buildHolidayMap(startYear, endYear) {
  const map = new Map();
  for (let y = startYear - 1; y <= endYear + 1; y++) {
    baseHolidaysOfYear(y).forEach(h => map.set(h.date, h.name));
  }
  // 国民の休日
  let added = true, guard = 0;
  while (added && guard < 5) {
    added = false; guard++;
    for (const dateStr of Array.from(map.keys())) {
      const d = parseISO(dateStr);
      const next = new Date(d); next.setUTCDate(d.getUTCDate() + 1);
      const nextStr = toISO(next);
      const nn = new Date(d); nn.setUTCDate(d.getUTCDate() + 2);
      if (!map.has(nextStr) && map.has(toISO(nn))) {
        const dow = next.getUTCDay();
        if (dow !== 0 && dow !== 6) { map.set(nextStr, "国民の休日"); added = true; }
      }
    }
  }
  // 振替休日（各起点日につき一度だけ処理し、連鎖的な誤加算を防ぐ）
  const substituted = new Set();
  added = true; guard = 0;
  while (added && guard < 10) {
    added = false; guard++;
    for (const dateStr of Array.from(map.keys())) {
      const name = map.get(dateStr);
      if (name === "振替休日" || substituted.has(dateStr)) continue;
      const d = parseISO(dateStr);
      if (d.getUTCDay() === 0) {
        substituted.add(dateStr);
        let cursor = new Date(d);
        do { cursor.setUTCDate(cursor.getUTCDate() + 1); } while (map.has(toISO(cursor)));
        map.set(toISO(cursor), "振替休日");
        added = true;
      }
    }
  }
  return map;
}

/**
 * holidayMap を束ねた稼働日カレンダー（土日・祝日を除外）を作る。
 * @param {Map<string,string>} holidayMap - 日付(YYYY-MM-DD) -> 祝日名
 * @returns {Calendar}
 */
export function makeCalendar(holidayMap) {
  function isWorkday(d) {
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) return false;
    if (holidayMap.has(toISO(d))) return false;
    return true;
  }
  function isWorkdayStr(s) { return isWorkday(parseISO(s)); }
  function snapForward(s) { const d = parseISO(s); while (!isWorkday(d)) d.setUTCDate(d.getUTCDate() + 1); return toISO(d); }
  function snapBackward(s) { const d = parseISO(s); while (!isWorkday(d)) d.setUTCDate(d.getUTCDate() - 1); return toISO(d); }
  function shift(s, n) {
    if (n === 0) return s;
    const d = parseISO(s);
    const step = n > 0 ? 1 : -1;
    let remaining = Math.abs(n);
    while (remaining > 0) { d.setUTCDate(d.getUTCDate() + step); if (isWorkday(d)) remaining--; }
    return toISO(d);
  }
  function endFromStart(startStr, duration) {
    if (duration <= 0) return snapForward(startStr);
    const totalDays = Math.max(1, Math.ceil(duration - 1e-9));
    const d = parseISO(snapForward(startStr));
    let count = 1;
    while (count < totalDays) { d.setUTCDate(d.getUTCDate() + 1); if (isWorkday(d)) count++; }
    return toISO(d);
  }
  function startFromEnd(finishStr, duration) {
    if (duration <= 0) return snapBackward(finishStr);
    const totalDays = Math.max(1, Math.ceil(duration - 1e-9));
    const d = parseISO(snapBackward(finishStr));
    let count = 1;
    while (count < totalDays) { d.setUTCDate(d.getUTCDate() - 1); if (isWorkday(d)) count++; }
    return toISO(d);
  }
  function workdaysBetween(aStr, bStr) {
    let a = parseISO(aStr), b = parseISO(bStr);
    if (a.getTime() === b.getTime()) return 0;
    const sign = b > a ? 1 : -1;
    let cnt = 0; const d = new Date(a);
    while (d.getTime() !== b.getTime()) { d.setUTCDate(d.getUTCDate() + sign); if (isWorkday(d)) cnt += sign; }
    return cnt;
  }
  return { isWorkday, isWorkdayStr, snapForward, snapBackward, shift, endFromStart, startFromEnd, workdaysBetween, holidayMap };
}

export function weekKey(dateStr) {
  const d = parseISO(dateStr);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  const monday = new Date(d); monday.setUTCDate(d.getUTCDate() - dow);
  return toISO(monday);
}
export function monthKey(dateStr) { return dateStr.slice(0, 7); }
export function fmtJP(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${y}/${m}/${d}`;
}
// 月日のみの短い表記（バージョン比較の基準行など、表示幅が限られる箇所で使用）。
export function fmtMD(dateStr) {
  if (!dateStr) return "";
  const [, m, d] = dateStr.split("-");
  return `${m}/${d}`;
}
export function cal_addDaysISO(iso, n) { const d = parseISO(iso); d.setUTCDate(d.getUTCDate() + n); return toISO(d); }
