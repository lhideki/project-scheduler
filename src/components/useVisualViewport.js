import { useLayoutEffect, useState } from "react";

function bounds() {
  if (typeof window === "undefined" || !window.visualViewport) return null;
  const viewport = window.visualViewport;
  return { left: viewport.offsetLeft, top: viewport.offsetTop, width: viewport.width, height: viewport.height };
}

/** Keep dialogs in the visible viewport when a wide WBS or keyboard changes it. */
export function useVisualViewport() {
  const [viewport, setViewport] = useState(bounds);
  useLayoutEffect(() => {
    const visible = window.visualViewport;
    if (!visible) return undefined;
    const update = () => setViewport(bounds());
    update();
    visible.addEventListener("resize", update);
    visible.addEventListener("scroll", update);
    return () => {
      visible.removeEventListener("resize", update);
      visible.removeEventListener("scroll", update);
    };
  }, []);
  return viewport ? { inset: "auto", ...viewport } : undefined;
}
