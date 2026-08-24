import React, { useState, useEffect } from "react";
import { parseDepString, formatDeps } from "../lib/deps.js";

export function DepInput({ deps, idToNo, noToId, onChange, inputRef, onKeyDown }) {
  const [text, setText] = useState(() => formatDeps(deps, idToNo));
  useEffect(() => { setText(formatDeps(deps, idToNo)); }, [deps, idToNo]);
  return (
    <input
      ref={inputRef}
      value={text}
      placeholder="例: 1.2FS+1"
      onChange={e => setText(e.target.value)}
      onBlur={() => { const parsed = parseDepString(text, noToId); onChange(parsed); setText(formatDeps(parsed, idToNo)); }}
      onKeyDown={onKeyDown}
      className="bg-transparent outline-none w-full font-mono text-[11px] border-b border-transparent focus:border-indigo-300"
    />
  );
}
