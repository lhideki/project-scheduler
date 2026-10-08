import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = mkdtempSync(join(tmpdir(), "scheduler-css-build-"));
afterAll(() => rmSync(temporary, { recursive: true, force: true }));
const read = path => readFileSync(join(root, path), "utf8");
function jsxSources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? jsxSources(path) : path.endsWith(".jsx") ? [readFileSync(path, "utf8")] : [];
  }).join("\n");
}

describe("Tailwind v4 standalone CSS build", () => {
  it("installs the separate CLI at the same version as the framework", () => {
    const lock = JSON.parse(read("package-lock.json"));
    expect(lock.packages["node_modules/tailwindcss"].version).toMatch(/^4\./);
    expect(lock.packages["node_modules/@tailwindcss/cli"].version).toBe(lock.packages["node_modules/tailwindcss"].version);
  });
  it("scans only JSX, preserving the app palette and migrated utilities", () => {
    const css = read("src/input.css");
    expect(css).toContain('@import "tailwindcss" source(none)');
    expect(css).toContain('@source "./**/*.jsx"');
    expect(css).not.toMatch(/@tailwind\s/);
    const sources = jsxSources(join(root, "src"));
    expect(sources).not.toMatch(/\b(?:flex-shrink-0|outline-none|shadow-sm)\b/);
    const theme = read("src/theme.css");
    const colors = [...sources.matchAll(/\b(slate|indigo|red|amber|emerald|orange)-(50|[1-9]00|950)\b/g)].map(match => match[0]);
    for (const color of new Set(colors)) expect(theme).toContain(`--color-${color}: #`);
    for (const value of ["--color-indigo-600: #4f46e5", "--color-slate-200: #e2e8f0", "--color-red-500: #ef4444", "--color-gray-400: #9ca3af"]) expect(theme).toContain(value);
    expect(theme).toContain("--font-sans: ui-sans-serif, system-ui, sans-serif");
  });
  it("builds identical self-contained CSS from different working directories", () => {
    const outputs = [root, temporary].map((cwd, index) => {
      const output = join(temporary, `output-${index}.css`);
      const result = spawnSync(process.execPath, [
        join(root, "node_modules/@tailwindcss/cli/dist/index.mjs"),
        "-i", join(root, "src/input.css"), "-o", output, "--minify",
      ], { cwd, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
      return readFileSync(output, "utf8");
    });
    expect(outputs[0]).toBe(outputs[1]);
    expect(outputs[0]).not.toMatch(/@import\s/);
    expect(read("project_scheduler.html")).toContain(`<style>${outputs[0]}</style>`);
  });
});
