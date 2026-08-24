/* =========================================================================================
   WBS/ガントチャートのレイアウト定数
   ========================================================================================= */
export const ROW_H = 30;
// バージョン比較モード時、各タスクの下に重ねて表示する「基準バージョン行」の高さ。
// 比較モードON時は1タスクあたり ROW_H（現在行）+ ROW_H_BASE（基準行）を占有する。
export const ROW_H_BASE = 22;
// ガントヘッダーの合計高さ（スプリント帯16px + 月ラベル20px + 日付・曜日28px）。
// 左（WBS表）・右（ガントチャート）のヘッダーで共通して使い、高さを一致させる。
export const GANTT_HEADER_H = 64;
export const DEP_TYPES = ["FS", "SS", "FF", "SF"];
// WBS表の列幅（ヘッダー行・データ行・末尾の新規タスク行の3箇所で共通して使う単一の定義元）。
// ユーザーがヘッダーの境界をドラッグして調整できるよう、実際の表示幅は App 側の state（colWidths）
// として保持し、この定数は初期値・リセット時の既定値としてのみ使う。
export const DEFAULT_WBS_COLS = { grip: 20, wbs: 56, name: 190, start: 108, duration: 48, finish: 82, assignee: 64, sprint: 96, progress: 56, deps: 98, actions: 28 };
// 各列がここまでは縮められる、という下限（アイコンや最小限のラベルが表示できる幅）。
export const MIN_WBS_COL_WIDTHS = { grip: 16, wbs: 32, name: 70, start: 56, duration: 40, finish: 56, assignee: 40, sprint: 50, progress: 40, deps: 50, actions: 24 };
