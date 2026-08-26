import React, { useState, useRef, useEffect } from "react";

/** WBS表のスプリント欄用のコンパクトな複数選択ドロップダウン（ボタン＋チェックボックス一覧）。 */
export function SprintMultiSelect({ sprintIds, sprints, onChange, inputRef, inputProps, onKeyDown }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDocPointerDown);
    return () => document.removeEventListener("mousedown", onDocPointerDown);
  }, [open]);
  const ids = sprintIds || [];
  const selected = sprints.filter(sp => ids.includes(sp.id));
  const label = selected.length === 0 ? "—" : selected.map(sp => sp.name).join(", ");
  function toggle(id) {
    onChange(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  }
  return (
    <div ref={wrapRef} className="relative">
      <button type="button" ref={inputRef} {...inputProps}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(o => !o); } onKeyDown && onKeyDown(e); }}
        onClick={() => setOpen(o => !o)}
        title={selected.length ? selected.map(sp => sp.name).join("\n") : "紐付けるスプリント"}
        className="w-full text-left bg-transparent outline-none text-[11px] truncate hover:bg-slate-100 rounded px-0.5 text-slate-700 focus:bg-indigo-100 focus:ring-1 focus:ring-indigo-300">
        {label}
      </button>
      {open && (
        <div className="absolute z-30 top-full left-0 mt-1 w-44 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-lg py-1"
          onClick={e => e.stopPropagation()}>
          {sprints.length === 0 && <div className="px-2.5 py-1.5 text-[11px] text-slate-400">スプリントがありません</div>}
          {sprints.map(sp => (
            <label key={sp.id} className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] hover:bg-slate-50 cursor-pointer">
              <input type="checkbox" checked={ids.includes(sp.id)} onChange={() => toggle(sp.id)} />
              <span className="truncate">{sp.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
