import React, { useEffect, useRef, useState } from "react";
import { Download, ChevronDown } from "lucide-react";

/* =========================================================================================
   書き出しメニュー（JSON書き出し・共有用HTML書き出し・Mermaidコピーをまとめたドロップダウン）
   ========================================================================================= */
export function ExportMenu({ items }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 transition-colors"
      >
        <Download size={13} />
        <span>書き出し</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 min-w-[220px] rounded-md border border-slate-200 bg-white shadow-lg py-1 z-50"
        >
          {items.map(item => (
            <button
              key={item.label}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 text-left"
            >
              {item.icon && <item.icon size={13} className="text-slate-500" />}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
