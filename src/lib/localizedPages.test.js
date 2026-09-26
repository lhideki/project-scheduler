import { describe, it, expect } from "vitest";
import {
  PAGE_LOCALE_META_NAME, DEFAULT_PAGES_BASE_URL, normalizePagesBaseUrl, localizedPageUrl, localizedPageAlternates,
  buildLocalizedPageHtml, switchedPageUrl,
} from "./localizedPages.js";

const BASE = "https://lhideki.github.io/project-scheduler/";
const HTML = `<!doctype html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Project Scheduler</title>
<style>body{}</style>
</head>
<body>
<div id="root"></div>
<script>var s = "<html lang=\\"xx\\"><meta charset=\\"UTF-8\\">";</script>
</body>
</html>`;

describe("normalizePagesBaseUrl / localizedPageUrl", () => {
  it("末尾の / をそろえ、クエリとハッシュを落とす", () => {
    expect(normalizePagesBaseUrl("https://lhideki.github.io/project-scheduler")).toBe(BASE);
    expect(normalizePagesBaseUrl("https://lhideki.github.io/project-scheduler/?x=1#y")).toBe(BASE);
    expect(normalizePagesBaseUrl(DEFAULT_PAGES_BASE_URL)).toBe(BASE);
  });

  it("http(s) 以外・不正な URL は例外にする", () => {
    expect(() => normalizePagesBaseUrl("file:///tmp/")).toThrow();
    expect(() => normalizePagesBaseUrl("project-scheduler/")).toThrow();
  });

  it("言語のページは公開URLの配下に置く", () => {
    expect(localizedPageUrl(BASE, null)).toBe(BASE);
    expect(localizedPageUrl(BASE, "ja")).toBe(`${BASE}ja/`);
    expect(localizedPageUrl("https://lhideki.github.io/project-scheduler", "en")).toBe(`${BASE}en/`);
    expect(() => localizedPageUrl(BASE, "fr")).toThrow();
  });

  it("hreflang の相互リンクは Default を x-default にする", () => {
    expect(localizedPageAlternates(BASE)).toEqual([
      { hreflang: "x-default", href: BASE },
      { hreflang: "ja", href: `${BASE}ja/` },
      { hreflang: "en", href: `${BASE}en/` },
    ]);
  });
});

describe("buildLocalizedPageHtml", () => {
  it("Default のページは言語を固定せず、hreflang のリンクだけを <meta charset> の直後に入れる", () => {
    const out = buildLocalizedPageHtml(HTML, { baseUrl: BASE });
    expect(out).not.toContain(PAGE_LOCALE_META_NAME);
    expect(out).toContain(`<html lang="ja">`);
    expect(out).toContain(`<meta charset="UTF-8">
<link rel="alternate" hreflang="x-default" href="${BASE}">
<link rel="alternate" hreflang="ja" href="${BASE}ja/">
<link rel="alternate" hreflang="en" href="${BASE}en/">
<meta name="viewport"`);
    // 差し込み以外は変えない
    expect(out.replace(/\n<link rel="alternate"[^>]*>/g, "")).toBe(HTML);
  });

  it("言語のページは <meta> で言語を固定し、<html lang> をその言語にする（本文中の同じ文字列は変えない）", () => {
    const out = buildLocalizedPageHtml(HTML, { baseUrl: BASE, locale: "en" });
    expect(out.startsWith(`<!doctype html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="${PAGE_LOCALE_META_NAME}" content="en">\n`)).toBe(true);
    expect(out.match(new RegExp(PAGE_LOCALE_META_NAME, "g"))).toHaveLength(1);
    expect(out.match(/<link rel="alternate"/g)).toHaveLength(3);
    expect(out).toContain(`var s = "<html lang=\\"xx\\"><meta charset=\\"UTF-8\\">";`);
  });

  it("<html> に lang が無ければ追加する", () => {
    const out = buildLocalizedPageHtml(HTML.replace(`<html lang="ja">`, "<html>"), { baseUrl: BASE, locale: "ja" });
    expect(out).toContain(`<html lang="ja">`);
  });

  it("対応していない言語・<meta charset> の無い HTML は例外にする", () => {
    expect(() => buildLocalizedPageHtml(HTML, { baseUrl: BASE, locale: "fr" })).toThrow();
    expect(() => buildLocalizedPageHtml("<html><head></head></html>", { baseUrl: BASE })).toThrow();
  });
});

describe("switchedPageUrl", () => {
  it("切り替え先のページに、現在のクエリとハッシュを引き継ぐ", () => {
    expect(switchedPageUrl(`${BASE}ja/?schedule=a%2Fb.json#x`, `${BASE}en/`)).toBe(`${BASE}en/?schedule=a%2Fb.json#x`);
    expect(switchedPageUrl(`${BASE}en/`, `${BASE}ja/`)).toBe(`${BASE}ja/`);
  });

  it("相対URLは現在のURLを基準に解決する", () => {
    expect(switchedPageUrl("http://localhost:8080/project-scheduler/ja/", "../en/")).toBe("http://localhost:8080/project-scheduler/en/");
  });

  it("別オリジン・ローカルファイル・同じURL・リンク無しなら null（URL を変えない）", () => {
    expect(switchedPageUrl("http://localhost:8080/ja/", `${BASE}en/`)).toBeNull();
    expect(switchedPageUrl("file:///tmp/ja/index.html", `${BASE}en/`)).toBeNull();
    expect(switchedPageUrl(`${BASE}en/`, `${BASE}en/`)).toBeNull();
    expect(switchedPageUrl(`${BASE}en/`, null)).toBeNull();
    expect(switchedPageUrl("not a url", `${BASE}en/`)).toBeNull();
  });
});
