import React from "react";

export function Tab({ icon: Icon, label, active, onClick, count }) {
  return (
    <button
      onClick={onClick}
      className={
        "flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors " +
        (active ? "border-indigo-600 text-indigo-700 font-medium" : "border-transparent text-slate-500 hover:text-slate-800")
      }
    >
      <Icon size={15} />
      {label}
      {count != null && <span className="text-[10px] rounded-full bg-slate-200 text-slate-600 px-1.5 py-0.5 font-mono">{count}</span>}
    </button>
  );
}
