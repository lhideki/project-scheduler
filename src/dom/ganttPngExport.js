/**
 * ガントチャートの「現在見えている範囲」と最小限のタスク一覧をPNG画像として
 * クリップボードにコピーする。
 *
 * 日付ヘッダー（スプリント帯・日付軸）はTailwind CSSクラスを使ったHTML要素で描画しているが、
 * ChromeはforeignObjectを含むSVGをcanvasへdrawImageすると生成物を「tainted」として扱い、
 * toBlob/toDataURLを拒否する（同一オリジンでも発生する既知の制限）。そのためPNG化にあたっては
 * foreignObjectを一切使わず、ヘッダーもSVGネイティブ要素だけの断片として呼び出し側
 * （WBSGanttView）で組み立ててもらい、実DOMのバー/背景SVG（clone可能な純SVG）と合成する。
 */

import { layoutPngTaskList } from "../lib/ganttPngLayout.js";

const TASK_FONT = "system-ui, sans-serif";

export function escapeXmlText(str) {
  return String(str ?? "").replace(/[&<>]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]));
}

function cloneSvgAt(svgEl, x, y) {
  const clone = svgEl.cloneNode(true);
  clone.setAttribute("x", x);
  clone.setAttribute("y", y);
  return new XMLSerializer().serializeToString(clone);
}

