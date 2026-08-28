import React from "react";

/* =========================================================================================
   7. 共通 UI パーツ
   ========================================================================================= */
export function IconBtn({ icon: Icon, label, onClick, active, danger, disabled, small, iconOnly }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={
        "inline-flex items-center gap-1.5 rounded-md border transition-colors " +
        (small ? (iconOnly ? "p-1 text-xs " : "px-2 py-1 text-xs ") : "px-3 py-1.5 text-sm ") +
        (disabled ? "opacity-40 cursor-not-allowed border-slate-200 text-slate-400 " :
          active ? "bg-indigo-600 border-indigo-600 text-white " :
          danger ? "border-red-200 text-red-600 hover:bg-red-50 " :
          "border-slate-200 text-slate-700 hover:bg-slate-100 bg-white")
      }
    >
      {Icon && <Icon size={small ? 13 : 15} />}
      {label && !iconOnly && <span>{label}</span>}
    </button>
  );
}
