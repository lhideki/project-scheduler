import React, { useState, useEffect } from "react";
import { parseDepString, formatDeps } from "../lib/deps.js";

export function DepInput({ deps, idToNo, noToId, onChange, inputRef, inputProps, onKeyDown }) {
  const [text, setText] = useState(() => formatDeps(deps, idToNo));
  useEffect(() => { setText(formatDeps(deps, idToNo)); }, [deps, idToNo]);
  return (
    <input
      ref={inputRef}
      {...inputProps}
      value={text}
      placeholder="例: 1.2FS+1"
      onChange={e => setText(e.target.value)}
      onBlur={() => { const parsed = parseDepString(text, noToId); onChange(parsed); setText(formatDeps(parsed, idToNo)); }}
      onKeyDown={onKeyDown}
      className="bg-transparent outline-none w-full rounded font-mono text-[11px] border-b border-transparent focus:bg-indigo-100 focus:ring-1 focus:ring-indigo-300"
    />
  );
}
