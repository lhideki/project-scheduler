import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IntlProvider } from "use-intl";
import { describe, it, expect } from "vitest";
import { SchedulingResult } from "./SchedulingResult.jsx";
import { MESSAGES, FORMATS, TIME_ZONE } from "../lib/i18n.js";

function render(result, locale = "en", extra = {}) {
  return renderToStaticMarkup(
    <IntlProvider locale={locale} messages={MESSAGES[locale]} formats={FORMATS[locale]} timeZone={TIME_ZONE}>
      <SchedulingResult result={{ changedCount: 0, converged: true, levelingOn: false, ...result }}
        dependencyIssues={[]} sprintConflicts={[]} levelWarnings={[]} tasks={[]} wbsNoById={new Map()}
        onRevealTask={() => {}} onDismiss={() => {}} {...extra} />
    </IntlProvider>
  );
}
describe("SchedulingResult", () => {
  it("shows zero changes and zero remaining issues", () => {
    const html = render({});
    expect(html).toContain("Tasks with changed start dates: 0");
    expect(html).toContain("Unresolved issues: 0");
    expect(html).toContain('role="status"');
    expect(html).not.toContain("<details");
  });
  it("does not present non-convergence or execution failure as success", () => {
    expect(render({ converged: false })).toContain("Recalculation did not converge");
    const failed = render({ error: true });
    expect(failed).toContain("Recalculation failed. The plan was not changed.");
    expect(failed).toContain('role="alert"');
    expect(failed).not.toContain("Tasks with changed start dates");
    expect(failed).not.toContain("lucide-check");
  });
  it("shows one canonical cycle with all targets and reasons in both languages", () => {
    const props = {
      tasks: [{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }], wbsNoById: new Map([["a", "1"], ["b", "2"]]),
      dependencyIssues: [{ code: "dependency-cycle", severity: "error", ids: ["a", "b"], params: { route: [{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }, { id: "a", name: "Alpha" }], memberEdges: [] } }],
    };
    for (const locale of ["en", "ja"]) {
      const html = render({ changedCount: 2, levelingOn: true }, locale, props);
      expect(html).toContain("1 Alpha");
      expect(html).toContain("2 Beta");
      expect(html.match(/<li>/g)).toHaveLength(1);
      expect(html).toContain(locale === "en" ? "Unresolved issues: 1" : "未解決: 1件");
      expect(html).not.toContain("lucide-check");
    }
  });
});
