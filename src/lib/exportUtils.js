import { buildFlatList } from "./taskTree.js";

/** JSON を生成しブラウザのダウンロードとしてトリガーする（プロジェクトのエクスポート用） */
export function downloadJSON(filename, dataObj) {
  const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: "application/json" });
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
 * テキストをクリップボードにコピーする。file:// で開いた場合など navigator.clipboard が
 * 使えない（非セキュアコンテキスト）ケースに備え、隠しtextarea + execCommand へフォールバックする。
 */
export async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(ta);
  if (!ok) throw new Error("execCommand('copy') に失敗しました");
}

/** Mermaid のタスク名として問題になる記号（コロン・カンマ・改行）を除去する */
export function escapeMermaidText(str) {
  return String(str ?? "").replace(/[:,\n]/g, " ").replace(/\s+/g, " ").trim() || "（無題）";
}

/** Mermaid の task id として使える文字列に変換する（先頭は英字に揃える） */
export function toMermaidId(str) {
  const s = String(str ?? "").replace(/[^a-zA-Z0-9_]/g, "_");
  return /^[a-zA-Z]/.test(s) ? s : `t${s}`;
}

/**
 * 現在の WBS ツリーとスケジュール計算結果（CPM・固定マイルストーン・スプリント floor・
 * リソース平準化をすべて織り込んだ確定スケジュール）から Mermaid の gantt 記法テキストを生成する。
 * Mermaid 自身の依存解決（after）は使わず、schedStart/schedFinish をそのまま開始日・終了日として
 * 書き出すことで、このツールの計算結果を厳密に反映する。グループはセクション（section）として出力する。
 */
export function generateMermaidGantt(tasks, schedule) {
  const flatAll = buildFlatList(tasks, new Set());
  const lines = ["gantt", "    title プロジェクトスケジュール", "    dateFormat YYYY-MM-DD", "    excludes weekends"];
  const usedIds = new Set();
  flatAll.forEach(t => {
    if (t.hasChildren) {
      lines.push(`    section ${escapeMermaidText(t.name)}`);
      return;
    }
    const s = schedule.get(t.id);
    if (!s || !s.schedStart || !s.schedFinish) return;
    let id = toMermaidId(`t${t.wbsNo || t.id}`);
    if (usedIds.has(id)) {
      let i = 2;
      while (usedIds.has(`${id}_${i}`)) i++;
      id = `${id}_${i}`;
    }
    usedIds.add(id);
    const tags = [];
    if (t.milestone) tags.push("milestone");
    if (s.critical) tags.push("crit");
    if ((t.progress || 0) >= 100) tags.push("done");
    else if ((t.progress || 0) > 0) tags.push("active");
    const tagStr = tags.length ? `${tags.join(", ")}, ` : "";
    const name = escapeMermaidText(t.name);
    const endField = t.milestone ? "0d" : s.schedFinish;
    lines.push(`    ${name} :${tagStr}${id}, ${s.schedStart}, ${endField}`);
  });
  return lines.join("\n");
}
