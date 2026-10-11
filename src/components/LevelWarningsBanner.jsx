import React from "react";
import { AlertTriangle } from "lucide-react";
import { formatLevelWarning } from "../lib/i18n.js";
import { useI18n } from "./I18nProvider.jsx";

/** Keep the complete warning text accessible without letting it displace the WBS. */
export function LevelWarningsBanner({ warnings }) {
  const { t } = useI18n();
  if (!warnings.length) return null;
  return (
    <div data-testid="level-warning-banner" className="bg-amber-50 border-b border-amber-200 text-amber-800 text-xs px-4 py-1.5 flex items-center gap-2 shrink-0">
      <AlertTriangle size={13} className="shrink-0" />
      <span role="region" aria-label={t("levelWarnings.regionLabel")} tabIndex={0} className="max-h-28 overflow-y-auto min-w-0">{warnings.map(w => formatLevelWarning(t, w)).join(" / ")}</span>
    </div>
  );
}
