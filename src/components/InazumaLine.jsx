import React from "react";
import { ROW_H } from "../constants.js";

/** 稲妻線（進捗線）。一般的なイナズマ線／MS Project の進行状況線の作図ルールに合わせている。
 *
 *  基準線は「進捗基準日」（`baseDateISO`、既定は本日。ツールバーで任意の日付に変更でき、
 *  過去・未来の任意時点での進捗状況を確認できる）の縦線。以下の説明で「今日」とあるのは
 *  この進捗基準日を指す。
 *
 *  1. 線はチャート上端の基準日から引き始め、各行の進捗点を順に結び、最後にチャート下端の
 *     基準日へ戻る。点と点は斜めの直線で結ぶため、遅れ・進みのある行が三角形状に尖った、
 *     いわゆる「ギザギザ」の形になる。
 *  2. 各行の進捗点は「タスクバー上で進捗率が到達している位置」に打つ
 *     （0%＝バー左端、50%＝バー中央、100%＝バー右端）。位置は稼働日カレンダーで求めるため、
 *     ガントバーの進捗塗り分けの先端とちょうど一致する。基準日より左に尖れば遅れ、右なら前倒し。
 *  3. 予定どおりの行は尖らせず、基準日の位置を通る垂直な線にする。すなわち、完了済み（100%）の
 *     タスクは到達位置が過去でも基準日まで引き上げ（凹ませない）、未着手（0%）で開始前の
 *     タスクは到達位置が未来でも基準日まで引き下げる（凸らせない）。
 *  4. 展開中のグループ（サマリー）行には点を打たない。グループの進捗点は配下タスクを
 *     期間で丸めた値であり、実際の作業状況を表さないうえ、配下タスクの点と二重に山ができて
 *     かえって読みにくくなるため（MS Project も開始日が未来のサマリータスクを進行状況線から
 *     除外する）。折りたたまれているグループは配下が非表示なので、代表として点を打つ。
 *  5. マイルストーンは期間を持たないため、進捗率で按分せずマークの位置そのものを点とする。
 *
 *  予定日程（schedStart/schedFinish）そのものは進捗率によって変化させない。 */
export function InazumaLine({ flat, schedule, xOf, dayWidth, cal, baseDateISO, rowStride = ROW_H }) {
  const todayX = xOf(baseDateISO) + dayWidth / 2;
  const points = [];
  flat.forEach((t, i) => {
    const s = schedule.get(t.id);
    if (!s || !s.schedStart || !s.schedFinish) return;
    // 展開中のグループ行はスキップ（次の行が自分の配下なら展開されている）
    const expandedGroup = t.hasChildren && flat[i + 1] && flat[i + 1].level > t.level;
    if (expandedGroup) return;
    const frac = Math.max(0, Math.min(100, s.progress ?? (t.progress || 0))) / 100;
    let px;
    if (t.milestone) {
      px = xOf(s.schedStart) + dayWidth / 2; // マイルストーンのマーク位置
    } else {
      // タスクが占める稼働日数（開始日・終了日を含む）を進捗率で按分した位置
      const spanDays = cal.workdaysBetween(s.schedStart, s.schedFinish) + 1;
      const completed = spanDays * frac;
      const whole = Math.floor(completed);
      px = whole >= spanDays
        ? xOf(s.schedFinish) + dayWidth // 100%：バーの右端
        : xOf(cal.shift(s.schedStart, whole)) + (completed - whole) * dayWidth;
    }
    // 予定どおりの行は尖らせない（完了済みは凹ませない／未着手は凸らせない）
    if (frac >= 1 && px < todayX) px = todayX;
    else if (frac <= 0 && px > todayX) px = todayX;
    points.push({ id: t.id, px, py: i * rowStride + ROW_H / 2 });
  });
  if (!points.length) return null;
  const bottomY = flat.length * rowStride;
  const d = [`M${todayX},0`, ...points.map(p => `L${p.px},${p.py}`), `L${todayX},${bottomY}`].join(" ");
  return (
    <g pointerEvents="none">
      <path d={d} stroke="#EAB308" strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      {points.map(p => <circle key={p.id} cx={p.px} cy={p.py} r={2.5} fill="#EAB308" />)}
    </g>
  );
}
