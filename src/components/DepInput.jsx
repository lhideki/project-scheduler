import React, { useState, useEffect, useId, useRef } from "react";
import { parseDepInput, formatDeps } from "../lib/deps.js";
import { useI18n } from "./I18nProvider.jsx";

export function DepInput({ deps, idToNo, noToId, onChange, inputRef, inputProps, onKeyDown }) {
  const { t } = useI18n();
  const committedText = formatDeps(deps, idToNo);
  const [text, setText] = useState(committedText);
  const [errors, setErrors] = useState([]);
  const dirty = useRef(false);
  const depsKey = JSON.stringify(deps || []);
  const previousDepsKey = useRef(depsKey);
  const mappingKey = JSON.stringify(noToId);
  const previousMappingKey = useRef(mappingKey);
  const errorId = useId();
  // Unrelated edits rebuild the map object but keep its bindings. Only keep a draft
  // while those bindings are unchanged, so old WBS numbers cannot target new tasks.
  useEffect(() => {
    if (previousDepsKey.current !== depsKey || previousMappingKey.current !== mappingKey) {
      dirty.current = false;
      setErrors([]);
      previousDepsKey.current = depsKey;
      previousMappingKey.current = mappingKey;
    }
    if (!dirty.current) setText(committedText);
  }, [committedText, depsKey, mappingKey]);
  function commit() {
    if (!dirty.current) return;
    const parsed = parseDepInput(text, noToId);
    setErrors(parsed.errors);
    if (parsed.errors.length) return;
    dirty.current = false;
    onChange(parsed.deps);
    setText(formatDeps(parsed.deps, idToNo));
  }
  return (
    <div className="relative">
      <input
        ref={inputRef}
        {...inputProps}
        value={text}
        placeholder={t("wbs.depsPlaceholder")}
        aria-invalid={errors.length ? true : undefined}
        aria-describedby={errors.length ? errorId : undefined}
        onChange={e => { dirty.current = true; setText(e.target.value); }}
        onBlur={commit}
        onPaste={e => {
          // Plain dependency text belongs to this draft, including invalid/mixed tokens.
          // Keep the existing row/TSV paste behavior for structured row payloads.
          const value = e.clipboardData.getData("text/plain");
          let row = false;
          try { row = JSON.parse(e.clipboardData.getData("application/x-project-scheduler-wbs"))?.kind === "row"; } catch { /* plain text */ }
          if (!value.includes("\t") && !row) e.stopPropagation();
          else {
            // An explicit structured row paste supersedes the draft, even if deps stay unchanged.
            dirty.current = false;
            setErrors([]);
            setText(committedText);
          }
        }}
        onKeyDown={onKeyDown}
        className={"bg-transparent outline-none w-full rounded font-mono text-[11px] border-b focus:bg-indigo-100 focus:ring-1 focus:ring-indigo-300 " +
          (errors.length ? "border-red-500 bg-red-50 text-red-800" : "border-transparent")}
      />
      {errors.length > 0 && (
        <div id={errorId} role="alert" className="absolute right-0 top-full z-30 mt-1 w-64 max-h-40 overflow-y-auto rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-800 shadow-md">
          {errors.map(error => <div key={error.index}>{error.code === "unknown-wbs"
            ? t("dependencyInput.unknownWbs", { no: error.no })
            : t("dependencyInput.invalidFormat", { token: error.token || t("dependencyInput.emptyToken") })}</div>)}
          <p className="mt-1 text-red-700">{t("dependencyInput.notApplied")}</p>
        </div>
      )}
    </div>
  );
}
