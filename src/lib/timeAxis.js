import { parseISO, toISO, weekKey, isWeekendStr, cal_addDaysISO, WEEKDAY_JA } from "./calendar.js";

/* =========================================================================================
   ガントチャートの日付軸（ヘッダーの目盛り）生成

   ズームアウトしていくと日付の目盛りが細かすぎて潰れるため、`dayWidth`（1日あたりのピクセル幅）
   から表示粒度 tier を導出し、日 → 週 → 月 と目盛りを縮約する。
   バー・依存線・稲妻線は従来どおり線形スケール（1日 = dayWidth）に乗ったままで、
   ここで切り替わるのはヘッダーの目盛りと背景の網掛け／罫線だけ。
   ========================================================================================= */

// ズームボタンで送るラダー（この離散値の上を index で移動する）。既定値 20 も含む。
export const DAY_WIDTH_STOPS = [2, 3, 4, 6, 8, 10, 12, 16, 20, 26, 32, 40];
export const MIN_DAY_WIDTH = DAY_WIDTH_STOPS[0];
export const MAX_DAY_WIDTH = DAY_WIDTH_STOPS[DAY_WIDTH_STOPS.length - 1];

/** 現在の dayWidth から、ラダー上で1段ズームした値を返す。
 *  dir > 0 = ズームイン（広げる）、dir < 0 = ズームアウト（狭める）。
 *  ラダー上に無い値から呼ばれても、直近の隣接 stop へ寄せる。 */
export function stepDayWidth(dayWidth, dir) {
  if (dir > 0) {
    for (let i = 0; i < DAY_WIDTH_STOPS.length; i++) {
      if (DAY_WIDTH_STOPS[i] > dayWidth) return DAY_WIDTH_STOPS[i];
    }
    return MAX_DAY_WIDTH;
  }
  for (let i = DAY_WIDTH_STOPS.length - 1; i >= 0; i--) {
    if (DAY_WIDTH_STOPS[i] < dayWidth) return DAY_WIDTH_STOPS[i];
  }
  return MIN_DAY_WIDTH;
}

/** dayWidth から日付軸の表示粒度を決める。
 *  - "day"  : 1日ごとに日付＋曜日（従来表示）。週末・祝日の網掛けあり。
 *  - "week" : 週頭（月曜）ごとに "M/D"。網掛けは維持。
 *  - "month": 月初ごとに "M月"。日単位の網掛けは行わず、月境界の罫線のみ。 */
export function axisTier(dayWidth) {
  if (dayWidth >= 14) return "day";
  if (dayWidth >= 4) return "week";
  return "month";
}

// 端でクリップした結果この幅（px）未満になった帯は、ラベルがまともに読めないため描画対象から外す。
// 主に maxDate 側の余白（projectEnd + 7日）が翌月・翌週へわずかにはみ出してできる断片を消すのが目的。
// 月・週・年の帯はクリップされなければ必ずこれより広いので、通常の帯を誤って落とすことはない。
const MIN_BAND_PX = 24;

// kind ("month" | "year") の期間区切りを [{start, end}]（end は次期間の開始＝排他）で返す。
function periodRanges(minDate, maxDate, kind) {
  const min = parseISO(minDate);
  const max = parseISO(maxDate);
  const ranges = [];
  let cur = kind === "month"
    ? new Date(Date.UTC(min.getUTCFullYear(), min.getUTCMonth(), 1))
    : new Date(Date.UTC(min.getUTCFullYear(), 0, 1));
  while (cur <= max) {
    const next = kind === "month"
      ? new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1))
      : new Date(Date.UTC(cur.getUTCFullYear() + 1, 0, 1));
    ranges.push({ start: toISO(cur), end: toISO(next) });
    cur = next;
  }
  return ranges;
}

// 週（月曜起点）の区切りを [{start, end}] で返す。先頭は minDate を含む週の月曜。
function weekRanges(minDate, maxDate) {
  const max = parseISO(maxDate);
  const ranges = [];
  let cur = weekKey(minDate);
  while (parseISO(cur) <= max) {
    const next = cal_addDaysISO(cur, 7);
    ranges.push({ start: cur, end: next });
    cur = next;
  }
  return ranges;
}

// [{start,end}] を、表示範囲 [0, spanW] にクリップした帯 [{key,label,x,w}] へ変換する。
function rangesToBands(ranges, xOf, spanW, labelOf) {
  const bands = [];
  for (const r of ranges) {
    const left = Math.max(0, xOf(r.start));
    const right = Math.min(spanW, xOf(r.end));
    const fullW = xOf(r.end) - xOf(r.start); // クリップ前の本来の幅
    // 端で本来の一部まで削られ、かつ絶対幅も読めない大きさになった帯だけを落とす
    // （長期間の帯がスクロール範囲の都合で一部しか見えていないケースは残す）。
    if (right - left < MIN_BAND_PX && right - left < fullW) continue;
    bands.push({ key: r.start, label: labelOf(r), x: left, w: right - left });
  }
  return bands;
}

const monthNum = (iso) => String(Number(iso.slice(5, 7)));
const dayNum = (iso) => String(Number(iso.slice(8, 10)));

/** ガントヘッダーの目盛りを生成する。
 *  @returns {{ tier: string, minor: Array, major: Array }}
 *    minor: 下段の細かい目盛り  [{ key, label, sub?, x, w, muted }]
 *    major: 中段の粗い帯（月 or 年）[{ key, label, x, w }]
 *  x 座標は makeDateScale と同じ「round(日数差) * dayWidth」で算出するのでバー位置と一致する。 */
export function buildTimeAxis({ minDate, maxDate, dayWidth, tier, cal }) {
  const minTime = parseISO(minDate).getTime();
  const xOf = (iso) => Math.round((parseISO(iso).getTime() - minTime) / 86400000) * dayWidth;
  const spanW = xOf(maxDate);

  if (tier === "month") {
    const minor = rangesToBands(periodRanges(minDate, maxDate, "month"), xOf, spanW, (r) => `${monthNum(r.start)}月`);
    const major = rangesToBands(periodRanges(minDate, maxDate, "year"), xOf, spanW, (r) => r.start.slice(0, 4));
    return { tier, minor, major };
  }

  const major = rangesToBands(periodRanges(minDate, maxDate, "month"), xOf, spanW, (r) => r.start.slice(0, 7));

  if (tier === "week") {
    const minor = rangesToBands(weekRanges(minDate, maxDate), xOf, spanW, (r) => `${monthNum(r.start)}/${dayNum(r.start)}`);
    return { tier, minor, major };
  }

  // day tier: 1日1目盛り（従来どおり）。網掛け判定は「非稼働日かつ（週末 or 祝日）」。
  const minor = [];
  let d = parseISO(minDate);
  const end = parseISO(maxDate);
  while (d <= end) {
    const iso = toISO(d);
    const working = cal ? cal.isWorkdayStr(iso) : !isWeekendStr(iso);
    const holiday = cal ? !!cal.holidayName(iso) : false;
    minor.push({
      key: iso,
      label: String(d.getUTCDate()),
      sub: WEEKDAY_JA[d.getUTCDay()],
      x: xOf(iso),
      w: dayWidth,
      muted: !working && (isWeekendStr(iso) || holiday),
    });
    d = new Date(d.getTime() + 86400000);
  }
  return { tier, minor, major };
}