function taskListMarkup(layout, headerHeight) {
  const { width, height, rows } = layout;
  const bodyHeight = Math.max(0, height - headerHeight);
  let body = `<rect width="${width}" height="${bodyHeight}" fill="#FFFFFF"/>`;
  for (const row of rows) {
    const { y, rowHeight, rowStride, nameX } = row;
    const cy = y + rowHeight / 2;
    const iconX = nameX - 10;
    const taskId = escapeXmlText(row.id).replace(/"/g, "&quot;");
    body += `<g data-png-task-id="${taskId}" data-depth="${row.level}" data-row-index="${row.index}">`;
    if (row.hasChildren) {
      body += `<rect x="0" y="${y}" width="${width}" height="${rowHeight}" fill="#F8FAFC"/>`;
      const points = row.collapsed ? `${iconX - 2},${cy - 4} ${iconX + 2},${cy} ${iconX - 2},${cy + 4}` : `${iconX - 4},${cy - 2} ${iconX},${cy + 2} ${iconX + 4},${cy - 2}`;
      body += `<polyline points="${points}" fill="none" stroke="#64748B" stroke-width="1.5"/>`;
    } else if (row.milestone) {
      body += `<path d="M${iconX},${cy - 4} l4,4 -4,4 -4,-4Z" fill="#F59E0B"/>`;
    }
    const lineMarkup = row.lines.map((line, index) => `<tspan x="${nameX}" y="${cy + (index - (row.lines.length - 1) / 2) * 13}">${escapeXmlText(line)}</tspan>`).join("");
    body += `<text data-png-task-name="true" x="${nameX}" y="${cy}" dominant-baseline="middle" font-size="12" font-weight="${row.hasChildren ? 600 : 400}" fill="#334155">${lineMarkup}</text>`;
    if (rowStride > rowHeight) {
      body += `<rect x="0" y="${y + rowHeight}" width="${width}" height="${rowStride - rowHeight}" fill="#F8FAFC"/>`;
      if (row.baselineLabel !== undefined) body += `<text x="${nameX}" y="${y + rowHeight + (rowStride - rowHeight) / 2}" dominant-baseline="middle" font-size="10" fill="#94A3B8">${escapeXmlText(row.baselineLabel)}</text>`;
    }
    body += `<line x1="0" x2="${width}" y1="${y + rowStride}" y2="${y + rowStride}" stroke="#F1F5F9"/>`;
    body += `</g>`;
  }
  // Nested SVGs clip each pane independently. Long text and chart bars cannot
  // bleed into each other, including partially scrolled first/last rows.
  return `<svg data-png-task-list="true" width="${width}" height="${height}" overflow="hidden" font-family="${TASK_FONT}">` +
    `<svg y="${headerHeight}" width="${width}" height="${bodyHeight}" overflow="hidden">${body}</svg>` +
    `<rect width="${width}" height="${headerHeight}" fill="#F8FAFC"/>` +
    `<text data-png-task-header="true" x="12" y="${headerHeight / 2}" dominant-baseline="middle" font-size="12" font-weight="600" fill="#475569">${escapeXmlText(layout.header)}</text>` +
    `<line x1="0" x2="${width}" y1="${headerHeight}" y2="${headerHeight}" stroke="#E2E8F0"/>` +
    `<line x1="${width - 0.5}" x2="${width - 0.5}" y1="0" y2="${height}" stroke="#CBD5E1"/></svg>`;
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * PNG書き出しの失敗を表すエラー。表示用の文言は持たず、code（gantt-dom-missing / svg-image-failed /
 * png-encode-failed）で種別を示す（呼び出し側がメッセージカタログの pngErrors.<code> で表示中の言語にする）。
 */
function pngExportError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

/**
 * @param {Object} params
 * @param {HTMLElement} params.container - ガント右ペインのスクロールコンテナ（rightRef.current）
 * @param {SVGSVGElement} params.bgSvg - 背景レイヤーのsvg要素
 * @param {SVGSVGElement} params.barsSvg - バーレイヤーのsvg要素
 * @param {string} params.headerMarkup - ヘッダー部分のSVG断片（呼び出し側でネイティブSVG要素として組み立てたもの）
 * @param {number} params.chartWidth
 * @param {number} params.headerHeight
 * @param {Array} params.rows - Same visible task order/collapse state as the Gantt.
 * @param {number} params.rowStride - Includes the baseline lane in comparison mode.
 * @param {number} params.rowHeight - Current task lane height.
 * @param {string} params.taskHeader - Localized task-name column heading.
 * @param {string} [params.filename] - Suggested filename when clipboard copying is unavailable.
 * @returns {Promise<"copied"|"downloaded">}
 */
export async function copyVisibleGanttAsPng({ container, bgSvg, barsSvg, headerMarkup, chartWidth, headerHeight, rows, rowStride, rowHeight, taskHeader, filename }) {
  if (!container || !bgSvg || !barsSvg) throw pngExportError("gantt-dom-missing");

  const scrollLeft = container.scrollLeft;
  const scrollTop = container.scrollTop;
  const chartViewW = container.clientWidth;
  const measureContext = document.createElement("canvas").getContext("2d");
  const layout = layoutPngTaskList({
    rows, rowStride, rowHeight, scrollTop, viewHeight: container.clientHeight, headerHeight, header: taskHeader,
    measure: (text, bold, size) => {
      measureContext.font = `${bold ? 600 : 400} ${size}px ${TASK_FONT}`;
      return measureContext.measureText(text).width;
    },
  });
  const viewW = chartViewW + layout.width;
  const viewH = layout.height;

  const bodyX = -scrollLeft;
  const bodyY = headerHeight - scrollTop;
  const bgMarkup = cloneSvgAt(bgSvg, bodyX, bodyY);
  const barsMarkup = cloneSvgAt(barsSvg, bodyX, bodyY);

  // 描画順：背景 → バー → ヘッダー（常に手前）。position:sticky なヘッダーが本体の手前に
  // 重なって見える実際の表示と同じ見た目になる。
  const svgMarkup =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${viewW}" height="${viewH}">` +
    `<svg data-png-chart="true" x="${layout.width}" width="${chartViewW}" height="${viewH}" overflow="hidden">` +
    bgMarkup + barsMarkup +
    `<svg x="${-scrollLeft}" y="0" width="${chartWidth}" height="${headerHeight}">${headerMarkup}</svg>` +
    `</svg>` + taskListMarkup(layout, headerHeight) +
    `</svg>`;

  const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(pngExportError("svg-image-failed"));
      image.src = svgUrl;
    });

    const scale = window.devicePixelRatio || 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewW * scale));
    canvas.height = Math.max(1, Math.round(viewH * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, viewW, viewH);

    const pngBlob = await new Promise((resolve, reject) => {
      canvas.toBlob(b => (b ? resolve(b) : reject(pngExportError("png-encode-failed"))), "image/png");
    });

    if (window.isSecureContext && navigator.clipboard?.write && typeof window.ClipboardItem === "function") {
      try {
        await navigator.clipboard.write([new window.ClipboardItem({ "image/png": pngBlob })]);
        return "copied";
      } catch {
        // 権限拒否等、APIが存在していてもwrite()自体が失敗するケースはダウンロードへフォールスルーする。
      }
    }

    downloadBlob(filename ?? `gantt_${new Date().toISOString().slice(0, 10)}.png`, pngBlob);
    return "downloaded";
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
