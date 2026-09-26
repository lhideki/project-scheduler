/**
 * ガントチャート（WBSGanttView の右ペイン）の「現在見えている範囲」をPNG画像として
 * クリップボードにコピーする。
 *
 * 日付ヘッダー（スプリント帯・日付軸）はTailwind CSSクラスを使ったHTML要素で描画しているが、
 * ChromeはforeignObjectを含むSVGをcanvasへdrawImageすると生成物を「tainted」として扱い、
 * toBlob/toDataURLを拒否する（同一オリジンでも発生する既知の制限）。そのためPNG化にあたっては
 * foreignObjectを一切使わず、ヘッダーもSVGネイティブ要素だけの断片として呼び出し側
 * （WBSGanttView）で組み立ててもらい、実DOMのバー/背景SVG（clone可能な純SVG）と合成する。
 */

export function escapeXmlText(str) {
  return String(str ?? "").replace(/[&<>]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]));
}

function cloneSvgAt(svgEl, x, y) {
  const clone = svgEl.cloneNode(true);
  clone.setAttribute("x", x);
  clone.setAttribute("y", y);
  return new XMLSerializer().serializeToString(clone);
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
 * @returns {Promise<"copied"|"downloaded">}
 */
export async function copyVisibleGanttAsPng({ container, bgSvg, barsSvg, headerMarkup, chartWidth, headerHeight }) {
  if (!container || !bgSvg || !barsSvg) throw pngExportError("gantt-dom-missing");

  const scrollLeft = container.scrollLeft;
  const scrollTop = container.scrollTop;
  const viewW = container.clientWidth;
  const viewH = container.clientHeight;

  const bodyX = -scrollLeft;
  const bodyY = headerHeight - scrollTop;
  const bgMarkup = cloneSvgAt(bgSvg, bodyX, bodyY);
  const barsMarkup = cloneSvgAt(barsSvg, bodyX, bodyY);

  // 描画順：背景 → バー → ヘッダー（常に手前）。position:sticky なヘッダーが本体の手前に
  // 重なって見える実際の表示と同じ見た目になる。
  const svgMarkup =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${viewW}" height="${viewH}">` +
    bgMarkup + barsMarkup +
    `<svg x="${-scrollLeft}" y="0" width="${chartWidth}" height="${headerHeight}">${headerMarkup}</svg>` +
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

    downloadBlob(`gantt_${new Date().toISOString().slice(0, 10)}.png`, pngBlob);
    return "downloaded";
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
